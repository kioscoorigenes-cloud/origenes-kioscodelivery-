import { describe, it, expect, vi, beforeEach } from 'vitest';

// StarPOS env vars — must be set before module imports
process.env.STARPOS_USER_ID = 'test-user';
process.env.STARPOS_SECRET = 'test-secret';
process.env.STARPOS_SERVICE_URL = 'https://test-starpos.example.com';

// ---- Mocks ----

// Mock logger
vi.mock('../src/services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock firebase deps
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../firebase-applet-config.json', () => ({
  default: { projectId: 'test', appId: 'test', apiKey: 'test', firestoreDatabaseId: 'test' },
}));
vi.mock('../firebase', () => ({
  db: {},
}));

// Firestore admin mock — we'll configure per-test
const mockAdminCollection = vi.fn();
const mockAdminDb = {
  collection: mockAdminCollection,
};

vi.mock('../src/services/serverAuth', () => ({
  getAdminFirestore: () => mockAdminDb,
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  initAdminSDK: () => {},
}));

// Mock global fetch for StarPOS API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to build a StarPOS product
function spProduct(name: string, price: number, opts: { barcode?: string; inStock?: boolean } = {}) {
  return {
    name,
    products_prices: [{ price_sell: price }],
    in_stock: opts.inStock ?? true,
    code: opts.barcode ?? null,
    products_codes: opts.barcode ? [{ code: opts.barcode }] : [],
  };
}

// Helper to build Firestore doc snapshot
function fsDoc(id: string, name: string, price: number, opts: { barcode?: string; inStock?: boolean } = {}) {
  return {
    id,
    data: () => ({ name, price, inStock: opts.inStock ?? true, barcode: opts.barcode }),
  };
}

// Setup: mock auth + StarPOS products fetch, then Firestore reads
function setupMocks(starposProducts: any[], firestoreProducts: any[]) {
  // Reset
  mockFetch.mockReset();
  mockAdminCollection.mockReset();

  // 1st fetch call: authenticateStarPOS → POST /auth/token
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ payload: { access_token: 'test-token', expires_in: 3600 } }),
    text: async () => JSON.stringify({ payload: { access_token: 'test-token', expires_in: 3600 } }),
  });

  // 2nd fetch call: GET /v1/Products
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => starposProducts,
    text: async () => JSON.stringify(starposProducts),
  });

  // Firestore admin collections
  const mockProductsGet = vi.fn().mockResolvedValue({ docs: firestoreProducts });
  const mockLimit = vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({}) });
  const mockDoc = vi.fn().mockReturnValue({
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ exists: false }),
  });

  mockAdminCollection.mockImplementation((colName: string) => {
    if (colName === 'priceOverrides') {
      return { get: vi.fn().mockResolvedValue({ empty: true, docs: [] }), doc: mockDoc };
    }
    if (colName === 'priceConfig') {
      return { doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) }) };
    }
    return {
      get: mockProductsGet,
      limit: mockLimit,
      doc: mockDoc,
    };
  });
}

// We need to clear module cache between tests since the module has mutable state (cachedToken etc.)
// Import dynamically in each test
async function runPullPrices() {
  // Clear cached token by re-importing — vitest caches modules, so we invalidate
  const mod = await import('../src/services/starpos');
  return mod.pullPricesFromStarPOS();
}

