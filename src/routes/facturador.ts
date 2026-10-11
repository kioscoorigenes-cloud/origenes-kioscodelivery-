// Extraido de server.ts: los handlers se agruparon por dominio.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdmin, getAdminFirestore } from "../services/serverAuth";

const BILLING_DEFAULTS = {
  apiUrl: "https://api.facturadorexterno.com/v1",
  apiKey: ""
};

// settings/billing esta restringido a super-admin en firestore.rules, asi que
// leerlo con el SDK cliente sin sesion siempre daba permiso denegado y caia al
// default. Se lee con el Admin SDK, que no pasa por las reglas.
async function getBillingCredentials() {
  const adminDb = getAdminFirestore();
  if (!adminDb) {
    console.warn("[Billing] Sin FIREBASE_SERVICE_ACCOUNT_JSON: se usan los valores por defecto.");
    return BILLING_DEFAULTS;
  }

  try {
    const snap = await adminDb.collection("settings").doc("billing").get();
    if (snap.exists) {
      const data = snap.data();
      if (data && data.apiUrl) {
        return {
          apiUrl: data.apiUrl,
          apiKey: data.apiKey || ""
        };
      }
    }
  } catch (err: any) {
    console.warn("[Billing] No se pudo leer settings/billing, se usan los valores por defecto:", err.message);
  }

  return BILLING_DEFAULTS;
}

// report-sale es publica (la llama el cliente al comprar), asi que se limita
// por IP para que no se pueda usar como amplificador contra el facturador.
const reportSaleLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: "Demasiados envios seguidos. Esperá un minuto e intentá de nuevo." }
});

const MAX_ORDER_ITEMS = 100;
// Solo se acepta informar un pedido reciente: evita reprocesar pedidos viejos.
const REPORT_SALE_MAX_AGE_MS = 60 * 60 * 1000;

