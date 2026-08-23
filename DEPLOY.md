# Guía de deploy — Orígenes Kiosco y Delivery

Runbook para pasar la app a producción con las cuentas del cliente.
Leer completo antes de subir nada.

## 0. ⚠️ Antes de cualquier `git push` — ROTAR SECRETOS

Durante el desarrollo, el service account **real** de Firebase (y otras claves)
estuvo en archivos y capturas. Hay que tratarlas como **comprometidas**:

1. **Firebase / GCP** → Consola → IAM → Cuentas de servicio → `firebase-adminsdk-fbsvc@psychic-linker-463916-h6` → **Claves** → borrar la clave `3dfc61ba...` y **generar una nueva**.
2. **Gemini** → generar una API key nueva y real (formato `AIza...`, no el token `AQ.` de AI Studio, que es efímero).
3. **StarPOS** → usar credenciales reales del kiosco (las que había, `1234`/`10`, son de prueba).

Las claves nuevas se cargan **solo como variables de entorno del host** (paso 3),
nunca en el repo. El `.env.example` ya quedó **solo con placeholders**.

## 1. Elegir el host (NO Vercel plano)

La app es un **servidor Express de proceso largo** (`server.ts`, `app.listen`)
que sirve el front y las `/api/*`. Necesita un host de **proceso persistente**:
**Railway, Render, Fly.io o Cloud Run**. Vercel serverless **no** sirve tal cual
(habría que refactorizar). Recomendado: **Railway** (o Render).

## 2. Definir la titularidad del proyecto Firebase/GCP

Hoy todo apunta a un proyecto autogenerado por AI Studio
(`psychic-linker-463916-h6`, base Firestore `ai-studio-b0577a6e-...`).
Decidir con el cliente: **transferirle ese proyecto GCP** o **migrar a uno propio**.
Si se migra: actualizar `firebase-applet-config.json`, generar un service account
nuevo y volver a desplegar reglas.

## 3. Variables de entorno en el host

Cargar en el panel del host (Railway/Render → Variables):

| Variable | Qué es |
|---|---|
| `NODE_ENV` | **`production`** (obligatorio: sin esto el server arranca en modo dev de Vite) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON del service account **nuevo**, en una línea, comillas simples |
| `GEMINI_API_KEY` | API key real de Gemini (`AIza...`) |
| `STARPOS_USER_ID` / `STARPOS_SECRET` / `STARPOS_SERVICE_URL` | credenciales reales del kiosco |
| `PORT` | lo inyecta el host solo; el server ya lo lee (`process.env.PORT`) |

## 4. Desplegar las reglas de Firestore — ANTES del front

Ya se agregaron `firebase.json` y `.firebaserc` apuntando a la base con nombre.

```bash
firebase login
firebase deploy --only firestore:rules
```

Verificar en la **consola de Firebase → Firestore → Reglas**, sobre la base
`ai-studio-b0577a6e-...`, que aparezca el nuevo `allow get` en `/orders`
(si no, el seguimiento en vivo del cliente da *permission-denied*).

## 5. Subir el código y publicar

1. Repo en la **GitHub del cliente** (con el `.env.example` ya saneado y el `.env` **fuera** de git).
2. Conectar el repo al host. Build & start:
   ```
   npm install
   npm run build
   npm start        # node dist/server.cjs
   ```
3. Autorizar el **dominio del deploy** en Firebase → Authentication → Settings → Dominios autorizados (para el login de Google del panel).

## 6. Probar en producción

- Tienda carga, se arma un pedido y **se confirma dentro de la app** (sin WhatsApp).
- Desde el panel, cambiar el estado (Recibido → En preparación → En camino/Listo → Entregado) y ver que la **barra del cliente avanza en vivo**.
- Envío gratis y el 10% de QR (excluyente con cupón) andan.
- Instalar la PWA en el celular y en la compu (panel).

## 7. Pendiente antes de manejar plata / StarPOS reales

- **StarPOS en vivo:** hay bugs a corregir antes de cablear el StarPOS real (doble descuento de stock, validar la forma del ticket, oferta de precio invertida, IVA fijo al 21%). Ver el informe de auditoría.
- **Antes de cobros automáticos:** validar el total del pedido del lado del servidor (hoy se calcula en el cliente) y usar marca de tiempo del servidor para el "primer pedido del día".
