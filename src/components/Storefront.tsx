import React, { Component, useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { 
  ShoppingCart, Search, MapPin, Phone, Info, ShoppingBag, 
  Trash2, Plus, Minus, ArrowRight, ArrowLeft, ChevronRight, CheckCircle2, 
  Clock, Sparkles, Star, FastForward, HelpCircle, User, X, WifiOff, Download, Smartphone
} from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Order, Combo, Promo, PromoBanner, DeliveryZone } from '../types';
import { orderStatusStep, orderStatusLabel } from '../utils/orderStatus';
import { playChime } from '../utils/audio';
import { CATS, CAT_ABBR, CAT_BG, COMBOS, PROMOS_LIST, getFallbackStoreImage, isDeliveryAvailableNow, inferCategory } from '../data';
import { DeliveryMapTracker } from './DeliveryMapTracker';
import { Modal } from './Modal';
import origenesLogo from '../assets/images/origenes_emblem_128.png';

// WhatsApp del kiosco: +54 9 2901 60-2109.
// Formato wa.me: solo digitos, sin + ni espacios.
export const KIOSCO_WHATSAPP = '5492901602109';

interface StorefrontProps {
  products: Product[];
  orders: Order[];
  onPlaceOrder: (
    order: Omit<Order, 'id' | 'timestamp' | 'status'>,
    name: string,
    phone: string,
    location?: string,
    paymentMethod?: string,
    paymentStatus?: string
  ) => void;
  openAdminPanel: () => void;
  onUpdateProduct?: (product: Product) => void;
  onAddProduct?: (product: Product) => void;
  onDeleteProduct?: (productId: number) => void;
  currentUser?: any;
  banners?: PromoBanner[];
  onSignInGoogle?: () => void;
  signInState?: 'idle' | 'pending' | 'redirecting' | 'error';
  signInError?: string | null;
  onSignOut?: () => void;
  deliveryZones?: DeliveryZone[];
  combos?: Combo[];
  isAdmin?: boolean;
  onDbCategoryChange?: (category: string) => void;
  hasMoreProducts?: boolean;
  loadMoreProducts?: () => void;
  productsStatus?: 'loading' | 'ready' | 'error' | 'loadingMore';
  deliveryCutoffHour?: number;
}

const parseOrderDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (typeof timestamp === 'number') return new Date(timestamp);
  if (timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
  if (timestamp._seconds !== undefined) return new Date(timestamp._seconds * 1000);
  if (timestamp.toDate && typeof timestamp.toDate === 'function') return timestamp.toDate();
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return new Date();
  return d;
};

interface MapsErrorBoundaryProps {
  children: React.ReactNode;
  onCalculateShipping: (info: { distanceKm: number; durationMins: number; fee: number; address: string }) => void;
  selectedZoneLabel?: string;
  dynamicShippingCost?: number;
}

interface MapsErrorBoundaryState {
  hasError: boolean;
}

class MapsErrorBoundary extends Component<MapsErrorBoundaryProps, MapsErrorBoundaryState> {
  props: MapsErrorBoundaryProps;
  state: MapsErrorBoundaryState = {
    hasError: false
  };

  constructor(props: MapsErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("MapsErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-left">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
            📍 Seleccioná tu zona de entrega (Servicio Alternativo)
          </p>
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: 'Zona 1 — Hasta 2 km (Río Pipo y alrededores)', fee: 800, dist: 1.5 },
              { label: 'Zona 2 — Entre 2 y 4 km (La Frontera / Glaciar)', fee: 1200, dist: 3 },
              { label: 'Zona 3 — Entre 4 y 6 km (Sarmiento / Bahía Golondrina)', fee: 1800, dist: 5 },
              { label: 'Zona 4 — Más de 6 km (Centro y Costa)', fee: 2500, dist: 7 },
            ].map(z => {
              const isSelected = this.props.selectedZoneLabel === z.label || (!this.props.selectedZoneLabel && this.props.dynamicShippingCost === z.fee);
              return (
                <button
                  type="button"
                  key={z.label}
                  onClick={() => this.props.onCalculateShipping({ distanceKm: z.dist, durationMins: Math.round(z.dist * 4), fee: z.fee, address: z.label })}
                  className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-98 cursor-pointer border ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-black' 
                      : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {z.label} — <span className={isSelected ? 'text-blue-700 font-extrabold' : 'text-blue-600 font-black'}>${z.fee.toLocaleString('es-AR')}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ENVIO_MINIMO = 3000; // pesos mínimos para realizar un envío

export const Storefront: React.FC<StorefrontProps> = ({
  products,
  orders,
  onPlaceOrder,
  openAdminPanel,
  onUpdateProduct,
  onAddProduct,
  onDeleteProduct,
  currentUser,
  banners = [],
  onSignInGoogle,
  signInState = 'idle',
  signInError,
  onSignOut,
  deliveryZones = [],
  combos = [],
  isAdmin,
  onDbCategoryChange,
  hasMoreProducts,
  loadMoreProducts,
  productsStatus,
  deliveryCutoffHour
}) => {
  // Combos que se muestran: los cargados desde el panel (Firestore) tienen
  // prioridad; si no hay ninguno, se usa la lista fija del codigo (COMBOS).
  const combosList = (combos && combos.length > 0)
    ? combos.filter(c => c.active !== false)
    : COMBOS;

  const [currentTab, _setCurrentTab] = useState<'home' | 'catalog' | 'promos' | 'combos' | 'cart'>('home');
  const [tabHistory, setTabHistory] = useState<('home' | 'catalog' | 'promos' | 'combos' | 'cart')[]>(['home']);

  const setCurrentTab = (newTab: 'home' | 'catalog' | 'promos' | 'combos' | 'cart') => {
    _setCurrentTab(newTab);
    setTabHistory(prev => {
      if (prev[prev.length - 1] === newTab) return prev;
      return [...prev, newTab];
    });
  };

  const handleGoBack = () => {
    if (tabHistory.length > 1) {
      const copy = [...tabHistory];
      copy.pop(); // remove current tab
      const prev = copy[copy.length - 1] || 'home';
      _setCurrentTab(prev);
      setTabHistory(copy);
    } else {
      _setCurrentTab('home');
    }
  };
  const [currentCat, setCurrentCat] = useState<string>('all');
  
  useEffect(() => {
    if (onDbCategoryChange) {
      onDbCategoryChange(currentCat);
    }
  }, [currentCat, onDbCategoryChange]);

   const [searchQ, setSearchQ] = useState<string>('');
  const [searchProducts, setSearchProducts] = useState<Product[] | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [indexErrorUrl, setIndexErrorUrl] = useState<string | null>(null);

  useEffect(() => {
    const term = searchQ.trim();
    if (term.length < 2) {
      setSearchProducts(null);
      setIsSearching(false);
      setIndexErrorUrl(null);
      return;
    }

    setIsSearching(true);
    setIndexErrorUrl(null);

    const delayDebounceFn = setTimeout(async () => {
      try {
        const lowerTerm = term.toLowerCase();
        const baseCol = collection(db, 'products');
        
        let q;
        if (currentCat !== 'all' && currentCat !== 'favorites') {
          q = query(
            baseCol,
            where('cat', '==', currentCat),
            where('name_lower', '>=', lowerTerm),
            where('name_lower', '<=', lowerTerm + '\uf8ff'),
            orderBy('name_lower'),
            limit(100)
          );
        } else {
          q = query(
            baseCol,
            where('name_lower', '>=', lowerTerm),
            where('name_lower', '<=', lowerTerm + '\uf8ff'),
            orderBy('name_lower'),
            limit(100)
          );
        }

        const snapshot = await getDocs(q);
        const results: Product[] = [];
        snapshot.forEach(docSnap => {
          results.push(docSnap.data() as Product);
        });

        // Apply healing to search results (maintaining image fallback logic as required)
        const healedResults = results.map(p => {
          if (!p.image || p.image.trim() === '' || !p.image.startsWith('http')) {
            const match = products.find(x => x.id === p.id);
            if (match && match.image && match.image.trim() !== '') return { ...p, image: match.image };
            return { ...p, image: getFallbackStoreImage(p.name, p.brand, p.cat) };
          }
          return p;
        });

        setSearchProducts(healedResults);
      } catch (err: any) {
        console.error('[Search Error]', err);
        if (err.message) {
          const match = err.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
          if (match) {
            setIndexErrorUrl(match[0]);
          }
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQ, currentCat, products]);

  const [deliveryMode, setDeliveryMode] = useState<'retiro' | 'envio'>('retiro');

  const cutoffHour = deliveryCutoffHour ?? 21;
  const currentHour = new Date().getHours();
  const isAfterCutoff = currentHour >= cutoffHour;
  
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem('origenes_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  
  // Cart state
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('origenes_cart');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Persist cart state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('origenes_cart', JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart]);

  // Category dragging/horizontal wheel logic for PC
  const catScrollRef = useRef<HTMLDivElement>(null);
  const [isCatMouseDown, setIsCatMouseDown] = useState(false);
  const [catStartX, setCatStartX] = useState(0);
  const [catScrollLeft, setCatScrollLeft] = useState(0);
  const isDraggingCat = useRef(false);

  const handleCatMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!catScrollRef.current) return;
    setIsCatMouseDown(true);
    setCatStartX(e.pageX - catScrollRef.current.offsetLeft);
    setCatScrollLeft(catScrollRef.current.scrollLeft);
    isDraggingCat.current = false;
  };

  const handleCatMouseLeaveOrUp = () => {
    setIsCatMouseDown(false);
  };

  const handleCatMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCatMouseDown || !catScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - catScrollRef.current.offsetLeft;
    const walk = (x - catStartX) * 1.5;
    
    // If user dragged more than 5 pixels, treat it as drag rather than click
    if (Math.abs(walk) > 5) {
      isDraggingCat.current = true;
    }
    
    catScrollRef.current.scrollLeft = catScrollLeft - walk;
  };

  const handleCatWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!catScrollRef.current) return;
    if (e.deltaY !== 0) {
      catScrollRef.current.scrollLeft += e.deltaY;
    }
  };
  
  // Custom dialogs & modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [pmQty, setPmQty] = useState<number>(1);
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<Order | null>(null);

  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyTel, setHistoryTel] = useState<string>(() => localStorage.getItem('origenes_last_phone') || '');

  const historyOrdersList = useMemo(() => {
    if (!historyTel.trim()) return [];
    try {
      const stored = localStorage.getItem(`origenes_orders_${historyTel.trim()}`);
      if (stored) {
        return (JSON.parse(stored) as Order[]).slice(0, 3);
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  }, [historyTel, showHistoryModal]);

  const handleRepeatOrder = (order: Order) => {
    const newCart: Record<number, number> = {};
    order.items.forEach(item => {
      const prod = products.find(p => p.id === item.id);
      if (prod && prod.inStock) {
        newCart[prod.id] = item.qty;
      }
    });

    if (Object.keys(newCart).length === 0) {
      showToast("❌ Los productos de este pedido ya no tienen stock.");
      return;
    }

    setCart(newCart);
    setShowHistoryModal(false);
    _setCurrentTab('cart');
    showToast("🛒 ¡Pedido cargado al carrito! 🔄");
  };

  // Si el cliente cerró el seguimiento, se oculta hasta que lo reabra (o haga otro pedido).
  const [trackerDismissed, setTrackerDismissed] = useState<boolean>(false);

  const liveOrder = useMemo(() => {
    // Pedido recién confirmado en esta sesión (matchea por número local).
    if (lastPlacedOrder) return orders.find(o => o.id === lastPlacedOrder.id) || lastPlacedOrder;
    // Rehidratación: si quedó un pedido activo guardado, seguirlo desde `orders`
    // (que ya recibe las actualizaciones en vivo por la suscripción de App). Así
    // el seguimiento SOBREVIVE a recargar la página o volver al catálogo.
    let activeId: string | null = null;
    try { activeId = localStorage.getItem('origenes_active_order_id'); } catch (e) { /* sin storage */ }
    if (activeId) {
      const found = orders.find(o => o.docId === activeId);
      if (found && found.status !== 'entregado' && found.status !== 'cancelado') return found;
    }
    return null;
  }, [orders, lastPlacedOrder]);

  // ============ NOTIFICACION AL CLIENTE CUANDO SU PEDIDO AVANZA ============
  // Cuando el local cambia el estado (confirmado, en preparacion, en camino,
  // listo, entregado), el cliente recibe: sonido + aviso dentro de la app +
  // notificacion del navegador (si dio permiso). El primer render no notifica.
  const prevOrderStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const status = liveOrder?.status ?? null;
    const prev = prevOrderStatusRef.current;
    prevOrderStatusRef.current = status;
    if (!status || prev === null || prev === status) return;

    const delivery = liveOrder?.delivery;
    const NOTIFY_MSGS: Record<string, string> = {
      confirmado: '\u2705 \u00a1Tu pedido fue CONFIRMADO por el kiosco!',
      en_preparacion: '\ud83d\udc68\u200d\ud83c\udf73 \u00a1Tu pedido esta EN PREPARACION!',
      en_camino: '\ud83d\udef5 \u00a1Tu pedido esta EN CAMINO a tu casa!',
      listo: delivery === 'retiro'
        ? '\ud83d\udecd\ufe0f \u00a1Tu pedido esta LISTO para retirar!'
        : '\ud83d\udce6 \u00a1Tu pedido esta listo y sale enseguida!',
      entregado: '\ud83c\udf89 \u00a1Pedido ENTREGADO! Gracias por tu compra.',
      cancelado: '\u274c Tu pedido fue cancelado. Consultanos por WhatsApp si tenes dudas.',
    };
    const msg = NOTIFY_MSGS[status] || `Tu pedido cambio de estado: ${orderStatusLabel(status as any, delivery as any)}`;

    showToast(msg);
    try { playChime(); } catch (e) { /* sin audio */ }
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { /* sin vibrador */ }
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Origenes Kiosco', { body: msg, icon: '/icon-192.png', tag: 'origenes-pedido' });
      }
    } catch (e) { /* Notification API no disponible */ }

    // Reabrir el seguimiento para que vea el avance al instante.
    setTrackerDismissed(false);
  }, [liveOrder?.status]);

