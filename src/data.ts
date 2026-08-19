import { Product, Category, Combo, Promo } from "./types";

export const CATS: Category[] = [
  { id: "kiosco", name: "🍫 Kiosco" },
  { id: "almacen", name: "🥫 Almacén" },
  { id: "fiambres", name: "🧀 Fiambres" },
  { id: "mascotas", name: "🐶 Perros" },
  { id: "limpieza", name: "🧹 Limpieza" },
  { id: "perfumeria", name: "🧴 Perfumería" },
  { id: "bebidas_blancas", name: "🥃 Bebidas Blancas" },
  { id: "gaseosas", name: "🥤 Gaseosas" },
  { id: "aperitivos", name: "🍹 Aperitivos" },
  { id: "aguas_saborizadas", name: "🍋 Aguas Saborizadas" },
  { id: "aguas", name: "💧 Aguas" },
  { id: "fernet", name: "🖤 Fernet" },
  { id: "vinos", name: "🍷 Vinos" },
  { id: "helados", name: "🍦 Helados" },
  { id: "snacks", name: "🍟 Snacks" },
  { id: "congelados", name: "❄️ Congelados" },
  { id: "lacteos", name: "🥛 Lácteos" },
  { id: "panificados", name: "🍞 Panificados" },
  { id: "energizantes", name: "⚡ Energizantes" },
  { id: "cervezas", name: "🍺 Cervezas" }, { id: "cigarrillos", name: "🚬 Cigarrillos" },
];

export const CAT_ABBR: Record<string, string> = {
  kiosco: "KIO",
  almacen: "ALM",
  fiambres: "FIA",
  mascotas: "PER",
  limpieza: "LIM",
  perfumeria: "PER",
  bebidas_blancas: "BLA",
  gaseosas: "GAS",
  aperitivos: "APE",
  aguas_saborizadas: "SAB",
  aguas: "AGR",
  fernet: "FER",
  vinos: "VIN",
  helados: "HEL",
  snacks: "SNK",
  congelados: "CGD",
  lacteos: "LAC",
  panificados: "PAN",
  energizantes: "ENE",
  cervezas: "CER", cigarrillos: "CIG",
};

export const CAT_BG: Record<string, string> = {
  kiosco: "#FEF3C7",
  almacen: "#FFFBEB",
  fiambres: "#FEE2E2",
  mascotas: "#FFE4E6",
  limpieza: "#ECFDF5",
  perfumeria: "#F3E8FF",
  bebidas_blancas: "#F1F5F9",
  gaseosas: "#DBEAFE",
  aperitivos: "#FAE8FF",
  aguas_saborizadas: "#E0F2FE",
  aguas: "#E0F7FA",
  fernet: "#ECEFF1",
  vinos: "#FCE7F3",
  helados: "#FFF1F2",
  snacks: "#FEF9C3",
  congelados: "#EFF6FF",
  lacteos: "#DCFCE7",
  panificados: "#FEF9C4",
  energizantes: "#FFEDD5",
  cervezas: "#FEF3C7", cigarrillos: "#F5F5F4",
};

