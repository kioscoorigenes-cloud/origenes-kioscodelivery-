// Extraido de server.ts: los handlers se agruparon por dominio.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getAdminFirestore } from "../services/serverAuth";

const freeShippingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { available: false }
});

export function storeRoutes(): Router {
  const router = Router();

  // Envio gratis para el PRIMER pedido del dia de TODA la tienda.
  // Se resuelve en el servidor con el Admin SDK: el cliente no puede leer
  // /orders (las reglas lo prohiben) y hacerlo por dispositivo se reseteaba
  // borrando datos o cambiando de telefono.
  // Publica: la consulta la necesita cualquier comprador. Limitada por IP
  // porque cada llamada es una lectura de Firestore.
  router.get("/free-shipping-status", freeShippingLimiter, async (_req, res) => {
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) return res.json({ available: false });

      // Día calendario de Argentina usando IANA timezone (DATA-01: no hardcodear UTC-3).
      const arFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const todayAR = arFormatter.format(new Date()); // "YYYY-MM-DD"
      const startIso = new Date(todayAR + "T00:00:00-03:00").toISOString();

      const snap = await adminDb
        .collection("orders")
        .where("timestamp", ">=", startIso)
        .limit(1)
        .get();

      return res.json({ available: snap.empty });
    } catch (e: any) {
      console.warn("[FreeShipping] no se pudo consultar:", e.message);
      // ERR-03: distinguir "no hay envío gratis" de "error al consultar"
      return res.json({ available: false, error: true });
    }
  });

  // Endpoint temporal protegido para exportar productos de Firestore.
  // Uso: GET /api/store/export-products?limit=100&startAfter=docId  (header: x-cron-token)
  // PERF-03: paginación para no cargar todo en memoria de una vez.
  router.get("/export-products", async (req, res) => {
    const token = req.headers["x-cron-token"];
    const expected = process.env.CRON_SECRET_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ error: "Token inválido" });
    }
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) return res.status(500).json({ error: "Firebase Admin no configurado" });

      const pageSize = Math.min(Number(req.query.limit) || 200, 500);
      let query = adminDb.collection("products").orderBy("__name__").limit(pageSize);
      if (req.query.startAfter && typeof req.query.startAfter === 'string') {
        const startDoc = await adminDb.collection("products").doc(req.query.startAfter).get();
        if (startDoc.exists) query = query.startAfter(startDoc);
      }

      const snap = await query.get();
      const products: any[] = [];
      snap.forEach((doc: any) => {
        const d = doc.data();
        products.push({
          id: doc.id,
          name: d.name || "",
          barcode: d.barcode || "",
          price: d.price || 0,
          category: d.category || "",
          stockQty: d.stockQty ?? null,
          imageUrl: d.imageUrl || ""
        });
      });
      const lastId = products.length > 0 ? products[products.length - 1].id : null;
      return res.json({ total: products.length, products, nextStartAfter: lastId, hasMore: products.length === pageSize });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // PATCH masivo: asignar cat + name_lower a productos que lo tengan vacío.
  // POST /api/store/patch-products  body: { ids: ["2790","2837",...], cat: "perfumeria" }
  router.post("/patch-products", async (req, res) => {
    const token = req.headers["x-cron-token"];
    const expected = process.env.CRON_SECRET_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ error: "Token inválido" });
    }
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) return res.status(500).json({ error: "Firebase Admin no configurado" });

      const { ids, cat } = req.body as { ids: string[]; cat: string };
      if (!ids?.length || !cat) return res.status(400).json({ error: "ids[] y cat requeridos" });

      let updated = 0;
      // Firestore batch max 500
      for (let i = 0; i < ids.length; i += 400) {
        const batch = adminDb.batch();
        const chunk = ids.slice(i, i + 400);
        for (const id of chunk) {
          const ref = adminDb.collection("products").doc(id);
          const snap = await ref.get();
          if (snap.exists) {
            const data = snap.data()!;
            const updates: Record<string, any> = { cat };
            if (!data.name_lower && data.name) {
              updates.name_lower = (data.name as string).trim().toLowerCase();
            }
            batch.update(ref, updates);
            updated++;
          }
        }
        await batch.commit();
      }

      return res.json({ success: true, updated });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // One-time: marcar inStock=false los productos que no tienen stockQty
  // (nunca pasaron por sync) y tenían inStock=true por el viejo default.
  // POST /api/store/fix-instock-defaults  (header: x-cron-token)
  router.post("/fix-instock-defaults", async (req, res) => {
    const token = req.headers["x-cron-token"];
    const expected = process.env.CRON_SECRET_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ error: "Token inválido" });
    }
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) return res.status(500).json({ error: "Firebase Admin no configurado" });

      const snapshot = await adminDb.collection("products").get();
      let fixed = 0;
      let skipped = 0;
      const fixedNames: string[] = [];

      for (let i = 0; i < snapshot.docs.length; i += 400) {
        const batch = adminDb.batch();
        const chunk = snapshot.docs.slice(i, i + 400);
        for (const doc of chunk) {
          const data = doc.data();
          // Solo tocar productos que NO tienen stockQty (nunca sincronizados)
          // y que tienen inStock !== false (true o undefined)
          if (data.stockQty == null && data.inStock !== false) {
            batch.update(doc.ref, { inStock: false });
            fixed++;
            if (fixedNames.length < 20) fixedNames.push(data.name || doc.id);
          } else {
            skipped++;
          }
        }
        await batch.commit();
      }

      return res.json({ success: true, fixed, skipped, sampleFixed: fixedNames });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}
