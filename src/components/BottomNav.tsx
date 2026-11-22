import React, { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShoppingBag, Search, Star, Clock, ClipboardList, ShoppingCart
} from 'lucide-react';

export type TabId = 'home' | 'catalog' | 'promos' | 'combos' | 'pedidos' | 'cart';

const TAB_CONFIG: { id: TabId; path: string; label: string; Icon: React.FC<{ size: number }> }[] = [
  { id: 'home',    path: '/',        label: 'Inicio',   Icon: ShoppingBag },
  { id: 'catalog', path: '/catalog', label: 'Catálogo', Icon: Search },
  { id: 'promos',  path: '/promos',  label: 'Ofertas',  Icon: Star },
  { id: 'combos',  path: '/combos',  label: 'Combos',   Icon: Clock },
  { id: 'pedidos', path: '/pedidos', label: 'Pedidos',  Icon: ClipboardList },
  { id: 'cart',    path: '/cart',    label: 'Carrito',  Icon: ShoppingCart },
];

/** Mapea hash path a TabId */
export function pathToTab(pathname: string): TabId {
  const map: Record<string, TabId> = {
    '/': 'home',
    '/catalog': 'catalog',
    '/promos': 'promos',
    '/combos': 'combos',
    '/pedidos': 'pedidos',
    '/cart': 'cart',
  };
  return map[pathname] || 'home';
}

export function tabToPath(tab: TabId): string {
  return TAB_CONFIG.find(t => t.id === tab)?.path ?? '/';
}

interface BottomNavProps {
  totalItems: number;
}

export const BottomNav = memo<BottomNavProps>(({ totalItems }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = pathToTab(location.pathname);

  const navItemClass = (tab: TabId) => {
    const active = currentTab === tab;
    return `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-all cursor-pointer active:scale-95 touch-manipulation select-none ${
      active ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-600'
    }`;
  };

  return (
    <nav className="bnav border-t border-slate-200 bg-white fixed bottom-0 inset-x-0 h-16 flex items-center z-10 shadow-lg select-none">
      {TAB_CONFIG.map(({ id, path, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => navigate(path)}
          aria-current={currentTab === id ? 'page' : undefined}
          aria-label={id === 'cart' && totalItems > 0 ? `Carrito, ${totalItems} ${totalItems === 1 ? 'producto' : 'productos'}` : undefined}
          className={navItemClass(id)}
        >
          {id === 'cart' ? (
            <span className="relative">
              <Icon size={20} />
              {totalItems > 0 && (
                <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </span>
          ) : (
            <Icon size={20} />
          )}
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';
