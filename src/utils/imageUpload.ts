// Procesamiento y subida de fotos del catálogo (productos y combos).

// Imagen lista para dibujar en un canvas.
type DrawableImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close: () => void;
};

// Decodifica el archivo. Intenta createImageBitmap y, si el navegador no
// soporta el formato, cae a cargarlo vía <img> (cubre más formatos de celular).
async function decodeImage(file: File): Promise<DrawableImage> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width, height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      close: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Formato de imagen no soportado'));
        el.src = url;
      });
      return {
        width: img.naturalWidth, height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        close: () => URL.revokeObjectURL(url),
      };
    } catch (err) { URL.revokeObjectURL(url); throw err; }
  }
}

async function encodeJpeg(src: DrawableImage, maxDim: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  src.draw(ctx, w, h);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('No se pudo comprimir la imagen');
  return blob;
}

// Comprime bajando tamaño/calidad en pasos hasta entrar bajo maxBytes.
export async function compressImageForUpload(file: File, opts: { maxBytes?: number } = {}): Promise<Blob> {
  const maxBytes = opts.maxBytes ?? 600 * 1024;
  const img = await decodeImage(file);
  try {
    const passes: Array<[number, number]> = [
      [1000, 0.82], [900, 0.74], [800, 0.66], [680, 0.58], [560, 0.48], [460, 0.4],
    ];
    let smallest: Blob | null = null;
    for (const [dim, q] of passes) {
      const blob = await encodeJpeg(img, dim, q);
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= maxBytes) return blob;
    }
    if (!smallest) throw new Error('No se pudo comprimir la imagen');
    return smallest;
  } finally { img.close(); }
}

// Red de seguridad: rechaza una promesa si tarda más de `ms`.
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'La subida tardó demasiado'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

// --- Subida de fotos a Supabase Storage (clave pública, va en el cliente) ---
const SUPABASE_URL = 'https://gajoyervuzjgmtepmbxe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AYunFX4_vbVmmeHrJ8y6bA_nUdQnoDG';
const SUPABASE_BUCKET = 'fotos';

export async function uploadToSupabase(blob: Blob, folder: string): Promise<string> {
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': blob.type || 'image/jpeg',
      'Cache-Control': 'max-age=31536000',
    },
    body: blob,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text().catch(() => '')}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;
}
