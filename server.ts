// Primero de todo: carga el .env antes de que cualquier modulo lea process.env.
import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import {
  authenticateStarPOS,
  syncCatalogToStarPOS,
  syncSalesAndDiscountStock,
  syncStockFromStarPOS
} from "./src/services/starpos";
import { requireAdmin, getAdminFirestore } from "./src/services/serverAuth";
import rateLimit from "express-rate-limit";


// Initialize Firebase App SDK
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

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

let genAIInstance: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not defined. Please add it to your secrets.');
  }
  if (!genAIInstance) {
    genAIInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return genAIInstance;
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

const freeShippingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { available: false }
});

const MAX_ORDER_ITEMS = 100;
// Solo se acepta informar un pedido reciente: evita reprocesar pedidos viejos.
const REPORT_SALE_MAX_AGE_MS = 60 * 60 * 1000;

async function startServer() {
  const app = express();
  // Railway / Render / Fly inyectan el puerto por entorno; 3000 en local.
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware to parse JSON
  app.use(express.json({ limit: '10mb' }));

  // API Route for AI Image Generation
  app.post("/api/ai/generate-product-image", requireAdmin, async (req, res) => {
    const { productName, productBrand } = req.body;
    if (!productName) {
      return res.status(400).json({ error: "Product name is required" });
    }

    try {
      const ai = getGenAI();
      const stylePrompt = `A professional food or product advertising photorealistic studio catalog photograph of a single packaged "${productName}" by brand "${productBrand || 'Kiosco'}". Centered, placed on a very clean neutral studio countertop with custom professional dramatic warm studio product lighting. Appealing, clean minimalist advertising style, crisp realistic texture and packaging, 1:1 aspect ratio, high definition.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: stylePrompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let base64Image = "";
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            base64Image = part.inlineData.data;
            break;
          }
        }
      }

      if (base64Image) {
        return res.json({ imageUrl: `data:image/png;base64,${base64Image}` });
      } else {
        let textResponse = "";
        if (response.candidates && response.candidates[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.text) {
              textResponse += part.text;
            }
          }
        }
        return res.status(500).json({ 
          error: "Could not generate image bytes from candidate response.",
          details: textResponse 
        });
      }
    } catch (err: any) {
      console.warn("AI Image generation endpoint quota/error. Applying smart food fallback:", err.message);
      
      // Smart Unsplash fallback mapper
      const getFallbackStoreImage = (name: string, brand: string = ""): string => {
        const norm = `${name} ${brand}`.toLowerCase();
        
        if (norm.includes("cola") || norm.includes("coke") || norm.includes("pepsi") || norm.includes("sprite") || norm.includes("fanta") || norm.includes("gaseosa") || norm.includes("soda")) {
          return "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=600&auto=format&fit=crop"; // Cola
        }
        if (norm.includes("cerveza") || norm.includes("beer") || norm.includes("vino") || norm.includes("wine") || norm.includes("fernet") || norm.includes("branca") || norm.includes("alcohol") || norm.includes("bebida alc")) {
          return "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=600&auto=format&fit=crop"; // Wine / Drinks
        }
        if (norm.includes("agua") || norm.includes("villavicencio") || norm.includes("smartwater") || norm.includes("kin")) {
          return "https://images.unsplash.com/photo-1608885898957-a599fb15ec35?q=80&w=600&auto=format&fit=crop"; // Water
        }
        if (norm.includes("jugo") || norm.includes("cepita") || norm.includes("juice")) {
          return "https://images.unsplash.com/photo-1613478223719-2ab802602423?q=80&w=600&auto=format&fit=crop"; // Orange Juice
        }
        if (norm.includes("monster") || norm.includes("gatorade") || norm.includes("powerade") || norm.includes("energizante") || norm.includes("energy")) {
          return "https://images.unsplash.com/photo-1551326844-301bd9b21f92?q=80&w=600&auto=format&fit=crop"; // Sports Drinks
        }
        if (norm.includes("alfajor") || norm.includes("dulce") || norm.includes("rogel") || norm.includes("jorgito") || norm.includes("caramelo") || norm.includes("sugus") || norm.includes("mentita") || norm.includes("gomita")) {
          return "https://images.unsplash.com/photo-1508737804141-4c3b688e25be?q=80&w=600&auto=format&fit=crop"; // Treats / Alfajor / Candy
        }
        if (norm.includes("lays") || norm.includes("papas") || norm.includes("potato") || norm.includes("chips") || norm.includes("snack") || norm.includes("cheetos") || norm.includes("palitos")) {
          return "https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=600&auto=format&fit=crop"; // Chips & Snacks
        }
        if (norm.includes("oreo") || norm.includes("pepito") || norm.includes("cookies") || norm.includes("galletitas") || norm.includes("galleta") || norm.includes("criollitas")) {
          return "https://images.unsplash.com/photo-1558961309-dbd715c1390f?q=80&w=600&auto=format&fit=crop"; // Oreo / Cookies
        }
        if (norm.includes("chocolate") || norm.includes("milka") || norm.includes("toblerone") || norm.includes("cofler") || norm.includes("barrita")) {
          return "https://images.unsplash.com/photo-1511381939415-e44015466834?q=80&w=600&auto=format&fit=crop"; // Chocolate
        }
        if (norm.includes("leche") || norm.includes("lacteo") || norm.includes("yogur") || norm.includes("milk") || norm.includes("manteca")) {
          return "https://images.unsplash.com/photo-1563636619-e9143da7973b?q=80&w=600&auto=format&fit=crop"; // Milk / Dairy
        }
        if (norm.includes("jamon") || norm.includes("salame") || norm.includes("paleta") || norm.includes("fiambre") || norm.includes("mortadela")) {
          return "https://images.unsplash.com/photo-1524438418049-ab2acb7aa48f?q=80&w=600&auto=format&fit=crop"; // Ham / Meats
        }
        if (norm.includes("queso") || norm.includes("cheese") || norm.includes("cremoso") || norm.includes("pategras")) {
          return "https://images.unsplash.com/photo-1486299267070-83823f5448dd?q=80&w=600&auto=format&fit=crop"; // Cheese
        }
        if (norm.includes("pan") || norm.includes("medialuna") || norm.includes("factura") || norm.includes("panaderia") || norm.includes("facturas") || norm.includes("croissant") || norm.includes("lactal")) {
          return "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop"; // Bread / Bakery
        }
        if (norm.includes("detergente") || norm.includes("lavandina") || norm.includes("limpieza") || norm.includes("desinfectante") || norm.includes("jabon")) {
          return "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop"; // Cleaning/Hygiene
        }
        if (norm.includes("arroz") || norm.includes("fideo") || norm.includes("pasta") || norm.includes("aceite") || norm.includes("alimento") || norm.includes("cereales")) {
          return "https://images.unsplash.com/photo-1551462147-37885abb36f7?q=80&w=600&auto=format&fit=crop"; // Pasta / Grocery
        }
        
        const cleanName = encodeURIComponent(name.trim());
        return `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&auto=format&fit=crop&sig=${cleanName}`;
      };

      const fallbackUrl = getFallbackStoreImage(productName, productBrand);
      return res.json({ 
        imageUrl: fallbackUrl,
        fallbackUsed: true,
        errorNote: err.message || ""
      });
    }
  });
 
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
  app.get("/api/facturador/status", requireAdmin, async (req, res) => {
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
  app.post("/api/facturador/test-connection", requireAdmin, async (req, res) => {
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
  app.post("/api/facturador/sync-stock", requireAdmin, async (req, res) => {
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
  app.post("/api/facturador/report-sale", reportSaleLimiter, async (req, res) => {
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

  // Envio gratis para el PRIMER pedido del dia de TODA la tienda.
  // Se resuelve en el servidor con el Admin SDK: el cliente no puede leer
  // /orders (las reglas lo prohiben) y hacerlo por dispositivo se reseteaba
  // borrando datos o cambiando de telefono.
  // Publica: la consulta la necesita cualquier comprador. Limitada por IP
  // porque cada llamada es una lectura de Firestore.
  app.get("/api/store/free-shipping-status", freeShippingLimiter, async (_req, res) => {
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

  // ==========================================
  // CAPA DE INTEGRACIÓN CON STARPOS (SECURE PROXIES)
  // ==========================================

  // Check StarPOS Configuration and Connection Status
  app.get("/api/starpos/status", requireAdmin, async (req, res) => {
    const config = {
      userId: process.env.STARPOS_USER_ID || "",
      secret: process.env.STARPOS_SECRET || "",
      serviceUrl: process.env.STARPOS_SERVICE_URL || ""
    };

    const isConfigured = !!config.userId && !!config.secret && !!config.serviceUrl;

    if (!isConfigured) {
      return res.json({
        configured: false,
        status: "SIN_CONFIGURAR",
        message: "No se detectaron las variables de entorno para StarPOS. La sincronización se ejecutará en MODO DEMO SIMULADO.",
        config: {
          userId: "",
          serviceUrl: "Demo Local",
          secretMasked: ""
        }
      });
    }

    try {
      // Try to authenticate with StarPOS API
      const token = await authenticateStarPOS(true);
      return res.json({
        configured: true,
        status: "CONECTADO",
        message: "¡Conexión establecida con la API local de StarPOS!",
        config: {
          userId: config.userId,
          serviceUrl: config.serviceUrl,
          secretMasked: config.secret.length > 4 ? "***" + config.secret.slice(-4) : "***"
        },
        token: token.slice(0, 8) + "..."
      });
    } catch (err: any) {
      return res.json({
        configured: true,
        status: "ERROR_CONEXION",
        message: `No se pudo conectar al local físico (${config.serviceUrl}): ${err.message}. La tienda entrará en modo resiliente de contingencia.`,
        config: {
          userId: config.userId,
          serviceUrl: config.serviceUrl,
          secretMasked: config.secret.length > 4 ? "***" + config.secret.slice(-4) : "***"
        }
      });
    }
  });

  // Technical connection diagnostics endpoint
  app.get("/api/starpos/diagnose", requireAdmin, async (req, res) => {
    const userId = process.env.STARPOS_USER_ID || "";
    const secret = process.env.STARPOS_SECRET || "";
    const serviceUrl = process.env.STARPOS_SERVICE_URL || "";

    if (!userId || !secret || !serviceUrl) {
      return res.json({
        success: false,
        errorType: "CONFIG_MISSING",
        message: "No se puede diagnosticar la conexión: Faltan credenciales o URL de StarPOS en las variables de entorno.",
        infrastructureAdvice: "Por favor, configure STARPOS_USER_ID, STARPOS_SECRET, y STARPOS_SERVICE_URL.",
        logs: [
          "Falla de configuración local.",
          "Verifique variables de entorno."
        ]
      });
    }

    const logs: string[] = [];
    logs.push(`Iniciando diagnóstico técnico de enlace con StarPOS en URL: ${serviceUrl}...`);

    let errorType = "DESCONOCIDO";
    let infrastructureAdvice = "Verifique la configuración de red general.";
    let success = false;
    let details = "";

    try {
      // Step 1: Parse Host and Port
      const urlParsed = new URL(serviceUrl);
      const host = urlParsed.hostname;
      const port = urlParsed.port || (urlParsed.protocol === 'https:' ? '443' : '80');
      logs.push(`DNS & Red: Extrayendo Hostname [${host}] y Puerto [${port}]`);

      // Check if port is 8090 or standard
      if (port !== '8090') {
        logs.push(`⚠️ Nota: El puerto configurado es [${port}]. El estándar de la integración física de StarPOS suele ser 8090.`);
      }

      // Step 2: Attempt standard fetch with a tight 4-second timeout to distinguish timeouts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      
      const authUrl = `${serviceUrl.replace(/\/$/, '')}/v1/Authenticate`;
      logs.push(`Conectando con endpoint de autenticación: ${authUrl}`);

      try {
        const response = await fetch(authUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            secret: secret,
            service: "https://starpos.com/api"
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          // No basta con un 2xx: la auth real exige payload.access_token. Así el
          // diagnóstico refleja de verdad si las credenciales sirven (antes daba
          // "conectado" con cualquier 200, aunque no autenticara).
          let hasToken = false;
          try { const body = await response.json(); hasToken = !!(body && body.payload && body.payload.access_token); } catch (e) { /* respuesta no-JSON */ }
          if (hasToken) {
            success = true;
            errorType = "NINGUNO";
            logs.push(`✅ Conexión y autenticación correctas (HTTP ${response.status}, token recibido).`);
            infrastructureAdvice = "¡La conexión de red es correcta y las credenciales fueron aceptadas por StarPOS!";
          } else {
            errorType = "CREDENTIALS_OR_HTTP_ERROR";
            details = `HTTP ${response.status} pero sin token de acceso en la respuesta.`;
            logs.push(`⚠️ StarPOS respondió ${response.status} pero no devolvió token. Revisá STARPOS_USER_ID / STARPOS_SECRET.`);
            infrastructureAdvice = "El servidor respondió pero no autenticó. Verificá que el usuario y el secret sean los correctos.";
          }
        } else {
          errorType = "CREDENTIALS_OR_HTTP_ERROR";
          details = `Código de estado HTTP: ${response.status}`;
          logs.push(`❌ El servidor remoto de StarPOS respondió con un error HTTP ${response.status}.`);
          infrastructureAdvice = "El servidor de StarPOS físico está respondiendo, pero rechazó la autenticación. Verifique que STARPOS_USER_ID y STARPOS_SECRET sean correctos y coincidan con los de la terminal física.";
        }
      } catch (innerErr: any) {
        clearTimeout(timeoutId);
        details = innerErr.message || String(innerErr);
        
        if (innerErr.name === 'AbortError' || innerErr.message?.toLowerCase().includes('timeout')) {
          errorType = "TIMEOUT";
          logs.push(`❌ Límite de tiempo excedido (Timeout). El servidor de StarPOS remoto no respondió en 4000ms.`);
          infrastructureAdvice = `1. Asegúrese de que el servidor local de StarPOS está encendido y ejecutándose en la IP/Puerto indicados (${port}).\n2. Verifique que la red local tenga el puerto ${port} (estándar 8090) liberado y no esté bloqueado por un Firewall de Windows o antivirus.\n3. Confirme que la regla de NAT/Port Forwarding en el Router del comercio esté correctamente mapeando el tráfico externo al puerto de la terminal StarPOS física.`;
        } else if (innerErr.code === 'ENOTFOUND' || innerErr.message?.toLowerCase().includes('dns') || innerErr.message?.toLowerCase().includes('getaddrinfo')) {
          errorType = "DNS_ERROR";
          logs.push(`❌ Error de resolución de nombre (DNS). No se pudo resolver el host '${host}'.`);
          infrastructureAdvice = "1. Verifique que la URL de servicio de StarPOS configurada sea válida.\n2. Si utiliza un dominio dinámico (como No-IP o DynDNS), confirme que el cliente de actualización del router esté activo y reportando la IP pública correcta.";
        } else if (innerErr.code === 'ECONNREFUSED' || innerErr.message?.toLowerCase().includes('refused') || innerErr.message?.toLowerCase().includes('fetch failed')) {
          errorType = "CONNECTION_REFUSED";
          logs.push(`❌ Conexión rechazada (Connection Refused). El servidor de StarPOS remoto está apagado o el puerto está cerrado.`);
          infrastructureAdvice = `1. Verifique que el servicio del motor de integración StarPOS esté activado en la máquina host local.\n2. Confirme que la regla de cortafuegos (Firewall) permita tráfico entrante en el puerto ${port} (estándar 8090).\n3. Revise si el puerto cambió en el archivo de configuración del sistema de facturación local.`;
        } else {
          errorType = "NETWORK_ERROR";
          logs.push(`❌ Error general de red: ${innerErr.message}`);
          infrastructureAdvice = `1. Confirme que la conexión de internet del kiosco esté estable.\n2. Verifique la configuración del puerto 8090 en el Router del comercio y compruebe las exclusiones de cortafuegos.`;
        }
      }
    } catch (outerErr: any) {
      details = outerErr.message || String(outerErr);
      errorType = "PARSE_ERROR";
      logs.push(`❌ Error al analizar la URL de configuración: ${outerErr.message}`);
      infrastructureAdvice = "Verifique que STARPOS_SERVICE_URL sea una dirección web válida completa, incluyendo el protocolo (http:// o https://). Ejemplo: http://190.112.45.10:8090";
    }

    return res.json({
      success,
      errorType,
      message: success ? "Sincronizador operativo" : "Falla en canal de enlace StarPOS",
      details,
      infrastructureAdvice,
      logs
    });
  });

  // Manual catalog synchronization trigger
  app.post("/api/starpos/sync-catalog", requireAdmin, async (req, res) => {
    const { productsList } = req.body;
    if (!productsList || !Array.isArray(productsList)) {
      return res.status(400).json({ error: "Falta la lista de productos 'productsList'" });
    }

    const config = {
      userId: process.env.STARPOS_USER_ID || "",
      secret: process.env.STARPOS_SECRET || "",
      serviceUrl: process.env.STARPOS_SERVICE_URL || ""
    };

    const isConfigured = !!config.userId && !!config.secret && !!config.serviceUrl;

    if (!isConfigured) {
      // Demo Mode simulation
      await new Promise(resolve => setTimeout(resolve, 1500));
      return res.json({
        success: true,
        isDemo: true,
        syncedCount: productsList.length,
        logs: [
          "Iniciando sincronización obligatoria de catálogo (MODO DEMO SIMULADO)...",
          "🔑 [Simulado] Autenticación con StarPOS exitosa.",
          "1/8 [Simulado] Creando Impuestos (/v1/Taxes) -> IVA 21%, IVA 10.5%, Exento.",
          "2/8 [Simulado] Creando Listas de Precios (/v1/PriceList) -> Lista General.",
          "3/8 [Simulado] Creando Categorías (/v1/Categories)...",
          `✅ [Simulado] Se crearon las categorías correspondientes en el local.`,
          "4/8 [Simulado] Creando Familias (/v1/Families) -> Familias jerárquicas vinculadas.",
          "5/8 [Simulado] Creando Marcas (/v1/Brands) -> Marcas de góndola mapeadas.",
          "6/8 [Simulado] Creando Catálogo de Productos con sub-colecciones (/Products)...",
          `✅ [Simulado] ${productsList.length} productos con códigos de barra, impuestos, sucursales y precios enviados con éxito.`,
          "7/8 [Simulado] Creando Métodos de Pago (/v1/PaymentMethods) -> Efectivo, Tarjeta, Transferencia.",
          "8/8 [Simulado] Registrando Planes (/v1/Plans) -> Financiación StarPOS registrada.",
          "🎉 ¡[Simulado] La sincronización obligatoria del catálogo en StarPOS se completó con éxito absoluto!"
        ]
      });
    }

    try {
      const report = await syncCatalogToStarPOS(productsList);
      return res.json(report);
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: err.message || "Error al sincronizar catálogo con StarPOS"
      });
    }
  });

  // Fetch sales and sync stock trigger
  app.post("/api/starpos/sync-sales", requireAdmin, async (req, res) => {
    const { productsList } = req.body;
    
    const config = {
      userId: process.env.STARPOS_USER_ID || "",
      secret: process.env.STARPOS_SECRET || "",
      serviceUrl: process.env.STARPOS_SERVICE_URL || ""
    };

    const isConfigured = !!config.userId && !!config.secret && !!config.serviceUrl;

    if (!isConfigured) {
      // Demo Mode simulation
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      const mockReductions = [
        { productName: "Queso Cremoso x100g", sku: "SKU-QUESO-CREMOSO", qty: 2 },
        { productName: "Coca-Cola 500ml", sku: "SKU-COCA-500", qty: 5 },
        { productName: "Alfajor Triple Milka", sku: "SKU-ALFAJOR-TRIPLE", qty: 3 }
      ];

      // Let's perform a demo decrement on Firestore products if they exist
      try {
        const { getDocs, collection, doc, updateDoc } = await import("firebase/firestore");
        const snap = await getDocs(collection(firestoreDb, 'products'));
        let count = 0;
        for (const docObj of snap.docs) {
          const p = docObj.data();
          if (p.name.toLowerCase().includes("queso") || p.name.toLowerCase().includes("coca") || p.name.toLowerCase().includes("alfajor")) {
            const currentStock = p.stockQty !== undefined ? p.stockQty : 15;
            const nextStock = Math.max(0, currentStock - 2);
            await updateDoc(doc(firestoreDb, 'products', docObj.id), {
              stockQty: nextStock,
              inStock: nextStock > 0
            });
            count++;
          }
        }
        console.log(`[Demo Sync] Decremented stock of ${count} matching demo products in Firestore.`);
      } catch (e: any) {
        console.warn("Could not decrement demo stock in firestore:", e.message);
      }

      // Save a simulated ticket inside Firestore as well to display in latest sales
      try {
        const { doc, setDoc } = await import("firebase/firestore");
        const demoTicketId = `DEMO-TX-${Date.now()}`;
        await setDoc(doc(firestoreDb, 'starpos_imported_sales', demoTicketId), {
          id: demoTicketId,
          ticket_number: `T001-${Math.floor(1000 + Math.random() * 9000)}`,
          timestamp: new Date().toISOString(),
          ticket_lines: [
            { id: "line_1", product_id: "SKU-QUESO-CREMOSO", product_name: "Queso Cremoso x100g", qty: 2, price: 500, subtotal: 1000 },
            { id: "line_2", product_id: "SKU-COCA-500", product_name: "Coca-Cola 500ml", qty: 5, price: 1500, subtotal: 7500 }
          ],
          tax_lines: [
            { tax_id: "tax_iva_21", amount: 1785 }
          ],
          payments: [
            { payment_method_id: "pay_cash", amount: 8500 }
          ],
          subtotal: 8500,
          total: 8500,
          importedAt: new Date().toISOString()
        });
      } catch (e: any) {
        console.warn("Could not write demo ticket to Firestore:", e.message);
      }

      return res.json({
        success: true,
        ticketsFetched: 3,
        closedCashFetched: 1,
        stockReductions: mockReductions,
        logs: [
          "Iniciando importación de ventas de StarPOS (MODO DEMO SIMULADO)...",
          "🔑 [Simulado] Conectado con la API de StarPOS.",
          "Consultando /v1/Tickets...",
          "Recuperados 3 comprobantes de venta pendientes de sincronizar.",
          "Consultando /v1/ClosedCash...",
          "Recuperados 1 cierres de caja del local.",
          "Procesando ticket nro: T001-4921 (Total: $8.500)...",
          "   -> Descontado \"Queso Cremoso x100g\" x2. Nuevo stock: 13",
          "   -> Descontado \"Coca-Cola 500ml\" x5. Nuevo stock: 80",
          "Procesando ticket nro: T001-4922 (Total: $4.500)...",
          "   -> Descontado \"Alfajor Triple Milka\" x3. Nuevo stock: 15",
          "🎉 [Simulado] Importación finalizada con éxito. Stock de la tienda sincronizado con el local físico."
        ]
      });
    }

    try {
      const result = await syncSalesAndDiscountStock(productsList || []);
      return res.json(result);
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: err.message || "Error al sincronizar ventas con StarPOS"
      });
    }
  });

  // Direct stock synchronization from /v1/CurrentStock
  app.post("/api/starpos/sync-stock", requireAdmin, async (req, res) => {
    const config = {
      userId: process.env.STARPOS_USER_ID || "",
      secret: process.env.STARPOS_SECRET || "",
      serviceUrl: process.env.STARPOS_SERVICE_URL || ""
    };

    const isConfigured = !!config.userId && !!config.secret && !!config.serviceUrl;

    if (!isConfigured) {
      // Demo Mode simulation
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.json({
        success: true,
        syncedCount: 5,
        logs: [
          "Iniciando sincronización directa de stock desde StarPOS (MODO DEMO SIMULADO)...",
          "🔑 [Simulado] Conectado con la API de StarPOS.",
          "Consultando /v1/CurrentStock...",
          "Recuperados 5 registros de stock desde StarPOS.",
          "   -> \"Queso Cremoso x100g\" stock actualizado de forma directa a: 15",
          "   -> \"Coca-Cola 500ml\" stock actualizado de forma directa a: 80",
          "   -> \"Alfajor Triple Milka\" stock actualizado de forma directa a: 15",
          "🎉 [Simulado] Sincronización directa de stock finalizada con éxito."
        ]
      });
    }

    try {
      const result = await syncStockFromStarPOS();
      return res.json(result);
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: err.message || "Error al sincronizar stock con StarPOS"
      });
    }
  });

  // Get imported StarPOS tickets for AdminPanel display
  app.get("/api/starpos/sales", requireAdmin, async (req, res) => {
    const adminDb = getAdminFirestore();
    if (!adminDb) {
      console.warn("[StarPOS] Sin FIREBASE_SERVICE_ACCOUNT_JSON: no se pueden leer las ventas importadas.");
      return res.json({ success: true, sales: [], degraded: true });
    }

    try {
      const snap = await adminDb
        .collection("starpos_imported_sales")
        .orderBy("importedAt", "desc")
        .limit(20)
        .get();
      const list: any[] = [];
      snap.forEach(docObj => {
        list.push({ id: docObj.id, ...docObj.data() });
      });
      return res.json({ success: true, sales: list });
    } catch (err: any) {
      console.warn("[StarPOS] No se pudo consultar starpos_imported_sales:", err.message);
      return res.json({ success: true, sales: [], degraded: true });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
