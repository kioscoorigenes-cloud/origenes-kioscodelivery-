import { doc, getDoc, getDocs, updateDoc, collection, setDoc } from 'firebase/firestore';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestoreInstance, Firestore as AdminFirestore } from 'firebase-admin/firestore';

let adminDbInstance: AdminFirestore | null = null;
function getAdminDb(): AdminFirestore | null {
  if (adminDbInstance) return adminDbInstance;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    const apps = getAdminApps();
    const app = apps.length > 0 ? apps[0] : initAdminApp({ credential: cert(serviceAccount) });
    adminDbInstance = getAdminFirestoreInstance(app, 'ai-studio-b0577a6e-0f03-46cd-a014-1334f40913ad');
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

  // Timeout: si StarPOS (local/túnel) queda a medias en el handshake, no se
  // cuelga la sincronización indefinidamente.
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

    const data = await response.json();
    if (data && data.payload && data.payload.access_token) {
      cachedToken = data.payload.access_token; // fix: read token from payload.access_token per StarPOS API contract
      // Expire in 1 hour
      tokenExpiry = Date.now() + 3600 * 1000;
      return cachedToken;
    } else {
      throw new Error("Respuesta de autenticación inválida de StarPOS: falta 'payload.access_token'.");
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    const msg = error.name === 'AbortError' ? 'timeout (StarPOS no respondió en 10s)' : error.message;
    console.error(`StarPOS Auth Error at ${authUrl}:`, msg);
    throw new Error(`Error de autenticación StarPOS: ${msg}`);
  }
}

/**
 * Safe fetch helper using cached token
 */
async function authenticatedFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const config = await getStarPOSConfig();
  const url = `${config.serviceUrl.replace(/\/$/, '')}${endpoint}`;

  const doFetch = async (token: string): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
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
  // Si el token venció o es inválido, se refresca UNA vez y se reintenta.
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
    .replace(/[\u0300-\u036f]/g, '')
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
    
    // Ensure we are authenticated
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
    if (!taxesRes.ok) throw new Error(`Fallo al crear impuestos (Status: ${taxesRes.status})`);
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
    if (!priceListRes.ok) throw new Error(`Fallo al crear listas de precios (Status: ${priceListRes.status})`);
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
    if (!catRes.ok) throw new Error(`Fallo al crear categorías (Status: ${catRes.status})`);
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
    if (!famRes.ok) throw new Error(`Fallo al crear familias (Status: ${famRes.status})`);
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
    if (!brandRes.ok) throw new Error(`Fallo al crear marcas (Status: ${brandRes.status})`);
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
        // Precio base = lista. Si hay descuento real (orig > price), el base es
        // orig y la OFERTA activa es el precio promocional (más bajo). Antes la
        // oferta usaba orig (el más alto) y podía anular la promo en el POS.
        products_prices: [
          { price_list_id: 'price_list_general', price_sell: (p.orig && p.orig > p.price) ? p.orig : p.price, last_modification: new Date().toISOString().slice(0,10) }
        ],
        products_price_offers: (p.orig && p.orig > p.price) ? [
          { id: `offer_${pId}`, price_list_id: 'price_list_general', price_sell: p.price, active: true, date_begin: new Date().toISOString().slice(0,10), last_modification: new Date().toISOString().slice(0,10) }
        ] : [],
        products_sales_by_qty: []
      };
    });

    const prodRes = await authenticatedFetch('/v1/Products', {
      method: 'POST',
      body: JSON.stringify(starPOSProducts)
    });
    if (!prodRes.ok) { const errBody = await prodRes.text().catch(() => ''); throw new Error(`Fallo al crear catálogo de productos (Status: ${prodRes.status}): ${errBody.slice(0, 300)}`); }
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
    if (!payRes.ok) throw new Error(`Fallo al crear métodos de pago (Status: ${payRes.status})`);
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
    if (!planRes.ok) throw new Error(`Fallo al registrar planes (Status: ${planRes.status})`);
    report.steps.plans = true;
    report.logs.push("✅ Planes de financiación sincronizados.");

    report.success = true;
    report.logs.push("🎉 ¡La sincronización obligatoria del catálogo en StarPOS se completó con éxito absoluto!");
  } catch (error: any) {
    report.success = false;
    report.logs.push(`❌ Sincronización fallida: ${error.message}`);
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
  const data = await response.json();
    return Array.isArray(data) ? data : (data?.Tickets || data?.tickets || data?.data || data?.items || []);
}

