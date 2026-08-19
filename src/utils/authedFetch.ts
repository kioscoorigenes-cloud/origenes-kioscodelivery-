import { auth } from '../firebase';

/**
 * fetch() for the admin-only /api/* routes.
 *
 * Attaches the current Firebase user's ID token as a Bearer header, which the
 * server verifies in requireAdmin (src/services/serverAuth.ts). Tokens are
 * short-lived; the SDK refreshes them automatically on getIdToken().
 *
 * Public endpoints (e.g. /api/facturador/report-sale, called by customers) keep
 * using plain fetch.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Necesitás iniciar sesión como administrador para realizar esta acción.');
  }

  const token = await user.getIdToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
