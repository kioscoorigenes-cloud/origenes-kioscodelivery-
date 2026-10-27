import { doc, getDoc, getDocs, updateDoc, collection, setDoc } from 'firebase/firestore';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestoreInstance, Firestore as AdminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

let adminDbInstance: AdminFirestore | null = null;
function getAdminDb(): AdminFirestore | null {
  if (adminDbInstance) return adminDbInstance;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    const apps = getAdminApps();
    const app = apps.length > 0 ? apps[0] : initAdminApp({ credential: cert(serviceAccount) });
    adminDbInstance = getAdminFirestoreInstance(app, firebaseConfig.firestoreDatabaseId);
    return adminDbInstance;
  } catch (e) {
    console.error('Failed to initialize firebase-admin:', e);
    return null;
  }
}
import { db } from '../firebase';
import { Product } from '../types';

// Types for StarPOS API Entities
export interface StarPOSTax {
  id: string;
  name: string;
  percentage: number;
}

export interface StarPOSPriceList {
  id: string;
  name: string;
  active: boolean;
}

export interface StarPOSCategory {
  id: string;
  name: string;
}

export interface StarPOSFamily {
  id: string;
  name: string;
  category_id: string;
}

export interface StarPOSBrand {
  id: string;
  name: string;
}

export interface StarPOSProductCode {
  id?: string;
  code: string;
  type?: 'BARCODE' | 'SKU';
  quantity?: number;
}

export interface StarPOSProductTax {
  id?: string;
  tax_id: string;
  value?: number;
}

export interface StarPOSProductBranch {
  id?: string;
  branch_id?: string;
}

export interface StarPOSProductPrice {
  id?: string;
  pricelist_id?: string;
  price?: number;
  price_list_id?: string;
  price_sell?: number;
  last_modification?: string;
}

export interface StarPOSProductPriceOffer {
  id: string;
  price?: number;
  price_list_id?: string;
  price_sell?: number;
  price_buy?: number;
  active: boolean;
  date_begin?: string;
  last_modification?: string;
}

export interface StarPOSProductSalesByQty {
  id?: string;
  qty?: number;
  discount_percentage?: number;
}

export interface StarPOSProduct {
  id: string;
  name: string;
  category_id: string;
  family_id: string;
  brand_id: string;
  description: string;
  in_stock: boolean;
  products_codes: StarPOSProductCode[];
  products_taxes: StarPOSProductTax[];
  products_branches: (StarPOSProductBranch | string)[];
  products_prices: StarPOSProductPrice[];
  products_price_offers: StarPOSProductPriceOffer[];
  products_sales_by_qty: StarPOSProductSalesByQty[];
}

export interface StarPOSPaymentMethod {
  id: string;
  name: string;
  active: boolean;
}

export interface StarPOSPlan {
  id: string;
  name: string;
  installments: number;
  interest: number;
}

export interface StarPOSTicketLine {
  id: string;
  product_id: string;
  product_name: string;
  // La API de StarPOS envía la cantidad vendida en el campo "units" (no "qty").
  units: number;
  price: number;
  subtotal: number;
}

export interface StarPOSTaxLine {
  tax_id: string;
  amount: number;
}

export interface StarPOSPayment {
  payment_method_id: string;
  amount: number;
}

export interface StarPOSTicket {
  id: string;
  ticket_number: string;
  timestamp: string;
  ticket_lines: StarPOSTicketLine[];
  tax_lines: StarPOSTaxLine[];
  payments: StarPOSPayment[];
  subtotal: number;
  total: number;
}

export interface StarPOSClosedCash {
  id: string;
  open_timestamp: string;
  close_timestamp: string;
  total_cash: number;
  total_card: number;
  total_sales: number;
}

// Singleton state to store the access token in memory
let cachedToken: string | null = null;
let tokenExpiry: number = 0; // Epoch timestamp in ms

/**
 * Clean helper to safely fetch from environments or firestore settings
 */
export async function getStarPOSConfig() {
  const defaults = {
    userId: process.env.STARPOS_USER_ID || "",
    secret: process.env.STARPOS_SECRET || "",
    serviceUrl: process.env.STARPOS_SERVICE_URL || ""
  };

  try {
    const adminDb = getAdminDb();
    if (adminDb) {
      const snap = await adminDb.collection('settings').doc('starpos').get();
      if (snap.exists) {
        const data = snap.data();
        if (data) {
          return {
            userId: data.userId || defaults.userId,
            secret: data.secret || defaults.secret,
            serviceUrl: data.serviceUrl || defaults.serviceUrl
          };
        }
      }
    } else {
      const settingsRef = doc(db, 'settings', 'starpos');
      const snap = await getDoc(settingsRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          userId: data.userId || defaults.userId,
          secret: data.secret || defaults.secret,
          serviceUrl: data.serviceUrl || defaults.serviceUrl
        };
      }
    }
  } catch (err) {
    console.warn("Could not read settings/starpos from firestore, using environment variables:", err);
  }

  return defaults;
}

/**
 * Helper: parse JSON safely from a Response, throwing a clear error if the
 * body is not valid JSON (e.g. "upstream error" from a reverse proxy).
 */
async function safeJsonParse<T = unknown>(response: Response, context: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    // Mostrar los primeros 200 chars del cuerpo para diagnóstico
    const preview = text.length > 200 ? text.slice(0, 200) + '…' : text;
    throw new Error(
      `Respuesta no-JSON de StarPOS en ${context}: "${preview}" (HTTP ${response.status}). ` +
      'Esto suele significar que el túnel (Tailscale/ngrok) está caído o que StarPOS devolvió un error de texto.'
    );
  }
}

/**
 * 1) AUTENTICACIÓN: POST to authentication endpoint and cache token
 */