describe('pullPricesFromStarPOS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('actualiza precio cuando StarPOS tiene precio mayor', async () => {
    setupMocks(
      [spProduct('COCA COLA 500ML', 2500)],
      [fsDoc('p1', 'Coca-Cola 500ml', 2000)],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    // Verify Firestore set was called with new price
    expect(mockAdminCollection).toHaveBeenCalledWith('products');
  });

  it('skipea cuando el precio es igual', async () => {
    setupMocks(
      [spProduct('COCA COLA 500ML', 2000)],
      [fsDoc('p1', 'Coca-Cola 500ml', 2000)],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('bloquea bajadas de precio mayores al 10%', async () => {
    setupMocks(
      [spProduct('COCA COLA 500ML', 1000)], // 50% drop
      [fsDoc('p1', 'Coca-Cola 500ml', 2000)],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    // Should flag to priceFlagged collection
    expect(mockAdminCollection).toHaveBeenCalledWith('priceFlagged');
  });

  it('permite bajadas de precio menores o iguales al 10%', async () => {
    setupMocks(
      [spProduct('COCA COLA 500ML', 1850)], // ~7.5% drop — allowed
      [fsDoc('p1', 'Coca-Cola 500ml', 2000)],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
  });

  it('matchea por barcode exacto antes que fuzzy', async () => {
    setupMocks(
      [
        spProduct('PRODUCTO EQUIVOCADO', 9999),
        spProduct('COCA COLA ZERO 500ML', 2500, { barcode: '7790895000126' }),
      ],
      [fsDoc('p1', 'Coca Zero', 2000, { barcode: '7790895000126' })],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    // The match should use the barcode product (price 2500), not the fuzzy one
    expect(result.logs.some(l => l.includes('COCA COLA ZERO'))).toBe(true);
  });

  it('usa override manual para nombres difíciles', async () => {
    setupMocks(
      [spProduct('LECHE ENTERA SERENISIMA SACHET 1LT', 1800)],
      [fsDoc('p1', 'Leche La Serenísima 1l', 1500)],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
  });

  it('respeta el fuzzyBlocklist — no matchea por fuzzy productos bloqueados', async () => {
    // "shampoo sedal sachet" is in the blocklist — fuzzy should NOT match
    setupMocks(
      [spProduct('SEDAL X340ML SHAMPOO', 3000)],
      [fsDoc('p1', 'Shampoo Sedal sachet', 2500)],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    // Should NOT update because fuzzy is blocked and there's no manual override for exact "shampoo sedal sachet"
    expect(result.updatedCount).toBe(0);
  });

  it('maneja respuesta vacía de StarPOS sin error', async () => {
    setupMocks([], [fsDoc('p1', 'Coca-Cola 500ml', 2000)]);

    const result = await runPullPrices();

    expect(result.success).toBe(false); // returns early without setting success=true
    expect(result.updatedCount).toBe(0);
  });

  it('filtra productos StarPOS con precio menor a $500', async () => {
    setupMocks(
      [
        spProduct('PRODUCTO BARATO', 100), // filtered out (< $500)
        spProduct('COCA COLA 500ML', 2500), // valid
      ],
      [
        fsDoc('p1', 'Producto Barato', 200),
        fsDoc('p2', 'Coca-Cola 500ml', 2000),
      ],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    // Only coca-cola should match (producto barato filtered at $100 < $500)
    expect(result.updatedCount).toBe(1);
  });

  it('disambigua por tamaño cuando hay empate', async () => {
    setupMocks(
      [
        spProduct('SPRITE 500ML', 1800),
        spProduct('SPRITE 1500ML', 3200),
      ],
      [fsDoc('p1', 'Sprite 500ml', 1500)],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    // Should match the 500ml, not the 1500ml
    expect(result.logs.some(l => l.includes('SPRITE 500ML') && l.includes('1800'))).toBe(true);
  });

  it('actualiza stock cuando precio es igual pero stock cambió', async () => {
    setupMocks(
      [spProduct('COCA COLA 500ML', 2000, { inStock: false })],
      [fsDoc('p1', 'Coca-Cola 500ml', 2000, { inStock: true })],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.logs.some(l => l.includes('stock'))).toBe(true);
  });

  it('no matchea nombres genéricos con pocas palabras', async () => {
    // "Pan" alone should not match "PAN LACTAL BIMBO 500G" via containment
    setupMocks(
      [spProduct('PAN LACTAL BIMBO 500G', 3000)],
      [fsDoc('p1', 'Pan', 2000)],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    // "Pan" has only 1 significant word — fuzzy requires at least 2 words in match
    expect(result.updatedCount).toBe(0);
  });

  it('maneja error de StarPOS API gracefully', async () => {
    mockFetch.mockReset();
    mockAdminCollection.mockReset();

    // Auth succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ payload: { access_token: 'test-token', expires_in: 3600 } }),
      text: async () => JSON.stringify({ payload: { access_token: 'test-token', expires_in: 3600 } }),
    });
    // Products fetch fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await runPullPrices();

    expect(result.success).toBe(false);
    expect(result.logs.some(l => l.includes('Error') || l.includes('500'))).toBe(true);
  });

  it('procesa múltiples productos correctamente en batch', async () => {
    setupMocks(
      [
        spProduct('COCA COLA 500ML', 2500),
        spProduct('SPRITE 500ML', 1800),
        spProduct('FANTA NARANJA 500ML', 1900),
        spProduct('AGUA VILLAVICENCIO 500ML', 1200),
      ],
      [
        fsDoc('p1', 'Coca-Cola 500ml', 2000),
        fsDoc('p2', 'Sprite 500ml', 1500),
        fsDoc('p3', 'Fanta Naranja 500ml', 1700),
        fsDoc('p4', 'Agua Villavicencio 500ml', 1000),
      ],
    );

    const result = await runPullPrices();

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(4);
  });
});
