import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import { useAdmin } from './hooks/useAdmin';
import { Storefront } from './components/Storefront';
import Onboarding from './components/Onboarding';
import { Product, Order, PromoBanner, DeliveryZone, Combo } from './types';
import { DEFAULT_PRODUCTS, getFallbackStoreImage } from './data';
import { playChime } from './utils/audio';
import { authedFetch } from './utils/authedFetch';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

// El panel admin (~220 KB) sólo lo usa el kiosco: se carga bajo demanda para que
// el cliente de la tienda no lo descargue.
const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then(m => ({ default: m.AdminPanel }))
);

const DEFAULT_BY_ID = new Map<number, Product>(DEFAULT_PRODUCTS.map(p => [p.id, p]));

const healProduct = (p: Product): Product => {
    if (!p.image || p.image.trim() === '' || (!p.image.startsWith('http') && !p.image.startsWith('data:image'))) {
    const match = DEFAULT_BY_ID.get(p.id);
    if (match && match.image && match.image.trim() !== '') return { ...p, image: match.image };
    return { ...p, image: getFallbackStoreImage(p.name, p.brand, p.cat) };
  }
  return p;
};

const healProductList = (list: Product[]): Product[] => list.map(healProduct);

const readLocalProducts = (): Product[] | null => {
  const raw = localStorage.getItem('origenes_products');
  if (!raw) return null;
  try {
    const decoded = JSON.parse(raw);
    if (Array.isArray(decoded) && decoded.length > 0) return decoded as Product[];
  } catch (e) {
    console.error('origenes_products corrupto en localStorage:', e);
  }
  return null;
};