export async function authenticateStarPOS(forceRefresh = false): Promise<string> {
  const config = await getStarPOSConfig();

  if (!config.userId || !config.secret || !config.serviceUrl) {
    throw new Error("Missing StarPOS credentials or URL. Configure STARPOS_USER_ID, STARPOS_SECRET, and STARPOS_SERVICE_URL.");
  }

  // Check cache
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const authUrl = `${config.serviceUrl.replace(/\/$/, '')}/v1/Authenticate`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: config.userId,
        secret: config.secret,
        service: "https://starpos.com/api"
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Authentication failed with status ${response.status}`);
    }

    const data = await safeJsonParse<Record<string, unknown>>(response, '/v1/Authenticate');
    const payload = data?.payload as Record<string, unknown> | undefined;
    if (payload?.access_token && typeof payload.access_token === 'string') {
      cachedToken = payload.access_token;
      tokenExpiry = Date.now() + 3600 * 1000;
      return cachedToken;
    } else {
      throw new Error("Respuesta de autenticación inválida de StarPOS: falta 'payload.access_token'.");
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const err = error instanceof Error ? error : new Error(String(error));
    const msg = err.name === 'AbortError' ? 'timeout (StarPOS no respondió en 10s)' : err.message;
    console.error(`StarPOS Auth Error at ${authUrl}:`, msg);
    throw new Error(`Error de autenticación StarPOS: ${msg}`);
  }
}

/**
 * Safe fetch helper using cached token, with automatic retry on 401/403.
 */
async function authenticatedFetch(endpoint: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const config = await getStarPOSConfig();
  const url = `${config.serviceUrl.replace(/\/$/, '')}${endpoint}`;

  const doFetch = async (token: string): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(options.headers || {})
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let res = await doFetch(await authenticateStarPOS());
  if (res.status === 401 || res.status === 403) {
    res = await doFetch(await authenticateStarPOS(true));
  }
  return res;
}

/**
 * Helper to slugify categories, brands, etc. to clean IDs
 */
function toSlug(str: string): string {
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * 2) ENVÍO DE CATÁLOGO (POST) respecting strict chronological order of operations
 */
export interface SyncReport {
  success: boolean;
  logs: string[];
  steps: {
    taxes: boolean;
    priceList: boolean;
    categories: boolean;
    families: boolean;
    brands: boolean;
    products: boolean;
    paymentMethods: boolean;
    plans: boolean;
  };
  syncedCount: number;
}

export async function syncCatalogToStarPOS(products: Product[]): Promise<SyncReport> {
  const report: SyncReport = {
    success: false,
    logs: [],
    steps: {
      taxes: false,
      priceList: false,
      categories: false,
      families: false,
      brands: false,
      products: false,
      paymentMethods: false,
      plans: false
    },
    syncedCount: 0
  };

  try {
    report.logs.push("Iniciando sincronización obligatoria de catálogo...");

    await authenticateStarPOS();
    report.logs.push("🔑 Autenticación con StarPOS exitosa.");

    // ---- STEP 1: Taxes ----
    report.logs.push("1/8 Creando Impuestos (/v1/Taxes)...");
    const taxes: StarPOSTax[] = [
      { id: "tax_iva_21", name: "IVA 21%", percentage: 21 },
      { id: "tax_iva_105", name: "IVA 10.5%", percentage: 10.5 },
      { id: "tax_exento", name: "Exento", percentage: 0 }
    ];
    const taxesRes = await authenticatedFetch('/v1/Taxes', {
      method: 'POST',
      body: JSON.stringify(taxes)
    });
    if (!taxesRes.ok) {
      const body = await taxesRes.text().catch(() => '');
      throw new Error(`Fallo al crear impuestos (Status: ${taxesRes.status}): ${body.slice(0, 200)}`);
    }
    report.steps.taxes = true;
    report.logs.push("✅ Impuestos creados con éxito.");

    // ---- STEP 2: PriceList ----
    report.logs.push("2/8 Creando Listas de Precios (/v1/PriceList)...");
    const priceLists: StarPOSPriceList[] = [
      { id: "price_list_general", name: "Lista General Kiosco", active: true }
    ];
    const priceListRes = await authenticatedFetch('/v1/PriceList', {
      method: 'POST',
      body: JSON.stringify(priceLists)
    });
    if (!priceListRes.ok) {
      const body = await priceListRes.text().catch(() => '');
      throw new Error(`Fallo al crear listas de precios (Status: ${priceListRes.status}): ${body.slice(0, 200)}`);
    }
    report.steps.priceList = true;
    report.logs.push("✅ Lista de precios creada con éxito.");

    // ---- STEP 3: Categories ----
    report.logs.push("3/8 Creando Categorías (/v1/Categories)...");
    const uniqueCats = Array.from(new Set(products.map(p => p.cat || 'Kiosco')));
    const categories: StarPOSCategory[] = uniqueCats.map(cat => ({
      id: `cat_${toSlug(cat)}`,
      name: cat
    }));
    const catRes = await authenticatedFetch('/v1/Categories', {
      method: 'POST',
      body: JSON.stringify(categories)
    });
    if (!catRes.ok) {
      const body = await catRes.text().catch(() => '');
      throw new Error(`Fallo al crear categorías (Status: ${catRes.status}): ${body.slice(0, 200)}`);
    }
    report.steps.categories = true;
    report.logs.push(`✅ ${categories.length} Categorías creadas con éxito.`);

    // ---- STEP 4: Families ----
    report.logs.push("4/8 Creando Familias (/v1/Families)...");
    const families: StarPOSFamily[] = uniqueCats.map(cat => ({
      id: `fam_${toSlug(cat)}`,
      name: `Familia ${cat}`,
      category_id: `cat_${toSlug(cat)}`
    }));
    const famRes = await authenticatedFetch('/v1/Families', {
      method: 'POST',
      body: JSON.stringify(families)
    });
    if (!famRes.ok) {
      const body = await famRes.text().catch(() => '');
      throw new Error(`Fallo al crear familias (Status: ${famRes.status}): ${body.slice(0, 200)}`);
    }
    report.steps.families = true;
    report.logs.push("✅ Familias de categorías creadas con éxito.");

    // ---- STEP 5: Brands ----
    report.logs.push("5/8 Creando Marcas (/v1/Brands)...");
    const uniqueBrands = Array.from(new Set(products.map(p => p.brand || 'Genérico')));
    const brands: StarPOSBrand[] = uniqueBrands.map(brand => ({
      id: `brand_${toSlug(brand)}`,
      name: brand
    }));
    const brandRes = await authenticatedFetch('/v1/Brands', {
      method: 'POST',
      body: JSON.stringify(brands)
    });
    if (!brandRes.ok) {
      const body = await brandRes.text().catch(() => '');
      throw new Error(`Fallo al crear marcas (Status: ${brandRes.status}): ${body.slice(0, 200)}`);
    }
    report.steps.brands = true;
    report.logs.push(`✅ ${brands.length} Marcas creadas con éxito.`);

    // ---- STEP 6: Products ----
    report.logs.push("6/8 Creando Catálogo de Productos con sub-colecciones (/Products)...");
    const starPOSProducts: StarPOSProduct[] = products.map(p => {
      const pId = p.id.toString();
      const codeValue = p.codigoFacturador || `SKU-${toSlug(p.name)}-${pId}`;
      const catSlug = `cat_${toSlug(p.cat || 'Kiosco')}`;
      const famSlug = `fam_${toSlug(p.cat || 'Kiosco')}`;
      const brandSlug = `brand_${toSlug(p.brand || 'Genérico')}`;

      return {
        id: pId,
        name: p.name,
        category_id: catSlug,
        family_id: famSlug,
        brand_id: brandSlug,
        description: p.desc || p.name,
        in_stock: p.inStock,
        products_codes: [
          { code: codeValue, quantity: 1 }
        ],
        products_taxes: [
          { tax_id: 'tax_iva_21', value: 21 }
        ],
        products_branches: [
          'branch_principal'
        ],
        products_prices: [
          { price_list_id: 'price_list_general', price_sell: (p.orig && p.orig > p.price) ? p.orig : p.price, last_modification: new Date().toISOString().slice(0, 10) }
        ],
        products_price_offers: (p.orig && p.orig > p.price) ? [
          { id: `offer_${pId}`, price_list_id: 'price_list_general', price_sell: p.price, active: true, date_begin: new Date().toISOString().slice(0, 10), last_modification: new Date().toISOString().slice(0, 10) }
        ] : [],
        products_sales_by_qty: []
      };
    });

    const prodRes = await authenticatedFetch('/v1/Products', {
      method: 'POST',
      body: JSON.stringify(starPOSProducts)
    });
    if (!prodRes.ok) {
      const errBody = await prodRes.text().catch(() => '');
      throw new Error(`Fallo al crear catálogo de productos (Status: ${prodRes.status}): ${errBody.slice(0, 300)}`);
    }
    report.steps.products = true;
    report.syncedCount = starPOSProducts.length;
    report.logs.push(`✅ ${starPOSProducts.length} productos con sub-colecciones enviados con éxito.`);

    // ---- STEP 7: PaymentMethods ----
    report.logs.push("7/8 Creando Métodos de Pago (/v1/PaymentMethods)...");
    const paymentMethods: StarPOSPaymentMethod[] = [
      { id: "pay_cash", name: "Efectivo", active: true },
      { id: "pay_transfer", name: "Transferencia Bancaria", active: true },
      { id: "pay_card", name: "Tarjeta de Débito/Crédito", active: true }
    ];
    const payRes = await authenticatedFetch('/v1/PaymentMethods', {
      method: 'POST',
      body: JSON.stringify(paymentMethods)
    });
    if (!payRes.ok) {
      const body = await payRes.text().catch(() => '');
      throw new Error(`Fallo al crear métodos de pago (Status: ${payRes.status}): ${body.slice(0, 200)}`);
    }
    report.steps.paymentMethods = true;
    report.logs.push("✅ Métodos de pago registrados.");

    // ---- STEP 8: Plans ----
    report.logs.push("8/8 Registrando Planes (/v1/Plans)...");
    const plans: StarPOSPlan[] = [
      { id: "plan_one_payment", name: "Pago Único Efectivo/Transferencia", installments: 1, interest: 0 },
      { id: "plan_card_1", name: "Tarjeta 1 Pago sin interés", installments: 1, interest: 0 }
    ];
    const planRes = await authenticatedFetch('/v1/Plans', {
      method: 'POST',
      body: JSON.stringify(plans)
    });
    if (!planRes.ok) {
      const body = await planRes.text().catch(() => '');
      throw new Error(`Fallo al registrar planes (Status: ${planRes.status}): ${body.slice(0, 200)}`);
    }
    report.steps.plans = true;
    report.logs.push("✅ Planes de financiación sincronizados.");

    report.success = true;
    report.logs.push("🎉 ¡La sincronización obligatoria del catálogo en StarPOS se completó con éxito absoluto!");
  } catch (error: unknown) {
    report.success = false;
    const msg = error instanceof Error ? error.message : String(error);
    report.logs.push(`❌ Sincronización fallida: ${msg}`);
    console.error("StarPOS Catalog Sync Error:", error);
  }

  return report;
}

/**
 * 3) LECTURA DE VENTAS (GET) AND CONCURRENT STOCK REDUCTION
 */
export interface SyncSalesResult {
  success: boolean;
  ticketsFetched: number;
  closedCashFetched: number;
  stockReductions: { productName: string; sku: string; qty: number }[];
  logs: string[];
}

export async function getStarPOSTickets(): Promise<StarPOSTicket[]> {
  const response = await authenticatedFetch('/v1/Tickets');
  if (!response.ok) {
    throw new Error(`Failed to fetch tickets: Status ${response.status}`);
  }
  const data = await safeJsonParse<Record<string, unknown>>(response, '/v1/Tickets');
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  return (d?.Tickets || d?.tickets || d?.data || d?.items || []) as StarPOSTicket[];
}

export async function getStarPOSClosedCash(): Promise<StarPOSClosedCash[]> {
  const response = await authenticatedFetch('/v1/ClosedCash');
  if (!response.ok) {
    throw new Error(`Failed to fetch closed cash: Status ${response.status}`);
  }
  const data = await safeJsonParse<Record<string, unknown>>(response, '/v1/ClosedCash');
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  return (d?.ClosedCash || d?.closedCash || d?.data || d?.items || []) as StarPOSClosedCash[];
}

/**
 * Full loop to read tickets from StarPOS, filter out already processed ones,
 * and decrement quantities of corresponding Firestore products.
 */
export async function syncSalesAndDiscountStock(firestoreProducts: Product[]): Promise<SyncSalesResult> {
  const result: SyncSalesResult = {
    success: false,
    ticketsFetched: 0,
    closedCashFetched: 0,
    stockReductions: [],
    logs: []
  };

  try {
    result.logs.push("Iniciando importación de ventas de StarPOS...");

    await authenticateStarPOS();
    result.logs.push("🔑 Conectado con la API de StarPOS.");

    // Fetch Tickets and Closed Cash (tolerante a fallos)
    let tickets: StarPOSTicket[] = [];
    let closedCash: StarPOSClosedCash[] = [];

    result.logs.push("Consultando /v1/Tickets...");
    try {
      tickets = await getStarPOSTickets();
      result.ticketsFetched = tickets.length;
      result.logs.push(`Recuperados ${tickets.length} comprobantes de venta.`);
    } catch (ticketErr: unknown) {
      const tmsg = ticketErr instanceof Error ? ticketErr.message : String(ticketErr);
      result.logs.push(`⚠️ No se pudieron obtener tickets: ${tmsg}. Continuando sin importar ventas.`);
    }

    result.logs.push("Consultando /v1/ClosedCash...");
    try {
      closedCash = await getStarPOSClosedCash();
      result.closedCashFetched = closedCash.length;
      result.logs.push(`Recuperados ${closedCash.length} cierres de caja.`);
    } catch (cashErr: unknown) {
      const cmsg = cashErr instanceof Error ? cashErr.message : String(cashErr);
      result.logs.push(`⚠️ No se pudieron obtener cierres de caja: ${cmsg}. Continuando.`);
    }

    // Fetch synced state from firestore to prevent double discounting
    const adminDb = getAdminDb();
    const stateRef = doc(db, 'settings', 'starpos_sync_state');
    const stateSnap = adminDb
      ? await adminDb.collection('settings').doc('starpos_sync_state').get()
      : await getDoc(stateRef);
    const stateExists = adminDb
      ? (stateSnap as FirebaseFirestore.DocumentSnapshot).exists
      : (stateSnap as import('firebase/firestore').DocumentSnapshot).exists();
    const stateData = stateExists ? (stateSnap.data() as Record<string, unknown> | undefined) : null;
    const processedTicketIds = new Set<string>(
      (stateData?.processedTicketIds as string[]) || []
    );

    result.logs.push(`Se omitirán ${processedTicketIds.size} tickets previamente procesados.`);

    // Read all products from Firestore to keep current context
    const productsSnap = await getDocs(collection(db, 'products'));
    const currentProducts: Product[] = [];
    productsSnap.forEach(docSnap => {
      currentProducts.push({ ...(docSnap.data() as Product) });
    });

    const newProcessedTicketIds: string[] = Array.from(processedTicketIds);
    let stockUpdatedCount = 0;

    for (const ticket of tickets) {
      // Validación defensiva: si el ticket no tiene la forma esperada, se saltea
      if (!ticket || typeof ticket.id === 'undefined' || !Array.isArray(ticket.ticket_lines)) {
        result.logs.push(`   ⚠️ Ticket con forma inválida, se omite.`);
        continue;
      }
      if (processedTicketIds.has(ticket.id)) {
        continue;
      }

      result.logs.push(`Procesando ticket nro: ${ticket.ticket_number} (ID: ${ticket.id}). Total: $${ticket.total}`);

      // Loop over ticket lines
      for (const line of ticket.ticket_lines) {
        if (!line || typeof line.units !== 'number') { continue; }
        // Find product with matching code or ID
        const matchedProduct = currentProducts.find(p =>
          p.id.toString() === line.product_id ||
          p.codigoFacturador === line.product_id ||
          (!!line.product_name && p.name.toLowerCase() === String(line.product_name).toLowerCase())
        );

        if (matchedProduct) {
          const knownStock = (matchedProduct as unknown as Record<string, unknown>).stockQty;
          if (typeof knownStock !== 'number') {
            result.logs.push(`   ⚠️ "${matchedProduct.name}": stock desconocido, no se descuenta (cargá el stock real primero).`);
            continue;
          }

          const nextStock = Math.max(0, knownStock - line.units);
          const nextInStock = nextStock > 0;

          // Update Firestore
          if (adminDb) {
            await adminDb.collection('products').doc(matchedProduct.id.toString()).update({
              stockQty: nextStock,
              inStock: nextInStock,
            });
          } else {
            const productRef = doc(db, 'products', matchedProduct.id.toString());
            await updateDoc(productRef, {
              stockQty: nextStock,
              inStock: nextInStock,
            });
          }
          result.stockReductions.push({
            productName: matchedProduct.name,
            sku: matchedProduct.codigoFacturador || matchedProduct.id.toString(),
            qty: line.units
          });

          stockUpdatedCount++;
          result.logs.push(`   -> Descontado "${matchedProduct.name}" x${line.units}. Nuevo stock: ${nextStock}`);
        } else {
          result.logs.push(`   ⚠️ No se encontró producto en tienda para ID/Nombre: "${line.product_name}" (Línea omitida).`);
        }
      }

      // Add to processed list
      newProcessedTicketIds.push(ticket.id);

      // Save ticket inside a subcollection for audit visibility
      if (adminDb) {
        await adminDb.collection('starpos_imported_sales').doc(ticket.id).set({ ...ticket, importedAt: new Date().toISOString() });
      } else {
        await setDoc(doc(db, 'starpos_imported_sales', ticket.id), { ...ticket, importedAt: new Date().toISOString() });
      }

      // Persistir el estado tras CADA ticket procesado para evitar doble descuento
      try {
        if (adminDb) {
          await adminDb.collection('settings').doc('starpos_sync_state').set({ processedTicketIds: newProcessedTicketIds, lastSyncTime: new Date().toISOString() });
        } else {
          await setDoc(stateRef, { processedTicketIds: newProcessedTicketIds, lastSyncTime: new Date().toISOString() });
        }
      } catch { /* se reintenta en la próxima corrida */ }

      // Mark as transmitted in StarPOS API
      try {
        await authenticatedFetch('/v1/SetTransmitted', {
          method: 'POST',
          body: JSON.stringify({ id: ticket.id, ticket_id: ticket.id, ticketId: ticket.id })
        });
        result.logs.push(`   -> Confirmado y marcado como transmitido en la API de StarPOS.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.logs.push(`   ⚠️ Error al marcar ticket ${ticket.ticket_number} como transmitido: ${msg}`);
      }
    }

    // Save final synchronized list
    if (adminDb) {
      await adminDb.collection('settings').doc('starpos_sync_state').set({ processedTicketIds: newProcessedTicketIds, lastSyncTime: new Date().toISOString() });
    } else {
      await setDoc(stateRef, { processedTicketIds: newProcessedTicketIds, lastSyncTime: new Date().toISOString() });
    }

    result.success = true;
    result.logs.push(`🎉 Importación finalizada. Se procesaron ${newProcessedTicketIds.length - processedTicketIds.size} tickets nuevos y se redujo stock de ${stockUpdatedCount} artículos.`);
  } catch (error: unknown) {
    result.success = false;
    const msg = error instanceof Error ? error.message : String(error);
    result.logs.push(`❌ Error en sincronización de ventas y stock: ${msg}`);
    console.error("syncSalesAndDiscountStock Error:", error);
  }

  return result;
}

