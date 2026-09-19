# Café Pandora — App de gestión interna + página de pedidos

Contexto completo del proyecto para retomarlo. Léelo entero antes de tocar
código — hay convenciones y decisiones de negocio que no son obvias solo
mirando los archivos.

## Qué es esto

Dos apps separadas, un mismo repo, un mismo despliegue de Cloudflare Pages:

1. **App interna** (`index.html`, raíz del repo) — la usan Juan, Inés y
   Joaquín para registrar ventas de café, órdenes de maquila, gastos,
   trazabilidad de cosecha/tueste, y ver el resumen financiero del negocio.
   Requiere login.
2. **Página pública de pedidos** (`pedidos/index.html`) — la ven los
   clientes, sin login, para armar un pedido de café y mandarlo por
   WhatsApp. URL: `cafepandora.pages.dev/pedidos/`.

Café Pandora es un negocio de café colombiano: cultivan, procesan
(Lavado/Honey/Natural/Exótico), tuestan y venden su propio café — y además
ofrecen **maquila** (trillar/tostar/empacar café que trae el cliente, un
servicio, no un producto del inventario propio).

## Stack

- **Frontend**: un solo `index.html` sin build step, JS vanilla, Chart.js y
  jsPDF por CDN. Igual `pedidos/index.html`, independiente.
- **Backend**: Cloudflare Pages Functions (`functions/api/**/*.ts`), cada
  carpeta = un recurso REST (`index.ts` para GET/POST de la colección,
  `[id].ts` para PATCH/DELETE de un registro).
- **DB**: Supabase (Postgres). El cliente en `functions/_lib/supabase.ts`
  usa la `service_role key` — nunca se expone al navegador.
- **Auth**: Supabase Auth, **una sola cuenta compartida** para todo el
  equipo (no hay roles ni usuarios individuales — así lo pidió Juan).
  `functions/_lib/auth.ts` exporta `requireAuth()`, que casi todas las
  funciones llaman al inicio. Las únicas rutas públicas (sin auth) son
  `GET /api/catalogo-publico` y `POST /api/pedidos-web` — las que usa la
  página de pedidos sin login.
- **Hosting**: Cloudflare Pages, redeploy automático al hacer push/subir a
  la rama `main` de GitHub.

## Cómo se despliega

Push a `main` en GitHub → Cloudflare Pages redespliega solo (1-2 min). No
hay paso de build: los `.ts` de `functions/` los compila Cloudflare al
vuelo. Cambios en Supabase (tablas nuevas, columnas nuevas) se corren a
mano en el SQL Editor de Supabase — **no hay migraciones automáticas**,
cada archivo `migracion_*.sql` en la raíz es uno que ya se corrió una vez
en producción. Si vas a agregar una tabla o columna nueva, crea un
`migracion_<algo>.sql` nuevo y avisa que hay que correrlo — no asumas que
el schema ya lo tiene.

## Variables de entorno

- **Cloudflare Pages** (Settings → Environment variables), usadas por
  `functions/_lib/supabase.ts`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Hardcodeadas en `index.html`** (son públicas, no son secreto):
  `SUPABASE_URL`, `SUPABASE_ANON_KEY` — las usa el navegador para el login
  con Supabase Auth. Ya están puestas con los valores reales.
- **Cloudflare Pages**, usadas solo por `functions/api/cron/fermentacion.ts`
  (alerta de WhatsApp — ver sección "Fermentación en caneca" más abajo):
  `CALLMEBOT_PHONE`, `CALLMEBOT_APIKEY`, `CRON_SECRET`.

## Convenciones importantes del código

- **Sin framework, sin build**: todo el HTML/CSS/JS vive en un solo
  `<script>` dentro de `index.html`. Las vistas se arman con template
  literals (`renderVentas()`, `renderMaquila()`, etc.) que reemplazan el
  `innerHTML` de su `<section>`. Sigue ese mismo patrón al agregar cosas.