  // Pedir permiso de notificaciones apenas se confirma un pedido, que es el
  // momento en que al cliente MAS le sirve aceptarlas.
  useEffect(() => {
    if (!lastPlacedOrder) return;
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { /* rechazado */ });
      }
    } catch (e) { /* API no disponible */ }
  }, [lastPlacedOrder]);

  const crossSellProducts = useMemo(() => {
    // Candidates are inStock and NOT currently in the shopping cart
    const candidates = products.filter(p => p.inStock && !cart[p.id]);

    // Sort candidates:
    // 1. Discounted products first (p.orig !== null && p.orig > p.price)
    // 2. Featured items next
    // 3. Category mix
    return candidates.sort((a, b) => {
      const aHasDiscount = (a.orig !== null && a.orig > a.price) ? 1 : 0;
      const bHasDiscount = (b.orig !== null && b.orig > b.price) ? 1 : 0;
      if (aHasDiscount !== bHasDiscount) {
        return bHasDiscount - aHasDiscount;
      }
      const aFeat = a.featured ? 1 : 0;
      const bFeat = b.featured ? 1 : 0;
      return bFeat - aFeat;
    }).slice(0, 6);
  }, [products, cart]);
  
  // Mandatory order details state
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerLocation, setCustomerLocation] = useState<string>('');
  
  const [addressStreet, setAddressStreet] = useState<string>('');
  const [addressUnit, setAddressUnit] = useState<string>('');
  const [addressNotes, setAddressNotes] = useState<string>('');
  const [selectedZoneLabel, setSelectedZoneLabel] = useState<string>('Centro');

  useEffect(() => {
    const parts = [];
    if (selectedZoneLabel.trim()) parts.push(`Zona: ${selectedZoneLabel.trim()}`);
    if (addressStreet.trim()) parts.push(addressStreet.trim());
    if (addressUnit.trim()) parts.push(`Piso/Depto: ${addressUnit.trim()}`);
    if (addressNotes.trim()) parts.push(`Ref: ${addressNotes.trim()}`);
    setCustomerLocation(parts.join(' - '));
  }, [selectedZoneLabel, addressStreet, addressUnit, addressNotes]);

  const [formError, setFormError] = useState<string>('');

    // Clear stale checkout error banner whenever the customer edits key fields or switches delivery mode
      useEffect(() => {
          if (formError) setFormError('');
            }, [customerPhone, customerLocation, deliveryMode, addressStreet, addressUnit, selectedZoneLabel]);

  // Payment Selection States - fully processed on page
  const [paymentMethod, setPaymentMethod] = useState<'tarjeta_online' | 'transferencia_qr' | 'efectivo'>('tarjeta_online');
  const [cardNumber, setCardNumber] = useState<string>('');
  const [cardName, setCardName] = useState<string>('');
  const [cardExpiry, setCardExpiry] = useState<string>('');
  const [cardCvv, setCardCvv] = useState<string>('');
  const [bankReceiptChecked, setBankReceiptChecked] = useState<boolean>(false);
  const [cashAmountPaidWith, setCashAmountPaidWith] = useState<string>('');
  const [showOrderSummaryScreen, setShowOrderSummaryScreen] = useState<boolean>(false);
  
  // Real-time secure payment processing simulation states
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [paymentStatusText, setPaymentStatusText] = useState<string>('');

  // --- INTERACTIVE IN-LINE GONDOLA / DECORATIVE STOCK CONTROLS ---
  // Forced to false so storefront remains a pure customer shopping interface even for logged-in admins
  const isAdminMode = false;
  const [showingStoreAddForm, setShowingStoreAddForm] = useState<boolean>(false);
  const [editingStoreProduct, setEditingStoreProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Form fields for direct catalog editing
  const [storeFormName, setStoreFormName] = useState<string>('');
  const [storeFormBrand, setStoreFormBrand] = useState<string>('');
  const [storeFormPrice, setStoreFormPrice] = useState<string>('');
  const [storeFormOrig, setStoreFormOrig] = useState<string>('');
  const [storeFormCat, setStoreFormCat] = useState<string>('');
  const [storeFormDesc, setStoreFormDesc] = useState<string>('');
  const [storeFormImage, setStoreFormImage] = useState<string>('');
  const [storeFormInStock, setStoreFormInStock] = useState<boolean>(true);
  const [isGeneratingLogo, setIsGeneratingLogo] = useState<boolean>(false);
  const [directFormValidationError, setDirectFormValidationError] = useState<string>('');

  // Quick inline add states for specific tabs
  const [quickStoreName, setQuickStoreName] = useState<string>('');
  const [quickStorePrice, setQuickStorePrice] = useState<string>('');
  const [quickStoreBrand, setQuickStoreBrand] = useState<string>('');
  const [quickStoreError, setQuickStoreError] = useState<string>('');

  // Handle opening product modal or form
  const handleOpenAddFormForCat = (catId: string) => {
    setEditingStoreProduct(null);
    setStoreFormName('');
    setStoreFormBrand('');
    setStoreFormPrice('');
    setStoreFormOrig('');
    setStoreFormCat(catId === 'all' ? '' : catId);
    setStoreFormDesc('');
    setStoreFormImage('');
    setStoreFormInStock(true);
    setDirectFormValidationError('');
    setShowingStoreAddForm(true);
  };

  const handleOpenEditFormForProduct = (p: Product) => {
    setEditingStoreProduct(p);
    setStoreFormName(p.name);
    setStoreFormBrand(p.brand || '');
    setStoreFormPrice(p.price.toString());
    setStoreFormOrig(p.orig ? p.orig.toString() : '');
    setStoreFormCat(p.cat);
    setStoreFormDesc(p.desc || '');
    setStoreFormImage(p.image || '');
    setStoreFormInStock(p.inStock);
    setDirectFormValidationError('');
    setShowingStoreAddForm(true);
  };

const compressImage = (dataUrl: string, maxDim: number = 1024, quality: number = 0.8): Promise<string> => { return new Promise((resolve) => { const img = new Image(); img.onload = () => { let width = img.width; let height = img.height; if (width > maxDim || height > maxDim) { if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; } else { width = Math.round(width * (maxDim / height)); height = maxDim; } } const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); if (!ctx) { resolve(dataUrl); return; } ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', quality)); }; img.onerror = () => resolve(dataUrl); img.src = dataUrl; }); }; const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = async () => { if (typeof reader.result === 'string') { const compressed = await compressImage(reader.result); setStoreFormImage(compressed); } }; reader.readAsDataURL(file); } };

  // Save changes
  const handleSaveStoreProduct = () => {
    if (!storeFormName.trim()) {
      setDirectFormValidationError('Se requiere ingresar un nombre para el producto.');
      return;
    }
    const valPrice = Number(storeFormPrice);
    if (!storeFormPrice.trim() || isNaN(valPrice) || valPrice <= 0) {
      setDirectFormValidationError('El precio de venta debe ser mayor a 0');
      return;
    }
    if (!storeFormCat.trim()) {
      setDirectFormValidationError('Seleccioná una categoría');
      return;
    }

    const priceNum = Math.round(Number(storeFormPrice));
    const origNum = storeFormOrig.trim() ? Math.round(Number(storeFormOrig)) : undefined;

    if (editingStoreProduct) {
      // Update
      const updated: Product = {
        ...editingStoreProduct,
        name: storeFormName.trim(),
        brand: storeFormBrand.trim(),
        price: priceNum,
        orig: origNum && origNum > 0 ? origNum : null,
        cat: storeFormCat,
        desc: storeFormDesc.trim(),
        image: storeFormImage.trim(),
        inStock: storeFormInStock
      };
      if (onUpdateProduct) {
        onUpdateProduct(updated);
      }
    } else {
      // Create - auto generate unique id
      const nextId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 100;
      const newProd: Product = {
        id: nextId,
        name: storeFormName.trim(),
        brand: storeFormBrand.trim(),
        price: priceNum,
        orig: origNum && origNum > 0 ? origNum : null,
        cat: storeFormCat,
        desc: storeFormDesc.trim(),
        image: storeFormImage.trim(),
        inStock: storeFormInStock,
        featured: false,
        neww: true
      };
      if (onAddProduct) {
        onAddProduct(newProd);
      }
    }
    setShowingStoreAddForm(false);
  };

  // Quick toggle in-place stock
  const handleQuickToggleInStock = (p: Product) => {
    if (onUpdateProduct) {
      onUpdateProduct({
        ...p,
        inStock: !p.inStock
      });
    }
  };

  const handleQuickInlineProdAdd = () => {
    setQuickStoreError('');
    const nameTrimmed = quickStoreName.trim();
    if (!nameTrimmed) {
      setQuickStoreError('Ingresá el nombre del producto');
      return;
    }
    const priceNum = parseFloat(quickStorePrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setQuickStoreError('Precio inválido');
      return;
    }
    if (currentCat === 'all') {
      setQuickStoreError('Seleccioná una categoría primero');
      return;
    }

    const nextId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1000;
    const finalBrand = quickStoreBrand.trim() || 'Genérico';
    const finalImage = getFallbackStoreImage(nameTrimmed, finalBrand, currentCat);

    const newProd: Product = {
      id: nextId,
      name: nameTrimmed,
      brand: finalBrand,
      price: priceNum,
      orig: null,
      cat: currentCat,
      desc: 'Agregado rápido en ' + (CATS.find(c => c.id === currentCat)?.name || currentCat),
      image: finalImage,
      inStock: true,
      featured: false,
      neww: true
    };

    if (onAddProduct) {
      onAddProduct(newProd);
    }

    // Auto-add to cart for maximum convenience
    setCart(prev => ({
      ...prev,
      [nextId]: (prev[nextId] || 0) + 1
    }));

    showToast(`🍬 '${newProd.name}' sumado a ${CATS.find(c => c.id === currentCat)?.name || 'Kiosco'} y al carrito!`);

    // Reset fields
    setQuickStoreName('');
    setQuickStorePrice('');
    setQuickStoreBrand('');
  };

  // Quick AI Generation on-the-fly for products directly in storefront
  const handleAiGenerateStoreImage = () => {
    if (!storeFormName.trim()) return;
    setIsGeneratingLogo(true);
    try {
      const queryFormatted = encodeURIComponent(storeFormName.trim().toLowerCase());
      setStoreFormImage(`https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600&auto=format&fit=crop&sig=${queryFormatted}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingLogo(false);
    }
  };

  // Check if currentUser is signed in as admin or is local manager (handled by prop)

  // Search & Catalog Sorting States
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc'>('default'); const [visibleCount, setVisibleCount] = useState<number>(60); useEffect(() => { setVisibleCount(60); }, [currentCat, searchQ, sortBy]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState<boolean>(false);

  // Progressive Web App (PWA) Install Prompt & Offline States
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // check if we dismissed it in this session to be polite
      const dismissed = sessionStorage.getItem('pwa_prompt_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isStandalone) {
      setShowInstallBanner(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    };
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = () => {
    if (!deferredPrompt) return;
    setShowInstallModal(true);
  };

  const executeActualInstall = async () => {
    setShowInstallModal(false);
    if (!deferredPrompt) return;
    deferredPrompt['prompt']();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
    } else {
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  // Active slide index for welcome banner
  const [slideIdx, setSlideIdx] = useState<number>(0);

  // Auto-rotating slider effect
  React.useEffect(() => {
    const timer = setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Format currency helpers
  const fmt = (n: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n);
  };

  const getFilteredProducts = useMemo(() => {
    let list = searchProducts !== null ? searchProducts : products;
    
    // If we are NOT doing a firestore-based prefix search, we do the category & manual search filter
    if (searchProducts === null) {
      if (currentCat !== 'all') {
        if (currentCat === 'favorites') {
          list = list.filter(p => favorites.includes(p.id));
        } else {
          list = list.filter(p => inferCategory(p) === currentCat);
        }
      }
      if (searchQ.trim()) {
        const q = searchQ.toLowerCase();
        list = list.filter(p => 
          p.name.toLowerCase().includes(q) || 
          p.brand.toLowerCase().includes(q) || 
          (p.desc && p.desc.toLowerCase().includes(q))
        );
      }
    } else {
      // If we ARE using searchProducts (Firestore results), they are already filtered by category (if selected).
      // However, if we selected 'favorites' category, we filter search results by favorites in-memory.
      if (currentCat === 'favorites') {
        list = list.filter(p => favorites.includes(p.id));
      }
    }

    if (sortBy === 'price_asc') {
      list = [...list].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      list = [...list].sort((a, b) => b.price - a.price);
    }
    return list;
  }, [products, searchProducts, currentCat, searchQ, favorites, sortBy]);

  // Live search suggestions based on current search term
  const searchSuggestions = useMemo(() => {
    if (!searchQ.trim()) return [];
    const q = searchQ.trim().toLowerCase();
    const matches: string[] = [];
    for (const p of products) {
      if (p.name.toLowerCase().includes(q) && !matches.includes(p.name)) {
        matches.push(p.name);
      }
      if (p.brand && p.brand.toLowerCase().includes(q) && !matches.includes(p.brand)) {
        matches.push(p.brand);
      }
      if (matches.length >= 5) break;
    }
    return matches;
  }, [searchQ, products]);

  // Recent orders list for "Volver a pedir" section
  const recentOrders = useMemo(() => {
    try {
      const lastPhone = localStorage.getItem('origenes_last_phone') || historyTel;
      if (!lastPhone) return [];
      const stored = localStorage.getItem(`origenes_orders_${lastPhone.trim()}`);
      if (stored) {
        return (JSON.parse(stored) as Order[]).slice(0, 3);
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  }, [orders, historyTel]);

  // Cart operations
  const addToCart = (productId: number | string, qtyToAdd = 1) => {
    setCart(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + qtyToAdd
    }));
    showToast(`Agregado al carrito`);
  };

  const changeQty = (productId: number | string, delta: number) => {
    setCart(prev => {
      const cur = prev[productId] || 0;
      const res = cur + delta;
      if (res <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: res };
    });
  };

  const removeFromCart = (productId: number | string) => {
    setCart(prev => {
      const copy = { ...prev };
      delete copy[productId];
      return copy;
    });
  };

  // Toast notifications helper
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // --- ACCOUNT & FAVORITES & COUPONS STATES ---
  const toggleFavorite = (productId: number) => {
    setFavorites(prev => {
      const isFav = prev.includes(productId);
      const next = isFav 
        ? prev.filter(id => id !== productId)
        : [...prev, productId];
      localStorage.setItem('origenes_favorites', JSON.stringify(next));
      setTimeout(() => {
        showToast(!isFav ? "❤️ ¡Agregado a favoritos!" : "💔 Removido de favoritos");
      }, 50);
      return next;
    });
  };

  const [showAccountModal, setShowAccountModal] = useState<boolean>(false);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);
  const [fidelityPoints, setFidelityPoints] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('origenes_fidelity_points');
      return stored ? parseInt(stored, 10) : 0; // Default points for returning user demo
    } catch {
      return 0;
    }
  });

  // Coupon Engine state
  const [couponInput, setCouponInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; type: 'discount' | 'shipping_free'; value: number } | null>(null);
  const [couponError, setCouponError] = useState<string>('');
  
  

  // El pago con QR ya no tiene descuento (decision del cliente):
  // es un metodo de pago mas, sin promo asociada.
  const selectQRPayment = () => {
    setPaymentMethod('transferencia_qr');
  };

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();

    if (code === 'DESCUENTO10') {
      setAppliedCoupon({ code, type: 'discount', value: 0.10 });
      setCouponError('');
      setCouponInput('');
      showToast('🎟️ ¡Cupón DESCUENTO10 (10%) aplicado!');
    } else if (code === 'CANDY20') {
      setAppliedCoupon({ code, type: 'discount', value: 0.20 });
      setCouponError('');
      setCouponInput('');
      showToast('🎟️ ¡Cupón CANDY20 (20%) aplicado!');
    } else if (code === 'ENVIO_GRATIS') {
      setAppliedCoupon({ code, type: 'shipping_free', value: 0 });
      setCouponError('');
      setCouponInput('');
      showToast('🎟️ ¡Cupón ENVIO_GRATIS aplicado! Envío bonificado.');
    } else {
      setCouponError('Cupón inválido o vencido.');
      setAppliedCoupon(null);
    }
  };

  // Search History and suggestions
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('origenes_search_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleAddSearchHistory = (q: string) => {
    const clean = q.trim().toLowerCase();
    if (!clean) return;
    setSearchHistory(prev => {
      const next = [clean, ...prev.filter(x => x !== clean)].slice(0, 5);
      localStorage.setItem('origenes_search_history', JSON.stringify(next));
      return next;
    });
  };

  // Debounce search history saving to avoid saving dynamic keystroke fragments
  useEffect(() => {
    const trimmed = searchQ.trim();
    if (trimmed.length <= 3) return;
    const delayDebounceFn = setTimeout(() => {
      handleAddSearchHistory(trimmed);
    }, 1500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQ]);

  // Simulated Mercado Pago Portal state
  const [showMPModal, setShowMPModal] = useState<boolean>(false);
  const [mpStep, setMpStep] = useState<'method' | 'card_form' | 'processing' | 'success'>('method');
  const [mpMethod, setMpMethod] = useState<'wallet' | 'card' | 'debit'>('wallet');
  const [mpCardNum, setMpCardNum] = useState<string>('');
  const [mpCardExp, setMpCardExp] = useState<string>('');
  const [mpCardCvv, setMpCardCvv] = useState<string>('');
  const [mpCardName, setMpCardName] = useState<string>('');
  const [mpCardDni, setMpCardDni] = useState<string>('');
  const [mpError, setMpError] = useState<string>('');

  // Save current location details to account profile
  const [addressUnitLocal, setAddressUnitLocal] = useState<string>(() => {
    return localStorage.getItem('origenes_address_unit') || '';
  });
  const [addressNotesLocal, setAddressNotesLocal] = useState<string>(() => {
    return localStorage.getItem('origenes_address_notes') || '';
  });

  // Client Phone login simulation (to save profile)
  const [showPhoneLoginModal, setShowPhoneLoginModal] = useState<boolean>(false);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [phoneCodeInput, setPhoneCodeInput] = useState<string>('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'code'>('phone');
  const [isPhoneLoggedIn, setIsPhoneLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('origenes_phone_logged') === 'true';
  });
  const [phoneUserObj, setPhoneUserObj] = useState<{ displayName: string; phoneNumber: string } | null>(() => {
    try {
      const savedObj = localStorage.getItem('origenes_user_profile');
      return savedObj ? JSON.parse(savedObj) : null;
    } catch {
      return null;
    }
  });

  const handlePhoneLogin = () => {
    if (!phoneInput.trim() || phoneInput.length < 8) {
      showToast('⚠️ Ingresá un celular válido');
      return;
    }
    setPhoneStep('code');
    showToast('📨 Código de validación enviado por SMS: 2901');
  };

  const handleVerifyPhoneCode = () => {
    if (phoneCodeInput.trim() !== '2901') {
      showToast('❌ Código incorrecto. Probá con 2901');
      return;
    }
    setIsPhoneLoggedIn(true);
    localStorage.setItem('origenes_phone_logged', 'true');
    const uObj = { displayName: customerName || 'Cliente Orígenes', phoneNumber: '+54 9 ' + phoneInput };
    setPhoneUserObj(uObj);
    localStorage.setItem('origenes_user_profile', JSON.stringify(uObj));
    setShowPhoneLoginModal(false);
    showToast('🎉 ¡Sesión iniciada con éxito!');
  };

  const handlePhoneLogout = () => {
    setIsPhoneLoggedIn(false);
    setPhoneUserObj(null);
    localStorage.removeItem('origenes_phone_logged');
    localStorage.removeItem('origenes_user_profile');
    showToast('👋 Sesión cerrada');
  };

  const getCustomerPastOrders = useMemo(() => {
    const activeTel = phoneUserObj?.phoneNumber 
      ? phoneUserObj.phoneNumber.replace(/[\s+]/g, '') 
      : (customerPhone ? customerPhone.replace(/[\s+]/g, '') : '');
    
    if (!activeTel) {
      try {
        const storedAll = localStorage.getItem('origenes_orders');
        if (storedAll) {
          return (JSON.parse(storedAll) as Order[]).slice(0, 5);
        }
      } catch {}
      return [];
    }

    try {
      const stored = localStorage.getItem(`origenes_orders_${activeTel}`);
      if (stored) {
        return JSON.parse(stored) as Order[];
      }
    } catch {}

    try {
      const storedAll = localStorage.getItem('origenes_orders');
      if (storedAll) {
        return (JSON.parse(storedAll) as Order[]).slice(0, 5);
      }
    } catch {}

    return [];
  }, [phoneUserObj, customerPhone, orders]);

  // Sync profile details with form
  useEffect(() => {
    if (phoneUserObj) {
      if (!customerName) setCustomerName(phoneUserObj.displayName);
      if (!customerPhone) setCustomerPhone(phoneUserObj.phoneNumber.replace(/\D/g, '').replace(/^549?/, ''));
    } else if (currentUser) {
      if (!customerName) setCustomerName(currentUser.displayName || '');
    }
  }, [phoneUserObj, currentUser]);

  // Shipping dynamic pricing (Zone integrated)
  const [dynamicShippingCost, setDynamicShippingCost] = useState<number>(5000);
  const [deliveryDistance, setDeliveryDistance] = useState<string>('');
  const [deliveryDuration, setDeliveryDuration] = useState<string>('');
  
  const [deliverySchedule, setDeliverySchedule] = useState<{ available: boolean; currentHourText: string; nextSlotText: string } | null>(null);

  // Check delivery availability periodically
  useEffect(() => {
    const checkSched = () => {
      setDeliverySchedule(isDeliveryAvailableNow());
    };
    checkSched();
    const interval = setInterval(checkSched, 20000);
    return () => clearInterval(interval);
  }, []);

  // Cart totals calculation
  const { subtotal, totalItems } = useMemo(() => {
    let sub = 0;
    let items = 0;
    Object.entries(cart).forEach(([idStr, qtyVal]) => {
      const qty = Number(qtyVal);
      
      if (idStr.startsWith('c')) {
        const combo = combosList.find(x => x.id === idStr);
        if (combo) {
          sub += combo.price * qty; items += qty;
        }
      } else {
        const p = products.find(x => x.id === parseInt(idStr));
        if (p) {
          sub += p.price * qty; items += qty;
        }
      }
    });
    return { subtotal: sub, totalItems: items };
  }, [cart, products]);

  // El "primer pedido del dia" es el primero de TODA la tienda y lo resuelve el
  // backend: el cliente ya no puede leer /orders, y calcularlo con el historial
  // local se reseteaba borrando datos o cambiando de dispositivo.
  const [storeFreeShippingAvailable, setStoreFreeShippingAvailable] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    fetch('/api/store/free-shipping-status')
      .then(r => (r.ok ? r.json() : { available: false }))
      .then(data => { if (active) setStoreFreeShippingAvailable(!!data.available); })
      .catch(() => { if (active) setStoreFreeShippingAvailable(false); });
    return () => { active = false; };
    // Se revalida despues de cada pedido: si este cliente se llevo el beneficio,
    // no puede volver a aplicarlo en la misma sesion.
  }, [lastPlacedOrder]);

  const isFirstOrderOfDayFreeShipping = storeFreeShippingAvailable && subtotal >= 20000;
  const isFreeShipping = (appliedCoupon && appliedCoupon.type === 'shipping_free') || isFirstOrderOfDayFreeShipping;
  const shippingCost = isFreeShipping ? 0 : (deliveryMode === 'envio' ? dynamicShippingCost : 0);

  const hasCouponDiscount = !!appliedCoupon && appliedCoupon.type === 'discount';

  // El descuento del 10% por pagar con QR fue ELIMINADO a pedido del cliente.
  // Se dejan las variables en cero para no tocar el resto del calculo.
  const hasQRDiscount = false;
  const qrDiscountAmount = 0;

  // Al ser excluyentes, como mucho uno de los dos descuentos es distinto de cero,
  // asi que el cupon se calcula siempre sobre el subtotal limpio.
  const couponDiscountAmount = hasCouponDiscount
    ? Math.round(subtotal * appliedCoupon!.value)
    : 0;

  // Se redondea una sola vez, aca: todo lo que se muestra, se persiste y el
  // vuelto salen de finalTotal, asi que no quedan centavos sueltos.
  // Se calcula desde el desglose, no con un multiplicador aparte, para que
  // subtotal - qrDiscountAmount - couponDiscountAmount + shipping === total
  // de forma exacta (con dos redondeos independientes quedaba +-1 peso).
  const finalTotal = Math.round(subtotal - qrDiscountAmount - couponDiscountAmount + shippingCost);

  // Out of stock product suggestions (Related items logic)
  const getSimilarProductsSelected = useMemo(() => {
    if (!selectedProduct) return [];
    // Suggestions are in-stock products of the same category, excluding current product
    return products.filter(p => 
      p.cat === selectedProduct.cat && 
      p.id !== selectedProduct.id && 
      p.inStock
    ).slice(0, 4); // Suggest top 4
  }, [selectedProduct, products]);

  // Mandatory constraints logic to validate checkout fields
  const handleProceedToCheckout = () => {
    if (totalItems === 0) {
      showToast('Tu carrito está vacío');
      return;
    }
    setShowCheckoutModal(true);
  };

  const submitOrder = () => {
    if (!customerName.trim()) {
      setFormError('Por favor, ingresá tu nombre completo.');
      return;
    }
    if (!customerPhone.trim() || customerPhone.replace(/[^\d]/g, '').length < 8) {
      setFormError('Por favor, ingresá un número de celular de contacto válido.');
      return;
    }
    if (deliveryMode === 'envio' && !addressStreet.trim()) {
      setFormError('Por favor, ingresá la dirección exacta de despacho (Ubicación obligatoria para Pedidos Va).');
      return;
    }

    // Check delivery schedule availability (Bypassed if after cutoff since order goes to tomorrow)
    if (deliveryMode === 'envio' && !isAfterCutoff && deliverySchedule && !deliverySchedule.available) {
      setFormError(`El servicio de delivery está cerrado actualmente. Nuestro próximo horario disponible es: ${deliverySchedule.nextSlotText}`);
      return;
    }

    // Additional validations based on payment method chosen on the page
    if (paymentMethod === 'tarjeta_online') {
      const cleanCard = cardNumber.replace(/\s/g, '');
      if (cleanCard.length < 15 || cleanCard.length > 19) {
        setFormError('Número de tarjeta inválido. Debe contener entre 15 y 16 dígitos.');
        return;
      }
      if (!cardName.trim()) {
        setFormError('Por favor, ingresá el nombre impreso en la tarjeta.');
        return;
      }
      if (!cardExpiry.match(/^(0[1-9]|1[0-2])\/?([0-9]{2})$/)) {
        setFormError('Fecha de vencimiento inválida. Formato requerido: MM/AA (ej: 12/28).');
        return;
      }
      if (cardCvv.length < 3 || cardCvv.length > 4) {
        setFormError('Código de seguridad CVV inválido (debe tener 3 o 4 dígitos de control).');
        return;
      }
    }

    if (paymentMethod === 'transferencia_qr' && !bankReceiptChecked) {
      setFormError('Por favor, confirmá la realización de la transferencia tildando la casilla.');
      return;
    }

    if (paymentMethod === 'efectivo' && cashAmountPaidWith) {
      const payVal = Number(cashAmountPaidWith);
      if (payVal > 0 && payVal < finalTotal) {
        setFormError(`El monto con el que abonás debe ser mayor o igual al total a pagar (${fmt(finalTotal)}).`);
        return;
      }
    }

    setFormError('');

    // Pre-redirection Order Confirmation Check
    if (!showOrderSummaryScreen) {
      setShowOrderSummaryScreen(true);
      return;
    }

    const executeOrderSubmission = () => {
      // Determine final labels for our database representation
      let methodLabel = '';
      let statusLabel = 'pendiente';
      if (paymentMethod === 'tarjeta_online') {
        methodLabel = 'Tarjeta (Pago Online)';
        statusLabel = 'aprobado';
      } else if (paymentMethod === 'transferencia_qr') {
        methodLabel = 'QR';
        statusLabel = 'pendiente';
      } else {
        methodLabel = 'Efectivo (Abonás al recibir)';
        statusLabel = 'pendiente';
      }

      // Compile WhatsApp message structure
      let waMsg = `*Nuevo pedido - Orígenes Kiosco*\n`;
      waMsg += `=========================\n`;
      waMsg += `*Cliente:* ${customerName.trim()}\n`;
      waMsg += `*Celular:* ${customerPhone.trim()}\n`;
      if (deliveryMode === 'envio') {
        waMsg += `*Dirección:* ${customerLocation.trim()}\n`;
      }
      waMsg += `*Modalidad:* ${deliveryMode === 'envio' ? 'Envio a domicilio' : 'Retiro por local'}\n`;
      waMsg += `*Método de Pago:* ${methodLabel}\n`;
      
      if (paymentMethod === 'efectivo' && cashAmountPaidWith && Number(cashAmountPaidWith) > 0) {
        const payVal = Number(cashAmountPaidWith);
        const changeVal = payVal - finalTotal;
        waMsg += `*Abona con:* ${fmt(payVal)}\n`;
        if (changeVal > 0) {
          waMsg += `*Vuelto:* ${fmt(changeVal)}\n`;
        } else {
          waMsg += `*Vuelto:* No necesita (Pago exacto)\n`;
        }
      }

      waMsg += `*Pago de la Página:* ${statusLabel === 'aprobado' ? 'APROBADO ONLINE' : 'PENDIENTE'}\n`;
      waMsg += `=========================\n\n`;
      
      const orderItems: any[] = [];
      Object.entries(cart).forEach(([idStr, qtyVal]) => {
        const qty = Number(qtyVal);
        if (idStr.startsWith('c')) {
          const combo = combosList.find(x => x.id === idStr);
          if (combo) {
            waMsg += `• *[COMBO] ${combo.name}* x${qty} — ${fmt(combo.price * qty)}\n`;
            orderItems.push({ id: combo.id, name: combo.name, qty, price: combo.price });
          }
        } else {
          const p = products.find(x => x.id === parseInt(idStr));
          if (p) {
            waMsg += `• *${p.name}* x${qty} — ${fmt(p.price * qty)}\n`;
            orderItems.push({ id: p.id, name: p.name, qty, price: p.price });
          }
        }
      });

      waMsg += `\n=========================\n`;
      waMsg += `*Subtotal:* ${fmt(subtotal)}\n`;
      if (hasQRDiscount) {
        waMsg += `*Descuento QR (10%):* -${fmt(qrDiscountAmount)}\n`;
      }
      if (appliedCoupon) {
        waMsg += `*Cupón Descuento (${appliedCoupon.code}):* ${appliedCoupon.type === 'discount' ? '-' + fmt(couponDiscountAmount) + ' (' + Math.round(appliedCoupon.value * 100) + '%)' : 'Envío Gratis'}\n`;
      }
      if (deliveryMode === 'envio') {
        // shippingCost, no dynamicShippingCost: con envio gratis el mensaje
        // mostraba la tarifa completa y no cuadraba con el total.
        const envioTxt = shippingCost > 0
          ? `${fmt(shippingCost)}${deliveryDistance ? ' (Distancia: ' + deliveryDistance + ' / ' + deliveryDuration + ')' : ''}`
          : 'Gratis';
        waMsg += `*Envío:* ${envioTxt}\n`;
      } else {
        waMsg += `*Envío:* Gratis (Retiro)\n`;
      }
      waMsg += `*TOTAL A PAGAR:* ${fmt(finalTotal)}\n`;
      waMsg += `=========================\n`;
      waMsg += `¡Hola! Acabo de enviar mi pedido de Orígenes Kiosco. Quedo a la espera de su confirmación.`;

      const resolvedDeliveryDay = isAfterCutoff && deliveryMode === 'envio' ? 'next' : 'same';
      const getScheduledDateString = (daysAhead: number): string => {
        const d = new Date();
        d.setDate(d.getDate() + daysAhead);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };
      const resolvedScheduledDate = getScheduledDateString(resolvedDeliveryDay === 'next' ? 1 : 0);
      const resolvedStatus = resolvedDeliveryDay === 'next' ? 'pending_confirmation' : 'pendiente';

      // Process & dispatch order state to container API and App context
      onPlaceOrder({
        items: orderItems,
        subtotal,
        delivery: deliveryMode,
        // Envio realmente cobrado (0 si es gratis), no la tarifa de la zona.
        shipping: shippingCost,
        total: finalTotal,
        qrDiscountAmount,
        ...(appliedCoupon ? {
          couponCode: appliedCoupon.code,
          couponPercent: appliedCoupon.type === 'discount' ? Math.round(appliedCoupon.value * 100) : 0,
          couponDiscountAmount
        } : {}),
        deliveryDay: resolvedDeliveryDay,
        scheduledDate: resolvedScheduledDate
      }, customerName, customerPhone, deliveryMode === 'envio' ? customerLocation : undefined, methodLabel, statusLabel);

      const nextId = orders.length ? Math.max(...orders.map(o => o.id)) + 1 : 1000;
      // Save mock order details
      const simulatedOrder: Order = {
        id: nextId,
        timestamp: new Date().toISOString(),
        items: orderItems,
        subtotal,
        delivery: deliveryMode,
        // Envio realmente cobrado (0 si es gratis), no la tarifa de la zona.
        shipping: shippingCost,
        total: finalTotal,
        qrDiscountAmount,
        ...(appliedCoupon ? {
          couponCode: appliedCoupon.code,
          couponPercent: appliedCoupon.type === 'discount' ? Math.round(appliedCoupon.value * 100) : 0,
          couponDiscountAmount
        } : {}),
        status: resolvedStatus,
        customerName,
        customerPhone,
        customerLocation: deliveryMode === 'envio' ? customerLocation : undefined,
        paymentMethod: methodLabel,
        paymentStatus: statusLabel,
        deliveryDay: resolvedDeliveryDay,
        scheduledDate: resolvedScheduledDate
      };

      // Save order to history matching origenes_orders_{telefono}
      const phoneClean = customerPhone.trim();
      localStorage.setItem('origenes_last_phone', phoneClean);
      const histKey = `origenes_orders_${phoneClean}`;
      let historyList: any[] = [];
      try {
        const existingHist = localStorage.getItem(histKey);
        if (existingHist) {
          historyList = JSON.parse(existingHist);
        }
      } catch (err) {
        console.error(err);
      }
      historyList = [simulatedOrder, ...historyList].slice(0, 10);
      localStorage.setItem(histKey, JSON.stringify(historyList));

      setLastPlacedOrder(simulatedOrder);
      setTrackerDismissed(false);
      setCart({}); // Reset shopping bag
      // Sin esto el cupon y el pago QR quedaban aplicados al pedido siguiente.
      setAppliedCoupon(null);
      setCouponInput('');
      setPaymentMethod('tarjeta_online');
      setBankReceiptChecked(false);
      setCashAmountPaidWith('');
      setShowCheckoutModal(false);
      setShowOrderSummaryScreen(false);

      // El pedido se confirma DENTRO de la app (ya quedó creado en Firestore) y
      // el cliente lo sigue en vivo en la pantalla de confirmación. Ya no se abre
      // WhatsApp: el aviso del pedido nuevo le entra al local por el panel.
    };

    if (paymentMethod === 'tarjeta_online') {
      setIsProcessingPayment(true);
      setPaymentStatusText('Estableciendo conexión encriptada de alta seguridad (SSL 256-bit)...');
      
      setTimeout(() => {
        setPaymentStatusText('Enviando datos confidenciales de la tarjeta...');
        
        setTimeout(() => {
          setPaymentStatusText('Procesando pago neto autoritativo por ' + fmt(finalTotal) + '...');
          
          setTimeout(() => {
            setPaymentStatusText('💳 ¡PAGO APROBADO EXITOSAMENTE! Generando orden...');
            
            setTimeout(() => {
              setIsProcessingPayment(false);
              executeOrderSubmission();
            }, 1000);
          }, 1200);
        }, 1200);
      }, 1000);
    } else {
      executeOrderSubmission();
    }
  };

  const navItemClass = (tab: typeof currentTab) => {
    const active = currentTab === tab;
    return `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-all cursor-pointer active:scale-95 touch-manipulation select-none ${
      active ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-600'
    }`;
  };

  return (
    <div className="w-full flex flex-col h-full bg-slate-50 relative overflow-hidden" id="storefront-root">
      
      {/* Network Connectivity Offline Banner */}
      {!isOnline && (
        <div className="bg-blue-700 text-white font-sans text-xs py-2 px-4 shadow-md font-bold flex items-center justify-between gap-2.5 relative z-50 shrink-0 border-b border-blue-800/30">
          <div className="flex items-center gap-2">
            <WifiOff size={15} className="text-blue-200 animate-pulse shrink-0" />
            <p className="leading-tight text-[11px] text-blue-50">
              ¡Estás sin conexión! Podés seguir viendo los productos, pero algunas funciones como enviar pedidos o sincronizar stock requieren conexión.
            </p>
          </div>
          <button 
            onClick={() => setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)} 
            className="text-[10px] font-black uppercase tracking-wider bg-blue-800 hover:bg-blue-900 border border-blue-600/40 px-2.5 py-1 rounded-lg text-white transition-all transform active:scale-95"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Branded PWA Install Promo Banner */}
      {showInstallBanner && (
        <div className="bg-gradient-to-r from-blue-700 to-blue-600 text-white font-sans p-3.5 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-50 shrink-0 border-b border-blue-800 animate-fade-in">
          <div className="flex gap-2.5 items-center">
            <div className="bg-white p-1 rounded-xl shadow-md shrink-0 w-11 h-11 flex items-center justify-center">
              <img src={origenesLogo} alt="Orígenes Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h4 className="font-extrabold text-[12px] leading-tight flex items-center gap-1">
                <Smartphone size={13} className="text-blue-200" />
                Instalá la App de Orígenes
              </h4>
              <p className="text-[10px] text-blue-100 font-semibold mt-0.5 leading-relaxed">
                Agregala a tu pantalla de inicio para hacer tus pedidos más fácil y rápido, sin pasar por tiendas.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto self-end sm:self-center shrink-0">
            <button 
              onClick={() => {
                sessionStorage.setItem('pwa_prompt_dismissed', 'true');
                setShowInstallBanner(false);
              }}
              className="px-3 py-2 text-[10.5px] bg-blue-800/50 hover:bg-blue-800/40 text-blue-100 font-bold rounded-xl transition-all border border-blue-700/30 flex-1 sm:flex-none text-center cursor-pointer"
            >
              Más tarde
            </button>
            <button 
              onClick={handleInstallClick}
              className="px-3.5 py-2 text-[10.5px] bg-white hover:bg-slate-100 text-blue-600 font-extrabold rounded-xl transition-all shadow-md flex items-center justify-center gap-1 flex-1 sm:flex-none text-center transform active:scale-95 cursor-pointer"
            >
              <Download size={13} strokeWidth={2.8} />
              Instalar App
            </button>
          </div>
        </div>
      )}
      
      {/* Promotional Banners Sync from Firestore */}
      {banners.filter(b => b.isActive && !b.text.toLowerCase().includes('efectivo')).map(b => (
        <div 
          key={b.id} 
          className="bg-blue-400 text-slate-900 font-extrabold text-[10.5px] py-2 px-3 text-center tracking-tight flex items-center justify-center gap-1.5 transition-all shadow-inner border-b border-blue-500/30 animate-fade-in relative z-50 shrink-0"
        >
          <span>{b.text}</span>
        </div>
      ))}

      {/* HEADER BAR - COMPACT PROFESSIONAL POLISH */}
      <header className="bg-white border-b border-slate-200 px-3 py-2 flex-shrink-0 shadow-sm z-50 animate-fade-in" id="storefront-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {currentTab !== 'home' && (
              <button 
                onClick={handleGoBack}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-full transition-all shadow-sm shrink-0 flex items-center justify-center transform active:scale-95"
                title="Volver atrás"
              >
                <ArrowLeft size={14} className="stroke-[3px] text-blue-600" />
              </button>
            )}
            <div className="w-10 h-10 border border-slate-200 rounded-full overflow-hidden shadow-xs shrink-0 transition-transform hover:scale-105 duration-300">
              <img 
                src={origenesLogo} 
                alt="Orígenes Kiosco Logo" 
                className="w-full h-full  object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-xs font-black text-slate-900 tracking-tight leading-none font-sans uppercase">Orígenes Kiosco</h1>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic leading-none mt-0.5">
                Bahía Ushuaia 3120
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
<button
  id="btn-install-guide"
    onClick={() => setShowInstallGuide(true)}
      className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1.5 rounded-lg text-[9.5px] font-black tracking-wide uppercase flex items-center gap-1"
      >
        <Download size={11} strokeWidth={2.8} />
        </button>
                    <button 
              id="btn-my-account"
              onClick={() => setShowAccountModal(true)}
              className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1.5 rounded-lg text-[9.5px] font-black tracking-tight leading-none transition-all flex items-center gap-1 border border-blue-100 shadow-2xs cursor-pointer"
            >
              <User size={11} strokeWidth={2.8} />
              Mi Cuenta
            </button>
            <button 
              id="btn-store-cart"
              onClick={() => setCurrentTab('cart')}
              className="relative p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all text-slate-800 border border-slate-200 shadow-2xs cursor-pointer"
            >
              <ShoppingCart size={13} />
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search Bar - Professional Polish */}
        <div className="relative mt-2">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-500 pointer-events-none">
            <Search size={14} />
          </span>
          <input 
            type="text" 
            placeholder="Buscar gaseosas, chocolates, snacks..."
            aria-label="Buscar productos"
            value={searchQ}
            onChange={(e) => {
              onSearch(e.target.value);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-8 text-xs text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white shadow-sm transition-all"
          />
          {searchQ && (
            <button 
              onClick={() => setSearchQ('')} 
              aria-label="Limpiar búsqueda"
              className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-500 hover:text-slate-700 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}

          {/* Search suggestions tags */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1.5 pb-0.5 items-center">
            {searchHistory.length > 0 && (<span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap select-none">Historial:</span>)}
            {searchHistory.map((term, idx) => (
              <div 
                key={term + idx}
                className="flex items-center bg-slate-100 hover:bg-slate-100 border border-slate-200/80 text-slate-600 text-[10px] font-bold pl-2.5 pr-1 py-0.5 rounded-full transition-all shrink-0 select-none"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSearch(term);
                    handleAddSearchHistory(term);
                  }}
                  className="cursor-pointer active:scale-95 text-slate-600 mr-1 whitespace-nowrap focus:outline-none"
                >
                  {term}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchHistory(prev => {
                      const next = prev.filter((_, i) => i !== idx);
                      localStorage.setItem('origenes_search_history', JSON.stringify(next));
                      return next;
                    });
                  }}
                  className="hover:text-blue-600 hover:scale-110 ml-0.5 cursor-pointer text-[8px] font-extrabold text-slate-500 p-0.5 flex items-center justify-center leading-none"
                  title="Eliminar esta palabra"
                >
                  ✕
                </button>
              </div>
            ))}
            {searchHistory.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchHistory([]);
                  localStorage.removeItem('origenes_search_history');
                }}
                className="text-[8.5px] font-black text-blue-500 hover:text-blue-700 uppercase tracking-wider pl-1 py-0.5 cursor-pointer shrink-0 whitespace-nowrap active:scale-95 focus:outline-none"
                title="Limpiar todo el historial de búsquedas"
              >
                Limpiar todo
              </button>
            )}
          </div>
        </div>
      </header>

      {/* CORE SCREENS SCROLL AREA */}
      <main className="flex-1 overflow-y-auto pb-24 relative">
        <AnimatePresence mode="wait">
          
          {/* HOME SCREEN */}
          {currentTab === 'home' && (
            <m.div 
              key="home"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col p-3 gap-4"
            >
              {/* BRAND CAMPAIGN CAROUSEL */}
              <div className="relative h-44 rounded-2xl overflow-hidden shadow-md text-white bg-gradient-to-tr from-blue-800 via-blue-600 to-blue-500">
                <AnimatePresence mode="wait">
                  {slideIdx === 0 && (
                    <m.div 
                      key="slide0"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-gradient-to-tr from-blue-800 via-blue-600 to-blue-500 p-5 flex flex-col justify-end"
                    >
                      <span className="inline-flex bg-white/20 text-[9px] font-black tracking-widest text-white uppercase px-2 py-0.5 rounded-md mb-2 w-fit backdrop-blur">
                        Novedad
                      </span>
                      <h4 className="text-xl font-extrabold leading-tight text-white mb-1">
                        Nos ampliamos tanto <br />&iexcl;que llegamos a tu casa!
                      </h4>
                      <p className="text-[11px] text-blue-500 bg-white/95 px-2 py-0.5 mt-1 rounded-md font-bold w-fit shadow">
                        Hacé tu pedido y te lo enviamos por <b>Pedidos Va 🛵</b>
                      </p>
                    </m.div>
                  )}

                  {slideIdx === 1 && (
                    <m.div 
                      key="slide1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-gradient-to-tr from-slate-900 via-blue-900 to-blue-700 p-5 flex flex-col justify-end"
                    >
                      <span className="inline-flex bg-blue-500/80 text-[9px] font-black tracking-widest text-black px-2 py-0.5 rounded-md mb-2 w-fit">
                        RAPIDÍSIMO
                      </span>
                      <h4 className="text-xl font-extrabold leading-tight text-white animate-pulse">
                        ¿Retirás en el local o preferís que te lo llevemos con Pedidos Va?
                      </h4>
                      <p className="text-xs text-slate-200 mt-1 mb-2">
                        Pedí de forma online por la app y retirá sin hacer filas ni esperar.
                      </p>
                      <button 
                        onClick={() => { setDeliveryMode('retiro'); setCurrentTab('catalog'); }}
                        className="bg-white text-blue-900 text-[10px] font-bold px-3 py-1.5 rounded-lg w-fit shadow hover:scale-105 transition-transform"
                      >
                        Programar retiro ahora →
                      </button>
                    </m.div>
                  )}

                  {slideIdx === 2 && (
                    <m.div 
                      key="slide2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-gradient-to-tr from-blue-800 to-blue-600 p-5 flex flex-col justify-end"
                    >
                      <span className="inline-flex bg-white/20 text-[9px] font-black tracking-widest text-white uppercase px-2 py-0.5 rounded-md mb-2 w-fit backdrop-blur">
                        Ahorro total
                      </span>
                      <h4 className="text-xl font-extrabold leading-tight text-white mb-1">
                        Combos Económicos
                      </h4>
                      <p className="text-xs text-blue-100 max-w-[280px]">
                        Elegí nuestros combos prearmados diseñados especialmente para rendir más.
                      </p>
                      <button 
                        onClick={() => setCurrentTab('combos')}
                        className="bg-white text-blue-900 text-[10px] font-bold mt-2.5 px-3 py-1.5 rounded-lg w-fit shadow"
                      >
                        Ver Combos 🎁
                      </button>
                    </m.div>
                  )}
                </AnimatePresence>

                {/* Slider indicators */}
                <div className="absolute bottom-3 right-4 flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span 
                      key={i} 
                      className={`w-1.5 h-1.5 rounded-full transition-all ${i === slideIdx ? 'bg-white w-4' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              </div>


              {/* SERVICE CARD SELECTOR - WITH PEDIDOS VA BRANDING */}
              <div className="grid grid-cols-2 gap-3">
                {/* LOCAL RETIRO CARD */}
                <div 
                  onClick={() => { setDeliveryMode('retiro'); setCurrentTab('catalog'); }}
                  className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-blue-500 cursor-pointer transition-all hover:shadow duration-200"
                >
                  <div className="mb-2">
                    <span className="text-2xl">🏪</span>
                    <h5 className="text-[13px] font-bold text-slate-800 mt-1">Retiro en local</h5>
                    <p className="text-[10px] text-slate-500 font-medium">Pedí por la app y retirá sin fila ni demoras</p>
                  </div>
                  <span className="text-[10px] font-extrabold text-blue-600 flex items-center gap-0.5 mt-2">
                    Iniciar retiro →
                  </span>
                </div>

                {/* PEDIDOS VA DELIVERY CARD - BRANDED WITH RED BACKGROUND AND WHITE 'P' */}
                <div 
                  onClick={() => { setDeliveryMode('envio'); setCurrentTab('catalog'); }}
                  className="bg-blue-600 text-white p-3.5 rounded-xl shadow-md flex flex-col justify-between hover:bg-blue-700 cursor-pointer transition-all duration-200 relative overflow-hidden"
                >
                  {/* Watermark brand 'P' background */}
                  <div className="absolute right-[-10px] bottom-[-20px] opacity-15 font-black text-9xl text-white select-none pointer-events-none">
                    P
                  </div>
                  
                  <div className="mb-2 z-10">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-white text-blue-600 font-extrabold text-xs w-5 h-5 rounded flex items-center justify-center shadow-inner">
                        P
                      </span>
                      <span className="text-[10px] font-black tracking-widest text-blue-100 uppercase">PEDIDOS VA</span>
                    </div>
                    <h5 className="text-[13px] font-black mt-2 leading-none">Envío a domicilio</h5>
                    <p className="text-[10px] text-blue-100 mt-1 leading-tight font-medium">Llegamos directo a tu casa en minutos</p>
                  </div>
                  
                  <div className="flex items-center justify-between text-[10px] font-black tracking-wider text-white bg-black/20 px-2 py-1 rounded w-fit z-10">
                    🛵 Pedir envío
                  </div>
                </div>
              </div>

              {/* HISTORIAL/MIS PEDIDOS QUICK LAUNCHER */}
              <button
                type="button"
                onClick={() => {
                  const lastPhone = localStorage.getItem('origenes_last_phone') || '';
                  setHistoryTel(lastPhone);
                  setShowHistoryModal(true);
                }}
                className="w-full bg-white border border-slate-200 hover:border-slate-300 p-3.5 rounded-2xl shadow-xs flex items-center justify-between transition-all hover:shadow cursor-pointer font-sans"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">
                    📦
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-black text-slate-800 tracking-tight block leading-tight">Mis Pedidos Recientes</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Historial y Repetir pedido rápido</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="text-[10.5px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">Ver</span>
                  <ChevronRight size={16} />
                </div>
              </button>

              {/* QUICK CAMPAIGN PILLS */}
              <div className="flex gap-2 py-0.5 overflow-x-auto select-none no-scrollbar">
                <button 
                  onClick={() => { setCurrentCat('all'); setCurrentTab('catalog'); }}
                  className="bg-slate-200/80 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 whitespace-nowrap flex items-center gap-1 shrink-0"
                >
                  🏪 Todo el Catálogo
                </button>
                <button 
                  onClick={() => setCurrentTab('promos')}
                  className="bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 whitespace-nowrap flex items-center gap-1 shrink-0"
                >
                  🔥 Descuentos Activos
                </button>
                <button 
                  onClick={() => setCurrentTab('combos')}
                  className="bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 whitespace-nowrap flex items-center gap-1 shrink-0"
                >
                  🎁 Combos de Ahorro
                </button>
              </div>

              {/* FEATURED OFFERS - "MAS VENDIDOS" SLIDE */} <div className="flex flex-col gap-1.5"> <div className="flex items-center justify-between px-1 mb-1"> <h3 className="text-sm font-extrabold tracking-tight text-slate-800">Categorías</h3> </div> <div className="flex gap-2.5 overflow-x-auto pb-1 select-none no-scrollbar"> {CATS.filter(c => c.id !== 'all').map((c) => ( <button key={c.id} onClick={() => { setCurrentCat(c.id); setCurrentTab('catalog'); }} className="shrink-0 flex flex-col items-center justify-center gap-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 hover:border-blue-300 hover:text-blue-700 text-slate-700 text-xs font-bold whitespace-nowrap" > {c.name} </button> ))} </div></div>
              <div>
                <div className="flex items-center justify-between px-1 mb-2">
                  <h3 className="text-sm font-extrabold tracking-tight text-slate-800 flex items-center gap-1">
                    <Star size={14} className="text-blue-500 fill-blue-500" />
                    Los favoritos más vendidos
                  </h3>
                  <button onClick={() => setCurrentTab('catalog')} className="text-xs font-bold text-blue-600 hover:underline">
                    Ver catálogo
                  </button>
                </div>
                
                <div className="flex gap-3 overflow-x-auto pb-1 select-none no-scrollbar">
                  {(products.filter(p => p.featured && p.inStock).length > 0 ? products.filter(p => p.featured && p.inStock) : products.filter(p => p.inStock).slice(0, 20)).map(p => {
                    const discount = p.orig ? Math.round((1 - p.price / p.orig) * 100) : 0;
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => openProdModal(p)}
                        className="bg-white rounded-xl border border-slate-200/80 hover:border-slate-300 p-2.5 w-36 flex flex-col justify-between shrink-0 cursor-pointer shadow-sm relative transition-all"
                      >
                        {discount > 0 && (
                          <span className="absolute top-2 left-2 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded z-10 shadow-sm animate-pulse">
                            -{discount}%
                          </span>
                        )}

                        <div 
                          style={{ backgroundColor: CAT_BG[p.cat] || '#f1f5f9' }}
                          className="h-24 w-full rounded-lg flex flex-col items-center justify-center gap-1 font-black mb-2 relative overflow-hidden"
                        >
                          {p.image ? (
                            <img 
                              src={p.image} 
                              alt={p.name} 
                              className="w-full h-full object-cover animate-fade-in" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = getFallbackStoreImage(p.name, p.brand, p.cat);
                              }}
                            />
                          ) : (
                            <>
                              <span className="text-3xl opacity-35">{(p.name || '?')[0].toUpperCase()}</span>
                              <span className="text-[8px] tracking-wider text-slate-500 absolute bottom-1 right-2 uppercase font-extrabold">
                                {CAT_ABBR[p.cat] || 'PRD'}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 leading-tight line-clamp-2 mb-1">{p.name}</h4>
                            <p className="text-xs text-slate-500 font-medium leading-none mb-2">{p.brand}</p>
                          </div>
                          
                          <div className="flex items-center justify-between mt-auto">
                            <span className="text-[13px] font-extrabold text-slate-800">{fmt(p.price)}</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); addToCart(p.id); }}
                              aria-label={`Agregar ${p.name} al carrito`}
                              className="w-11 h-11 -m-2 shrink-0 flex items-center justify-center cursor-pointer"
                            >
                              {/* El glifo mantiene su tamano; el area tactil de 44px la da el boton. */}
                              <span className="bg-blue-600 hover:bg-blue-700 text-white w-7 h-7 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform">
                                <Plus size={14} strokeWidth={3} />
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* BRAND ADVERT CAMPAIGN */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
                <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl shrink-0">
                  <Clock size={22} className="animate-beat" />
                </div>
                <div>
                  <h5 className="text-[12.5px] font-bold text-slate-800 leading-tight">Pedidos ultra-rápidos</h5>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-relaxed">
                    Preparación instantánea en tienda o envíos express con el sello exclusivo Pedidos Va.
                  </p>
                </div>
              </div>

              {/* FRESH NEW INFLOWS */}
              <div>
                <h3 className="text-sm font-extrabold tracking-tight text-slate-800 flex items-center gap-1 mb-2 px-1">
                  <Sparkles size={14} className="text-blue-500 fill-blue-500" />
                  Novedades recién llegadas
                </h3>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                  {products.filter(p => p.neww && p.inStock).slice(0, 4).map(p => (
                    <div 
                      key={p.id}
                      onClick={() => openProdModal(p)}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50/50 cursor-pointer transition-colors"
                    >
                      <div 
                        style={{ backgroundColor: CAT_BG[p.cat] || '#f1f5f9' }}
                        className="w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 font-bold overflow-hidden relative"
                      >
                        {p.image ? (
                          <img 
                            src={p.image} 
                            alt={p.name} 
                            className="w-full h-full object-cover animate-fade-in" 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = getFallbackStoreImage(p.name, p.brand, p.cat);
                            }}
                          />
                        ) : (
                          <>
                            <span className="text-lg opacity-40">{(p.name || '?')[0].toUpperCase()}</span>
                            <span className="text-[6px] tracking-widest text-slate-500 uppercase absolute bottom-0.5 leading-none">{CAT_ABBR[p.cat] || 'PRD'}</span>
                          </>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-[13px] font-bold text-slate-800 truncate leading-tight">{p.name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5 font-medium">{p.brand} · <span className="text-xs font-semibold text-slate-500 uppercase">{p.cat}</span></p>
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <span className="text-sm font-extrabold text-slate-800">{fmt(p.price)}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); addToCart(p.id); }}
                          className="bg-blue-600 hover:bg-blue-700 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-sm active:scale-95 text-xs font-black transition-transform"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* PWA INSTALLATION HELPER BLOCK */}
              <div 
                id="pwa-install-helper-card"
                className="hidden bg-slate-100/70 border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3 font-sans mt-2"
              >
                <div className="flex gap-3 items-center">
                  <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl shrink-0 border border-blue-100 shadow-sm">
                    <Smartphone size={20} className="stroke-[2.5]" />
                  </div>
                  <div className="text-left flex-1">
                    <h5 className="text-[12.5px] font-extrabold text-slate-800 leading-tight">Orígenes en tu Celular</h5>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-relaxed">
                      Llevá el kiosco en tu bolsillo. Podés acceder instantáneamente y ver el stock real aunque no tengas buena señal.
                    </p>
                  </div>
                </div>

                <div className="h-px bg-slate-200/60 my-0.5" />

                <div className="text-left space-y-1.5">
                  <p className="text-[10.5px] text-slate-600 font-bold flex items-center gap-1.5 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    En Android (Chrome/Edge): Tocá el botón de instalar o hacelo desde el menú de opciones del navegador.
                  </p>
                  <p className="text-[10.5px] text-slate-600 font-bold flex items-center gap-1.5 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    En iOS / iPhone (Safari): Tocá el botón de Compartir <span className="inline-flex bg-slate-200 px-1 py-0.5 text-[8.5px] rounded border border-slate-300 font-bold mx-0.5">Compartir 📤</span> y luego <span className="font-extrabold text-slate-700">"Agregar a inicio"</span>.
                  </p>
                </div>

                {deferredPrompt ? (
                  <button
                    onClick={handleInstallClick}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] py-2.5 rounded-xl transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-1.5 transform active:scale-[0.98] cursor-pointer"
                  >
                    <Download size={13} strokeWidth={2.5} />
                    Instalar App Ahora 📲
                  </button>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] text-slate-500 font-medium text-center italic">
                    ⭐ Tu navegador ya cuenta con soporte PWA. Agregala desde la barra superior.
                  </div>
                )}
              </div>

            </m.div>
          )}

          {/* CATALOG SCREEN */}
          {currentTab === 'catalog' && (
            <m.div 
              key="catalog"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col"
            >
              {/* Sticky Categories Selector with drag & scroll support on PC */}
              <div 
                ref={catScrollRef}
                onMouseDown={handleCatMouseDown}
                onMouseLeave={handleCatMouseLeaveOrUp}
                onMouseUp={handleCatMouseLeaveOrUp}
                onMouseMove={handleCatMouseMove}
                onWheel={handleCatWheel}
                className="bg-white border-b border-slate-200 p-2.5 flex gap-1.5 overflow-x-auto select-none no-scrollbar sticky top-0 z-40 shadow-sm cursor-grab active:cursor-grabbing"
              >
                <button 
                  onClick={(e) => {
                    if (isDraggingCat.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    setCurrentCat('all');
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all border ${
                    currentCat === 'all' 
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-105' 
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:text-blue-700 text-slate-600'
                  }`}
                >
                  ✨ Todos
                </button>

                <button 
                  onClick={(e) => {
                    if (isDraggingCat.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    setCurrentCat('favorites');
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                    currentCat === 'favorites' 
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-105' 
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:text-blue-700 text-slate-600'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className={currentCat === 'favorites' ? 'text-white' : 'text-blue-500'}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                  Mis Favoritos ({favorites.length})
                </button>
                {CATS.map((c) => (
                  <button 
                    key={c.id}
                    onClick={(e) => {
                      if (isDraggingCat.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      setCurrentCat(c.id);
                    }}
                    className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all border ${
                      currentCat === c.id 
                        ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-105' 
                        : 'bg-white border-slate-200 hover:border-blue-300 hover:text-blue-700 text-slate-600'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* Delivery mode toggler banner */}
              {!isAdminMode && (
                <div className="p-3 bg-slate-100 border-b border-slate-200 text-xs flex items-center justify-between">
                <span className="text-slate-500 font-semibold flex items-center gap-1">
                  <MapPin size={13} className="text-blue-500" />
                  Modo de entrega seleccionado: 
                </span>
                <div className="bg-white rounded-lg p-0.5 border border-slate-200 flex">
                  <button 
                    onClick={() => setDeliveryMode('retiro')}
                    className={`px-2.5 py-1 rounded-md font-bold text-[10px] transition-all uppercase ${
                      deliveryMode === 'retiro' ? 'bg-slate-800 text-white' : 'text-slate-600'
                    }`}
                  >
                    Retiro
                  </button>
                  <button 
                    onClick={() => setDeliveryMode('envio')}
                    className={`px-2.5 py-1 rounded-md font-bold text-[10px] transition-all uppercase ${
                      deliveryMode === 'envio' ? 'bg-blue-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    Pedidos Va 🛵
                  </button>
                </div>
              </div>
            )}

            {/* CATÁLOGO PRINCIPAL DE ARTÍCULOS - DESKTOP/MOBILE COMPATIBLE */}
            <div className="flex-1 w-full flex flex-col pt-1.5" id="store-catalog-body">
              {/* Products List Grid */}
              <div className="p-3 flex flex-col gap-3">

                <div className="flex items-center justify-between text-slate-500 text-[10.5px] font-bold uppercase tracking-wider px-1">
                  <span>Productos en lista</span>
                  <span className="text-slate-500">{getFilteredProducts.length} ítems</span>
                </div>

                {indexErrorUrl && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex flex-col gap-2">
                    <p className="font-bold">⚠️ Falta crear un índice compuesto en Firestore</p>
                    <p className="text-[11px] text-blue-700">Para poder buscar productos por prefijo en esta categoría, necesitas crear el índice compuesto en tu consola de Firebase.</p>
                    <a 
                      href={indexErrorUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-3 py-1.5 rounded-lg text-[10px] w-fit self-start uppercase transition-colors"
                    >
                      Crear índice en Firebase ↗
                    </a>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                  {(productsStatus === 'loading' || isSearching) && getFilteredProducts.length === 0 && Array.from({ length: 8 }).map((_, idx) => (
                    <div key={`skeleton-${idx}`} className="flex items-center gap-3.5 p-4 animate-pulse">
                      <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-4 bg-slate-100 rounded w-2/3" />
                        <div className="h-3 bg-slate-100 rounded w-1/3" />
                        <div className="h-3 bg-slate-100 rounded w-1/4" />
                      </div>
                    </div>
                  ))}

                  {getFilteredProducts.map((p) => {
                    const ok = p.inStock;
                    const qtyInCart = cart[p.id] || 0;
                    return (
                      <div 
                        key={p.id}
                        onClick={() => isAdminMode ? handleOpenEditFormForProduct(p) : openProdModal(p)}
                        className={`flex items-center gap-3.5 p-3 hover:bg-slate-50/50 cursor-pointer transition-colors relative ${
                          !ok ? 'opacity-80 bg-slate-50/30' : ''
                        }`}
                      >
                        <div 
                          style={{ backgroundColor: CAT_BG[p.cat] || '#f1f5f9' }}
                          className="w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 font-black relative shadow-inner overflow-hidden"
                        >
                          {p.image ? (
                            <img 
                              src={p.image} 
                              alt={p.name} 
                              className="w-full h-full object-cover animate-fade-in" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = getFallbackStoreImage(p.name, p.brand, p.cat);
                              }}
                            />
                          ) : (
                            <>
                              <span className="text-xl opacity-35">{(p.name || '?')[0].toUpperCase()}</span>
                              <span className="text-[7px] tracking-wider text-slate-500 uppercase absolute bottom-1 leading-none">
                                {CAT_ABBR[p.cat] || 'PRD'}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-bold text-slate-800 leading-tight truncate">{p.name}</h4>
                            {!isAdminMode && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                                className="w-11 h-11 -m-2.5 flex items-center justify-center text-slate-500 hover:text-blue-500 active:scale-95 transition-all shrink-0 cursor-pointer"
                                aria-label={favorites.includes(p.id) ? `Sacar ${p.name} de favoritos` : `Guardar ${p.name} en favoritos`}
                                aria-pressed={favorites.includes(p.id)}
                                title={favorites.includes(p.id) ? "Sacar de favoritos" : "Guardar en favoritos"}
                              >
                                {favorites.includes(p.id) ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-blue-500 animate-pulse"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                                )}
                              </button>
                            )}
                          </div>
                          <p className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                            {p.brand} {p.orig && <span className="text-[9.5px] text-blue-500 font-bold ml-1.5 uppercase bg-blue-50 px-1 rounded">Oferta</span>}
                          </p>

                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm font-extrabold text-slate-900">{fmt(p.price)}</span>
                            {p.orig && (
                              <span className="text-[10px] text-slate-500 line-through font-medium">
                                {fmt(p.orig)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Cart adjustment control / Direct Gestor Toggles */}
                        <div className="shrink-0 z-10 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          {isAdminMode ? (
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1 shrink-0">
                              {/* Stock Switch */}
                              <button 
                                onClick={() => handleQuickToggleInStock(p)}
                                className={`w-8.5 h-4.5 rounded-full p-0.5 transition-colors relative flex items-center cursor-pointer ${p.inStock ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                title={p.inStock ? 'Con stock - Pausar venta' : 'Pausado - Activar stock'}
                              >
                                <span className={`w-3.5 h-3.5 bg-white rounded-full block shadow transform transition-transform duration-200 ${p.inStock ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                              
                              {/* Edit Button */}
                              <button 
                                onClick={() => handleOpenEditFormForProduct(p)}
                                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
                                title="Editar producto"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                              </button>

                              {/* Delete button */}
                              <button 
                                onClick={() => {
                                  setProductToDelete(p);
                                }}
                                className="p-1.5 bg-blue-100 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-200 transition-colors"
                                title="Eliminar producto"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </div>
                          ) : !ok ? (
                            <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                              Sin Stock
                            </span>
                          ) : qtyInCart > 0 ? (
                            <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full p-0.5 shadow-sm">
                              <button 
                                onClick={(e) => { e.stopPropagation(); changeQty(p.id, -1); }}
                                className="w-6.5 h-6.5 bg-white rounded-full text-blue-600 flex items-center justify-center font-black active:bg-blue-100 hover:shadow-inner text-sm border border-slate-100"
                              >
                                −
                              </button>
                              <span className="text-xs font-extrabold text-slate-800 w-5 text-center">
                                {qtyInCart}
                              </span>
                              <button 
                                onClick={(e) => { e.stopPropagation(); changeQty(p.id, 1); }}
                                className="w-6.5 h-6.5 bg-white rounded-full text-blue-600 flex items-center justify-center font-black active:bg-blue-100 hover:shadow-inner text-sm border border-slate-100"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={(e) => { e.stopPropagation(); addToCart(p.id); }}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-4 py-1.5 text-xs font-black shadow transition-all hover:scale-103 active:scale-97"
                            >
                              Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {productsStatus === 'loadingMore' && (
                    <div className="p-4 flex flex-col gap-3">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <div key={`skeleton-more-${idx}`} className="flex items-center gap-3.5 p-3 animate-pulse">
                          <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0" />
                          <div className="flex-1 space-y-2 py-1">
                            <div className="h-4 bg-slate-100 rounded w-2/3" />
                            <div className="h-3 bg-slate-100 rounded w-1/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {hasMoreProducts && !isSearching && searchProducts === null && productsStatus !== 'loadingMore' && productsStatus !== 'loading' && (
                    <div className="p-4 flex justify-center" id="load-more-container">
                      <button 
                        type="button"
                        onClick={loadMoreProducts} 
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-5 py-2.5 rounded-full transition-all active:scale-95 cursor-pointer border border-slate-200 shadow-sm"
                      >
                        Ver más productos
                      </button>
                    </div>
                  )}

                  {getFilteredProducts.length === 0 && productsStatus !== 'loading' && !isSearching && (
                    <div className="py-12 text-center text-slate-500">
                      <p className="font-extrabold text-sm mb-1">No se encontraron productos</p>
                      <p className="text-[11px] text-slate-500">Intenta buscando otra palabra o categoría.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </m.div>
          )}

          {/* COMBOS SCREEN */}
          {currentTab === 'combos' && (
            <m.div 
              key="combos"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-3 flex flex-col gap-3"
            >
              {combosList.length > 0 && (
                <>
                <div className="bg-blue-700 text-white rounded-2xl p-4 shadow mb-2 relative overflow-hidden">
                <span className="text-3xl absolute right-4 top-4 opacity-15">🎁</span>
                <h4 className="text-sm font-black uppercase tracking-wider text-blue-100">Ahorrá en grande</h4>
                <h3 className="text-lg font-black mt-1">Nuestros Combos Premium</h3>
                <p className="text-xs text-blue-100 mt-1">Combos cerrados con precios especiales para cuidar tu bolsillo.</p>
              </div>

              {combosList.map((c) => (
                <div 
                  key={c.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex gap-3 relative hover:border-slate-300 transition-all"
                >
                  {c.image ? (
                    <img src={c.image} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-200" alt={c.name} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-xl flex flex-col items-center justify-center shrink-0">
                      <span className="text-xs font-black tracking-widest">{c.label}</span>
                      <span className="text-[7.5px] font-black uppercase tracking-widest mt-0.5 text-blue-400">Combo</span>
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[13.5px] font-bold text-slate-800 leading-tight">{c.name}</h4>
                    <p className="text-xs text-slate-500 mt-1 font-medium leading-normal italic">{c.items}</p>
                    
                    <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-slate-100/80">
                      <div>
                        <span className="text-[16px] font-black text-slate-900">{fmt(c.price)}</span>
                        <span className="text-[10.5px] text-slate-500 line-through ml-2 font-medium">{fmt(c.orig)}</span>
                      </div>
                      <span className="text-[9.5px] text-emerald-600 font-extrabold bg-emerald-50 px-2 py-0.5 rounded">
                        Ahorrás {fmt(c.saving)}
                      </span>
                    </div>
                  </div>

                  {/* Combo trigger helper */}
                  <button 
                    onClick={() => {
                      addToCart(c.id, 1);
                      showToast(`${c.name} cargado en tu carrito`);
                    }}
                    className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-black px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all"
                  >
                    Cargar
                  </button>
                </div>
              ))}
              </>
              )}
              {combosList.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
              <p className="font-bold text-slate-700 mb-1">Todavía no tenemos combos armados</p>
              <p className="text-[12px]">Estamos preparando promociones especiales para vos. ¡Volvé pronto para aprovecharlas!</p>
              </div>
              )}
            </m.div>
          )}

          {/* PROMOS SCREEN */}
          {currentTab === 'promos' && (
            <m.div 
              key="promos"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-3 flex flex-col gap-4"
            >
              {PROMOS_LIST.length > 0 && (
                <div>
                <h3 className="text-sm font-extrabold text-slate-800 mb-2 px-1">Ofertas especiales vigentes</h3>
                <div className="grid grid-cols-1 gap-2.5">
                  {PROMOS_LIST.map((p, idx) => (
                    <div 
                      key={idx}
                      className="bg-white rounded-xl border border-slate-100 p-3.5 shadow-sm flex items-center gap-3"
                    >
                      <div 
                        style={{ backgroundColor: p.color }}
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white shrink-0 font-black text-xs"
                      >
                        {p.badge}
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-bold text-slate-800 leading-tight">{p.title}</h4>
                        <p className="text-[10.5px] text-slate-500 font-medium tracking-wide mt-0.5">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}
              {PROMOS_LIST.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
              <p className="font-bold text-slate-700 mb-1">Todavía no tenemos ofertas activas</p>
              <p className="text-[12px]">Estamos preparando promociones especiales para vos. ¡Volvé pronto para aprovecharlas!</p>
              </div>
              )}

              <div>
                <h3 className="text-sm font-extrabold text-slate-800 mb-2 px-1">Productos con descuento directo</h3>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
                  {products.filter(p => p.orig && p.inStock).map((p) => {
                    const discount = Math.round((1 - p.price / p.orig!) * 100);
                    return (
                      <div 
                        key={p.id}
                        onClick={() => openProdModal(p)}
                        className="flex items-center gap-3 p-3 hover:bg-slate-50/50 cursor-pointer transition-colors"
                      >
                        <div 
                          style={{ backgroundColor: CAT_BG[p.cat] || '#f1f5f9' }}
                          className="w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 font-bold relative overflow-hidden"
                        >
                          {p.image ? (
                            <img 
                              src={p.image} 
                              alt={p.name} 
                              className="w-full h-full object-cover animate-fade-in" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = getFallbackStoreImage(p.name, p.brand, p.cat);
                              }}
                            />
                          ) : (
                            <>
                              <span className="text-base opacity-45">{(p.name || '?')[0].toUpperCase()}</span>
                              <span className="text-[6.5px] tracking-wider text-slate-500 absolute bottom-1 leading-none uppercase">
                                {CAT_ABBR[p.cat] || 'PRD'}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-[13px] font-bold text-slate-800 truncate leading-tight">{p.name}</h4>
                          <span className="inline-block bg-blue-50 text-blue-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded mt-0.5 uppercase tracking-wide">
                            Ahorrás {discount}%
                          </span>
                        </div>

                        <div className="text-right shrink-0 pr-1">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[11.5px] text-slate-500 line-through font-medium">{fmt(p.orig!)}</span>
                            <span className="text-[13.5px] font-black text-blue-600">{fmt(p.price)}</span>
                          </div>
                        </div>

                        <button 
                          onClick={(e) => { e.stopPropagation(); addToCart(p.id); }}
                          className="bg-blue-600 hover:bg-blue-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shadow"
                        >
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </m.div>
          )}

          {/* CART SCREEN */}
          {currentTab === 'cart' && (
            <m.div 
              key="cart"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-3 flex flex-col gap-4"
            >
              <h3 className="text-base font-extrabold text-slate-800 px-1 leading-none flex items-center gap-1.5">
                <ShoppingBag className="text-blue-600" size={17} />
                Resumen de tu compra
              </h3>

              {totalItems === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4 shadow-inner">
                    <ShoppingCart size={28} />
                  </div>
                  <h4 className="font-extrabold text-slate-700 text-base mb-1">Tu carrito está vacío</h4>
                  <p className="text-xs text-slate-500 max-w-[240px] leading-relaxed mb-6">
                    Explorá nuestro catálogo y sumá tus artículos de kiosco favoritos.
                  </p>
                  <button 
                    onClick={() => setCurrentTab('catalog')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transform active:scale-95 transition-all"
                  >
                    Volver al catálogo
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  
                  {/* Cart items list card */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                    {Object.entries(cart).map(([idStr, qtyVal]) => {
                      const qty = Number(qtyVal);
                      if (idStr.startsWith('c')) {
                        const c = combosList.find(x => x.id === idStr);
                        if (!c) return null;
                        return (
                          <div key={c.id} className="flex items-center gap-3.5 p-3.5">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 font-bold text-lg select-none">
                              🎁
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{c.name}</h4>
                              <p className="text-xs text-slate-500 mt-0.5 truncate leading-tight italic">{c.items}</p>
                              <span className="text-xs font-extrabold text-slate-950 block mt-1">
                                {fmt(c.price * qty)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
                                <button 
                                  onClick={() => changeQty(c.id, -1)}
                                  aria-label="Quitar una unidad"
                                  className="w-11 h-11 -m-2.5 flex items-center justify-center cursor-pointer"
                                >
                                  <span className="w-6 h-6 bg-white rounded-full text-slate-700 flex items-center justify-center font-bold text-xs">−</span>
                                </button>
                                <span className="text-xs font-bold text-slate-800 w-4.5 text-center">
                                  {qty}
                                </span>
                                <button 
                                  onClick={() => changeQty(c.id, 1)}
                                  aria-label="Agregar una unidad"
                                  className="w-11 h-11 -m-2.5 flex items-center justify-center cursor-pointer"
                                >
                                  <span className="w-6 h-6 bg-white rounded-full text-slate-700 flex items-center justify-center font-bold text-xs">+</span>
                                </button>
                              </div>

                              <button 
                                onClick={() => removeFromCart(c.id)}
                                aria-label="Quitar del carrito"
                                className="w-11 h-11 -m-2.5 flex items-center justify-center text-slate-500 hover:text-red-600 rounded-full hover:bg-red-50/50 transition-colors cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      } else {
                        const p = products.find(x => x.id === parseInt(idStr));
                        if (!p) return null;
                        return (
                          <div key={p.id} className="flex items-center gap-3.5 p-3.5">
                            {cartThumb(p)}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{p.name}</h4>
                              <p className="text-xs text-slate-500 mt-0.5">{p.brand}</p>
                              <span className="text-xs font-extrabold text-slate-950 block mt-1">
                                {fmt(p.price * qty)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
                                <button 
                                  onClick={() => changeQty(p.id, -1)}
                                  aria-label="Quitar una unidad"
                                  className="w-11 h-11 -m-2.5 flex items-center justify-center cursor-pointer"
                                >
                                  <span className="w-6 h-6 bg-white rounded-full text-slate-700 flex items-center justify-center font-bold text-xs">−</span>
                                </button>
                                <span className="text-xs font-bold text-slate-800 w-4.5 text-center">
                                  {qty}
                                </span>
                                <button 
                                  onClick={() => changeQty(p.id, 1)}
                                  aria-label="Agregar una unidad"
                                  className="w-11 h-11 -m-2.5 flex items-center justify-center cursor-pointer"
                                >
                                  <span className="w-6 h-6 bg-white rounded-full text-slate-700 flex items-center justify-center font-bold text-xs">+</span>
                                </button>
                              </div>

                              <button 
                                onClick={() => removeFromCart(p.id)}
                                aria-label="Quitar del carrito"
                                className="w-11 h-11 -m-2.5 flex items-center justify-center text-slate-500 hover:text-red-600 rounded-full hover:bg-red-50/50 transition-colors cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>

                  {/* CROSS-SELLING (CROSELLER) OFERTAS RECOMENDADAS */}
                  {crossSellProducts.length > 0 && (
                    <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/5 border border-blue-500/15 rounded-2xl p-4 text-left shadow-xs flex flex-col gap-2.5 animate-fade-in" id="cross-sell-section">
                      <div className="flex justify-between items-center px-0.5">
                        <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 leading-none">
                          <Sparkles className="text-blue-600 animate-pulse" size={13} />
                          ¡Aprovechá y sumá al carrito!
                        </h4>
                        <span className="text-[9px] font-black bg-blue-600/10 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Ofertas
                        </span>
                      </div>

                      {/* Horizontal scroller containing custom cross-selling cards */}
                      <div className="flex gap-3 overflow-x-auto pb-1.5 pt-0.5 px-0.5 select-none no-scrollbar snap-x">
                        {crossSellProducts.map((p) => {
                          const bg = CAT_BG[p.cat] || '#f1f5f9';
                          const hasDiscount = p.orig !== null && p.orig > p.price;
                          const pctDiscount = hasDiscount ? Math.round(((p.orig! - p.price) / p.orig!) * 100) : 0;

                          return (
                            <div 
                              key={p.id} 
                              className="w-[120px] bg-white border border-slate-100 rounded-xl p-2.5 shadow-xs flex flex-col justify-between shrink-0 hover:border-blue-400 transition-all cursor-pointer hover:shadow-sm snap-start relative group"
                              onClick={() => {
                                changeQty(p.id, 1);
                                showToast(`➕ ${p.name} sumado al carrito`);
                              }}
                            >
                              {/* Corner percentage discount badge */}
                              {hasDiscount && (
                                <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md leading-none z-10 shadow-sm animate-pulse">
                                  {pctDiscount}% OFF
                                </span>
                              )}

                              {/* Small thumbnail container with fallback helper */}
                              <div 
                                style={{ backgroundColor: bg }}
                                className="w-full aspect-square rounded-lg flex items-center justify-center overflow-hidden mb-2 shadow-inner shrink-0 relative"
                              >
                                {p.image ? (
                                  <img 
                                    src={p.image} 
                                    alt={p.name} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      e.currentTarget.onerror = null;
                                      e.currentTarget.src = getFallbackStoreImage(p.name, p.brand, p.cat);
                                    }}
                                  />
                                ) : (
                                  <span className="font-bold text-slate-800 text-sm">
                                    {p.name[0]}
                                  </span>
                                )}
                              </div>

                              {/* Details and Action CTA */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between mt-0.5">
                                <div>
                                  <h5 className="text-[10.5px] font-black text-slate-800 line-clamp-2 leading-tight tracking-tight mb-0.5 min-h-[26px]">
                                    {p.name}
                                  </h5>
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight block leading-none mb-1.5 hover:text-blue-500 truncate">
                                    {p.brand}
                                  </span>
                                </div>

                                {/* Dynamic Price details and single-click sumar button */}
                                <div>
                                  <div className="flex items-baseline gap-1 flex-wrap">
                                    <span className="text-xs font-black text-slate-900 font-mono">
                                      {fmt(p.price)}
                                    </span>
                                    {hasDiscount && (
                                      <span className="text-[8.5px] font-bold text-slate-500 line-through font-mono">
                                        {fmt(p.orig)}
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    className="w-full mt-2 bg-slate-50 border border-slate-100 group-hover:border-blue-500 group-hover:bg-blue-50 hover:bg-blue-600 text-slate-700 group-hover:text-blue-600 text-[9.5px] font-black py-1 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                                  >
                                    <span>Sumar</span>
                                    <span className="text-xs font-bold leading-none">+</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SHIPPING MODE SELECTOR - PEDIDOS VA DISPLAY */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4.5 shadow-sm text-left">
                    <h5 className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none mb-3">
                      Seleccioná método de despacho:
                    </h5>
                    
                    <div className="grid grid-cols-2 gap-3.5 bg-slate-100 p-1 rounded-xl">
                      
                      {/* Retiro */}
                      <button 
                        onClick={() => setDeliveryMode('retiro')}
                        className={`py-2.5 text-xs font-black rounded-lg transition-all ${
                          deliveryMode === 'retiro' 
                            ? 'bg-white shadow text-slate-900 border border-slate-200' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        🏪 RETIRO LOCAL
                      </button>

                      {/* Pedidos Va red styled */}
                      <button 
                        onClick={() => setDeliveryMode('envio')}
                        className={`py-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                          deliveryMode === 'envio' 
                            ? 'bg-blue-600 text-white shadow shadow-blue-200 font-extrabold' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <span className="bg-white/20 text-white px-1 rounded text-[9px] font-black">P</span>
                        PEDIDOS VA
                      </button>
                    </div>
                  </div>

                  {/* PRICE ORDER BREAKDOWN - INFORMATION SHOWN BEFORE PURCHASE */}
                  <div className="bg-slate-900 text-white rounded-2xl p-5.5 shadow-xl flex flex-col gap-3.5 mt-1 text-left" id="order-cost-breakdown">
                    <div className="flex justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
                      <span>Subtotal de productos ({totalItems})</span>
                      <span className="font-mono">{fmt(subtotal)}</span>
                    </div>
                    {deliveryMode === 'envio' ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-blue-400 text-xs font-bold uppercase tracking-wider">
                          <span>Costo de Envío {deliveryDistance ? `(${deliveryDistance})` : "(Zonal)"}</span>
                          {isFreeShipping ? (
                            <span className="font-mono text-emerald-400">Gratis</span>
                          ) : (
                            <span className="font-mono">{fmt(dynamicShippingCost)}</span>
                          )}
                        </div>
                        {isFirstOrderOfDayFreeShipping && !(appliedCoupon && appliedCoupon.type === 'shipping_free') && (
                          <p className="text-[10px] text-emerald-400 font-bold italic">🎉 ¡Envío gratis por ser el primer pedido del día! (mín. $20.000)</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
                        <span>Costo de Envío</span>
                        <span className="font-mono text-emerald-400">Gratis (Retiro)</span>
                      </div>
                    )}
                    {hasQRDiscount && (
                      <div className="flex justify-between text-emerald-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                        <span>Descuento QR (10%)</span>
                        <span className="font-mono">-{fmt(qrDiscountAmount)}</span>
                      </div>
                    )}
                    {appliedCoupon && (
                      <div className="flex justify-between text-blue-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                        <span>Cupón Descuento ({appliedCoupon.code})</span>
                        <span className="font-mono">
                          {appliedCoupon.type === 'discount' ? `-${Math.round(appliedCoupon.value * 100)}%` : 'Envío Gratis'}
                        </span>
                      </div>
                    )}
                    <div className="h-px bg-slate-800 my-1"></div>
                    <div className="flex justify-between items-end">
                      <span className="text-sm font-bold uppercase tracking-wide text-slate-200">TOTAL A PAGAR</span>
                      <span className="text-3xl font-black font-mono tracking-tighter text-blue-500">{fmt(finalTotal)}</span>
                    </div>

                    <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 flex items-start gap-2 mt-1">
                      <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-slate-300 leading-relaxed font-semibold">
                        El costo de envío es visualizado de forma transparente previa confirmación de la compra. Pagás al recibir o retirar sucursal.
                      </p>
                    </div>
                  </div>

                  {/* SELECTOR DE MÉTODO DE PAGO EN CARRITO */}
                  <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-3 my-3.5 space-y-2 select-none">
                    <label className="text-[10px] font-black text-slate-200 uppercase tracking-widest block text-center">
                      💳 Seleccioná tu forma de pago
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 bg-slate-900/60 p-1 rounded-xl text-center">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('tarjeta_online')}
                        className={`min-h-[44px] py-2 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                          paymentMethod === 'tarjeta_online'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                        }`}
                      >
                        💳 Tarjeta
                      </button>
                      <button
                        type="button"
                        onClick={selectQRPayment}
                        className={`relative min-h-[44px] py-2 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                          paymentMethod === 'transferencia_qr'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                        }`}
                      >
                        📱 Pago QR
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('efectivo')}
                        className={`min-h-[44px] py-2 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                          paymentMethod === 'efectivo'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                        }`}
                      >
                        💵 Efectivo
                      </button>
                    </div>
                  </div>

                  {deliveryMode === 'envio' && subtotal < ENVIO_MINIMO && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 font-bold mb-3 animate-pulse">
                      ⚠️ Monto mínimo para envío: ${ENVIO_MINIMO.toLocaleString('es-AR')}. 
                      Te faltan ${(ENVIO_MINIMO - subtotal).toLocaleString('es-AR')} para llegar.
                    </div>
                  )}

                  {/* WhatsApp send trigger */}
                  <button 
                    id="btn-confirm-order-whatsapp"
                    disabled={deliveryMode === 'envio' && subtotal < ENVIO_MINIMO}
                    onClick={handleProceedToCheckout}
                    className={`w-full text-white font-black py-4 rounded-2xl shadow-lg text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 ${
                      deliveryMode === 'envio' && subtotal < ENVIO_MINIMO 
                        ? 'bg-slate-300 border border-slate-200 cursor-not-allowed text-slate-500 shadow-none' 
                        : 'bg-blue-700 hover:bg-blue-800 shadow-blue-200/50 cursor-pointer active:scale-95'
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    Confirmar pedido
                  </button>

                  <button 
                    onClick={handleGoBack}
                    className="w-full bg-white hover:bg-slate-50 text-slate-700 font-extrabold py-3.5 rounded-2xl text-xs tracking-wide transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200"
                  >
                    <ArrowLeft size={14} className="stroke-[2.5px]" />
                    Seguir Comprando
                  </button>

                </div>
              )}
            </m.div>
          )}

        </AnimatePresence>
      </main>

      {/* CORE MODAL FOR OUT-OF-STOCK PRODUCT AND SIMILAR SUGGESTIONS */}
      <AnimatePresence>
        {selectedProduct && (
          <Modal
            id="prod-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center cursor-pointer"
            onClose={() => setSelectedProduct(null)}
            labelledBy="prod-modal-wrapper-title"
          >
            <m.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white w-full max-w-md rounded-t-2xl max-h-[85vh] overflow-y-auto flex flex-col relative cursor-default"
              id="prod-modal-body"
            >
              {/* Visible Close Button (X) */}
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="absolute top-2.5 right-3.5 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer z-10"
                title="Cerrar detalle"
                aria-label="Cerrar detalle"
              >
                <X size={14} className="stroke-[2.5px]" />
              </button>

              {/* Drawer handle indicator */}
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto my-3" />

              <div className="px-4 pb-4">
                {/* Image Placeholder */}
                <div 
                  style={{ backgroundColor: CAT_BG[selectedProduct.cat] || '#f1f5f9' }}
                  className="h-32 w-full rounded-xl flex flex-col items-center justify-center relative font-black text-white overflow-hidden shadow-inner"
                >
                  {selectedProduct.image ? (
                    <img 
                      src={selectedProduct.image} 
                      alt={selectedProduct.name} 
                      className="w-full h-full object-cover animate-fade-in" 
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = getFallbackStoreImage(selectedProduct.name, selectedProduct.brand, selectedProduct.cat);
                      }}
                    />
                  ) : (
                    <>
                      <span className="text-5xl opacity-35">{(selectedProduct.name || '?')[0].toUpperCase()}</span>
                      <span className="text-[10px] tracking-widest text-slate-500 border border-slate-300 px-2 py-0.5 rounded-md uppercase font-extrabold absolute bottom-2 right-3 leading-none">
                        {CAT_ABBR[selectedProduct.cat] || 'PRD'}
                      </span>
                    </>
                  )}
                  
                  {!selectedProduct.inStock && (
                    <div className="absolute inset-x-0 bottom-0 bg-red-600 text-white text-center py-1 text-xs font-black tracking-wiest uppercase shadow z-10">
                      Sin Stock Disponible
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <h3 id="prod-modal-wrapper-title" className="text-base font-extrabold text-slate-800 leading-tight">{selectedProduct.name}</h3>
                  <p className="text-xs text-slate-500 font-bold mt-0.5">{selectedProduct.brand}</p>
                  
                  {selectedProduct.desc && (
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      {selectedProduct.desc}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-4">
                    <span className="text-xl font-black text-slate-900">{fmt(selectedProduct.price)}</span>
                    {selectedProduct.orig && (
                      <span className="text-xs text-slate-500 line-through font-medium leading-none">
                        {fmt(selectedProduct.orig)}
                      </span>
                    )}
                  </div>
                </div>

                {/* LOGIC COMPONENT FOR "SIMILARES" (Alternative items) IF INSUFFICIENT STOCK */}
                {!selectedProduct.inStock && (
                  <div className="mt-5 border-t border-slate-100 pt-4" id="section-similar-products">
                    <div className="flex items-center gap-1.5 text-blue-600 text-xs font-black uppercase tracking-wider mb-2.5">
                      <Info size={13} />
                      Sugerencia de productos similares:
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2.5">
                      {getSimilarProductsSelected.map(p => (
                        <div 
                          key={p.id}
                          onClick={() => {
                            setSelectedProduct(p);
                            setPmQty(1);
                          }}
                          className="bg-white rounded-xl border border-slate-200 p-2 text-left hover:border-slate-300 cursor-pointer flex flex-col justify-between"
                        >
                          <div 
                            style={{ backgroundColor: CAT_BG[p.cat] || '#e2e8f0' }}
                            className="h-14 w-full rounded flex items-center justify-center text-lg font-black text-slate-500/40 relative mb-1.5 overflow-hidden"
                          >
                            {p.image ? (
                              <img 
                                src={p.image} 
                                alt={p.name} 
                                className="w-full h-full object-cover animate-fade-in" 
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = getFallbackStoreImage(p.name, p.brand, p.cat);
                                }}
                              />
                            ) : (
                              (p.name || '?')[0].toUpperCase()
                            )}
                          </div>
                          <span className="text-[10.5px] font-extrabold text-slate-800 truncate block leading-none">{p.name}</span>
                          <span className="text-xs text-slate-500 block mt-0.5 leading-none">{p.brand}</span>
                          <div className="flex items-center justify-between mt-2.5 pt-1.5 border-t border-slate-100">
                            <span className="text-[11px] font-black text-slate-900">{fmt(p.price)}</span>
                            <span className="text-[8.5px] text-blue-600 font-extrabold bg-blue-50 px-1 rounded uppercase">Agregar</span>
                          </div>
                        </div>
                      ))}
                      
                      {getSimilarProductsSelected.length === 0 && (
                        <p className="text-[10.5px] text-slate-500 py-1 font-medium italic col-span-2">
                          No encontramos otros productos similares en la misma categoría activos ahora.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Modal controls */}
                <div className="flex items-center justify-between border-t border-slate-100 mt-5 pt-4">
                  {selectedProduct.inStock ? (
                    <>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setPmQty(prev => Math.max(1, prev - 1))}
                          className="w-10 h-10 border border-slate-200 bg-slate-50 text-slate-800 rounded-full flex items-center justify-center font-bold"
                        >
                          −
                        </button>
                        <span className="text-base font-extrabold text-slate-900 w-8 text-center">{pmQty}</span>
                        <button 
                          onClick={() => setPmQty(prev => prev + 1)}
                          className="w-10 h-10 border border-slate-200 bg-slate-100 text-slate-800 rounded-full flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                      </div>

                      <button 
                        onClick={() => {
                          addToCart(selectedProduct.id, pmQty);
                          setSelectedProduct(null);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 px-6 text-xs font-black shadow flex-1 ml-4"
                      >
                        Agregar al carrito ({fmt(selectedProduct.price * pmQty)})
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => setSelectedProduct(null)}
                      className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 w-full text-xs font-bold shadow"
                    >
                      Cerrar detalle
                    </button>
                  )}
                </div>
              </div>
            </m.div>
          </Modal>
        )}
      </AnimatePresence>
      {/* INSTALL APP GUIDE MODAL */}
      {showInstallGuide && (
      <Modal
        id="install-guide-wrapper"
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        onClose={() => setShowInstallGuide(false)}
        labelledBy="install-guide-wrapper-title"
      >
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden max-h-[85vh] flex flex-col" id="install-guide-body">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
      <h3 id="install-guide-wrapper-title" className="font-black text-slate-800 text-sm flex items-center gap-2">
      <Smartphone size={16} /> Como instalar la app
      </h3>
      <button onClick={() => setShowInstallGuide(false)} className="text-slate-500 hover:text-slate-700">
      <X size={20} />
      </button>
      </div>
      <div className="p-4 space-y-4 text-xs text-slate-700 overflow-y-auto">
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">En iPhone / iPad (Safari)</p>
      <ol className="list-decimal list-inside space-y-1">
      <li>Abri esta pagina en Safari.</li>
      <li>Toca el icono Compartir (el cuadrado con la flecha hacia arriba).</li>
      <li>Elegi la opcion "Agregar a la pantalla de inicio".</li>
      <li>Toca "Agregar". Listo, ya tenes el icono en tu pantalla.</li>
      </ol>
      </div>
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">En Android (Chrome)</p>
      <ol className="list-decimal list-inside space-y-1">
      <li>Abri esta pagina en Chrome.</li>
      <li>Toca el menu de tres puntos arriba a la derecha.</li>
      <li>Elegi "Instalar app" o "Agregar a pantalla de inicio".</li>
      <li>Confirma tocando "Instalar".</li>
      </ol>
      </div>
      </div>
      <div className="p-4 border-t border-slate-100">
      <button onClick={() => setShowInstallGuide(false)} className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 w-full text-xs font-bold">
      Entendido
      </button>
      </div>
      </div>
      </Modal>
      )}
      

      {/* LOYALTY PROFILE & ACCOUNT & ORDERS HISTORY SHEET */}
      <AnimatePresence>
        {showAccountModal && (
          <Modal
            id="account-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
            onClose={() => setShowAccountModal(false)}
            labelledBy="account-modal-wrapper-title"
          >
            <m.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white w-full max-w-md rounded-t-3xl max-h-[88vh] overflow-y-auto flex flex-col pointer-events-auto"
              id="account-modal-body"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-3xl sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                    <User size={16} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 id="account-modal-wrapper-title" className="text-sm font-extrabold text-slate-800">Mi Perfil y Pedidos</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Socio Orígenes Plus</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAccountModal(false)}
                  className="bg-slate-200/60 hover:bg-slate-200 text-slate-700 w-7 h-7 rounded-full flex items-center justify-center font-black text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 flex-1 flex flex-col gap-4">
                {/* 1. Membership Card / Loyality progress */}
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-4.5 rounded-2xl shadow-md relative overflow-hidden">
                  <div className="absolute -right-6 -bottom-6 opacity-10 text-white transform rotate-12">
                    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black tracking-widest uppercase bg-white/25 px-2 py-0.5 rounded-full mb-1 inline-block">Nivel Bronze</span>
                      <h4 className="text-sm font-bold truncate">{(currentUser?.displayName || phoneUserObj?.displayName || 'Socio Invitado')}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest leading-none">Puntos Club</p>
                      <p className="text-xl font-black mt-1 leading-none">{fidelityPoints} pts</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between items-center text-[10px] text-blue-100 font-bold mb-1">
                      <span>Próxima recompensa (Alfajor Milka gratis!)</span>
                      <span>{fidelityPoints}/500 pts</span>
                    </div>
                    <div className="w-full bg-blue-950/40 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-400 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((fidelityPoints / 500) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                </div>

                {/* Login or user connection options */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  {currentUser || isPhoneLoggedIn ? (
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                          <span className="text-xs font-semibold text-slate-700">Sesión activa ({currentUser?.email || phoneUserObj?.phoneNumber})</span>
                        </div>
                        <button 
                          onClick={() => {
                            if (currentUser) {
                              if (onSignOut) onSignOut();
                            } else {
                              handlePhoneLogout();
                            }
                            setShowAccountModal(false);
                          }}
                          className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                        >
                          Cerrar sesión
                        </button>
                      </div>
                      {isAdmin && (
                        <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                            🔑 Perfil Administrador
                          </span>
                          <button
                            onClick={() => {
                              setShowAccountModal(false);
                              openAdminPanel();
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10.5px] uppercase tracking-wide px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs"
                          >
                            Ir al Panel Admin
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-700 mb-2">Iniciá sesión para guardar tus direcciones, cupones e historial:</p>
                      {signInError && (
                        <p role="alert" className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 mb-2">
                          {signInError}
                        </p>
                      )}
                      <div className="flex flex-col gap-2">
                        {onSignInGoogle && (
                          <button
                            disabled={signInState === 'pending' || signInState === 'redirecting'}
                            onClick={() => {
                              onSignInGoogle();
                              setShowAccountModal(false);
                            }}
                            className="bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed border border-slate-200 rounded-xl py-2 px-3 flex items-center justify-center gap-2 text-xs font-black text-slate-700 transition-all cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 48 48"><path fill="#fbc02d" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#e1261c" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4caf50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1565c0" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l.003-.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                            Iniciar sesión con Google
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            setPhoneStep('phone');
                            setPhoneInput('');
                            setPhoneCodeInput('');
                            setShowPhoneLoginModal(true);
                          }}
                          className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2 px-3 flex items-center justify-center gap-2 text-xs font-black transition-all cursor-pointer"
                        >
                          <Phone size={13} />
                          Iniciar con Celular (SMS)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Promo Coupons Quick Input */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Sparkles size={12} className="text-blue-500" />
                    Canjear Cupón de Descuento
                  </h4>
                  <label htmlFor="checkout-coupon" className="sr-only">Código de cupón de descuento</label>
                  <div className="flex gap-2">
                    <input 
                      id="checkout-coupon"
                      type="text" 
                      placeholder="Ej: DESCUENTO10" 
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex-1 text-xs font-semibold focus:outline-none uppercase"
                    />
                    <button 
                      onClick={handleApplyCoupon}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer"
                    >
                      Aplicar
                    </button>
                  </div>
                  {couponError && <p role="alert" className="text-xs text-red-600 font-bold mt-1.5">{couponError}</p>}
                  {appliedCoupon && (
                    <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-xl mt-2 flex items-center justify-between text-xs text-emerald-800 font-bold">
                      <span>Cupón ACTIVO: {appliedCoupon.code}</span>
                      <button 
                        onClick={() => {
                          setAppliedCoupon(null);
                          setCouponInput('');
                          showToast('❌ Cupón removido');
                        }}
                        className="text-blue-600 hover:underline hover:scale-105 transition-transform"
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                  <p className="text-[9.5px] text-slate-500 mt-2 font-medium leading-relaxed">
                    Probá ingresando el cupón <strong className="text-slate-500 select-all font-bold">DESCUENTO10</strong> (10% de descuento total), <strong className="text-slate-500 select-all font-bold">CANDY20</strong> (20%), o <strong className="text-slate-500 select-all font-bold">ENVIO_GRATIS</strong>.
                  </p>
                </div>

                {/* 3. Address Quick Manager for return flow */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <MapPin size={12} className="text-slate-500" />
                    Últimas Direcciones Guardadas
                  </h4>
                  {addressStreet ? (
                    <div className="flex items-start gap-2 text-xs">
                      <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-600 font-bold text-center leading-normal">📍</div>
                      <div className="flex-1">
                        <p className="font-extrabold text-slate-800 truncate">{addressStreet}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Complemento: {addressUnit || 'No especificado'} Ref: {addressNotes || 'No especificado'}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic font-medium">Buscá y cargá tu dirección en el Carrito para que quede agendada.</p>
                  )}
                </div>

                {/* 4. Past orders List (Volver a pedir) */}
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Clock size={12} className="text-slate-500" />
                    Historial de Pedidos ({getCustomerPastOrders.length})
                  </h4>
                  <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {getCustomerPastOrders.map((o) => {
                      const orderDate = o.timestamp ? parseOrderDate(o.timestamp) : new Date();
                      const dateText = orderDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                      return (
                        <div 
                          key={o.id}
                          className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:shadow-2xs transition-shadow"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <p className="text-[11px] font-black text-slate-700">Pedido #{o.id}</p>
                              <p className="text-[9.5px] text-slate-500 font-bold">{dateText}</p>
                            </div>
                             <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                              o.status === 'pending_confirmation' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                              o.status === 'entregado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                              o.status === 'confirmado' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                              o.status === 'listo' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                              o.status === 'cancelado' ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                              'bg-blue-50 text-blue-700 border border-blue-100'
                            }`}>
                              {o.status === 'pending_confirmation' ? `Programado (${o.scheduledDate ? o.scheduledDate.split('-').reverse().join('/') : 'Mañana'})` :
                               o.status === 'entregado' ? 'Entregado' : 
                               o.status === 'confirmado' ? 'Confirmado' :
                               o.status === 'listo' ? 'Listo' : 
                               o.status === 'cancelado' ? 'Cancelado' : 'Pendiente'}
                            </span>
                          </div>

                          <div className="h-px bg-slate-100 my-1.5 font-sans"></div>

                          <div className="text-[10.5px] text-slate-500 font-semibold line-clamp-2 leading-relaxed">
                            {o.items?.map(it => `${it.qty}x ${it.name}`).join(', ') || 'Productos mixtos'}
                          </div>

                          <div className="flex justify-between items-center mt-2.5">
                            <span className="text-xs font-black text-slate-800">Total: {fmt(o.total)}</span>
                            <button 
                              onClick={() => {
                                handleRepeatOrder(o);
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-[10px] font-black tracking-tight leading-none cursor-pointer flex items-center gap-1 transition-all"
                            >
                              <FastForward size={10} className="stroke-[3.5px]" />
                              Volver a pedir
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {getCustomerPastOrders.length === 0 && (
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 text-center text-slate-500">
                        <p className="text-xs font-bold mb-0.5">Sin pedidos registrados todavía</p>
                        <p className="text-[10px] text-slate-500 font-medium">Tus compras con este celular u mail se guardarán acá automáticamente.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col gap-2">
                <button 
                  onClick={() => setShowAccountModal(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-2.5 text-xs font-black transition-all cursor-pointer text-center block"
                >
                  Regresar a la Tienda
                </button>
              </div>
            </m.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* PHONE VALIDATION SMS MODAL */}
      <AnimatePresence>
        {showPhoneLoginModal && (
          <Modal
            id="phone-login-modal-wrapper"
            className="fixed inset-0 bg-black/70 z-55 flex items-center justify-center p-4 shadow-xl"
            onClose={() => setShowPhoneLoginModal(false)}
            labelledBy="phone-login-modal-wrapper-title"
          >
            <m.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col border border-slate-100 p-5 relative"
              id="phone-login-body"
            >
              <button
                onClick={() => setShowPhoneLoginModal(false)}
                aria-label="Cerrar"
                className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
              <h3 id="phone-login-modal-wrapper-title" className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5 mb-1.5 pr-10">
                <Phone size={15} className="text-blue-600" />
                Ingreso por celular
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-4">
                Validá tu número de teléfono móvil para sincronizar tus pedidos en tiempo real.
              </p>

              {phoneStep === 'phone' ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="phone-login-number" className="text-xs font-black uppercase text-slate-600 tracking-wider block mb-1">Tu número de celular</label>
                    <div className="flex items-center border border-slate-200 rounded-xl px-3 py-2 bg-slate-50">
                      <span className="text-xs font-extrabold text-slate-500 pr-2 border-r border-slate-200 shrink-0">+54 9</span>
                      <input 
                        id="phone-login-number"
                        type="tel" 
                        autoComplete="tel"
                        placeholder="Ej: 2901 445566"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                        className="bg-transparent focus:outline-none flex-1 text-xs font-extrabold pl-2 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2.5 mt-2">
                    <button 
                      onClick={() => setShowPhoneLoginModal(false)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handlePhoneLogin}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs py-2 px-5 rounded-xl flex-1 cursor-pointer transition-all active:scale-97 text-center"
                    >
                      Enviar SMS
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="phone-login-code" className="text-xs font-black uppercase text-slate-600 tracking-wider block mb-1 font-sans">Código de 4 dígitos enviado</label>
                    <input 
                      id="phone-login-code"
                      type="text" 
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Ingresá 2901"
                      maxLength={4}
                      value={phoneCodeInput}
                      onChange={(e) => setPhoneCodeInput(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-center text-sm font-black focus:outline-none tracking-widest text-slate-800"
                    />
                    <span className="text-xs text-blue-600 font-semibold text-center italic block mt-1.5 uppercase tracking-wide">Código de prueba: 2901</span>
                  </div>

                  <div className="flex gap-2.5 mt-2">
                    <button 
                      onClick={() => setPhoneStep('phone')}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Volver
                    </button>
                    <button 
                      onClick={handleVerifyPhoneCode}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs py-2 px-5 rounded-xl flex-1 cursor-pointer transition-all active:scale-97 text-center"
                    >
                      Verificar
                    </button>
                  </div>
                </div>
              )}
            </m.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* MANDATORY CHECKOUT DETAILS DIALOG (FORM STEP PERMIT REQUIRED DATA) */}
      <AnimatePresence>
        {showCheckoutModal && (
          <Modal
            id="checkout-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClose={() => setShowCheckoutModal(false)}
            labelledBy="checkout-modal-wrapper-title"
          >
            <m.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-sm max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col border border-slate-100 relative"
              id="checkout-modal-body"
            >
              {/* Core loading overlay for secure payment portal */}
              {isProcessingPayment && (
                <div className="absolute inset-0 bg-slate-900/95 text-white z-50 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                  <div className="relative w-16 h-16 mb-4">
                    <span className="absolute inset-0 rounded-full border-4 border-slate-800 border-t-blue-600 animate-spin"></span>
                    <span className="absolute inset-2 bg-slate-800 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400">SSL</span>
                  </div>
                  
                  <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">MÓDULO DE PAGO SEGURO</span>
                  <h4 id="checkout-modal-wrapper-title" className="text-sm font-extrabold max-w-[240px] leading-snug font-sans transition-all">{paymentStatusText}</h4>
                  
                  <div className="h-px bg-slate-800 w-2/3 my-4"></div>
                  
                  <p className="text-[9px] text-slate-400 max-w-[200px] leading-relaxed font-semibold uppercase tracking-wider">
                    Powered by Red Link, Banelco & SSL Encriptado 256 bits
                  </p>
                </div>
              )}

              {showOrderSummaryScreen ? (
                <div className="bg-slate-900 text-white p-5 text-left border-b border-slate-800 shrink-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Resumen de tu Pedido</span>
                  </div>
                  <h3 className="font-extrabold text-base leading-tight">Verificá tu pedido</h3>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                    Revisá los detalles de tu orden antes de confirmar. La seguís en vivo desde la app.
                  </p>
                </div>
              ) : (
                <div className="bg-slate-900 text-white p-5 text-left border-b border-slate-800 shrink-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse inline-block"></span>
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Confirmación de Pedido</span>
                  </div>
                  <h3 className="font-extrabold text-base leading-tight">Datos obligatorios del pedido</h3>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                    Completá para confirmar tu orden y seguirla en vivo desde la app.
                  </p>
                </div>
              )}

              {showOrderSummaryScreen ? (
                <div className="p-5 flex flex-col gap-4 text-left overflow-y-auto max-h-[58vh] space-y-3.5 font-sans">
                  {/* DETALLE DE PRODUCTOS */}
                  <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">📦 DETALLE DE PRODUCTOS</span>
                    <div className="max-h-36 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100 p-2.5">
                      {Object.entries(cart).map(([idStr, qtyVal]) => {
                        const qty = Number(qtyVal);
                        let name = '';
                        let itemPrice = 0;
                        if (idStr.startsWith('c')) {
                          const combo = combosList.find(x => x.id === idStr);
                          if (combo) {
                            name = combo.name;
                            itemPrice = combo.price;
                          }
                        } else {
                          const p = products.find(x => x.id === parseInt(idStr));
                          if (p) {
                            name = p.name;
                            itemPrice = p.price;
                          }
                        }
                        if (!name) return null;
                        return (
                          <div key={idStr} className="py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                            <span className="truncate max-w-[200px]">{name} <span className="text-slate-500 font-bold font-mono">x{qty}</span></span>
                            <span className="font-bold text-slate-600 shrink-0">{fmt(itemPrice * qty)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* DESTINATARIO Y ENVÍO */}
                  <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">👥 DESTINATARIO Y ENVÍO</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs text-slate-700 font-medium leading-relaxed">
                      <div>
                        <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Cliente</span>
                        <p className="font-extrabold text-slate-950">{customerName}</p>
                        <p className="text-[10.5px] text-slate-500 font-bold mt-0.5">🇦🇷 +54 {customerPhone}</p>
                      </div>
                      <div className="border-t border-slate-200/50 pt-2">
                        <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Modalidad</span>
                        <p className="font-bold text-slate-800 font-sans">
                          {deliveryMode === 'envio' ? '🛵 Pedidos Va (Envío a domicilio)' : '🏪 Retiro por local'}
                        </p>
                        {deliveryMode === 'envio' && (
                          <p className="text-[10.5px] text-slate-500 font-semibold mt-0.5 leading-relaxed"><b>Dirección:</b> {customerLocation}</p>
                        )}
                        {deliveryMode === 'envio' && isAfterCutoff && (
                          <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[10px] text-blue-700 font-bold leading-normal font-sans">
                            ⏰ Envío programado para mañana por haber superado la hora de corte de las {cutoffHour}:00 hs.
                          </div>
                        )}
                      </div>
                      <div className="border-t border-slate-200/50 pt-2">
                        <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Forma de Pago</span>
                        <p className="font-bold text-slate-800 font-sans">
                          {paymentMethod === 'tarjeta_online' && '💳 Tarjeta de Crédito/Débito'}
                          {paymentMethod === 'transferencia_qr' && '📱 Pago QR / Transferencia'}
                          {paymentMethod === 'efectivo' && '💵 Efectivo (Abonás al recibir)'}
                        </p>
                        {paymentMethod === 'efectivo' && cashAmountPaidWith && (
                          <p className="text-[10.5px] text-emerald-600 font-black mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 inline-block font-sans animate-pulse">
                            Abonás con {fmt(Number(cashAmountPaidWith))} (Vuelto: {fmt(Number(cashAmountPaidWith) - finalTotal)})
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* LIQUIDACIÓN DE COSTOS */}
                  <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">💰 LIQUIDACIÓN DE COSTOS</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs font-semibold font-sans">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Subtotal productos:</span>
                        <span>{fmt(subtotal)}</span>
                      </div>
                      {appliedCoupon && (
                        <div className="flex items-center justify-between font-bold text-emerald-600 leading-none">
                          <span>Descuento cupón ({appliedCoupon.code}):</span>
                          <span>
                            {appliedCoupon.type === 'discount' ? `-${appliedCoupon.value * 100}%` : 'Envío Gratis'}
                          </span>
                        </div>
                      )}
                      {deliveryMode === 'envio' && (
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Costo de envío:</span>
                          <span>{isFreeShipping ? 'Gratis' : fmt(dynamicShippingCost)}</span>
                        </div>
                      )}
                      {hasQRDiscount && (
                        <div className="flex items-center justify-between font-bold text-emerald-600">
                          <span>Descuento QR (10%):</span>
                          <span>-{fmt(qrDiscountAmount)}</span>
                        </div>
                      )}
                      <div className="h-px bg-slate-200/65 my-1" />
                      <div className="flex items-center justify-between text-slate-800">
                        <span className="font-extrabold text-slate-700 uppercase tracking-wide text-[11px]">TOTAL A ABONAR:</span>
                        <span className="text-lg font-black text-blue-600 font-mono tracking-tighter">{fmt(finalTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5 flex flex-col gap-4 text-left overflow-y-auto max-h-[58vh] space-y-3.5">

                {/* Paso 1: Cliente / Name info */}
                <div className="space-y-1.5">
                  <label htmlFor="checkout-name" className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Tu nombre completo</span>
                    <span className="text-blue-500 font-bold text-[9px]">*REQ</span>
                  </label>
                  <input 
                    id="checkout-name"
                    type="text" 
                    autoComplete="name"
                    placeholder="Ej: Juan Pérez"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs text-slate-800 transition-all font-medium"
                  />
                </div>

                {/* Celular / Mobile info */}
                <div className="space-y-1.5">
                  <label htmlFor="checkout-phone" className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Número de Celular</span>
                    <span className="text-blue-500 font-bold text-[9px]">*REQ</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-slate-500 font-bold text-xs">🇦🇷 +54</span>
                    <input 
                      id="checkout-phone"
                      type="tel" 
                      autoComplete="tel"
                      aria-describedby="checkout-phone-help"
                      placeholder="9 2901 123456"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-[56px] pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs text-slate-800 font-medium transition-all"
                    />
                  </div>
                  <p id="checkout-phone-help" className="text-xs text-slate-500 font-medium leading-relaxed">Código de área sin el 0, y celular sin el 15.</p>
                </div>

                {/* CONDITIONAL DELIVERY SHIPPING DETAILS (Mandatory for Envío, hidden for Retiro) */}
                {deliveryMode === 'envio' ? (
                  <div className="space-y-4">
                    {isAfterCutoff && (
                      <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl text-xs flex flex-col gap-1 shadow-sm">
                        <div className="flex items-center gap-2 text-blue-600 font-extrabold">
                          <span className="text-sm">⚠️</span>
                          <span>Pedido Programado para Mañana</span>
                        </div>
                        <p className="text-[10.5px] text-blue-950 font-semibold leading-relaxed font-sans">
                          Realizaste tu pedido después de nuestra hora de corte de envíos ({cutoffHour}:00 hs). 
                          Tu pedido se entregará mañana. Te confirmamos el carrito el día del envío.
                        </p>
                      </div>
                    )}

                    {deliverySchedule && (
                      <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-sm border ${
                        deliverySchedule.available 
                          ? 'bg-emerald-50/75 border-emerald-200 text-emerald-950' 
                          : 'bg-blue-50/75 border-blue-200 text-blue-950'
                      }`}>
                        <Clock className={`w-4 h-4 shrink-0 mt-0.5 ${deliverySchedule.available ? 'text-emerald-600' : 'text-blue-600 animate-pulse'}`} />
                        <div>
                          <div className="font-extrabold flex items-center gap-1.5 leading-none">
                            <span>Estado de Repartos:</span>
                            <span className={`text-[9px] uppercase px-1 py-0.5 rounded font-mono ${
                              deliverySchedule.available ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white animate-pulse'
                            }`}>
                              {deliverySchedule.available ? 'En Servicio' : 'Cerrado Temporalmente'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 leading-normal font-medium">
                            Nuestros despachos se realizan de 11:00 a 14:00 y de 19:00 a 00:00 hs. Reloj de control: <span className="underline">{deliverySchedule.currentHourText}</span>.
                          </p>
                          {!deliverySchedule.available && (
                            <p className="text-[10px] text-blue-600 font-bold mt-1">
                              ⚠️ {deliverySchedule.nextSlotText}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3 bg-slate-50 border border-slate-200 p-3 rounded-xl animate-fade-in">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Dirección de Despacho</span>
                        <span className="text-blue-500 font-bold text-[9px]">*MANDATORIO</span>
                      </div>

                      {/* Zona de Envío - Dropdown Select */}
                      <div className="space-y-1">
                        <label htmlFor="select-delivery-zone" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Zona de Envío (Obligatorio)</label>
                        <select
                          id="select-delivery-zone"
                          value={selectedZoneLabel}
                          onChange={(e) => {
                            const zoneLabel = e.target.value;
                            setSelectedZoneLabel(zoneLabel);
                            const matchedZone = (deliveryZones || []).find(z => z.name === zoneLabel);
                            if (matchedZone) {
                              setDynamicShippingCost(matchedZone.price);
                            } else {
                              // Hardcoded fallback logic for Ushuaia preloads in case list is empty
                              const fallbackPrices: Record<string, number> = {
                                'Centro': 5000,
                                'Rio Pipo': 7000,
                                'La Cantera': 7000,
                                'Solidaridad/640 Viviendas': 8000,
                                'Kaiken': 9000,
                                'Las Raices': 10000,
                                'Andorra': 11000,
                                'zona norte alta': 12000
                              };
                              setDynamicShippingCost(fallbackPrices[zoneLabel] || 5000);
                            }
                          }}
                          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs text-slate-800 font-bold transition-all shadow-2xs"
                        >
                          {(deliveryZones && deliveryZones.length > 0) ? (
                            deliveryZones.map(z => (
                              <option key={z.id} value={z.name}>
                                {z.name} ({Math.round(z.km * 1000).toLocaleString('es-AR')} m) — ${z.price.toLocaleString('es-AR')}
                              </option>
                            ))
                          ) : (
                            ['Centro', 'Rio Pipo', 'La Cantera', 'Solidaridad/640 Viviendas', 'Kaiken', 'Las Raices', 'Andorra', 'zona norte alta'].map(name => {
                              const fallbackPrices: Record<string, number> = {
                                'Centro': 5000,
                                'Rio Pipo': 7000,
                                'La Cantera': 7000,
                                'Solidaridad/640 Viviendas': 8000,
                                'Kaiken': 9000,
                                'Las Raices': 10000,
                                'Andorra': 11000,
                                'zona norte alta': 12000
                              };
                              const fallbackKms: Record<string, number> = {
                                'Centro': 1,
                                'Rio Pipo': 3,
                                'La Cantera': 3,
                                'Solidaridad/640 Viviendas': 4,
                                'Kaiken': 5,
                                'Las Raices': 6,
                                'Andorra': 7,
                                'zona norte alta': 8
                              };
                              return (
                                <option key={name} value={name}>
                                  {name} ({(fallbackKms[name] * 1000).toLocaleString('es-AR')} m) — ${fallbackPrices[name].toLocaleString('es-AR')}
                                </option>
                              );
                            })
                          )}
                        </select>
                      </div>

                      {/* Calle y Altura */}
                      <div className="space-y-1">
                        <label htmlFor="checkout-address-street" className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Calle y Altura (Obligatorio)</label>
                        <input 
                          id="checkout-address-street"
                          type="text" 
                          autoComplete="street-address"
                          placeholder="Ej: Calle San Martín 1230"
                          value={addressStreet}
                          onChange={(e) => setAddressStreet(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs text-slate-800 font-medium transition-all"
                        />
                      </div>

                      {/* Piso / Depto */}
                      <div className="space-y-1">
                        <label htmlFor="checkout-address-unit" className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Piso / Depto / Entrada (Opcional)</label>
                        <input 
                          id="checkout-address-unit"
                          type="text" 
                          placeholder="Ej: Piso 2 Depto B o Casa 4"
                          value={addressUnit}
                          onChange={(e) => setAddressUnit(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs text-slate-800 font-medium transition-all"
                        />
                      </div>

                      {/* Barrio y Referencias */}
                      <div className="space-y-1">
                        <label htmlFor="checkout-address-notes" className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Barrio / Indicaciones Especiales</label>
                        <input 
                          id="checkout-address-notes"
                          type="text" 
                          placeholder="Ej: Barrio Río Pipo, portón verde"
                          value={addressNotes}
                          onChange={(e) => setAddressNotes(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs text-slate-800 font-medium transition-all"
                        />
                      </div>

                      {/* Live Generated Summary */}
                      {customerLocation && (
                        <div className="bg-blue-50/50 p-2 border border-blue-100 rounded-lg text-left">
                          <span className="text-[8.5px] uppercase font-bold text-blue-500 block mb-0.5 leading-none">📍 Dirección que se Registrará</span>
                          <p className="text-[11px] font-bold text-slate-800 leading-relaxed font-sans">{customerLocation}</p>
                        </div>
                      )}
                    </div>

                    <div className="bg-blue-50 border border-blue-200 text-[10.5px] text-blue-950 p-3 rounded-xl font-bold flex justify-between items-center mt-3">
                      <span>Costo de Envío:</span>
                      <span className="font-extrabold text-blue-700 font-mono text-xs">{isFreeShipping ? 'Gratis' : fmt(dynamicShippingCost)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 text-[10.5px] text-blue-800 p-3.5 rounded-xl leading-relaxed font-semibold font-sans">
                    🏪 <b>Retiro por Local Seleccionado:</b> Retirás tu pedido de forma inmediata y sin esperas de fila en nuestro local principal. No requiere dirección.
                  </div>
                )}

                <div className="h-px bg-slate-100 my-1"></div>

                {/* Paso 2: MÉTODO DE PAGO EN LA PÁGINA */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                    Método de Pago (Procesado en la Página)
                  </label>
                  
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-center">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('tarjeta_online')}
                      className={`min-h-[44px] py-2 text-[11px] font-black rounded-lg transition-all ${
                        paymentMethod === 'tarjeta_online'
                          ? 'bg-white text-slate-900 shadow border border-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      💳 Tarjeta
                    </button>
                    <button
                      type="button"
                      onClick={selectQRPayment}
                      className={`relative min-h-[44px] py-2 text-[11px] font-black rounded-lg transition-all ${
                        paymentMethod === 'transferencia_qr'
                          ? 'bg-white text-slate-900 shadow border border-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      📱 Pago QR
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('efectivo')}
                      className={`min-h-[44px] py-2 text-[11px] font-black rounded-lg transition-all ${
                        paymentMethod === 'efectivo'
                          ? 'bg-white text-slate-900 shadow border border-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      💵 Efectivo
                    </button>
                  </div>

                  {/* Payment Details Form Panels */}
                  {paymentMethod === 'tarjeta_online' && (
                    <div className="space-y-2.5 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                      {/* Security Compliance Notice */}
                      <div className="bg-blue-50 border border-blue-200/60 p-2.5 rounded-lg text-left space-y-1">
                        <span className="text-[8.5px] uppercase font-black text-blue-500 block leading-none">🔒 SIMULACIÓN DE CHECKOUT PROTEGIDA</span>
                        <p className="text-[9.5px] text-blue-700 font-semibold leading-relaxed">
                          Este formulario es un prototipo interactivo seguro. Los datos ingresados se procesan de forma estrictamente local en la memoria de sesión del navegador. Ninguna información de pago es persistida o transmitida externamente.
                        </p>
                      </div>

                      {/* Real-time styled card graphic preview */}
                      <div className="bg-gradient-to-br from-blue-600 to-blue-600 rounded-xl p-3.5 text-white flex flex-col justify-between h-24 shadow-sm relative overflow-hidden select-none">
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] font-black tracking-widest text-white/70">ORÍGENES CARD</span>
                          <span className="text-xs italic font-extrabold text-white/90">VISA</span>
                        </div>
                        <div className="text-xs font-mono font-bold tracking-widest text-center my-0.5">
                          {cardNumber ? cardNumber : '•••• •••• •••• ••••'}
                        </div>
                        <div className="flex justify-between text-[8px] tracking-wider uppercase font-extrabold text-white/80 leading-none">
                          <span className="truncate max-w-[120px]">{cardName ? cardName : 'NOMBRE IMPRESO'}</span>
                          <span>VENCE: {cardExpiry ? cardExpiry : 'MM/AA'}</span>
                        </div>
                        <span className="absolute right-3.5 top-8 w-6 h-5 bg-blue-400 opacity-20 rounded-sm"></span>
                      </div>

                      {/* Card inputs */}
                      <div className="space-y-2 text-xs">
                        <div>
                          <label htmlFor="checkout-card-number" className="sr-only">Número de tarjeta (16 dígitos)</label>
                          <input 
                            id="checkout-card-number"
                            type="text" 
                            inputMode="numeric"
                            autoComplete="cc-number"
                            maxLength={19}
                            placeholder="Número de Tarjeta (16 dígitos)"
                            value={cardNumber}
                            onChange={(e) => {
                              // Auto format 4-digit spacings
                              const val = e.target.value.replace(/[^\d]/g, '').replace(/(.{4})/g, '$1 ').trim();
                              setCardNumber(val);
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="checkout-card-name" className="sr-only">Nombre impreso en la tarjeta</label>
                          <input 
                            id="checkout-card-name"
                            type="text" 
                            autoComplete="cc-name"
                            placeholder="Nombre impreso en Tarjeta"
                            value={cardName}
                            onChange={(e) => setCardName(e.target.value.toUpperCase())}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label htmlFor="checkout-card-expiry" className="sr-only">Vencimiento de la tarjeta (MM/AA)</label>
                          <input 
                            id="checkout-card-expiry"
                            type="text" 
                            inputMode="numeric"
                            autoComplete="cc-exp"
                            maxLength={5}
                            placeholder="MM/AA"
                            value={cardExpiry}
                            onChange={(e) => {
                              let val = e.target.value;
                              if (val.length === 2 && !val.includes('/')) val += '/';
                              setCardExpiry(val);
                            }}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          />
                          <label htmlFor="checkout-card-cvv" className="sr-only">Código de seguridad CVV</label>
                          <input 
                            id="checkout-card-cvv"
                            type="password" 
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            maxLength={4}
                            placeholder="CVV (Seguridad)"
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value.replace(/[^\d]/g, ''))}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'transferencia_qr' && (
                    <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-3.5">
                      {/* Visual QR Code Display */}
                      <div className="flex flex-col items-center justify-center bg-white p-4 rounded-xl border border-slate-100 shadow-xs gap-2">
                        <div className="w-32 h-32 border-4 border-slate-900 bg-white p-2 rounded-lg flex items-center justify-center relative overflow-hidden group">
                          {/* Simulated QR Code matrix using nice CSS sub-grids */}
                          <div className="w-full h-full grid grid-cols-5 grid-rows-5 gap-1.5 p-1">
                            {/* Position Detection patterns */}
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-white"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900/40 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900/60 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            
                            <div className="bg-white"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-white"></div>
                            <div className="bg-white"></div>
                            
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-white"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-white"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                            <div className="bg-slate-900 rounded-sm"></div>
                          </div>
                          {/* Tiny logo badge centered inside the QR box */}
                          <div className="absolute inset-0 m-auto w-7 h-7 bg-white rounded-md border border-slate-200 shadow flex items-center justify-center text-[8px] font-black text-blue-600 tracking-tighter">
                            MP
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">Escanear QR de Pago</p>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-1.5 text-[10.5px] font-semibold text-slate-700 text-left">
                        <p className="text-slate-500 font-bold uppercase tracking-wider text-[8.5px] leading-none mb-1">Datos de Mercado Pago</p>
                        <p>👤 <b>Titular:</b> Orígenes Kiosco S.A.</p>
                        <p>🎯 <b>Alias CVU:</b> <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-black border border-blue-100 text-[10.5px] inline-block font-mono select-all">origenes.ushuaia</span></p>
                        <p>🏦 <b>CVU:</b> <span className="text-[10px] font-mono select-all block mt-0.5 bg-slate-50 p-1 text-slate-600 rounded">0000003100012345678901</span></p>
                      </div>

                      <div className="flex items-start gap-2.5 p-2 bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition-colors rounded-xl cursor-pointer">
                        <input 
                          id="bank-receipt-checkbox"
                          type="checkbox"
                          checked={bankReceiptChecked}
                          onChange={(e) => setBankReceiptChecked(e.target.checked)}
                          className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <label 
                          htmlFor="bank-receipt-checkbox"
                          className="text-[10px] text-slate-600 font-bold leading-tight cursor-pointer select-none flex-1 py-0.5"
                        >
                          Confirmo haber acreditado el total de <b>{fmt(finalTotal)}</b> mediante escaneo de QR o transferencia.
                        </label>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'efectivo' && (
                    <div className="space-y-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-left animate-fade-in font-sans">
                      <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg">
                        <span className="text-xs uppercase font-black text-blue-700 block leading-none">💵 PAGO EN EFECTIVO</span>
                        <p className="text-xs text-blue-800 font-bold leading-relaxed mt-1">
                          {deliveryMode === 'envio' ? 'Abonás en efectivo al recibir tu pedido en tu domicilio.' : 'Abonás en efectivo al retirar tu pedido por nuestro local.'}
                        </p>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <label htmlFor="checkout-cash" className="text-xs font-extrabold text-slate-600 uppercase tracking-tight block">
                          ¿Con cuánto abonás? (Opcional)
                        </label>
                        <input 
                          id="checkout-cash"
                          type="text" 
                          inputMode="numeric"
                          placeholder="Ej: 5000 (Calcula el vuelto automático)"
                          value={cashAmountPaidWith}
                          onChange={(e) => setCashAmountPaidWith(e.target.value.replace(/[^\d]/g, ''))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        
                        {cashAmountPaidWith && Number(cashAmountPaidWith) > 0 && (
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-500 font-sans">Tu Vuelto:</span>
                            {Number(cashAmountPaidWith) >= finalTotal ? (
                              <span className="font-extrabold text-emerald-600 text-sm font-mono">
                                {fmt(Number(cashAmountPaidWith) - finalTotal)}
                              </span>
                            ) : (
                              <span className="font-bold text-blue-500 text-[10px]">
                                Debe ser igual o mayor a {fmt(finalTotal)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

              {/* Shared always-visible footer area outside the ternary */}
              <div className="p-5 pt-0 border-t border-slate-100 shrink-0">
                {formError && (
                  <div className="bg-blue-50 border border-blue-200 text-[10.5px] text-blue-600 p-2.5 rounded-xl font-bold leading-normal text-left shadow-sm mb-3">
                    ⚠️ {formError}
                  </div>
                )}

                <div className="flex gap-2.5 w-full pt-3">
                  <button 
                    id="btn-checkout-back"
                    onClick={() => {
                      if (showOrderSummaryScreen) {
                        setShowOrderSummaryScreen(false);
                      } else {
                        setShowCheckoutModal(false);
                      }
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Volver
                  </button>
                  <button 
                    id="btn-checkout-submit"
                    onClick={submitOrder}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-extrabold shadow shadow-blue-200 transition-all font-sans animate-pulse cursor-pointer"
                  >
                    {showOrderSummaryScreen ? 'Confirmar y Enviar Pedido' : 'Siguiente 👉'}
                  </button>
                </div>
              </div>
          </m.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* POST-ORDER CONFIRMATION VIEW (SUCCESS STATE BANNER) */}
      <AnimatePresence>
        {liveOrder && !trackerDismissed && (
          <Modal
            id="order-success-screen"
            className="fixed inset-0 bg-slate-100 z-50 flex flex-col"
            onClose={() => { setTrackerDismissed(true); setLastPlacedOrder(null); }}
            closeOnBackdrop={false}
            labelledBy="order-success-screen-title"
          >
            <div className="bg-emerald-600 text-white text-center py-12 px-4 shrink-0 flex flex-col items-center">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-white mb-3 shadow animate-bounce">
                <CheckCircle2 size={32} />
              </div>
              <h2 id="order-success-screen-title" className="text-xl font-extrabold">&iexcl;Pedido confirmado!</h2>
              <p className="text-xs text-emerald-100 mt-1 max-w-[280px]">
                Segu&iacute; el estado de tu pedido ac&aacute; abajo &mdash; se actualiza en vivo.
              </p>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {/* STATUS TRACKER STEPPER */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-left">
                <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase block mb-3 text-center">{liveOrder.delivery === 'envio' ? '🛵 Seguimiento de tu envío' : '🏪 Seguimiento de tu pedido'}</span>
                
                {liveOrder.status === 'cancelado' ? (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-bold text-center">
                    ❌ Este pedido fue cancelado. Comun&iacute;cate con el local si fue un error.
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between relative mt-2 px-1 pb-4">
                      {/* Connecting Line */}
                      <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -z-0" />
                      
                      {(liveOrder.delivery === 'envio'
                        ? ['Recibido', 'Confirmado', 'Preparando', 'En camino', 'Entregado']
                        : ['Recibido', 'Confirmado', 'Preparando', 'Listo', 'Entregado']
                      ).map((step, i) => {
                        const currentStep = orderStatusStep(liveOrder.status);
                        
                        return (
                          <div key={step} className="flex flex-col items-center gap-1.5 flex-1 relative z-10">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 shadow-xs
                              ${i <= currentStep ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                              {i < currentStep ? '✓' : i + 1}
                            </div>
                            <span className={`text-[9px] text-center font-bold leading-tight ${i <= currentStep ? 'text-blue-700 font-black' : 'text-slate-500'}`}>
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Order data wrapper */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 divide-y divide-slate-100 text-left">
                <div className="flex justify-between items-center py-2 text-xs flex-wrap gap-1">
                  <span className="text-slate-500 font-bold uppercase">N&deg; de pedido</span>
                  <span className="font-extrabold text-slate-800">#{liveOrder.id}</span>
                </div>
                <div className="flex justify-between items-center py-2 text-xs flex-wrap gap-1">
                  <span className="text-slate-500 font-bold uppercase">Modalidad</span>
                  <span className="font-extrabold text-slate-800">
                    {liveOrder.delivery === 'envio' ? '🛵 Delivery (Pedidos Va)' : '🏪 Retiro por local'}
                  </span>
                </div>
                {liveOrder.customerLocation && (
                  <div className="py-2.5 text-xs">
                    <span className="text-slate-500 font-bold uppercase block mb-1">Direcci&oacute;n de despacho</span>
                    <span className="font-semibold text-slate-800 bg-slate-50 border border-slate-100 p-2 rounded block leading-normal">{liveOrder.customerLocation}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 text-xs flex-wrap gap-1">
                  <span className="text-slate-500 font-bold uppercase">Forma de pago</span>
                  <span className="font-extrabold text-slate-800">
                    {liveOrder.paymentMethod || 'Efectivo'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 text-xs flex-wrap gap-1">
                  <span className="text-slate-500 font-bold uppercase">Estado del pago</span>
                  <span>
                    {liveOrder.paymentStatus === 'aprobado' ? (
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-sm">
                        ✅ APROBADO ONLINE
                      </span>
                    ) : (
                      <span className="bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-sm">
                        ⏳ PENDIENTE AL RECIBIR
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 text-xs flex-wrap gap-1">
                  <span className="text-slate-500 font-bold uppercase">Costo env&iacute;o</span>
                  <span className="font-extrabold text-slate-800 font-sans">
                    {liveOrder.shipping > 0 ? fmt(liveOrder.shipping) : 'Sin cargo'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2.5 text-sm pt-3 flex-wrap gap-1">
                  <span className="font-black text-slate-800">Total Facturado</span>
                  <span className="font-black text-blue-600 text-base">{fmt(liveOrder.total)}</span>
                </div>
                <div className="flex justify-between items-center py-2 text-xs flex-wrap gap-1">
                  <span className="text-slate-500 font-bold uppercase">Estatus pedido</span>
                  <span className="text-xs font-black text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded leading-none border border-blue-100 font-sans">
                    {liveOrder.status === 'pending_confirmation' ? '⏳ Programado para mañana' :
                     liveOrder.status === 'pendiente' ? '⏳ Recibido — esperando al local' :
                     liveOrder.status === 'confirmado' ? '👍 Confirmado por el kiosco' :
                     liveOrder.status === 'en_preparacion' ? '👨‍🍳 En preparación' :
                     liveOrder.status === 'en_camino' ? '🛵 En camino a tu dirección' :
                     liveOrder.status === 'listo' ? '📦 Listo para retirar' :
                     liveOrder.status === 'entregado' ? '🎉 Entregado con éxito' :
                     liveOrder.status === 'cancelado' ? '❌ Cancelado' : liveOrder.status}
                  </span>
                </div>
              </div>

              <button 
                onClick={() => { setTrackerDismissed(true); setLastPlacedOrder(null); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3.5 px-4 font-bold text-xs mt-6 shadow flex items-center justify-center gap-1 cursor-pointer"
              >
                Volver al cat&aacute;logo
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Botón flotante para reabrir el seguimiento en vivo si el cliente lo cerró */}
      {liveOrder && trackerDismissed && (
        <button
          onClick={() => setTrackerDismissed(false)}
          className="fixed bottom-24 right-4 z-40 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg py-3 px-4 text-xs font-black flex items-center gap-2 cursor-pointer"
        >
          🛵 Seguir mi pedido
        </button>
      )}

      {/* DIRECT IN-LINE STOREFRONT GONDOLA / PRODUCT MANAGER FORM */}
      <AnimatePresence>
        {showingStoreAddForm && (
          <Modal
            id="direct-store-drawer-wrapper"
            className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
            onClose={() => setShowingStoreAddForm(false)}
            labelledBy="direct-store-drawer-wrapper-title"
          >
            <m.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white w-full max-w-md rounded-t-3xl max-h-[92vh] overflow-y-auto flex flex-col shadow-2xl z-50"
              id="direct-store-drawer-body"
            >
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto my-3" />

              <div className="px-5 pb-8 pt-2">
                
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏪</span>
                    <h3 id="direct-store-drawer-wrapper-title" className="font-extrabold text-[15px] text-slate-800 leading-none">
                      {editingStoreProduct ? 'Modificar Producto' : 'Cargar Producto Nuevo'}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setShowingStoreAddForm(false)}
                    className="text-slate-500 hover:text-slate-600 font-extrabold text-sm p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {directFormValidationError && (
                  <div className="bg-blue-50 text-[11px] text-blue-600 font-black border border-blue-200 p-3 rounded-xl mb-4 flex items-center gap-1.5 animate-pulse">
                    ⚠️ {directFormValidationError}
                  </div>
                )}

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Nombre de Producto *</label>
                    <input 
                      type="text"
                      placeholder="Ej: Coca Cola 1.5L"
                      value={storeFormName}
                      onChange={(e) => setStoreFormName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Distribuidor / Marca</label>
                    <input 
                      type="text"
                      placeholder="Ej: Coca-Cola Co."
                      value={storeFormBrand}
                      onChange={(e) => setStoreFormBrand(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Precio de Venta ($) *</label>
                      <input 
                        type="number"
                        placeholder="Ej: 1400"
                        value={storeFormPrice}
                        onChange={(e) => setStoreFormPrice(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-black text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Precio de Lista / Antes</label>
                      <input 
                        type="number"
                        placeholder="Sin Oferta (Opcional)"
                        value={storeFormOrig}
                        onChange={(e) => setStoreFormOrig(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Categoría / Solapa *</label>
                    <select 
                      value={storeFormCat}
                      onChange={(e) => {
                        setStoreFormCat(e.target.value);
                        setDirectFormValidationError('');
                      }}
                      onInput={(e) => {
                        setStoreFormCat(e.currentTarget.value);
                        setDirectFormValidationError('');
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-black text-slate-800 focus:outline-none cursor-pointer"
                    >
                      <option value="">Seleccionar Solapa...</option>
                      {CATS.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    
                    {/* Visual Category Chips for High-Fidelity 100% Reliable Click Support */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {CATS.map(c => {
                        const isSelected = storeFormCat === c.id;
                        return (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => {
                              setStoreFormCat(c.id);
                              setDirectFormValidationError('');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10.5px] font-black transition-all border ${
                              isSelected
                                ? 'bg-blue-500 border-blue-600 text-white shadow-xs'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Descripción o Unidad</label>
                    <textarea 
                      placeholder="Ej: Envase retornable, sabor original, etc."
                      value={storeFormDesc}
                      onChange={(e) => setStoreFormDesc(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none resize-none"
                    />
                  </div>

                  {/* CUSTOM PHOTO UPLOAD METHOD */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col gap-2.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider leading-none">
                      📷 Foto Propia de tu Kiosco
                    </label>
                    <p className="text-[9.5px] text-slate-500 font-bold leading-snug">
                      Subí una foto directamente desde la cámara o galería de tu Celular:
                    </p>
                    
                    <div className="flex items-center gap-3 bg-white p-2 border border-slate-100 rounded-xl shadow-xs">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageFileChange}
                        className="text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-semibold">O pegá enlace:</span>
                      <input 
                        type="text" 
                        placeholder="https://..."
                        value={storeFormImage} 
                        onChange={(e) => setStoreFormImage(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-lg p-1 text-[10px] font-bold text-slate-800"
                      />
                    </div>

                    {storeFormImage && (
                      <div className="mt-1.5 flex items-center gap-2.5 p-1.5 bg-emerald-50 rounded-xl border border-emerald-100">
                        <img 
                          src={storeFormImage} 
                          className="w-12 h-12 object-cover rounded-lg border border-slate-200 shrink-0 shadow-inner" 
                          alt="Previsualización" 
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = getFallbackStoreImage(storeFormName, storeFormBrand, storeFormCat);
                          }}
                        />
                        <div>
                          <p className="text-[10px] font-black text-emerald-700 font-sans">✓ Foto cargada con éxito</p>
                          <p className="text-[9px] text-emerald-600 font-bold font-sans">Presioná "Guardar Producto" para aplicar cambios.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stock toggler status inside form */}
                  <div className="flex items-center justify-between py-1 border-t border-b border-slate-100 my-1">
                    <span className="text-[11px] font-bold text-slate-700 font-sans">Habilitar stock inmediato</span>
                    <button 
                      onClick={() => setStoreFormInStock(prev => !prev)}
                      type="button"
                      className={`w-9 h-5.5 rounded-full p-0.5 transition-colors relative flex items-center cursor-pointer ${storeFormInStock ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <span className={`w-4 h-4 bg-white rounded-full block shadow transform transition-transform duration-200 ${storeFormInStock ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex gap-2.5 mt-2">
                    <button 
                      onClick={() => setShowingStoreAddForm(false)}
                      type="button"
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold font-sans transition-all"
                    >
                      Volver
                    </button>
                    <button 
                      onClick={handleSaveStoreProduct}
                      type="button"
                      className="flex-2 bg-slate-900 hover:bg-black text-white py-3 rounded-xl text-xs font-black shadow-md font-sans transition-transform active:scale-98"
                    >
                      Guardar Producto ✓
                    </button>
                  </div>
                </div>
              </div>
            </m.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* HISTORIAL / MIS PEDIDOS MODAL */}
      <AnimatePresence>
        {showHistoryModal && (
          <Modal
            id="history-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center animate-fade-in"
            onClose={() => setShowHistoryModal(false)}
            labelledBy="history-modal-wrapper-title"
          >
            <m.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white w-full max-w-md rounded-t-2xl max-h-[85vh] overflow-y-auto flex flex-col p-4 font-sans text-left"
              id="history-modal-body"
            >
              {/* Drawer handle indicator */}
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4 shrink-0" />

              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <h3 id="history-modal-wrapper-title" className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <span>📦 Mis Pedidos Recientes</span>
                </h3>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-600 bg-slate-100 font-sans px-2.5 py-1 rounded-lg cursor-pointer animate-fade-in"
                >
                  Cerrar
                </button>
              </div>

              {/* Phone search input */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 animate-fade-in">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 font-sans">
                  Buscar por Celular / Teléfono
                </label>
                <div className="flex gap-2">
                  <input 
                    type="tel"
                    placeholder="Ej: 2901445566"
                    value={historyTel}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d]/g, '');
                      setHistoryTel(val);
                    }}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-500 font-sans"
                  />
                  {historyTel && (
                    <button 
                      onClick={() => {
                        setHistoryTel('');
                      }}
                      className="text-xs font-bold bg-slate-200 text-slate-600 px-3 py-2 rounded-lg cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5 font-bold leading-tight font-sans">
                  Tus pedidos se guardan automáticamente por número en tu navegador.
                </p>
              </div>

              {/* Orders List */}
              <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1 animate-fade-in">
                {historyOrdersList.map((order) => (
                  <div key={order.id} className="border border-slate-200 rounded-xl p-3.5 bg-white shadow-xs">
                    <div className="flex justify-between items-start border-b border-slate-100 border-dashed pb-1.5 mb-2">
                      <div>
                        <span className="text-[11px] font-black text-slate-800 font-sans">Pedido #{order.id}</span>
                        <span className="text-[10px] text-slate-500 block font-bold leading-none mt-0.5 font-sans">
                          {parseOrderDate(order.timestamp).toLocaleDateString('es-AR')} a las {parseOrderDate(order.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}hs
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                          order.delivery === 'envio' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          {order.delivery === 'envio' ? '🛵 Envío' : '🏪 Retiro'}
                        </span>
                        <span className={`text-[8.5px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                          order.status === 'pending_confirmation' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          order.status === 'entregado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                          order.status === 'confirmado' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          order.status === 'listo' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          order.status === 'cancelado' ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                          'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          {order.status === 'pending_confirmation' ? `Programado (${order.scheduledDate ? order.scheduledDate.split('-').reverse().join('/') : 'Mañana'})` :
                           order.status === 'entregado' ? 'Entregado' : 
                           order.status === 'confirmado' ? 'Confirmado' :
                           order.status === 'listo' ? 'Listo' : 
                           order.status === 'cancelado' ? 'Cancelado' : 'Pendiente'}
                        </span>
                      </div>
                    </div>

                    {/* Products breakdown preview */}
                    <div className="space-y-1">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[11px] font-semibold text-slate-600 leading-tight">
                          <span>{item.qty}x {item.name}</span>
                          <span className="font-extrabold text-slate-500">{fmt(item.price * item.qty)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total pagado:</span>
                      <span className="text-sm font-black text-slate-800">{fmt(order.total)}</span>
                    </div>

                    {/* Quick re-order repeating action */}
                    <button
                      onClick={() => handleRepeatOrder(order)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer mt-3"
                    >
                      🔄 Repetir este Pedido
                    </button>
                  </div>
                ))}

                {historyOrdersList.length === 0 && (
                  <div className="py-8 text-center text-slate-500">
                    <p className="text-3xl mb-1.5 animate-bounce">📭</p>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Sin pedidos guardados</p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-[280px] mx-auto font-medium leading-relaxed font-sans">
                      {historyTel ? "No hay pedidos asociados a este número de celular todavía." : "Introducí tu número de teléfono celular arriba para recuperar tus compras."}
                    </p>
                  </div>
                )}
              </div>
            </m.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* TOAST PANEL */}
      <AnimatePresence>
        {toastMsg && (
          <m.div 
            initial={{ opacity: 0, y: 16, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 16, x: "-50%" }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-full text-xs font-extrabold z-50 shadow-md text-center max-w-[85vw]"
          >
            {toastMsg}
          </m.div>
        )}
      </AnimatePresence>

      {/* CORE BOTTOM NAV */}
      <nav className="bnav border-t border-slate-200 bg-white fixed bottom-0 inset-x-0 h-16 flex items-center z-10 shadow-lg select-none">
        <button 
          type="button"
          onClick={() => setCurrentTab('home')} 
          aria-current={currentTab === 'home' ? 'page' : undefined}
          className={navItemClass('home')}
        >
          <ShoppingBag size={20} />
          <span>Inicio</span>
        </button>
        <button 
          type="button"
          onClick={() => setCurrentTab('catalog')} 
          aria-current={currentTab === 'catalog' ? 'page' : undefined}
          className={navItemClass('catalog')}
        >
          <Search size={20} />
          <span>Catálogo</span>
        </button>
        <button 
          type="button"
          onClick={() => setCurrentTab('promos')} 
          aria-current={currentTab === 'promos' ? 'page' : undefined}
          className={navItemClass('promos')}
        >
          <Star size={20} />
          <span>Ofertas</span>
        </button>
        <button 
          type="button"
          onClick={() => setCurrentTab('combos')} 
          aria-current={currentTab === 'combos' ? 'page' : undefined}
          className={navItemClass('combos')}
        >
          <Clock size={20} />
          <span>Combos</span>
        </button>
        <button 
          type="button"
          onClick={() => setCurrentTab('cart')} 
          aria-current={currentTab === 'cart' ? 'page' : undefined}
          aria-label={totalItems > 0 ? `Carrito, ${totalItems} ${totalItems === 1 ? 'producto' : 'productos'}` : 'Carrito vacío'}
          className={navItemClass('cart')}
        >
          {/* span y no div: el contenido de un button debe ser phrasing content */}
          <span className="relative">
            <ShoppingCart size={20} />
            {totalItems > 0 && (
              <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </span>
          <span>Carrito</span>
        </button>
      </nav>

      {/* PRODUCT DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {productToDelete && (
          <Modal
            id="storefront-delete-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 select-none"
            onClose={() => setProductToDelete(null)}
            closeOnBackdrop={false}
            labelledBy="storefront-delete-modal-wrapper-title"
          >
            <m.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-[325px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col p-4"
              id="storefront-delete-modal-body"
            >
              <div className="text-center py-2.5 flex flex-col items-center">
                <span className="text-3xl block filter drop-shadow-sm mb-2.5">🗑️</span>
                <h3 id="storefront-delete-modal-wrapper-title" className="font-extrabold text-[14px] text-slate-800 leading-tight">¿Eliminar Producto de Góndola?</h3>
                <p className="text-[11.5px] text-slate-500 leading-relaxed max-w-[245px] mt-2">
                  ¿Seguro que querés eliminar el producto <b className="text-slate-800 font-extrabold">"{productToDelete.name}"</b> definitivamente? Esta acción vaciará el stock e historial visible.
                </p>
              </div>

              <div className="flex gap-2.5 mt-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setProductToDelete(null)}
                  className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-97 cursor-pointer"
                >
                  No, Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteProduct) onDeleteProduct(productToDelete.id);
                    setProductToDelete(null);
                    showToast(`Producto "${productToDelete.name}" eliminado`);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-black shadow-sm transition-all active:scale-97 cursor-pointer"
                >
                  Sí, Eliminar
                </button>
              </div>
            </m.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* PWA CUSTOM INSTALLATION MODAL */}
      <AnimatePresence>
        {showInstallModal && (
          <Modal
            id="install-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-[120] flex items-end justify-center"
            onClose={() => setShowInstallModal(false)}
            labelledBy="install-modal-wrapper-title"
          >
            <m.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white w-full max-w-md rounded-t-3xl max-h-[88vh] overflow-y-auto flex flex-col pointer-events-auto"
              id="install-modal-body"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-3xl sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 animate-pulse">
                    <Smartphone size={16} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 id="install-modal-wrapper-title" className="text-sm font-extrabold text-slate-800">Instalar Orígenes Kiosco</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Acceso Directo Express</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowInstallModal(false)}
                  className="bg-slate-200/60 hover:bg-slate-200 text-slate-700 w-7 h-7 rounded-full flex items-center justify-center font-black text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 flex flex-col gap-4 font-sans text-left pb-8">
                <div className="flex gap-3.5 items-center bg-blue-50/50 p-4 rounded-2xl border border-blue-100/40 animate-fade-in">
                  <div className="bg-white p-1 rounded-xl shadow-sm shrink-0 w-12 h-12 flex items-center justify-center border border-slate-100">
                    <img src={origenesLogo} alt="Orígenes Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-extrabold text-[13px] text-slate-800 leading-tight">Orígenes Kiosco en tu celular</h4>
                    <p className="text-[10px] text-slate-500 font-semibold mt-1">Disfrutá de la forma más rápida y de un acceso súper fluido.</p>
                  </div>
                </div>

                <div className="space-y-3.5 my-1">
                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <span className="text-[10px]">🚀</span>
                    </div>
                    <div>
                      <h5 className="text-[11.5px] font-extrabold text-slate-700 leading-tight">Acceso Instantáneo</h5>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-relaxed">Entrá directo desde tu pantalla de inicio como si fuera una app nativa.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <span className="text-[10px]">📦</span>
                    </div>
                    <div>
                      <h5 className="text-[11.5px] font-extrabold text-slate-700 leading-tight">Stock y Precios Activos</h5>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-relaxed">Visualizá el stock real y precios siempre actualizados al instante.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <span className="text-[10px]">📶</span>
                    </div>
                    <div>
                      <h5 className="text-[11.5px] font-extrabold text-slate-700 leading-tight">Ahorro de Datos</h5>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-relaxed">Acceso offline y carga de red optimizada para conexiones de baja señal.</p>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-slate-100 my-1" />

                <div className="flex gap-3.5 mt-2">
                  <button
                    onClick={() => setShowInstallModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-3 rounded-xl transition-all border border-slate-200/50 cursor-pointer text-center"
                  >
                    Más tarde
                  </button>
                  <button
                    onClick={executeActualInstall}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3 rounded-xl transition-all shadow-md shadow-blue-200 cursor-pointer text-center"
                  >
                    Instalar Ahora ⚡
                  </button>
                </div>
              </div>
            </m.div>
          </Modal>
        )}
      </AnimatePresence>

    </div>
  );

  function cartThumb(p: Product) {
    const bg = CAT_BG[p.cat] || '#f1f5f9';
    return (
      <div 
        style={{ backgroundColor: bg }}
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-black text-slate-800 text-base overflow-hidden relative"
      >
        {p.image ? (
          <img 
            src={p.image} 
            alt={p.name} 
            className="w-full h-full object-cover animate-fade-in" 
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = getFallbackStoreImage(p.name, p.brand, p.cat);
            }}
          />
        ) : (
          (p.name || '?')[0].toUpperCase()
        )}
      </div>
    );
  }

  function openProdModal(product: Product) {
    setPmQty(1);
    setSelectedProduct(product);
  }

  function onSearch(val: string) {
    setSearchQ(val);
    if (val.trim()) {
      setCurrentTab('catalog');
    }
  }
};
