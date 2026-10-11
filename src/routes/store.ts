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

      // Dia calendario de Argentina (UTC-3), no del servidor.
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
      // Ante la duda no se regala el envio.
      return res.json({ available: false });
    }
  });

  return router;
}
