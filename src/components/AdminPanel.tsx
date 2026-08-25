import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  Lock, TrendingUp, DollarSign, Package, AlertTriangle, 
  Trash2, Plus, Edit, Download, Upload, LogOut, Check, X, 
  Volume2, Bell, Search, CheckCircle2, ChevronRight, FileText,
  Filter, Play, Sparkles, HelpCircle,
    Mail, Eye, EyeOff, ShieldCheck
} from 'lucide-react';
import { Product, Order, Category, PromoBanner, BillingConfig, DeliveryZone, Combo } from '../types';
import { db } from '../firebase';
import { compressImageForUpload, uploadToSupabase, withTimeout } from '../utils/imageUpload';
import { doc, getDoc, setDoc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';
import { auth } from '../firebase';
import { BOOTSTRAP_ADMIN_EMAILS } from '../hooks/useAdmin';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { CATS, CAT_ABBR, CAT_BG, getFallbackStoreImage } from '../data';
import { playChime } from '../utils/audio';
import { orderStatusLabel } from '../utils/orderStatus';
import { authedFetch } from '../utils/authedFetch';
import { Modal } from './Modal';
import origenesLogo from '../assets/images/origenes_emblem_128.png';

interface TemplateProduct {
  name: string;
  brand: string;
  cat: string;
  price: number;
  desc: string;
  image: string;
}

const TEMPLATE_PRODUCTS: TemplateProduct[] = [
  // CERVEZAS ('cervezas')
  { name: 'Cerveza Quilmes Clásica 1L', brand: 'Quilmes', cat: 'cervezas', price: 2200, desc: 'Cerveza clásica de sabor equilibrado.', image: 'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?q=80&w=300&auto=format&fit=crop' },
  { name: 'Cerveza Corona Extra 710ml', brand: 'Corona', cat: 'cervezas', price: 2500, desc: 'Cerveza rubia de sabor suave y fresco.', image: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?q=80&w=300&auto=format&fit=crop' },
  { name: 'Cerveza Heineken Original 1L', brand: 'Heineken', cat: 'cervezas', price: 2600, desc: 'Cerveza premium lager de gran carácter.', image: 'https://images.unsplash.com/photo-1532634922-8fe0b757fb13?q=80&w=300&auto=format&fit=crop' },
  { name: 'Cerveza Patagonia Amber Lager 410ml', brand: 'Patagonia', cat: 'cervezas', price: 1900, desc: 'Lata de cerveza roja tipo Amber con aroma intenso.', image: 'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?q=80&w=300&auto=format&fit=crop' },
  { name: 'Cerveza Stella Artois 975ml', brand: 'Stella Artois', cat: 'cervezas', price: 2450, desc: 'Lager premium europea con espuma persistente.', image: 'https://images.unsplash.com/photo-1584225065152-4a1454aa3d4e?q=80&w=300&auto=format&fit=crop' },
  { name: 'Cerveza Brahma Chopp 1L', brand: 'Brahma', cat: 'cervezas', price: 2100, desc: 'Cerveza liviana de refrescante sabor tradicional.', image: 'https://images.unsplash.com/photo-1566633806327-68e152aaf26d?q=80&w=300&auto=format&fit=crop' },
  { name: 'Cerveza Imperial Golden 1L', brand: 'Imperial', cat: 'cervezas', price: 2250, desc: 'Cerveza premium tipo Golden Ale rubia.', image: 'https://images.unsplash.com/photo-1598063414123-d77990c79313?q=80&w=300&auto=format&fit=crop' },

  // GASEOSAS/REFRESCOS ('gaseosas')
  { name: 'Coca-Cola Original Sabor Único 2.25L', brand: 'Coca-Cola', cat: 'gaseosas', price: 2400, desc: 'La bebida cola favorita para compartir en familia.', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=300&auto=format&fit=crop' },
  { name: 'Coca-Cola Sin Azúcar 1.5L', brand: 'Coca-Cola', cat: 'gaseosas', price: 1900, desc: 'Sabor espectacular e inconfundible con cero azúcar.', image: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=300&auto=format&fit=crop' },
  { name: 'Gaseosa Sprite Lima-Limón 2.25L', brand: 'Sprite', cat: 'gaseosas', price: 2300, desc: 'Refrescante sabor burbujeante a lima y limón.', image: 'https://images.unsplash.com/photo-1625772290748-09095df5aea7?q=80&w=300&auto=format&fit=crop' },
  { name: 'Gaseosa Pepsi Cola Regular 1.5L', brand: 'Pepsi', cat: 'gaseosas', price: 1650, desc: 'Gaseosa cola súper refrescante.', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?q=80&w=300&auto=format&fit=crop' },
  { name: 'Gaseosa Seven Up Regular 1.5L', brand: '7Up', cat: 'gaseosas', price: 1800, desc: 'Refresco cristalino lima-limón.', image: 'https://images.unsplash.com/photo-1527960656366-ee53706173a2?q=80&w=300&auto=format&fit=crop' },
  { name: 'Paso de los Toros tónica 1.5L', brand: 'Paso de los Toros', cat: 'gaseosas', price: 1750, desc: 'Sabor intensamente amargo y refrescante.', image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=300&auto=format&fit=crop' },
  { name: 'Gaseosa Fanta Naranja 1.5L', brand: 'Fanta', cat: 'gaseosas', price: 1800, desc: 'Irresistible sabor frutal divertido con gas.', image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?q=80&w=300&auto=format&fit=crop' },

  // GOLOSINAS ('kiosco')
  { name: 'Alfajor Milka Oreo Triple 135g', brand: 'Milka', cat: 'kiosco', price: 1100, desc: 'Tres tapas y dulce de leche con galletitas Oreo.', image: 'https://images.unsplash.com/photo-1511381939415-e44015466834?q=80&w=300&auto=format&fit=crop' },
  { name: 'Alfajor Guaymallén Negro DDL', brand: 'Guaymallén', cat: 'kiosco', price: 500, desc: 'Alfajor súper clásico argentino bañado en chocolate.', image: 'https://images.unsplash.com/photo-1508737804141-4c3b688e25be?q=80&w=300&auto=format&fit=crop' },
  { name: 'Bombón Bon o Bon Clásico Arcor', brand: 'Arcor', cat: 'kiosco', price: 350, desc: 'Exquisito bombón relleno con crema de maní tradicional.', image: 'https://images.unsplash.com/photo-1581798459219-318e76aaee7b?q=80&w=300&auto=format&fit=crop' },
  { name: 'Chocolate Cofler Block Maní 110g', brand: 'Cofler', cat: 'kiosco', price: 1800, desc: 'Chocolate con leche y muchísimo maní entero.', image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=300&auto=format&fit=crop' },
  { name: 'Chicles Beldent Menta Fuerte', brand: 'Beldent', cat: 'kiosco', price: 600, desc: 'Chicles individuales refrescantes sin azúcar.', image: 'https://images.unsplash.com/photo-1581798459219-318e76aaee7b?q=80&w=300&auto=format&fit=crop' },
  { name: 'Gomitas Mogul Ositos Frutales', brand: 'Mogul', cat: 'kiosco', price: 680, desc: 'Gomitas masticables infantiles de sabores frutales.', image: 'https://images.unsplash.com/photo-1582043211593-3f13903107c5?q=80&w=300&auto=format&fit=crop' },

  // SNACKS ('snacks')
  { name: 'Papas Fritas Lays Clásicas 90g', brand: 'Lays', cat: 'snacks', price: 1550, desc: 'Papas fritas saladas crujientes de primera calidad.', image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=300&auto=format&fit=crop' },
  { name: 'Doritos Mega Queso Nacho 150g', brand: 'Doritos', cat: 'snacks', price: 2300, desc: 'Snack de maíz con sabor ultra intenso a queso.', image: 'https://images.unsplash.com/photo-1599490656913-7e8c140cd0ac?q=80&w=300&auto=format&fit=crop' },
  { name: 'Cheetos Horneados Queso 80g', brand: 'Cheetos', cat: 'snacks', price: 1300, desc: 'Snacks de maíz horneados con delicioso sabor queso.', image: 'https://images.unsplash.com/photo-1534080564583-6be75777b70a?q=80&w=300&auto=format&fit=crop' },
  { name: 'Papas de Tubo Pringles Original 124g', brand: 'Pringles', cat: 'snacks', price: 3500, desc: 'Snack crocante emblemático en tubo protector.', image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=300&auto=format&fit=crop' },

  // FERNET & APERITIVOS ('fernet', 'aperitivos', 'bebidas_blancas')
  { name: 'Fernet Branca Único 750ml', brand: 'Branca', cat: 'fernet', price: 5800, desc: 'Aperitivo digestivo emblemático elaborado con finas hierbas.', image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=300&auto=format&fit=crop' },
  { name: 'Aperitivo Campari Milano Bitter 750ml', brand: 'Campari', cat: 'aperitivos', price: 3900, desc: 'Licor rojo de hierbas, ideal para tragos clásicos.', image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=300&auto=format&fit=crop' },
  { name: 'Aperitivo Gancia Americano 950ml', brand: 'Gancia', cat: 'aperitivos', price: 2700, desc: 'Histórica bebida aperitiva argentina.', image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=300&auto=format&fit=crop' },
  { name: 'Vodka Smirnoff Triple Destilado Red 700ml', brand: 'Smirnoff', cat: 'bebidas_blancas', price: 3500, desc: 'Vodka de excelente pureza para mezclas y tragos.', image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=300&auto=format&fit=crop' },

  // ENERGIZANTES ('energizantes')
  { name: 'Bebida Energizante Monster Energy 473ml', brand: 'Monster', cat: 'energizantes', price: 2100, desc: 'Garra y pura energía en cada lata.', image: 'https://images.unsplash.com/photo-1622543953490-0b7ced3d6ac3?q=80&w=300&auto=format&fit=crop' },
  { name: 'Bebida Energizante Red Bull Original 250ml', brand: 'Red Bull', cat: 'energizantes', price: 1950, desc: 'Te da alas para mantener el enfoque activo.', image: 'https://images.unsplash.com/photo-1622543953490-0b7ced3d6ac3?q=80&w=300&auto=format&fit=crop' },
  { name: 'Bebida Gatorade Naranja 500ml', brand: 'Gatorade', cat: 'energizantes', price: 1800, desc: 'Excelente rehidratador para tus rutinas diarias.', image: 'https://images.unsplash.com/photo-1551326844-301bd9b21f92?q=80&w=300&auto=format&fit=crop' }
];

const TEMPLATE_TABS = [
  { id: 'cervezas', name: '🍺 Cervezas', catKey: 'cervezas' },
  { id: 'gaseosas', name: '🥤 Refrescos', catKey: 'gaseosas' },
  { id: 'kiosco', name: '🍫 Golosinas', catKey: 'kiosco' },
  { id: 'snacks', name: '🍟 Snacks', catKey: 'snacks' },
  { id: 'bebidas', name: '🍷 Traguitos', catKeys: ['fernet', 'aperitivos', 'bebidas_blancas'] },
  { id: 'energizantes', name: '⚡ Energizantes', catKey: 'energizantes' }
];

interface AdminPanelProps {
  products: Product[];
  orders: Order[];
  onUpdateProduct: (product: Product) => void;
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onDeleteProduct: (productId: number) => void;
  // Se identifica por docId de Firestore: el numero de pedido (Order.id) se
  // calcula por dispositivo y se repite entre clientes.
  onUpdateOrderStatus: (docId: string, status: Order['status']) => void;
  onBulkImportProducts: (products: Product[]) => void;
  goBackToStore: () => void;
  newOrderToast: Order | null;
  onDismissNewOrderToast: () => void;
  currentUser: any;
  onSignInGoogle: () => void;
  signInState?: 'idle' | 'pending' | 'redirecting' | 'error';
  signInError?: string | null;
  onSignOut: () => void;
  banners?: PromoBanner[];
  onSaveBanner?: (banner: PromoBanner) => void;
  onDeleteBanner?: (bannerId: string) => void;
  onSyncStockWithExternalFacturador?: () => Promise<{ success: boolean; message: string; count: number }>;
  deliveryZones?: DeliveryZone[];
  combos?: Combo[];
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  onDbCategoryChange?: (category: string) => void;
  hasMore?: boolean;
  loadMoreProducts?: () => void;
  productsStatus?: 'loading' | 'ready' | 'error' | 'loadingMore';
  deliveryCutoffHour?: number;
  onUpdateDeliveryCutoffHour?: (hour: number) => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  products,
  orders,
  onUpdateProduct,
  onAddProduct,
  onDeleteProduct,
  onUpdateOrderStatus,
  onBulkImportProducts,
  goBackToStore,
  newOrderToast,
  onDismissNewOrderToast,
  currentUser,
  onSignInGoogle,
  signInState = 'idle',
  signInError,
  onSignOut,
  banners = [],
  onSaveBanner,
  onDeleteBanner,
  onSyncStockWithExternalFacturador,
  deliveryZones = [],
  combos = [],
  isAdmin,
  isSuperAdmin,
  onDbCategoryChange,
  hasMore,
  loadMoreProducts,
  productsStatus,
  deliveryCutoffHour,
  onUpdateDeliveryCutoffHour
}) => {
  // Authorization PIN
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pinVal, setPinVal] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
    const [loginEmail, setLoginEmail] = useState<string>('');
      const [loginPassword, setLoginPassword] = useState<string>('');
        const [loginError, setLoginError] = useState<string>('');
          const [loginLoading, setLoginLoading] = useState<boolean>(false);
            const [resetSent, setResetSent] = useState<boolean>(false);
              const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);

              const handleEmailPasswordLogin = async (e: React.FormEvent) => {
                  e.preventDefault();
                      setLoginError('');
                          setResetSent(false);
                              if (!loginEmail || !loginPassword) {
                                    setLoginError('Completá email y contraseña.');
                                          return;
                                              }
                                                  setLoginLoading(true);
                                                      try {
                                                            await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
                                                                } catch (err: any) {
                                                                      const code = err?.code || '';
                                                                            if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
                                                                                    setLoginError('Email o contraseña incorrectos.');
                                                                                          } else if (code.includes('too-many-requests')) {
                                                                                                  setLoginError('Demasiados intentos. Probá de nuevo en unos minutos.');
                                                                                                        } else {
                                                                                                                setLoginError('No se pudo iniciar sesión. Intentá de nuevo.');
                                                                                                                      }
                                                                                                                          } finally {
                                                                                                                                setLoginLoading(false);
                                                                                                                                    }
                                                                                                                                      };

                                                                                                                                        const handleForgotPassword = async () => {
                                                                                                                                            setLoginError('');
                                                                                                                                                setResetSent(false);
                                                                                                                                                    if (!loginEmail) {
                                                                                                                                                          setLoginError('Ingresá tu email arriba para poder enviarte el enlace.');
                                                                                                                                                                return;
                                                                                                                                                                    }
                                                                                                                                                                        try {
                                                                                                                                                                              await sendPasswordResetEmail(auth, loginEmail.trim());
                                                                                                                                                                                    setResetSent(true);
                                                                                                                                                                                        } catch (err) {
                                                                                                                                                                                              setLoginError('No pudimos enviar el correo. Verificá el email ingresado.');
                                                                                                                                                                                                  }
                                                                                                                                                                                                    };

  // Auto-authenticate with dynamic admin hook
  useEffect(() => {
    if (isAdmin) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, [isAdmin]);

  // Core administrative states
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'pedidos' | 'productos' | 'banners' | 'reportes' | 'clientes' | 'envios' | 'starpos' | 'admins'>('dashboard');
  const [orderQueryFilter, setOrderQueryFilter] = useState<'all' | Order['status']>('all');
  const [productCatFilter, setProductCatFilter] = useState<string>('all');
  useEffect(() => {
    if (onDbCategoryChange) {
      onDbCategoryChange(productCatFilter);
    }
  }, [productCatFilter, onDbCategoryChange]);
  const [productSearch, setProductSearch] = useState<string>('');

  // Modals / forms drawer
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showingAddForm, setShowingAddForm] = useState<boolean>(false);
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Form states for adding/editing product
  const [formName, setFormName] = useState<string>('');
  const [formBrand, setFormBrand] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formOrig, setFormOrig] = useState<string>('');
  const [formCat, setFormCat] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formImage, setFormImage] = useState<string>('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [formCodigoFacturador, setFormCodigoFacturador] = useState<string>('');

  // Modal Deletion & Facturador connection states
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [customAlert, setCustomAlert] = useState<{ message: string; title?: string } | null>(null);
  const [customConfirm, setCustomConfirm] = useState<{ message: string; title?: string; onConfirm: () => void } | null>(null);
  const [syncingStock, setSyncingStock] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [integrationStatus, setIntegrationStatus] = useState<any>(null);

  // Facturador settings states
  const [apiUrlInput, setApiUrlInput] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savingBilling, setSavingBilling] = useState<boolean>(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // StarPOS Integration States
  const [starposStatus, setStarposStatus] = useState<any>(null);
  const [starposLogs, setStarposLogs] = useState<string[]>([]);
  const [syncingCatalog, setSyncingCatalog] = useState<boolean>(false);
  const [syncingSales, setSyncingSales] = useState<boolean>(false);
  const [syncingStockDirect, setSyncingStockDirect] = useState<boolean>(false);
  const [starposSales, setStarposSales] = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState<boolean>(false);
  const [runningDiagnostic, setRunningDiagnostic] = useState<boolean>(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);

  // Administradores management states
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [invitesList, setInvitesList] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'super'>('admin');
  const [adminsActionMessage, setAdminsActionMessage] = useState<string>('');
  const [adminsActionError, setAdminsActionError] = useState<boolean>(false);

  // Subscribe to admins and admin_invites if user is super admin
  useEffect(() => {
    if (!isSuperAdmin) return;

    // Subscribe to 'admins'
    const unsubscribeAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAdminsList(list);
    }, (error) => {
      console.error("Error subscribing to admins:", error);
    });

    // Subscribe to 'admin_invites'
    const unsubscribeInvites = onSnapshot(collection(db, 'admin_invites'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setInvitesList(list);
    }, (error) => {
      console.error("Error subscribing to admin_invites:", error);
    });

    return () => {
      unsubscribeAdmins();
      unsubscribeInvites();
    };
  }, [isSuperAdmin]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminsActionMessage('');
    setAdminsActionError(false);

    const emailTrimmed = inviteEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      setAdminsActionError(true);
      setAdminsActionMessage('Por favor, ingresá un email válido.');
      return;
    }

    try {
      // Create invitation in 'admin_invites/{email}'
      const inviteRef = doc(db, 'admin_invites', emailTrimmed);
      await setDoc(inviteRef, {
        email: emailTrimmed,
        role: inviteRole,
        addedBy: currentUser?.email || 'superadmin',
        addedAt: new Date().toISOString()
      });

      setInviteEmail('');
      setAdminsActionError(false);
      setAdminsActionMessage('Invitación enviada. El usuario se convertirá en administrador la próxima vez que inicie sesión.');
    } catch (error: any) {
      console.error("Error creating invite:", error);
      setAdminsActionError(true);
      setAdminsActionMessage(`Error al crear invitación: ${error.message}`);
    }
  };

  const handleRemoveAdmin = async (admin: any) => {
    setAdminsActionMessage('');
    setAdminsActionError(false);

    // 1. Prevent removing themselves
    if (admin.id === currentUser?.uid) {
      setAdminsActionError(true);
      setAdminsActionMessage('No podés eliminarte a vos mismo como administrador.');
      return;
    }

    // 2. Prevent removing superadmins or bootstrapped admins
    const isBootstrapped = BOOTSTRAP_ADMIN_EMAILS.includes(admin.email?.toLowerCase() || '');
    if (admin.role === 'super' || isBootstrapped) {
      setAdminsActionError(true);
      setAdminsActionMessage('No se puede eliminar a un Superadministrador.');
      return;
    }

    if (!window.confirm(`¿Estás seguro de que querés quitar a ${admin.email} de los administradores?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'admins', admin.id));
      setAdminsActionError(false);
      setAdminsActionMessage(`Administrador ${admin.email} eliminado correctamente.`);
    } catch (error: any) {
      console.error("Error removing admin:", error);
      setAdminsActionError(true);
      setAdminsActionMessage(`Error al eliminar administrador: ${error.message}`);
    }
  };

  const handleCancelInvite = async (invitedEmail: string) => {
    if (!window.confirm(`¿Estás seguro de que querés cancelar la invitación para ${invitedEmail}?`)) {
      return;
    }
    setAdminsActionMessage('');
    setAdminsActionError(false);
    try {
      await deleteDoc(doc(db, 'admin_invites', invitedEmail));
      setAdminsActionError(false);
      setAdminsActionMessage(`Invitación para ${invitedEmail} cancelada.`);
    } catch (error: any) {
      console.error("Error cancelling invite:", error);
      setAdminsActionError(true);
      setAdminsActionMessage(`Error al cancelar invitación: ${error.message}`);
    }
  };

  const handleRunStarposDiagnostic = async () => {
    setRunningDiagnostic(true);
    setDiagnosticResult(null);
    setStarposLogs(["Iniciando diagnóstico técnico de enlace e infraestructura de red..."]);
    try {
      const res = await authedFetch('/api/starpos/diagnose');
      if (res.ok) {
        const data = await res.json();
        setDiagnosticResult(data);
        if (data.logs && Array.isArray(data.logs)) {
          setStarposLogs(data.logs);
        }
      } else {
        setStarposLogs(prev => [...prev, "❌ Error HTTP al consultar el módulo de diagnóstico."]);
      }
    } catch (err: any) {
      setStarposLogs(prev => [...prev, `❌ Error de red local: ${err.message}`]);
    } finally {
      setRunningDiagnostic(false);
    }
  };

  // Load StarPOS Settings and connection status
  const loadStarposStatus = async () => {
    try {
      const res = await authedFetch('/api/starpos/status');
      if (res.ok) {
        const data = await res.json();
        setStarposStatus(data);
      }
    } catch (err: any) {
      console.error("Error loading StarPOS status:", err);
    }
  };

  // Load imported tickets list
  const loadStarposSales = async () => {
    setLoadingSales(true);
    try {
      const res = await authedFetch('/api/starpos/sales');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStarposSales(data.sales || []);
        }
      }
    } catch (err) {
      console.error("Error loading StarPOS sales:", err);
    } finally {
      setLoadingSales(false);
    }
  };

  // Hook to fetch on tab switch
  useEffect(() => {
    if (currentTab === 'starpos') {
      loadStarposStatus();
      loadStarposSales();
    }
  }, [currentTab]);

  // Handle Catalog synchronization
  const handleSyncCatalogStarPOS = async () => {
    setSyncingCatalog(true);
    setStarposLogs(["Iniciando sincronización de catálogo con StarPOS..."]);
    try {
      const res = await authedFetch('/api/starpos/sync-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productsList: products })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStarposLogs(data.logs || ["Sincronización finalizada con éxito."]);
        setCustomAlert({
          title: "Sincronización Exitosa",
          message: `El catálogo se ha sincronizado correctamente en el orden obligatorio. Se enviaron ${data.syncedCount || products.length} artículos.`
        });
      } else {
        const errMsg = data.error || data.message || (Array.isArray(data.logs) && data.logs[data.logs.length - 1]) || "Error desconocido";
        setStarposLogs(prev => [...prev, `❌ Error: ${errMsg}`]);
        setCustomAlert({
          title: "Fallo en Sincronización",
          message: `La sincronización del catálogo falló: ${errMsg}`
        });
      }
    } catch (err: any) {
      setStarposLogs(prev => [...prev, `❌ Error de red: ${err.message}`]);
      setCustomAlert({
        title: "Error de Red",
        message: `Fallo al comunicarse con el servidor seguro: ${err.message}`
      });
    } finally {
      setSyncingCatalog(false);
      loadStarposStatus();
    }
  };

  // Handle Sales/Stock synchronization
  const handleSyncSalesStarPOS = async () => {
    setSyncingSales(true);
    setStarposLogs(["Iniciando importación de ventas y ajuste de stock..."]);
    try {
      const res = await authedFetch('/api/starpos/sync-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productsList: products })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStarposLogs(data.logs || ["Ventas importadas con éxito."]);
        
        let reductionMsg = "";
        if (data.stockReductions && data.stockReductions.length > 0) {
          reductionMsg = "\n\nSe ajustó el stock de:\n" + data.stockReductions.map((r: any) => `• ${r.productName} (Cant: -${r.qty})`).join('\n');
        } else {
          reductionMsg = "\n\nNo se detectaron nuevas ventas para procesar en esta sesión.";
        }

        setCustomAlert({
          title: "Ajuste de Stock Completado",
          message: `Se importaron ${data.ticketsFetched} comprobantes y ${data.closedCashFetched} cierres de caja.${reductionMsg}`
        });
        loadStarposSales();
      } else {
        const errMsg = data.error || data.message || "Error desconocido";
        setStarposLogs(prev => [...prev, `❌ Error: ${errMsg}`]);
        setCustomAlert({
          title: "Fallo en Sincronización",
          message: `Fallo al importar ventas: ${errMsg}`
        });
      }
    } catch (err: any) {
      setStarposLogs(prev => [...prev, `❌ Error de red: ${err.message}`]);
      setCustomAlert({
        title: "Error de Red",
        message: `Fallo al comunicarse con el servidor seguro: ${err.message}`
      });
    } finally {
      setSyncingSales(false);
      loadStarposStatus();
    }
  };

  // Handle direct stock sync from /v1/CurrentStock
  const handleSyncStockDirectStarPOS = async () => {
    setSyncingStockDirect(true);
    setStarposLogs(["Iniciando consulta directa de stock actual (/v1/CurrentStock)..."]);
    try {
      const res = await authedFetch('/api/starpos/sync-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStarposLogs(data.logs || ["Stock sincronizado con éxito."]);
        setCustomAlert({
          title: "Sincronización de Stock Exitosa",
          message: `Sincronización directa de stock finalizada con éxito. Se actualizaron ${data.syncedCount || 0} productos vinculados.`
        });
      } else {
        const errMsg = data.error || data.message || "Error desconocido";
        setStarposLogs(prev => [...prev, `❌ Error: ${errMsg}`]);
        setCustomAlert({
          title: "Fallo en Sincronización de Stock",
          message: `Fallo al sincronizar stock de forma directa: ${errMsg}`
        });
      }
    } catch (err: any) {
      setStarposLogs(prev => [...prev, `❌ Error de red: ${err.message}`]);
      setCustomAlert({
        title: "Error de Red",
        message: `Fallo al comunicarse con el servidor seguro: ${err.message}`
      });
    } finally {
      setSyncingStockDirect(false);
      loadStarposStatus();
    }
  };



  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const response = await authedFetch('/api/facturador/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiUrl: apiUrlInput, apiKey: apiKeyInput })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, message: data.error || 'Error de conexión.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Error de red.' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveBilling = async () => {
    setSavingBilling(true);
    setSaveResult(null);
    try {
      const docRef = doc(db, 'settings', 'billing');
      await setDoc(docRef, {
        apiUrl: apiUrlInput.trim(),
        apiKey: apiKeyInput.trim()
      });
      setSaveResult({ success: true, message: '¡Configuración guardada correctamente!' });
      
      // Refresh integrationStatus
      authedFetch('/api/facturador/status')
        .then(r => r.json())
        .then(data => setIntegrationStatus(data))
        .catch(() => {});
    } catch (err: any) {
      setSaveResult({ success: false, message: err.message || 'Error al guardar configuración.' });
    } finally {
      setSavingBilling(false);
    }
  };

  // Zonas de Envío States
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [zoneNameInput, setZoneNameInput] = useState<string>('');
  const [zoneKmInput, setZoneKmInput] = useState<string>('');
  const [zonePriceInput, setZonePriceInput] = useState<string>('');
  const [savingZone, setSavingZone] = useState<boolean>(false);

  // Auto-calculo del precio cuando cambian los METROS:
  // base $4.000 + $100 por cada 100 metros (empezados).
  useEffect(() => {
    const metersNum = parseFloat(zoneKmInput);
    if (!isNaN(metersNum)) {
      const calculatedPrice = 4000 + Math.ceil(metersNum / 100) * 100;
      setZonePriceInput(calculatedPrice.toString());
    }
  }, [zoneKmInput]);

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneNameInput.trim() || !zoneKmInput.trim() || !zonePriceInput.trim()) {
      alert("Por favor completa todos los campos de la zona.");
      return;
    }

    setSavingZone(true);
    try {
      const zoneId = editingZone ? editingZone.id : Date.now().toString();
      const zoneDoc: DeliveryZone = {
        id: zoneId,
        name: zoneNameInput.trim(),
        km: parseFloat(zoneKmInput) / 1000, // el input esta en METROS; se guarda en km por compatibilidad
        price: parseFloat(zonePriceInput)
      };

      await setDoc(doc(db, 'delivery_zones', zoneId), zoneDoc);
      
      // Reset form
      setEditingZone(null);
      setZoneNameInput('');
      setZoneKmInput('');
      setZonePriceInput('');
      
      setCustomAlert({
        title: "¡Éxito!",
        message: `La zona "${zoneDoc.name}" fue guardada correctamente.`
      });
    } catch (err: any) {
      console.error("Error saving zone:", err);
      alert(`Error al guardar la zona: ${err.message}`);
    } finally {
      setSavingZone(false);
    }
  };

  const handleDeleteZone = async (zone: DeliveryZone) => {
    setCustomConfirm({
      title: "Eliminar Zona de Envío",
      message: `¿Estás seguro de que deseas eliminar la zona "${zone.name}"? Los clientes ya no podrán seleccionarla.`,
      onConfirm: async () => {
        try {
          const { deleteDoc } = await import('firebase/firestore');
          await deleteDoc(doc(db, 'delivery_zones', zone.id));
          setCustomAlert({
            title: "Zona eliminada",
            message: `La zona "${zone.name}" fue eliminada de forma permanente.`
          });
        } catch (err: any) {
          console.error("Error deleting zone:", err);
          alert(`Error al eliminar zona: ${err.message}`);
        }
      }
    });
  };

  const handleStartEditZone = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setZoneNameInput(zone.name);
    setZoneKmInput(Math.round(zone.km * 1000).toString());
    setZonePriceInput(zone.price.toString());
  };

  const handleCancelEditZone = () => {
    setEditingZone(null);
    setZoneNameInput('');
    setZoneKmInput('');
    setZonePriceInput('');
  };

  // ============ COMBOS DE AHORRO (gestion desde el panel) ============
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [comboNameInput, setComboNameInput] = useState<string>('');
  const [comboLabelInput, setComboLabelInput] = useState<string>('');
  const [comboItemsInput, setComboItemsInput] = useState<string>('');
  const [comboPriceInput, setComboPriceInput] = useState<string>('');
  const [comboOrigInput, setComboOrigInput] = useState<string>('');
  const [savingCombo, setSavingCombo] = useState<boolean>(false);
  const [comboImageInput, setComboImageInput] = useState<string>('');
  const [isUploadingComboPhoto, setIsUploadingComboPhoto] = useState<boolean>(false);

  const resetComboForm = () => {
    setEditingCombo(null);
    setComboNameInput('');
    setComboLabelInput('');
    setComboItemsInput('');
    setComboPriceInput('');
    setComboOrigInput('');
    setComboImageInput('');
  };

  const handleSaveCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = comboNameInput.trim();
    const label = comboLabelInput.trim().toUpperCase();
    const items = comboItemsInput.trim();
    const price = Math.round(parseFloat(comboPriceInput));
    const orig = Math.round(parseFloat(comboOrigInput));
    if (!name || !items || isNaN(price) || isNaN(orig)) {
      showToast('Completa nombre, contenido y los dos precios \u274C');
      return;
    }
    if (price <= 0 || orig <= 0) {
      showToast('Los precios tienen que ser mayores a cero \u274C');
      return;
    }
    if (orig <= price) {
      showToast('El precio normal (sin combo) tiene que ser MAYOR al precio del combo \u274C');
      return;
    }
    setSavingCombo(true);
    try {
      // Los IDs de combos empiezan con 'c': asi el carrito los distingue de los productos.
      const comboId = editingCombo ? editingCombo.id : `c_${Date.now()}`;
      const comboDoc: Combo = {
        id: comboId,
        name,
        label: label || 'COMBO',
        items,
        price,
        orig,
        saving: orig - price,
        active: editingCombo ? (editingCombo.active !== false) : true,
        ...(comboImageInput ? { image: comboImageInput } : {}),
      };
      await setDoc(doc(db, 'combos', comboId), comboDoc);
      showToast(editingCombo ? '\ud83c\udf81 \u00a1Combo actualizado!' : '\ud83c\udf81 \u00a1Combo creado! Ya se ve en la tienda.');
      resetComboForm();
    } catch (err) {
      console.error('Error guardando combo:', err);
      showToast('Error al guardar el combo \u274C');
    } finally {
      setSavingCombo(false);
    }
  };

  // Misma logica que la foto de producto, pero contra la carpeta combos/.
  const handleComboPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('El archivo tiene que ser una imagen \u274C');
      return;
    }
    setIsUploadingComboPhoto(true);
    try {
      let blob: Blob;
      try {
        blob = await compressImageForUpload(file);
      } catch (compressErr) {
        console.error('No se pudo procesar la imagen:', compressErr);
        showToast('No pudimos procesar esa foto (formato no compatible). Probá con otra o sacale una captura 📸');
        return;
      }
      try {
        const url = await withTimeout(uploadToSupabase(blob, 'combos'), 45000);
        setComboImageInput(url);
        showToast('📷 ¡Foto subida con exito!');
      } catch (uploadErr) {
        console.error('Supabase no disponible, uso fallback local:', uploadErr);
        if (blob.size > 700 * 1024) {
          showToast('La foto es muy pesada y el almacenamiento no responde ❌');
          return;
        }
        const dataUrl: string = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onerror = () => rej(new Error('No se pudo leer la foto'));
          fr.onloadend = () => res(String(fr.result));
          fr.readAsDataURL(blob);
        });
        setComboImageInput(dataUrl);
        showToast('📷 Foto cargada (guardada dentro del combo)');
      }
    } finally {
      setIsUploadingComboPhoto(false);
    }
  };

  const handleToggleComboActive = async (combo: Combo) => {
    try {
      await setDoc(doc(db, 'combos', combo.id), { ...combo, active: combo.active === false });
      showToast(combo.active === false ? '\u2705 Combo activado' : '\u23f8\ufe0f Combo pausado (no se muestra en la tienda)');
    } catch (err) {
      console.error('Error cambiando estado del combo:', err);
      showToast('Error al cambiar el estado \u274C');
    }
  };

  const handleStartEditCombo = (combo: Combo) => {
    setEditingCombo(combo);
    setComboNameInput(combo.name);
    setComboLabelInput(combo.label);
    setComboItemsInput(combo.items);
    setComboPriceInput(combo.price.toString());
    setComboOrigInput(combo.orig.toString());
    setComboImageInput(combo.image || '');
  };

  const handleDeleteCombo = (combo: Combo) => {
    setCustomConfirm({
      title: 'Eliminar combo',
      message: `\u00bfSeguro que queres eliminar el combo "${combo.name}"? Esta accion no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'combos', combo.id));
          showToast('\ud83d\uddd1\ufe0f Combo eliminado');
          if (editingCombo?.id === combo.id) resetComboForm();
        } catch (err) {
          console.error('Error eliminando combo:', err);
          showToast('Error al eliminar el combo \u274C');
        }
      }
    });
  };


  const [formInStock, setFormInStock] = useState<boolean>(true);
  const [formValidationMsg, setFormValidationMsg] = useState<string>('');
  const [bulkPct, setBulkPct] = useState<string>('');

  // Banners local states
  const [bannerInText, setBannerInText] = useState<string>('');
  const [bannerInActive, setBannerInActive] = useState<boolean>(true);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);

  // AI Image generation states
  const [isGeneratingAIImage, setIsGeneratingAIImage] = useState<boolean>(false);
  const [isBulkGeneratingImages, setIsBulkGeneratingImages] = useState<boolean>(false);
  const [bulkGenProgress, setBulkGenProgress] = useState<{current: number; total: number} | null>(null);

  // Carga Rápida x Solapas (Template preloads)
  const [productViewSubTab, setProductViewSubTab] = useState<'carga_rapida' | 'gondola'>('carga_rapida');
  const [activeTemplateTab, setActiveTemplateTab] = useState<string>('cervezas');
  const [templatePrices, setTemplatePrices] = useState<Record<string, number>>({});

  // CSV Import drag/drop state
  const [showingCsvImport, setShowingCsvImport] = useState<boolean>(false);
  const [csvParsedList, setCsvParsedList] = useState<Product[]>([]);
  const [csvErrorsList, setCsvErrorsList] = useState<string[]>([]);
  const [csvImportMode, setCsvImportMode] = useState<'agregar' | 'reemplazar'>('agregar');
  const [csvDragActive, setCsvDragActive] = useState<boolean>(false);

  // Category selection bar dragging logic for PC
  const adminCatScrollRef = useRef<HTMLDivElement>(null);
  const [isAdminCatMouseDown, setIsAdminCatMouseDown] = useState(false);
  const [adminCatStartX, setAdminCatStartX] = useState(0);
  const [adminCatScrollLeft, setAdminCatScrollLeft] = useState(0);
  const isAdminDraggingCat = useRef(false);

  const handleAdminCatMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!adminCatScrollRef.current) return;
    setIsAdminCatMouseDown(true);
    setAdminCatStartX(e.pageX - adminCatScrollRef.current.offsetLeft);
    setAdminCatScrollLeft(adminCatScrollRef.current.scrollLeft);
    isAdminDraggingCat.current = false;
  };

  const handleAdminCatMouseLeaveOrUp = () => {
    setIsAdminCatMouseDown(false);
  };

  const handleAdminCatMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAdminCatMouseDown || !adminCatScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - adminCatScrollRef.current.offsetLeft;
    const walk = (x - adminCatStartX) * 1.5;
    if (Math.abs(walk) > 5) {
      isAdminDraggingCat.current = true;
    }
    adminCatScrollRef.current.scrollLeft = adminCatScrollLeft - walk;
  };

  const fmt = (n: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(n);
  };

  // Sound play utility for manager test
  const triggerAlarmSound = () => {
    playChime();
    showToast('Sonido de prueba activado 🔔');
  };

  // Monitor incoming server-side triggered order notifications
  useEffect(() => {
    if (newOrderToast) {
      playChime();
    }
  }, [newOrderToast]);

  // Handle PIN numeric click
  const handlePinNum = (n: string) => {
    if (pinVal.length >= 4) return;
    const newVal = pinVal + n;
    setPinVal(newVal);
    setPinError('');

    if (newVal === '1234') {
      setTimeout(() => {
        setIsAuthenticated(true);
        setPinVal('');
      }, 300);
    } else if (newVal.length === 4) {
      setTimeout(() => {
        setPinError('PIN incorrecto, volvé a intentar.');
        setPinVal('');
      }, 300);
    }
  };

  const handlePinDelete = () => {
    setPinVal(prev => prev.slice(0, -1));
  };

  // Toast notifications
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Statistics selectors
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayOrders = orders.filter(o => {
      try {
        return new Date(o.timestamp).toDateString() === today;
      } catch (e) {
        return false;
      }
    });

    const revenue = todayOrders.reduce((sum, o) => sum + (o.status !== 'cancelado' ? o.total : 0), 0);
    const activeProducts = products.filter(p => p.inStock).length;
    const outOfStockProducts = products.filter(p => !p.inStock).length;

    return {
      todayOrdersCount: todayOrders.length,
      todayRevenue: revenue,
      activeProductsCount: activeProducts,
      outOfStockCount: outOfStockProducts
    };
  }, [orders, products]);

  // Filtered orders list
  const getFilteredOrders = useMemo(() => {
    if (orderQueryFilter === 'all') return orders;
    return orders.filter(o => o.status === orderQueryFilter);
  }, [orders, orderQueryFilter]);

  // Filtered products list
  const getFilteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = productCatFilter === 'all' || p.cat === productCatFilter;
      const matchSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
                          p.brand.toLowerCase().includes(productSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, productCatFilter, productSearch]);

  // Toggle in stock / out of stock instantly from list view
  const quickToggleStock = (p: Product) => {
    onUpdateProduct({ ...p, inStock: !p.inStock });
    showToast(p.inStock ? `${p.name} pausado (Sin Stock)` : `${p.name} reactivado`);
  };

  // Setup edit form
  const populateEditForm = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormBrand(p.brand);
    setFormPrice(p.price.toString());
    setFormOrig(p.orig ? p.orig.toString() : '');
    setFormCat(p.cat);
    setFormDesc(p.desc);
    setFormImage(p.image || '');
    setFormInStock(p.inStock);
    setFormCodigoFacturador(p.codigoFacturador || '');
    setShowingAddForm(true);
  };

  const resetFormState = () => {
    setEditingProduct(null);
    setFormName('');
    setFormBrand('');
    setFormPrice('');
    setFormOrig('');
    setFormCat(CATS[0]?.id || '');
    setFormDesc('');
    setFormImage('');
    setFormInStock(true);
    setFormValidationMsg('');
    setFormCodigoFacturador('');
  };

  // Foto propia desde el dispositivo: comprime y sube a Firebase Storage.
  // Si Storage no esta disponible, guarda la foto comprimida dentro del
  // producto (fallback), asi la funcion nunca deja de andar.
  const handleDevicePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('El archivo tiene que ser una imagen \u274C');
      return;
    }
    setIsUploadingPhoto(true);
    try {
      let blob: Blob;
      try {
        blob = await compressImageForUpload(file);
      } catch (compressErr) {
        console.error('No se pudo procesar la imagen:', compressErr);
        showToast('No pudimos procesar esa foto (formato no compatible). Probá con otra o sacale una captura 📸');
        return;
      }
      try {
        const url = await withTimeout(uploadToSupabase(blob, 'products'), 45000);
        setFormImage(url);
        showToast('📷 ¡Foto subida con exito!');
      } catch (uploadErr) {
        console.error('Supabase no disponible, uso fallback local:', uploadErr);
        if (blob.size > 700 * 1024) {
          showToast('La foto es muy pesada y el almacenamiento no responde ❌');
          return;
        }
        const dataUrl: string = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onerror = () => rej(new Error('No se pudo leer la foto'));
          fr.onloadend = () => res(String(fr.result));
          fr.readAsDataURL(blob);
        });
        setFormImage(dataUrl);
        showToast('📷 Foto cargada (guardada dentro del producto)');
      }
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // AI single-image generation handler
  const handleAiGenerateImage = async () => {
    if (!formName.trim()) return;
    setIsGeneratingAIImage(true);
    setFormValidationMsg('');
    try {
      const response = await authedFetch('/api/ai/generate-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: formName.trim(),
          productBrand: formBrand.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo generar la imagen');
      }
      if (data.imageUrl) {
        setFormImage(data.imageUrl);
        showToast('¡Imagen generada con éxito por la IA! ✨');
      } else {
        throw new Error('No se recibió la URL de la imagen.');
      }
    } catch (err: any) {
      console.error(err);
      setFormValidationMsg(`Error IA: ${err.message || 'Verificá tu clave de API Gemini en Ajustes.'}`);
      showToast('Error al generar la imagen ❌');
    } finally {
      setIsGeneratingAIImage(false);
    }
  };

  // AI bulk-image generation handler
  const handleBulkGenerateImages = () => {
    const productsToGen = products.filter(p => !p.image || p.image.trim() === '');
    if (productsToGen.length === 0) {
      showToast('Todos los productos ya tienen una imagen cargada 🎉');
      return;
    }

    setCustomConfirm({
      title: 'Generar Imágenes con IA',
      message: `La IA va a generar fotos con estilo unificado para ${productsToGen.length} productos sin imagen. ¿Deseas iniciar este proceso en segundo plano de manera segura?`,
      onConfirm: async () => {
        setIsBulkGeneratingImages(true);
        let count = 0;
        setBulkGenProgress({ current: 0, total: productsToGen.length });

        for (const p of productsToGen) {
          try {
            const response = await authedFetch('/api/ai/generate-product-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productName: p.name,
                productBrand: p.brand || ''
              })
            });
            const data = await response.json();
            if (response.ok && data.imageUrl) {
              onUpdateProduct({
                ...p,
                image: data.imageUrl
              });
              count++;
            }
          } catch (err) {
            console.error(`AI failed to generate image for ${p.name}:`, err);
          }
          setBulkGenProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
        }

        setIsBulkGeneratingImages(false);
        setBulkGenProgress(null);
        showToast(`¡Completado! Se generaron ${count} imágenes con IA ✨`);
      }
    });
  };

  // Submit product creation / editing
  const saveProduct = () => {
    if (!formName.trim()) {
      setFormValidationMsg('El nombre del producto es obligatorio.');
      return;
    }
    const priceNum = parseFloat(formPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormValidationMsg('El precio debe ser un número mayor a 0.');
      return;
    }
    if (!formCat) {
      setFormValidationMsg('Debés seleccionar una categoría válida.');
      return;
    }

    const origNum = parseFloat(formOrig);

    const dataPayload = {
      name: formName.trim(),
      brand: formBrand.trim(),
      price: priceNum,
      orig: isNaN(origNum) ? null : origNum,
      cat: formCat,
      desc: formDesc.trim(),
      inStock: formInStock,
      ...(formImage.trim() ? { image: formImage.trim() } : {}),
      ...(formCodigoFacturador.trim() ? { codigoFacturador: formCodigoFacturador.trim() } : {}),
    };

    if (editingProduct) {
      onUpdateProduct({
        ...editingProduct,
        ...dataPayload
      });
      showToast('Producto actualizado con éxito');
    } else {
      onAddProduct(dataPayload);
      showToast('Producto creado con éxito');
    }

    setShowingAddForm(false);
    resetFormState();
  };

  // EXPORT CSV
  const triggerCsvExport = () => {
    const headers = 'nombre,marca,precio,precio_original,categoria,descripcion,en_stock,imagen\n';
    const lines = products.map(p => {
      const escape = (str: string) => `"${str.replace(/"/g, '""')}"`;
      return [
        escape(p.name),
        escape(p.brand || ''),
        p.price,
        p.orig || '',
        p.cat,
        escape(p.desc || ''),
        p.inStock ? 'si' : 'no',
        escape(p.image || '')
      ].join(',');
    }).join('\n');

    const blob = new Blob(['\uFEFF' + headers + lines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `origenes_productos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Productos exportados en CSV');
  };

  // EXCEL & CSV BULK IMPORT HANDLER (ROBUST XLSX/CSV PARSING)
  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();

    // Helper to parse CSV manually to be bulletproof against quote-wrapping and delimiter-mismatch
    const parseCSVText = (text: string): string[][] => {
      const result: string[][] = [];
      let row: string[] = [];
      let inQuotes = false;
      let currentVal = '';

      // Auto-detect delimiter: comma or semicolon or tab
      const firstLine = text.split(/\r?\n/)[0] || '';
      let delimiter = ',';
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semicolonCount = (firstLine.match(/;/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      if (semicolonCount > commaCount && semicolonCount > tabCount) {
        delimiter = ';';
      } else if (tabCount > commaCount && tabCount > semicolonCount) {
        delimiter = '\t';
      }

      const len = text.length;
      for (let i = 0; i < len; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            currentVal += '"';
            i++; // skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          row.push(currentVal);
          currentVal = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
          row.push(currentVal);
          if (row.length > 0 && row.some(cell => cell !== '')) {
            result.push(row);
          }
          row = [];
          currentVal = '';
          if (char === '\r' && nextChar === '\n') {
            i++; // skip \n
          }
        } else {
          currentVal += char;
        }
      }
      if (row.length > 0 || currentVal !== '') {
        row.push(currentVal);
        if (row.some(cell => cell !== '')) {
          result.push(row);
        }
      }
      return result;
    };

    // Helper to parse price intelligently supporting multiple formats (7.800,00 vs 7,800.00 vs 7800)
    const parsePriceValue = (val: any): { price: number; error: boolean } => {
      if (typeof val === 'number') {
        return { price: val, error: isNaN(val) || val <= 0 };
      }
      if (val === null || val === undefined) {
        return { price: 0, error: true };
      }
      
      let str = String(val).trim();
      if (str === '') return { price: 0, error: true };

      // Remove symbols of currencies or other chars except digits, comma and dot
      str = str.replace(/[^0-9.,-]/g, '');

      const lastComma = str.lastIndexOf(',');
      const lastDot = str.lastIndexOf('.');

      if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
          str = str.replace(/\./g, '').replace(',', '.');
        } else {
          str = str.replace(/,/g, '');
        }
      } else if (lastComma > -1) {
        const afterComma = str.length - 1 - lastComma;
        if (afterComma === 2) {
          str = str.replace(',', '.');
        } else {
          str = str.replace(',', '');
        }
      } else if (lastDot > -1) {
        const afterDot = str.length - 1 - lastDot;
        if (afterDot === 3) {
          str = str.replace(/\./g, '');
        }
      }

      const price = parseFloat(str);
      return { price, error: isNaN(price) || price <= 0 };
    };

    // Helper to robustly match category name/ID with existing ones in CATS
    const matchCategory = (val: string): string => {
      const normVal = val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      
      if (['almacen', 'almacén', 'alimento', 'comida', 'abarrotes', 'alimentos', 'mercaderia'].includes(normVal)) {
        return 'almacen';
      }
      if (['bebidas', 'bebida', 'gaseosa', 'gaseosas', 'jugo', 'jugos', 'agua', 'aguas', 'refresco', 'refrescos', 'cerveza', 'cervezas', 'vino', 'vinos', 'alcohol'].includes(normVal)) {
        return 'gaseosas';
      }
      if (['panaderia', 'panadería', 'panaderias', 'pan', 'facturas', 'factura', 'criollitas', 'panificados', 'factureria', 'facturas y pan', 'criollas'].includes(normVal)) {
        return 'panificados';
      }
      if (['golosinas', 'golosina', 'dulces', 'caramelos', 'chicles', 'chicle'].includes(normVal)) {
        return 'kiosco';
      }
      if (['lacteos', 'lacteo', 'lácteos', 'leche', 'queso', 'quesos', 'crema', 'manteca', 'yogur', 'yogures'].includes(normVal)) {
        return 'lacteos';
      }

      const found = CATS.find(c => {
        const normName = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const normId = c.id.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        return normName === normVal || normId === normVal || normName.includes(normVal) || normVal.includes(normId);
      });

      return found ? found.id : 'kiosco';
    };

    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      if (!data) return;

      try {
        const uint8 = new Uint8Array(data);
        let rawRows: any[][] = [];

        // Check ZIP signature for XLSX (PK.. 80, 75)
        const isXlsx = uint8.length > 4 && uint8[0] === 80 && uint8[1] === 75;

        if (isXlsx) {
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        } else {
          // Parse as text
          const decoder = new TextDecoder('utf-8');
          let text = decoder.decode(data);
          if (text.includes('')) {
            const latin1Decoder = new TextDecoder('iso-8859-1');
            text = latin1Decoder.decode(data);
          }
          rawRows = parseCSVText(text);
        }

        if (rawRows.length < 2) {
          showToast('El archivo está vacío o no contiene una línea de encabezados válida.');
          return;
        }

        const headers = rawRows[0].map(h => 
          h ? String(h).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : ''
        );
        
        // Find indices with aliases to support diverse Excel/CSV header options
        const nameIdx = headers.findIndex(h => ['nombre', 'name', 'producto', 'product', 'item'].includes(h));
        const brandIdx = headers.findIndex(h => ['marca', 'brand', 'fabricante'].includes(h));
        const priceIdx = headers.findIndex(h => ['precio', 'price', 'precio_venta', 'costo', 'valor'].includes(h));
        const origIdx = headers.findIndex(h => ['precio_original', 'precio_orig', 'orig', 'precio_anterior', 'anterior'].includes(h));
        const catIdx = headers.findIndex(h => ['categoria', 'cat', 'category', 'rubro', 'tipo', 'grupo'].includes(h));
        const descIdx = headers.findIndex(h => ['descripcion', 'description', 'desc', 'detalle', 'info'].includes(h));
        const stockIdx = headers.findIndex(h => ['en_stock', 'stock', 'disponible', 'activo', 'habilitado'].includes(h));
        const imgIdx = headers.findIndex(h => ['imagen', 'image', 'url_imagen', 'img', 'foto', 'enlace'].includes(h));

        if (nameIdx < 0 || priceIdx < 0 || catIdx < 0) {
          showToast('Formato de columnas inválido. Asegurate de incluir: nombre, precio, categoria.');
          return;
        }

        const parsed: Product[] = [];
        const errors: string[] = [];
        
        // Build map for existing products to update/reuse its ID
        const existingByName: Record<string, Product> = {};
        products.forEach(p => {
          existingByName[p.name.toLowerCase().trim()] = p;
        });

        let indexId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1000;

        rawRows.slice(1).forEach((fields, rowIdx) => {
          const lineNum = rowIdx + 2;
          if (!fields || fields.length === 0 || fields.every(f => f === null || f === undefined || f === '')) {
            return;
          }

          const nameVal = nameIdx >= 0 ? fields[nameIdx] : '';
          const name = nameVal ? String(nameVal).trim() : '';

          const rawPrice = priceIdx >= 0 ? fields[priceIdx] : undefined;
          const { price, error: priceError } = parsePriceValue(rawPrice);

          const catVal = catIdx >= 0 ? fields[catIdx] : '';
          const cat = catVal ? matchCategory(String(catVal)) : 'kiosco';

          const rowErrs: string[] = [];
          if (!name) rowErrs.push('nombre vacío');
          if (priceError) rowErrs.push('precio inválido');
          if (!cat) rowErrs.push('categoría vacía');

          const brand = brandIdx >= 0 && fields[brandIdx] ? String(fields[brandIdx]).trim() : '';
          const desc = descIdx >= 0 && fields[descIdx] ? String(fields[descIdx]).trim() : '';
          
          const rawOrig = origIdx >= 0 ? fields[origIdx] : undefined;
          const { price: orig, error: origError } = parsePriceValue(rawOrig);
          const finalOrig = origError ? null : orig;

          const stockVal = stockIdx >= 0 ? fields[stockIdx] : '';
          const stockStr = stockVal ? String(stockVal).toLowerCase().trim() : 'si';
          const inStockVal = stockStr === 'si' || stockStr === 'sí' || stockStr === 'true' || stockStr === '1' || stockStr === 'yes' || stockStr === 'activo' || stockStr === 'ok';

          const imageVal = imgIdx >= 0 && fields[imgIdx] ? String(fields[imgIdx]).trim() : '';

          if (rowErrs.length > 0) {
            errors.push(`Fila ${lineNum}: ${rowErrs.join(', ')}`);
          } else {
            // Find existing product to reuse ID and avoid duplicates when uploading new stock/prices
            const normName = name.toLowerCase().trim();
            const existingProduct = existingByName[normName];
            
            let targetId: number;
            if (existingProduct) {
              targetId = existingProduct.id;
            } else {
              const alreadyParsed = parsed.find(p => p.name.toLowerCase().trim() === normName);
              if (alreadyParsed) {
                targetId = alreadyParsed.id;
              } else {
                targetId = indexId++;
              }
            }

            parsed.push({
              id: targetId,
              name,
              brand: brand || 'Kiosco',
              price,
              orig: finalOrig,
              cat,
              desc: desc || '',
              image: imageVal || undefined,
              inStock: inStockVal
            });
          }
        });

        setCsvParsedList(parsed);
        setCsvErrorsList(errors);
      } catch (err) {
        console.error("XLSX/CSV parsing failed: ", err);
        showToast('Error procesando el archivo. Verificá que sea un formato Excel o CSV válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmCsvImport = () => {
    if (csvParsedList.length === 0) return;
    
    if (csvImportMode === 'reemplazar') {
      onBulkImportProducts(csvParsedList);
    } else {
      // Merge: update existing and add brand new
      const map = new Map<number, Product>();
      products.forEach(p => map.set(p.id, p));
      csvParsedList.forEach(p => map.set(p.id, p));
      onBulkImportProducts(Array.from(map.values()));
    }

    setShowingCsvImport(false);
    setCsvParsedList([]);
    setCsvErrorsList([]);
    showToast('Productos importados correctamente');
  };

  // Download simple sample plantilla CSV
  const downloadSampleTemplate = () => {
    const template = 'nombre,marca,precio,precio_original,categoria,descripcion,en_stock,imagen\n' +
                     'Coca-Cola Redonda,Coca-cola,1300,1500,bebidas,Gaseosa refrescante de 600ml,si,https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200\n' +
                     'Chicle Beldent Menta,Beldent,600,,golosinas,Menta fuerte sin azucar,si,https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=200\n' +
                     'Papas de la Casa,Snacks Corp,1500,,snacks,Papas saladas crujientes,no,';
    
    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_productos_origenes.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Plantilla CSV descargada');
  };

  // Report aggregates
  const reports = useMemo(() => {
    const completedOrders = orders.filter(o => o.status !== 'cancelado');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrderValue = completedOrders.length;
    const averageTicket = totalOrderValue > 0 ? totalRevenue / totalOrderValue : 0;
    const canceledOrders = orders.filter(o => o.status === 'cancelado').length;

    // Calc sales by product
    const productSalesMap: Record<string, number> = {};
    completedOrders.forEach(o => {
      o.items.forEach(it => {
        productSalesMap[it.name] = (productSalesMap[it.name] || 0) + it.qty;
      });
    });

    const topProducts = Object.entries(productSalesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      revenueSum: totalRevenue,
      orderValue: totalOrderValue,
      avgTicket: averageTicket,
      canceledCount: canceledOrders,
      favoritesSold: topProducts
    };
  }, [orders]);

  // RENDER LOGIN SCREEN (Email & Password)
  if (!isAuthenticated) {
  return (
  <div className="w-full h-full bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white flex flex-col items-center justify-center px-6 py-8 relative overflow-hidden" id="admin-login-view">

  <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
  <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

  <button
  type="button"
  onClick={goBackToStore}
  className="absolute top-6 left-6 text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 transition-all active:scale-95 z-10"
  >
  ← Volver a la Tienda
  </button>

  <div className="w-full max-w-[340px] flex flex-col items-center z-10">
  <img src={origenesLogo} alt="Orígenes Ushuaia" className="w-16 h-16 rounded-2xl shadow-lg shadow-blue-900/30 mb-4 object-cover" />
  <h2 className="text-2xl font-black tracking-tight leading-none mb-1">Orígenes Ushuaia</h2>
  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[3px] mb-8">Panel de Administración</p>

  <button
  onClick={onSignInGoogle}
  disabled={signInState === 'pending' || signInState === 'redirecting'}
  className="w-full h-11 bg-white/5 hover:bg-white/10 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-[12px] font-bold tracking-wide rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2.5"
  >
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12.24 10.285V13.4h6.887c-.275 1.564-1.88 4.593-6.887 4.593-4.32 0-7.855-3.57-7.855-7.978s3.535-7.978 7.855-7.978c2.32 0 3.856.964 4.848 1.936l3.348-3.24C18.42.847 15.585 0 12.24 0 5.472 0 0 5.446 0 12s5.472 12 12.24 12c7.05 0 11.75-4.964 11.75-11.965 0-.804-.086-1.42-.19-2.03l-11.56.28z" />
  </svg>
  {signInState === 'pending' ? 'Conectando…' : signInState === 'redirecting' ? 'Redirigiendo…' : 'Continuar con Google'}
  </button>

  {signInError && (
  <p role="alert" className="mt-3 w-full text-[11px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-center">
  {signInError}
  </p>
  )}

  {currentUser && (
  <button
  onClick={onSignOut}
  className="mt-4 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors"
  >
  Cerrar sesión de {currentUser.email}
  </button>
  )}
  </div>
  </div>
  );
  }

  // RENDER ADMIN PANEL INTERFACE
  return (
    <div className="w-full flex flex-col h-full bg-slate-50 relative overflow-hidden" id="admin-panel-main">
      
      {/* ADMIN HEADER */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 pt-4 pb-3 flex-shrink-0 text-white z-20 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-white border border-slate-200 overflow-hidden shadow-inner shrink-0">
                <img 
                  src={origenesLogo} 
                  alt="Orígenes Ushuaia Logo" 
                                className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h2 className="text-base font-black tracking-tight leading-none text-white">Orígenes Ushuaia Admin</h2>
            </div>
            <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
              {currentUser ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Nube: {currentUser.email}
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Modo local temporal base de datos
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            
            {/* Chime sound test button */}
            <button 
              onClick={triggerAlarmSound}
              title="Probar Alerta Sonora"
              className="bg-slate-800 hover:bg-slate-700 text-blue-500 border border-slate-700/80 p-2 rounded-lg flex items-center justify-center shadow"
            >
              <Volume2 size={14} />
            </button>

<button
onClick={() => setShowHelpGuide(true)}
title="Como usar el panel"
className="bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700/80 p-2 rounded-lg flex items-center justify-center shrink-0"
>
<HelpCircle size={14} />
</button>

            <button 
              onClick={goBackToStore}
              className="bg-blue-600 hover:bg-blue-700 font-bold text-xs text-white px-3 py-1.5 rounded-lg shadow-sm transition-colors"
            >
              Ir a la Tienda
            </button>
            <button 
              onClick={() => setIsAuthenticated(false)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-400 p-2 rounded-lg"
              title="Cerrar Sesión Panel"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Dynamic visual incoming alert toast inside screen header */}
        <AnimatePresence>
          {newOrderToast && (
            <motion.div 
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="mt-3 bg-blue-600 text-white text-xs font-bold py-2.5 px-3.5 rounded-xl shadow-lg border border-blue-500 flex items-center justify-between animate-pulse"
              id="admin-visual-notif-toast"
            >
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-white animate-bounce shrink-0" />
                <span>
                  &iexcl;NUEVO PEDIDO RECIBIDO! <b>#{newOrderToast.id}</b> ({fmt(newOrderToast.total)})
                </span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button 
                  onClick={() => {
                    setSelectedOrder(newOrderToast);
                    setCurrentTab('pedidos');
                    onDismissNewOrderToast();
                  }}
                  className="bg-white text-blue-600 text-[10px] font-black px-2 py-1 rounded"
                >
                  ADMINISTRAR
                </button>
                <button onClick={onDismissNewOrderToast} className="text-white font-bold px-1 text-sm">
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ADMIN LEVEL SUB-NAV */}
      <div className="bg-white border-b border-slate-200 flex flex-wrap no-scrollbar flex-shrink-0 font-semibold text-[10px] uppercase shadow-sm flex-nowrap select-none">
        <button 
          onClick={() => setCurrentTab('dashboard')}
          className={`px-4 py-3 text-center border-b-2 transition-all shrink-0 ${
            currentTab === 'dashboard' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
          }`}
        >
          Estado Panel
        </button>
        <button 
          onClick={() => setCurrentTab('pedidos')}
          className={`px-4 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1.5 shrink-0 ${
            currentTab === 'pedidos' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
          }`}
        >
          Pedidos
          {orders.filter(o => o.status === 'pendiente').length > 0 && (
            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block animate-ping" />
          )}
        </button>
        <button 
          onClick={() => setCurrentTab('productos')}
          className={`px-4 py-3 text-center border-b-2 transition-all shrink-0 ${
            currentTab === 'productos' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
          }`}
        >
          Productos
        </button>
        <button 
          onClick={() => setCurrentTab('banners')}
          className={`px-4 py-3 text-center border-b-2 transition-all shrink-0 ${
            currentTab === 'banners' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
          }`}
        >
          📢 Banners
        </button>
        <button 
          onClick={() => setCurrentTab('reportes')}
          className={`px-4 py-3 text-center border-b-2 transition-all shrink-0 ${
            currentTab === 'reportes' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
          }`}
        >
          Reportes
        </button>
        <button 
          onClick={() => setCurrentTab('clientes')}
          className={`px-4 py-3 text-center border-b-2 transition-all shrink-0 ${
            currentTab === 'clientes' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
          }`}
        >
          👥 Clientes
        </button>
        <button 
          onClick={() => setCurrentTab('envios')}
          className={`px-4 py-3 text-center border-b-2 transition-all shrink-0 ${
            currentTab === 'envios' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
          }`}
        >
          🛵 Zonas Envío
        </button>
        <button 
          onClick={() => setCurrentTab('starpos')}
          className={`px-4 py-3 text-center border-b-2 transition-all shrink-0 ${
            currentTab === 'starpos' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
          }`}
        >
          🔌 Integración StarPOS
        </button>
        {isSuperAdmin && (
          <button 
            onClick={() => setCurrentTab('admins')}
            className={`px-4 py-3 text-center border-b-2 transition-all shrink-0 ${
              currentTab === 'admins' ? 'border-blue-600 text-slate-900 font-extrabold' : 'border-transparent text-slate-400'
            }`}
          >
            🛡️ Administradores
          </button>
        )}
      </div>

      {/* CORE DISPLAY WORKSPACE */}
      <main className="flex-1 overflow-y-auto p-3.5 pb-20">
        
        {/* DASHBOARD TAB */}
        {currentTab === 'dashboard' && (
          <div className="flex flex-col gap-4">
            
            {/* Quick numerical counters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between">
                  <span className="text-xl bg-blue-50 shadow p-1.5 rounded-lg">📋</span>
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-black uppercase">HOY</span>
                </div>
                <h4 className="text-2xl font-black text-slate-800 mt-2 leading-none">{stats.todayOrdersCount}</h4>
                <p className="text-[10.5px] text-slate-400 mt-1 font-semibold leading-tight">Pedidos Totales</p>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between">
                  <span className="text-xl bg-green-50 shadow p-1.5 rounded-lg">💰</span>
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-black uppercase">HOY</span>
                </div>
                <h4 className="text-2xl font-black text-slate-800 mt-2 leading-none">{fmt(stats.todayRevenue)}</h4>
                <p className="text-[10.5px] text-slate-400 mt-1 font-semibold leading-tight">Ingresos Netos</p>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xl bg-blue-50 shadow p-1.5 rounded-lg">📦</span>
                <h4 className="text-2xl font-black text-slate-800 mt-3 leading-none">{stats.activeProductsCount}</h4>
                <p className="text-[10.5px] text-slate-400 mt-1 font-semibold leading-tight">Productos en Stock</p>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xl bg-blue-50 shadow p-1.5 rounded-lg">⚠️</span>
                <h4 className="text-2xl font-black text-blue-600 mt-3 leading-none">{stats.outOfStockCount}</h4>
                <p className="text-[10.5px] text-slate-400 mt-1 font-semibold leading-tight">Artículos Pausados</p>
              </div>
            </div>

            {/* Pedidos Recientes list */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Pedidos recientes del local</h3>
                <button onClick={() => setCurrentTab('pedidos')} className="text-xs font-extrabold text-blue-600 hover:underline">
                  Ver todos
                </button>
              </div>

              <div className="flex flex-col divide-y divide-slate-100">
                {orders.slice(0, 5).map(o => (
                  <div
                    key={o.docId ?? `local-${o.id}`}
                    onClick={() => setSelectedOrder(o)}
                    className="py-3 flex items-center justify-between hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-800">Pedido #{o.id}</span>
                        <span className="text-[9.5px] font-semibold text-slate-400 italic">
                          ({o.delivery === 'envio' ? 'Pedidos Va 🛵' : 'Retiro'})
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                        {o.items.length} productos · {new Date(o.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      <span className="text-xs font-extrabold text-slate-900 block">{fmt(o.total)}</span>
                      <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none mt-1 ${
                        o.status === 'pending_confirmation' ? 'bg-blue-100 text-blue-800' :
                        o.status === 'pendiente' ? 'bg-blue-100 text-blue-700' :
                        o.status === 'confirmado' ? 'bg-blue-100 text-blue-800' :
                        o.status === 'listo' ? 'bg-blue-100 text-blue-700' :
                        o.status === 'entregado' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {o.status === 'pending_confirmation' ? 'Envío Mañana' : orderStatusLabel(o.status, o.delivery)}
                      </span>
                    </div>
                  </div>
                ))}
                
                {orders.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">Sin pedidos hoy.</p>
                )}
              </div>
            </div>

            {/* List Out Of Stock Alert and Reactivate */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2.5 border-b border-slate-100 mb-2.5">
                Alerta: Artículos Sin Stock
              </h3>

              <div className="flex flex-col divide-y divide-slate-100">
                {products.filter(p => !p.inStock).map(p => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">{p.name}</h4>
                      <p className="text-[10px] text-slate-400 font-medium">{p.brand} · {p.cat}</p>
                    </div>
                    
                    <button 
                      onClick={() => quickToggleStock(p)}
                      className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 font-black text-[10px] px-2.5 py-1.5 rounded-lg transition-transform active:scale-95"
                    >
                      Activar Stock
                    </button>
                  </div>
                ))}

                {products.filter(p => !p.inStock).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4 italic font-medium">
                    ¡Todos los artículos tienen stock activo en góndola!
                  </p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ORDERS MANAGEMENT TAB */}
        {currentTab === 'pedidos' && (
          <div className="flex flex-col gap-3">
            
            {/* Status Segment Filtering chip bar */}
            <div className="flex gap-1.5 overflow-x-auto select-none no-scrollbar pb-1">
              {(['all', 'pending_confirmation', 'pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'listo', 'entregado', 'cancelado'] as const).map(s => {
                const labels: Record<string, string> = {
                  all: 'Todos',
                  pending_confirmation: 'Envío Mañana ⏰',
                  pendiente: 'Recibidos 📥',
                  confirmado: 'Confirmados ✅',
                  en_preparacion: 'En preparación 👨‍🍳',
                  en_camino: 'En camino 🛵',
                  listo: 'Listos 📦',
                  entregado: 'Entregados 🚚',
                  cancelado: 'Cancelados ❌'
                };
                return (
                  <button 
                    key={s}
                    onClick={() => setOrderQueryFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                      orderQueryFilter === s 
                        ? 'bg-slate-800 text-white shadow-sm' 
                        : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {labels[s] || s}
                  </button>
                );
              })}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {getFilteredOrders.map(o => (
                <div key={o.docId ?? `local-${o.id}`} className="p-3.5 hover:bg-slate-50/50 cursor-pointer" onClick={() => setSelectedOrder(o)}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <h4 className="text-xs font-black text-slate-800">
                        Pedido #{o.id}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        {new Date(o.timestamp).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-extrabold text-slate-950 block">{fmt(o.total)}</span>
                      <span className={`inline-block text-[9.5px] font-black tracking-widest uppercase px-2 py-0.5 rounded leading-none mt-1 shadow-sm ${
                        o.status === 'pending_confirmation' ? 'bg-blue-100 text-blue-800' :
                        o.status === 'pendiente' ? 'bg-blue-100 text-blue-700' :
                        o.status === 'confirmado' ? 'bg-blue-100 text-blue-800' :
                        o.status === 'listo' ? 'bg-blue-100 text-blue-700' :
                        o.status === 'entregado' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {o.status === 'pending_confirmation' ? 'Envío Mañana' : orderStatusLabel(o.status, o.delivery)}
                      </span>
                    </div>
                  </div>

                  {/* Customer attributes */}
                  <div className="bg-slate-50/50 p-2 rounded-lg border border-slate-100 flex flex-col gap-1 text-[11px] font-medium text-slate-600 mb-2">
                    <p className="truncate"><b>Cliente:</b> {o.customerName || 'Consumidor Final'}</p>
                    <p><b>Celular:</b> {o.customerPhone || 'S/D'}</p>
                    {o.customerLocation && (
                      <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-2.5 mt-1.5 flex flex-col gap-1.5 align-start text-xs font-bold text-slate-800 animate-fade-in whitespace-pre-wrap break-words">
                        <span className="text-[10px] uppercase font-black tracking-wider text-blue-600 flex items-center gap-1 leading-none">📍 Dirección de Despacho (Pedidos Va)</span>
                        <span className="font-sans leading-relaxed font-semibold text-[11px] block text-slate-800">{o.customerLocation}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(o.customerLocation || '');
                            showToast('¡Dirección copiada!');
                          }}
                          className="self-start text-[10px] font-extrabold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg transition-all active:scale-95 shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          📋 Copiar Dirección
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2 items-center text-[10px] mt-1 border-t border-slate-100/50 pt-1 flex-wrap">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-bold">
                        💳 {o.paymentMethod || 'Efectivo'}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-black border uppercase text-[9px] ${
                        o.paymentStatus === 'aprobado'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {o.paymentStatus === 'aprobado' ? 'PAGADO ONLINE' : 'COBRAR AL RECIBIR'}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10.5px] text-slate-400 font-bold">
                    <span>{o.items.length} artículos comprados</span>
                    <span className="text-blue-600 hover:underline">Gestionar pedido →</span>
                  </div>
                </div>
              ))}

              {getFilteredOrders.length === 0 && (
                <div className="py-12 text-center text-slate-400">
                  <p className="font-extrabold text-xs">Sin pedidos en este estado.</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* PROMOTIONAL BANNERS MANAGEMENT TAB */}
        {currentTab === 'banners' && (
          <div className="flex flex-col gap-4 text-left animate-fade-in animate-duration-200">
            {/* Context Notice Explainer */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200 p-4 rounded-2xl shadow-xs text-left">
              <span className="text-[10px] font-black tracking-widest text-[#bf1c1c] uppercase block">📣 Avisos y Banners en el Cabezal</span>
              <p className="text-[11.5px] font-medium text-slate-700 mt-1 leading-relaxed">
                Los banners activos aparecen automáticamente como una tira informativa en la parte superior del catálogo de tus clientes. Es ideal para avisar sobre descuentos, demoras de envíos, promociones o retiros.
              </p>
            </div>

            {/* Banner Add/Edit Form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!bannerInText.trim()) {
                  setCustomAlert({
                    title: 'Formulario de Aviso',
                    message: 'Por favor ingresá un texto para el aviso publicitario.'
                  });
                  return;
                }
                const bId = editingBannerId || 'banner_' + Date.now();
                if (onSaveBanner) {
                  onSaveBanner({
                    id: bId,
                    text: bannerInText.trim(),
                    isActive: bannerInActive,
                    color: "bg-blue-400"
                  });
                  showToast(editingBannerId ? "Aviso modificado correctamente" : "Nuevo aviso publicado");
                }
                setBannerInText('');
                setBannerInActive(true);
                setEditingBannerId(null);
              }}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3.5"
            >
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                {editingBannerId ? "✍️ Editar Aviso Publicitario" : "➕ Crear Nuevo Aviso Publicitario"}
              </h3>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Texto del Aviso / Promoción</label>
                <textarea 
                  value={bannerInText}
                  onChange={(e) => setBannerInText(e.target.value)}
                  placeholder="Ej: 🏪 ¡Hacé tu pedido online y retirá por nuestro local!"
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs font-semibold focus:outline-none resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase">Estado:</span>
                  <button 
                    type="button"
                    onClick={() => setBannerInActive(!bannerInActive)}
                    className={`w-11 h-5.5 rounded-full p-0.5 transition-colors relative cursor-pointer ${bannerInActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`w-4.5 h-4.5 bg-white rounded-full block shadow transform transition-transform duration-200 ${bannerInActive ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <span className={`text-xs font-bold leading-none ${bannerInActive ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {bannerInActive ? '🟢 Activo' : '🔴 Pausado'}
                  </span>
                </div>

                <div className="flex gap-2">
                  {editingBannerId && (
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingBannerId(null);
                        setBannerInText('');
                        setBannerInActive(true);
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                  <button 
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm flex items-center gap-1 cursor-pointer"
                  >
                    {editingBannerId ? "Guardar" : "Publicar"}
                  </button>
                </div>
              </div>
            </form>

            {/* List of current Banners */}
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Historial de Avisos y Banners</h3>
              
              <div className="space-y-2">
                {banners.map((b) => (
                  <div key={b.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0 pr-1">
                      <p className="text-xs font-bold text-slate-800 leading-relaxed break-words">{b.text}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                          b.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-100'
                        }`}>
                          {b.isActive ? 'Visible' : 'Oculto'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Toggle status quickly */}
                      <button 
                        type="button"
                        onClick={() => {
                          if (onSaveBanner) {
                            onSaveBanner({ ...b, isActive: !b.isActive });
                            showToast(b.isActive ? "Aviso desactivado" : "Aviso activado");
                          }
                        }}
                        className={`p-2 rounded-xl border border-slate-200 transition-colors ${
                          b.isActive ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600' : 'bg-slate-50 hover:bg-slate-100 text-slate-500'
                        }`}
                        title={b.isActive ? "Ocultar de la tienda" : "Mostrar en la tienda"}
                      >
                        <Check size={14} className="stroke-[3px]" />
                      </button>

                      <button 
                        type="button"
                        onClick={() => {
                          setEditingBannerId(b.id);
                          setBannerInText(b.text);
                          setBannerInActive(b.isActive);
                        }}
                        className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2 rounded-xl transition-colors border border-slate-200"
                        title="Editar Texto"
                      >
                        <Edit size={14} className="stroke-[2.5px]" />
                      </button>

                      <button 
                        type="button"
                        onClick={() => {
                          setCustomConfirm({
                            title: 'Eliminar Aviso',
                            message: '¿Estás seguro de que querés eliminar permanentemente este aviso?',
                            onConfirm: () => {
                              if (onDeleteBanner) {
                                onDeleteBanner(b.id);
                                showToast("Aviso eliminado");
                              }
                            }
                          });
                        }}
                        className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl transition-colors border border-red-200"
                        title="Eliminar"
                      >
                        <Trash2 size={14} className="stroke-[2.5px]" />
                      </button>
                    </div>
                  </div>
                ))}

                {banners.length === 0 && (
                  <div className="bg-white border border-slate-100 rounded-2xl py-12 text-center text-slate-400">
                    <p className="text-xs font-bold">No tenés ningún aviso publicitario creado.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PRODUCTS DIRECTORY TAB */}
        {currentTab === 'productos' && (
          <div className="flex flex-col gap-3">
            
            {/* SUBTAB SELECTOR */}
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200 mt-0.5" id="subtab-selector">
              <button 
                type="button"
                onClick={() => setProductViewSubTab('carga_rapida')}
                className={`flex-1 py-2 text-center text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  productViewSubTab === 'carga_rapida'
                    ? 'bg-white shadow-xs text-slate-900 border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ⚡ Carga Rápida x Solapa (Plantillas)
              </button>
              <button 
                type="button"
                onClick={() => setProductViewSubTab('gondola')}
                className={`flex-1 py-2 text-center text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  productViewSubTab === 'gondola'
                    ? 'bg-white shadow-xs text-slate-900 border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📋 Góndola Activa ({products.length} productos)
              </button>
            </div>

            {/* IF CARGA RAPIDA (TEMPLATE LOADERS BY TAB) */}
            {productViewSubTab === 'carga_rapida' && (
              <div className="flex flex-col gap-3">
                
                {/* SOLAPAS / SUBTABS FOR CARGA RAPIDA */}
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block -mb-1 pl-1">Seleccionar Solapa de Productos para Cargar:</span>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {TEMPLATE_TABS.map(tab => {
                    // Count missing templates in this category
                    const catTemplates = TEMPLATE_PRODUCTS.filter(t => {
                      if (tab.catKeys) {
                        return tab.catKeys.includes(t.cat);
                      }
                      return t.cat === tab.catKey;
                    });
                    const missingCount = catTemplates.filter(t => !products.some(p => p.name.toLowerCase() === t.name.toLowerCase())).length;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTemplateTab(tab.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border cursor-pointer ${
                          activeTemplateTab === tab.id
                            ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>{tab.name}</span>
                        {missingCount > 0 ? (
                          <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-black ${
                            activeTemplateTab === tab.id ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600 border border-blue-100'
                          }`}>
                            {missingCount} nuevos
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-500 font-extrabold">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* ACTIVE TAB RENDERER */}
                {(() => {
                  const activeTabInfo = TEMPLATE_TABS.find(t => t.id === activeTemplateTab);
                  if (!activeTabInfo) return null;

                  const activeTemplates = TEMPLATE_PRODUCTS.filter(t => {
                    if (activeTabInfo.catKeys) {
                      return activeTabInfo.catKeys.includes(t.cat);
                    }
                    return t.cat === activeTabInfo.catKey;
                  });

                  const addedTemplates = activeTemplates.filter(t => products.some(p => p.name.toLowerCase() === t.name.toLowerCase()));
                  const missingTemplates = activeTemplates.filter(t => !products.some(p => p.name.toLowerCase() === t.name.toLowerCase()));

                  return (
                    <div className="flex flex-col gap-3 animate-fade-in" id="carga-rapida-container">
                      
                      {/* BULK ACTION CARD */}
                      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3.5 shadow-md border border-slate-800 text-left">
                        <div className="flex-1">
                          <span className="text-[10px] uppercase font-black tracking-widest text-blue-400">⚡ Acceso Veloz a Góndola</span>
                          <h3 className="text-sm font-black mt-0.5 text-white flex items-center gap-1.5">
                            Cargar {activeTabInfo.name}
                            <span className="text-xs font-semibold text-slate-400">
                              ({addedTemplates.length} de {activeTemplates.length} activos)
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-300 font-semibold leading-relaxed mt-1 max-w-lg">
                            Podés cambiar de forma manual los precios de venta sugeridos en los campos de abajo y luego clickear para subir productos o agregar toda la tanda:
                          </p>
                        </div>

                        <div className="shrink-0 w-full md:w-auto">
                          {missingTemplates.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                let addedCount = 0;
                                missingTemplates.forEach(t => {
                                  const finalPrice = templatePrices[t.name] !== undefined ? templatePrices[t.name] : t.price;
                                  onAddProduct({
                                    cat: t.cat,
                                    name: t.name,
                                    brand: t.brand,
                                    price: finalPrice,
                                    desc: t.desc,
                                    image: t.image,
                                    inStock: true,
                                    featured: false,
                                    neww: false,
                                    orig: null
                                  });
                                  addedCount++;
                                });
                                showToast(`¡Se agregaron ${addedCount} productos de ${activeTabInfo.name}! 🚀`);
                              }}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11.5px] font-black px-4 py-2.5 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            >
                              🚀 CARGAR TODAS ({missingTemplates.length}) EN 1-CLIC
                            </button>
                          ) : (
                            <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-black px-4 py-2.5 rounded-xl text-center self-stretch md:self-auto">
                              ✨ ¡Toda esta solapa ya está cargada!
                            </div>
                          )}
                        </div>
                      </div>

                      {/* TEMPLATES GRID */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {activeTemplates.map(t => {
                          const exists = products.some(p => p.name.toLowerCase() === t.name.toLowerCase());
                          const currentPrice = templatePrices[t.name] !== undefined ? templatePrices[t.name] : t.price;

                          return (
                            <div 
                              key={t.name}
                              className={`bg-white border rounded-2xl p-3 flex items-center gap-3 transition-all relative overflow-hidden text-left ${
                                exists 
                                  ? 'border-slate-100 bg-slate-50/50 opacity-70' 
                                  : 'border-slate-200 shadow-2xs hover:shadow-xs hover:border-slate-300'
                              }`}
                            >
                              {/* Image preview */}
                              <div className="w-12 h-12 rounded-xl border border-slate-100 shrink-0 bg-slate-50 overflow-hidden relative">
                                <img 
                                  src={t.image} 
                                  alt={t.name} 
                                  className="w-full h-full object-cover" 
                                  referrerPolicy="no-referrer"
                                />
                                {exists && (
                                  <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center text-white text-xs font-black">
                                    ✓
                                  </div>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <h4 className="text-[12.5px] font-bold text-slate-800 truncate leading-tight">{t.name}</h4>
                                <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">{t.brand} · {CAT_ABBR[t.cat] || t.cat}</p>
                                
                                {/* Price Field */}
                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-500 leading-none">Precio sugerido:</span>
                                  <div className="relative">
                                    <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-slate-400 font-bold">$</span>
                                    <input
                                      type="number"
                                      disabled={exists}
                                      value={currentPrice}
                                      onChange={(e) => {
                                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                                        setTemplatePrices(prev => ({ ...prev, [t.name]: val }));
                                      }}
                                      className="bg-slate-50 disabled:bg-slate-100 text-slate-800 text-xs font-black rounded-lg pl-5 pr-1.5 py-0.5 border border-slate-200 outline-none w-20 text-left focus:border-blue-500 focus:bg-white"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Add button / status action */}
                              <div className="shrink-0 pl-1">
                                {exists ? (
                                  <span className="text-[9.5px] bg-slate-100 text-slate-500 font-black uppercase px-2 py-1 rounded-lg border border-slate-200 select-none inline-block">
                                    ✓ En Góndola
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAddProduct({
                                        cat: t.cat,
                                        name: t.name,
                                        brand: t.brand,
                                        price: currentPrice,
                                        desc: t.desc,
                                        image: t.image,
                                        inStock: true,
                                        featured: false,
                                        neww: false,
                                        orig: null
                                      });
                                      showToast(`¡"${t.name}" cargado! ✅`);
                                    }}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10.5px] font-black px-2.5 py-1.5 rounded-lg transition-all shadow-xs flex items-center justify-center gap-0.5 cursor-pointer active:scale-95 animate-pulse"
                                  >
                                    ➕ Cargar
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  );
                })()}

              </div>
            )}

            {/* IF GONDOLA ACTIVA (STANDARD DETAILED MANAGING VIEW) */}
            {productViewSubTab === 'gondola' && (
              <div className="flex flex-col gap-3">
                
                {/* Search and operational actions */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <Search size={14} />
                    </span>
                    <input 
                      type="text"
                      placeholder="Filtrar por nombre o marca..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>

                  <button 
                    onClick={triggerCsvExport}
                    title="Exportar CSV de Productos"
                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 hover:text-blue-800 py-2 px-3 rounded-xl flex items-center gap-1.5 shadow-sm text-[11px] font-extrabold select-none shrink-0"
                  >
                    <Download size={13} />
                    <span>Exportar</span>
                  </button>

                  <button 
                    onClick={() => {
                      setCsvParsedList([]);
                      setCsvErrorsList([]);
                      setShowingCsvImport(true);
                    }}
                    title="Importar CSV de Productos"
                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 hover:text-blue-800 py-2 px-3 rounded-xl flex items-center gap-1.5 shadow-sm text-[11px] font-extrabold select-none shrink-0"
                  >
                    <Upload size={13} />
                    <span>Importar</span>
                  </button>

                  <button 
                    onClick={handleBulkGenerateImages}
                    disabled={isBulkGeneratingImages}
                    title="Completar todas las imágenes faltantes con IA"
                    className={`py-2 px-3 rounded-xl flex items-center gap-1.5 shadow-sm relative transition-all text-[11px] font-extrabold select-none shrink-0 ${
                      isBulkGeneratingImages 
                        ? 'bg-rose-50 text-rose-500 cursor-wait border border-rose-200' 
                        : 'bg-rose-100 hover:bg-rose-200 text-rose-700 hover:text-rose-800'
                    }`}
                  >
                    {isBulkGeneratingImages ? (
                      <span className="w-3 h-3 border-2 border-rose-400 border-t-rose-600 rounded-full animate-spin inline-block"></span>
                    ) : (
                      <Sparkles size={13} className="text-blue-600 fill-blue-200 shrink-0" />
                    )}
                    <span>Completar IA</span>
                  </button>

                  <button 
                    onClick={() => {
                      resetFormState();
                      setShowingAddForm(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shrink-0"
                  >
                    <Plus size={15} strokeWidth={3} />
                    Agregar Producto
                  </button>
                </div>

                {/* Category selection bar */}
                <div 
                  ref={adminCatScrollRef}
                  onMouseDown={handleAdminCatMouseDown}
                  onMouseLeave={handleAdminCatMouseLeaveOrUp}
                  onMouseUp={handleAdminCatMouseLeaveOrUp}
                  onMouseMove={handleAdminCatMouseMove}
                  className="flex gap-1.5 overflow-x-auto select-none no-scrollbar py-1 cursor-grab active:cursor-grabbing"
                >
                  <button 
                    onClick={(e) => {
                      if (isAdminDraggingCat.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      setProductCatFilter('all');
                    }}
                    className={`px-3 py-1 rounded-full text-[10.5px] font-bold whitespace-nowrap transition-all ${
                      productCatFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'
                    }`}
                  >
                    Categoría: Todas
                  </button>
                  {CATS.map(c => (
                    <button 
                      key={c.id}
                      onClick={(e) => {
                        if (isAdminDraggingCat.current) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        setProductCatFilter(c.id);
                      }}
                      className={`px-3 py-1 rounded-full text-[10.5px] font-bold whitespace-nowrap transition-all ${
                        productCatFilter === c.id ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                {/* INFLATION BULK PRICE ADJUSTMENT PANEL */}
                <div className="bg-blue-50 border border-blue-200/90 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in text-left">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black tracking-widest text-blue-800 uppercase block">🚀 Ajuste de Precios Masivo (Inflación)</span>
                    <p className="text-[11.5px] font-medium text-slate-700">
                      Aumentar o disminuir precios de la categoría <span className="font-extrabold text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded">
                        {productCatFilter === 'all' ? 'Todas' : `${CATS.find(c => c.id === productCatFilter)?.name || 'Todas'}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input 
                      type="number"
                      placeholder="Ej: 15"
                      value={bulkPct}
                      onChange={(e) => setBulkPct(e.target.value)}
                      className="w-20 px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-xs font-black text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                    <button 
                      type="button"
                      onClick={() => {
                        const val = parseFloat(bulkPct);
                        if (isNaN(val) || val === 0) {
                          setCustomAlert({
                            title: 'Porcentaje Inválido',
                            message: 'Por favor ingresá un porcentaje válido de actualización (distinto de cero).'
                          });
                          return;
                        }
                        const targetCategoryName = productCatFilter === 'all' ? 'Todas las Categorías' : (CATS.find(c => c.id === productCatFilter)?.name || 'esta categoría');
                        const verb = val > 0 ? 'aumentar' : 'disminuir';
                        setCustomConfirm({
                          title: 'Actualizar Precios Masivamente',
                          message: `¿Estás seguro de que querés ${verb} el ${Math.abs(val)}% del precio a todos los productos de "${targetCategoryName}"?`,
                          onConfirm: () => {
                            const toUpdate = products.filter(p => productCatFilter === 'all' || p.cat === productCatFilter);
                            toUpdate.forEach(p => {
                              const newPrice = Math.round(p.price * (1 + val / 100));
                              onUpdateProduct({ ...p, price: newPrice });
                            });
                            showToast(`Actualizados ${toUpdate.length} productos de ${targetCategoryName}`);
                            setBulkPct('');
                          }
                        });
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-black shadow-sm select-none cursor-pointer"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>

                {/* HIGHLY VISIBLE CONTROL / STOCK GUIDelines FOR MERCHANT */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-100 p-3.5 rounded-2xl shadow-xs text-left animate-fade-in flex flex-col gap-1.5">
                  <span className="text-[10.5px] uppercase font-black tracking-wider text-blue-600 flex items-center gap-1">
                    ⚙️ CONTROL DE GÓNDOLA Y CARGA DE STOCK (DISPONIBILIDAD)
                  </span>
                  <p className="text-[11.5px] font-medium text-slate-700 leading-normal">
                    Desde aquí podés agregar ítems nuevos, darlos de baja o pausar su stock al instante:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px] font-bold text-slate-600 mt-0.5">
                    <div className="bg-white/80 p-2 rounded-xl border border-slate-100 flex items-start gap-1.5">
                      <span className="text-emerald-500">🟢</span>
                      <span><b>Habilitar Stock:</b> Deslizá hacia la derecha (Verde) para agregar el producto a la góndola activa.</span>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl border border-slate-100 flex items-start gap-1.5">
                      <span className="text-red-500">🔴</span>
                      <span><b>Pausar Stock:</b> Deslizá hacia la izquierda (Gris) para ocultar temporalmente sin borrar el producto.</span>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl border border-slate-100 flex items-start gap-1.5">
                      <span className="text-blue-500">➕</span>
                      <span><b>Agregar Producto:</b> Hacé clic en el botón azul arriba a la derecha <b>"+ Agregar Producto"</b> para cargar un producto.</span>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl border border-slate-100 flex items-start gap-1.5">
                      <span className="text-blue-600">🗑️</span>
                      <span><b>Sacar/Eliminar:</b> Hacé clic en el tacho rojo al lado del producto para sacarlo definitivamente de la base de datos.</span>
                    </div>
                  </div>
                </div>

                {isBulkGeneratingImages && bulkGenProgress && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3.5 rounded-xl shadow-sm flex flex-col gap-2 animate-pulse">
                    <div className="flex justify-between items-center text-xs font-black">
                      <span className="flex items-center gap-1">
                        <Sparkles size={14} className="text-blue-500 fill-blue-500" />
                        Generando imágenes con IA en segundo plano...
                      </span>
                      <span>{bulkGenProgress.current} / {bulkGenProgress.total}</span>
                    </div>
                    <div className="w-full bg-blue-200/50 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-blue-600 h-full transition-all duration-300"
                        style={{ width: `${(bulkGenProgress.current / bulkGenProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* List products and edit stock controls */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                  {getFilteredProducts.map(p => (
                    <div key={p.id} className="p-3 flex items-center gap-3">
                      
                      {/* Category thumbnail or actual product image */}
                      <div 
                        style={{ backgroundColor: CAT_BG[p.cat] || '#f1f5f9' }}
                        className="w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 font-bold overflow-hidden relative shadow-inner border border-slate-100"
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
                            <span className="text-base opacity-40">{(p.name || '?')[0].toUpperCase()}</span>
                            <span className="text-[6.5px] tracking-wider text-slate-500 uppercase leading-none">{CAT_ABBR[p.cat] || 'PRD'}</span>
                          </>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pr-1">
                        <h4 className="text-[13px] font-bold text-slate-800 truncate leading-tight">{p.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">
                          {p.brand} · <span className="uppercase text-[9px] bg-slate-100 px-1 py-0.5 rounded text-slate-500">{p.cat}</span>
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <span className="text-xs font-black text-slate-900">{fmt(p.price)}</span>
                          {p.codigoFacturador && p.codigoFacturador.trim() ? (
                            <span className="text-[7.5px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-200/60 px-1 py-0.5 rounded tracking-wide font-mono" title={`Sincronizado: ${p.codigoFacturador}`}>
                              🔗 {p.codigoFacturador}
                            </span>
                          ) : (
                            <span className="text-[7.5px] font-black uppercase bg-blue-50/70 text-blue-700 border border-blue-200 px-1 py-0.5 rounded tracking-wide font-mono" title="No vinculado a un SKU de facturación">
                              ⚠️ SIN SKU
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stock toggle and editing widgets */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">Stock</span>
                          
                          {/* Larger interactive switch with labels */}
                          <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200/60 p-1 rounded-xl">
                            <button 
                              type="button"
                              onClick={() => quickToggleStock(p)}
                              className={`w-12 h-6 rounded-full p-0.5 transition-colors relative cursor-pointer ${p.inStock ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            >
                              <span className={`w-4 h-4 bg-white rounded-full block shadow transform transition-transform duration-200 ${p.inStock ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                            <span className={`text-[10.5px] font-black tracking-tight select-none pr-1 ${p.inStock ? 'text-emerald-600' : 'text-blue-600'}`}>
                              {p.inStock ? '✅ SÍ' : '❌ NO'}
                            </span>
                          </div>
                        </div>

                        <button 
                          onClick={() => populateEditForm(p)}
                          className="text-slate-500 hover:text-blue-600 p-2.5 hover:bg-slate-50 rounded-xl transition-colors border border-slate-200"
                          title="Editar Producto (Nombre, Marca, Precio, Foto, etc.)"
                        >
                          <Edit size={14} className="stroke-[2.5px]" />
                        </button>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductToDelete(p);
                          }}
                          className="text-red-600 hover:text-red-800 p-2.5 hover:bg-red-50 rounded-xl transition-colors border border-red-200 cursor-pointer"
                          title="Eliminar producto definitivamente"
                        >
                          <Trash2 size={14} className="stroke-[2.5px]" />
                        </button>
                      </div>

                    </div>
                  ))}

                  {productsStatus === 'loading' && getFilteredProducts.length === 0 && Array.from({ length: 6 }).map((_, idx) => (
                    <div key={`admin-skeleton-${idx}`} className="flex items-center gap-4 p-4 border border-slate-100 rounded-2xl animate-pulse">
                      <div className="w-14 h-14 bg-slate-100 rounded-xl shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-4 bg-slate-100 rounded w-2/3" />
                        <div className="h-3 bg-slate-100 rounded w-1/3" />
                      </div>
                    </div>
                  ))}

                  {productsStatus === 'loadingMore' && (
                    <div className="p-4 text-center text-xs text-slate-400 animate-pulse font-bold">
                      Cargando más productos...
                    </div>
                  )}

                  {hasMore && productsStatus !== 'loadingMore' && productsStatus !== 'loading' && (
                    <div className="p-4 flex justify-center">
                      <button 
                        type="button"
                        onClick={loadMoreProducts}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-xl transition-colors active:scale-95 cursor-pointer border border-slate-200"
                      >
                        Ver más productos
                      </button>
                    </div>
                  )}

                  {getFilteredProducts.length === 0 && productsStatus !== 'loading' && (
                    <div className="py-12 text-center text-slate-400">
                      <p className="font-extrabold text-xs">No se encontraron productos registrados.</p>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        )}

        {/* REPORTS AND ACCOUNTABILITY TAB */}
        {currentTab === 'reportes' && (
          <div className="flex flex-col gap-4">
            
            {/* Facturacion aggregates summaries */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md">
              <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Arqueo total facturado</span>
              <h3 className="text-2xl font-black mt-1 leading-none text-emerald-400">
                {fmt(reports.revenueSum)}
              </h3>
              
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">Ventas Procesadas</span>
                  <span className="text-base font-extrabold block mt-1.5">{reports.orderValue} pedidos</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">Ticket Promedio</span>
                  <span className="text-base font-extrabold block mt-1.5">{fmt(reports.avgTicket)}</span>
                </div>
              </div>
            </div>

            {/* Cancelled metrics indicator */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex justify-between items-center">
              <div>
                <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Pedidos Cancelados / Omitidos</h4>
                <p className="text-[10.5px] text-slate-400 mt-1 font-semibold leading-relaxed">Pedidos descartados o sin stock coordinado</p>
              </div>
              <span className="text-lg font-black text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
                {reports.canceledCount}
              </span>
            </div>

            {/* Top products ranking list */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
              <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3 pb-2 border-b border-slate-100">
                Los 5 productos más vendidos del local
              </h4>
              
              <div className="flex flex-col gap-3">
                {reports.favoritesSold.map(([name, count], index) => {
                  const maxQtySold = reports.favoritesSold[0] ? reports.favoritesSold[0][1] : 1;
                  const ratio = Math.round((count / maxQtySold) * 100);
                  return (
                    <div key={index}>
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                        <span>{name}</span>
                        <span className="text-slate-500">{count} unidades</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div style={{ width: `${ratio}%` }} className="bg-blue-600 h-full rounded-full transition-all" />
                      </div>
                    </div>
                  );
                })}

                {reports.favoritesSold.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Aún no hay transacciones completas registradas hoy.</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* CUSTOMERS / CLIENTES TAB */}
        {currentTab === 'clientes' && (() => {
          // Define customer record helper type
          interface ClientRecord {
            name: string;
            phone: string;
            ordersCount: number;
            totalSpent: number;
            lastOrderDate: string;
            locations: string[];
          }

          // Aggregate client list from historical orders
          const clientMap: { [phone: string]: ClientRecord } = {};
          
          orders.forEach(o => {
            const phone = (o.customerPhone || '').trim();
            // Group primarily by phone number to combine records safely
            if (!phone) return;
            
            const existing = clientMap[phone];
            const timestamp = o.timestamp || new Date().toISOString();
            
            const locationsList = existing ? [...existing.locations] : [];
            if (o.customerLocation && !locationsList.includes(o.customerLocation.trim())) {
              locationsList.push(o.customerLocation.trim());
            }

            if (existing) {
              existing.ordersCount += 1;
              existing.totalSpent += o.total;
              if (new Date(timestamp) > new Date(existing.lastOrderDate)) {
                existing.lastOrderDate = timestamp;
              }
              existing.locations = locationsList;
            } else {
              clientMap[phone] = {
                name: o.customerName || 'Consumidor Final',
                phone: phone,
                ordersCount: 1,
                totalSpent: o.total,
                lastOrderDate: timestamp,
                locations: locationsList
              };
            }
          });

          const uniqueClients = Object.values(clientMap).sort((a, b) => b.totalSpent - a.totalSpent);

          return (
            <div className="flex flex-col gap-4 animate-fade-in" id="admin-clients-tab">
              <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Total de Clientes</span>
                  <h3 className="text-2xl font-black mt-1 leading-none text-emerald-400">
                    {uniqueClients.length} Registrados
                  </h3>
                </div>
                <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-black block">Tráfico Total</span>
                  <span className="text-sm font-extrabold">{orders.length} pedidos</span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>Listado de Clientes y Direcciones</span>
                  <span className="text-[9.5px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black uppercase">Ordenado por Compra</span>
                </h4>

                <div className="flex flex-col gap-4 divide-y divide-slate-100">
                  {uniqueClients.map((client, idx) => (
                    <div key={idx} className={`pt-3.5 ${idx === 0 ? 'pt-0' : ''} space-y-2`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5 leading-none">
                            👤 {client.name}
                            <span className="text-[9.5px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                              #{idx + 1} comprador
                            </span>
                          </h4>
                          <p className="text-xs font-semibold text-slate-500 mt-1 flex items-center gap-1">
                            📱 Celular: 
                            <a href={`https://wa.me/${client.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-mono">
                              {client.phone}
                            </a>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-900 block leading-none">{fmt(client.totalSpent)}</span>
                          <span className="text-[10px] text-slate-400 font-bold block mt-1 leading-none">{client.ordersCount} pedidos</span>
                        </div>
                      </div>

                      {/* Client locations registered list */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block pb-0.5">Dirección / Direcciones Registradas:</span>
                        {client.locations.length === 0 ? (
                          <p className="text-[10.5px] text-slate-400 italic font-semibold pl-1.5">Solo retiros en local o sin indicar dirección.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {client.locations.map((loc, lIdx) => (
                              <div key={lIdx} className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-wrap break-words flex flex-col gap-1.5 items-start justify-between relative group text-left">
                                <span className="font-sans font-semibold text-[11px] block text-slate-800 leading-normal">
                                  {loc}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(loc);
                                    showToast('¡Dirección copiada!');
                                  }}
                                  className="text-[9.5px] font-extrabold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded transition-all active:scale-95 shadow-2xs cursor-pointer flex items-center gap-0.5"
                                >
                                  📋 Copiar Dirección
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-400 font-bold flex justify-between items-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100">
                        <span>Último pedido registrado:</span>
                        <span className="text-slate-600 font-mono font-semibold">
                          {new Date(client.lastOrderDate).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })} hs
                        </span>
                      </div>
                    </div>
                  ))}

                  {uniqueClients.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-8">Aún no se registran clientes con celulares en pedidos.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}



        {/* ENVIOS TAB */}
        {currentTab === 'envios' && (
          <div className="space-y-5 animate-fade-in text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  🛵 Zonas de Entrega & Envío
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 leading-normal font-sans">
                  Precio Base: $4.000 + $100 por cada 100 metros
                </p>
              </div>
            </div>

            {/* DELIVERY CUTOFF CONFIGURATION CARD */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm flex flex-col gap-3">
              <div>
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  ⏰ Hora de Corte para Envíos en el Día
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  Los pedidos que ingresen por envío superando esta hora se programarán automáticamente para el día siguiente.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 shrink-0">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={deliveryCutoffHour !== undefined ? deliveryCutoffHour : 21}
                    onChange={async (e) => {
                      const h = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
                      if (onUpdateDeliveryCutoffHour) {
                        try {
                          await onUpdateDeliveryCutoffHour(h);
                          showToast(`¡Hora de corte actualizada a las ${h}:00 hs! ⏰`);
                        } catch (err) {
                          showToast('Error al guardar la hora de corte');
                        }
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-center focus:outline-none focus:border-blue-500 font-sans"
                  />
                </div>
                <div className="text-[11px] text-slate-600 font-bold">
                  hs (Formato 24h). Actualmente configurado a las: <span className="text-blue-600 font-black">{deliveryCutoffHour !== undefined ? deliveryCutoffHour : 21}:00 hs</span>.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* ZONE FORM (ADD/EDIT CARD) */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm flex flex-col gap-4">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    {editingZone ? '✏️ Editar Zona' : '➕ Nueva Zona de Envío'}
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                    Definí el nombre de la zona y la distancia en metros: el precio se calcula solo, cada 100 metros. 
                  </p>
                </div>

                <form onSubmit={handleSaveZone} className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="zone-name" className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                      Nombre de la Zona / Barrio
                    </label>
                    <input
                      id="zone-name"
                      type="text"
                      required
                      value={zoneNameInput}
                      onChange={(e) => setZoneNameInput(e.target.value)}
                      placeholder="Ej: Rio Pipo, Andorra, etc."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-xs font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="zone-km" className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        Distancia (metros)
                      </label>
                      <input
                        id="zone-km"
                        type="number"
                        step="50"
                        min="0"
                        required
                        value={zoneKmInput}
                        onChange={(e) => setZoneKmInput(e.target.value)}
                        placeholder="Ej: 1500"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-xs font-bold font-mono"
                      />
                    </div>

                    <div>
                      <label htmlFor="zone-price" className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        Precio Final ($)
                      </label>
                      <input
                        id="zone-price"
                        type="number"
                        required
                        value={zonePriceInput}
                        onChange={(e) => setZonePriceInput(e.target.value)}
                        placeholder="Ej: 7000"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-xs font-bold text-blue-600 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {editingZone && (
                      <button
                        type="button"
                        onClick={handleCancelEditZone}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-98 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingZone}
                      className={`py-2 px-3 text-white rounded-xl text-xs font-bold transition-all active:scale-98 cursor-pointer shadow-xs ${
                        editingZone ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
                      } ${editingZone ? 'col-span-1' : 'col-span-2'}`}
                    >
                      {savingZone ? 'Guardando...' : (editingZone ? '💾 Guardar Cambios' : '➕ Crear Zona')}
                    </button>
                  </div>
                </form>
              </div>

              {/* LIST OF ZONES */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm flex flex-col gap-4">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    Zonas Guardadas ({deliveryZones.length})
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                    Estas zonas se muestran al cliente en el carrito de compras para calcular su envío de forma exacta.
                  </p>
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 font-sans">
                  {deliveryZones.map((zone) => (
                    <div 
                      key={zone.id} 
                      className={`flex items-center justify-between p-3.5 border rounded-xl shadow-3xs transition-all ${
                        editingZone?.id === zone.id 
                          ? 'bg-blue-50/70 border-blue-300' 
                          : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-black text-slate-800 block">
                          {zone.name}
                        </span>
                        <span className="text-[9.5px] font-mono text-slate-500 font-bold uppercase block mt-0.5">
                          Distancia: {Math.round(zone.km * 1000).toLocaleString('es-AR')} m
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-extrabold text-blue-600 bg-white border border-slate-200 px-2 py-1 rounded-lg">
                          ${zone.price.toLocaleString('es-AR')}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartEditZone(zone)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg hover:text-blue-700 border border-slate-200 transition-all cursor-pointer"
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteZone(zone)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg hover:text-red-700 border border-slate-200 transition-all cursor-pointer"
                            title="Eliminar"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {deliveryZones.length === 0 && (
                    <div className="text-center py-8 text-slate-400 font-bold text-xs">
                      No hay zonas cargadas. Creá una usando el formulario.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ============ COMBOS DE AHORRO ============ */}
            <div className="pt-2">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                🎁 Combos de Ahorro
              </h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 leading-normal font-sans">
                Armá combos con precio especial: se muestran en la pestaña "Combos" de la tienda.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* COMBO FORM (ADD/EDIT CARD) */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm flex flex-col gap-4">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    {editingCombo ? '✏️ Editar Combo' : '➕ Nuevo Combo'}
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                    El ahorro se calcula solo: precio normal menos precio del combo.
                  </p>
                </div>

                <form onSubmit={handleSaveCombo} className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="combo-name" className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                      Nombre del Combo
                    </label>
                    <input
                      id="combo-name"
                      type="text"
                      required
                      value={comboNameInput}
                      onChange={(e) => setComboNameInput(e.target.value)}
                      placeholder="Ej: Combo Picada para 2"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label htmlFor="combo-items" className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                      ¿Qué incluye? (lo ve el cliente)
                    </label>
                    <textarea
                      id="combo-items"
                      required
                      rows={2}
                      value={comboItemsInput}
                      onChange={(e) => setComboItemsInput(e.target.value)}
                      placeholder="Ej: 1 Coca-Cola 2.25L + 2 Papas Lays + 1 Maní salado"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-xs font-semibold resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="combo-label" className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        Etiqueta corta
                      </label>
                      <input
                        id="combo-label"
                        type="text"
                        maxLength={8}
                        value={comboLabelInput}
                        onChange={(e) => setComboLabelInput(e.target.value)}
                        placeholder="PICADA"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-xs font-bold uppercase"
                      />
                    </div>
                    <div>
                      <label htmlFor="combo-price" className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        Precio Combo ($)
                      </label>
                      <input
                        id="combo-price"
                        type="number"
                        required
                        min="1"
                        value={comboPriceInput}
                        onChange={(e) => setComboPriceInput(e.target.value)}
                        placeholder="9500"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-xs font-bold text-blue-600 font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="combo-orig" className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        Precio Normal ($)
                      </label>
                      <input
                        id="combo-orig"
                        type="number"
                        required
                        min="1"
                        value={comboOrigInput}
                        onChange={(e) => setComboOrigInput(e.target.value)}
                        placeholder="12000"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-xs font-bold font-mono"
                      />
                    </div>
                  </div>

                  {(() => {
                    const cp = parseFloat(comboPriceInput);
                    const co = parseFloat(comboOrigInput);
                    if (!isNaN(cp) && !isNaN(co) && co > cp) {
                      return (
                        <p className="text-[10.5px] text-emerald-700 font-extrabold bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          El cliente ahorra ${(co - cp).toLocaleString('es-AR')} 🎉
                        </p>
                      );
                    }
                    return null;
                  })()}

                  <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex flex-col gap-2">
                    <label className="block text-[9.5px] font-black text-slate-500 uppercase tracking-wider leading-none">📷 Foto del combo (opcional)</label>
                    <input type="file" accept="image/*" disabled={isUploadingComboPhoto} onChange={handleComboPhotoSelected} className="text-[10.5px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300 cursor-pointer disabled:opacity-50 disabled:cursor-wait" />
                    {isUploadingComboPhoto && (<div className="flex items-center gap-2 text-[10.5px] text-blue-600 font-extrabold animate-pulse"><span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin inline-block"></span>Subiendo la foto...</div>)}
                    {comboImageInput && (<div className="mt-1 flex items-center gap-2.5 p-1 bg-emerald-50 border border-emerald-100 rounded-lg"><img src={comboImageInput} className="w-9 h-9 object-cover rounded shadow border shrink-0" alt="Foto del combo" referrerPolicy="no-referrer" /><span className="text-[10px] text-emerald-700 font-extrabold font-sans">✓ Foto cargada</span><button type="button" onClick={() => setComboImageInput('')} className="ml-auto text-[10px] text-red-500 font-bold hover:underline cursor-pointer">Quitar</button></div>)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {editingCombo && (
                      <button
                        type="button"
                        onClick={resetComboForm}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-98 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingCombo}
                      className={`py-2 px-3 text-white rounded-xl text-xs font-bold transition-all active:scale-98 cursor-pointer shadow-xs bg-blue-600 hover:bg-blue-700 ${editingCombo ? 'col-span-1' : 'col-span-2'}`}
                    >
                      {savingCombo ? 'Guardando...' : (editingCombo ? '💾 Guardar Cambios' : '➕ Crear Combo')}
                    </button>
                  </div>
                </form>
              </div>

              {/* LIST OF COMBOS */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm flex flex-col gap-4">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    Combos Cargados ({combos.length})
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                    Podés pausar un combo para ocultarlo sin borrarlo (⏸️/▶️).
                  </p>
                </div>

                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 font-sans">
                  {combos.map((combo) => (
                    <div
                      key={combo.id}
                      className={`flex items-center justify-between gap-2 p-3.5 border rounded-xl shadow-3xs transition-all ${
                        editingCombo?.id === combo.id
                          ? 'bg-blue-50/70 border-blue-300'
                          : combo.active === false
                            ? 'bg-slate-100/70 border-slate-200 opacity-70'
                            : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-black text-slate-800 block truncate">
                          {combo.active === false && '⏸️ '}{combo.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold block mt-0.5 truncate">
                          {combo.items}
                        </span>
                        <span className="text-[9.5px] font-mono text-emerald-700 font-bold block mt-0.5">
                          ${combo.price.toLocaleString('es-AR')} (antes ${combo.orig.toLocaleString('es-AR')} · ahorra ${combo.saving.toLocaleString('es-AR')})
                        </span>
                      </div>

                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleComboActive(combo)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-all cursor-pointer"
                          title={combo.active === false ? 'Activar' : 'Pausar (ocultar de la tienda)'}
                        >
                          {combo.active === false ? '▶️' : '⏸️'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditCombo(combo)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg hover:text-blue-700 border border-slate-200 transition-all cursor-pointer"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCombo(combo)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg hover:text-red-700 border border-slate-200 transition-all cursor-pointer"
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}

                  {combos.length === 0 && (
                    <div className="text-center py-8 text-slate-400 font-bold text-xs">
                      Todavía no hay combos. Creá el primero con el formulario. 🎁
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* STARPOS TAB */}
        {currentTab === 'starpos' && (
          <div className="space-y-4 animate-fade-in text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  🔌 Integración StarPOS Local
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 leading-normal font-sans">
                  Sincronización de catálogo, stock y ventas con el comercio físico
                </p>
              </div>
              <button 
                onClick={() => { loadStarposStatus(); loadStarposSales(); }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 uppercase tracking-wider transition-all"
              >
                🔄 Actualizar Estado
              </button>
            </div>

            {/* STATUS AND CONFIG CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* CONNECTION TELEMETRY */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm md:col-span-1 flex flex-col justify-between">
                <div>
                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Estado de Conexión
                  </span>
                  {starposStatus ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full animate-pulse ${
                          starposStatus.status === 'CONECTADO' 
                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' 
                            : starposStatus.status === 'ERROR_CONEXION' 
                              ? 'bg-blue-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' 
                              : 'bg-blue-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                        }`} />
                        <span className="text-xs font-black text-slate-800">
                          {starposStatus.status === 'CONECTADO' 
                            ? 'CONECTADO' 
                            : starposStatus.status === 'ERROR_CONEXION' 
                              ? 'CONEXIÓN CAÍDA' 
                              : 'M_DEMO_SIMULADO'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                        {starposStatus.message}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                      <span className="animate-spin text-sm">⌛</span> Consultando telemetría...
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 space-y-2 text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400 uppercase">Servicio local:</span>
                    <span className="font-mono text-slate-700 font-bold max-w-[150px] truncate">
                      {starposStatus?.config?.serviceUrl || "Desconectado"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400 uppercase">User ID:</span>
                    <span className="font-mono text-slate-700 font-bold">
                      {starposStatus?.config?.userId || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400 uppercase">Secret:</span>
                    <span className="font-mono text-slate-700 font-bold">
                      {starposStatus?.config?.secretMasked || "N/A"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleRunStarposDiagnostic}
                  disabled={runningDiagnostic}
                  className="w-full mt-4 py-2.5 px-3 bg-slate-900 hover:bg-black text-white text-[10.5px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {runningDiagnostic ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      Diagnosticando...
                    </>
                  ) : (
                    <>
                      <span>🔍 Diagnóstico Técnico</span>
                    </>
                  )}
                </button>
              </div>

              {/* INTEGRATION CONTROLS */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm md:col-span-2 flex flex-col gap-4">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    Panel de Operaciones StarPOS
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                    Ejecutá sincronizaciones forzadas para actualizar el stock e inventario de góndola de forma manual.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* SYNC CATALOG BUTTON */}
                  <button
                    onClick={handleSyncCatalogStarPOS}
                    disabled={syncingCatalog || syncingSales || syncingStockDirect}
                    className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col items-center justify-center text-center gap-2 transition-all active:scale-98 cursor-pointer group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform">
                      {syncingCatalog ? "⏳" : "📤"}
                    </span>
                    <div>
                      <span className="text-xs font-black text-slate-800 block">
                        Sincronizar Catálogo
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                        Taxes ➔ PriceList ➔ Products
                      </span>
                    </div>
                  </button>

                  {/* SYNC STOCK DIRECT BUTTON */}
                  <button
                    onClick={handleSyncStockDirectStarPOS}
                    disabled={syncingCatalog || syncingSales || syncingStockDirect}
                    className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col items-center justify-center text-center gap-2 transition-all active:scale-98 cursor-pointer group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform">
                      {syncingStockDirect ? "⏳" : "🔄"}
                    </span>
                    <div>
                      <span className="text-xs font-black text-slate-800 block">
                        Sincronizar Stock Directo
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                        CurrentStock ➔ App Stock
                      </span>
                    </div>
                  </button>

                  {/* SYNC SALES AND STOCK BUTTON */}
                  <button
                    onClick={handleSyncSalesStarPOS}
                    disabled={syncingCatalog || syncingSales || syncingStockDirect}
                    className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col items-center justify-center text-center gap-2 transition-all active:scale-98 cursor-pointer group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform">
                      {syncingSales ? "⏳" : "📥"}
                    </span>
                    <div>
                      <span className="text-xs font-black text-slate-800 block">
                        Importar Ventas & Stock
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                        Tickets ➔ Cierres ➔ Descontar Stock
                      </span>
                    </div>
                  </button>

                </div>

                {/* TERMINAL EMULATOR */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">
                    Monitor en tiempo real
                  </span>
                  <div className="font-mono text-[10px] text-emerald-400 bg-slate-950 p-4 rounded-xl h-36 overflow-y-auto leading-relaxed border border-slate-800 shadow-inner flex flex-col gap-1">
                    {starposLogs.length > 0 ? (
                      starposLogs.map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap">
                          {log}
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-600 italic">Esperando comandos de sincronización...</div>
                    )}
                  </div>
                </div>

                {/* DETAILED INFRASTRUCTURE DIAGNOSTIC OUTCOME CARD */}
                {diagnosticResult && (
                  <div className={`p-4 rounded-xl border text-xs font-sans space-y-2.5 leading-relaxed animate-fade-in ${
                    diagnosticResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-blue-50 border-blue-200 text-blue-950'
                  }`}>
                    <div className="flex items-center gap-1.5 font-extrabold uppercase tracking-widest text-[9.5px]">
                      {diagnosticResult.success ? '✅ DIAGNÓSTICO OPERATIVO' : '⚠️ ALERTA DE INFRAESTRUCTURA'} ({diagnosticResult.errorType || 'OK'})
                    </div>
                    <p className="font-bold text-xs text-slate-900 leading-normal">
                      {diagnosticResult.message}
                    </p>
                    {diagnosticResult.details && (
                      <div className="bg-slate-900 text-slate-300 p-2.5 rounded-lg font-mono text-[9.5px] border border-slate-800 whitespace-pre-wrap leading-normal shadow-inner">
                        {diagnosticResult.details}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-700 space-y-1.5">
                      <strong className="block text-slate-900 font-extrabold uppercase tracking-wider text-[9px] border-b border-slate-200/50 pb-1">
                        📋 Lista de verificación de Red (Puerto 8090, Firewall, Router):
                      </strong>
                      <div className="whitespace-pre-wrap leading-relaxed text-slate-800 font-medium">
                        {diagnosticResult.infrastructureAdvice}
                      </div>
                    </div>
                  </div>
                )}

              </div>

            </div>

            {/* LATEST IMPORTED SALES FROM STARPOS */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
              <div>
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                  Historial de Ventas Importadas ({starposSales.length})
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  Ventas registradas en el local físico importadas para regular el stock del Kiosco online de forma sincrónica.
                </p>
              </div>

              {loadingSales ? (
                <div className="text-center py-8 text-slate-400 font-bold text-xs">
                  Cargando comprobantes...
                </div>
              ) : starposSales.length > 0 ? (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {starposSales.map((sale: any) => (
                    <div 
                      key={sale.id}
                      className="border border-slate-100 rounded-xl bg-slate-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-800 font-mono">
                            🎫 {sale.ticket_number}
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-black uppercase">
                            Sincronizado
                          </span>
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-bold">
                          Fecha: {new Date(sale.timestamp).toLocaleString('es-AR')} | Importado el: {new Date(sale.importedAt).toLocaleString('es-AR')}
                        </div>
                        <div className="pt-2 flex flex-col gap-1">
                          {sale.ticket_lines?.map((line: any, idx: number) => (
                            <div key={idx} className="font-mono text-[10.5px] text-slate-600 bg-white px-2 py-1 border border-slate-100 rounded-md inline-flex items-center gap-1.5 w-fit">
                              📦 <span className="font-extrabold">{line.product_name}</span> x{line.qty} | ${line.price?.toLocaleString('es-AR')}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Total Ticket</span>
                        <span className="text-sm font-mono font-black text-blue-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-3xs">
                          ${sale.total?.toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs">
                  Aún no se han importado comprobantes desde StarPOS.
                </div>
              )}
            </div>

          </div>
        )}

        {currentTab === 'admins' && isSuperAdmin && (
          <div className="flex flex-col gap-5">
            {/* Header Card */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                🛡️ Gestión de Administradores
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Administrá los accesos a la plataforma. Podés invitar nuevos administradores por su correo electrónico o dar de baja accesos existentes.
              </p>
            </div>

            {/* Action Alert Message */}
            {adminsActionMessage && (
              <div className={`p-4 rounded-xl border flex items-start gap-2.5 text-xs font-medium animate-fade-in ${
                adminsActionError 
                  ? 'bg-rose-50 border-rose-200 text-rose-800' 
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
                <span className="text-sm">{adminsActionError ? '⚠️' : '✅'}</span>
                <p className="flex-1 leading-normal">{adminsActionMessage}</p>
                <button 
                  onClick={() => setAdminsActionMessage('')} 
                  className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-sm leading-none"
                >
                  ×
                </button>
              </div>
            )}

            {/* Grid: Invite Form & Pending Invites */}
            <div className="grid grid-cols-1 gap-5">
              
              {/* Form Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    Invitar Nuevo Administrador
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                    El usuario primero debe haber iniciado sesión al menos una vez en la aplicación. Ingresá su email e invitalo; se le otorgará el rol de forma automática en su próximo inicio de sesión.
                  </p>
                </div>

                <form onSubmit={handleCreateInvite} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                      Correo Electrónico
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                        <Mail size={14} />
                      </span>
                      <input 
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="usuario@gmail.com"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 focus:bg-white transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                      Rol Asignado
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setInviteRole('admin')}
                        className={`py-2 px-3 border rounded-xl text-xs font-extrabold transition-all text-center flex flex-col items-center gap-0.5 ${
                          inviteRole === 'admin'
                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-3xs'
                            : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                        }`}
                      >
                        <span>Admin Estándar</span>
                        <span className="text-[9px] font-normal text-slate-400">Gestiona catálogo y pedidos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setInviteRole('super')}
                        className={`py-2 px-3 border rounded-xl text-xs font-extrabold transition-all text-center flex flex-col items-center gap-0.5 ${
                          inviteRole === 'super'
                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-3xs'
                            : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                        }`}
                      >
                        <span>Superadmin</span>
                        <span className="text-[9px] font-normal text-slate-400">Control total y administradores</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 active:scale-98 touch-manipulation"
                  >
                    <Plus size={14} /> Enviar Invitación / Registrar
                  </button>
                </form>
              </div>

              {/* Active Admins List */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    Administradores Activos ({adminsList.length + BOOTSTRAP_ADMIN_EMAILS.filter(e => !adminsList.some(a => a.email?.toLowerCase() === e.toLowerCase())).length})
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                    Listado de usuarios con credenciales activas en la tienda.
                  </p>
                </div>

                <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                  {/* Render Bootstrapped Admins that are NOT yet in firestore List to avoid duplicate view */}
                  {BOOTSTRAP_ADMIN_EMAILS.map((email) => {
                    const emailLower = email.toLowerCase();
                    const alreadyInList = adminsList.some(a => a.email?.toLowerCase() === emailLower);
                    if (alreadyInList) return null;

                    const isMe = currentUser?.email?.toLowerCase() === emailLower;

                    return (
                      <div 
                        key={`bootstrap-${email}`}
                        className="border border-slate-150 rounded-xl bg-slate-50/50 p-3.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-700">{email}</span>
                            {isMe && (
                              <span className="text-[9px] bg-slate-200 text-slate-700 font-extrabold px-1.5 py-0.5 rounded uppercase">
                                Vos
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] bg-blue-100 text-blue-700 font-extrabold px-1.5 py-0.5 rounded-md uppercase">
                              Superadmin (Fijo)
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Código de sistema
                            </span>
                          </div>
                        </div>
                        {/* No actions on hardcoded bootstrapped accounts */}
                        <div className="text-[10px] text-slate-400 font-bold italic">
                          Protegido
                        </div>
                      </div>
                    );
                  })}

                  {/* Render Firestore Admins */}
                  {adminsList.map((admin) => {
                    const isMe = admin.id === currentUser?.uid || admin.email?.toLowerCase() === currentUser?.email?.toLowerCase();
                    const isBootstrapped = BOOTSTRAP_ADMIN_EMAILS.includes(admin.email?.toLowerCase() || '');
                    const isSuper = admin.role === 'super' || isBootstrapped;

                    return (
                      <div 
                        key={admin.id}
                        className="border border-slate-200 rounded-xl bg-white p-3.5 flex items-center justify-between gap-3 text-xs hover:border-slate-300 transition-all shadow-3xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800">{admin.email}</span>
                            {isMe && (
                              <span className="text-[9px] bg-slate-200 text-slate-700 font-extrabold px-1.5 py-0.5 rounded uppercase">
                                Vos
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase ${
                              isSuper ? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {isSuper ? 'Superadmin' : 'Admin'}
                            </span>
                            {admin.addedAt && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                Creado: {new Date(admin.addedAt).toLocaleDateString('es-AR')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1">
                          {isMe || isBootstrapped ? (
                            <span className="text-[10px] text-slate-400 font-semibold italic px-2">
                              Protegido
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRemoveAdmin(admin)}
                              type="button"
                              title="Quitar permisos"
                              className="p-1.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-200 active:scale-95 transition-all touch-manipulation"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pending Invites List */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    Invitaciones Pendientes ({invitesList.length})
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                    Usuarios invitados que aún no han iniciado sesión para completar su registro automático.
                  </p>
                </div>

                {invitesList.length > 0 ? (
                  <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                    {invitesList.map((invite) => (
                      <div 
                        key={invite.id}
                        className="border border-dashed border-slate-200 rounded-xl bg-slate-50/50 p-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <span className="font-bold text-slate-600 block">{invite.email}</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase ${
                              invite.role === 'super' ? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              Destino: {invite.role === 'super' ? 'Superadmin' : 'Admin'}
                            </span>
                            {invite.addedAt && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                Enviada: {new Date(invite.addedAt).toLocaleDateString('es-AR')}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleCancelInvite(invite.id)}
                          type="button"
                          title="Cancelar Invitación"
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 bg-white active:scale-95 transition-all text-[10px] font-bold touch-manipulation"
                        >
                          Cancelar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-[11px]">
                    No hay invitaciones pendientes.
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </main>
      {/* HELP GUIDE MODAL - HOW TO USE THE ADMIN PANEL */}
      {showHelpGuide && (
      <Modal
        id="help-guide-wrapper"
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        onClose={() => setShowHelpGuide(false)}
        labelledBy="help-guide-wrapper-title"
      >
      <div className="bg-white w-full max-w-lg rounded-2xl overflow-hidden max-h-[85vh] flex flex-col" id="help-guide-body">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
      <h3 id="help-guide-wrapper-title" className="font-black text-slate-800 text-sm flex items-center gap-2">
      <HelpCircle size={16} /> Como usar el Panel Administrativo
      </h3>
      <button onClick={() => setShowHelpGuide(false)} className="text-slate-400 hover:text-slate-700">
      <X size={20} />
      </button>
      </div>
      <div className="p-4 space-y-4 text-xs text-slate-700 overflow-y-auto">
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Pedidos</p>
      <p>Aca ves todos los pedidos que van entrando. Podes cambiar el estado de cada uno (pendiente, confirmado, listo, entregado o cancelado) a medida que los vas preparando.</p>
      </div>
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Productos</p>
      <p>Aca cargas, editas o borras los productos del catalogo: nombre, precio, categoria, imagen y stock. Los cambios se ven al instante en la tienda.</p>
      </div>
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Banners</p>
      <p>Son los carteles promocionales que aparecen arriba de todo en la tienda. Podes crear, editar o borrar los que quieras mostrar.</p>
      </div>
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Reportes</p>
      <p>Aca ves un resumen de ventas, ingresos y productos mas vendidos, para saber como viene el negocio.</p>
      </div>
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Clientes</p>
      <p>Es el listado de las personas que hicieron pedidos, con sus datos de contacto.</p>
      </div>
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Envios</p>
      <p>Aca se configuran las zonas de entrega y el costo de envio para cada barrio o zona.</p>
      </div>
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Starpos</p>
      <p>Es la conexion con el sistema de facturacion del local. Desde aca podes sincronizar el stock entre la app y el sistema del negocio.</p>
      </div>
      <div>
      <p className="font-black text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Ir a la Tienda</p>
      <p>Te lleva de vuelta a la vista de la tienda, tal como la ve un cliente.</p>
      </div>
      </div>
      <div className="p-4 border-t border-slate-100">
      <button onClick={() => setShowHelpGuide(false)} className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 w-full text-xs font-bold">
      Entendido
      </button>
      </div>
      </div>
      </Modal>
      )}
      

      {/* ADMIN DRAWER FORM FOR ADDING / EDITING PRODUCTS */}
      <AnimatePresence>
        {showingAddForm && (
          <Modal
            id="admin-product-drawer-wrapper"
            className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
            onClose={() => setShowingAddForm(false)}
            labelledBy="admin-product-drawer-wrapper-title"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white w-full max-w-md rounded-t-2xl max-h-[90vh] overflow-y-auto flex flex-col"
              id="admin-product-drawer-body"
            >
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto my-3" />

              <div className="px-4 pb-6">
                
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <h3 id="admin-product-drawer-wrapper-title" className="font-extrabold text-base text-slate-800 leading-none">
                    {editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}
                  </h3>
                  <button 
                    onClick={() => setShowingAddForm(false)}
                    className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                {formValidationMsg && (
                  <div className="bg-blue-50 text-[11px] text-blue-600 font-bold border border-blue-200 p-2.5 rounded-lg mb-4">
                    ⚠️ {formValidationMsg}
                  </div>
                )}

                <div className="flex flex-col gap-3.5">
                  <div>
                    <label className="block text-[10.5px] font-extrabold text-slate-500 uppercase mb-1">Nombre Corto *</label>
                    <input 
                      type="text"
                      placeholder="Ej: Coca-Cola 600ml"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-extrabold text-slate-500 uppercase mb-1">Precio de Venta al Público ($) *</label>
                    <input 
                      type="number"
                      placeholder="Ej: 1200"
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-black focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-extrabold text-slate-500 uppercase mb-1">Categoría del Producto *</label>
                    <select 
                      value={formCat}
                      onChange={(e) => setFormCat(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-extrabold focus:outline-none cursor-pointer"
                    >
                      <option value="">Selección de Categoría...</option>
                      {CATS.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <details className="border border-slate-100 rounded-xl p-2 bg-slate-50/50 mt-1 cursor-pointer">
                    <summary className="text-[11px] font-black text-slate-500 select-none uppercase tracking-wide focus:outline-none py-1">
                      ➕ Opciones avanzadas (marca, precio original, descripción)
                    </summary>
                    <div className="pt-3 border-t border-slate-200/55 flex flex-col gap-3.5 mt-2 cursor-default" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <label className="block text-[10.5px] font-extrabold text-slate-500 uppercase mb-1">Marca o Distribuidor</label>
                        <input 
                          type="text"
                          placeholder="Ej: Coca-Cola Company"
                          value={formBrand}
                          onChange={(e) => setFormBrand(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-extrabold text-slate-500 uppercase mb-1">Precio Original (Antes)</label>
                        <input 
                          type="number"
                          placeholder="Ej: 1500 (Opcional)"
                          value={formOrig}
                          onChange={(e) => setFormOrig(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-extrabold text-slate-500 uppercase mb-1">Código Facturador (SKU / Sincronización)</label>
                        <input 
                          type="text"
                          placeholder="Ej: SKU-COCA-500"
                          value={formCodigoFacturador}
                          onChange={(e) => setFormCodigoFacturador(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none placeholder-slate-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-extrabold text-slate-500 uppercase mb-1">Descripción Breve</label>
                        <textarea 
                          placeholder="Ej: Detalle de tamaño, empaque o sabor..."
                          value={formDesc}
                          onChange={(e) => setFormDesc(e.target.value)}
                          rows={2}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none resize-none"
                        />
                      </div>
                    </div>
                  </details>

                  <div>
                    <label className="block text-[10.5px] font-extrabold text-slate-500 uppercase mb-1">Enlace / URL de la Imagen (Opcional)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Ej: https://enlace-de-imagen.com/foto.jpg"
                        value={formImage}
                        onChange={(e) => setFormImage(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={isGeneratingAIImage || !formName.trim()}
                        onClick={handleAiGenerateImage}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 select-none ${
                          !formName.trim()
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            : isGeneratingAIImage
                              ? 'bg-blue-50 text-blue-500 cursor-wait border border-blue-100 animate-pulse'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-black'
                        }`}
                        title="Generar foto realista del producto con IA Gemini"
                      >
                        {isGeneratingAIImage ? (
                          <>
                            <span className="w-3 h-3 border-2 border-blue-500 border-t-blue-600 rounded-full animate-spin inline-block"></span>
                            Creando...
                          </>
                        ) : (
                          <>
                            <Sparkles size={13} className="text-blue-300 fill-blue-300 animate-pulse" />
                            Generar con IA
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold mt-1">
                      {isGeneratingAIImage 
                        ? '⚡ Conectando con Gemini 2.5 para crear una toma de estudio impecable...' 
                        : '💡 Consejo: Escribí un nombre descriptivo (ej: Coca Cola 1.5L) y tocá este botón.'}
                    </p>

                    {/* NATIVE DEVICE IMAGE FILE SELECTOR */}
                    <div className="mt-3 p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex flex-col gap-2">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider leading-none">
                        📷 Cargar Foto Propia (Desde tu cel o PC)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploadingPhoto}
                        onChange={handleDevicePhotoSelected}
                        className="text-[10.5px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                      />
                      {isUploadingPhoto && (
                        <div className="flex items-center gap-2 text-[10.5px] text-blue-600 font-extrabold animate-pulse">
                          <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin inline-block"></span>
                          Comprimiendo y subiendo la foto...
                        </div>
                      )}
                      {formImage && (
                        <div className="mt-1 flex items-center gap-2.5 p-1 bg-emerald-50 border border-emerald-100 rounded-lg">
                          <img 
                            src={formImage} 
                            className="w-9 h-9 object-cover rounded shadow border shrink-0" 
                            alt="Previsualización" 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = getFallbackStoreImage(formName, formBrand, formCat);
                            }}
                          />
                          <span className="text-[10px] text-emerald-700 font-extrabold font-sans">✓ Foto cargada con éxito</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-t border-b border-slate-100 my-2">
                    <span className="text-xs font-extrabold text-slate-700">¿El producto tiene stock activo para venta?</span>
                    <button 
                      onClick={() => setFormInStock(prev => !prev)}
                      className={`w-10 h-5.5 rounded-full p-0.5 transition-colors relative ${formInStock ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <span className={`w-4.5 h-4.5 bg-white rounded-full block shadow transform transition-transform ${formInStock ? 'translate-x-4.5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex gap-2.5 mt-2">
                    <button 
                      onClick={() => setShowingAddForm(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-extrabold"
                    >
                      Volver
                    </button>
                    <button 
                      onClick={saveProduct}
                      className="flex-2 bg-slate-900 hover:bg-black text-white py-3 rounded-xl text-xs font-black shadow"
                    >
                      Guardar en Góndola
                    </button>
                  </div>

                  {editingProduct && (
                    <button 
                      type="button"
                      onClick={() => {
                        setProductToDelete(editingProduct);
                      }}
                      className="w-full bg-red-50 text-[10.5px] font-bold text-red-600 hover:bg-red-100 border border-red-200 py-2.5 rounded-xl mt-2 cursor-pointer"
                    >
                      Eliminar Producto para siempre
                    </button>
                  )}

                </div>

              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ORDER ACTIONS MANAGER - UPDATE STATUS SCREEN */}
      <AnimatePresence>
        {selectedOrder && (
          <Modal
            id="admin-order-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClose={() => setSelectedOrder(null)}
            labelledBy="admin-order-modal-wrapper-title"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto flex flex-col border border-slate-100 shadow-xl"
              id="admin-order-modal-body"
            >
              <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                <div>
                  <h3 id="admin-order-modal-wrapper-title" className="font-extrabold text-base">Orden de Compra #{selectedOrder.id}</h3>
                  <p className="text-[10px] text-slate-400">Arqueo y control de estatus de WhatsApp</p>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="text-white hover:text-slate-300 text-sm font-bold">
                  ✕
                </button>
              </div>

              <div className="p-4 flex flex-col gap-4">
                
                {/* Customer card */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
                  <p className="mb-1 leading-tight"><b>Cliente:</b> {selectedOrder.customerName || 'Consumidor Final'}</p>
                  <p className="mb-1"><b>Celular:</b> {selectedOrder.customerPhone || 'Sin celular'}</p>
                  {selectedOrder.customerLocation && (
                    <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 mt-2.5 flex flex-col gap-1.5 align-start text-xs font-bold text-slate-800 animate-fade-in whitespace-pre-wrap break-words text-left">
                      <span className="text-[10px] uppercase font-black tracking-wider text-blue-600 flex items-center gap-1 leading-none">📍 Despacho (Pedidos Va)</span>
                      <span className="font-sans leading-relaxed font-semibold text-[11px] block text-slate-800">{selectedOrder.customerLocation}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(selectedOrder.customerLocation || '');
                          showToast('¡Dirección copiada!');
                        }}
                        className="self-start text-[10px] font-extrabold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg transition-all active:scale-95 shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        📋 Copiar Dirección
                      </button>
                    </div>
                  )}
                  <div className="mt-2.5 pt-2 border-t border-slate-200 flex flex-col gap-1 text-[11px]">
                    <p><b>Método de Pago:</b> <span className="bg-slate-200 text-slate-800 font-bold px-1.5 py-0.5 rounded text-[10px] inline-block">{selectedOrder.paymentMethod || 'Efectivo'}</span></p>
                    <p className="flex items-center gap-1.5 mt-0.5">
                      <b>Estado de Pago:</b> 
                      {selectedOrder.paymentStatus === 'aprobado' ? (
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200 rounded text-[9.5px] font-black uppercase">
                          Pago Confirmado (Online)
                        </span>
                      ) : (
                        <span className="text-blue-800 bg-blue-50 px-1.5 py-0.5 border border-blue-200 rounded text-[9.5px] font-black uppercase">
                          Cobro Pendiente al despachar
                        </span>
                      )}
                    </p>
                    {selectedOrder.deliveryDay && (
                      <p className="mt-1">
                        <b>Programación:</b>{' '}
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase ${
                          selectedOrder.deliveryDay === 'next' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {selectedOrder.deliveryDay === 'next' ? `Mañana (${selectedOrder.scheduledDate ? selectedOrder.scheduledDate.split('-').reverse().join('/') : ''})` : 'Hoy'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Products list detail */}
                <div>
                  <h4 className="text-[10.5px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Artículos del pedido</h4>
                  <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 overflow-hidden text-xs">
                    {selectedOrder.items.map((it, idx) => (
                      <div key={idx} className="p-2.5 flex justify-between items-center bg-white">
                        <div>
                          <span className="font-bold text-slate-800">{it.name}</span>
                          <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                            Cant: x{it.qty} · {fmt(it.price)} c/u
                          </span>
                        </div>
                        <span className="font-black text-slate-900">{fmt(it.price * it.qty)}</span>
                      </div>
                    ))}
                    
                    {/* Desglose del cobro: subtotal - descuentos + envio = total */}
                    <div className="p-2.5 flex justify-between items-center bg-white text-xs font-bold text-slate-500 border-t">
                      <span>Subtotal</span>
                      <span>{fmt(selectedOrder.subtotal)}</span>
                    </div>

                    {!!selectedOrder.qrDiscountAmount && selectedOrder.qrDiscountAmount > 0 && (
                      <div className="p-2.5 flex justify-between items-center bg-white text-xs font-bold text-blue-600 border-t">
                        <span>Descuento QR (10%)</span>
                        <span>-{fmt(selectedOrder.qrDiscountAmount)}</span>
                      </div>
                    )}

                    {selectedOrder.couponCode && (
                      <div className="p-2.5 flex justify-between items-center bg-white text-xs font-bold text-blue-600 border-t">
                        <span>Cupón {selectedOrder.couponCode}{selectedOrder.couponPercent ? ` (${selectedOrder.couponPercent}%)` : ''}</span>
                        <span>
                          {selectedOrder.couponDiscountAmount
                            ? `-${fmt(selectedOrder.couponDiscountAmount)}`
                            : 'Envío gratis'}
                        </span>
                      </div>
                    )}

                    {/* Shipping pre-calculated values */}
                    {selectedOrder.delivery === 'envio' && (
                      <div className="p-2.5 flex justify-between items-center bg-blue-50/35 text-blue-600 text-xs font-bold font-semibold border-t">
                        <span>Costos de Delivery (Pedidos Va)</span>
                        <span>{selectedOrder.shipping > 0 ? fmt(selectedOrder.shipping) : 'Gratis'}</span>
                      </div>
                    )}

                    <div className="p-2.5 flex justify-between items-center bg-slate-50 text-xs font-extrabold border-t">
                      <span>Total Facturado</span>
                      <span className="text-sm font-black text-slate-900">{fmt(selectedOrder.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Estatus updates buttons */}
                <div>
                  {selectedOrder.status === 'pending_confirmation' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-blue-800 font-extrabold text-[11px]">
                        <span className="text-sm">⏰</span>
                        <span>Envío Programado para Mañana ({selectedOrder.scheduledDate ? selectedOrder.scheduledDate.split('-').reverse().join('/') : 'S/D'})</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                        Este pedido fue cargado después de la hora de corte. Confirmá el carrito para iniciar su preparación y despacho.
                      </p>
                      <button
                        onClick={() => {
                          if (!selectedOrder.docId) return;
                          onUpdateOrderStatus(selectedOrder.docId, 'confirmado');
                          setSelectedOrder(prev => prev ? { ...prev, status: 'confirmado' } : null);
                          showToast(`¡Pedido confirmado para reparto! 🚚`);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-black py-2 px-3 rounded-lg shadow-xs transition-all active:scale-[0.98] cursor-pointer text-center font-sans"
                      >
                        ✅ CONFIRMAR Y PASAR A REPARTO
                      </button>
                    </div>
                  )}

                  <h4 className="text-[10.5px] font-extrabold text-slate-400 uppercase tracking-widest mb-2.5">
                    Actualizar estado del pedido:
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {((selectedOrder.delivery === 'envio'
                      ? ['pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado']
                      : ['pendiente', 'confirmado', 'en_preparacion', 'listo', 'entregado', 'cancelado']) as Order['status'][]
                    ).map(s => (
                      <button
                        key={s}
                        onClick={() => {
                          if (!selectedOrder.docId) return;
                          onUpdateOrderStatus(selectedOrder.docId, s);
                          setSelectedOrder(prev => prev ? { ...prev, status: s } : null);
                          showToast(`Pedido: ${orderStatusLabel(s, selectedOrder.delivery)}`);
                        }}
                        className={`py-2 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                          selectedOrder.status === s 
                            ? 'bg-slate-900 text-white border-slate-900 font-black shadow-sm' 
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        {orderStatusLabel(s, selectedOrder.delivery)}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* CSV BLOCKED DRAG AND DROP MODAL FOR MASS LOADING */}
      <AnimatePresence>
        {showingCsvImport && (
          <Modal
            id="csv-uploader-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClose={() => setShowingCsvImport(false)}
            labelledBy="csv-uploader-modal-wrapper-title"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-slate-100 flex flex-col max-h-[85vh]"
              id="csv-uploader-modal-body"
            >
              <div className="bg-blue-700 text-white p-4 flex justify-between items-center">
                <div>
                  <h3 id="csv-uploader-modal-wrapper-title" className="font-extrabold text-base">Importación Masiva (Excel / CSV)</h3>
                  <p className="text-[10px] text-blue-100">Cargá tu catálogo instantáneamente desde Excel (.xlsx, .xls) o CSV</p>
                </div>
                <button 
                  onClick={() => setShowingCsvImport(false)}
                  className="text-white hover:text-blue-200 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
                
                {csvParsedList.length === 0 ? (
                  <>
                    {/* Drag and Drop Zone */}
                    <div 
                      onDragOver={(e) => { e.preventDefault(); setCsvDragActive(true); }}
                      onDragLeave={() => setCsvDragActive(false)}
                      onDrop={(e) => { e.preventDefault(); setCsvDragActive(false); const f = e.dataTransfer.files[0]; if (f) handleCsvUpload(f); }}
                      onClick={() => document.getElementById('csv-file-selector')?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                        csvDragActive ? 'border-blue-600 bg-blue-50/20' : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <span className="text-4xl block mb-2">📊</span>
                      <p className="text-xs font-bold text-slate-700">Arrastrá tu archivo Excel o CSV aquí</p>
                      <p className="text-[10px] text-slate-400 mt-1">o hace clic para elegir de tu explorador</p>
                      
                      <input 
                        type="file" 
                        id="csv-file-selector" 
                        accept=".csv,.txt,.xlsx,.xls"
                        className="hidden" 
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f); }}
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="text-[10.5px] font-extrabold text-slate-500 uppercase tracking-widest mb-1.5">Columnas esperadas:</p>
                      <code className="text-[9.5px] font-mono text-slate-600 block bg-white p-1.5 border border-slate-100 rounded leading-relaxed">
                        nombre, marca, precio, precio_original, categoria, descripcion, en_stock
                      </code>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={downloadSampleTemplate}
                        className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-2.5 rounded-xl text-xs font-bold"
                      >
                        Descargar Plantilla CSV de Ejemplo
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h5 className="text-[13px] font-bold text-slate-800 leading-none">Resultados obtenidos del archivo:</h5>
                    <div className="grid grid-cols-2 gap-3.5 my-1">
                      <div className="bg-emerald-50/50 p-2.5 border border-emerald-100 rounded-xl text-center">
                        <span className="text-lg font-black text-emerald-700 block">{csvParsedList.length}</span>
                        <span className="text-[9.5px] text-slate-400 font-bold uppercase">Productos válidos</span>
                      </div>
                      <div className="bg-blue-50/50 p-2.5 border border-blue-200 rounded-xl text-center">
                        <span className="text-lg font-black text-red-600 block">{csvErrorsList.length}</span>
                        <span className="text-[9.5px] text-slate-400 font-bold uppercase">Filas omitidas</span>
                      </div>
                    </div>

                    {/* Choose Import mode: 'append' / 'overwrite' */}
                    <div>
                      <span className="text-[10.5px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 block">
                        Modo de importación:
                      </span>
                      <div className="grid grid-cols-2 gap-2.5 font-bold">
                        <div 
                          onClick={() => setCsvImportMode('agregar')}
                          className={`p-2.5 border rounded-xl text-center cursor-pointer transition-all ${
                            csvImportMode === 'agregar' ? 'border-slate-800 bg-slate-50/50' : 'border-slate-100'
                          }`}
                        >
                          <span className="text-xs text-slate-800 block">Agregar</span>
                          <span className="text-[9px] text-slate-400 block font-semibold leading-none mt-1">Suma al catálogo actual</span>
                        </div>
                        
                        <div 
                          onClick={() => setCsvImportMode('reemplazar')}
                          className={`p-2.5 border rounded-xl text-center cursor-pointer transition-all ${
                            csvImportMode === 'reemplazar' ? 'border-blue-600 bg-blue-50/30' : 'border-slate-100'
                          }`}
                        >
                          <span className="text-xs text-slate-800 block">Reemplazar</span>
                          <span className="text-[9px] text-slate-400 block font-semibold leading-none mt-1">Borra catálogo y carga este</span>
                        </div>
                      </div>
                    </div>

                    {csvErrorsList.length > 0 && (
                      <div className="bg-blue-50/40 p-2 rounded-xl text-[9.5px] border border-blue-100 text-blue-700 font-mono flex flex-col gap-1 max-h-24 overflow-y-auto leading-relaxed">
                        <span className="font-extrabold block text-slate-600">FILAS INVÁLIDAS DETECTADAS:</span>
                        {csvErrorsList.map((err, i) => <span key={i}>{err}</span>)}
                      </div>
                    )}

                    <div className="flex gap-2.5 mt-2 pt-2 border-t border-slate-100">
                      <button 
                        onClick={() => {
                          setCsvParsedList([]);
                          setCsvErrorsList([]);
                        }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold"
                      >
                        Resetear
                      </button>
                      
                      <button 
                        onClick={confirmCsvImport}
                        className="flex-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-black shadow"
                      >
                        Importar {csvParsedList.length} productos
                      </button>
                    </div>
                  </>
                )}

              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ALERTS DE TOAST */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div 
            initial={{ opacity: 0, y: 16, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 16, x: "-50%" }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-full text-xs font-extrabold z-40 shadow-md text-center max-w-[85vw]"
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* PRODUCT DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {productToDelete && (
          <Modal
            id="delete-confirmation-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 select-none"
            onClose={() => setProductToDelete(null)}
            closeOnBackdrop={false}
            labelledBy="delete-confirmation-modal-wrapper-title"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-[325px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col p-4"
              id="delete-confirmation-modal-body"
            >
              <div className="text-center py-2.5 flex flex-col items-center">
                <span className="text-3xl block filter drop-shadow-sm mb-2.5">🗑️</span>
                <h3 id="delete-confirmation-modal-wrapper-title" className="font-extrabold text-[14px] text-slate-800 leading-tight">¿Eliminar Producto de Góndola?</h3>
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
                    onDeleteProduct(productToDelete.id);
                    setProductToDelete(null);
                    setShowingAddForm(false);
                    showToast(`Producto "${productToDelete.name}" eliminado`);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-black shadow-sm transition-all active:scale-97 cursor-pointer"
                >
                  Sí, Eliminar
                </button>
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* CUSTOM ALERT MODAL */}
      <AnimatePresence>
        {customAlert && (
          <Modal
            id="custom-alert-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 select-none"
            onClose={() => setCustomAlert(null)}
            closeOnBackdrop={false}
            labelledBy="custom-alert-modal-wrapper-title"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-[325px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col p-5"
              id="custom-alert-modal-body"
            >
              <div className="text-center py-2 flex flex-col items-center">
                <span className="text-3xl block filter drop-shadow-sm mb-2.5">💡</span>
                <h3 id="custom-alert-modal-wrapper-title" className="font-extrabold text-[14px] text-slate-800 leading-tight">
                  {customAlert.title || 'Atención'}
                </h3>
                <p className="text-[11.5px] text-slate-500 leading-relaxed max-w-[245px] mt-2 font-medium">
                  {customAlert.message}
                </p>
              </div>

              <div className="mt-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setCustomAlert(null)}
                  className="w-full bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl text-xs font-black shadow-sm transition-all active:scale-97 cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* CUSTOM CONFIRM MODAL */}
      <AnimatePresence>
        {customConfirm && (
          <Modal
            id="custom-confirm-modal-wrapper"
            className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 select-none"
            onClose={() => setCustomConfirm(null)}
            closeOnBackdrop={false}
            labelledBy="custom-confirm-modal-wrapper-title"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-[325px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col p-5"
              id="custom-confirm-modal-body"
            >
              <div className="text-center py-2 flex flex-col items-center">
                <span className="text-3xl block filter drop-shadow-sm mb-2.5">⚠️</span>
                <h3 id="custom-confirm-modal-wrapper-title" className="font-extrabold text-[14px] text-slate-800 leading-tight">
                  {customConfirm.title || '¿Confirmar Acción?'}
                </h3>
                <p className="text-[11.5px] text-slate-500 leading-relaxed max-w-[245px] mt-2 font-medium">
                  {customConfirm.message}
                </p>
              </div>

              <div className="flex gap-2.5 mt-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setCustomConfirm(null)}
                  className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-97 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    customConfirm.onConfirm();
                    setCustomConfirm(null);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-black shadow-sm transition-all active:scale-97 cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

    </div>
  );
};