export const CATEGORY_RULES: [string, RegExp][] = [ ['cigarrillos', /TABACO|CAMEL|LUCKY|MARLBORO|PHILIP|CHESTERFIELD|VIRGINIA|PALL MALL|RASTA|PAPELILLO|ENCENDEDOR|BIC MAX/], ['cervezas', /CERVEZA|BEAGLE|BUDWEISER|STELLA ARTOIS|HEINEKEN|QUILMES|BRAHMA|ANDES|CORONA|PATAGONIA|SCHNEIDER|IMPERIAL|MILLER|WARSTEINER|ISENBECK|SALTA COOL|KUNSTMANN/], ['fernet', /FERNET|BRANCA|1882/], ['vinos', /MALBEC|CABERNET|SANTA JULIA|TRAPICHE|NORTON|RUTINI|TERRAZAS|VINO TINTO|VINO BLANCO|BLANCO DULCE|TINTO|ROSADO|FINCA|BODEGA|SUTER|\bTORO\b|LOSADA|PINOT/], ['aperitivos', /APERITIVO|GANCIA|CINZANO|MARTINI|CAMPARI|PETACA|BLENDER/], ['bebidas_blancas', /WHISKY|VODKA|\bGIN\b|\bRON\b|TEQUILA|SMIRNOFF|JOHNNIE|BALLANTINE|ABSOLUT|LICOR|FERREIRA/], ['aguas_saborizadas', /LEVITE|AQUARIUS|H2OH|CIEL|SALDAN|SODA/], ['aguas', /VILLA DEL SUR|VILLAVICENCIO|BIDON|\bAGUA\b/], ['gaseosas', /COCA|PEPSI|SPRITE|FANTA|MIRINDA|MANAOS|SEVEN ?UP|7UP|TONICA|COLA\b/], ['energizantes', /SPEED|RED BULL|MONSTER|FLAPPER|VIVE100/], ['lacteos', /LECHE|YOGUR|CASANCREM|CREMA CULINARIA|CREMA ARMONIA|MANTECA|VACALIN|LA SERENISIMA|SANCOR|DANONE|ILOLAY|QUESO CREMA/], ['fiambres', /JAMON|SALAME|MORTADELA|BONDIOLA|PALETA|FIAMBRE|QUESO(?! CREMA)/], ['helados', /HELADO|GELATO|COFLER|FRIGOR/], ['snacks', /PAPAS |DORITOS|PRINGLES|LAYS|TAKIS|KRACHITOS|MANI |PALITOS|TWISTOS|SERRANITAS|SALADIX|NACHO|SNACK/], ['panificados', /\bPAN\b|PAN HAMBURG|FACTURA|BIMBO|TOSTADA|GALLETA|OBLEA|BIZCOCHO/], ['congelados', /MEDALLONES|HAMBURGUESA|NUGGETS|CONGELADO|SWIFT|\bPATY\b|RELLENO/], ['mascotas', /\bPERROS?\b(?! CALLEJERO)|\bGATOS?\b|DOG CHOW|PEDIGREE|WHISKAS|CAT CHOW|VITAL CAN|PURINA/], ['limpieza', /LAVANDINA|JABON EN POLVO|DETERGENTE|SUAVIZANTE|LIMPIADOR|ECOLAVADO|AYUDIN|MOGUL/], ['perfumeria', /SHAMPOO|ACOND\.|ACONDICIONADOR|DESODORANTE|PLUSBELLE|SEDAL|DOVE|\bCOLONIA\b|PASTA DENTAL|JABON DE TOCADOR/], ['kiosco', /ALFAJOR|CHOCOLATE|CHICLE|CARAMELO|GOLOSINA|TURRON|BON O BON|MILKA|OREO|CADBURY|BELDENT|HALLS|NESQUIK|ARCOR|COFLER|TIC TAC|EXQUISITA/] ]; export function inferCategory(p: Product): string { const validIds = CATS.map(c => c.id).concat(['cigarrillos']); if (p.cat && validIds.includes(p.cat)) return p.cat; const n = (p.name || '').toUpperCase(); const OV: [RegExp,string][] = [[/ATUN|SARDINA|CABALLA|PALMITO/,'almacen'],[/VACALIN/,'lacteos'],[/GATORADE/,'gaseosas'],[/\bCIF\b/,'limpieza'],[/PERRO CALLEJERO/,'vinos']]; for (const [ovre, ovcat] of OV) { if (ovre.test(n)) return ovcat; } for (const [cat, re] of CATEGORY_RULES) { if (re.test(n)) return cat; } return 'almacen'; } export const DEFAULT_PRODUCTS: Product[] = [
  // GASEOSAS
  {
    id: 1,
    cat: "gaseosas",
    name: "Coca-Cola 500ml",
    brand: "Coca-Cola",
    price: 1200,
    orig: null,
    desc: "Gaseosa cola clásica refrescante.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 2,
    cat: "gaseosas",
    name: "Pepsi 1.5L",
    brand: "Pepsi",
    price: 1650,
    orig: 1950,
    desc: "Gaseosa cola familiar.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 3,
    cat: "gaseosas",
    name: "Sprite 500ml",
    brand: "Sprite",
    price: 1100,
    orig: null,
    desc: "Gaseosa limón-lima sin cafeína.",
    featured: false,
    neww: false,
    inStock: true,
    image: "",
  },
  {
    id: 7,
    cat: "gaseosas",
    name: "Seven Up 500ml",
    brand: "7Up",
    price: 1050,
    orig: null,
    desc: "Gaseosa sabor lima-limón.",
    featured: false,
    neww: false,
    inStock: true,
    image: "",
  },

  // AGUAS
  {
    id: 4,
    cat: "aguas",
    name: "Agua Villavicencio 1.5L",
    brand: "Villavicencio",
    price: 900,
    orig: null,
    desc: "Agua mineral natural pura sin gas.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1608885898957-a599fb15ec35?q=80&w=600&auto=format&fit=crop",
  },

  // AGUAS SABORIZADAS
  {
    id: 5,
    cat: "aguas_saborizadas",
    name: "Jugo Cepita Naranja 1L",
    brand: "Cepita",
    price: 1400,
    orig: 1650,
    desc: "Jugo de naranja delicioso enriquecido en vitaminas.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1613478223719-2ab802602423?q=80&w=600&auto=format&fit=crop",
  },

  // ENERGIZANTES
  {
    id: 6,
    cat: "energizantes",
    name: "Monster Energy 473ml",
    brand: "Monster",
    price: 2100,
    orig: null,
    desc: "Bebida energizante para tu rutina.",
    featured: false,
    neww: true,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1622543953490-0b7ced3d6ac3?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 8,
    cat: "energizantes",
    name: "Gatorade Naranja 500ml",
    brand: "Gatorade",
    price: 1800,
    orig: null,
    desc: "Bebida deportiva rehidratante con electrolitos.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1551326844-301bd9b21f92?q=80&w=600&auto=format&fit=crop",
  },

  // KIOSCO
  {
    id: 9,
    cat: "kiosco",
    name: "Alfajor Rogel Triple",
    brand: "Jorgito",
    price: 850,
    orig: null,
    desc: "Alfajor triple de dulce de leche con merengue.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1508737804141-4c3b688e25be?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 10,
    cat: "kiosco",
    name: "Sugus Surtido 50g",
    brand: "Nestlé",
    price: 550,
    orig: null,
    desc: "Caramelos masticables frutales.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1581798459219-318e76aaee7b?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 11,
    cat: "kiosco",
    name: "Mentitas Peppermint",
    brand: "Arcor",
    price: 320,
    orig: null,
    desc: "Pastillas de menta refrescantes.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1626202378290-7c2770d76db7?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 12,
    cat: "kiosco",
    name: "Gomitas Fantasia 50g",
    brand: "Arcor",
    price: 480,
    orig: null,
    desc: "Gomitas frutales surtidas divertidas.",
    featured: false,
    neww: true,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1582043211593-3f13903107c5?q=80&w=600&auto=format&fit=crop",
  },

  // SNACKS
  {
    id: 13,
    cat: "snacks",
    name: "Lays Classic 90g",
    brand: "Lays",
    price: 1100,
    orig: null,
    desc: "Papas fritas crocantes clásicas.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 14,
    cat: "snacks",
    name: "Cheetos Flamin Hot 80g",
    brand: "Cheetos",
    price: 1200,
    orig: null,
    desc: "Snack de maíz con sabor picante.",
    featured: false,
    neww: true,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1599490656913-7e8c140cd0ac?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 15,
    cat: "snacks",
    name: "Palitos de la Selva 60g",
    brand: "Terrabusi",
    price: 900,
    orig: null,
    desc: "Palitos crocantes sabor queso.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1534080564583-6be75777b70a?q=80&w=600&auto=format&fit=crop",
  },

  // ALMACEN / GALLETITAS
  {
    id: 16,
    cat: "almacen",
    name: "Oreo Original 117g",
    brand: "Nabisco",
    price: 1350,
    orig: 1550,
    desc: "Galletitas rellenas de crema dulce clásicas.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1558961309-dbd715c1390f?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 17,
    cat: "almacen",
    name: "Pepito Chocolate 100g",
    brand: "Bagley",
    price: 980,
    orig: null,
    desc: "Galletitas rellenas con chispas de chocolate.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 18,
    cat: "almacen",
    name: "Criollitas 200g",
    brand: "Bagley",
    price: 1100,
    orig: null,
    desc: "Galletitas de agua clásicas saladitas.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 20,
    cat: "kiosco",
    name: "Milka Oreo 135g",
    brand: "Milka",
    price: 2200,
    orig: 2500,
    desc: "Chocolate con trozos de galletitas Oreo.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1511381939415-e44015466834?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 21,
    cat: "kiosco",
    name: "Toblerone 100g",
    brand: "Toblerone",
    price: 2800,
    orig: null,
    desc: "Chocolate suizo de miel y almendras.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1549007994-cb92ca85edf6?q=80&w=600&auto=format&fit=crop",
  },

  // LACTEOS
  {
    id: 23,
    cat: "lacteos",
    name: "Leche La Serenísima 1L",
    brand: "La Serenísima",
    price: 1350,
    orig: null,
    desc: "Leche entera de primera calidad.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1563636619-e9143da7973b?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 24,
    cat: "lacteos",
    name: "Yogur Ser Frutilla 190g",
    brand: "Ser",
    price: 750,
    orig: null,
    desc: "Yogur bebible descremado sabor frutilla.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 25,
    cat: "lacteos",
    name: "Manteca La Paulina 200g",
    brand: "La Paulina",
    price: 1600,
    orig: null,
    desc: "Manteca de leche fresca.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?q=80&w=600&auto=format&fit=crop",
  },

  // FIAMBRES
  {
    id: 26,
    cat: "fiambres",
    name: "Jamón Cocido x100g",
    brand: "Fargo",
    price: 1800,
    orig: null,
    desc: "Jamón cocido tierno rebanado al dente.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1524438418049-ab2acb7aa48f?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 27,
    cat: "fiambres",
    name: "Salame Maggioni x100g",
    brand: "Maggioni",
    price: 2200,
    orig: null,
    desc: "Salame de campo artesanal.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1623945353139-4467c6999be3?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 28,
    cat: "fiambres",
    name: "Paleta Ahumada x100g",
    brand: "Paladini",
    price: 1650,
    orig: null,
    desc: "Paleta ahumada al vacío.",
    featured: false,
    neww: true,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=600&auto=format&fit=crop",
  },

  // ALMACEN / PANTRY & MORE PRODUCTS
  {
    id: 30,
    cat: "almacen",
    name: "Queso Cremoso x100g",
    brand: "Milkaut",
    price: 2100,
    orig: null,
    desc: "Queso suave cremoso ideal para derretir.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1589881133595-a3c085cb1493?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 31,
    cat: "almacen",
    name: "Queso Pategrás x100g",
    brand: "La Paulina",
    price: 2500,
    orig: null,
    desc: "Queso semiduro con exquisito sabor suave.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1552763405-1749be571d4b?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 43,
    cat: "almacen",
    name: "Fideos Matarazzo 500g",
    brand: "Matarazzo",
    price: 900,
    orig: null,
    desc: "Fideos spaghetti de sémola de trigo candeal.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1551462147-37885abb36f7?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 44,
    cat: "almacen",
    name: "Arroz Gallo de Oro 1kg",
    brand: "Gallo de Oro",
    price: 1500,
    orig: null,
    desc: "Arroz doble seleccionado largo fino.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1586201375761-83865001e31c?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 450,
    cat: "almacen",
    name: "Yerba Mate Taragüi 500g",
    brand: "Taragüi",
    price: 1950,
    orig: null,
    desc: "Yerba mate clásica argentina con palo de gran sabor.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 451,
    cat: "almacen",
    name: "Aceite de Girasol Natura 900ml",
    brand: "Natura",
    price: 1800,
    orig: 2100,
    desc: "Aceite de girasol refinado ideal para tus comidas.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 452,
    cat: "almacen",
    name: "Puré de Tomates Arcor 520g",
    brand: "Arcor",
    price: 720,
    orig: null,
    desc: "Puré de tomates seleccionado, libre de gluten.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1551462147-37885abb36f7?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 453,
    cat: "almacen",
    name: "Mayonesa Hellmanns 250g",
    brand: "Hellmann's",
    price: 950,
    orig: null,
    desc: "Mayonesa clásica cremosa e irresistible.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 454,
    cat: "almacen",
    name: "Azúcar Ledesma Clásica 1kg",
    brand: "Ledesma",
    price: 980,
    orig: null,
    desc: "Azúcar común tipo A de excelente pureza.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 455,
    cat: "almacen",
    name: "Harina de Trigo Blancaflor 1kg",
    brand: "Blancaflor",
    price: 1250,
    orig: null,
    desc: "Harina leudante ideal para bizcochuelos y repostería.",
    featured: false,
    neww: true,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 456,
    cat: "almacen",
    name: "Atún al Natural Gomes da Costa 170g",
    brand: "Gomes da Costa",
    price: 1750,
    orig: 1950,
    desc: "Lomitos de atún al natural de calidad premium.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=600&auto=format&fit=crop",
  },

  // PANIFICADOS
  {
    id: 33,
    cat: "panificados",
    name: "Pan Lactal Bimbo 400g",
    brand: "Bimbo",
    price: 1450,
    orig: null,
    desc: "Pan de molde suave y esponjoso.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 34,
    cat: "panificados",
    name: "Medialunas x6",
    brand: "Artesanal",
    price: 1800,
    orig: null,
    desc: "Medialunas de manteca recién hechas.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 35,
    cat: "panificados",
    name: "Facturas Surtidas x4",
    brand: "Artesanal",
    price: 2000,
    orig: null,
    desc: "Facturas con dulce de leche y crema pastelera.",
    featured: false,
    neww: true,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1608686207856-001b95cf60ca?q=80&w=600&auto=format&fit=crop",
  },

  // PERFUMERIA
  {
    id: 36,
    cat: "perfumeria",
    name: "Shampoo Elvive 400ml",
    brand: "L'Oréal",
    price: 3800,
    orig: 4200,
    desc: "Shampoo reparador capilar profundo.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 37,
    cat: "perfumeria",
    name: "Jabón Dove 90g",
    brand: "Dove",
    price: 1200,
    orig: null,
    desc: "Jabón con un cuarto de crema humectante.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1607006342411-1a90e3d2ff0d?q=80&w=600&auto=format&fit=crop",
  },

  // LIMPIEZA
  {
    id: 40,
    cat: "limpieza",
    name: "Detergente Magistral 750ml",
    brand: "Magistral",
    price: 2100,
    orig: null,
    desc: "Detergente líquido concentrado ultra rendidor.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 41,
    cat: "limpieza",
    name: "Lavandina Ayudín 1L",
    brand: "Ayudín",
    price: 1400,
    orig: null,
    desc: "Lavandina desinfectante concentrada.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop",
  },

  // VINOS
  {
    id: 50,
    cat: "vinos",
    name: "Vino Trapiche Malbec 750ml",
    brand: "Trapiche",
    price: 4500,
    orig: null,
    desc: "Exquisito vino tinto mendocino.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=600&auto=format&fit=crop",
  },

  // FERNET
  {
    id: 52,
    cat: "fernet",
    name: "Fernet Branca 750ml",
    brand: "Branca",
    price: 9800,
    orig: null,
    desc: "El aperitivo de hierbas clásico más elegido.",
    featured: true,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=600&auto=format&fit=crop",
  },

  // ALIMENTOS PARA PERROS (MASCOTAS)
  {
    id: 53,
    cat: "mascotas",
    name: "Pedigree Adultos 1kg",
    brand: "Pedigree",
    price: 3200,
    orig: 3600,
    desc: "Alimento de nutrición completa para perros.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?q=80&w=600&auto=format&fit=crop",
  },

  // CONGELADOS
  {
    id: 55,
    cat: "congelados",
    name: "Pizza Tia Maruca 350g",
    brand: "Tia Maruca",
    price: 3800,
    orig: null,
    desc: "Pizza congelada lista para hornear.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=600&auto=format&fit=crop",
  },

  // CERVEZAS
  {
    id: 56,
    cat: "cervezas",
    name: "Cerveza Patagonia Amber 410ml",
    brand: "Patagonia",
    price: 1600,
    orig: 1900,
    desc: "Cerveza patagónica lager amber de gran sabor.",
    featured: true,
    neww: true,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: 57,
    cat: "cervezas",
    name: "Cerveza Corona Porrón 330ml",
    brand: "Corona",
    price: 1400,
    orig: null,
    desc: "Cerveza mexicana ideal con una rodaja de limón.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1608270176050-ca2ca7db75fa?q=80&w=600&auto=format&fit=crop",
  },

  // HELADOS
  {
    id: 58,
    cat: "helados",
    name: "Pote Helado Frigor DDL 1L",
    brand: "Frigor",
    price: 4200,
    orig: 4800,
    desc: "Balde de helado cremoso sabor dulce de leche tentador.",
    featured: false,
    neww: true,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1560008511-11c63416e52d?q=80&w=600&auto=format&fit=crop",
  },

  // APERITIVOS
  {
    id: 59,
    cat: "aperitivos",
    name: "Campari 750ml",
    brand: "Campari",
    price: 5400,
    orig: null,
    desc: "Aperitivo italiano ideal para combinar con jugo o tónica.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1574085733277-851d9d856a3a?q=80&w=600&auto=format&fit=crop",
  },

  // BEBIDAS BLANCAS
  {
    id: 60,
    cat: "bebidas_blancas",
    name: "Vodka Smirnoff 700ml",
    brand: "Smirnoff",
    price: 3800,
    orig: null,
    desc: "Vodka neutro de triple destilación clásico mundial.",
    featured: false,
    neww: false,
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=600&auto=format&fit=crop",
  },
];