export async function getStarPOSClosedCash(): Promise<StarPOSClosedCash[]> {
  const response = await authenticatedFetch('/v1/ClosedCash');
  if (!response.ok) {
    throw new Error(`Failed to fetch closed cash: Status ${response.status}`);
  }
  const data2 = await response.json();
    return Array.isArray(data2) ? data2 : (data2?.ClosedCash || data2?.closedCash || data2?.data || data2?.items || []);
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
    
    // Authenticate
    await authenticateStarPOS();
    result.logs.push("🔑 Conectado con la API de StarPOS.");

    // Fetch Tickets and Closed Cash
    result.logs.push("Consultando /v1/Tickets...");
    const tickets = await getStarPOSTickets();
    result.ticketsFetched = tickets.length;
    result.logs.push(`Recuperados ${tickets.length} comprobantes de venta.`);

    result.logs.push("Consultando /v1/ClosedCash...");
    const closedCash = await getStarPOSClosedCash();
    result.closedCashFetched = closedCash.length;
    result.logs.push(`Recuperados ${closedCash.length} cierres de caja.`);

    // Fetch synced state from firestore to prevent double discounting
    const adminDb = getAdminDb();
        const stateRef = doc(db, 'settings', 'starpos_sync_state');
            const stateSnap = adminDb ? await adminDb.collection('settings').doc('starpos_sync_state').get() : await getDoc(stateRef);
    const stateExists = adminDb ? (stateSnap as any).exists : (stateSnap as any).exists();
        const stateData: any = stateExists ? stateSnap.data() : null;
            const processedTicketIds = new Set<string>(
                  (stateData && stateData.processedTicketIds) || []
                      );

    result.logs.push(`Se omitirán ${processedTicketIds.size} tickets previamente procesados.`);

    // Read all products from Firestore to keep current context
    const productsSnap = await getDocs(collection(db, 'products'));
    const currentProducts: Product[] = [];
    productsSnap.forEach(doc => {
      currentProducts.push({ ...(doc.data() as Product) });
    });

    const newProcessedTicketIds: string[] = Array.from(processedTicketIds);
    let stockUpdatedCount = 0;

    for (const ticket of tickets) {
      // Validación defensiva: si el ticket no tiene la forma esperada, se saltea
      // y se loguea, en vez de romper todo el loop (que dispararía el reproceso).
      if (!ticket || typeof ticket.id === 'undefined' || !Array.isArray(ticket.ticket_lines)) {
        result.logs.push(`   ⚠️ Ticket con forma inválida, se omite.`);
        continue;
      }
      if (processedTicketIds.has(ticket.id)) {
        continue;
      }

      result.logs.push(`Procesando ticket nro: ${ticket.ticket_number} (ID: ${ticket.id}). Total: $${ticket.total}`);
        const adminDb = getAdminDb();

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
          // Solo se descuenta si conocemos el stock REAL del producto. Antes se
          // inventaba una base de 15 unidades, escribiendo inventario ficticio.
          const knownStock = (matchedProduct as any).stockQty;
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
          // Log the reduction
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
      
      // Persistir el estado tras CADA ticket procesado: si un ticket posterior
      // falla, los ya descontados quedan registrados y no se reprocesan (esto es
      // lo que evita el doble descuento de stock).
      try {
        if (adminDb) {
          await adminDb.collection('settings').doc('starpos_sync_state').set({ processedTicketIds: newProcessedTicketIds, lastSyncTime: new Date().toISOString() });
        } else {
          await setDoc(stateRef, { processedTicketIds: newProcessedTicketIds, lastSyncTime: new Date().toISOString() });
        }
      } catch (e) { /* se reintenta en la próxima corrida */ }

      // Mark as transmitted in StarPOS API
      try {
        await authenticatedFetch('/v1/SetTransmitted', {
          method: 'POST',
          body: JSON.stringify({ id: ticket.id, ticket_id: ticket.id, ticketId: ticket.id })
        });
        result.logs.push(`   -> Confirmado y marcado como transmitido en la API de StarPOS.`);
      } catch (err: any) {
        result.logs.push(`   ⚠️ Error al marcar ticket ${ticket.ticket_number} como transmitido: ${err.message}`);
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
                                      } catch (error: any) {
                                          result.success = false;
                                              result.logs.push(`❌ Error en sincronización de ventas y stock: ${error.message}`);
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
 * 4) SINCRONIZACIÓN DIRECTA DE STOCK (GET /v1/CurrentStock)
 * Maps current stock quantities back into our Firestore database products.
 */
export async function syncStockFromStarPOS(): Promise<SyncStockResult> {
  const result: SyncStockResult = {
    success: false,
    syncedCount: 0,
    logs: []
  };
    const adminDb = getAdminDb();

  try {
    result.logs.push("Iniciando sincronización directa de stock desde StarPOS (/v1/CurrentStock)...");
    await authenticateStarPOS();
    result.logs.push("🔑 Conexión exitosa con la API de StarPOS.");

    result.logs.push("Consultando /v1/CurrentStock...");
    const response = await authenticatedFetch('/v1/CurrentStock');
    if (!response.ok) {
      throw new Error(`Fallo al consultar stock actual (Status: ${response.status})`);
    }

    const currentStockData = await response.json();
    
const stockArray = Array.isArray(currentStockData) ? currentStockData : (currentStockData && Array.isArray(currentStockData.payload) ? currentStockData.payload : null);
if (!Array.isArray(stockArray)) {
throw new Error("El endpoint /v1/CurrentStock no retornó un array válido de stock.");
}

result.logs.push(`Recuperados ${stockArray.length} registros de stock de StarPOS.`);

// Read all products from Firestore to keep current context
const productsSnap = await getDocs(collection(db, 'products'));
const currentProducts: Product[] = [];
productsSnap.forEach(docObj => {
currentProducts.push({ ...(docObj.data() as Product) });
});

let updatedCount = 0;

for (const stockItem of stockArray) {
// Robust mapping of ID or codes (StarPOS wraps product data inside stockItem.product)
const itemId = stockItem.product?.id || stockItem.product?.code || stockItem.product_id || stockItem.id || stockItem.code;
// Robust extraction of stock value (StarPOS uses "units" for CurrentStock)
const qty = typeof stockItem.units !== 'undefined'
? stockItem.units
: (typeof stockItem.qty !== 'undefined'
? stockItem.qty
: (typeof stockItem.stock !== 'undefined'
? stockItem.stock
: (typeof stockItem.stockQty !== 'undefined' ? stockItem.stockQty : null)));

      if (!itemId || qty === null) continue;

      const matchedProduct = currentProducts.find(p => 
        p.id.toString() === itemId.toString() || 
        p.codigoFacturador === itemId.toString()
      );

      if (matchedProduct) {
        const nextStock = Math.max(0, Number(qty));
        const nextInStock = nextStock > 0;

            const productRef = doc(db, 'products', matchedProduct.id.toString());
                if (adminDb) {
                      await adminDb.collection('products').doc(matchedProduct.id.toString()).update({
                              stockQty: nextStock,
                                      inStock: nextInStock,
                                            });
                                                } else {
                                                      await updateDoc(productRef, {
                                                              stockQty: nextStock,
                                                                      inStock: nextInStock,
                                                                            });
                                                                                }
        updatedCount++;
        result.logs.push(`   -> "${matchedProduct.name}" stock actualizado de forma directa a: ${nextStock}`);
      } else {
        // Seguridad: NO se auto-crea el producto. Antes se creaba con precio
        // posible $0 y categoría 'sin-categoria', lo que con un mapeo de IDs
        // incorrecto podía llenar el catálogo de basura vendible. El operador
        // decide qué productos existen; acá solo se avisa.
        result.logs.push(`   ⚠️ Ítem de stock sin producto en la tienda (código ${itemId}): se omite, no se crea automáticamente.`);
      }
    }

    result.syncedCount = updatedCount;
    result.success = true;
    result.logs.push(`🎉 Sincronización de stock finalizada con éxito. Se actualizaron ${updatedCount} artículos.`);
  } catch (error: any) {
    result.success = false;
    result.logs.push(`❌ Error en sincronización directa de stock: ${error.message}`);
    console.error("syncStockFromStarPOS Error:", error);
  }

  return result;
}
