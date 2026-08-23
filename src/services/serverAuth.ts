import type { Request, Response, NextFunction } from 'express';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestoreInstance } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Mirrors BOOTSTRAP_ADMIN_EMAILS in src/hooks/useAdmin.ts and the isAdmin()
// helper in firestore.rules. Kept local so the server never imports the client SDK.
const BOOTSTRAP_ADMIN_EMAILS = [
  'cam01back@gmail.com',
  'juanpcolinagonzalez@gmail.com',
  'kiosco.origenes@gmail.com',
  'olimpopiquet2019@gmail.com'
];

function getAdminApp() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const apps = getAdminApps();
    if (apps.length > 0) return apps[0];
    return initAdminApp({ credential: cert(JSON.parse(raw)) });
  } catch (e) {
    console.error('[Auth] No se pudo inicializar firebase-admin:', e);
    return null;
  }
}

/**
 * Firestore accesible con el Admin SDK: ignora las reglas de seguridad, que
 * estan pensadas para clientes. Devuelve null si no hay service account, para
 * que quien llame pueda degradar de forma controlada.
 */
export function getAdminFirestore() {
  const app = getAdminApp();
  if (!app) return null;
  return getAdminFirestoreInstance(app, firebaseConfig.firestoreDatabaseId);
}

export interface AuthedRequest extends Request {
  admin?: { uid: string; email: string | null };
}

/**
 * Express middleware: only lets the request through for a verified Firebase
 * user that is an administrator.
 *
 * Admin = a document in /admins/{uid}, or one of the bootstrap emails with a
 * verified address — the same test firestore.rules applies.
 *
 * Without FIREBASE_SERVICE_ACCOUNT_JSON the token cannot be verified, so every
 * protected route is refused. That is deliberate: failing closed is the safe
 * default for an unconfigured deploy.
 */
export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const app = getAdminApp();
  if (!app) {
    return res.status(503).json({
      error: 'Autorización no disponible: falta configurar FIREBASE_SERVICE_ACCOUNT_JSON en el servidor.'
    });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Falta el token de sesión. Iniciá sesión como administrador.' });
  }

  try {
    const decoded = await getAdminAuth(app).verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase();

    const isBootstrapAdmin = decoded.email_verified === true && BOOTSTRAP_ADMIN_EMAILS.includes(email);

    let hasAdminDoc = false;
    if (!isBootstrapAdmin) {
      const db = getAdminFirestoreInstance(app, firebaseConfig.firestoreDatabaseId);
      const snap = await db.collection('admins').doc(decoded.uid).get();
      hasAdminDoc = snap.exists;
    }

    if (!isBootstrapAdmin && !hasAdminDoc) {
      return res.status(403).json({ error: 'Tu cuenta no tiene permisos de administrador.' });
    }

    req.admin = { uid: decoded.uid, email: decoded.email || null };
    return next();
  } catch (err: any) {
    console.warn('[Auth] Token rechazado:', err?.message || err);
    return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a iniciar sesión.' });
  }
}