export interface SyncStockResult {
  success: boolean;
  syncedCount: number;
  logs: string[];
}

/**
 * 4) SINCRONIZACIÓN DE STOCK VÍA TICKETS
 *
 * NOTA: /v1/CurrentStock NO existe en la API oficial de StarPOS v1.3.
 * El stock se mantiene descontando desde los tickets (syncSalesAndDiscountStock).
 * Esta función se conserva por si el endpoint existe en una versión custom,
 * pero ahora falla con un mensaje claro en vez de explotar.
 */
export async function syncStockFromStarPOS(): Promise<SyncStockResult> {
  const result: SyncStockResult = {
    success: false,
    syncedCount: 0,
    logs: []
  };
  const adminDb = getAdminDb();

  try {
    result.logs.push("Iniciando sincronización directa de stock desde StarPOS...");
    await authenticateStarPOS();
    result.logs.push("🔑 Conexión exitosa con la API de StarPOS.");

    // Intentar /v1/CurrentStock — puede no existir en la API oficial
    result.logs.push("Consultando /v1/CurrentStock...");
    const response = await authenticatedFetch('/v1/CurrentStock');

    if (!response.ok) {
      // Si devuelve 404, el endpoint no existe — sugerir usar sync-sales
      if (response.status === 404) {
        result.logs.push("⚠️ El endpoint /v1/CurrentStock no existe en esta versión de StarPOS.");
        result.logs.push("💡 Usá 'Sincronizar Ventas' en su lugar: importa los tickets y descuenta el stock automáticamente.");
        result.success = false;
        return result;
      }
      throw new Error(`Fallo al consultar stock actual (Status: ${response.status})`);
    }

    const currentStockData = await safeJsonParse<unknown>(response, '/v1/CurrentStock');

    const stockArray = Array.isArray(currentStockData)
      ? currentStockData
      : (currentStockData && typeof currentStockData === 'object' && Array.isArray((currentStockData as Record<string, unknown>).payload))
        ? (currentStockData as Record<string, unknown>).payload as unknown[]
        : null;

    if (!Array.isArray(stockArray)) {
      throw new Error("El endpoint /v1/CurrentStock no retornó un array válido de stock.");
    }

    result.logs.push(`Recuperados ${stockArray.length} registros de stock de StarPOS.`);

    // Read all products from Firestore
    const productsSnap = await getDocs(collection(db, 'products'));
    const currentProducts: Product[] = [];
    productsSnap.forEach(docObj => {
      currentProducts.push({ ...(docObj.data() as Product) });
    });

    let updatedCount = 0;

    for (const stockItem of stockArray) {
      if (!stockItem || typeof stockItem !== 'object') continue;
      const si = stockItem as Record<string, unknown>;
      const product = si.product as Record<string, unknown> | undefined;

      const itemId = product?.id || product?.code || si.product_id || si.id || si.code;
      const qty = typeof si.units === 'number' ? si.units
        : typeof si.qty === 'number' ? si.qty
        : typeof si.stock === 'number' ? si.stock
        : typeof si.stockQty === 'number' ? si.stockQty
        : null;

      if (!itemId || qty === null) continue;

      const matchedProduct = currentProducts.find(p =>
        p.id.toString() === String(itemId) ||
        p.codigoFacturador === String(itemId)
      );

      if (matchedProduct) {
        const nextStock = Math.max(0, Number(qty));
        const nextInStock = nextStock > 0;

        if (adminDb) {
          await adminDb.collection('products').doc(matchedProduct.id.toString()).update({
            stockQty: nextStock,
            inStock: nextInStock,
          });
        } else {
          const productRef = doc(db, 'products', matchedProduct.id.toString());
          await updateDoc(productRef, {
            stockQty: nextStock,
            inStock: nextInStock,
          });
        }
        updatedCount++;
        result.logs.push(`   -> "${matchedProduct.name}" stock actualizado de forma directa a: ${nextStock}`);
      } else {
        result.logs.push(`   ⚠️ Ítem de stock sin producto en la tienda (código ${itemId}): se omite, no se crea automáticamente.`);
      }
    }

    result.syncedCount = updatedCount;
    result.success = true;
    result.logs.push(`🎉 Sincronización de stock finalizada con éxito. Se actualizaron ${updatedCount} artículos.`);
  } catch (error: unknown) {
    result.success = false;
    const msg = error instanceof Error ? error.message : String(error);
    result.logs.push(`❌ Error en sincronización directa de stock: ${msg}`);
    console.error("syncStockFromStarPOS Error:", error);
  }

  return result;
}