- **`apiFetch(url, options)`** envuelve `fetch` agregando el header
  `Authorization: Bearer <token de sesión>`. Usa SIEMPRE `apiFetch` para
  llamadas a `/api/...` desde `index.html` — nunca `fetch` directo (rompe
  el login). En `pedidos/index.html` sí se usa `fetch` normal, porque esas
  dos rutas son públicas.
- **Ventas vs. Maquila están separados a propósito**: son audiencias y
  flujos de negocio distintos (producto vs. servicio). Tienen tablas
  (`ventas` / `ordenes_maquila`), directorios de clientes
  (`listaClientes()` / `listaClientesMaquila()`), y funciones de
  autocompletado independientes. No los vuelvas a mezclar.
- **Inventario solo se toca en dos lugares**: al vender café (descuenta) y
  al anotar la salida de un tueste (suma). Ver
  `functions/_lib/convert.ts` (factores de conversión) y la función SQL
  `ajustar_stock_inventario(p_lote, p_delta)` en Supabase — los ajustes
  siempre pasan por ahí, nunca por un UPDATE directo a `inventario`, para
  que quede atómico.
- **Tueste es de dos pasos**: se registra la entrada de verde
  (`POST /api/tuestes`, `kilosTostado` opcional/null), y DESPUÉS se anota
  la salida (`PATCH /api/tuestes/:id`) — ahí es cuando se ajusta el
  inventario, por la *diferencia* con lo que ya tenía, no por el valor
  absoluto (para que corregir un dato no descuadre el stock). Mismo patrón
  para cosechas (⚖️ pesar pergamino real) y pergamino comprado (🌾 pesar
  verde real).
- **Multi-orden en Ventas**: se pueden tener varias órdenes abiertas en
  paralelo (pestañas dentro de la tarjeta), para atender varios clientes
  sin perder el progreso. Ver `ordenes[]`, `ordenActiva`, `nuevaOrden()`.
- **Pedidos web → venta**: un pedido que llega por la página pública
  (`pedidos_web`) se convierte en una venta real con
  `convertirPedidoWebAVenta(id)`, que abre una orden nueva pre-cargada; al
  registrar la venta, automáticamente marca `pedidos_web.estado =
  'convertido'` y la venta queda con `origen_web = true` (se ve con el
  badge 🌐 en la lista).
- **Precios en tres tarifas**: `precios_cafe.tipo_cliente` puede ser
  `normal`, `distribuidor` o `web` — las tres viven en la misma tabla, se
  editan por separado en Configuración. `web` es la que usa
  `/api/catalogo-publico`, independiente de las otras dos (clientes nuevos
  por la página pueden tener un precio distinto a los de siempre).
- **Molienda y tostión**: cada línea de café en una venta puede llevar
  `molienda` ('Molido'/'En grano') y, solo si `lote === 'Lavado'`,
  `tueste` ('Media'/'Media alta') — es la preferencia del CLIENTE al
  comprar, no confundir con el tueste de producción (`lotes_tueste`, la
  tabla de trazabilidad). `ultimaPreferenciaCafe(nombre)` busca la última
  compra de café real de un cliente (aunque su venta más reciente haya
  sido pura maquila) para sugerir molienda/tueste solos.

## Estructura del repo