export default function App() {
  const [view, setView] = useState<'storefront' | 'admin'>(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam === 'storefront') return 'storefront';
    if (viewParam === 'admin') return 'admin';
    // Por defecto abre la TIENDA: así un cliente no descarga el chunk del panel
    // ni ve el flash "Cargando panel". El panel se abre con ?view=admin (o al
    // iniciar sesión como admin).
    return 'storefront';
  });

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return localStorage.getItem('origenes_onboarded') !== '1';
    } catch {
      return false;
    }
  });

  const dismissOnboarding = () => {
    try {
      localStorage.setItem('origenes_onboarded', '1');
    } catch {
    }
    setShowOnboarding(false);
  };

  const [products, setProducts] = useState<Product[]>(() => {
    const local = localStorage.getItem('origenes_products');
    if (local) {
      try {
        const decoded = JSON.parse(local);
        if (decoded && decoded.length > 0) {
          const healed = decoded.map((p: Product) => {
            if (!p.image || p.image.trim() === '' || !p.image.startsWith('http')) {
              const defaultMatch = DEFAULT_PRODUCTS.find(d => d.id === p.id);
              if (defaultMatch) {
                return { ...p, image: defaultMatch.image };
              }
              return { ...p, image: getFallbackStoreImage(p.name, p.brand, p.cat) };
            }
            return p;
          });
          return healed;
        }
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [productsStatus, setProductsStatus] = useState<'loading' | 'ready' | 'error' | 'loadingMore'>(
    () => (readLocalProducts() ? 'ready' : 'loading')
  );

  const [orders, setOrders] = useState<Order[]>(() => {
    const local = localStorage.getItem('origenes_orders');
    if (local) {
      try {
        const decoded = JSON.parse(local);
        if (decoded && decoded.length > 0) return decoded;
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [banners, setBanners] = useState<PromoBanner[]>(() => {
    const local = localStorage.getItem('origenes_banners');
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      { id: "default_retiro", text: "🏪 ¡Hacé tu pedido online y retirá por nuestro local!", isActive: true, color: "bg-blue-700" }
    ];
  });

  const [currentUser, setCurrentUser] = useState<User | null | undefined>(undefined);
  const { isAdmin, isSuperAdmin, adminLoading } = useAdmin(currentUser);

  // Keep a ref to isAdmin to use in stale Firestore onSnapshot closures
  const isAdminRef = useRef(isAdmin);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // Pedido activo del cliente, para seguirlo en vivo (docId de Firestore).
  const [activeOrderDocId, setActiveOrderDocId] = useState<string | null>(() => {
    try { return localStorage.getItem('origenes_active_order_id'); } catch { return null; }
  });

  // Seguimiento EN VIVO del propio pedido del cliente (no-admin): se suscribe a
  // UN solo documento por su ID —habilitado por las reglas con 'allow get'— y
  // refleja en tiempo real los cambios de estado que hace el local, sin poder
  // listar ni ver los pedidos de otros.
  useEffect(() => {
    if (isAdmin || !activeOrderDocId) return;
    const unsub = onSnapshot(doc(db, 'orders', activeOrderDocId), (snap) => {
      if (!snap.exists()) return;
      const live = { ...(snap.data() as Order), docId: snap.id };
      // Pedido finalizado: se deja de recordar como "activo" para no re-suscribir
      // en la próxima sesión (el estado final igual se ve mientras la app está abierta).
      if (live.status === 'entregado' || live.status === 'cancelado') {
        try { localStorage.removeItem('origenes_active_order_id'); } catch (e) { /* sin storage */ }
      }
      setOrders(prev => {
        const idx = prev.findIndex(o => o.docId === live.docId || o.id === live.id);
        if (idx === -1) return [live, ...prev];
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...live };
        return copy;
      });
    }, (err) => console.warn('Seguimiento en vivo del pedido no disponible:', err.message));
    return () => unsub();
  }, [isAdmin, activeOrderDocId]);

  const [signInState, setSignInState] = useState<'idle' | 'pending' | 'redirecting' | 'error'>('idle');
  const [signInError, setSignInError] = useState<string | null>(null);

  const [newOrderToast, setNewOrderToast] = useState<Order | null>(null);

  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [deliveryCutoffHour, setDeliveryCutoffHour] = useState<number>(21);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      localStorage.removeItem('origenes_products');
      localStorage.removeItem('origenes_orders');

      // Automated backfill of name_lower field
      const runBackfill = async () => {
        try {
          const { getDocs, collection, writeBatch, doc } = await import('firebase/firestore');
          const snap = await getDocs(collection(db, 'products'));
          const batchSize = 500;
          let count = 0;
          let batch = writeBatch(db);

          for (const docSnap of snap.docs) {
            const data = docSnap.data() as Product;
            if (!data.name_lower) {
              const nameLowerValue = data.name.trim().toLowerCase();
              batch.update(doc(db, 'products', docSnap.id), { name_lower: nameLowerValue });
              count++;

              if (count % batchSize === 0) {
                await batch.commit();
                batch = writeBatch(db);
              }
            }
          }

          if (count > 0 && count % batchSize !== 0) {
            await batch.commit();
          }

          if (count > 0) {
            console.log(`[Backfill] ¡Actualizados ${count} productos con name_lower!`);
          }
        } catch (err) {
          console.error('[Backfill Error]', err);
        }
      };
      runBackfill();
    }
  }, [isAdmin]);

  // Redirect to storefront if accessing admin view but not authorized
  useEffect(() => {
    if (view === 'admin' && !adminLoading && !isAdmin) {
      setView('storefront');
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'storefront');
      window.history.replaceState({}, '', url.toString());
    }
  }, [view, isAdmin, adminLoading]);

  const [dbCategory, setDbCategory] = useState<string>('all');
  const [lastVisibleDoc, setLastVisibleDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const fetchLock = useRef(false);

  const loadProducts = async (reset: boolean = false, currentCatVal = dbCategory) => {
    if (fetchLock.current && !reset) return;
    fetchLock.current = true;

    try {
      setProductsStatus(reset ? 'loading' : 'loadingMore');
      
      const { getDocs, query, collection, orderBy, limit, startAfter, where } = await import('firebase/firestore');
      
      let q;
      const baseCol = collection(db, 'products');
      const PAGE_SIZE = 50;
      
      if (currentCatVal !== 'all' && currentCatVal !== 'favorites') {
        if (reset) {
          q = query(baseCol, where('cat', '==', currentCatVal), orderBy('id'), limit(PAGE_SIZE));
        } else if (lastVisibleDoc) {
          q = query(baseCol, where('cat', '==', currentCatVal), orderBy('id'), startAfter(lastVisibleDoc), limit(PAGE_SIZE));
        } else {
          q = query(baseCol, where('cat', '==', currentCatVal), orderBy('id'), limit(PAGE_SIZE));
        }
      } else {
        if (reset) {
          q = query(baseCol, orderBy('id'), limit(PAGE_SIZE));
        } else if (lastVisibleDoc) {
          q = query(baseCol, orderBy('id'), startAfter(lastVisibleDoc), limit(PAGE_SIZE));
        } else {
          q = query(baseCol, orderBy('id'), limit(PAGE_SIZE));
        }
      }

      const snapshot = await getDocs(q);
      const fetchedProds: Product[] = [];
      snapshot.forEach(doc => {
        fetchedProds.push(doc.data() as Product);
      });

      if (reset && currentCatVal === 'all' && fetchedProds.length === 0) {
        const isAdminUser = isAdminRef.current;
        if (isAdminUser) {
          await seedDefaultProductsSecurely();
          fetchLock.current = false;
          return loadProducts(true, 'all');
        } else {
          const localProds = readLocalProducts();
          setProducts(localProds ? healProductList(localProds) : DEFAULT_PRODUCTS);
          setHasMore(false);
          setProductsStatus('ready');
          fetchLock.current = false;
          return;
        }
      }

      const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      setLastVisibleDoc(lastDoc);
      setHasMore(snapshot.docs.length === PAGE_SIZE);

      const healedFetched = healProductList(fetchedProds);

      setProducts(prev => {
        const nextList = reset ? healedFetched : [...prev, ...healedFetched];
        const uniqueMap = new Map<number, Product>();
        nextList.forEach(p => uniqueMap.set(p.id, p));
        const finalUniqueList = Array.from(uniqueMap.values()).sort((a, b) => a.id - b.id);
        
        localStorage.setItem('origenes_products', JSON.stringify(finalUniqueList));
        return finalUniqueList;
      });

      setProductsStatus('ready');
    } catch (error: any) {
      console.warn("Error fetching paginated products:", error);
      if (reset) {
        const localProds = readLocalProducts();
        setProducts(localProds ? healProductList(localProds) : DEFAULT_PRODUCTS);
        setHasMore(false);
      }
      setProductsStatus('ready');
    } finally {
      fetchLock.current = false;
    }
  };

  const loadMoreProducts = async () => {
    if (productsStatus === 'loading' || productsStatus === 'loadingMore' || !hasMore) return;
    await loadProducts(false, dbCategory);
  };

  useEffect(() => {
    loadProducts(true, dbCategory);
  }, [dbCategory]);

  useEffect(() => {
    const unsubProducts = () => {};

    if (!isAdminRef.current) { const cachedOrdersStr = localStorage.getItem('origenes_orders'); if (cachedOrdersStr) { try { const cachedDecoded = JSON.parse(cachedOrdersStr); if (cachedDecoded && cachedDecoded.length > 0) setOrders(cachedDecoded); } catch (e) { console.error(e); } } } const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const ordersList: Order[] = [];
      snapshot.forEach(docSnap => {
        ordersList.push({ ...(docSnap.data() as Order), docId: docSnap.id });
      });

      ordersList.sort((a, b) => b.id - a.id);

      const localOrdersStr = localStorage.getItem('origenes_orders');
      const isAdminUser = isAdminRef.current;
      if (localOrdersStr && !isAdminUser) {
        try {
          const decoded = JSON.parse(localOrdersStr);
          if (decoded && decoded.length > 0) {
            setOrders(decoded);
            return;
          }
        } catch(e) {
          console.error(e);
        }
      }

      setOrders(prev => {
        // Dedup por docId: dos pedidos de clientes distintos pueden compartir
        // el mismo Order.id y el aviso de pedido nuevo no sonaba.
        const prevDocIds = new Set(prev.map(o => o.docId).filter(Boolean));
        const newOrders = ordersList.filter(o => !prevDocIds.has(o.docId));
        if (prev.length > 0 && newOrders.length > 0) {
          playChime();
          setNewOrderToast(newOrders[0]);
        }
        return ordersList;
      });
    }, (error) => {
      console.warn("Orders sync onSnapshot read restriction: ", error.message);
    });

    const unsubBanners = onSnapshot(collection(db, 'banners'), (snapshot) => {
      const bannerList: PromoBanner[] = [];
      snapshot.forEach(doc => {
        bannerList.push(doc.data() as PromoBanner);
      });
      if (bannerList.length > 0) {
        setBanners(bannerList);
      } else {
        const isAdminUser = isAdminRef.current;
        const initialBannerList = [
          { id: "default_retiro", text: "🏪 ¡Hacé tu pedido online y retirá por nuestro local!", isActive: true, color: "bg-blue-700" }
        ];
        if (isAdminUser) {
          setDoc(doc(db, 'banners', 'default_retiro'), initialBannerList[0]);
        }
        setBanners(initialBannerList);
      }
    }, (error) => {
      console.warn("Banners check onSnapshot read restriction: ", error.message);
    });

    const unsubZones = onSnapshot(collection(db, 'delivery_zones'), (snapshot) => {
      const zonesList: DeliveryZone[] = [];
      snapshot.forEach(doc => {
        zonesList.push(doc.data() as DeliveryZone);
      });

      if (zonesList.length === 0) {
        const defaultZones: DeliveryZone[] = [
          { id: '1', name: 'Centro', km: 1, price: 5000 },
          { id: '2', name: 'Rio Pipo', km: 3, price: 7000 },
          { id: '3', name: 'La Cantera', km: 3, price: 7000 },
          { id: '4', name: 'Solidaridad/640 Viviendas', km: 4, price: 8000 },
          { id: '5', name: 'Kaiken', km: 5, price: 9000 },
          { id: '6', name: 'Las Raices', km: 6, price: 10000 },
          { id: '7', name: 'Andorra', km: 7, price: 11000 },
          { id: '8', name: 'zona norte alta', km: 8, price: 12000 },
        ];

        const isAdminUser = isAdminRef.current;
        if (isAdminUser) {
          defaultZones.forEach(async (zone) => {
            try {
              await setDoc(doc(db, 'delivery_zones', zone.id), zone);
            } catch (err) {
              console.error("Error seeding zone:", err);
            }
          });
        }
        setDeliveryZones(defaultZones);
      } else {
        zonesList.sort((a, b) => a.km - b.km);
        setDeliveryZones(zonesList);
      }
    }, (error) => {
      console.warn("Delivery zones read restriction: ", error.message);
      const fallbackZones: DeliveryZone[] = [
        { id: '1', name: 'Centro', km: 1, price: 5000 },
        { id: '2', name: 'Rio Pipo', km: 3, price: 7000 },
        { id: '3', name: 'La Cantera', km: 3, price: 7000 },
        { id: '4', name: 'Solidaridad/640 Viviendas', km: 4, price: 8000 },
        { id: '5', name: 'Kaiken', km: 5, price: 9000 },
        { id: '6', name: 'Las Raices', km: 6, price: 10000 },
        { id: '7', name: 'Andorra', km: 7, price: 11000 },
        { id: '8', name: 'zona norte alta', km: 8, price: 12000 },
      ];
      setDeliveryZones(fallbackZones);
    });

    // Combos armados desde el panel administrativo (coleccion 'combos').
    const unsubCombos = onSnapshot(collection(db, 'combos'), (snapshot) => {
      const combosList: Combo[] = [];
      snapshot.forEach(d => {
        combosList.push(d.data() as Combo);
      });
      combosList.sort((a, b) => a.price - b.price);
      setCombos(combosList);
    }, (error) => {
      console.warn("Combos read restriction: ", error.message);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'delivery'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.deliveryCutoffHour === 'number') {
          setDeliveryCutoffHour(data.deliveryCutoffHour);
        }
      } else {
        const isAdminUser = isAdminRef.current;
        if (isAdminUser) {
          setDoc(doc(db, 'settings', 'delivery'), { deliveryCutoffHour: 21 }).catch(e => {
            console.error("Error seeding settings:", e);
          });
        }
        setDeliveryCutoffHour(21);
      }
    }, (error) => {
      console.warn("Settings check read restriction: ", error.message);
    });

    return () => {
      unsubProducts();
      unsubOrders();
      unsubBanners();
      unsubZones();
      unsubCombos();
      unsubSettings();
    };
  }, []);

  const seedDefaultProductsSecurely = async () => {
    try {
      for (const p of DEFAULT_PRODUCTS) {
        const productWithLower = { ...p, name_lower: p.name.trim().toLowerCase() };
        await setDoc(doc(db, 'products', p.id.toString()), productWithLower);
      }
    } catch (err) {
      console.log("Pre-seeding default items requires login as administrator.");
    }
  };

  const handleUpdateProduct = async (updatedProd: Product) => {
    const finalImage = updatedProd.image?.trim() || getFallbackStoreImage(updatedProd.name, updatedProd.brand, updatedProd.cat);
    const resolvedProd = { ...updatedProd, image: finalImage, name_lower: updatedProd.name.trim().toLowerCase() };
    const previousProductsList = products;
    const updatedList = products.map(p => p.id === resolvedProd.id ? resolvedProd : p);
    setProducts(updatedList);

    const isAdminUser = isAdmin;
    if (!isAdminUser) {
      localStorage.setItem('origenes_products', JSON.stringify(updatedList));
    }

    try {
      if (isAdminUser) {
        await setDoc(doc(db, 'products', resolvedProd.id.toString()), resolvedProd);
      }
    } catch (err) {
      setProducts(previousProductsList);
      const e2 = err as any;
      const motivo = e2?.code || e2?.message || String(err);
      window.alert(
        'No se pudo guardar el producto.\n\n' +
        'Motivo real: ' + motivo + '\n' +
        'Cuenta: ' + (auth.currentUser?.email || 'SIN SESION') + '\n' +
        'Verificado: ' + (auth.currentUser?.emailVerified ? 'si' : 'NO')
      );
      try { handleFirestoreError(err, OperationType.WRITE, `products/${resolvedProd.id}`); } catch (e) { console.error(e); }
    }
  };

  const handleAddProduct = async (newProdInfo: Omit<Product, 'id'>) => {
    const isAdminUser = isAdmin;
    let nextId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1000;

    if (isAdminUser) {
      try {
        const { getDocs, query, collection, orderBy, limit } = await import('firebase/firestore');
        const maxSnap = await getDocs(query(collection(db, 'products'), orderBy('id', 'desc'), limit(1)));
        if (!maxSnap.empty) {
          const trueMaxId = (maxSnap.docs[0].data() as Product).id;
          nextId = Math.max(nextId, trueMaxId + 1);
        }
      } catch (err) {
        console.error('No se pudo verificar el ID máximo real de productos antes de crear uno nuevo:', err);
      }
    }

    const finalImage = newProdInfo.image?.trim() || getFallbackStoreImage(newProdInfo.name, newProdInfo.brand, newProdInfo.cat);
    const nextProd: Product = { id: nextId, ...newProdInfo, image: finalImage, name_lower: newProdInfo.name.trim().toLowerCase() };
    const previousProductsListForAdd = products;
    const updatedList = [...products, nextProd];
    setProducts(updatedList);

    if (!isAdminUser) {
      localStorage.setItem('origenes_products', JSON.stringify(updatedList));
    }

    try {
      if (isAdminUser) {
        await setDoc(doc(db, 'products', nextId.toString()), nextProd);
      }
    } catch (err) {
      setProducts(previousProductsListForAdd);
      const e2 = err as any;
      const motivo = e2?.code || e2?.message || String(err);
      window.alert(
        'No se pudo guardar el producto.\n\n' +
        'Motivo real: ' + motivo + '\n' +
        'Cuenta: ' + (auth.currentUser?.email || 'SIN SESION') + '\n' +
        'Verificado: ' + (auth.currentUser?.emailVerified ? 'si' : 'NO')
      );
      try { handleFirestoreError(err, OperationType.WRITE, `products/${nextId}`); } catch (e) { console.error(e); }
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    const updatedList = products.filter(p => p.id !== productId);
    setProducts(updatedList);

    const isAdminUser = isAdmin;
    if (!isAdminUser) {
      localStorage.setItem('origenes_products', JSON.stringify(updatedList));
    }

    try {
      if (isAdminUser) {
        await deleteDoc(doc(db, 'products', productId.toString()));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
    }
  };

  // Se identifica por docId de Firestore. El número de pedido (Order.id) se
  // calcula por dispositivo — cada uno arranca en 1000 — así que se repite entre
  // clientes: buscar por él actualizaba el pedido equivocado.
  const handleUpdateOrderStatus = async (docId: string, status: Order['status']) => {
    const orderToUpdate = orders.find(o => o.docId === docId);
    if (!orderToUpdate) return;
    const updatedOrder = { ...orderToUpdate, status };

    const updatedList = orders.map(o => o.docId === docId ? updatedOrder : o);
    setOrders(updatedList);

    const isAdminUser = isAdmin;
    if (!isAdminUser) {
      localStorage.setItem('origenes_orders', JSON.stringify(updatedList));
    }

    try {
      if (isAdminUser) {
        // docId es metadato local: el documento sólo admite los campos declarados
        // en hasOnlyOrderFields() de firestore.rules.
        const { docId: _omitDocId, ...payload } = updatedOrder;
        await setDoc(doc(db, 'orders', docId), payload);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${docId}`);
    }
  };

  const handleSaveBanner = async (banner: PromoBanner) => {
    const updated = banners.some(b => b.id === banner.id)
      ? banners.map(b => b.id === banner.id ? banner : b)
      : [...banners, banner];
    setBanners(updated);

    const isAdminUser = isAdmin;
    if (!isAdminUser) {
      localStorage.setItem('origenes_banners', JSON.stringify(updated));
    }

    try {
      if (isAdminUser) {
        await setDoc(doc(db, 'banners', banner.id), banner);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `banners/${banner.id}`);
    }
  };

  const handleDeleteBanner = async (bannerId: string) => {
    const updated = banners.filter(b => b.id !== bannerId);
    setBanners(updated);

    const isAdminUser = isAdmin;
    if (!isAdminUser) {
      localStorage.setItem('origenes_banners', JSON.stringify(updated));
    }

    try {
      if (isAdminUser) {
        await deleteDoc(doc(db, 'banners', bannerId));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `banners/${bannerId}`);
    }
  };

  const handleUpdateDeliveryCutoffHour = async (cutoffHour: number) => {
    setDeliveryCutoffHour(cutoffHour);
    try {
      const isAdminUser = isAdmin;
      if (isAdminUser) {
        await setDoc(doc(db, 'settings', 'delivery'), { deliveryCutoffHour: cutoffHour });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/delivery');
    }
  };

  const handleBulkImportProducts = async (newProds: Product[]) => {
    setProducts(newProds);

    const isAdminUser = isAdmin;
    if (!isAdminUser) {
      localStorage.setItem('origenes_products', JSON.stringify(newProds));
    }

    try {
      if (isAdminUser) {
        const newProdIds = new Set(newProds.map(p => p.id));
        for (const p of products) {
          if (!newProdIds.has(p.id)) {
            await deleteDoc(doc(db, "products", p.id.toString()));
          }
        }
        for (const p of newProds) {
          const productWithLower = { ...p, name_lower: p.name.trim().toLowerCase() };
          await setDoc(doc(db, "products", p.id.toString()), productWithLower);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products');
    }
  };

  const handlePlaceOrder = async (
    orderDetails: Omit<Order, 'id' | 'timestamp' | 'status'>,
    name: string,
    phone: string,
    location?: string,
    paymentMethod?: string,
    paymentStatus?: string
  ) => {
    const nextId = orders.length ? Math.max(...orders.map(o => o.id)) + 1 : 1000;

    // Un pedido programado para el día siguiente entra como 'pending_confirmation':
    // es lo que el panel muestra como "Envío Mañana". Antes se forzaba 'pendiente'
    // y se descartaban deliveryDay/scheduledDate, así que la programación nunca
    // llegaba a Firestore.
    const scheduledForNextDay = orderDetails.deliveryDay === 'next';

    const finalOrder: Order = {
      id: nextId,
      timestamp: new Date().toISOString(),
      items: orderDetails.items,
      subtotal: orderDetails.subtotal,
      delivery: orderDetails.delivery,
      shipping: orderDetails.shipping,
      total: orderDetails.total,
      status: scheduledForNextDay ? 'pending_confirmation' : 'pendiente',
      customerName: name,
      customerPhone: phone,
      customerLocation: location || null,
      paymentMethod: paymentMethod || 'Efectivo',
      paymentStatus: paymentStatus || 'pendiente'
    };

    // Se agregan sólo si vienen: Firestore rechaza valores undefined.
    // Desglose del cobro, para reconstruir subtotal - descuentos + envio = total.
    if (typeof orderDetails.qrDiscountAmount === 'number') {
      finalOrder.qrDiscountAmount = orderDetails.qrDiscountAmount;
    }
    if (orderDetails.couponCode) {
      finalOrder.couponCode = orderDetails.couponCode;
      finalOrder.couponPercent = orderDetails.couponPercent ?? 0;
      finalOrder.couponDiscountAmount = orderDetails.couponDiscountAmount ?? 0;
    }
    if (orderDetails.deliveryDay) {
      finalOrder.deliveryDay = orderDetails.deliveryDay;
    }
    if (orderDetails.scheduledDate) {
      finalOrder.scheduledDate = orderDetails.scheduledDate;
    }

    const updatedList = [finalOrder, ...orders];
    setOrders(updatedList);

    const isAdminUser = isAdmin;
    if (!isAdminUser) {
      localStorage.setItem('origenes_orders', JSON.stringify(updatedList));
    }

    try {
      // addDoc genera un ID único del lado de Firestore. Antes se usaba
      // max(id)+1 como nombre de documento, así que dos pedidos simultáneos
      // calculaban el mismo ID y el segundo sobrescribía al primero.
      const created = await addDoc(collection(db, 'orders'), finalOrder);
      // Se compara por identidad de objeto, no por Order.id: ese número puede
      // repetirse entre pedidos.
      setOrders(prev => prev.map(o => (o === finalOrder ? { ...o, docId: created.id } : o)));
      // Guardamos el pedido activo para que el cliente lo siga en vivo.
      try { localStorage.setItem('origenes_active_order_id', created.id); } catch (e) { /* almacenamiento no disponible */ }
      setActiveOrderDocId(created.id);
      playChime();

      fetch('/api/facturador/report-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // docId permite al backend validar el pedido contra Firestore.
        body: JSON.stringify({ order: finalOrder, docId: created.id })
      })
        .then(res => res.json())
        .then(resJson => {
          console.log('[Billing API Info] Venta informada exitosamente:', resJson);
        })
        .catch(e => {
          console.warn('[Billing API Warning] Venta guardada localmente, sincronización externa diferida:', e.message);
        });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `orders/${nextId}`);
    }
  };

  const handleSyncStockWithExternalFacturador = async (): Promise<{ success: boolean; message: string; count: number }> => {
    try {
      const response = await authedFetch('/api/facturador/sync-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productsList: products })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error general de respuesta API (503)' }));
        throw new Error(errorData.error || "Timeout de red.");
      }

      const result = await response.json();
      if (result.success && result.updatedProducts) {
        const updatedList = result.updatedProducts;
        setProducts(updatedList);

        const isAdminUser = isAdmin;
        if (!isAdminUser) {
          localStorage.setItem('origenes_products', JSON.stringify(updatedList));
        } else {
          for (const p of updatedList) {
            const productWithLower = { ...p, name_lower: p.name.trim().toLowerCase() };
            await setDoc(doc(db, 'products', p.id.toString()), productWithLower);
          }
        }

        return {
          success: true,
          message: result.message || 'Sincronización de stock realizada exitosamente.',
          count: result.syncCount || 0
        };
      }

      return {
        success: false,
        message: result.message || 'La API devolvió un estado incorrecto.',
        count: 0
      };
    } catch (err: any) {
      console.warn("[Billing API Resilient Sync] Fallback local activo:", err.message);
      return {
        success: false,
        message: `El facturador no respondió (Código: 503). Se mantendrán los stocks locales. Sincronización en la nube pendiente de reconexión.`,
        count: 0
      };
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getRedirectResult } = await import('firebase/auth');
      try {
        const result = await getRedirectResult(auth);
        if (!cancelled && result?.user) {
          setSignInState('idle');
          setSignInError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error al volver del login de Google: ', err);
          setSignInState('error');
          setSignInError('No pudimos completar el inicio de sesión. Intentá de nuevo.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSignInGoogle = async () => {
    const {
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
    } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();

    setSignInError(null);
    setSignInState('pending');

    try {
      await signInWithPopup(auth, provider);
      setSignInState('idle');
    } catch (err: any) {
      const code = err?.code || '';

      if (code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') {
        setSignInState('idle');
        return;
      }

      const popupUnavailable =
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/web-storage-unsupported' ||
        code === 'auth/internal-error';

      if (popupUnavailable) {
        try {
          setSignInState('redirecting');
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: any) {
          console.error('Error con el login por redirect de Google: ', redirectErr);
          setSignInState('error');
          setSignInError('No pudimos abrir el inicio de sesión de Google. Revisá tu conexión e intentá de nuevo.');
          return;
        }
      }

      console.error('Error con el login de Google: ', err);
      setSignInState('error');
      setSignInError('No se pudo iniciar sesión con Google. Intentá de nuevo en un momento.');
    }
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Error signing out: ", err);
    }
  };

  return (
    // domAnimation trae solo las features de animacion DOM; asi el runtime
    // completo de motion sale del chunk inicial de la tienda.
    <LazyMotion features={domAnimation}>
    <div className="w-full h-screen overflow-hidden flex items-center justify-center bg-slate-300">
      <div className="w-full max-w-[430px] h-full sm:h-[92vh] sm:rounded-[36px] bg-white sm:border-[8px] sm:border-slate-900 shadow-2xl relative overflow-hidden flex flex-col sm:my-4">

        {showOnboarding && view === 'storefront' && (
          <Onboarding onDone={dismissOnboarding} />
        )}

        {view === 'storefront' ? (
          <Storefront
            products={products}
            productsStatus={productsStatus}
            orders={orders}
            onPlaceOrder={handlePlaceOrder}
            openAdminPanel={() => setView('admin')}
            onUpdateProduct={handleUpdateProduct}
            onAddProduct={handleAddProduct}
            onDeleteProduct={handleDeleteProduct}
            currentUser={currentUser}
            banners={banners}
            onSignInGoogle={handleSignInGoogle}
            signInState={signInState}
            signInError={signInError}
            onSignOut={handleSignOut}
            deliveryZones={deliveryZones}
            combos={combos}
            isAdmin={isAdmin}
            onDbCategoryChange={setDbCategory}
            hasMoreProducts={hasMore}
            loadMoreProducts={loadMoreProducts}
            deliveryCutoffHour={deliveryCutoffHour}
          />
        ) : (
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400 text-xs font-bold">
              Cargando panel…
            </div>
          }>
          <AdminPanel
            products={products}
            orders={orders}
            onUpdateProduct={handleUpdateProduct}
            onAddProduct={handleAddProduct}
            onDeleteProduct={handleDeleteProduct}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onBulkImportProducts={handleBulkImportProducts}
            goBackToStore={() => setView('storefront')}
            newOrderToast={newOrderToast}
            onDismissNewOrderToast={() => setNewOrderToast(null)}
            currentUser={currentUser}
            onSignInGoogle={handleSignInGoogle}
            signInState={signInState}
            signInError={signInError}
            onSignOut={handleSignOut}
            banners={banners}
            onSaveBanner={handleSaveBanner}
            onDeleteBanner={handleDeleteBanner}
            onSyncStockWithExternalFacturador={handleSyncStockWithExternalFacturador}
            deliveryZones={deliveryZones}
            combos={combos}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            onDbCategoryChange={setDbCategory}
            hasMore={hasMore}
            loadMoreProducts={loadMoreProducts}
            productsStatus={productsStatus}
            deliveryCutoffHour={deliveryCutoffHour}
            onUpdateDeliveryCutoffHour={handleUpdateDeliveryCutoffHour}
          />
          </Suspense>
        )}

        <div className="hidden sm:block absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-950 rounded-full z-30 opacity-70 pointer-events-none" />
      </div>
    </div>
    </LazyMotion>
  );
}
