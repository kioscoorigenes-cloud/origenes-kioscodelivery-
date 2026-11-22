import React, { memo } from 'react';
import type { Product } from '../types';
import { CAT_ABBR, CAT_BG, getFallbackStoreImage } from '../data';

interface ProductRowProps {
  product: Product;
  qtyInCart: number;
  isAdminMode: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: number | string) => void;
  onAddToCart: (id: number | string) => void;
  onChangeQty: (id: number | string, delta: number) => void;
  onClick: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
  style?: React.CSSProperties;
}

/** Fila de producto extraída de Storefront — usada tanto en la lista normal como en la virtualizada */
export const ProductRow = memo<ProductRowProps>(({
  product: p,
  qtyInCart,
  isAdminMode,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
  onChangeQty,
  onClick,
  onEdit,
  onDelete,
  style,
}) => {
  const ok = p.inStock;

  return (
    <div
      style={style}
      onClick={() => onClick(p)}
      className={`flex items-center gap-3.5 p-3 hover:bg-slate-50/50 cursor-pointer transition-colors relative border-b border-slate-100 ${
        !ok ? 'opacity-80 bg-slate-50/30' : ''
      }`}
    >
      {/* Thumbnail */}
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
            loading="lazy"
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

      {/* Info */}
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-1.5">
          <h4 className="text-sm font-bold text-slate-800 leading-tight truncate">{p.name}</h4>
          {!isAdminMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(p.id); }}
              className="w-11 h-11 -m-2.5 flex items-center justify-center text-slate-500 hover:text-blue-500 active:scale-95 transition-all shrink-0 cursor-pointer"
              aria-label={isFavorite ? `Sacar ${p.name} de favoritos` : `Guardar ${p.name} en favoritos`}
            >
              {isFavorite ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-blue-500"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              )}
            </button>
          )}
        </div>
        {p.brand && (
          <p className="text-[11px] text-slate-500 truncate leading-tight">{p.brand}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-sm font-extrabold text-slate-950">${p.price.toLocaleString('es-AR')}</span>
          {p.orig > p.price && (
            <span className="text-[10px] text-slate-400 line-through">${p.orig.toLocaleString('es-AR')}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center shrink-0">
        {isAdminMode ? (
          <div className="flex gap-1">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                className="p-1.5 bg-blue-100 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-200 transition-colors"
                title="Editar producto"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                className="p-1.5 bg-blue-100 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-200 transition-colors"
                title="Eliminar producto"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            )}
          </div>
        ) : !ok ? (
          <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
            Sin Stock
          </span>
        ) : qtyInCart > 0 ? (
          <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full p-0.5 shadow-sm">
            <button
              onClick={(e) => { e.stopPropagation(); onChangeQty(p.id, -1); }}
              className="w-6.5 h-6.5 bg-white rounded-full text-blue-600 flex items-center justify-center font-black active:bg-blue-100 hover:shadow-inner text-sm border border-slate-100"
            >
              −
            </button>
            <span className="text-xs font-extrabold text-slate-800 w-5 text-center">
              {qtyInCart}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onChangeQty(p.id, 1); }}
              className="w-6.5 h-6.5 bg-white rounded-full text-blue-600 flex items-center justify-center font-black active:bg-blue-100 hover:shadow-inner text-sm border border-slate-100"
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAddToCart(p.id); }}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-4 py-1.5 text-xs font-black shadow transition-all hover:scale-103 active:scale-97"
          >
            Agregar
          </button>
        )}
      </div>
    </div>
  );
});

ProductRow.displayName = 'ProductRow';