export const COMBOS: Combo[] = [
    // Sin combos configurados por el momento. Agregá objetos Combo acá cuando estén listas las promociones reales.
    ];

export const PROMOS_LIST: Promo[] = [
    // Sin ofertas activas por el momento. Agregá objetos Promo acá cuando haya promociones reales para publicar.
    ];

export const getFallbackStoreImage = (
  name: string,
  brand: string = "",
  cat: string = "",
): string => {
  const norm = `${name} ${brand} ${cat}`.toLowerCase();

  // Specific major high-fidelity online asset matches (will try to resolve first)
  if (norm.includes("pepsi")) {
    return "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?q=80&w=600&auto=format&fit=crop"; // Pepsi
  }
  if (norm.includes("fanta")) {
    return "https://images.unsplash.com/photo-1624552184280-9e9631bbeee9?q=80&w=600&auto=format&fit=crop"; // Orange Soda/Fanta
  }
  if (norm.includes("cola") || norm.includes("coke")) {
    return "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=600&auto=format&fit=crop"; // Cola / Coca-Cola
  }
  // GUARANTEED LOCAL PLACEHOLDER generator as a data-URI SVG:
  let icon = "📦";
  let bgGradient = ["#F8FAFC", "#E2E8F0"]; // Default slate
  let iconBg = "#E2E8F0";

  if (
    norm.includes("cerveza") ||
    norm.includes("beer") ||
    norm.includes("vino") ||
    norm.includes("wine") ||
    norm.includes("fernet") ||
    norm.includes("branca") ||
    norm.includes("alcohol") ||
    norm.includes("aperitivo")
  ) {
    icon = "🍺";
    bgGradient = ["#FEF3C7", "#FEF3C7"];
    iconBg = "#FDE68A";
  } else if (
    norm.includes("agua") ||
    norm.includes("villavicencio") ||
    norm.includes("smartwater") ||
    norm.includes("kin")
  ) {
    icon = "💧";
    bgGradient = ["#ECFEFF", "#CFFAFE"];
    iconBg = "#9BF6FF";
  } else if (
    norm.includes("jugo") ||
    norm.includes("cepita") ||
    norm.includes("juice") ||
    norm.includes("baggio")
  ) {
    icon = "🍊";
    bgGradient = ["#FFF7ED", "#FFEDD5"];
    iconBg = "#FED7AA";
  } else if (
    norm.includes("monster") ||
    norm.includes("gatorade") ||
    norm.includes("powerade") ||
    norm.includes("energizante") ||
    norm.includes("energy")
  ) {
    icon = "⚡";
    bgGradient = ["#FAF5FF", "#F3E8FF"];
    iconBg = "#E9D5FF";
  } else if (
    norm.includes("alfajor") ||
    norm.includes("dulce") ||
    norm.includes("jorgito") ||
    norm.includes("caramelo") ||
    norm.includes("sugus") ||
    norm.includes("mentita") ||
    norm.includes("gomita") ||
    norm.includes("turron")
  ) {
    icon = "🍬";
    bgGradient = ["#FDF2F8", "#FCE7F3"];
    iconBg = "#FBCFE8";
  } else if (
    norm.includes("lays") ||
    norm.includes("papas") ||
    norm.includes("chips") ||
    norm.includes("snack") ||
    norm.includes("cheetos") ||
    norm.includes("palitos") ||
    norm.includes("doritos") ||
    norm.includes("mani")
  ) {
    icon = "🍿";
    bgGradient = ["#FEFCE8", "#FEF9C3"];
    iconBg = "#FEF08A";
  } else if (
    norm.includes("sprite") ||
    norm.includes("seven up") ||
    norm.includes("7up") ||
    norm.includes("lima-limón") ||
    norm.includes("lima limon")
  ) {
    icon = "🥤";
    bgGradient = ["#ECFDF5", "#D1FAE5"]; // Minty fresh green gradient
    iconBg = "#A7F3D0";
  } else if (
    norm.includes("oreo") ||
    norm.includes("pepito") ||
    norm.includes("cookies") ||
    norm.includes("galletitas") ||
    norm.includes("galleta") ||
    norm.includes("toddy")
  ) {
    icon = "🍪";
    bgGradient = ["#FFFBEB", "#FEF3C7"];
    iconBg = "#FDE68A";
  } else if (
    norm.includes("chocolate") ||
    norm.includes("milka") ||
    norm.includes("toblerone") ||
    norm.includes("cofler") ||
    norm.includes("bon o bon") ||
    norm.includes("kinder")
  ) {
    icon = "🍫";
    bgGradient = ["#F5F5F4", "#E7E5E4"];
    iconBg = "#D6D3D1";
  } else if (
    norm.includes("leche") ||
    norm.includes("lacteo") ||
    norm.includes("yogur") ||
    norm.includes("manteca") ||
    norm.includes("crema") ||
    norm.includes("sancor")
  ) {
    icon = "🥛";
    bgGradient = ["#F0FDFA", "#CCFBF1"];
    iconBg = "#99F6E4";
  } else if (
    norm.includes("jamon") ||
    norm.includes("salame") ||
    norm.includes("paleta") ||
    norm.includes("fiambre")
  ) {
    icon = "🥩";
    bgGradient = ["#FFF1F2", "#FFE4E6"];
    iconBg = "#FECDD3";
  } else if (
    norm.includes("queso") ||
    norm.includes("cremoso") ||
    norm.includes("pategras") ||
    norm.includes("rallado")
  ) {
    icon = "🧀";
    bgGradient = ["#FEF3C7", "#FEF3C7"];
    iconBg = "#FDE68A";
  } else if (
    norm.includes("pan") ||
    norm.includes("medialuna") ||
    norm.includes("factura") ||
    norm.includes("panaderia") ||
    norm.includes("lactal")
  ) {
    icon = "🍞";
    bgGradient = ["#FFFBEB", "#FEF3C7"];
    iconBg = "#FDE68A";
  } else if (
    norm.includes("detergente") ||
    norm.includes("lavandina") ||
    norm.includes("limpieza") ||
    norm.includes("cif") ||
    norm.includes("ala")
  ) {
    icon = "🧹";
    bgGradient = ["#F0FDF4", "#DCFCE7"];
    iconBg = "#BBF7D0";
  } else if (
    norm.includes("arroz") ||
    norm.includes("fideo") ||
    norm.includes("pasta") ||
    norm.includes("aceite") ||
    norm.includes("harina")
  ) {
    icon = "🥫";
    bgGradient = ["#FAF5FF", "#F3E8FF"];
    iconBg = "#E9D5FF";
  } else if (
    norm.includes("perro") ||
    norm.includes("perros") ||
    norm.includes("mascota") ||
    norm.includes("pedigree") ||
    norm.includes("dog")
  ) {
    icon = "🐶";
    bgGradient = ["#F5F5F4", "#E7E5E4"];
    iconBg = "#D6D3D1";
  }

  // Fallback category mapping for icon & color
  if (icon === "📦" && cat) {
    const cleanCat = cat.toLowerCase();
    if (cleanCat.includes("gaseosas") || cleanCat.includes("bebidas")) {
      icon = "🥤";
      bgGradient = ["#EFF6FF", "#DBEAFE"];
      iconBg = "#BFDBFE";
    } else if (cleanCat.includes("kiosco") || cleanCat.includes("golosinas")) {
      icon = "🍬";
      bgGradient = ["#FDF2F8", "#FCE7F3"];
      iconBg = "#FBCFE8";
    } else if (cleanCat.includes("snacks")) {
      icon = "🍿";
      bgGradient = ["#FEFCE8", "#FEF9C3"];
      iconBg = "#FEF08A";
    } else if (cleanCat.includes("lacteos")) {
      icon = "🥛";
      bgGradient = ["#F0FDFA", "#CCFBF1"];
      iconBg = "#99F6E4";
    } else if (
      cleanCat.includes("fiambres") ||
      cleanCat.includes("quesos") ||
      cleanCat.includes("queso")
    ) {
      icon = "🧀";
      bgGradient = ["#FEF3C7", "#FEF3C7"];
      iconBg = "#FDE68A";
    } else if (
      cleanCat.includes("panificados") ||
      cleanCat.includes("panaderia")
    ) {
      icon = "🍞";
      bgGradient = ["#FFFBEB", "#FEF3C7"];
      iconBg = "#FDE68A";
    } else if (cleanCat.includes("aguas")) {
      icon = "💧";
      bgGradient = ["#ECFEFF", "#CFFAFE"];
      iconBg = "#9BF6FF";
    } else if (cleanCat.includes("cervezas")) {
      icon = "🍺";
      bgGradient = ["#FEF3C7", "#FEF3C7"];
      iconBg = "#FDE68A";
    } else if (cleanCat.includes("vinos")) {
      icon = "🍷";
      bgGradient = ["#FCE7F3", "#FBCFE8"];
      iconBg = "#FBCFE8";
    } else if (cleanCat.includes("limpieza")) {
      icon = "🧹";
      bgGradient = ["#F0FDF4", "#DCFCE7"];
      iconBg = "#BBF7D0";
    } else if (
      cleanCat.includes("perfumeria") ||
      cleanCat.includes("higiene")
    ) {
      icon = "🧴";
      bgGradient = ["#FAF5FF", "#F3E8FF"];
      iconBg = "#E9D5FF";
    }
  }

  // Clean values for XML/SVG safety
  const safeName = (name || "Producto")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const displayBrand = brand
    ? brand.toUpperCase()
    : (cat || "Kiosco").toUpperCase();
  const safeBrand = displayBrand
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  // Sleek SVG element with custom layouts
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="100%" height="100%">
    <defs>
      <linearGradient id="g_${Math.abs(
        name.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0),
      )}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradient[0]}" />
        <stop offset="100%" stop-color="${bgGradient[1]}" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g_${Math.abs(
      name.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0),
    )})" />
    <circle cx="150" cy="110" r="46" fill="${iconBg}" opacity="0.65" />
    <text x="150" y="127" font-family="system-ui, sans-serif" font-size="44" text-anchor="middle">${icon}</text>
    <text x="150" y="195" font-family="system-ui, sans-serif" font-size="15" font-weight="900" fill="#1E293B" text-anchor="middle">${safeName.substring(
      0,
      18,
    )}${safeName.length > 18 ? "..." : ""}</text>
    <text x="150" y="222" font-family="system-ui, sans-serif" font-size="9" font-weight="800" fill="#64748B" text-anchor="middle" letter-spacing="1.2" opacity="0.95">${safeBrand}</text>
  </svg>`;

  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};

export const isDeliveryAvailableNow = (
  timezone: string = "America/Argentina/Buenos_Aires",
): { available: boolean; currentHourText: string; nextSlotText: string } => {
  let dayName = "Monday";
  let hour = 12;
  let min = 0;
  let month = 1;
  let dayOfMonth = 1;

  try {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "numeric",
      minute: "numeric",
      month: "numeric",
      day: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);

    const weekdayValue = parts.find((p) => p.type === "weekday")?.value;
    const hourValue = parts.find((p) => p.type === "hour")?.value;
    const minuteValue = parts.find((p) => p.type === "minute")?.value;
    const monthValue = parts.find((p) => p.type === "month")?.value;
    const dayValue = parts.find((p) => p.type === "day")?.value;

    if (weekdayValue) dayName = weekdayValue;
    if (hourValue !== undefined) hour = parseInt(hourValue, 10);
    if (minuteValue !== undefined) min = parseInt(minuteValue, 10);
    if (monthValue !== undefined) month = parseInt(monthValue, 10);
    if (dayValue !== undefined) dayOfMonth = parseInt(dayValue, 10);
  } catch (e) {
    console.warn("Error processing timezone, falling back to local clock", e);
    const now = new Date();
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    dayName = days[now.getDay()];
    hour = now.getHours();
    min = now.getMinutes();
    month = now.getMonth() + 1;
    dayOfMonth = now.getDate();
  }

  const decimalTime = hour + min / 60;

  const inFirstSlot = decimalTime >= 11.0 && decimalTime < 14.0;
  const inSecondSlot = decimalTime >= 19.0 && decimalTime < 24.0;
  const available = inFirstSlot || inSecondSlot;

  let nextSlotText = "";
  if (decimalTime < 11.0) {
    nextSlotText = "Próximo reparto hoy de 11:00 a 14:00hs";
  } else if (decimalTime >= 14.0 && decimalTime < 19.0) {
    nextSlotText = "Próximo reparto hoy de 19:00 a 00:00hs";
  } else {
    nextSlotText = "Próximo reparto mañana de 11:00 a 14:00hs";
  }

  return {
    available,
    currentHourText: `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")} hs`,
    nextSlotText,
  };
};
