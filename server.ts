// Primero de todo: carga el .env antes de que cualquier modulo lea process.env.
import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";

import { aiRoutes } from "./src/routes/ai";
import { facturadorRoutes } from "./src/routes/facturador";
import { storeRoutes } from "./src/routes/store";
import { starposRoutes } from "./src/routes/starpos";

// Initialize Firebase App SDK
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  // Railway / Render / Fly inyectan el puerto por entorno; 3000 en local.
  const PORT = Number(process.env.PORT) || 3000;

  // ── Seguridad y performance ─────────────────────────────────────────
  const SUPABASE_ORIGIN = 'https://gajoyervuzjgmtepmbxe.supabase.co';

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://apis.google.com', 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        // Supabase sirve las fotos del catalogo: sin su origen no se ven.
        imgSrc: ["'self'", 'data:', 'blob:', SUPABASE_ORIGIN, 'https://images.unsplash.com', 'https://firebasestorage.googleapis.com', 'https://lh3.googleusercontent.com'],
        // Supabase (subida de fotos) + Firebase Auth/Firestore.
        connectSrc: ["'self'", SUPABASE_ORIGIN, 'https://*.googleapis.com', 'https://*.firebaseio.com', 'https://securetoken.googleapis.com', 'https://identitytoolkit.googleapis.com'],
        // El login de Google abre un iframe de accounts.google.com.
        frameSrc: ["'self'", 'https://accounts.google.com', 'https://*.firebaseapp.com'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    // 'same-origin' (default de helmet) rompe signInWithPopup de Google.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    // Las fotos vienen de Supabase: COEP estricto las bloquearia.
    crossOriginEmbedderPolicy: false,
  }));

  // CORS solo sobre /api/*: los assets estaticos no lo necesitan, y aplicarlo
  // globalmente hacia que cualquier Origin no listado recibiera un 500 en TODO
  // el sitio (CSS, JS, index), no solo en la API.
  const allowedOrigins = [
    process.env.APP_URL || 'https://origenes-kioscodelivery-production.up.railway.app',
    'http://localhost:3000',
  ].filter(Boolean);
  app.use('/api/', cors({
    origin: (origin, callback) => {
      // Sin origin = same-origin, curl o la app nativa.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      // false, no throw: se niegan los headers CORS y el navegador bloquea,
      // en vez de devolver un 500 del servidor.
      return callback(null, false);
    },
    credentials: true,
  }));

  app.use(compression());

  // Techo global por IP sobre /api/*; los limitadores por ruta siguen vigentes.
  app.use('/api/', rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' },
  }));

  app.use(express.json({ limit: '20mb' }));

  // ── Health check (Railway, uptime monitors, etc.) ──────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Rutas por dominio ───────────────────────────────────────────────
  app.use('/api/ai', aiRoutes());
  app.use('/api/facturador', facturadorRoutes());
  app.use('/api/store', storeRoutes());
  app.use('/api/starpos', starposRoutes({ firestoreDb }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // dotfiles 'allow': sin esto /.well-known/assetlinks.json da 404 y falla
    // la verificacion del TWA en Google Play.
    app.use(express.static(distPath, { dotfiles: 'allow' }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
