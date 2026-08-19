import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Search, ShoppingCart, PackageCheck, ChevronRight } from 'lucide-react';

// Onboarding a pantalla completa, estilo Rappi/PedidosYa.
// Se muestra solo la primera vez (la marca en localStorage la gestiona App.tsx)
// y siempre se puede saltar. Enfocado en CÓMO usar la app: buscar, sumar al carrito, recibir.

interface OnboardingProps {
  onDone: () => void;
}

// Paleta "Azul Austral": azure / primary / azul profundo sobre celeste.
const SLIDES = [
  {
    icon: Search,
    accent: '#3B82F6',
    tint: '#EAF1FE',
    eyebrow: 'Paso 1',
    title: 'Encontrá lo que buscás',
    body: 'Usá el buscador o tocá una categoría para ver todo el kiosco. Más de mil productos a un toque.',
  },
  {
    icon: ShoppingCart,
    accent: '#2563EB',
    tint: '#EAF1FE',
    eyebrow: 'Paso 2',
    title: 'Sumá a tu carrito',
    body: 'Tocá el botón + en cada producto. Ajustá las cantidades y revisá tu pedido cuando quieras.',
  },
  {
    icon: PackageCheck,
    accent: '#1B3F9E',
    tint: '#EAF1FE',
    eyebrow: 'Paso 3',
    title: 'Retiralo o te lo llevamos',
    body: 'Elegí retiro en el local sin fila, o envío a domicilio con Pedidos Va 🛵. Confirmás y listo.',
  },
];

export default function Onboarding({ onDone }: OnboardingProps) {
  const [idx, setIdx] = useState(0);
  const isLast = idx === SLIDES.length - 1;
  const slide = SLIDES[idx];
  const Icon = slide.icon;

  const next = () => {
    if (isLast) onDone();
    else setIdx((i) => i + 1);
  };

  return (
    <div className="absolute inset-0 z-[100] bg-white flex flex-col">
      {/* Saltar */}
      <div className="flex justify-end p-4 shrink-0">
        <button
          onClick={onDone}
          className="text-[13px] font-bold text-slate-400 hover:text-slate-600 px-3 py-1.5 transition-colors"
        >
          Saltar
        </button>
      </div>

      {/* Contenido del slide */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <AnimatePresence mode="wait">
          <m.div
            key={idx}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="flex flex-col items-center"
          >
            <div
              className="w-28 h-28 rounded-3xl flex items-center justify-center mb-8 shadow-sm"
              style={{ backgroundColor: slide.tint }}
            >
              <Icon size={52} strokeWidth={2} style={{ color: slide.accent }} />
            </div>

            <span
              className="text-[11px] font-black uppercase tracking-[0.2em] mb-3"
              style={{ color: slide.accent }}
            >
              {slide.eyebrow}
            </span>
            <h2 className="text-[22px] font-extrabold text-slate-800 leading-tight mb-3 max-w-[280px]">
              {slide.title}
            </h2>
            <p className="text-[13.5px] text-slate-500 font-medium leading-relaxed max-w-[290px]">
              {slide.body}
            </p>
          </m.div>
        </AnimatePresence>
      </div>

      {/* Footer: dots + botón */}
      <div className="shrink-0 px-8 pb-10 pt-4">
        <div className="flex justify-center gap-2 mb-6">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Ir al paso ${i + 1}`}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === idx ? 24 : 8,
                backgroundColor: i === idx ? slide.accent : '#E2E8F0',
              }}
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-full text-white font-extrabold text-[15px] py-4 rounded-2xl shadow-md active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5"
          style={{ backgroundColor: slide.accent }}
        >
          {isLast ? 'Empezar a pedir' : 'Siguiente'}
          {!isLast && <ChevronRight size={18} strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}