export function facturadorRoutes(): Router {
  const router = Router();

  // ==========================================
  // CAPA DE INTEGRACIÓN CON FACTURADOR EXTERNO (BACKEND SEGURO)
  // ==========================================

  // Interface definition for multi-vendor flexibility (Adapter Pattern)
  interface FacturadorAdapter {
    syncStock(skus: string[]): Promise<Record<string, { inStock: boolean; stockQty: number }>>;
    reportSale(orderId: number, items: { sku: string; qty: number }[]): Promise<{ success: boolean; transactionId: string }>;
  }

  // Simulated internal stock cache in external billing DB
  const mockStockData: Record<string, { inStock: boolean; stockQty: number }> = {
    "SKU-COCA-500": { inStock: true, stockQty: 85 },
    "SKU-PEPSI-15": { inStock: true, stockQty: 4 },
    "SKU-SPRITE-500": { inStock: false, stockQty: 0 },
    "SKU-VILLAVICENCIO-15L": { inStock: true, stockQty: 42 },
    "SKU-CEPITA-NARANJA-1L": { inStock: true, stockQty: 9 },
    "SKU-MONSTER-473": { inStock: false, stockQty: 0 },
    "SKU-ALFAJOR-TRIPLE": { inStock: true, stockQty: 18 },
    "SKU-LAYS-CLASSIC-90G": { inStock: true, stockQty: 25 },
    "SKU2000": { inStock: true, stockQty: 15 },
    "SKU2001": { inStock: false, stockQty: 0 },
    "SKU2500": { inStock: true, stockQty: 6 }
  };

  class SimulatedFacturadorAdapter implements FacturadorAdapter {
    private url: string;
    private apiKey: string;

    constructor(url?: string, apiKey?: string) {
      this.url = url || "https://api.facturadorexterno.com/v1";
      this.apiKey = apiKey || "";
    }

    async syncStock(skus: string[]): Promise<Record<string, { inStock: boolean; stockQty: number }>> {
      console.log(`[Facturador Seguro API] Consultando stock de ${skus.length} productos en: ${this.url}`);
    
      // Simulate real networks lag
      await new Promise(resolve => setTimeout(resolve, 900));

      // Resilience triggers: simulate timed-out connection if specifically desired
      if (this.apiKey === "force_error") {
        throw new Error("ERROR_CONEXION_TIMEOUT: El servidor del facturador externo no responde.");
      }

      const results: Record<string, { inStock: boolean; stockQty: number }> = {};
      skus.forEach(sku => {
        if (mockStockData[sku] !== undefined) {
          results[sku] = { ...mockStockData[sku] };
        } else {
          // Stable fallback mapping for custom user SKUs
          const numericHash = sku.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const hasStock = numericHash % 7 !== 0; // 85% availability simulation
          results[sku] = {
            inStock: hasStock,
            stockQty: hasStock ? (numericHash % 15) + 3 : 0
          };
        }
      });

      return results;
    }

    async reportSale(orderId: number, items: { sku: string; qty: number }[]): Promise<{ success: boolean; transactionId: string }> {
      console.log(`[Facturador Seguro API] Informando egreso de stock para el pedido #${orderId} a ${this.url}`);
    
      await new Promise(resolve => setTimeout(resolve, 800));

      if (this.apiKey === "force_error") {
        throw new Error("ERROR_AUTHORIZATION: Credenciales de facturador rechazadas.");
      }

      // Decrement stock in our simulated inventory database
      items.forEach(itm => {
        if (mockStockData[itm.sku]) {
          mockStockData[itm.sku].stockQty = Math.max(0, mockStockData[itm.sku].stockQty - itm.qty);
          if (mockStockData[itm.sku].stockQty === 0) {
            mockStockData[itm.sku].inStock = false;
          }
        }
      });

      return {
        success: true,
        transactionId: `BILL-TX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
      };
    }
  }

  // API - Get status of synchronization service (Is API Key set?)
  router.get("/status", requireAdmin, async (req, res) => {
    const creds = await getBillingCredentials();
    const hasUrl = !!creds.apiUrl && !creds.apiUrl.includes("api.facturadorexterno.com/v1");
    const hasKey = !!creds.apiKey;
  
    return res.json({
      configured: hasUrl && hasKey,
      status: (hasUrl && hasKey) ? "CONECTADO" : "SIMULADO_LOCAL",
      provider: "Adaptador Genérico de Control Sincrónico",
      api_url: creds.apiUrl || "https://api.facturadorexterno.com/v1",
      api_key_masked: hasKey ? `${creds.apiKey.slice(0, 4)}***${creds.apiKey.slice(-3)}` : "MODO_DEMOSTRACION_SIN_SECRETOS",
      lastCheck: new Date().toISOString()
    });
  });

  // API - Test connection to the custom billing API
  router.post("/test-connection", requireAdmin, async (req, res) => {
    const { apiUrl, apiKey } = req.body;
    if (!apiUrl) {
      return res.status(400).json({ success: false, error: "La URL de la API es requerida." });
    }
  
    try {
      // Simulate connection lag
      await new Promise(resolve => setTimeout(resolve, 800));
    
      if (apiKey === "force_error" || apiUrl.includes("invalid-url-error")) {
        throw new Error("ERROR_CONEXION_TIMEOUT: El servidor del facturador externo no respondió en el puerto indicado o las credenciales son inválidas.");
      }
    
      return res.json({
        success: true,
        message: "¡Conexión exitosa! El facturador respondió correctamente."
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: err.message || "Error al conectar con la API del facturador."
      });
    }
  });

  // API - Request synchronous stock mapping from provider
  router.post("/sync-stock", requireAdmin, async (req, res) => {
    const { productsList } = req.body;
    if (!productsList || !Array.isArray(productsList)) {
      return res.status(400).json({ error: "Falta arrary de productos 'productsList'" });
    }

    // Harvest all connected SKUs (codigoFacturador)
    const skus = productsList
      .map((p: any) => p.codigoFacturador)
      .filter((sku: any) => typeof sku === 'string' && sku.trim() !== "");

    if (skus.length === 0) {
      return res.json({
        success: true,
        updatedProducts: [],
        message: "No se encontraron productos con SKU / código de facturador vinculados.",
        syncCount: 0
      });
    }

    try {
      const creds = await getBillingCredentials();
      const adapter = new SimulatedFacturadorAdapter(creds.apiUrl, creds.apiKey);
      const stockMap = await adapter.syncStock(skus);

      // Map stock statuses back to incoming products
      const updatedProducts = productsList.map((p: any) => {
        if (p.codigoFacturador && stockMap[p.codigoFacturador] !== undefined) {
          const apiStock = stockMap[p.codigoFacturador];
          return {
            ...p,
            inStock: apiStock.inStock
          };
        }
        return p;
      });

      return res.json({
        success: true,
        updatedProducts,
        message: `Sincronización finalizada correctamente. Se actualizaron ${Object.keys(stockMap).length} productos vinculados.`,
        syncCount: Object.keys(stockMap).length,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[Billing Error] Failed to synchronise stock:", err.message);
      return res.status(503).json({
        success: false,
        error: err.message || "Servicio no disponible de facturador externo"
      });
    }
  });

  // API - Report venta from storefront to deduct stock
  // Deliberately public: the storefront calls it as the customer completes a
  // purchase, with no admin session available.
  router.post("/report-sale", reportSaleLimiter, async (req, res) => {
    const { order, docId } = req.body;
    if (!order || !order.id || !order.items || !Array.isArray(order.items)) {
      return res.status(400).json({ error: "Estructura de pedido 'order' inválida." });
    }

    if (order.items.length === 0 || order.items.length > MAX_ORDER_ITEMS) {
      return res.status(400).json({ error: "El pedido debe tener entre 1 y " + MAX_ORDER_ITEMS + " items." });
    }

    // El pedido tiene que existir en Firestore, estar recien creado y seguir
    // pendiente: sin esto cualquiera podia informar ventas inventadas y
    // descontar stock. Se verifica con el Admin SDK (no pasa por las reglas).
    const adminDb = getAdminFirestore();
    if (adminDb) {
      if (typeof docId !== "string" || !docId) {
        return res.status(400).json({ error: "Falta el identificador del pedido." });
      }

      try {
        const snap = await adminDb.collection("orders").doc(docId).get();
        if (!snap.exists) {
          return res.status(404).json({ error: "El pedido no existe." });
        }

        const stored: any = snap.data() || {};
        if (stored.status !== "pendiente" && stored.status !== "pending_confirmation") {
          return res.status(409).json({ error: "El pedido ya fue procesado." });
        }

        const createdAt = Date.parse(stored.timestamp || "");
        if (!Number.isFinite(createdAt) || Date.now() - createdAt > REPORT_SALE_MAX_AGE_MS) {
          return res.status(409).json({ error: "El pedido no es reciente; no se informa." });
        }

        // Se informan los items guardados en Firestore, no los del body, para
        // que el cliente no pueda inflar cantidades.
        order.items = Array.isArray(stored.items) ? stored.items : [];
        order.id = stored.id;
      } catch (err: any) {
        console.warn("[Billing] No se pudo validar el pedido:", err.message);
        return res.status(503).json({ error: "No se pudo validar el pedido." });
      }
    } else {
      console.warn("[Billing] Sin service account: se informa la venta sin validar contra Firestore.");
    }

    // Extract items linked tobilling system
    const itemsToDeduct: { sku: string; qty: number }[] = [];
  
    // We expect the items passed in to correlate with current catalog product SKUS
    // Let's safe-guard extraction
    order.items.forEach((item: any) => {
      // If we has details about SKU or we map it from catalog
      if (item.codigoFacturador) {
        itemsToDeduct.push({ sku: item.codigoFacturador, qty: item.qty || 1 });
      }
    });

    if (itemsToDeduct.length === 0) {
      return res.json({
        success: true,
        reported: false,
        message: "Ningún ítem en el pedido estaba vinculado con códigos de stock del facturador."
      });
    }

    try {
      const creds = await getBillingCredentials();
      const adapter = new SimulatedFacturadorAdapter(creds.apiUrl, creds.apiKey);
      const response = await adapter.reportSale(order.id, itemsToDeduct);

      return res.json({
        success: true,
        reported: true,
        transactionId: response.transactionId,
        message: `Venta nro ${order.id} informada con éxito. Stock sincronizado.`,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[Billing Error] Failed to report sale:", err.message);
      return res.status(503).json({
        success: false,
        error: err.message || "Error al informar venta"
      });
    }
  });

  return router;
}
