# StarPOS — estado, arreglos y cómo probarlo

Basado en la especificación oficial de la API de StarPOS (v1.3).

## Cómo funciona la integración (flujo real)

StarPOS es un POS **local** (los ejemplos de la API son `http://localhost/v1/...`), así que
para que un servidor en la nube lo alcance hay que exponerlo con una **URL estable**
(Cloudflare Tunnel, ngrok pago con dominio fijo, o IP/puerto fijo). El ngrok **gratis**
que estaba configurado es temporal y ya está muerto.

El flujo correcto es:

1. **Empujar el catálogo** a StarPOS: `POST /v1/Taxes`, `/v1/PriceList`, `/v1/Categories`, `/v1/Families`, `/v1/Brands`, `/v1/Products`, `/v1/PaymentMethods`, `/v1/Plans`.
2. **Traer las ventas**: `GET /v1/Tickets` → por cada línea se descuenta el stock del producto en la app.
3. **Traer los cierres de caja**: `GET /v1/ClosedCash`.

> ⚠️ **No existe** un endpoint de "stock actual" (`/v1/CurrentStock`) en la API oficial.
> El inventario se mantiene **descontando desde los tickets**, no leyendo un stock directo.

## Qué se arregló (según la doc real)

- **La cantidad vendida es `units`, no `qty`.** Este era el bug que hacía que la sincronización de ventas **no descontara nada**. Corregido.
- **Doble descuento de stock:** ahora el estado se persiste tras *cada* ticket, así un ticket que falle no hace que se reprocesen los ya descontados.
- **Tickets con forma inválida** se saltean y loguean, en vez de romper toda la corrida.
- **Stock inventado:** ya no se asume una base ficticia de 15 unidades; si no se conoce el stock real, no se descuenta (y se avisa).
- **Oferta de precio invertida:** la oferta activa ahora usa el precio promocional (más bajo), no el original.
- **Timeout (10s)** en las llamadas y **reintento de token** ante 401/403.
- **Diagnóstico honesto:** ahora confirma que llegó el `access_token`, no solo un HTTP 200.
- **No auto-crea productos** desde el stock (evita basura a $0 en el catálogo).

## Pendiente (decisión de negocio)

- **IVA por producto:** hoy todos los productos se envían con **IVA 21%** fijo. En un kiosco muchos ítems son 10,5% o exentos. Para facturación correcta hay que agregar una **categoría fiscal por producto** (campo en el catálogo). Queda anotado.

## Cómo probar StarPOS en vivo (cuando tengas el endpoint real)

1. Conseguí del cliente/StarPOS: la **URL estable** del StarPOS, el **user_id** y el **secret** reales.
2. Cargá esas credenciales (env `STARPOS_USER_ID`, `STARPOS_SECRET`, `STARPOS_SERVICE_URL`, o desde el panel super-admin).
3. En el panel → **StarPOS → Diagnóstico**: tiene que decir que autenticó (token recibido).
4. **Sincronizar catálogo** (empuja tus productos a StarPOS) y revisá los logs paso a paso.
5. Hacé **una venta de prueba** en el POS de un producto que tengas con stock cargado en la app.
6. **Sincronizar ventas**: verificá en los logs que descuenta el stock de ese producto por la cantidad vendida (`units`).

Si esos 6 pasos dan verde, StarPOS está funcionando de punta a punta.
