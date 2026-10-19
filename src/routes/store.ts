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
      console.warn("[FreeShipping] no se pudo consultar:", e.message);
      return res.json({ available: false });
    }
  });

  router.get("/export-products", async (req, res) => {
    const token = req.query.token;
    const expected = process.env.CRON_SECRET_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ error: "Token inválido" });
    }
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) return res.status(500).json({ error: "Firebase Admin no configurado" });

      const snap = await adminDb.collection("products").get();
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
      return res.json({ total: products.length, products });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}
