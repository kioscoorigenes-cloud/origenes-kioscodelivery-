import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, RotateCcw } from 'lucide-react';
import { m } from 'motion/react';
import type { Product, Order, AppUser } from '../types';
import { orderStatusLabel } from '../utils/orderStatus';

/** Firestore Timestamp o cualquier valor que pueda representar una fecha */
type TimestampLike = string | number | Date | { seconds: number } | { _seconds: number } | { toDate: () => Date } | null | undefined;

const parseOrderDate = (timestamp: TimestampLike): Date => {
  if (!timestamp) return new Date();
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (typeof timestamp === 'number') return new Date(timestamp);
  if (timestamp instanceof Date) return timestamp;
  const ts = timestamp as Record<string, unknown>;
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  if (typeof ts._seconds === 'number') return new Date(ts._seconds * 1000);
  if (typeof ts.toDate === 'function') return (ts as { toDate: () => Date }).toDate();
  return new Date();
};

const STATUS_COLOR: Record<string, string> = {
  pending_confirmation: 'bg-yellow-100 text-yellow-800',
  pendiente: 'bg-yellow-100 text-yellow-800',
  confirmado: 'bg-blue-100 text-blue-800',
  en_preparacion: 'bg-orange-100 text-orange-800',
  en_camino: 'bg-purple-100 text-purple-800',
  listo: 'bg-green-100 text-green-800',
  entregado: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
};

interface PedidosTabProps {
  orders: Order[];
  products: Product[];
  currentUser?: AppUser | null;
  addToCart: (id: number | string, qty?: number) => void;
}

export const PedidosTab = memo<PedidosTabProps>(({ orders, products, currentUser, addToCart }) => {
  const navigate = useNavigate();

  const savedPhone = (() => { try { return localStorage.getItem('origenes_last_phone') ?? ''; } catch { return ''; } })();
  const myOrders = orders
    .filter(o => {
      if (!savedPhone && !currentUser) return false;
      if (savedPhone && o.customerPhone === savedPhone) return true;
      return false;
    })
    .sort((a, b) => parseOrderDate(b.timestamp).getTime() - parseOrderDate(a.timestamp).getTime());

  if (!savedPhone && !currentUser) {
    return (
      <m.div key="pedidos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-3 flex flex-col gap-3">
        <h3 className="text-base font-extrabold text-slate-800 px-1 leading-none flex items-center gap-1.5">
          <ClipboardList className="text-blue-600" size={17} /> Mis pedidos
        </h3>
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <ClipboardList size={48} className="text-slate-300" />
          <p className="text-sm text-slate-500 max-w-[260px]">
            Hacé un pedido para ver tu historial acá. Usamos tu teléfono para identificar tus pedidos.
          </p>
        </div>
      </m.div>
    );
  }

  if (myOrders.length === 0) {
    return (
      <m.div key="pedidos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-3 flex flex-col gap-3">
        <h3 className="text-base font-extrabold text-slate-800 px-1 leading-none flex items-center gap-1.5">
          <ClipboardList className="text-blue-600" size={17} /> Mis pedidos
        </h3>
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <ClipboardList size={48} className="text-slate-300" />
          <p className="text-sm text-slate-500 max-w-[260px]">
            Todavía no tenés pedidos. ¡Hacé tu primer pedido!
          </p>
          <button
            type="button"
            onClick={() => navigate('/catalog')}
            className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
          >
            Ver catálogo
          </button>
        </div>
      </m.div>
    );
  }

  return (
    <m.div key="pedidos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-3 flex flex-col gap-3">
      <h3 className="text-base font-extrabold text-slate-800 px-1 leading-none flex items-center gap-1.5">
        <ClipboardList className="text-blue-600" size={17} /> Mis pedidos
      </h3>
      <div className="flex flex-col gap-2.5">
        {myOrders.map(order => {
          const date = parseOrderDate(order.timestamp);
          const dateStr = date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
          const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

          return (
            <div key={order.docId || order.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">Pedido #{order.id}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {orderStatusLabel(order.status)}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">{dateStr} {timeStr}</span>
              </div>

              <div className="text-xs text-slate-600 mb-2">
                {order.items.slice(0, 3).map((item, i) => (
                  <span key={i}>
                    {i > 0 && ' · '}
                    {item.qty}x {item.name}
                  </span>
                ))}
                {order.items.length > 3 && (
                  <span className="text-slate-400"> +{order.items.length - 3} más</span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">
                  ${order.total.toLocaleString('es-AR')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    for (const item of order.items) {
                      const product = products.find(p => p.name === item.name || p.id === item.id);
                      if (product) addToCart(product.id, item.qty);
                    }
                    navigate('/cart');
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                >
                  <RotateCcw size={13} />
                  Repetir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </m.div>
  );
});

PedidosTab.displayName = 'PedidosTab';
