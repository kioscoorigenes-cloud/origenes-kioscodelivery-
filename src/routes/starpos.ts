// Extraido de server.ts: los handlers se agruparon por dominio.
import { Router } from "express";
import type { Firestore } from "firebase/firestore";
import {
  authenticateStarPOS,
  syncCatalogToStarPOS,
  syncSalesAndDiscountStock,
  syncStockFromStarPOS,
  pullPricesFromStarPOS
} from "../services/starpos";
import { requireAdmin, getAdminFirestore } from "../services/serverAuth";

export function starposRoutes({ firestoreDb }: { firestoreDb: Firestore }): Router {
  const router = Router();

  // ==========================================
  // CAPA DE INTEGRACIÓN CON STARPOS (SECURE PROXIES)
  // ==========================================

  // Check StarPOS Configuration and Connection Status
  router.get("/status", requireAdmin, async (req, res) => {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.json({
        configured: true,
        status: "ERROR_CONEXION",
        message: `No se pudo conectar al local físico (${config.serviceUrl}): ${msg}. La tienda entrará en modo resiliente de contingencia.`,
        config: {
          userId: config.userId,
          serviceUrl: config.serviceUrl,
          secretMasked: config.secret.length > 4 ? "***" + config.secret.slice(-4) : "***"
        }
      });
    }
  });

  // Technical connection diagnostics endpoint
  router.get("/diagnose", requireAdmin, async (req, res) => {
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
      const urlParsed = new URL(serviceUrl);
      const host = urlParsed.hostname;
      const port = urlParsed.port || (urlParsed.protocol === 'https:' ? '443' : '80');
      logs.push(`DNS & Red: Extrayendo Hostname [${host}] y Puerto [${port}]`);

      if (port !== '8090') {
        logs.push(`⚠️ Nota: El puerto configurado es [${port}]. El estándar de la integración física de StarPOS suele ser 8090.`);
      }

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
          let hasToken = false;
          try {
            const body = await response.json();
            hasToken = !!(body && body.payload && body.payload.access_token);
          } catch {
            /* respuesta no-JSON */
          }
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
      } catch (innerErr: unknown) {
        clearTimeout(timeoutId);
        const ie = innerErr instanceof Error ? innerErr : new Error(String(innerErr));
        details = ie.message;

        if (ie.name === 'AbortError' || ie.message?.toLowerCase().includes('timeout')) {
          errorType = "TIMEOUT";
          logs.push(`❌ Límite de tiempo excedido (Timeout). El servidor de StarPOS remoto no respondió en 4000ms.`);
          infrastructureAdvice = `1. Asegúrese de que el servidor local de StarPOS está encendido y ejecutándose en la IP/Puerto indicados (${port}).\n2. Verifique que la red local tenga el puerto ${port} (estándar 8090) liberado y no esté bloqueado por un Firewall de Windows o antivirus.\n3. Confirme que la regla de NAT/Port Forwarding en el Router del comercio esté correctamente mapeando el tráfico externo al puerto de la terminal StarPOS física.`;
        } else if ((ie as NodeJS.ErrnoException).code === 'ENOTFOUND' || ie.message?.toLowerCase().includes('dns') || ie.message?.toLowerCase().includes('getaddrinfo')) {
          errorType = "DNS_ERROR";
          logs.push(`❌ Error de resolución de nombre (DNS). No se pudo resolver el host '${host}'.`);
          infrastructureAdvice = "1. Verifique que la URL de servicio de StarPOS configurada sea válida.\n2. Si utiliza un dominio dinámico (como No-IP o DynDNS), confirme que el cliente de actualización del router esté activo y reportando la IP pública correcta.";
        } else if ((ie as NodeJS.ErrnoException).code === 'ECONNREFUSED' || ie.message?.toLowerCase().includes('refused') || ie.message?.toLowerCase().includes('fetch failed')) {
          errorType = "CONNECTION_REFUSED";
          logs.push(`❌ Conexión rechazada (Connection Refused). El servidor de StarPOS remoto está apagado o el puerto está cerrado.`);
          infrastructureAdvice = `1. Verifique que el servicio del motor de integración StarPOS esté activado en la máquina host local.\n2. Confirme que la regla de cortafuegos (Firewall) permita tráfico entrante en el puerto ${port} (estándar 8090).\n3. Revise si el puerto cambió en el archivo de configuración del sistema de facturación local.`;
        } else {
          errorType = "NETWORK_ERROR";
          logs.push(`❌ Error general de red: ${ie.message}`);
          infrastructureAdvice = `1. Confirme que la conexión de internet del kiosco esté estable.\n2. Verifique la configuración del puerto 8090 en el Router del comercio y compruebe las exclusiones de cortafuegos.`;
        }
      }
    } catch (outerErr: unknown) {
      const oe = outerErr instanceof Error ? outerErr : new Error(String(outerErr));
      details = oe.message;
      errorType = "PARSE_ERROR";
      logs.push(`❌ Error al analizar la URL de configuración: ${oe.message}`);
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
  router.post("/sync-catalog", requireAdmin, async (req, res) => {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({
        success: false,
        error: msg || "Error al sincronizar catálogo con StarPOS"
      });
    }
  });

  // Fetch sales and sync stock trigger
  router.post("/sync-sales", requireAdmin, async (req, res) => {
    const { productsList } = req.body;

    const config = {
      userId: process.env.STARPOS_USER_ID || "",
      secret: process.env.STARPOS_SECRET || "",
      serviceUrl: process.env.STARPOS_SERVICE_URL || ""
    };

    const isConfigured = !!config.userId && !!config.secret && !!config.serviceUrl;

    if (!isConfigured) {
      await new Promise(resolve => setTimeout(resolve, 1200));

      const mockReductions = [
        { productName: "Queso Cremoso x100g", sku: "SKU-QUESO-CREMOSO", qty: 2 },
        { productName: "Coca-Cola 500ml", sku: "SKU-COCA-500", qty: 5 },
        { productName: "Alfajor Triple Milka", sku: "SKU-ALFAJOR-TRIPLE", qty: 3 }
      ];

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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("Could not decrement demo stock in firestore:", msg);
      }

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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("Could not write demo ticket to Firestore:", msg);
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
      // Leer productos frescos de Firestore si no vienen del frontend
      let products = productsList;
      if (!products || !Array.isArray(products) || products.length === 0) {
        const { getDocs, collection } = await import("firebase/firestore");
        const snap = await getDocs(collection(firestoreDb, 'products'));
        products = [];
        snap.forEach(d => products.push({ id: d.id, ...d.data() }));
      }
      const result = await syncSalesAndDiscountStock(products);
      return res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[StarPOS] sync-sales error:", err);
      return res.status(502).json({
        success: false,
        error: msg || "Error al sincronizar ventas con StarPOS",
        logs: [`❌ ${msg}`]
      });
    }
  });

  // Direct stock synchronization
  router.post("/sync-stock", requireAdmin, async (req, res) => {
    const config = {
      userId: process.env.STARPOS_USER_ID || "",
      secret: process.env.STARPOS_SECRET || "",
      serviceUrl: process.env.STARPOS_SERVICE_URL || ""
    };

    const isConfigured = !!config.userId && !!config.secret && !!config.serviceUrl;

    if (!isConfigured) {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({
        success: false,
        error: msg || "Error al sincronizar stock con StarPOS"
      });
    }
  });

  // Sincronizar PRECIOS desde StarPOS → Firestore
  // Usa GET /v1/Products para traer precios y actualizar los productos existentes.
  // Solo toca el campo price, nunca borra fotos ni datos.
  router.post("/pull-prices", requireAdmin, async (_req, res) => {
    try {
      const result = await pullPricesFromStarPOS();
      return res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({
        success: false,
        error: msg || "Error al sincronizar precios con StarPOS"
      });
    }
  });

  // Pull prices con cron-token (para testing sin auth Firebase)
  router.post("/pull-prices-cron", async (req, res) => {
    const token = req.headers["x-cron-token"] || req.query.token;
    const expected = process.env.CRON_SECRET_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ success: false, error: "Token inválido" });
    }
    try {
      const result = await pullPricesFromStarPOS();
      return res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({ success: false, error: msg });
    }
  });

  // ==========================================
  // AUTO-SYNC DIARIO (llamado por cron/scheduled task)
  // Protegido por token secreto en lugar de auth de admin
  // ==========================================
  router.post("/auto-sync", async (req, res) => {
    const token = req.headers["x-cron-token"] || req.query.token;
    const expected = process.env.CRON_SECRET_TOKEN;

    if (!expected || token !== expected) {
      return res.status(401).json({ success: false, error: "Token inválido" });
    }

    const config = {
      userId: process.env.STARPOS_USER_ID || "",
      secret: process.env.STARPOS_SECRET || "",
      serviceUrl: process.env.STARPOS_SERVICE_URL || ""
    };

    if (!config.userId || !config.secret || !config.serviceUrl) {
      return res.json({ success: false, error: "StarPOS no configurado" });
    }

    try {
      // Leer productos de Firestore
      const adminDb = getAdminFirestore();
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "Firebase admin no disponible" });
      }

      const snap = await adminDb.collection("products").get();
      const products: Record<string, unknown>[] = [];
      snap.forEach(d => products.push({ id: d.id, ...d.data() }));

      // 1. Sync ventas y descontar stock (no bloquea precios si falla)
      let salesResult: { success: boolean; ticketsFetched: number; closedCashFetched: number; stockReductions: any[]; logs: string[] } = {
        success: false, ticketsFetched: 0, closedCashFetched: 0, stockReductions: [], logs: []
      };
      try {
        salesResult = await syncSalesAndDiscountStock(products as any[]);
      } catch (salesErr: unknown) {
        const smsg = salesErr instanceof Error ? salesErr.message : String(salesErr);
        salesResult.logs.push(`⚠️ Error al sincronizar ventas/stock: ${smsg}`);
      }

      // 2. Sync precios desde StarPOS (independiente de ventas)
      let pricesResult: { success: boolean; updatedCount: number; logs: string[] } = {
        success: false, updatedCount: 0, logs: []
      };
      try {
        pricesResult = await pullPricesFromStarPOS();
      } catch (priceErr: unknown) {
        const pmsg = priceErr instanceof Error ? priceErr.message : String(priceErr);
        pricesResult.logs.push(`⚠️ Error al sincronizar precios: ${pmsg}`);
      }

      // success: true si al menos una de las dos operaciones funcionó
      const overallSuccess = salesResult.success || pricesResult.success;

      return res.json({
        success: overallSuccess,
        timestamp: new Date().toISOString(),
        ticketsFetched: salesResult.ticketsFetched,
        closedCashFetched: salesResult.closedCashFetched,
        stockReductions: salesResult.stockReductions.length,
        pricesUpdated: pricesResult.updatedCount,
        salesSuccess: salesResult.success,
        pricesSuccess: pricesResult.success,
        logs: [...salesResult.logs, "---", ...pricesResult.logs]
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[StarPOS] auto-sync error:", err);
      return res.status(502).json({
        success: false,
        error: msg || "Error en auto-sync",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get imported StarPOS tickets for AdminPanel display
  router.get("/sales", requireAdmin, async (req, res) => {
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
      const list: Record<string, unknown>[] = [];
      snap.forEach(docObj => {
        list.push({ id: docObj.id, ...docObj.data() });
      });
      return res.json({ success: true, sales: list });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[StarPOS] No se pudo consultar starpos_imported_sales:", msg);
      return res.json({ success: true, sales: [], degraded: true });
    }
  });

  return router;
}