```
index.html                         # app interna completa
pedidos/index.html                 # página pública de pedidos
xlsx-lite.js                       # generador de .xlsx sin dependencias
functions/_lib/supabase.ts         # cliente Supabase (service role)
functions/_lib/auth.ts             # requireAuth() — valida sesión Supabase
functions/_lib/convert.ts          # factores de conversión kg/presentación
functions/api/ventas/              # ventas de café (multi-línea)
functions/api/ordenes-maquila/     # órdenes de maquila (separado de ventas)
functions/api/maquila/             # tarifas de maquila (config, no órdenes)
functions/api/clientes/            # directorio de clientes de café (incluye nit_cedula)
functions/api/clientes-unificar/   # fusiona/renombra variantes de un cliente
functions/api/cuentas-cobro/       # historial de cuentas de cobro formales (numeradas)
functions/api/inventario/          # stock de café tostado (kg)
functions/api/gastos/              # gastos operativos
functions/api/finca/               # gastos/labores de finca
functions/api/precios-cafe/        # precios normal/distribuidor/web
functions/api/cosechas/            # cereza → pergamino (incluye fermentación en caneca)
functions/api/pergamino/           # pergamino comprado a terceros
functions/api/tuestes/             # verde → tostado (trazabilidad)
functions/api/pedidos-web/         # bandeja de pedidos de la página pública
functions/api/catalogo-publico/    # GET público de precios "web"
functions/api/cron/fermentacion.ts # alerta de WhatsApp — la llama un cron externo, no la app
functions/api/cereza-comprada/     # café en cereza comprado a terceros (cereza → pergamino → verde)
migracion_*.sql, migration.sql     # todas ya corridas en producción
```

## Fermentación en caneca (Honey/Natural) + alerta de WhatsApp

En "Cosecha & Tueste" → Cosechas, al registrar (o editar, botón ⏱️) una
cosecha de **Honey o Natural** se puede poner cuándo empezó a fermentar en
caneca y cuándo se planea sacarla (`fermentacion_inicio`,
`fermentacion_fin` en la tabla `cosechas` — ambos fecha y hora, ver
`migracion_fermentacion.sql`). Lavado y Exótico no muestran estos campos,
no fermentan en caneca de la misma forma.

Mientras no se haya pesado el pergamino real, la fila de esa cosecha
muestra cuánto falta ("🧪 Fermentando · termina en Xh Ym") o que ya se
cumplió ("✅ Fermentación cumplida — revisa la caneca"),
`estadoFermentacion()` en `index.html`.