/**
 * 5) SINCRONIZACIÓN DE PRECIOS DESDE StarPOS
 *
 * Usa GET /v1/Products para traer todos los productos de StarPOS con sus
 * precios (products_prices[].price_sell) y actualiza los precios en Firestore
 * para los productos que ya existen (match por ID).
 *
 * Solo toca el campo `price` — nunca borra fotos, nombre, categoría ni nada más.
 */
export interface SyncPricesResult {
  success: boolean;
  totalFetched: number;
  updatedCount: number;
  skippedCount: number;
  logs: string[];
}

export async function pullPricesFromStarPOS(): Promise<SyncPricesResult> {
  const result: SyncPricesResult = {
    success: false,
    totalFetched: 0,
    updatedCount: 0,
    skippedCount: 0,
    logs: []
  };

  const adminDb = getAdminDb();

  try {
    result.logs.push("Iniciando sincronización de precios desde StarPOS...");

    await authenticateStarPOS();
    result.logs.push("🔑 Conexión exitosa con la API de StarPOS.");

    // Traer productos de StarPOS (timeout largo: 11k+ productos)
    result.logs.push("Consultando GET /v1/Products...");
    const response = await authenticatedFetch('/v1/Products', {}, 180000);

    if (!response.ok) {
      throw new Error(`Fallo al consultar productos (Status: ${response.status})`);
    }

    const data = await safeJsonParse<unknown>(response, '/v1/Products');

    // La API puede devolver un array directo o un objeto con payload/data/Products
    let starposProducts: StarPOSProduct[];
    if (Array.isArray(data)) {
      starposProducts = data;
    } else if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      const candidates = d.Products || d.products || d.payload || d.data || d.items;
      starposProducts = Array.isArray(candidates) ? candidates as StarPOSProduct[] : [];
    } else {
      starposProducts = [];
    }

    result.logs.push(`Recuperados ${starposProducts.length} productos totales de StarPOS.`);

    if (starposProducts.length === 0) {
      result.logs.push("⚠️ No se recibieron productos. Verificá que GET /v1/Products esté habilitado.");
      return result;
    }

    // Filtrar productos con precio válido (in_stock no se usa en esta instalación de StarPOS)
    const validProducts = starposProducts.filter(sp => sp && sp.name);
    result.logs.push(`📦 ${validProducts.length} productos con nombre (de ${starposProducts.length} totales).`);
    result.totalFetched = validProducts.length;

    // Construir lista StarPOS con nombre y precio.
    // La API de StarPOS no expone barcodes. Se matchea por nombre fuzzy.
    const normalizeName = (n: string) => n.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, '').replace(/\s+/g, ' ').trim();

    const starposItems: { name: string; normName: string; price: number }[] = [];
    for (const sp of validProducts) {
      if (!sp || !sp.name) continue;

      let price: number | null = null;
      if (Array.isArray(sp.products_prices)) {
        for (const pp of sp.products_prices) {
          if (typeof pp.price_sell === 'number' && pp.price_sell > 0) {
            price = pp.price_sell;
            break;
          }
          if (typeof pp.price === 'number' && pp.price > 0 && price === null) {
            price = pp.price;
          }
        }
      }

      // Filtrar precios absurdamente bajos: en Argentina nada cuesta menos de $100 (2024+).
      // StarPOS tiene productos con precios basura ($12, $29) que ensucian el sync.
      if (price !== null && price >= 100) {
        starposItems.push({ name: sp.name, normName: normalizeName(sp.name), price });
      }
    }

    result.logs.push(`${starposItems.length} productos con precio válido en StarPOS.`);
    // DEBUG: mostrar primeros 10 nombres StarPOS normalizados
    result.logs.push(`DEBUG StarPOS nombres (10): ${starposItems.slice(0, 10).map(s => `"${s.normName}"`).join(', ')}`);

    // Mapa de keywords de marca: app name keyword → posibles keywords en StarPOS
    const brandAliases: Record<string, string[]> = {
      'cocacola': ['coca cola', 'coca', 'cocacola'],
      'coca': ['coca cola', 'coca', 'cocacola'],
      'pepsi': ['pepsi'],
      'sprite': ['sprite'],
      'seven': ['seven up', '7up', 'seven'],
      'villavicencio': ['villavicencio', 'villa'],
      'cepita': ['cepita'],
      'monster': ['monster'],
      'gatorade': ['gatorade'],
      'rogel': ['rogel', 'alfajor rogel'],
      'sugus': ['sugus'],
      'mentitas': ['mentitas', 'menta'],
      'gomitas': ['gomitas', 'gomita'],
      'lays': ['lays', 'lay'],
      'cheetos': ['cheetos', 'cheeto'],
      'oreo': ['oreo'],
      'pepito': ['pepito'],
      'criollitas': ['criollitas', 'criollita'],
      'milka': ['milka'],
      'toblerone': ['toblerone'],
      'serenisima': ['serenisima', 'la serenisima'],
      'yogur': ['yogur', 'yogurt'],
      'ser': ['ser'],
      'manteca': ['manteca'],
      'paulina': ['paulina', 'la paulina'],
      'jamon': ['jamon'],
      'salame': ['salame', 'salami'],
      'paleta': ['paleta'],
      'queso': ['queso'],
      'fideos': ['fideos', 'fideo'],
      'matarazzo': ['matarazzo'],
      'arroz': ['arroz'],
      'gallo': ['gallo'],
      'yerba': ['yerba'],
      'taraguii': ['taraguii', 'taragui'],
      'aceite': ['aceite'],
      'natura': ['natura'],
      'pure': ['pure'],
      'tomates': ['tomate', 'tomates'],
      'arcor': ['arcor'],
      'mayonesa': ['mayonesa', 'mayone'],
      'hellmanns': ['hellmanns', 'hellmann'],
      'azucar': ['azucar'],
      'ledesma': ['ledesma'],
      'harina': ['harina'],
      'blancaflor': ['blancaflor'],
      'atun': ['atun'],
      'gomes': ['gomes'],
      'bimbo': ['bimbo'],
      'medialunas': ['medialuna', 'medialunas'],
      'fernet': ['fernet'],
      'branca': ['branca'],
    };

    const generic = new Set(['el','la','los','las','de','del','con','sin','en','por','para','un','una','pack','x','al','natural','clasica','clasico','classic','original','ml','1l','500ml','1kg','500g','200g','100g','250g','90g','80g','60g','117g','135g','190g','400g','520g','900ml','170g']);

    // Pre-computar datos de StarPOS para evitar re-calcular en cada iteración
    const exactMap = new Map<string, { price: number; name: string }>();
    // Índice invertido: palabra → índices de starposItems que la contienen
    const wordIndex = new Map<string, number[]>();
    // Pre-computar spWords para cada item
    const precomputedSpWords: string[][] = [];

    for (let i = 0; i < starposItems.length; i++) {
      const sp = starposItems[i];
      exactMap.set(sp.normName, { price: sp.price, name: sp.name });
      const spWords = sp.normName.split(' ').filter(w => w.length > 1 && !generic.has(w));
      precomputedSpWords.push(spWords);
      // Indexar cada palabra
      for (const w of spWords) {
        if (!wordIndex.has(w)) wordIndex.set(w, []);
        wordIndex.get(w)!.push(i);
      }
    }

    result.logs.push(`Índice construido: ${exactMap.size} nombres, ${wordIndex.size} palabras únicas.`);

    // Función de fuzzy match optimizada
    function findBestMatch(appName: string): { price: number; spName: string } | null {
      const norm = normalizeName(appName);

      // 1. Exact match (O(1) con Map)
      const exact = exactMap.get(norm);
      if (exact) return { price: exact.price, spName: exact.name };

      const appWords = norm.split(' ').filter(w => w.length > 1 && !generic.has(w));
      if (appWords.length === 0) return null;

      // 2. Recopilar candidatos usando el índice invertido (solo items que comparten al menos una palabra)
      const candidateSet = new Set<number>();
      for (const w of appWords) {
        const indices = wordIndex.get(w);
        if (indices) for (const idx of indices) candidateSet.add(idx);
        // También buscar por aliases
        const aliases = brandAliases[w];
        if (aliases) {
          for (const alias of aliases) {
            const aliasWords = alias.split(' ');
            for (const aw of aliasWords) {
              const ai = wordIndex.get(aw);
              if (ai) for (const idx of ai) candidateSet.add(idx);
            }
          }
        }
      }

      // Si no hay candidatos por índice, contención como fallback (más rápido que full scan)
      if (candidateSet.size === 0) {
        // Intentar contención solo si el nombre es corto
        if (norm.length <= 15) {
          const contained = starposItems.find(sp => sp.normName.includes(norm) || norm.includes(sp.normName));
          if (contained) return { price: contained.price, spName: contained.name };
        }
        return null;
      }

      // 3. Scoring solo sobre candidatos
      let bestScore = 0;
      let bestMatch: { price: number; spName: string } | null = null;
      let bestCount = 0;

      for (const idx of candidateSet) {
        const sp = starposItems[idx];
        let score = 0;
        for (const w of appWords) {
          if (sp.normName.includes(w)) {
            score += w.length;
          }
          const aliases = brandAliases[w];
          if (aliases) {
            for (const alias of aliases) {
              if (sp.normName.includes(alias)) { score += alias.length; break; }
            }
          }
        }
        for (const sw of precomputedSpWords[idx]) {
          if (norm.includes(sw)) score += sw.length;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = { price: sp.price, spName: sp.name };
          bestCount = 1;
        } else if (score === bestScore && score > 0) {
          bestCount++;
        }
      }

      // Verificar que el score sea significativo (al menos 50% de las palabras de la app matchean)
      const maxPossible = appWords.reduce((s, w) => s + w.length, 0);
      const minScore = Math.max(6, Math.floor(maxPossible * 0.5));

      // Verificar tamaño: si la app tiene un tamaño, el match debe tenerlo también
      const appSize = norm.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|lts|lt|g|gr|grs|kg)/);
      if (bestMatch && bestScore >= minScore && bestCount === 1) {
        // Verificar que no sea un match espurio: al menos 2 palabras de la app deben estar en el match
        // (Esto evita "Leche La Serenísima" → "DULCE DE LECHE" donde solo "leche" matchea)
        const matchNormFull = normalizeName(bestMatch.spName);
        const appInMatch = appWords.filter(w => matchNormFull.includes(w)).length;
        if (appInMatch < 2) return null;

        if (appSize) {
          const appSizeNorm = appSize[1].replace(',', '.') + appSize[2].replace(/^(lts|lt)$/, 'l').replace(/^(gr|grs)$/, 'g');
          const matchNorm = normalizeName(bestMatch.spName);
          const matchSize = matchNorm.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|lts|lt|g|gr|grs|kg)/);
          if (matchSize) {
            const matchSizeNorm = matchSize[1].replace(',', '.') + matchSize[2].replace(/^(lts|lt)$/, 'l').replace(/^(gr|grs)$/, 'g');
            if (appSizeNorm !== matchSizeNorm) return null; // tamaños no coinciden
          }
        }
        return bestMatch;
      }

      // 4. Desambiguar por tamaño si hay empate
      if (bestCount > 1 && bestScore >= minScore) {
        const sizeMatch = norm.match(/(\d+)\s*(ml|l|g|kg)/);
        if (sizeMatch) {
          const sizeStr = sizeMatch[1] + sizeMatch[2];
          let sizedBest: { price: number; spName: string } | null = null;
          let sizedCount = 0;
          for (const idx of candidateSet) {
            const sp = starposItems[idx];
            let score = 0;
            for (const w of appWords) {
              if (sp.normName.includes(w)) score += w.length;
              const aliases = brandAliases[w];
              if (aliases) {
                for (const alias of aliases) {
                  if (sp.normName.includes(alias)) { score += alias.length; break; }
                }
              }
            }
            for (const sw of precomputedSpWords[idx]) {
              if (norm.includes(sw)) score += sw.length;
            }
            if (score === bestScore && sp.normName.includes(sizeStr)) {
              sizedBest = { price: sp.price, spName: sp.name };
              sizedCount++;
            }
          }
          if (sizedBest && sizedCount === 1) return sizedBest;
        }
      }

      return null;
    }

    // Mapeo manual para productos que el fuzzy matching no puede resolver
    // (nombres demasiado diferentes entre app y StarPOS)
    const manualOverrides: Record<string, string[]> = {
      // app name (lowercase) → posibles nombres StarPOS (lowercase substrings a buscar)
      'coca-cola 500ml': ['coca cola 500', 'coca-cola 500'],
      'monster energy 473ml': ['monster 473', 'monster energy 473'],
      'gatorade naranja 500ml': ['gatorade naranja'],
      'leche la serenísima 1l': ['leche entera serenisima', 'leche serenisima 1l', 'la serenisima leche 1'],
      'palitos de la selva 60g': ['palitos de la selva'],
      'facturas surtidas x4': ['facturas surtidas', 'facturas x4', 'factura surtida'],
      'medialunas x6': ['medialunas x6', 'medialuna x6', 'medialunas x 6'],
      'shampoo elvive 400ml': ['elvive 400', 'shampoo elvive'],
      'jabón dove 90g': ['jabon dove', 'dove 90'],
      'detergente magistral 750ml': ['magistral 750', 'detergente magistral'],
      'lavandina ayudín 1l': ['ayudin 1', 'lavandina ayudin'],
      'vino trapiche malbec 750ml': ['trapiche malbec', 'trapiche 750'],
      'pedigree adultos 1kg': ['pedigree adulto', 'pedigree 1kg', 'pedigree 1 kg'],
      'pizza tia maruca 350g': ['tia maruca', 'pizza tia maruca'],
      'cerveza patagonia amber 410ml': ['patagonia amber', 'patagonia 410'],
      'cerveza corona porrón 330ml': ['corona 330', 'corona porron'],
      'pote helado frigor ddl 1l': ['frigor ddl', 'helado frigor', 'frigor dulce'],
      'campari 750ml': ['campari 750', 'campari'],
      'vodka smirnoff 700ml': ['smirnoff 700', 'vodka smirnoff'],
      // Fixes para matches incorrectos:
      'lays classic 90g': ['lays clasicas 90', 'lays original 90', 'lays papas clasicas'],
      'cheetos flamin hot 80g': ['cheetos flamin', 'cheetos picante'],
      'oreo original 117g': ['oreo original', 'oreo clasica'],
      'criollitas 200g': ['criollitas clasicas 200', 'criollitas original 200'],
      'fideos matarazzo 500g': ['matarazzo spaghetti 500', 'matarazzo fideos 500', 'fideos matarazzo 500'],
      'mayonesa hellmanns 250g': ['hellmanns mayonesa clasica 250', 'hellmanns clasica 250', 'mayonesa hellmanns 250'],
      'jamón cocido x100g': ['jamon cocido 100', 'jamon cocido natural'],
      'salame maggioni x100g': ['maggioni salame', 'salame maggioni'],
      'queso pategrás x100g': ['pategras 100', 'queso pategras'],
      'queso cremoso x100g': ['queso cremoso 100', 'cremoso 100g'],
    };

    // Productos que NUNCA deben matchear por fuzzy (el fuzzy los confunde)
    // Si no hay override manual, devuelve null en vez de un match incorrecto.
    const fuzzyBlocklist = new Set([
      'jamón cocido x100g',
      'salame maggioni x100g',
      'queso pategrás x100g',
      'queso cremoso x100g',
      'leche la serenísima 1l',
    ]);

    // Función de override: busca en starposItems usando los patterns del mapeo manual
    function findManualOverride(appName: string): { price: number; spName: string } | null {
      const key = appName.toLowerCase();
      const patterns = manualOverrides[key];
      if (!patterns) return null;
      for (const pattern of patterns) {
        const found = starposItems.find(sp => sp.normName.includes(pattern));
        if (found) return { price: found.price, spName: found.name };
      }
      return null;
    }

    // Usar DEFAULT_PRODUCTS como referencia en vez de leer toda la colección Firestore
    // (leer 2000+ docs agota la cuota gratuita de Firestore)
    const { DEFAULT_PRODUCTS } = await import('../data');
    const firestoreProducts = DEFAULT_PRODUCTS.map(p => ({
      id: String(p.id),
      name: p.name,
      price: p.price
    }));

    result.logs.push(`${firestoreProducts.length} productos de la app para sincronizar.`);
    result.logs.push(`Nombres (5): ${firestoreProducts.slice(0, 5).map(f => `"${normalizeName(f.name)}"`).join(', ')}`);

    // Actualizar precios matcheando por nombre normalizado
    let updatedCount = 0;
    let skippedCount = 0;
    let noMatchCount = 0;
    let samePrice = 0;
    const noMatchNames: string[] = [];
    const updatePromises: Promise<void>[] = [];

    for (const fp of firestoreProducts) {
      if (!fp.name) {
        noMatchCount++;
        continue;
      }

      // Primero intentar override manual, luego fuzzy (salvo blocklist)
      const manualMatch = findManualOverride(fp.name);
      const match = manualMatch || (fuzzyBlocklist.has(fp.name.toLowerCase()) ? null : findBestMatch(fp.name));
      if (!match) {
        noMatchCount++;
        if (noMatchNames.length < 10) noMatchNames.push(fp.name);
        continue;
      }
      const starposPrice = match.price;

      // Solo actualizar si el precio cambió
      if (Math.abs(starposPrice - fp.price) < 0.01) {
        samePrice++;
        skippedCount++;
        continue;
      }

      // Actualizar SOLO el precio — no tocar nada más (fotos, nombre, categoría, stock)
      // Usar set+merge en vez de update para no fallar si el doc no existe aún
      const updateFn = adminDb
        ? adminDb.collection('products').doc(fp.id).set({ price: starposPrice }, { merge: true })
        : setDoc(doc(db, 'products', fp.id), { price: starposPrice }, { merge: true });
      updatePromises.push(updateFn.then(() => {}));

      updatedCount++;
      if (updatedCount <= 20) {
        result.logs.push(`   -> "${fp.name}" ↔ "${match.spName}": $${fp.price} → $${starposPrice}`);
      }
    }

    if (updatedCount > 20) {
      result.logs.push(`   ... y ${updatedCount - 20} productos más.`);
    }

    // Ejecutar todas las actualizaciones en paralelo (batches de 50)
    for (let i = 0; i < updatePromises.length; i += 50) {
      await Promise.all(updatePromises.slice(i, i + 50));
    }

    result.updatedCount = updatedCount;
    result.skippedCount = skippedCount;
    result.success = true;
    result.logs.push(`📊 Match por nombre: ${samePrice + updatedCount} coincidieron, ${noMatchCount} sin match.`);
    if (noMatchNames.length > 0) {
      result.logs.push(`   Sin match (primeros ${noMatchNames.length}): ${noMatchNames.join(', ')}`);
    }
    result.logs.push(`🎉 Sincronización de precios finalizada. Actualizados: ${updatedCount}, precio igual: ${samePrice}, sin match: ${noMatchCount}.`);
  } catch (error: unknown) {
    result.success = false;
    const msg = error instanceof Error ? error.message : String(error);
    result.logs.push(`❌ Error en sincronización de precios: ${msg}`);
    console.error("pullPricesFromStarPOS Error:", error);
  }

  return result;
}
