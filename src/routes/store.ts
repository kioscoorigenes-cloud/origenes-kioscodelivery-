import { logger } from "../services/logger";
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

  router.get("/free-shipping-status", freeShippingLimiter, async (_req, res) => {
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) return res.json({ available: false });

      const ar = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const y = ar.getUTCFullYear();
      const m = String(ar.getUTCMonth() + 1).padStart(2, "0");
      const d = String(ar.getUTCDate()).padStart(2, "0");
      const startIso = new Date(y + "-" + m + "-" + d + "T00:00:00-03:00").toISOString();

      const snap = await adminDb
        .collection("orders")
        .where("timestamp", ">=", startIso)
        .limit(1)
        .get();

      return res.json({ available: snap.empty });
    } catch (e: any) {
      logger.warn({ err: e.message }, "[FreeShipping] no se pudo consultar");
      return res.json({ available: false });
    }
  });

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

  // PATCH masivo: asignar cat + name_lower a productos sin categoria.
  router.post('/patch-products', async (req, res) => {
    const token = req.headers['x-cron-token'];
    const expected = process.env.CRON_SECRET_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ error: 'Token invalido' });
    }
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) return res.status(500).json({ error: 'Firebase Admin no configurado' });
      const { ids, cat } = req.body as { ids: string[]; cat: string };
      if (!ids?.length || !cat) return res.status(400).json({ error: 'ids[] y cat requeridos' });
      let updated = 0;
      for (let i = 0; i < ids.length; i += 400) {
        const batch = adminDb.batch();
        const chunk = ids.slice(i, i + 400);
        for (const id of chunk) {
          const ref = adminDb.collection('products').doc(id);
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

  return router;
}