**La alerta de WhatsApp NO la manda la app** — la app solo guarda los datos.
Un endpoint público (`functions/api/cron/fermentacion.ts`) revisa cada
cosecha de Honey/Natural sin pesar todavía, y si le faltan 2 horas o menos
(`UMBRAL_HORAS`) le manda un WhatsApp a Juan por
[CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/) y
marca `fermentacion_alertado = true` para no repetir el aviso (se resetea
solo si se corrige el inicio/horas desde ⏱️). Ese endpoint hay que llamarlo
desde **afuera** cada 15-30 min — con un cron gratis de
[cron-job.org](https://cron-job.org) apuntando a:

```
https://cafepandora.pages.dev/api/cron/fermentacion?clave=<CRON_SECRET>
```

Requiere 3 variables de entorno en Cloudflare Pages (ver sección de arriba):
`CALLMEBOT_PHONE` (el número de Juan, con indicativo y sin +), 
`CALLMEBOT_APIKEY` (se consigue agregando el contacto de CallMeBot en
WhatsApp y mandándole "I allow callmebot to send me messages" — el bot
responde con la clave), y `CRON_SECRET` (una palabra larga inventada, para
que nadie más pueda llamar esa URL pública y gastar mensajes).

## Balance de cuentas por persona

Ventas y órdenes de maquila tienen `recibido_por`; gastos, finca y compras
de cereza tienen `pagado_por` — ambos un nombre de `PERSONAS_EQUIPO`
(`const PERSONAS_EQUIPO = ['Juan', 'Inés', 'Joaquín']` en `index.html`).
Se eligen en un `<select>` junto a método/estado en cada formulario, se
recuerdan en `localStorage` (`cp_recibio`, `cp_pago`) para no tener que
elegirlos cada vez, y se pueden corregir después desde los modales de
edición que ya existían (Ventas, Maquila, Gastos — Finca no tiene modal de
edición, igual que antes).

`calcularBalancePersonas()` (en Resumen) suma, para todo el histórico (no
solo el mes filtrado): cuánto ha **recibido** cada persona (ventas +
maquila con `estado === 'Pagado'`) menos cuánto ha **pagado** (gastos +
finca con `estado === 'Pagado'`, más el costo de cereza comprada). Positivo
= tiene plata del negocio en la mano: negativo = el negocio le debe.
`calcularBalancePorModalidad()` suma por separado cuánto quedó en cada
`metodo` (Efectivo, Transferencia a Joaquín, Juan Nequi, etc.), sin
importar quién lo recibió. Ambos se ven en Resumen (tarjeta "Balance de
cuentas") y en el Excel (hoja "Balance de cuentas") —
`migracion_balance_cuentas.sql` agrega las columnas nuevas.

## Cereza comprada a terceros

"Cosecha & Tueste" tiene una 4ª subpestaña, "Cereza comprada", para cuando
se compra café en cereza (no de la finca propia) a un proveedor — mismo
recorrido que una cosecha (cereza → pergamino real, botón ⚖️ → verde real
tras trillar, botón 🌾, reutilizando `abrirTrilla()`/`FUENTES_TRILLA`),
pero con proveedor, costo y quién pagó. Vive en su propia tabla
(`compras_cereza`, sin mezclarse con `cosechas` para no descuadrar cuánto
cosechó realmente la finca), pero **sí** suma a `rendimientosReales()` —
es cereza real entrando a secarse igual que la propia, así que también
sirve para calcular los rendimientos reales de secado/trilla.

## Cuentas de cobro (módulo formal, con membrete)

Pestaña "Cuentas de cobro" en el sidebar, independiente de los recibos
simples de venta. Sirve tanto para clientes de café como de maquila (desde
cada orden hay un botón 📋 que prellena el formulario).

- El PDF reproduce exactamente el membrete real de Juan: logo gris (recorte
  del PDF que compartió, `LOGO_CUENTA_COBRO_B64`), datos de contacto,
  cliente que debe / "DEBE A" con los datos de Juan, el monto en letras
  (función `numeroALetras()`, formato legal colombiano tipo "VEINTIÚN MIL
  PESOS MCTE"), tabla de conceptos, datos bancarios, y una **firma
  escaneada real** (`FIRMA_B64`, recortada del mismo PDF — incluye la
  rúbrica + nombre + cédula, no se escribe aparte).
- Cada cuenta de cobro queda numerada (el `id` autoincremental de la tabla
  `cuentas_cobro`) y guardada en un historial con botón para volver a
  descargar el PDF sin tener que rehacerlo.
- El NIT/cédula se guarda en `clientes.nit_cedula` la primera vez y se
  sugiere solo la próxima vez que se escribe el mismo nombre — sin pisar el
  `tipo_cliente` (normal/distribuidor) si el cliente ya existía.
- El directorio de sugerencias del campo "Cliente" combina
  `listaClientes()` + `listaClientesMaquila()` (función
  `listaClientesTodos()`), pero el nombre no tiene que existir en ninguno
  de los dos — sirve para clientes institucionales que solo piden cuenta
  de cobro (como el caso de prueba de Juan, FUCAI).


## Pendiente / a medias

- **Balance de cuentas y cereza comprada — falta correr la migración**: el
  código ya está (ver secciones de arriba), pero hasta que no se corra
  `migracion_balance_cuentas.sql` en Supabase, guardar una venta/gasto/etc.
  con "quién recibió" o "quién pagó" puesto va a fallar (columna
  inexistente) — desde el arreglo de la fermentación, ahora sí se ve un
  aviso rojo explicando el error en vez de quedarse callado, pero igual
  hay que correr la migración para que funcione de verdad.
- **Alerta de fermentación por WhatsApp — falta la configuración de Juan**:
  el código ya está (ver sección "Fermentación en caneca" arriba), pero no
  manda nada real hasta que Juan: 1) corra `migracion_fermentacion.sql` en
  Supabase, 2) active CallMeBot y ponga `CALLMEBOT_PHONE`/`CALLMEBOT_APIKEY`
  en Cloudflare, 3) invente una palabra para `CRON_SECRET` y la ponga
  también en Cloudflare, y 4) cree el cron en cron-job.org apuntando al
  endpoint con esa clave. Sin esos 4 pasos, los campos de fermentación se
  guardan bien pero nadie recibe el aviso.
