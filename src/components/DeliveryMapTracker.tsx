// Selector de zona de entrega.
//
// Este componente tenía además una integración con Google Maps (mapa, búsqueda
// de direcciones con Places, ruteo con DirectionsService y geocodificación
// inversa) que estaba desactivada de forma permanente por una constante
// `hasValidKey = false` sin API key: código inalcanzable. Se eliminó junto con
// la dependencia @vis.gl/react-google-maps. La selección de zona es la única
// vía real de cálculo de envío.

interface DeliveryMapProps {
  onCalculateShipping: (info: {
    distanceKm: number;
    durationMins: number;
    fee: number;
    address: string;
    coords?: { lat: number; lng: number };
  }) => void;
  selectedZoneLabel?: string;
  dynamicShippingCost?: number;
}

const ZONES = [
  { label: 'Zona 1 — Hasta 2 km (Río Pipo y alrededores)', fee: 800, dist: 1.5 },
  { label: 'Zona 2 — Entre 2 y 4 km (La Frontera / Glaciar)', fee: 1200, dist: 3 },
  { label: 'Zona 3 — Entre 4 y 6 km (Sarmiento / Bahía Golondrina)', fee: 1800, dist: 5 },
  { label: 'Zona 4 — Más de 6 km (Centro y Costa)', fee: 2500, dist: 7 },
];

export function DeliveryMapTracker({ onCalculateShipping, selectedZoneLabel, dynamicShippingCost }: DeliveryMapProps) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-left">
      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
        📍 Seleccioná tu zona de entrega
      </p>
      <div className="grid grid-cols-1 gap-2">
        {ZONES.map(z => {
          const isSelected = selectedZoneLabel === z.label || (!selectedZoneLabel && dynamicShippingCost === z.fee);
          return (
            <button
              type="button"
              key={z.label}
              onClick={() => onCalculateShipping({ distanceKm: z.dist, durationMins: Math.round(z.dist * 4), fee: z.fee, address: z.label })}
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
      <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
        Selecciona la zona correspondiente para calcular el costo de envío a tu domicilio.
      </p>
    </div>
  );
}
