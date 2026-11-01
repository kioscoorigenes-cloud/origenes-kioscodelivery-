export interface Product {
  id: number;
  cat: string;
  name: string;
  name_lower?: string;
  brand: string;
  price: number;
  orig: number | null;
  desc: string;
  inStock: boolean;
  featured?: boolean;
  neww?: boolean;
  image?: string;
  codigoFacturador?: string;
  /** Código de barras EAN/UPC leído con escáner o cámara */
  barcode?: string;
  /** SKU interno para control de inventario */
  sku?: string;
  /** Cantidad en stock (unidades disponibles) */
  stockQty?: number;
  /** ID del impuesto asignado en StarPOS */
  taxId?: number;
  /** Porcentaje de impuesto (ej. 21 para IVA 21%) */
  taxPct?: number;
}

export interface OrderItem {
  id: number;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  /**
   * ID del documento de Firestore. Lo asigna addDoc al crear el pedido, así dos
   * pedidos simultáneos no se pisan. No se persiste dentro del documento: se
   * completa al leer, desde snapshot.id.
   */
  docId?: string;
  /** Número de pedido visible para el cliente (correlativo, solo presentación). */
  id: number;
  timestamp: string;
  items: OrderItem[];
  subtotal: number;
  delivery: 'retiro' | 'envio';
  shipping: number;
  total: number;
  status: 'pending_confirmation' | 'pendiente' | 'confirmado' | 'en_preparacion' | 'en_camino' | 'listo' | 'entregado' | 'cancelado';
  customerName?: string;
  customerPhone?: string;
  customerLocation?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  /**
   * Desglose del cobro, para que el pedido sea reconstruible:
   * subtotal - qrDiscountAmount - couponDiscountAmount + shipping = total.
   * `shipping` guarda el envio efectivamente cobrado (0 si fue gratis).
   */
  qrDiscountAmount?: number;
  couponCode?: string;
  couponPercent?: number;
  couponDiscountAmount?: number;
  deliveryDay?: 'same' | 'next';
  scheduledDate?: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Combo {
  id: string;
  name: string;
  label: string;
  items: string;
  price: number;
  orig: number;
  saving: number;
  image?: string;
  /** Si es false, el combo no se muestra en la tienda. */
  active?: boolean;
}

export interface Promo {
  title: string;
  desc: string;
  badge: string;
  color: string;
}

export interface PromoBanner {
  id: string;
  text: string;
  isActive: boolean;
  color?: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  km: number;
  price: number;
}

export interface BillingConfig {
  apiUrl: string;
  apiKey: string;
}

// CQ-02: Tipos para reducir uso de `any`

/** Registro de administrador leído de Firestore (collection 'admins') */
export interface AdminRecord {
  id: string;
  email?: string;
  role: 'super' | 'admin';
  addedBy?: string;
  addedAt?: string;
}

/** Invitación de admin leída de Firestore (collection 'admin_invites') */
export interface AdminInvite {
  id: string;
  email?: string;
  role: 'super' | 'admin';
  addedBy?: string;
  addedAt?: string;
}

/** Línea de ticket de venta StarPOS importada */
export interface ImportedTicketLine {
  product_name: string;
  qty: number;
  price: number;
}

/** Venta StarPOS importada (collection 'starpos_imported_sales') */
export interface ImportedSale {
  id: string;
  ticket_number: string;
  timestamp: string;
  importedAt: string;
  total: number;
  ticket_lines?: ImportedTicketLine[];
}

/** Tipo mínimo del usuario Firebase usado en props de componentes */
export interface AppUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