- **Fotos de bolsa en `pedidos/index.html`**: las tarjetas de lote
  (Lavado/Honey/Natural) mostraban una foto de la bolsa recortada de la
  carta, pero se veían pixeladas en celulares con pantalla retina (fotos
  de solo ~220px de ancho estiradas a 260px) y un par de clientes se
  quejaron. Se reemplazaron por tarjetas tipográficas (nombre del lote en
  grande, fuente Baloo 2 — la más parecida a la del logo en Google Fonts —
  con un color de acento distinto por lote) mientras Juan decide si más
  adelante quiere volver a meter fotos reales, ya en buena resolución y
  comprimidas (no las que ya había, que pesaban ~230KB en base64 cada
  una). La tarifa `web` en `precios_cafe` con los precios reales del 2026
  ya está corrida en producción (ver `migracion_precios_carta_2026.sql` y
  `migracion_exoticos_web_inicial.sql`) — ojo que los valores que quedaron
  ahí para Honey/Natural/Exótico se editaron después a mano desde
  Configuración y ya no coinciden exactamente con esos dos archivos; lo
  que hay en Supabase ahora mismo es lo vigente.
- **Método de preparación en pedidos molidos**: `pedidos/index.html` ahora
  pregunta con qué método prepara el cliente su café molido (Prensa
  francesa/Gruesa, V60/Media, Cafetera eléctrica/Media fina, Moka/Fina) —
  uno solo para todo el pedido salvo que marquen que necesitan moliendas
  distintas por unidad. Viaja en el `items[].metodos` que se guarda en
  `pedidos_web` y se ve tanto en el mensaje de WhatsApp como en la
  bandeja de pedidos de la app interna. No se toca `ordenes_maquila` ni el
  schema de `ventas` — es solo una instrucción de fulfillment, no queda
  guardado en la venta cuando se convierte el pedido.
- **Del audit original, sin hacer todavía** (baja prioridad, cosmético):
  nada más pendiente por ahora — todo lo demás de la auditoría (carrito
  persistente, resumen de pedido, validación de teléfono, ficha de
  cliente, menú agrupado) ya está hecho.

## Gotchas ya vividos (para no repetirlos)

- El sidebar (`<nav class="sidebar">`) tiene **una sola fila de íconos
  rápidos** (`.sidebar-quick-actions`: 🔔 campana, 📄 exportar, 🚪 cerrar
  sesión) arriba del todo, antes del logo — no hay una segunda copia en el
  footer. Si agregas un botón de acción global nuevo, va ahí, no crees un
  `sidebar-footer-actions` de nuevo (esa clase ya no existe).

- El editor de texto de GitHub a veces **corta el contenido al pegar**
  archivos grandes (`index.html` pesa ~660 KB) — pasó una vez y rompió
  toda la app con un `SyntaxError` silencioso. Con Claude Code esto ya no
  debería pasar (push por git, no copiar/pegar) — pero si algo similar
  vuelve a pasar, correr `node --check` sobre el contenido del
  `<script>` extraído es la forma más rápida de confirmar que el JS es
  válido antes de dar por bueno un cambio.
- Todas las funciones de `functions/api/` (menos las 2 públicas) exigen
  login — si pruebas un endpoint con `curl`/Postman sin el header
  `Authorization: Bearer <token>`, va a responder 401. Para probar así hay
  que sacar un token real (login vía Supabase Auth) primero.
