# Café Pandora — App de gestión interna + página de pedidos

Contexto completo del proyecto para retomarlo. Léelo entero antes de tocar
código — hay convenciones y decisiones de negocio que no son obvias solo
mirando los archivos.

## Qué es esto

Dos apps separadas, un mismo repo, un mismo despliegue de Cloudflare Pages:

1. **Página pública de pedidos** (`index.html`, raíz del repo) — la ven
   los clientes, sin login, para armar un pedido de café y mandarlo por
   WhatsApp, ver el blog, o pedir maquila. URL:
   [cafepandora.co](https://cafepandora.co) (dominio propio desde
   2026-09-28, comprado y activado directo en Cloudflare Registrar —
   `www.cafepandora.co` también apunta ahí; `cafepandora.pages.dev` sigue
   funcionando igual, es el mismo sitio).
2. **App interna** (`gestion/index.html`) — la usan Juan, Inés y Joaquín
   para registrar ventas de café, órdenes de maquila, gastos,
   trazabilidad de cosecha/tueste, y ver el resumen financiero del
   negocio. Requiere login. URL: `cafepandora.co/gestion/` — un link
   chico y discreto al final de la página pública ("¿Eres del equipo?
   Inicia sesión →") lleva ahí, para que un cliente normal nunca se
   tope con la pantalla de login por accidente.

⚠️ **Hasta el 2026-09-28 esto estaba AL REVÉS** — `index.html` (raíz) era
la app interna y `pedidos/index.html` era la página pública. Se
intercambiaron el mismo día que se activó el dominio propio, porque
`cafepandora.co` mostrando una pantalla de login del equipo en vez de la
página de ventas se veía poco profesional para cualquiera que llegara
por primera vez. Ver la sección "Dominio propio + la raíz ahora es la
página pública" más abajo para el detalle completo del cambio (qué se
movió, qué se dejó igual, y un gotcha real de cómo probar esto en el
preview local).

Café Pandora es un negocio de café colombiano: cultivan, procesan
(Lavado/Honey/Natural/Exótico), tuestan y venden su propio café — y además
ofrecen **maquila** (trillar/tostar/empacar café que trae el cliente, un
servicio, no un producto del inventario propio).

## Stack

- **Frontend**: un solo `index.html` sin build step, JS vanilla, Chart.js y
  jsPDF por CDN. Igual `gestion/index.html`, independiente.
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

`_headers` en la raíz le dice a Cloudflare Pages que sirva todo con
`Cache-Control: no-cache` — Juan reportó que después de un redeploy el
navegador seguía mostrando la versión vieja (típico sin esto: como es
puro HTML estático sin build ni hash en el nombre del archivo, el
navegador lo cachea agresivo por defecto). Con `no-cache` el navegador
siempre revalida con el servidor antes de usar una copia guardada, así
que cada redeploy se ve de inmediato sin necesitar hard-refresh.

**"Sin conexión (viendo caché)" no siempre es de verdad falta de
conexión**: `sincronizar()` (en `gestion/index.html`) llama los ~14 endpoints en
paralelo; antes, cualquier respuesta que no fuera JSON válido (por
ejemplo un 401 — `requireAuth()` devuelve texto plano, no JSON) hacía
que `r.json()` explotara y el `catch` mostrara el aviso genérico de "sin
conexión", aunque el servidor sí estuviera respondiendo bien y lo único
vencido fuera la sesión de Supabase Auth. Ahora `sincronizar()` revisa
primero si alguna respuesta vino en 401 y, si es así, muestra "Tu sesión
expiró" con un botón que llama a `sesionExpirada()` (cierra la sesión
vieja y recarga a la pantalla de login) — sin el `confirm()` que sí tiene
`cerrarSesion()`, porque aquí no hay nada que confirmar, el servidor ya
la rechazó. El aviso de "Sin conexión" genérico se queda solo para
cuando el `fetch()` en sí falla (de verdad no hay red).

Un caso real que pasó (para reconocerlo rápido si vuelve a pasar): se
subió código nuevo que le agregaba `transporte` al `SELECT` de
`/api/cuentas-cobro` antes de correr la migración que crea esa columna
— Supabase respondía 500 con el error de Postgres en texto plano, eso
tronaba `r.json()` igual que el caso del 401, y el aviso también decía
"Sin conexión" **aunque el servidor sí contestaba y el problema era otro
por completo**. Ahora `sincronizar()` revisa `r.ok` de cada respuesta
antes de intentar parsear JSON: si alguna no vino bien, muestra
`Error en <endpoint> (<status>): <mensaje real de Supabase>` en vez de
"Sin conexión" — así, la próxima vez que falte correr una migración
después de un deploy, el mensaje mismo dice cuál columna/tabla falta, sin
tener que adivinar revisando curl o los logs de Cloudflare.

## Variables de entorno

- **Cloudflare Pages** (Settings → Environment variables), usadas por
  `functions/_lib/supabase.ts`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Hardcodeadas en `index.html`** (son públicas, no son secreto):
  `SUPABASE_URL`, `SUPABASE_ANON_KEY` — las usa el navegador para el login
  con Supabase Auth. Ya están puestas con los valores reales.
- **Cloudflare Pages**, usadas solo por `functions/api/cron/fermentacion.ts`
  (alerta de WhatsApp — ver sección "Fermentación en caneca" más abajo):
  `CALLMEBOT_PHONE`, `CALLMEBOT_APIKEY`, `CRON_SECRET`.
- `functions/api/cron/precio-fnc.ts` (precio de referencia del café — ver
  sección propia más abajo) reutiliza el MISMO `CRON_SECRET` de arriba, no
  necesita ninguna variable nueva.

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
- **Ventas es UNA orden a la vez** (`orden`, un objeto — no un array): antes
  se podían tener varias abiertas en paralelo con pestañas, se quitó el
  2026-09-23 porque en la práctica no se usaba, ver "Profesionalizar la
  app interna" más abajo. `elegirCliente()` y `convertirPedidoWebAVenta()`
  piden confirmación antes de reemplazar la orden si ya llevaba algo.
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

## Accesibilidad para usuarios de 65+ años

Juan e Inés (dos de los tres del equipo que usan la app interna a diario)
tienen 65 años — la app se diseña pensando en esa barra, no en un usuario
técnico joven. Primer pase (index.html, la app interna — no se tocó
pedidos/index.html todavía):

- `--cafe-soft` (texto secundario/meta en TODA la app) se oscureció de
  `#8A7A70` a `#6E5D52` — el original medía ~4:1 de contraste contra
  `--crema`, por debajo del mínimo 4.5:1 de WCAG AA para texto normal.
  Una sola variable, efecto en toda la app.
- Tamaños de letra base subidos (body 16→17px, `.ledger-row` 15.5→16.5px,
  `.meta`/`.details` 13→14px, `.field label` 13→14px, nav del sidebar
  14.5→15.5px, nav de abajo en celular —el más chico de toda la app—
  10→11.5px).
- Botones de acción de una fila (✎✕⚖️🌾⏱️📋, `.ledger-row .acciones
  button`) a mínimo 44px (el tamaño de tap recomendado para dedos menos
  precisos), antes 38px; más separación entre ellos.
- Checkboxes (antes sin estilo del navegador, ~13px) a 20px con
  `accent-color` de la marca.
- El toast de confirmación dura más (3.2s → 4.2s) para dar tiempo a leerlo.

⚠️ *Gotcha real que salió de este cambio, en dos partes*: subir el
tamaño de la etiqueta de estado (`.tag`) y de los botones de acción hizo
que, en pantallas angostas, `.ledger-row` empezara a fallar con pedidos
de varias líneas (ej. una venta con 3 ítems distintos, el detalle queda
larguísimo). El primer intento de arreglo (`flex-wrap: wrap` en
`.ledger-row` + `flex: 1 1 180px` en `.main`) **no bastó** — Juan lo
reportó con una venta real (John Zuluaga, 3 ítems) que se veía altísima,
una palabra por línea. La causa real, confirmada inspeccionando el DOM
en vivo: flexbox decide los saltos de línea usando el tamaño
"hipotético" (flex-basis) de cada ítem ANTES de crecer/encogerse — y
`.main` (basis 180px) + la etiqueta de Pagado/Pendiente (~95px) SÍ
alcanzaban a caber juntas en una fila angosta (180+95+gap < ancho de
fila), así que quedaban en la MISMA línea de flex-wrap, y `.main` se
encogía (por `min-width:0`) hasta ~230px en vez de usar el ancho
completo — muy poco para un detalle largo. `flex-wrap: wrap` sí estaba
wrapleando, solo que agrupaba mal las cosas (`.main` + etiqueta en la
línea 1; monto + botones en la línea 2), no como se veía a simple vista
(que parecía que todo se apilaba en una sola línea altísima, porque
`align-items: center` centra cada ítem corto dentro de la altura de esa
línea, dictada por el contenido alto de `.main`).

Arreglo real: `@media (max-width: 600px) { .ledger-row .main { flex-basis: 100%; } }`
(cerca del final del bloque `@media (max-width: 860px)`, después de
cerrarlo). Con `flex-basis: 100%`, `.main` YA NO alcanza a caber junto a
ningún otro ítem en pantallas angostas — así que siempre se queda solo
en su propia línea, a todo el ancho, y la etiqueta+monto+botones bajan
juntos a la línea de abajo. Solo aplica bajo 600px — en escritorio
(fila más ancha) todo sigue cabiendo cómodo en una sola línea, sin
necesidad de forzar el salto. No hizo falta tocar el markup de los 19
lugares que usan `.ledger-row` — fue puramente CSS.

Moraleja para la próxima vez que algo en `.ledger-row` se vea raro en
celular: no confiar en la intuición de "ya tiene flex-wrap, debería
funcionar" — medir con JS en vivo (`getBoundingClientRect()` de cada
hijo directo del `.ledger-row`) cuáles ítems realmente comparten línea,
antes de asumir la causa. Y probar siempre con una venta/orden de
VARIOS ítems (detalle largo), no solo con una de un ítem — el bug no se
nota con contenido corto.

Pendiente si se quiere seguir: agregar texto visible junto a los botones
de solo-ícono (ej. "✎ Editar" en vez de solo ✎) — ayuda mucho a este
grupo de edad, pero hay filas con 3-4 botones (Cosecha: ⏱️⚖️🌾✕) que se
desbordarían en celular con etiquetas completas; necesitaría revisar
fila por fila, no es un cambio de CSS global seguro. Tampoco se tocó
`pedidos/index.html` (la página pública) en este pase.

## Estructura del repo

```
index.html                         # página pública de pedidos (raíz, desde 2026-09-28)
gestion/index.html                 # app interna completa (antes vivía en la raíz)
img/                                # fotos reales de index.html (antes pedidos/img/)
_redirects                         # /pedidos/* -> / (compatibilidad con links viejos)
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
functions/api/cron/precio-fnc.ts   # scrape del precio de referencia FNC — la llama un cron externo, no la app
functions/api/precio-fnc/          # GET del historial de precio de referencia (con login)
functions/api/saldos-iniciales/    # saldo inicial por persona, para el balance de cuentas
functions/api/inventario-pergamino/ # pergamino disponible por lote, antes de trillar
functions/api/inventario-verde/    # café verde disponible por lote × malla, después de trillar
functions/api/movimientos-inventario/ # historial de entradas/salidas de pergamino/verde, con origen
functions/api/blog/                # artículos del blog (todo, con login — pestaña "Blog")
functions/api/blog-publico/        # GET público, solo estado = Publicado
functions/_lib/verde.ts            # aplicarTrilla()/revertirTrilla() — pergamino disponible -> verde por malla
migracion_*.sql, migration.sql     # ver "Pendiente / a medias" — no todas están corridas en producción
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

**Repartir el sobrante a Lavado**: en la finca pesan toda la cereza
primero y seleccionan después — a veces una parte de lo que se pesó como
Honey/Natural termina no fermentándose y se procesa como Lavado en su
lugar. Por eso el mismo modal de ⏱️ (`abrirFermentacion()`) también deja
editar "Kilos en cereza"; si el valor nuevo es menor al que ya tenía, se
ve cuánto es el sobrante (`actualizarSobranteFermentacion()`) y una
casilla marcada por defecto "Pasar el sobrante a una cosecha nueva de
Lavado". Al guardar (`guardarFermentacion()`), si la casilla queda
marcada, además de actualizar los kilos de la cosecha original se crea
una cosecha nueva con `proceso: 'Lavado'`, la MISMA fecha de recolección,
y una nota que referencia de cuál cosecha salió el sobrante — no hace
falta ninguna tabla ni migración nueva, reutiliza `POST /api/cosechas`
igual que el formulario normal. Si se desmarca la casilla, el peso se
corrige sin crear nada (para cuando solo era un error de digitación).

**Unir cosechas (lo inverso — varios días, un solo lavado)**: a veces se
recoge y anota café en días distintos (ej. 15 y 17 de septiembre) pero
después se lava todo junto, así que conviene que quede como una sola
cosecha antes de pesar el pergamino. Botón "🔗 Unir cosechas" junto al
encabezado de "Historial de cosechas" → `abrirUnirCosechas()` abre un
modal con checkboxes de todas las cosechas SIN pesar todavía
(`kilosPergaminoReal == null`, de cualquier proceso). `unirCosechas()`
exige marcar 2+ del MISMO proceso, y luego: la de fecha más reciente
sobrevive (es de cuando en la práctica se lavó todo junto), le suma los
kilos de las demás, le agrega una nota tipo "Cosecha combinada: 15 de
sept (32.0 kg) + 17 de sept (24.6 kg)", y borra las otras cosechas
(`DELETE /api/cosechas/:id`) para que no queden duplicadas en el
historial. No toca fermentación — si la que sobrevive ya tenía
inicio/fin puestos, se quedan igual; hay que revisarlos a mano con ⏱️ si
hace falta. No requiere migración, reutiliza `PATCH`/`DELETE
/api/cosechas` tal cual.

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

## WhatsApp — aviso de pedido nuevo y aviso al cliente

Dos avisos por WhatsApp distintos, agregados el 2026-09-21, que usan
mecanismos DIFERENTES a propósito — CallMeBot solo puede mandarle mensajes
al número que se registró con él (el de Juan), no a números arbitrarios de
clientes, así que no sirve para avisarle al cliente:

- **Aviso a Juan cuando llega un pedido nuevo** (`functions/api/
  pedidos-web/index.ts`, función `avisarPedidoNuevo()`): reutiliza el
  MISMO CallMeBot de la fermentación (mismas `CALLMEBOT_PHONE`/
  `CALLMEBOT_APIKEY`, no hace falta ninguna variable nueva), pero se
  dispara DIRECTO al guardar el pedido (`context.waitUntil(...)` en el
  `POST`, no bloquea la respuesta al cliente en `pedidos/index.html`) —
  a diferencia de la fermentación, que la revisa un cron externo cada
  15-30 min, esto no necesita cron porque ya hay un evento real (el
  `POST`) en el que engancharse. Si CallMeBot falla o las variables no
  están puestas, el `catch` se traga el error y el pedido se guarda
  normal de todas formas — nunca debe tumbar un pedido real por un aviso
  que no pudo salir.
- **Aviso al cliente de "tu pedido ya quedó listo"** (`index.html`,
  `pintarListaPedidosWeb()`): como CallMeBot no puede mandarle nada a
  clientes, esto usa un link `wa.me/<telefono>?text=...` (`avisarPedidoWebListo()`)
  que abre WhatsApp con el mensaje YA ESCRITO — solo falta darle Enviar,
  cumple con "no quiere escribir" sin ser un mensaje 100% automático
  (eso necesitaría la API oficial de WhatsApp Business, de pago y con
  trámite de por medio, no CallMeBot). Al lado hay un segundo botón
  (`avisarPedidoWebPersonalizado()`) con el mismo link pero sin texto
  prellenado, para cuando se quiere escribir algo personal en vez del
  aviso genérico. Ambos botones solo aparecen si el pedido tiene
  `telefono` (siempre lo tiene, es obligatorio en `pedidos/index.html`).
  `numeroWhatsapp()` le antepone `57` a números de 10 dígitos, porque el
  campo de teléfono en `pedidos/index.html` se llena sin indicativo (el
  placeholder es "300 000 0000") pero `wa.me` sí lo necesita.

## Precio de referencia del café (Federación Nacional de Cafeteros)

Tarjeta en Resumen (2026-09-21) con el precio interno de referencia que
publica la Federación para café pergamino seco (carga de 125 kg) — de
lunes a viernes en la tarde. Investigado a fondo antes de construirlo: la
Federación **no tiene API ni JSON**, solo esta página HTML pública
(`https://federaciondecafeteros.org/wp/estadisticas-cafeteras/`), así que
esto es scraping, no una integración oficial — si un día deja de
funcionar, lo primero es abrir esa URL a mano y ver si cambió el marcado
(busca `fnc-ticker-name`/`fnc-ticker-value`/`t-fecha` en el HTML fuente).

- `functions/api/cron/precio-fnc.ts`: mismo patrón que
  `cron/fermentacion.ts` (protegido con el mismo `CRON_SECRET`, lo llama
  un cron externo, NO la app) — hace `fetch()` de esa página, saca el
  precio con `extraerValor()`/`extraerFecha()` (busca el bloque
  `fnc-ticker-name">Precio interno de referencia:` y lee el `fnc-ticker-value`
  y la fecha que le siguen) y hace `upsert` en `precio_cafe_fnc` por
  `fecha` (para poder correrlo varias veces el mismo día sin duplicar).
  `numeroCO()` convierte el formato colombiano ("$2.030.000" con puntos de
  miles, "280,50" con coma decimal) a número de JS — ojo si se reutiliza
  en otro lado, es lo contrario del formato en inglés.
- Necesita correr **antes** `migracion_precio_fnc.sql` (crea la tabla
  `precio_cafe_fnc`) y configurar un cron en cron-job.org apuntando a
  `https://cafepandora.pages.dev/api/cron/precio-fnc?clave=<CRON_SECRET>`
  — una vez al día en la tarde entre semana es suficiente (la Federación
  no publica los fines de semana). Ver "Pendiente" más abajo.
- `functions/api/precio-fnc/index.ts` (GET, con login) le sirve a la app
  el historial guardado, más reciente primero, máximo 60 registros.
- `index.html`: `state.precioFnc` se suma a `sincronizar()` como un
  endpoint más (mismo patrón que los otros 15) y `bloquePrecioFnc()`
  pinta el último precio + la variación contra el reporte anterior en
  Resumen. **Ojo**: como CUALQUIER otro endpoint nuevo en esa lista, si la
  tabla `precio_cafe_fnc` no existe todavía (falta correr la migración),
  `sincronizar()` va a fallar para TODA la app (no solo esta tarjeta) con
  el mensaje de error real de Supabase — el mismo comportamiento ya
  documentado para `saldos_iniciales`/`estado_entrega`, no es un bug
  nuevo, es el patrón ya establecido de "corre la migración antes de que
  esto llegue a producción".
- No es el precio de venta de Café Pandora (que tuesta y vende café, no
  vende pergamino) — es contexto de mercado, útil sobre todo para
  negociar cereza/pergamino comprado a terceros y para tener una
  referencia de hacia dónde va el mercado en general.
- **Calculadora de factor de rendimiento** (`bloqueCalculadoraFactor()`,
  justo debajo de la tarjeta del precio, 2026-09-21): el precio que
  publica la Federación siempre es "a factor 94" (94 kg de pergamino
  seco rinden 70 kg de café exportable) — si el lote que se está
  comprando de verdad rinde distinto, no se paga el precio publicado
  tal cual, se ajusta proporcional:
  `precio_a_pagar = precio_referencia × (94 ÷ factor_real)`.
  Un factor MEJOR que 94 (número más bajo, ej. 88 — hace falta menos
  pergamino para llegar a 70 kg) paga MÁS que el precio publicado; uno
  PEOR (número más alto) paga MENOS. Se verificó la fórmula contra la
  página oficial de la Federación
  ([federaciondecafeteros.org/aprenda-a-vender-su-cafe](https://federaciondecafeteros.org/aprenda-a-vender-su-cafe/))
  antes de construirla — es plata real, no se adivinó. `FACTOR_BASE_REFERENCIA
  = 94` es una constante aparte (no hardcodeado inline) por si la
  Federación lo vuelve a ajustar algún día (ya pasó antes, veía otros
  valores históricamente). El campo de factor es libre (no solo 94 u 88)
  porque el factor real varía lote a lote, no son solo 2 valores fijos.

## Clima de la finca (Cosecha & Tueste)

Widget de 5 días (2026-09-21) en la pestaña "Cosecha & Tueste", arriba de
"Rendimientos de tu café" — pensado como apoyo para decidir si conviene
sacar/tapar cereza en secado según la probabilidad de lluvia de los
próximos días. Usa [Open-Meteo](https://open-meteo.com), gratis y sin
necesitar llave/API key, a diferencia del precio FNC esto SÍ es una API
de verdad (JSON), no scraping.

- **`UBICACION_FINCA`** (`index.html`, junto a `panelRendimientos()`):
  coordenadas de Pereira/Marsella, Risaralda — sacadas de
  `EMISOR_DIRECCION`/`EMISOR_CIUDAD` (la dirección real que ya usaba la
  app en las cuentas de cobro: "Km 5 vía Marsella Finca Tinajas"), NO el
  punto GPS exacto de la finca (no lo tenemos). Es una aproximación a
  nivel de municipio — si Juan da coordenadas más precisas de la finca
  algún día, se actualizan solo esas dos líneas.
- `obtenerClima()` pide el pronóstico (lluvia máxima del día, temp
  min/max, 5 días) y lo cachea en una variable de JS (`climaCache`) por
  `CLIMA_TTL_MS` (3 horas) — no hay que pedirlo de nuevo cada vez que se
  repinta Trazabilidad. Es un `fetch()` normal del navegador (no pasa por
  `apiFetch`, no necesita login — es una API pública externa, no un
  endpoint propio).
- Se pide DESPUÉS de pintar el HTML (`cargarClimaFinca()`, llamado al
  final de `renderTrazabilidad()`), no antes — así el resto de la
  pestaña (cosechas, rendimientos) no espera a que responda una API
  externa para aparecer. Si para cuando responde ya se cambió de pestaña,
  `document.getElementById('clima-finca')` ya no existe y simplemente no
  hace nada (mismo patrón de "verificar que el contenedor siga vivo" que
  ya se usa en el buscador modal).

## Balance de cuentas por persona

Ventas y órdenes de maquila tienen `recibido_por`; gastos, finca y compras
de cereza tienen `pagado_por` — ambos un nombre de `CUENTAS_BALANCE`
(`const PERSONAS_EQUIPO = ['Juan', 'Inés', 'Joaquín']`, y
`const CUENTAS_BALANCE = [...PERSONAS_EQUIPO, 'Efectivo']` en
`index.html`). Se recuerdan en `localStorage` (`cp_recibio`, `cp_pago`)
para no tener que elegirlos cada vez, y se pueden corregir después desde
el modal de edición de cada uno (Ventas, Maquila, Gastos, y Finca —
`abrirEdicionFinca()`/`guardarEdicionFinca()`, agregado en la auditoría de
cuentas; antes Finca no tenía forma de editar nada).

**"Quién recibió" no se anota aparte**: se deriva del método de pago
(`METODO_A_PERSONA` / `personaDeMetodo()`) cuando el método ya nombra a
alguien ("Transferencia a Joaquín", "Juan Nequi", "Juan Bancolombia") — el
campo "Quién recibió" del formulario (`*-recibio-fila`,
`actualizarRecibioVisible()`) solo se muestra cuando el método es
"Efectivo", porque ahí sí hace falta preguntar quién lo recibió en mano.
Mismo patrón para "Anotado por" en Gastos: quien anota es quien paga, así
que ese campo no existe por separado — `pagadoPor` hace las dos cosas.

**Efectivo es una 4ª cuenta**, la caja física de billetes, separada de las
cuentas bancarias de cada socio. Dos categorías especiales en Gastos (no
son gastos reales, son movimientos entre cuentas — no deben usarse ni
verse en filtros de "gasto real" del negocio):
- **"Retiro de cuenta"**: saca plata de la cuenta bancaria de quien la
  registra (`pagadoPor`) y la mete a Efectivo — para cuando alguien saca
  plata del banco para tener efectivo en mano. Siempre le abona a
  Efectivo, sin pedir destino.
- **"Transferencia entre cuentas"**: traspaso directo entre los 3 socios,
  en cualquier orden (ej. Joaquín le presta a Inés) — pide un segundo
  desplegable "Transferir a" (`g-transferencia-fila`,
  `actualizarTransferenciaVisible()`, solo `PERSONAS_EQUIPO`, no Efectivo,
  para eso ya está "Retiro de cuenta") y usa la columna nueva
  `transferido_a` (`migracion_transferencia_cuentas.sql`). Valida que
  origen y destino no sean la misma persona.

Un gasto pagado con `pagadoPor === 'Efectivo'` (categoría normal, ni
retiro ni transferencia) descuenta del balance de Efectivo, no de una
persona — así queda registrado de dónde salió la plata en efectivo y en
qué se gastó.

`calcularBalancePersonas()` (en Resumen) suma, para todo el histórico (no
solo el mes filtrado) y por cada una de las 4 cuentas: cuánto ha
**recibido** (ventas + maquila con `estado === 'Pagado'`, más — solo para
Efectivo — el total de retiros, más — para quien sea el destino — las
transferencias entre socios) menos cuánto ha **pagado** (gastos + finca
con `estado === 'Pagado'`, más el costo de cereza comprada — un retiro o
una transferencia ya cuentan aquí para quien la origina, porque son un
gasto más con ese `pagadoPor`). Positivo = tiene plata del negocio en la
mano; negativo = el negocio le debe.
`calcularBalancePorModalidad()` suma por separado cuánto quedó en cada
`metodo` (Efectivo, Transferencia a Joaquín, Juan Nequi, etc.), sin
importar quién lo recibió. Ambos se ven en Resumen (tarjeta "Balance de
cuentas", tabla + gráfica) y en el Excel (hoja "Balance de cuentas") —
`migracion_balance_cuentas.sql` y `migracion_transferencia_cuentas.sql`
(agrega `transferido_a`) ya están corridas en producción.

La tarjeta "Balance de cuentas" en Resumen tiene, además de las tablas,
dos gráficas de barras horizontales (`renderBalancePersonas()` →
`dibujarGraficosBalance()`, separado de `dibujarGraficos()` porque este
bloque se repinta solo sin redibujar todo el resumen del mes): "Balance
por persona" (verde = tiene plata, terracota = se le debe) y "Distribución
por modalidad" — esta última son barras, no dona, a propósito: la idea es
comparar de un vistazo cuánta plata hay en cada cuenta real/Efectivo, no
solo ver la proporción de cada una.

**Ventas/maquila viejas sin `recibido_por`**: el campo se empezó a
derivar del método de pago después de que ya existían ventas/órdenes
pagadas en producción, así que esas filas viejas no contaban en el balance
de nadie y las cuentas no cuadraban con la plata real.
`migracion_backfill_recibido_por.sql` (data-fix, no cambia el schema, ya
corrida en producción) rellenó `recibido_por` en las filas viejas cuyo
`metodo` ya nombraba a alguien (Transferencia a X, X Nequi, X Bancolombia,
y el valor viejo "Transferencia a Juan" que ya no está en el desplegable
actual pero seguía en filas antiguas). Las que se pagaron en Efectivo no
se pudieron deducir del método — esas quedaron sin dueño hasta corregirlas
a mano con ✎ (el archivo trae al final las consultas para encontrarlas).

El backfill dejó bien el balance POR PERSONA de esas ventas viejas, pero
"Transferencia a Juan" seguía apareciendo como una 3ª cuenta suelta en la
tabla "Por modalidad / cuenta" (que agrupa por el texto exacto de
`metodo`), como si Juan tuviera 3 cuentas en vez de sus 2 reales
(Bancolombia/Nequi). `migracion_reasignar_transferencia_juan.sql`
(data-fix, ya corrida) reescribió esas filas a `metodo = 'Juan
Bancolombia'` — confirmado con Juan que esas 12 ventas fueron todas a esa
cuenta.

**Retiro de cuenta / Transferencia entre cuentas NO son gasto real del
negocio** — `esGastoOperativo(g)` (excluye esas dos categorías) filtra
todos los totales que miden gasto/egreso del negocio: "Gastos + Finca" y
"Balance real del mes" en Resumen, las gráficas "Ingresos cobrados vs.
egresos" y "Egresos por categoría", y la hoja Excel "Resumen mensual". La
hoja Excel "Gastos" sigue listando cada fila (nada se oculta) pero separa
el TOTAL en "gastos operativos" vs. "retiros/transferencias" para no
confundir. La gráfica "Ingresos cobrados vs. egresos" también se corrigió
para sumar maquila además de ventas (antes solo contaba café, y
subestimaba los ingresos reales del mes en la gráfica aunque el stat
"Cobrado" de arriba sí incluía maquila).

**Nada puede quedar "Pagado" sin dueño desde ahora**: `registrarVenta`,
`guardarEdicionVenta`, `registrarOrdenMaquila`, `guardarEdicionMaquila`
exigen `recibidoPor` si el estado final es Pagado; `registrarGasto`,
`guardarEdicionGasto`, `registrarFinca`/`guardarEdicionFinca` y
`registrarCerezaComprada` (si tuvo costo) exigen `pagadoPor`. Los botones
de un clic que marcan "Pagado" (`toggleEstadoVenta`,
`toggleEstadoOrdenMaquila`, `toggleEstadoGasto`, `toggleEstadoFinca`)
tienen el mismo guardarraíl — si falta el dueño, bloquean el cambio y
abren el modal de edición correspondiente para corregirlo ahí mismo.
Antes de esto, un solo clic en la etiqueta de estado podía marcar algo
Pagado sin dueño en silencio — así se generaron las ventas viejas que hubo
que rellenar con el backfill.

**`listaHuerfanos()`/`contarHuerfanos()`** revisan, en cada `renderTodo()`,
si queda algo Pagado (o cereza con costo) sin `recibidoPor`/`pagadoPor` —
por dato viejo o algún camino que se escape de los guardarraíles de
arriba — y muestran un aviso ⚠️ arriba de la tabla de "Balance de cuentas"
con el conteo por tipo. El botón "Ver y corregir" del aviso abre
`abrirHuerfanos()`, un modal con la lista completa (cliente/concepto,
monto, fecha) y un botón "✎ Corregir" por fila que cierra el modal y abre
directo la edición de ese registro — no hay que ir a buscarlo a mano por
pestañas y páginas.

**Saldo inicial de cada cuenta**: `calcularBalancePersonas()` suma todo
el histórico DESDE QUE EMPEZÓ A USARSE LA APP — antes de esto, si
alguien ya tenía plata guardada (o ya le debía al negocio) desde antes,
el balance arrancaba en $0 para todos y se veía como si el negocio le
debiera a todo el mundo desde el día uno, sin serlo. Configuración →
Precios → "Saldo inicial de cada cuenta" (arriba del todo, antes de
"Precios de café") deja poner un valor único por persona/Efectivo — tabla
nueva `saldos_iniciales` (`migracion_saldos_iniciales.sql`, persona como
llave primaria, un solo valor que se sobreescribe, no un histórico) y
endpoint `POST /api/saldos-iniciales` que hace upsert. Se pone UNA SOLA
VEZ (septiembre 2026 fue el primer mes con la app) — de ahí en adelante
el balance sigue solo, sumando/restando lo que se vaya registrando; no
hace falta (ni está pensado) tocarlo cada mes. `calcularBalancePersonas()`
le suma ese `inicial` al cálculo de siempre (`recibido - gastado`); en la
tabla "Balance por persona" de Resumen se ve como una líneita chica
"saldo inicial $X" debajo del nombre, solo cuando no es $0, para que se
entienda de dónde sale la diferencia sin agregar una columna nueva.

**"Pendientes de meses anteriores"**: Ventas ya tenía "Deudas de meses
anteriores" (ventas con `estado === 'Pendiente'` de un mes distinto al
que estás viendo, para no perderlas de vista al cambiar de mes) — se
amplió para que TAMBIÉN muestre lo que sigue sin enviar
(`estadoEnvio !== 'Enviado'`), y se le cambió el nombre a "Pendientes de
meses anteriores" porque ya no es solo plata. Maquila no tenía nada
parecido — ahora tiene el mismo bloque (mismo filtro, mismo texto,
mismas clases CSS `deuda-anterior`/`envio-pendiente`, reutilizando
`filaOrdenMaquila(o, true)` con el nuevo segundo parámetro `esDeuda`
igual que ya hacía `filaVenta(v, esDeuda)`). La idea: todo lo que ya
quedó resuelto (pagado Y entregado/enviado) desaparece de la vista al
cambiar de mes — no hay que revisarlo de nuevo — pero nada pendiente se
pierde nunca, sin importar de qué mes sea.

**Buscar en Ventas junta las 3 pestañas en una sola lista**: antes, si
buscabas un cliente mientras estabas parado en "Pagadas" y esa venta en
particular estaba "Por pagar" o "Por enviar", no aparecía — había que
adivinar y probar pestaña por pestaña. Ahora, en `renderVentas()`, si
`filtroBusqueda` no está vacío, las pestañas Por enviar/Pagadas/Por
pagar se ocultan y en su lugar se muestra "Resultados de la búsqueda":
una sola lista con `delMesOrdenadas` (que ya viene filtrada por la
búsqueda) sin importar el estado de pago/envío de cada una — apenas se
borra la búsqueda, vuelven las 3 pestañas de siempre. Nueva clave de
paginación `ventasBusqueda` en el objeto `paginas` (⚠️ *gotcha*: si le
pasas a `paginar()` una `clave` que no está pre-declarada en `paginas`,
`paginas[clave]` da `undefined`, y `(undefined-1)*POR_PAGINA` /
`undefined*POR_PAGINA` se vuelven `NaN` — `array.slice(NaN, NaN)` en JS
se trata como `slice(0, 0)`, así que la lista sale VACÍA sin ningún
error en consola ni mensaje de "vacío", porque `lista.length` sí era
mayor a 0 y se saltó el early-return — costó un rato encontrar esto la
primera vez. Cualquier `clave` nueva que le pases a `paginar()` tiene
que declararse en `paginas` de entrada, con `1`, no asumir que se crea
sola). Solo se hizo en Ventas (fue lo que se reportó) — Maquila no tiene
pestañas de pago/envío que dividan la lista, así que no aplica ahí.

**Buscar abre un modal aparte, en vez de una barra fija arriba** — con
historia: el primer intento (`.controles-globales` con
`position: sticky; top: 0`, con ícono 🔍) resolvía el problema real
("con una lista larga tocaba volver arriba del todo para buscar"), pero
Juan lo probó y no le gustó que la barra de mes/buscar se quedara
"moviéndose" todo el tiempo en cada pestaña al hacer scroll — pidió
explícitamente que en vez de eso, buscar abriera "una ventana sobre
todo, de solo búsqueda" que conservara los botones de cada fila
(✎ editar, 📋 cuenta de cobro, etc.). `.controles-globales` volvió a
`position: static` (normal, sin sticky) — el ícono 🔍 y `.busqueda-wrap`
si se quedaron, ya no eran el problema.

`#filtroBusqueda` (el campo de siempre, arriba de cada pestaña) ahora es
`readonly` y solo sirve de botón: `onclick="abrirBusquedaModal()"` — ya
no dispara nada por su cuenta (se le quitó su listener de `input`).
`abrirBusquedaModal()` abre un modal (reutilizando `abrirModal()`, el
mismo de siempre) con su PROPIO `<input>` nuevo
(`#busqueda-modal-input`, una variable JS aparte `busquedaModalQuery`,
NO el mismo nodo del DOM movido de un lado a otro — mover el nodo real
sonaba elegante pero es peligroso: `abrirModal()` hace
`modalBox.innerHTML = html`, así que si el buscador estuviera parado
DENTRO de `modalBox` y alguien abre OTRO modal desde ahí —ej. tocás
✎ Editar en un resultado— ese `innerHTML` lo destruye para siempre. Con
un input nuevo y separado no hay ese riesgo). Cada tecla llama a
`renderResultadosBusquedaModal()`, que mira `state.tabActiva` y filtra
+ pinta usando la MISMA lista y la MISMA fila que ya existían en esa
pestaña:

- Ventas → `filaVenta()`, Maquila → `filaOrdenMaquila()` (ya eran
  funciones aparte, no hizo falta tocarlas).
- Gastos/Finca no tenían su fila en una función aparte (vivía inline
  dentro de `renderGastos()`/`renderFinca()`) — se sacaron a
  `filaGasto()`/`filaFinca()` para que el modal las pueda reusar sin
  duplicar HTML; `renderGastos()`/`renderFinca()` ahora también llaman
  a esas mismas funciones.
- Cuentas de cobro → `filaCuentaCobro()` (ya existía aparte).
- Config → Clientes usa su propia fila chiquita (nombre + botón
  "✎ Renombrar"), calcada de la que ya tenía `bloqueClientes`.

Como los botones de cada fila (editar, cuenta de cobro, eliminar…) son
los de SIEMPRE, tocar uno desde el modal de búsqueda simplemente abre
el modal de edición de siempre (mismo `abrirModal()` compartido,
reemplaza el contenido) — no hizo falta ninguna plomería extra para
que funcionaran desde ahí.

Como `filtroBusqueda.value` ya nunca cambia por su cuenta (queda
siempre vacío), las funciones `renderVentas()`/`renderMaquila()`/etc.
que todavía leen `const q = document.getElementById('filtroBusqueda').value`
para filtrar SU propia lista en la pestaña normal (no el modal) ahora
reciben siempre `q = ''` — `coincide(x, '')` da `true` siempre, así que
esas listas se ven normales, sin filtrar, como si nunca hubieras
buscado nada — es el comportamiento correcto (la pestaña de atrás no se
mueve mientras buscás), no hizo falta limpiar esas líneas, solo quedaron
inertes a propósito.

Paginación del modal aparte de la de cada pestaña (`paginas.busquedaVentas`,
`.busquedaMaquila`, `.busquedaGastos`, `.busquedaFinca`,
`.busquedaCuentasCobro`, `.busquedaClientes`) — para no pisar en qué
página estabas parado en la lista normal si abrís el buscador y lo
cerrás sin tocar nada.

`TABS_CON_BUSQUEDA` (qué pestañas muestran el buscador) sigue igual,
esconde/muestra `.busqueda-wrap` completo (el `<input>` Y el ícono
juntos) — antes solo escondía el `<input>`, así que en pestañas sin
buscador (como Resumen) quedaba el ícono 🔍 flotando solo, sin campo al
lado.

**Pagos parciales de Distribuidores, paquete por paquete**: un
Distribuidor a veces va pagando a medida que vende, no todo el pedido de
una — así que un pedido con `tipoCliente === 'Distribuidor'` puede
quedar "Pendiente" en general pero con ALGUNOS paquetes ya pagados.
Cada línea de café de `venta.items[]` ganó un campo nuevo opcional
`cantidadPagada` (nada de migración — `items` ya era una columna jsonb
genérica, así que el campo nuevo se guarda solo). Se edita SOLO desde
✎ Editar (`abrirEdicionVenta()` → `pintarEdicionCarrito()`), no al
registrar el pedido — cada línea de café muestra, solo si
`editTipoCliente === 'Distribuidor'`, un `.pagado-stepper` ("Pagado 3 de
10" con −/+) que llama a `cambiarPagadoItem(i, delta)`. Si con un clic
quedan TODOS los paquetes pagados, el desplegable "Estado" salta solo a
"Pagado" (con un toast avisando) — pero sigue siendo editable, no se
fuerza a guardar así ni se salta el guardarraíl de "elige quién recibió"
si falta.

`valorPagadoVenta(v)` es la función nueva que todo lo demás usa para
saber cuánto de una venta ya es plata real: si `estado === 'Pagado'`
devuelve el valor completo (como siempre); si no, suma
`valor × (cantidadPagada / cantidad)` de cada línea de café — $0 para
cualquier venta que nunca usó el stepper. **`calcularBalancePersonas()`
y `listaHuerfanos()` se actualizaron para usar esto** — antes
`recibidoVentas` solo contaba ventas con `estado === 'Pagado'` a valor
completo; ahora un Distribuidor con 3 de 10 paquetes pagados ya suma esa
parte al balance de quien la recibió, sin esperar a que pague el
pedido completo. El indicador "📦 X de Y paquetes pagados" en
`filaVenta()` (color azul, junto al de envío) solo aparece cuando hay
ALGO pagado pero no TODO — en $0 o al 100% el tag de siempre
(Pendiente/Pagado) ya cuenta toda la historia, no hace falta duplicar.

## Mejores clientes — Semanal/Mensual/Anual, cada uno con reglas distintas

`renderMejoresClientes()` (Resumen) rediseñado — antes las 3 vistas
(Semanal/Mensual/Anual) compartían UNA sola regla: promediar TODO el
histórico del cliente (sin importar el filtro de mes de arriba) y exigir
`mesesDistintos >= 2` (2 meses DISTINTOS con compras) para aparecer,
sin importar cuál vista estuvieras viendo — así que "Semanal" nunca
mostraba nada nuevo hasta que el cliente llevara 2 meses comprando, lo
cual no tiene sentido para un ranking semanal. Ahora cada vista es
distinta a propósito:

- **Semanal**: el ranking de la semana ACTUAL, de lunes a lunes
  (`inicioSemana()`, calcula el lunes 00:00 real en vez de la
  aproximación de "semana ISO" que había antes) — sin exigir historial,
  un cliente nuevo que compró esta semana ya sale.
- **Mensual**: el ranking del mes que esté elegido en el selector de
  arriba (`filtroMes`) — cambiar de mes ahí "viaja" el ranking a ese mes
  (antes esta tabla ignoraba el selector de mes por completo). Tampoco
  exige historial — apenas se cierra un mes, desde el día 1 del
  siguiente ya se puede consultar.
- **Anual**: la única que de verdad promedia varios períodos (plata
  promedio por mes en lo que va del año calendario actual) — y la única
  que SÍ exige `mesesDistintos >= MIN_MESES_ANUAL` (2, antes se llamaba
  `MIN_MESES_CLIENTE` y aplicaba a las 3 vistas por igual) porque un
  "promedio mensual" con un solo mes de datos todavía no dice nada. Ese
  promedio se recalcula solo cada vez que se cierra un mes más
  ("sucesivamente", como pidió Juan) — no hay que hacer nada especial,
  simplemente cuenta los meses del año actual que ya tienen ventas.

Los textos de la tabla/gráfica cambian según la vista: Semanal/Mensual
dicen "Total" (es la plata de ESE período nada más, no un promedio,
aunque por dentro se calcule igual dividiendo entre 1 período); Anual
dice "Prom." porque ahí sí es un promedio real. `clavePeriodo()` (la
función vieja que agrupaba por semana/mes/año para contar períodos) ya
no se usa y se quitó — cada vista ahora filtra directo por su propio
criterio en vez de agrupar genéricamente.

## Margen por lote, clientes en riesgo de fuga, proyección de inventario

Tres tarjetas nuevas (2026-09-21), pensadas para usar mejor datos que ya
existían en vez de agregar nada nuevo que llenar a mano:

- **Margen estimado por lote** (Resumen, `calcularMargenPorLote()`): como
  el balance de cuentas, es TODO el histórico, no el mes filtrado —
  comparar mes a mes no tendría sentido porque lo que se vende un mes casi
  nunca es lo que se cosechó ese mismo mes (entre secado, trilla y tueste
  pasan semanas). Ingreso: suma real de `itemsNormalizados()` por lote.
  Costo, 5 componentes (ampliado 2026-09-21, a pedido de Juan — antes solo
  tenía los primeros 2):
  1. Cereza comprada a terceros de ese proceso (costo real y directo).
  2. **Cosecha PROPIA valorada como si se hubiera comprado** — a falta de
     un costo de "comprar" la cosecha propia, se valora el pergamino
     (real si ya se pesó, si no la proyección genérica) al precio
     promedio de TODO el histórico guardado de `precioFnc`, al mismo
     factor 88 que se usa para pagarle a terceros
     (`precioPromedioPergaminoPropio()`) — simplificación a propósito: un
     promedio general en vez de por mes, porque `precioFnc` rara vez
     cubre exactamente los mismos meses que cada cosecha.
  3. Una porción de los gastos de finca (`state.finca`, TODOS) repartida
     proporcional a cuántos kilos de cereza PROPIA se cosecharon de cada
     proceso.
  4. **Tostón**: kilos tostados de ese lote (`state.tuestes`) ×
     `costosMargen.costoTostionKg`.
  5. **Bolsa**: por cada línea de venta de ese lote, cantidad × el costo
     de bolsa de esa presentación (`CLAVE_COSTO_BOLSA`, un valor por
     presentación — una Cuarterón gasta más bolsa que una Media lb).
  Los 5 componentes juntos siguen siendo una aproximación tipo costeo por
  actividad, no contabilidad exacta, por eso la tarjeta dice "estimado".
  Un lote con cosecha pero sin ventas todavía (ej. Natural recién
  cosechado) sale con margen negativo a propósito — sí tiene costo
  asignado, pero $0 de ingreso; no es un error, es literal.
- **Costos internos para el margen, editables** (Configuración → Precios,
  bloque "Costos para 'Margen estimado por lote'", justo después de
  Saldo inicial): tabla nueva `costos_margen`
  (`migracion_costos_margen.sql`, UNA sola fila con `id` fijo 1, se
  sobreescribe con upsert) — `costoTostionKg` + un costo de bolsa POR
  PRESENTACIÓN (`costoBolsaMediaLb`/`Libra`/`Kilo`/`Cuarteron`).
  **A propósito es un costo APARTE de las tarifas de Maquila** (que ya
  tenían Tostión/Bolsas configuradas, en `state.maquila`) — Juan
  confirmó que quiere poder tener un costo interno distinto de lo que le
  cobra a un cliente de maquila por el mismo servicio, así que NO se
  reusaron esas tarifas. `GET /api/costos-margen` devuelve todo en 0 si
  todavía no se ha guardado nada (el margen simplemente no resta por
  tostón/bolsa hasta que se configuren).
- **Clientes que podrían estar dejando de comprar** (Resumen, justo debajo
  de Mejores Clientes, `clientesEnRiesgo()`): clientes de café con 3+
  compras (ya no están "probando") que llevan `DIAS_RIESGO_FUGA` (60) días
  o más sin volver — usa `listaClientes()` tal cual, solo le agrega el
  filtro de días. Ordenados por `total` histórico de mayor a menor (a
  quién vale más la pena contactar primero), limitado a los 10 primeros.
- **Proyección de inventario** (Inventario, `proyeccionInventario()` +
  `velocidadVentaLote()`): bajo el stock de cada lote, un texto tipo "Se
  acaba en ~12 días al ritmo actual", calculado con los kilos vendidos de
  ese lote en los últimos `DIAS_VELOCIDAD_INVENTARIO` (30) días. Si la
  velocidad es casi cero (<0.05 kg/día) no muestra nada — no tendría
  sentido proyectar "dura 400 años" para un lote que casi no se mueve. Si
  faltan más de 90 días dice "Alcanza para más de 3 meses" en vez de un
  número exacto (a esa distancia el número ya no aporta, solo confirma que
  no es urgente). Este es un cálculo aparte del aviso de stock bajo que ya
  existía (`renderAlertaStock()`, fijo en <5 kg de Lavado) — ese sigue
  igual, esto es un complemento, no lo reemplaza.

## Tendencia de rendimientos y comparación año contra año

Dos vistas nuevas en Resumen (2026-09-21), pensadas para ver si el negocio
mejora en el tiempo, no solo cuánto lleva acumulado:

- **Gráfica "Rendimiento de cosecha, mes a mes"** (`tendenciaRendimientosPorMes()`,
  4ª gráfica de "Comportamiento en el tiempo", mismos botones de rango
  1/3/6/12 meses de las otras 3): a diferencia de `rendimientosReales()`
  (un solo promedio de TODO el histórico, usado para proyectar), esta
  parte el cálculo mes a mes para poder ver si el % de cereza→pergamino o
  pergamino→verde viene subiendo o bajando. Se agrupa por el mes de la
  FECHA DE COSECHA/COMPRA — no existe un campo separado de "cuándo se
  pesó", así que un registro pesado semanas después de cosechado igual
  cuenta en el mes de la cosecha, no en el del pesaje real. Meses sin
  ningún pesaje quedan como `null` (`spanGaps: true` en Chart.js, la línea
  salta el hueco en vez de caer a 0, que sería engañoso).
- **"Comparación año contra año"** (`comparacionAnual()`, justo debajo de
  las gráficas): agrupa por año calendario TODO el histórico — factura,
  egresos operativos (`esGastoOperativo`), balance, kilos cosechados y
  libras vendidas. Solo lista los años donde de verdad hay algo
  registrado (ventas o cosechas), así que con un negocio que recién
  empezó a usar la app puede salir un solo año — en ese caso se muestra
  igual (no tiene sentido ocultarlo) pero con una nota aclarando que
  todavía no hay con qué comparar; se va a volver más útil solo con el
  paso del tiempo, sin tocar código de nuevo.

## Órdenes de maquila — orden de servicios y estado de entrega

Los servicios de una orden de maquila (`mq-servicio`/`emq-servicio`, y el
agrupamiento de "Tarifas de maquila" en Configuración) antes salían en el
orden que devolvía la base de datos (alfabético) — Juan pidió un orden
fijo que sigue el proceso real: **Trilla, Tostión, Molienda, Empaque,
Bolsas (Negras/Ziploc), Transporte**. `ORDEN_SERVICIOS_MAQUILA` (junto a
`SERVICIO_TRANSPORTE`) fija ese orden; `ordenarServiciosMaquila()`
(desplegables) y `ordenServicioMaquila()` (para `.sort()` de pares
`[servicio, ...]` o de `state.maquila` directo) lo aplican en los 4
lugares donde se listan servicios: el desplegable de "Servicio" al
registrar una orden, el de editar una orden, "Tarifas de maquila" en
Configuración, y la hoja "Tarifas maquila" del Excel. Un servicio que no
esté en la lista (ej. uno nuevo que se agregue después) se va al final
solo, sin romper nada — no hace falta acordarse de actualizar esto cada
vez.

**Estado de entrega**, independiente del estado de pago — igual patrón
que ya existía en Ventas (`estadoEnvio`/`toggleEstadoEnvio`): columna
nueva `ordenes_maquila.estado_entrega` (`migracion_entrega_maquila.sql`,
default `'Pendiente'`), `estadoEntrega` en el SELECT/PATCH/POST del
backend, y en `filaOrdenMaquila()` un botón-etiqueta 📦 "Pendiente de
entrega" / ✅ "Entregado" (`toggleEstadoEntregaMaquila()`) — mismas clases
CSS `envio-pendiente`/`envio-enviado` que Ventas (esas clases ya eran
genéricas "azul = pendiente de algo" antes de esto, ver el mismo patrón
reutilizado en el historial de Tueste). No hay un campo para elegirlo al
registrar la orden — igual que el envío en Ventas, siempre arranca
"Pendiente" y se marca "Entregado" después, tocando el botón.

## Pasilla

Subproducto de baja calidad que sale al procesar la cosecha — a
diferencia de Lavado/Honey/Natural/Exótico, **no tiene su propia cosecha
con cereza**: se pesa como un campo aparte ("Kilos de pasilla",
opcional) en el mismo modal ⚖️ (`abrirPesarPergamino()`) donde se anota
el pergamino real de una cosecha existente, se guarda en
`cosechas.kilos_pasilla` (`migracion_pasilla.sql`), y el historial de esa
cosecha lo muestra junto al pergamino real ("pergamino real: 32.5 kg ·
pasilla: 2.3 kg"). El acumulado histórico (suma de `kilos_pasilla` de
todas las cosechas) se ve como una nota aparte debajo de las tarjetas de
"Cosecha & Tueste" (🫘 ... kg de pasilla acumulada), solo cuando hay algo
que mostrar — no es una 5ª tarjeta de stat para no desbalancear la
cuadrícula de 2x2.

De ahí en adelante sigue el mismo camino que cualquier lote — se tuesta
(subpestaña Tueste, escogiendo "Pasilla" como Lote, exactamente igual que
Lavado/Honey/etc. — `ajustar_stock_inventario` ya es genérico por nombre
de lote, no hizo falta tocar nada del backend de tuestes/inventario) y se
vende (Ventas, escogiendo "Pasilla" como Lote) — pero **solo se vende a
un puñado de clientes, sobre todo una empresa distribuidora**, nunca se
ofrece en el catálogo. Por eso existe `LOTES_VENTA` (`= [...LOTES,
'Pasilla']`), una lista aparte de `LOTES` que se usa SOLO en los 3
lugares donde Pasilla debe poder elegirse (el Lote de una línea de venta,
el Lote al editar una venta, el Lote de Tueste) — `LOTES` (sin Pasilla)
se queda igual en los 3 desplegables de "Proceso" (Cosecha, Cereza
comprada, Pergamino comprado), porque Pasilla no se cosecha aparte.
Tampoco se agregó a `QUICK_ADD` (los atajos ⚡ de Ventas, ya de por sí una
lista fija a mano, no derivada de `LOTES`) ni a `pedidos/index.html`
(que tiene su PROPIO `LOTES` independiente, sin tocar) — así queda fuera
tanto de los atajos rápidos como de la página pública, tal como pidió
Juan.

Pasilla **solo se vende en una presentación, Libra (500 g)** — el
desplegable de Presentación en Ventas (`ln-presentacion`/
`em-ln-presentacion`) normalmente ofrece las 4 de siempre
(`PRESENTACIONES`), pero `presentacionesDeLote(lote)` lo reduce a solo
`['Libra']` cuando el lote elegido es Pasilla — se llama desde
`onLnLoteChange()`/`onEmLnLoteChange()`, el mismo sitio que ya
mostraba/ocultaba el campo de Tostión según si el lote es Lavado.

**Precio**: solo tarifa de distribuidor, $22.000 la Libra —
`migracion_pasilla.sql` inserta las 4 filas de presentación (Media
lb/Kilo/Cuarterón en $0, Libra en $22.000) SOLO en `tipo_cliente =
'distribuidor'`; no se crean filas `normal` ni `web` a propósito, para
que Pasilla no aparezca ni en "Precio normal" de Configuración ni pueda
llegar nunca a la tarifa pública. Como Configuración → Precios
(`renderConfig()`) solo edita filas que YA EXISTEN en `precios_cafe`
(no hay forma de crear un precio nuevo desde la UI, siempre ha sido así
para los 4 lotes de siempre porque ya venían todos sembrados) hizo falta
la migración para que "Pasilla" aparezca ahí. De paso, `renderConfig()`
se blindó para no mostrar un encabezado "Precio normal"/una sección web
completamente vacíos cuando un lote (como Pasilla) no tiene filas en esa
tarifa — antes nunca se había dado el caso porque los 4 lotes de siempre
siempre tienen las 3 tarifas sembradas aunque sea en $0.

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

**Compras en varios días, mismo proveedor (📏 + 💰, 2026-09-21)**: un
proveedor como Don Leo a veces trae cereza día tras día, y antes no
había forma de ir sumando a la misma compra — había que crear una
nueva cada día. Ahora `compras_cereza.pesajes` (jsonb,
`migracion_pesajes_cereza.sql`) guarda cada pesada
(`{ fecha, kilos }`); `kilos_cereza` SIGUE siendo el total (la suma de
`pesajes`), así que nada del resto de la app (`rendimientosReales()`,
margen por lote, Excel) tuvo que tocarse.

- **📏 "Pesajes"** (`abrirPesajes()`/`guardarPesajes()`, reescrito
  2026-09-23 — antes `abrirAgregarPesaje()`/`guardarPesaje()` solo
  dejaba AGREGAR, nunca corregir uno que se anotó mal sin borrar toda
  la compra): abre un modal con un campo fecha+kilos por cada pesaje ya
  guardado (editables ahí mismo), un botón "+ Agregar otro día", y ✕
  para quitar alguno si sobra — todo en un buffer aparte
  (`pesajesEdit`, no toca `state` hasta darle Guardar). Al guardar,
  `kilosCereza` se recalcula como la suma de lo que haya quedado.
  Disponible SIEMPRE, incluso con la compra ya pagada — a diferencia de
  antes, porque un error se puede notar después de pagar y hay que
  poder corregir el registro igual (Juan: "debo poder editar los
  totales"). Compras viejas sin `pesajes[]` se tratan como un solo
  pesaje sintético (`{ fecha: c.fecha, kilos: c.kilosCereza }`) para
  que el modal tenga de dónde partir.
- **✎ "Editar"** (`abrirEdicionCerezaComprada()`/
  `guardarEdicionCerezaComprada()`, nuevo 2026-09-23): proveedor,
  proceso, fecha, costo, quién pagó y notas — antes no había ninguna
  forma de corregir esto (ni el costo ni quién pagó) una vez
  registrado, había que borrar y volver a crear la compra entera. A
  propósito NO edita `kilosCereza` (eso sigue gobernado por 📏
  Pesajes, para que el total nunca quede desalineado de la suma de sus
  pesajes). Disponible siempre, como 📏.
- **💰 "Completar pago"** (`abrirCompletarPagoCereza()`): calcula
  cuánto pagar por TODO lo acumulado, usando el precio de referencia
  de HOY (el día que se completa el pago — **no** el de cada pesaje
  individual, así lo pidió Juan) al factor que siempre pagan
  (`FACTOR_COMPRA_CEREZA = 88`, editable en el modal por si algún día
  negocian otro). Fórmula: `kilosCereza → proyectarDesdeCereza()` (el
  mismo rendimiento aprendido de siempre) `→ kg pergamino equivalente
  × precioPergaminoPorFactor(factor).precioKilo` (la MISMA función que
  usa la calculadora de Resumen — un solo lugar con la fórmula del
  factor, no duplicada). El costo calculado queda en un campo editable
  (por si hay que ajustar a mano), y "Quién pagó" es obligatorio antes
  de guardar — mismo guardarraíl que el resto de la app.
- Compras viejas (de antes de este cambio) no tienen `pesajes` —
  `(c.pesajes || [])` en todo el código lo trata como 0 pesajes, sigue
  funcionando igual, solo no muestra el historial día a día.

**⚖️ Pesar en conjunto — cosecha propia + cereza comprada se despulpan
juntas (2026-09-21)**: Juan explicó cómo se procesa realmente — la
cereza comprada a terceros (ej. Don Leo) se despulpa el mismo día junto
con la cosecha propia, así que el pergamino que se pesa después es UNO
SOLO para todo lo que se despulpó junto, no se puede separar
físicamente por fuente. Antes cada ⚖️ (uno en Cosechas, otro en Cereza
comprada) solo sabía pesar SU propio registro — no había forma de
reflejar esto sin inventar un peso por separado.

Los dos botones ⚖️ ahora llaman a la MISMA función,
`abrirPesarConjunto(tipoOrigen, idOrigen)` (`tipoOrigen`: `'cosecha'` o
`'cerezaComprada'`) — reemplazó a `abrirPesarPergamino()` /
`abrirPesarPergaminoCompra()`, que ya no existen:

- Si no hay otras entradas SIN pesar del mismo `proceso` (ni en
  `cosechas` ni en `cerezaComprada`), el modal se ve exactamente igual
  que antes — un solo campo de kilos pesados, nada más.
- Si sí las hay, aparece una lista con checkboxes (`entradasSinPesar()`
  junta ambas tablas) para marcar cuáles se despulparon con esta. El
  pergamino que se pese es el TOTAL de lo combinado — la app lo reparte
  proporcional a los kilos de cereza que aportó cada una:
  `su_pergamino = pergamino_total × (sus_kilos_cereza / kilos_cereza_total)`.
- **Los registros NUNCA se fusionan ni se borran** (a diferencia de
  `unirCosechas()`, que sí fusiona cosechas ENTRE SÍ) — cada uno se
  queda separado, solo con su `kilosPergaminoReal` repartido. Es
  intencional: fusionar una cereza comprada dentro de una cosecha
  perdería a quién hay que pagarle (proveedor/costo); fusionar una
  cosecha dentro de una compra descuadraría cuánto cosechó la finca de
  verdad — ambas cosas ya estaban prohibidas antes de este cambio (ver
  el bullet de arriba, "sin mezclarse con cosechas").
- La pasilla (campo que solo existe en `cosechas`, no en
  `compras_cereza`) se sigue anotando igual, pero solo se le asigna al
  registro desde el que se abrió el modal (el "origen") — no se reparte
  proporcional como el pergamino. Simplificación a propósito: la pasilla
  es un byproducto chico, no vale la pena la complejidad de repartirla
  también.
- **"Completar pago" (💰) ahora prefiere el peso real** cuando ya existe
  (`c.kilosPergaminoReal != null`, así haya llegado de un pesaje
  conjunto/repartido) en vez de la proyección genérica de
  `proyectarDesdeCereza()` — más preciso para calcular cuánto pagarle a
  alguien, que es plata real. El modal deja ver cuál de las dos está
  usando (dice "(pesado real)" o "(estimado)").

## Conciliación bancaria (Configuración → Conciliar banco)

Herramienta nueva (2026-09-21) para subir el extracto que se descarga del
banco (.csv) y compararlo contra lo ya registrado en la app — para
encontrar transferencias que falten por anotar o que no cuadren. A
propósito NO se guarda nada en Supabase, no hay tabla ni endpoint nuevo:
todo el archivo se lee y se compara en el navegador (`parsearCSV()`,
`conciliarExtracto()`), es un reporte de una sola vez cada vez que se
sube un archivo — nunca conectamos una cuenta bancaria real ni manejamos
credenciales, eso no es algo que se pueda ni se deba automatizar aquí.

- **No hay "el" formato de extracto** — cada banco colombiano nombra sus
  columnas distinto (Bancolombia, Nequi, etc.), así que en vez de adivinar
  en silencio y arriesgarse a comparar la columna equivocada,
  `bloqueConciliacion()` SIEMPRE muestra 3 desplegables (fecha,
  descripción, valor) con las columnas del archivo — `adivinarColumna()`
  preselecciona la más probable por el nombre del encabezado, pero el
  usuario puede corregir antes de darle "Comparar". `parsearCSV()`
  detecta solo (coma o punto y coma) cuál separador usa el archivo,
  contando cuál aparece más veces en el encabezado.
- `parsearValorExtracto()` siempre devuelve el valor ABSOLUTO — no se
  intenta adivinar si el banco marca los egresos con signo negativo o con
  una columna aparte de "Débitos", eso varía demasiado. Por eso
  `conciliarExtracto()` tampoco distingue ingreso de egreso: compara cada
  fila del extracto contra TODO lo marcado Pagado en el mes (ventas +
  maquila + gastos operativos + finca) con un método que sí pasa por el
  banco (`metodo !== 'Efectivo'` en ventas/maquila, `pagadoPor !==
  'Efectivo'` en gastos/finca — el efectivo nunca va a aparecer en un
  extracto). El emparejamiento es por valor exacto (tolerancia de $1 por
  redondeo) y fecha ±3 días (el banco a veces consigna un día después de
  lo registrado en la app).
- Tres resultados, no solo "coincide/no coincide": **coincidencias**
  (para confirmar que sí cuadra), **en el extracto pero no en la app**
  (probablemente falta anotar algo), y **en la app pero no en el
  extracto** (está marcado Pagado pero no aparece en ESTE extracto — puede
  ser de otra cuenta, o que en realidad no haya entrado/salido todavía).
- Si dos movimientos reales tienen el mismo valor y caen en la misma
  fecha (ej. dos ventas de $100.000 el mismo día), el emparejamiento toma
  el primero que encuentra — no hay forma de distinguirlos solo con
  monto+fecha, sin un número de referencia no se puede hacer mejor que
  eso. No es un bug, es un límite real de conciliar así.

## Cuentas de cobro (módulo formal, con membrete)

Pestaña "Cuentas de cobro" en el sidebar, independiente de los recibos
simples de venta. Sirve tanto para clientes de café como de maquila (desde
cada orden hay un botón 📋 que prellena el formulario).

- El PDF reproduce el membrete real: logo gris (recorte del PDF que Juan
  compartió, `LOGO_CUENTA_COBRO_B64`), datos de contacto del NEGOCIO
  (dirección/ciudad/teléfono/email — `EMISOR_DIRECCION` etc., no cambian
  con el titular), cliente que debe / "DEBE A", el monto en letras
  (función `numeroALetras()`, formato legal colombiano tipo "VEINTIÚN MIL
  PESOS MCTE"), tabla de conceptos, y datos bancarios.
- **Se puede emitir a nombre de Juan David o de Inés** — selector "A
  nombre de" (`cc-titular`) en el formulario, guardado en
  `cuentas_cobro.titular` (`'juan'`/`'ines'`, `migracion_titular_cuenta_cobro.sql`;
  filas viejas sin valor se tratan como `'juan'`). `TITULARES_CUENTA_COBRO`
  en `index.html` tiene el nombre/cédula/cuenta bancaria de cada uno —
  eso es lo único que cambia por titular en el "DEBE A" y en los datos
  bancarios del PDF. Ambos tienen **firma real recortada de una foto**
  (`FIRMA_B64` para Juan, del PDF de su membrete; `FIRMA_INES_B64` para
  Inés, de una foto que mandó — cada `titular.firma` en
  `TITULARES_CUENTA_COBRO` trae `{ b64, ancho, alto, incluyeNombre }`, el
  alto varía porque cada recorte tiene su propia proporción). La firma de
  Juan ya trae su nombre y cédula escritos dentro de la misma imagen
  (viene de su membrete real, `incluyeNombre: true`); la de Inés es solo
  el trazo, así que `generarPdfCuentaCobro()` imprime su nombre y cédula
  aparte, debajo de la imagen (`incluyeNombre: false`), para que el PDF
  quede completo igual que el de Juan. Si algún día un titular no tiene
  firma todavía, cae a escribir el nombre + cédula en el espacio de la
  firma en vez de una imagen (rama `else` de `if (titular.firma)`).
- Cada cuenta de cobro queda numerada (el `id` autoincremental de la tabla
  `cuentas_cobro`) y guardada en un historial con botón para volver a
  descargar el PDF sin tener que rehacerlo — la fila del historial muestra
  a nombre de quién quedó cada una.
- **Costo de envío/transporte (opcional)**: checkbox "Incluir costo de
  envío (transporte)" (`cc-incluye-transporte`, muestra/oculta el campo
  `cc-transporte` vía `actualizarTransporteVisible()`) — el campo interno
  y la columna se siguen llamando `transporte`, pero en el PDF la línea
  dice **"Envío"** (así lo pidió Juan, para que coincida con el formato
  que ya usaban a mano). Se suma al total (`cuentas_cobro.transporte`,
  `migracion_transporte_cuenta_cobro.sql`). En el PDF aparece como su
  propia línea junto a Subtotal/TOTAL (a la altura del Subtotal, a la
  izquierda, va la nota — texto exacto que pidió Juan: "NOTA: El envío es
  un servicio prestado por otra empresa, no tener en cuenta para
  retención."). La línea "Otros" solo se imprime si `cc.otros > 0` — antes
  siempre salía aunque fuera $0.
- El NIT/cédula se guarda en `clientes.nit_cedula` la primera vez y se
  sugiere solo la próxima vez que se escribe el mismo nombre — sin pisar el
  `tipo_cliente` (normal/distribuidor) si el cliente ya existía.
- El directorio de sugerencias del campo "Cliente" combina
  `listaClientes()` + `listaClientesMaquila()` (función
  `listaClientesTodos()`), pero el nombre no tiene que existir en ninguno
  de los dos — sirve para clientes institucionales que solo piden cuenta
  de cobro (como el caso de prueba de Juan, FUCAI).

## Identidad visual de `pedidos/index.html` (paleta de la carta real)

Clientes decían que la página de pedidos se veía genérica, "hecha con
IA" — le restaba prestigio a la marca. La causa: usaba una paleta
inventada (café/verde/terracota, y encima un color DISTINTO por cada
lote — teal para Lavado, dorado para Honey, terracota para Natural,
morado para Exótico) que no tenía nada que ver con la carta real que
Juan les manda a los clientes ("Lista de precios 2026").

Se sacó la paleta exacta de esa carta (muestreando los colores reales de
la imagen, no a ojo) y se puso en `:root` de `pedidos/index.html`:
- `--crema`/`--crema-alt`: el fondo cálido de la carta.
- `--cafe`: casi negro (el mismo tono de los precios en la carta) — antes
  era un café rojizo más genérico.
- `--teal` (`#274652`): nombres de lote y títulos ("LAVADO", "HONEY",
  "NATURAL" en la carta van todos del mismo color, no uno por lote).
- `--dorado` (`#D6A23A`): presentaciones/acentos ("MEDIA LIBRA", "2026" en
  la carta van en este dorado).

Los 4 colores por-lote (`--lavado`/`--honey`/`--natural`/`--exotico`) y
`--verde`/`--terracota` se eliminaron — **un solo sistema de marca para
todos los lotes**, igual que en la carta real, no una paleta distinta por
cada uno. `.pres-nombre` (MEDIA LB, LIBRA…) quedó en dorado mayúscula, y
`.pres-precio` pasó de gris pequeño a negro grande y en negrita — antes
el precio se veía deslucido, ahora tiene la misma presencia que en la
carta impresa.

También se agregó una guía de 4 pasos (`.guia-pasos`, debajo del
encabezado: "① Elige tu café ② Cantidad y molienda ③ Revisa tu pedido
④ Confirma por WhatsApp") — CSS/HTML puro, sin lógica nueva, para que el
flujo de pedido se sienta más guiado a simple vista, que era el otro
comentario de los clientes ("más didáctica a la hora de pedir").

No se tocaron fotos de producto (ver bullet de "Fotos reales de bolsa"
en Pendiente) — el problema era de color/tipografía, no de imágenes.

**Molido/En grano en botones, no en `<select>`**: cada `.pres-fila` tenía
un `<select class="molienda-select">` — se cambió a dos botones
(`.molienda-toggle` → `.molienda-btn`, dorado cuando está activo, igual
que el resto de acentos de la marca). `cambiarMolienda(lote, presentacion,
valor, btn)` ahora recibe también el botón que se clickeó, para quitarle
`.activo` a su hermano y ponérselo a él — antes eso lo hacía solo el
`<select>` nativo, ahora hay que hacerlo a mano.

**Marca de agua del armadillo**: Juan mandó el PDF vectorial con los
recursos gráficos reales de la marca (`Recurso Gráficos Pocillo.pdf` —
el armadillo del isotipo, el logo limpio, y unas ramas de café en
dorado). Se extrajo el armadillo (página 1 del PDF, recortado a su
bounding box real, achicado y con la paleta reducida para que el PNG en
base64 no pese tanto) y se puso como `<img class="marca-agua">` — fijo
(`position: fixed`, no se mueve al hacer scroll), centrado, `opacity:
.05`, `pointer-events: none`, detrás de todo (`.wrap` tiene `z-index: 1`
para quedar por encima). Reproduce el mismo efecto de fondo casi
invisible que tiene la carta real. El logo del isotipo y las ramas de
café del mismo PDF no se usaron todavía — quedan disponibles si más
adelante se quiere decorar algo más (ej. la pantalla de confirmación).

**Tarjeta-bolsa interactiva (Lavado)**: Juan mandó `Bolsa.pdf` — el arte
de impresión real de la bolsa de Lavado (2 páginas, vectorial, línea
negra sin relleno; la página 2 es la cara de atrás/ficha técnica, no se
usó). Primer intento: pegar el arte sobre un kraft de fondo y tratarlo
como una foto de producto arriba de la lista de siempre — Juan pidió ir
más allá: que la bolsa misma sea la interfaz de pedido (el "peso neto"
desplegable, molido/en grano seleccionable), no una imagen decorativa.
Por eso el kraft de fondo y el arte quedaron SEPARADOS:

- El arte (recortado a solo logo + ilustración árbol/sol/montaña/finca +
  arco "100% CAFÉ DE ORIGEN", sin el bloque de "PESO NETO"/perfil de
  taza/tostión de la página 1 porque eso es específico de una
  presentación) se recoloreó de negro puro a café oscuro (`#3B3025`) y se
  guardó SIN fondo, transparente — `BOLSA_LAVADO_B64` (PNG) en
  `BOLSAS_LOTE.Lavado`.
- El kraft (degradado `#DABB93` → `#9E7E4E`, colores muestreados de una
  foto real de las bolsas en Instagram, no inventados), los pliegues
  laterales, y el cierre zip son CSS puro (`.tarjeta-bolsa`, `.bolsa-zip`,
  `.bolsa-cuerpo::before/::after`) — no están horneados en la imagen, así
  el panel de controles de abajo puede compartir la misma superficie
  continua sin que se note la costura.

`pintarCatalogo()` llama a `tarjetaBolsaHTML()` cuando el lote tiene
`BOLSAS_LOTE[lote]` (si no, cae a `tarjetaListaHTML()`, la tarjeta de
texto de siempre — así siguen Honey/Natural hasta que Juan mande esa
bolsa). Dentro de `.tarjeta-bolsa`, debajo del arte, `panelBolsaHTML()`
pinta sobre el mismo kraft:
- **"PESO NETO" como desplegable real**: `.bolsa-peso-bar` (botón negro
  redondeado, como la franja impresa) muestra la presentación elegida
  (`pesoSeleccionado[lote]`, clave nueva) y al tocarlo abre
  `.peso-pills` (`togglePesoPills()`) con las presentaciones disponibles;
  elegir una (`elegirPeso()`) repinta solo `#bolsa-panel-${lote}` — no
  toca el carrito, solo decide qué combinación lote|peso están editando
  ahora mismo la molienda y el contador de abajo.
- **Molido/En grano y el contador +/−** son los MISMOS
  `cambiarMolienda()`/`cambiarCantidad()` que usa la tarjeta de lista —
  reciben `pesoSeleccionado[lote]` en vez de un valor fijo por fila, así
  que no hubo que duplicar la lógica del carrito, solo la plantilla.
- Cambiar de peso no pierde nada: cada combinación lote|peso|molienda es
  su propia línea en `carrito` (igual que ya pasaba entre molido/en
  grano), así que un cliente puede pedir Media lb Y Kilo en el mismo
  pedido pasando por el desplegable dos veces — se probó armando ambas
  líneas y confirmando que las dos sobreviven y sale bien en "Tu pedido".

**Tarjeta-bolsa compartida (Honey/Natural)**: Juan mandó
`PANDORAESPECIALFEB2026.pdf` — la bolsa real de Honey y Natural (4
páginas: portada, 2 gussets laterales dorados que no se usaron, y la cara
de atrás con descripción/QR que tampoco se usó). A diferencia de Lavado,
esta portada ya viene a todo color sobre fondo crema (no negra sobre
kraft), así que no hubo que recolorear nada — solo recortar y volver
transparente el fondo crema (`key_out_cream()`, keying suave por
distancia de color para no dejar bordes duros). La portada traía un
selector "PROCESO: ○ Natural ○ Honey ○ Lavado" — Juan pidió quitar
"Lavado" de ahí porque esa ya tiene su propia bolsa tradicional (más
arriba) y esta bolsa es solo para Honey/Natural; como el PESO/PROCESO/
PRESENTACIÓN de la etiqueta no se usan como imagen (son controles reales,
igual que en Lavado), ese recorte fue automático: simplemente no se
usaron esas tres filas de la portada, y el selector de proceso que sí se
construyó en HTML solo ofrece Natural/Honey.

Dos piezas (`HONEY_BADGE_B64`: arco + círculo + armadillo + cinta
"Café Pandora"; `HONEY_RAMA_B64`: una rama de café decorativa, USADA DOS
VECES — arriba tal cual y abajo volteada con `transform: scaleY(-1)`,
para no duplicar el peso del archivo con dos imágenes casi iguales).

⚠️ *Gotcha real que costó tiempo*: el PDF traía una línea de corte de
impresión pegada al borde izquierdo Y al borde derecho de la página
(los últimos ~3-5px de cada lado, casi negra) — al recortar a todo lo
ancho de la página, esa línea quedó incluida y se veía como una raya
vertical rara atravesando toda la tarjeta. Se detectó comparando cuántas
filas tenían un píxel oscuro en cada columna (`col_frac` cerca de 1.0 =
línea constante, a diferencia del contenido real que varía por fila) y
se arregló recortando ~16px del lado izquierdo y ~6px del derecho antes
de todo lo demás. Si se procesa OTRA bolsa nueva y aparece una raya
vertical parecida, revisar esto primero antes de sospechar de CSS.

⚠️ *Otro gotcha real, esta vez sí de CSS*: en la tarjeta-bolsa de Lavado
(kraft), el botón de molienda/peso elegido no se veía resaltado en
dorado — Juan lo reportó después de probarlo. Causa: la regla que pinta
el fondo translúcido normal (`.tarjeta-bolsa .bolsa-panel .molienda-btn`,
3 clases) tenía MÁS especificidad que la regla base
`.molienda-btn.activo` (2 clases) que sí pinta el dorado — así que la
translúcida ganaba siempre, sin importar si el botón tenía `.activo` o
no. En la tarjeta clara (Honey/Natural) nunca pasó porque ahí no existe
un override de `.molienda-btn` sin `.activo`, así que el botón usa
directo la regla base con el dorado. Arreglado agregando una regla
`.activo` aparte, con MÁS especificidad que la translúcida
(`.tarjeta-bolsa .peso-pill.activo, .tarjeta-bolsa .bolsa-panel
.molienda-btn.activo`). Moraleja para la próxima bolsa que se agregue:
cualquier override de color "no elegido" necesita su propio override de
"elegido" al lado, con más clases en el selector — no basta con que
exista `.algo.activo` en otro lado del archivo.

`tarjetaBolsaGrupoHTML(procesos)` arma la tarjeta (`.tarjeta-bolsa-clara`
— mismo patrón que `.tarjeta-bolsa` de Lavado pero con fondo crema en vez
de degradado kraft, **`padding: 0` explícito** — se le olvidó una vez y
la imagen quedó con el padding de 16px que trae `.card` por defecto, se
veía como un borde/línea rara — mismo síntoma que el gotcha de arriba
pero por CSS, no por el PDF, hay que descartar los dos). Dentro,
`panelBolsaGrupoHTML(procesos)` pinta, ADEMÁS de peso/molienda/cantidad
(igual que la tarjeta de un solo lote), una fila `.proceso-pills`
arriba de todo — elegir un proceso (`elegirProceso()`) es la MISMA idea
que `elegirPeso()`: no toca el carrito, solo cambia una variable
(`procesoActivo`) que decide qué lote maneja ahora mismo el resto del
panel, y repinta. `pesoSeleccionado`/`moliendaSeleccionada`/`carrito`
siguen guardando a Honey y Natural como lotes totalmente independientes
(claves separadas), así que un cliente puede pedir de los dos procesos
en el mismo pedido cambiando el selector — probado armando líneas de
Honey Y Natural a la vez y confirmando que ambas sobreviven en el
carrito sin pisarse.

## Rediseño de lujo de `pedidos/index.html` (2026-09-21, en curso)

Segunda vuelta de identidad visual — la anterior (sección de arriba)
sacó la paleta/tipografía real de la carta; esta suma una capa de
storytelling editorial ENCIMA de esa base, sin tocar la lógica de
carrito/checkout de WhatsApp. Hay un plano maestro completo (Artifact
"Café Pandora — Plano Maestro de Lujo", pedido por el usuario como
brief de diseño) con el análisis de marca/público/competencia completo
— esta sección documenta lo que ya se construyó de ese plano.

- **Fuente serif nueva**: `--serif: 'Fraunces', Georgia, serif;` (Google
  Fonts, sumada al `<link>` que ya traía Outfit/Baloo 2) — **solo** para
  momentos grandes (títulos de sección, números, el h3 de cada lote),
  nunca para párrafos ni controles de UI densos (eso sigue en Outfit).
- **Hero** (`<section class="hero">`, antes de `.wrap`): título grande en
  serif + foto real de la finca (`pedidos/img/finca-flor.jpg`) en vez del
  arte de bolsa que estaba antes ahí. `.hero` tiene su PROPIO
  `background: var(--crema)` opaco — sin eso, la marca de agua fija
  (`.marca-agua`, 5% de opacidad en TODO el sitio) se veía cruzar justo
  detrás del título grande, mucho más notoria que su opacidad real
  porque no hay texto denso tapándola ahí (en el resto del sitio el
  contenido ya es denso encima, por eso nunca se notaba antes).
- **Dato duro** (`<section class="dato-duro">`, fondo oscuro `var(--cafe)`
  + foto real de la ladera sembrada `pedidos/img/finca-ladera.jpg` con
  degradado oscuro encima para que el texto se lea): nombre y dirección
  REALES de la finca — **Finca Pitalito, Km 1 vía Los Mangos, Pital de
  Combia** (Pereira, Risaralda) — confirmados por el usuario el
  2026-09-21. ⚠️ *Ojo, esto costó un error real*: al principio se usó
  "Finca Tinajas" / "vía Marsella" (la dirección de `EMISOR_DIRECCION` en
  `index.html`, usada en las cuentas de cobro) asumiendo que era la
  misma finca — el usuario corrigió que es una dirección DISTINTA a la
  finca real. `EMISOR_DIRECCION` se dejó tal cual a propósito (el usuario
  confirmó no tocarla, puede ser una dirección de correspondencia
  distinta a la finca) — la corrección solo aplicó aquí y en
  `UBICACION_FINCA` (clima, en `index.html`).
- **Proceso** (`<section class="proceso-seccion">`, fondo `--crema-alt`,
  entre Dato duro y el catálogo): 4 pasos cortos (Cereza → Secado →
  Trilla → Tueste) con número grande en serif + dorado, SIN foto por
  paso — solo hay 2 fotos reales de la finca (Hero y Dato duro),
  reusarlas de nuevo aquí se sentiría relleno/repetido. El dato "de 7 a
  35 días de secado según el proceso" es real (mismos días que
  `DIAS_SECADO` en `index.html`: Lavado 7, Honey/Natural 35) — seguro de
  compartir públicamente, es contexto de calidad, no dato sensible del
  negocio.
- **Header chico simplificado**: el `<header>` original (logo circular +
  "Café Pandora" + tagline) se sentía como "empezar de nuevo" justo
  después del Hero y el Dato duro, que ya cubren esa presentación en
  grande. Se reemplazó por un `<header class="header-slim">` con solo
  "Arma tu pedido" en serif — el logo circular que tenía (mismo base64
  que ya usa el favicon en `<head>`, estaba duplicado) se eliminó del
  todo, no solo se ocultó.
- **Revelado por scroll**: clase `.revela` (opacidad + `translateY`,
  vía `IntersectionObserver`, función `iniciarRevelado()`) en los
  bloques del Hero/Dato duro/Proceso — respeta
  `prefers-reduced-motion: reduce` (sin la clase, todo se ve estático).
- **Fotos reales = archivo aparte, NO base64 inline**: a diferencia de
  TODO el resto de imágenes de este archivo (logos/arte de bolsa,
  vectoriales, embebidos en base64 porque son chicos y el proyecto no
  tiene build), las 2 fotos reales de la finca viven en `pedidos/img/`
  como archivos JPG normales, referenciadas con `<img src="img/...">` o
  `url('img/...')` en CSS. Inlinear una foto de ~400 KB en base64 la
  infla ~33% más y hace el archivo mucho más pesado de editar — para
  fotos reales, archivo aparte; para arte/logos vectoriales pequeños,
  base64 sigue siendo la norma acá.
- **"Colores y letras" extendido a la zona de selección** (pedido
  explícito del usuario): las etiquetas pequeñas en mayúscula
  (`.bolsa-peso-bar .etiqueta` "PESO NETO", `.proceso-titulo`,
  `.pres-nombre`) pasaron de `letter-spacing: .2-.4px` a `1px` y de
  colores apagados (opacity/cafe-soft) a los acentos reales de marca
  (dorado sobre fondo oscuro, teal sobre fondo claro) — mismo lenguaje
  del `.hero-kicker`.
- **⚠️ El kraft de la tarjeta-bolsa de Lavado (`.tarjeta-bolsa`, con
  cierre zip y pliegues) YA NO SE USA — esto reemplaza lo que decía la
  sección "Tarjeta-bolsa interactiva (Lavado)" más arriba.** El usuario
  vio la ilustración SOLA (sin el kraft alrededor) en el Hero, mientras
  se probaba esa sección, y pidió llevar ese mismo tratamiento limpio a
  la tarjeta de compra — "se veía más pro". `tarjetaBolsaHTML()` (Lavado)
  ahora usa `class="card tarjeta-bolsa-clara"`, el MISMO fondo crema
  simple que ya usaba Honey/Natural, sin `.bolsa-zip` ni los pliegues
  `.bolsa-cuerpo::before/::after` (esas reglas CSS se borraron). Un solo
  tratamiento visual para los 3 lotes, no uno distinto por lote. El
  degradado kraft (`.tarjeta-bolsa`) y sus overrides de color quedaron
  como CSS sin usar — no se borraron por si se necesitan para un lote
  nuevo algún día, pero ningún template los usa ahora mismo.
- **Selección 3 veces** (lavado, trilla, tueste) tejida en la
  descripción de cada paso de Proceso — dato real que pidió agregar el
  usuario, no una nota aparte.
- **Pendiente de este rediseño**: sección "Los lotes" (Lavado/Honey/
  Natural como capítulos editoriales, con su arte real) del plano
  maestro todavía no se construyó — por ahora las tarjetas del catálogo
  ya cumplen parte de ese rol (cada una ya muestra su arte real), así
  que no es urgente. Fase 6 (pulido de animaciones + prueba en celular
  real) y Fase 7 (QA con pedido real) del plano maestro tampoco se han
  hecho todavía — lo construido se probó en el preview local
  (`mock_pedidos_server.py`, puerto 8787), no en el sitio real.

## Auditoría CRO 2026-09-21 — fricciones resueltas en pedidos y app interna

Se le pidió a Claude actuar como especialista en CRO auditando el sitio
terminado — recorrido completo, fricciones, dudas sin resolver, y una
lista priorizada de mejoras (queda documentada como un Doc de Claude, no
en este repo). El usuario aprobó implementar todo ("vamos con todo"). No
requiere ninguna migración nueva — todo lo de acá es texto/CSS/JS o lee
el schema que ya existe.

**Transparencia de envío y pago, antes de pedir los datos**
(`pedidos/index.html`, `.confianza-pedido`, justo antes de la tarjeta
"Tus datos"): la auditoría encontró que NINGÚN paso del recorrido decía
cómo es el envío, qué medios de pago se aceptan, ni que el botón final
es para coordinar y no un pago inmediato — el cliente se enteraba de
todo eso solo después de escribir por WhatsApp y esperar respuesta. El
bloque nuevo no inventa cobertura ni costo exacto de envío (eso lo
sigue confirmando cada conversación real) — solo dice CÓMO funciona
("coordinamos contigo la entrega o el envío por transportadora, según
tu ciudad"), qué medios de pago existen (efectivo/transferencia/Nequi,
los mismos que ya usa el negocio — ver `METODOS_PAGO` en `index.html`),
y que el WhatsApp es para coordinar, no pagar ahí mismo.

**Señal de confianza adelantada al Hero**: "💬 Respondemos por WhatsApp
en menos de una hora" antes solo aparecía en la pantalla de confirmación
(el último paso, ya con el cliente comprometido) — ahora también está en
el Hero, justo debajo de los 2 botones, para resolver la duda de "¿esto
es serio?" antes de elegir nada.

**Prueba social real en el Hero** ("☕ +1.000 pedidos de café entregados
este año"): dato real que dio Juan (no el conteo de `pedidos_web`
convertidos, que solo cuenta lo que entra por la página web — la
mayoría de los 1000+ pedidos son por otros canales). Texto fijo en
`pedidos/index.html`, no calculado — si el número cambia con el tiempo,
hay que actualizarlo a mano ahí. (Se había construido primero una versión
que SÍ calculaba en vivo contando `pedidos_web.estado = 'convertido'` vía
un endpoint público nuevo — se descartó apenas Juan dio el número real,
porque ese conteo web-only iba a mostrar un número mucho más chico y
menos representativo que la cifra real del negocio; el endpoint
`functions/api/pedidos-web/stats.ts` que se alcanzó a crear para eso ya
se borró, no quedó código sin usar.)

**Tour de café en la finca** (`.tour-finca`, sección nueva entre Proceso
y "Arma tu pedido"): dato real que Juan compartió y no estaba en ningún
lado del sitio — $90.000, incluye merienda, café en barra libre y
catación de café, dura aprox. 4 horas, se puede coordinar con almuerzo.
Tiene su propio botón de WhatsApp (mismo patrón que el banner de
Exóticos) en vez de sumarse al carrito — es una experiencia que se
coordina, no un producto con precio fijo por presentación/cantidad.

**CTA principal más explícito** ("Ver el catálogo →" → "Comprar café
→"): cambio pedido directamente por una clienta real que Juan
compartió ("podrías colocar un botón bien claro que dijera: ver café o
comprar ahora") — el destino sigue siendo el mismo (`#catalogo`), solo
cambió el texto para sonar más a "esto es para comprar" y menos a "esto
es para mirar".

**Feedback real de una clienta, 2 puntos que quedan pendientes por
falta de fotos reales** (no se inventó nada para no repetir el problema
que esta misma auditoría de identidad visual ya había resuelto — ver
"Identidad visual de pedidos/index.html" más arriba, la queja original
era justo que el sitio se sentía "hecho con IA" por usar imágenes
genéricas):
- Pidió un carrusel de fotos pequeñas por paso del Proceso (Cereza /
  Lavado y secado / Trilla / Tueste) — hoy esa sección es a propósito
  solo número + texto, sin fotos (ver el comentario en el CSS de
  `.proceso-seccion`), porque solo hay 2 fotos reales de la finca
  (`finca-flor.jpg`, `finca-ladera.jpg`) y ninguna de trilla/tueste en
  particular. Falta que Juan mande una foto real por paso.
- Pidió más fotos reales de la finca y del producto ya empacado — mismo
  caso, ya documentado en "Pendiente / a medias" de abajo ("Fotos reales
  de bolsa"). Sigue pendiente de que Juan mande fotos en buena
  resolución (no capturas de pantalla comprimidas).

**Migraciones pendientes, ahora visibles en la app** (`functions/api/
salud-esquema/index.ts`, endpoint nuevo, con login, agregado a la lista
de `sincronizar()`): en vez de esperar a que alguien se tope con el
error real de Postgres (el patrón ya documentado varias veces en este
archivo), este endpoint intenta un SELECT liviano contra cada
tabla/columna de features recientes (`costos_margen`,
`compras_cereza.pesajes`, `saldos_iniciales`, `precio_cafe_fnc`,
`ordenes_maquila.estado_entrega`, `cosechas.kilos_pasilla`) y devuelve
`ok:true/false` por cada una — SIEMPRE responde 200 (nunca rompe
`sincronizar()` para el resto de la app, a propósito, para no repetir el
problema de "un endpoint roto tumba los otros 16"). Configuración →
Precios muestra un aviso ⚠️ arriba de todo, solo cuando falta algo, con
el nombre exacto del archivo `migracion_*.sql` que hay que correr. Si se
agrega una tabla/columna nueva en el futuro, hay que sumarla a mano al
array `CHEQUEOS` de ese archivo — no se detecta sola.

**Texto visible junto a los íconos, en Cosecha** (`.accion-texto`,
CSS nuevo en `.ledger-row .acciones`): el Pendiente de la auditoría de
accesibilidad (más arriba en este archivo) decía que agregar texto a los
botones de solo-ícono ayudaría mucho a Juan/Inés (65+) pero que filas de
3-4 botones (como Cosecha: ⏱️⚖️🌾✕) se desbordarían en celular con
etiquetas completas. Se resolvió con un breakpoint: el texto (`<span
class="accion-texto">`) solo se muestra desde 700px de ancho — bajo eso
(celular, donde estaba el riesgo real) sigue exactamente igual que
antes, solo ícono. Por ahora solo se aplicó a la fila de Cosecha (la más
cargada, la que motivó el Pendiente) — el mismo `.accion-texto` ya sirve
para sumarlo a las otras 18 filas que usan `.ledger-row .acciones`
después, sin ningún riesgo nuevo de layout (el breakpoint ya lo cubre).

**Resumen post-guardado en "⚖️ Pesar en conjunto"**
(`guardarPesarConjunto()`): antes el toast solo decía "Pergamino
repartido entre N entradas" (un conteo, no el reparto real). Ahora dice
el kilo a kilo real por entrada (ej. "Pergamino repartido — propia 14
de sept: 20.0kg · Finca La Esperanza 6 de sept: 10.0kg") — la auditoría
señaló que este es justo el momento con menos tiempo para pensar
(pesando en la finca), así que vale más confirmar el número real que un
mensaje genérico de "listo".

## Profesionalizar la app interna — primer pase en Ventas (2026-09-23)

El usuario pidió, en general, hacer la app interna "más cómoda de usar y
de entender" — se empezó por Ventas (la pestaña que más se usa a
diario) en vez de un cambio global, para no tocar 8 pantallas a la vez
sin validar el patrón primero.

**El problema real**: el formulario de Ventas mezclaba, en una sola
lista continua de `.row`/`.field` sin ninguna separación visual, dos
cosas conceptualmente distintas — agregar UNA línea de café al pedido
(Lote/Presentación/Cantidad/Molienda/Tostión/Valor de esta línea) y
cerrar TODA la venta (Valor total/Método de pago/Estado/Quién
recibió). Los campos "Valor de esta línea" y "Valor total" se veían
exactamente igual (mismo tipo de input, misma fila, a pocas líneas de
distancia) sin nada que avisara que son cosas distintas — uno es el
precio de lo que se está agregando, el otro es la suma de todo el
pedido. Ninguno de los dos avisaba tampoco que se autocompletan solos
(`recalcularLinea()`/`pintarCarrito()` los recalculan en vivo) pero se
pueden corregir a mano.

**La solución**: clase nueva `.subcard` (fondo `--crema-alt`, el mismo
tono que ya se usaba en otros lados de la app para resaltar bloques —
nada de color nuevo) que agrupa cada paso bajo un título chico en
mayúscula tipo kicker (mismo lenguaje visual que ya se usa en
`pedidos/index.html` desde la auditoría CRO: "① Agregar café al
pedido" y "② Cerrar la venta", numerados a propósito para reforzar el
orden). Debajo de los dos campos que se autocompletan, una línea de
ayuda (`.campo-ayuda`, texto chico gris) aclara que el valor es
sugerido/calculado y se puede corregir. `.subcard`/`.subcard-titulo`/
`.campo-ayuda` son clases genéricas — sirven para repetir el mismo
patrón en Maquila, Gastos, Finca y Cuentas de cobro más adelante, sin
inventar nada nuevo cuando se haga ese pase.

Probado en el preview local en desktop y en mobile (375px) — el
`.subcard` no desborda en ningún ancho, y el flujo de agregar una línea
+ ver el carrito + cerrar la venta sigue funcionando igual que antes
(no se tocó ninguna función de JS, solo el HTML/CSS alrededor).

**Se quitó el multi-orden de Ventas** (mismo día, a pedido de Juan — "lo
veo poco útil, es mejor ir registrando"): antes `ordenes[]` guardaba
varias órdenes en paralelo con pestañas ("Orden 1", "Orden 2"...) y un
botón "+"; ahora `orden` es un solo objeto, sin pestañas ni botón de
abrir otra. Cambios reales, no solo visuales:

- `ordenVacia()`, `finalizarOrdenActiva()` siguen igual de nombre pero
  ahora trabajan sobre `orden` directo, no sobre `ordenes[ordenActiva]`.
- `guardarOrdenEnMemoria()`, `cambiarOrden()`, `nuevaOrden()`,
  `cerrarOrden()` se ELIMINARON por completo — existían solo para
  sincronizar el formulario al saltar entre órdenes; sin múltiples
  órdenes no hace falta nada de eso.
- `elegirCliente()` (autocompletar cliente) y `convertirPedidoWebAVenta()`
  antes evitaban mezclar dos clientes abriendo una orden nueva en
  paralelo — ahora, si la orden actual ya tiene algo (items o un nombre
  distinto tecleado en el campo Cliente), piden confirmación antes de
  reemplazarla. ⚠️ *Ojo con esto si se toca de nuevo*: el chequeo de "ya
  hay algo escrito" lee el campo `#v-cliente` del DOM directo
  (`document.getElementById('v-cliente').value`), NO `orden.cliente` —
  `orden.cliente` solo se actualiza en los puntos de reinicio (no en
  cada tecla), así que compararlo contra eso daba falsos negativos (no
  detectaba que sí había algo escrito) hasta que se corrigió a leer el
  DOM en vivo, igual que ya hacía `registrarVenta()`.

## Los números de "Así se pide" ya no son dorados, y las bolsas ocupan menos (2026-09-23)

Dos ajustes chicos en `pedidos/index.html`, pedidos por el usuario
después de ver el sitio con gente real:

- **Círculos de la guía en verde, no dorado**: Juan pidió que los
  números ①②③④ de "Así se pide" fueran verdes en vez de dorados —
  "integraría más y parecería menos un botón" (el dorado ya se asocia en
  todo el sitio con acentos/cosas elegibles — peso-pill activo,
  MEDIA LIBRA, etc., así que un círculo dorado seguía leyéndose como
  algo tocable). Se agregó `--verde: #4A6B48` al `:root` — MISMO tono
  que usa `--verde` en `index.html` (app interna) para "Pagado"/balance
  positivo, coincidencia útil, no una referencia cruzada real entre los
  dos archivos (siguen siendo independientes). Antes de esto,
  `pedidos/index.html` no tenía ningún verde en su paleta — se había
  quitado a propósito en la auditoría de identidad visual (ver más
  abajo); esta es la primera vez que vuelve, y solo para este uso chico.
- **Las tarjetas de Lavado y Honey/Natural ocupaban más que una pantalla
  de celular completa antes de llegar a los controles de pedir** —
  medido en vivo con `getBoundingClientRect()`: Lavado 810px (viewport
  típico ~781px), Honey/Natural 1210px, de los cuales **953px eran
  puramente decorativos** (dos imágenes de rama de café, 321px cada una,
  más el badge del armadillo, 311px) contra apenas 277px de controles
  reales. La rama de ABAJO en Honey/Natural (`<img class="bolsa-rama
  abajo">`, repetía la de arriba solo volteada) se quitó por completo —
  no agregaba nada y quedaba DESPUÉS de donde ya se termina de elegir,
  puro scroll de más. `.bolsa-foto` (Lavado, antes max-width 320px → 220px),
  `.bolsa-rama` (antes width 100% → 46%) y `.bolsa-badge` (antes 76%/280px
  → 54%/200px) se achicaron. Resultado medido: Lavado 810px→624px,
  Honey/Natural 1210px→639px — ambas caben ahora en un celular típico sin
  scroll de sobra. `HONEY_RAMA_B64` sigue usándose una sola vez (antes
  dos) — no hizo falta tocar la constante, solo dejó de referenciarse la
  segunda vez en `tarjetaBolsaGrupoHTML()`.

## Sin movimiento lateral en celular (app interna, 2026-09-23)

Juan reportó que la app "se movía hacia los lados" en su teléfono.
Revisado a fondo primero (medido `scrollWidth` vs. `clientWidth` en
cada pestaña con `getBoundingClientRect()`, en 375px de ancho): NINGUNA
pestaña tenía de verdad una barra de scroll horizontal a nivel de
documento — lo que él sentía era el "rebote" (overscroll) que hacen
iOS/Android por defecto al llegar al borde de la pantalla, que sin
nada que lo frene se siente como que toda la app se corre al lado.

Arreglo en `index.html`: `html, body { overflow-x: hidden;
overscroll-behavior-x: none; }`, agregado justo después de `* {
box-sizing: border-box; }`. `overflow-x: hidden` es la red de
seguridad (nunca va a aparecer una barra de scroll horizontal del
documento, así algo se desborde por error en el futuro);
`overscroll-behavior-x: none` apaga puntualmente el rebote lateral que
causaba la sensación real.

**No rompe las tiras que SÍ se deslizan de lado a lado a propósito**
(el clima de 5 días en Cosecha & Tueste, `.clima-dias`; las pestañas de
Maquila, `.orden-tabs`) — esas tienen su propio `overflow-x: auto` en
un contenedor chico, y `overflow-x: hidden` en `html`/`body` solo
afecta el scroll del DOCUMENTO completo, no el de sus hijos. Confirmado
en el preview: `.clima-dias` seguía reportando `overflowX: "auto"` y
scrolleando sus 5 tarjetas normalmente después del cambio.

## Barra de secciones en `pedidos/index.html` (2026-09-23)

Nueva `<nav class="nav-secciones" id="navSecciones">`, PRIMER elemento
dentro de `<body>` (antes del Hero) — para que alguien que ya conoce la
página pueda saltar directo a "Pedir" sin bajar por toda la historia, y
alguien nuevo que no quiere hacer scroll pueda explorar por secciones.
4 links fijos (no se arman dinámicamente, a diferencia de `.nav-rapida`
que sí depende de qué lotes tengan precio): "La finca" (`#datoDuro`),
"Proceso" (`#procesoSeccion`), "Tour" (`#tourFinca` — la sección del
tour no tenía `id` todavía, se le agregó), y "Pedir →" (`#catalogo`,
destacado en teal sólido — el único de los 4 que es una acción, no solo
navegación).

`position: sticky; top: 0` — al estar ANTES del Hero en el documento,
se queda pegada arriba durante todo el resto del scroll de la página,
sin necesitar ningún JS de scroll (mismo mecanismo ya usado en
`.nav-rapida`, solo que esta nueva barra es la primera en aparecer y
por eso se queda "encima" de todo lo demás mientras se navega).

**Dos barras sticky al mismo tiempo — hubo que apilarlas a mano**:
`.nav-rapida` (aparece más abajo, dentro de "Arma tu pedido") YA era
`position: sticky; top: 0` desde antes — con la barra nueva agregada
ENCIMA, las dos compitiendo por `top: 0` se hubieran superpuesto. Medida
en vivo con `getBoundingClientRect()`: `.nav-secciones` mide 53.75px de
alto, así que `.nav-rapida` pasó a `top: 54px` (se queda pegada justo
DEBAJO de la primera, no tapada ni tapándola).

**`scroll-margin-top` en los 4 destinos, para que saltar ahí no los deje
tapados por la barra fija**: `.dato-duro`, `.proceso-seccion` y
`.tour-finca` a `scroll-margin-top: 54px` (compensa solo `.nav-secciones`,
que es la única barra sticky activa en esos tramos del scroll);
`#catalogo` a `scroll-margin-top: 113px` (compensa LAS DOS barras juntas,
`.nav-secciones` + `.nav-rapida`, que para cuando se llega al catálogo ya
están las dos pegadas arriba a la vez). ⚠️ *Gotcha real al probar esto*:
navegar directo a una URL con `#catalogo` en el hash (`/pedidos/#catalogo`)
NO refleja el uso real — en ese caso el navegador intenta saltar al
ancla ANTES de que `cargarCatalogo()` (asíncrono) haya llenado el `<div
id="catalogo">`, así que el salto se calcula contra un div todavía
vacío y da un resultado distinto. Probar SIEMPRE con la página ya
cargada y haciendo clic real en el link (o `location.hash` después de
esperar la carga) — mismo tipo de gotcha ya documentado para
`iniciarRevelado()` y el catálogo async, esta vez aplicado a scroll en
vez de a animaciones.

## Peso siempre visible + nombre del lote (pedidos, 2026-09-23)

El selector de "Peso neto" en las tarjetas-bolsa (Lavado y Honey/Natural)
era un botón que abría/cerraba un desplegable (`togglePesoPills()`) — a
personas mayores les costaba encontrar las opciones, solo veían el peso
ya elegido y no era obvio que se podía tocar para ver más. Se quitó la
interacción de abrir/cerrar: `.bolsa-peso-bar` (antes un `<button>`)
pasó a ser `<p class="bolsa-peso-etiqueta">Peso neto</p>`, solo una
etiqueta fija, y TODOS los pesos se ven siempre debajo en
`.peso-pills`, cada uno como un pill de 2 líneas (gramaje + precio, no
solo gramaje como antes) — se puede comparar todo de un vistazo sin
tocar nada. `togglePesoPills()` se eliminó del archivo, ya no hace
falta.

**Nombre del lote explícito en la bolsa de Lavado**: a diferencia de
Honey/Natural (que ya tienen los botones "Honey"/"Natural" como
selector de proceso, bien visibles), la bolsa de Lavado no tenía NINGÚN
texto que dijera "Lavado" — solo el dibujo de la bolsa. Se agregó
`<h3 class="lote-nombre">Lavado</h3>` arriba de la descripción del lote
en `tarjetaBolsaHTML()`.

⚠️ *Gotcha real que reapareció al quitar la franja de "Peso neto"*: con
la franja fuera, el pill activo (dorado) de Honey/Natural se veía tan
apagado como los demás — mismo problema de especificidad CSS ya
documentado antes para la variante kraft (`.tarjeta-bolsa`), esta vez en
la variante clara (`.tarjeta-bolsa-clara`): `.tarjeta-bolsa-clara
.peso-pill` (fondo crema-alt, 2 clases) y `.peso-pill.activo` (fondo
dorado, también 2 clases) empatan en especificidad, y como la primera
aparece DESPUÉS en el archivo, ganaba ella — el pill "elegido" nunca
tenía fondo dorado, solo el texto se ponía blanco (por una regla de 3
clases que sí alcanzaba a ganar, pero sin fondo dorado el texto blanco
quedaba casi invisible sobre el crema-alt). Antes no se notaba porque la
franja de arriba ya decía qué estaba elegido; ahora que los pills SON la
única señal, se corrigió agregando fondo+borde a esa misma regla de 3
clases (`.tarjeta-bolsa-clara .peso-pill.activo { background:
var(--dorado); border-color: var(--dorado); color: #fff; }`). Moraleja
repetida: cualquier override de color "no elegido" en una tarjeta-bolsa
necesita su propio override de "elegido" con MÁS especificidad, con
fondo Y color juntos, no solo color.

## Inventario de café verde por malla + pergamino disponible (2026-09-23)

Pedido de Juan: la app ya llevaba trazabilidad de cada cosecha/compra por
separado (cereza → pergamino real → verde real), pero no un STOCK
acumulado de cuánto café hay disponible en cada etapa — y como la app
recién se empezó a usar, ya había pergamino de antes (que hoy se manda a
trillar y seleccionar) que no estaba contemplado en ningún lado.

Dos inventarios nuevos, mismo patrón atómico que ya usa `inventario`
(café tostado, `ajustar_stock_inventario`) — nunca un UPDATE directo
desde la app, todo por una función SQL (`migracion_inventario_verde.sql`):

- **`inventario_pergamino`** (`lote` → `kilos`): café ya seco, antes de
  trillar. Se suma solo (⚖️ pesar pergamino real de una cosecha/cereza
  comprada, comprar pergamino ya seco, o "+ Agregar pergamino que ya
  tenías") y se resta solo (🌾 trillar). `ajustar_stock_pergamino(p_lote,
  p_delta)`.
- **`inventario_verde`** (`lote` + `grado` → `kilos`, 20 filas: 4 lotes ×
  5 mallas): café ya trillado, clasificado por malla — **Juan confirmó
  que cada malla se separa TAMBIÉN por lote** (Malla 16 de Lavado es un
  stock distinto de Malla 16 de Honey), así que es una tabla de 2
  dimensiones, no una bolsa única por malla. Se suma solo al trillar (🌾)
  y se resta solo al "Retirar para tostión". `ajustar_stock_verde(p_lote,
  p_grado, p_delta)`. `GRADOS_VERDE = ['Malla 18', 'Malla 16', 'Malla 14',
  'Aprovechable', 'Pasilla']` en `index.html`.

**El pipeline completo, 4 etapas** (cada flecha es un paso que YA
existía en la app, ninguno es nuevo — lo nuevo es que ahora cada uno
también ajusta un inventario):
1. Cosecha/cereza comprada/pergamino comprado → pesar pergamino real (⚖️,
   o inmediato al comprar pergamino) → **+`inventario_pergamino[lote]`**.
2. Trillar (🌾, `abrirTrilla()`/`guardarTrilla()`, reescrito para pedir
   el desglose por malla en vez de un solo número "kilos de verde") →
   **−`inventario_pergamino[lote]`, +`inventario_verde[lote][grado]`**
   por cada malla que se anote (la suma de las 5 sigue siendo
   `kilosVerdeReal`, igual que antes, para no romper
   `rendimientosReales()`). `functions/_lib/verde.ts` tiene
   `aplicarTrilla()`/`revertirTrilla()`, compartida por los 3 orígenes
   (cosechas, cereza comprada, pergamino comprado — los mismos 3 de
   `FUENTES_TRILLA`, sin que ninguno necesite tratamiento especial).
3. "Retirar para tostión" (botón nuevo en la pestaña "Café verde",
   `abrirRetiroTostion()`) → crea un `POST /api/tuestes` con `lote` +
   `grado` + `kilosVerde` → **−`inventario_verde[lote][grado]`**, de una
   vez, no cuando se pesa lo que sale (`"pase inmediatamente a tostión y
   se descuente de ese inventario"`, tal cual lo pidió Juan). El tueste
   queda igual que uno registrado a mano — anotar la salida con 🔥 sigue
   funcionando exactamente igual (eso ajusta el inventario TOSTADO,
   sin relación con esto).
4. Pesar lo que sale del tueste (🔥, ya existía) → `+inventario[lote]`
   (café tostado, sin cambios).

**"Agregar pergamino que ya tenías"** (`abrirAgregarPergaminoExistente()`
→ `POST /api/inventario-pergamino`): la manera de sembrar el stock viejo
que no tenía ninguna cosecha/compra en la app — un lote + unos kilos,
sin crear ningún registro nuevo, solo suma al inventario. Se pone
mientras se van registrando esas cosechas viejas, y de ahí en adelante
todo fluye por el pipeline normal (trillar esas mismas, etc.).

**Reversión precisa al borrar o corregir**: `cosechas`, `compras_cereza`
y `compras_pergamino` ganaron una columna `verde_grados` (jsonb) que
guarda el desglose exacto que produjo la trilla de ESE registro — sin
esto, borrar un registro ya trillado solo sabría el TOTAL de verde que
había sumado, no cuánto de cada malla, y no se podría revertir con
precisión. `lotes_tueste` ganó `grado` (nullable — un tueste anotado a
mano, sin pasar por "Retirar para tostión", se queda con `grado: null` y
nunca toca `inventario_verde`, ni al crearse ni al borrarse). Los 3
endpoints de trilla (`cosechas/[id].ts`, `cereza-comprada/[id].ts`,
`pergamino/[id].ts`) ahora hacen SELECT del registro actual ANTES del
PATCH (mismo patrón que ya usaba `lotes_tueste/[id].ts` para el tostado)
— necesario para calcular la diferencia de `kilosPergaminoReal` Y para
revertir el `verde_grados` anterior antes de aplicar uno corregido.

Nueva pestaña "Café verde" en Cosecha & Tueste (`trazaSubTab = 'verde'`,
`vistaInventarioVerde()`) — entre "Pergamino comprado" y "Tueste", el
orden real del proceso. Muestra los dos inventarios + los 2 botones de
acción ("+ Agregar pergamino que ya tenías" y "Retirar para tostión").
"Retirar para tostión" solo ofrece lotes/mallas con stock > 0.01 kg
(`abrirRetiroTostion()`/`actualizarGradosRetiro()`), y avisa si el
usuario pide más de lo disponible (no lo bloquea — mismo criterio ya
establecido en el resto de la app, avisar en vez de impedir).

Probado a fondo en el preview local (sin errores de consola en ningún
recorrido): "Retirar para tostión" filtra lotes/mallas correctamente
según stock real, `abrirTrilla()` reparte y calcula el total en vivo, y
las 3 escrituras (retiro, trilla, pergamino existente) devuelven el
toast esperado.

**"Sin clasificar" — trillar sin desglosar por malla (mismo día)**:
Juan pidió poder anotar solo el TOTAL trillado cuando todavía no separó
por tamaño de grano, en vez de obligar a llenar las 5 mallas cada vez.
Checkbox "Desglosar por malla" en `abrirTrilla()`
(`alternarDesgloseTrilla()`) — desmarcado muestra un solo campo "Total
trillado" en vez de los 5 de malla. Ese total se guarda como
`verdeGrados = { 'Sin clasificar': total }`, reutilizando EXACTAMENTE
el mismo mecanismo de siempre (`aplicarTrilla()`) — "Sin clasificar" es
un 6º grado más en `GRADOS_VERDE` (`GRADOS_MALLA` es la constante
derivada que excluye ese 6º para los formularios que sí desglosan:
`abrirTrilla()` en modo desglosado, y ya está — "Retirar para tostión"
y la tabla de inventario SÍ deben verlo, para que ese café siga siendo
utilizable). Al reabrir el modal de un registro ya trillado,
`yaDesglosado` decide en qué modo abrir: si el único grado guardado es
"Sin clasificar", abre en modo simple con ese valor precargado; si hay
cualquier malla real, abre desglosado. No hace falta ninguna
clasificación posterior para poder tostarlo — "Sin clasificar" es una
bolsa más del inventario de verde, se puede retirar para tostión igual
que cualquier malla real.

**Historial de movimientos ("cuánto es de quién")**: los dos
inventarios de arriba (`inventario_pergamino`, `inventario_verde`)
siguen siendo un solo total mezclado por lote — separar el stock por
proveedor habría complicado mucho "Retirar para tostión" (que sale de
una bolsa ya mezclada). En vez de eso, tabla nueva
`movimientos_inventario_cafe` (`etapa`: 'pergamino'|'verde', `lote`,
`grado` opcional, `kilos` con signo, `origen` texto legible,
`referencia` con el proveedor si aplica) — CADA ajuste de inventario en
todo el pipeline (pesar pergamino, comprar pergamino, trillar, agregar
pergamino existente, retirar para tostión, y las reversiones de
borrar/corregir) deja una fila acá, vía `registrarMovimiento()` en
`functions/_lib/verde.ts`. `GET /api/movimientos-inventario` (máximo
300, más reciente primero) — nueva pestaña "Café verde" la lista al
final con `paginar()` (clave `movimientosInventario`, agregada a
`paginas` de entrada, mismo gotcha de siempre). "+ Agregar pergamino
que ya tenías" ganó un campo "De quién" (opcional, texto libre — ej.
"cosecha 2025", "compra a Don Leo") que viaja como `referencia` en su
movimiento.

## `.subtabs` — flex-wrap, y por qué (2026-09-24)

Sumar la 5ª pestaña "Café verde" a Cosecha & Tueste (ver sección de
arriba) rompió el layout en celular: `.subtabs button` era `flex: 1`
SIN `flex-wrap` en el contenedor — con 3-4 pestañas de texto corto
repartía la fila pareja sin problema, pero con 5 pestañas y textos
largos ("Cereza comprada (1)") al lado de uno corto ("Café verde"),
flexbox no dejaba encoger los botones más allá del ancho mínimo de su
propio texto (`min-width: auto` por defecto en un flex item — mismo
tipo de gotcha ya documentado para `.ledger-row`, esta vez en
`.subtabs`) y el último botón ("Tueste") quedaba literalmente fuera de
la pantalla en celular — imposible de tocar, sin ningún error visible
(porque `overflow-x: hidden` en `html`/`body`, agregado antes por otro
motivo, lo recorta en vez de mostrar una barra de scroll que hubiera
delatado el problema).

Arreglo real (el único que quedó): `.subtabs { flex-wrap: wrap }` —
cuando no caben todos los botones en una fila, bajan a la siguiente en
vez de desbordar. Es un cambio en la clase COMPARTIDA por las 4
pantallas que usan `.subtabs` (Ventas, Cosecha & Tueste, Resumen,
Configuración) — a propósito: el bug de fondo (`min-width:auto` sin
wrap) podía repetirse en cualquiera de ellas si algún día suman una
pestaña más.

⚠️ *Primer intento, revertido*: junto con el `flex-wrap` se probó
también cambiar los botones de rectángulos parejos (`flex:1;
border-radius:8px`) a pills de ancho ajustado a su texto (`flex:0 1
auto; border-radius:20px`) — Juan lo probó y pidió volver:
**"me gustaba más como estaba, así ya se siente como menos visual y un
poco más perdido"**. Se revirtió SOLO la forma/tamaño de los botones,
dejando el `flex-wrap: wrap` (el arreglo real del bug) intacto — los 4
usos de `.subtabs` en toda la app son rectángulos de ancho parejo desde
entonces. Moraleja para la próxima vez que se toque `.subtabs` o
cualquier otro elemento de navegación compartido en `index.html`: no
empaquetar un rediseño visual junto con un arreglo de bug, aunque
parezca una mejora obvia — proponerlo aparte.

## Cosecha & Tueste — de 5 pestañas a 4: Cereza, Pergamino, Café verde, Tueste (2026-09-24)

Reorganización pedida por Juan en dos pasos, justo después de construir
el inventario de café verde de arriba (que había dejado 5 pestañas:
Cosechas, Cereza comprada, Pergamino comprado, Café verde, Tueste — se
sentían repartidas sin un criterio claro):

1. **"Cosechas es el café en cereza de la finca y cereza comprado el
   que se compra fuera, y pergamino puede ser solo pergamino y agrupar
   el que se compra y el que hay ya seco de la finca en una sola"** —
   se creó `entradasPergamino()`, que junta en una sola lista los
   pergaminos de 3 orígenes: `state.cosechas`/`state.cerezaComprada` ya
   pesados (`kilosPergaminoReal != null`) + `state.pergamino` (siempre
   tiene pergamino, es su naturaleza) — cada entrada normalizada a
   `{tipo, id, fecha, proceso, kilos, kilosVerdeReal, origenLabel,
   costo}`, con `tipo` guardando de cuál tabla vino
   (`'cosecha'`/`'cerezaComprada'`/`'pergamino'`) para poder despachar
   correctamente el 🌾 (`abrirTrilla(tipo, id)`, sin cambios — ya
   aceptaba el `tipo` como primer parámetro gracias a
   `FUENTES_TRILLA`) y el ✕ (`eliminarEntradaPergamino(tipo, id)`,
   nuevo, delega a `eliminarCosecha`/`eliminarCerezaComprada`/
   `eliminarPergamino` según `tipo`). `vistaPergamino()` reescrita para
   iterar esta lista en vez de solo `state.pergamino` — el formulario
   de arriba ("Registrar compra de pergamino") no cambió, sigue creando
   filas en `pergamino` normal. El botón 🌾 se QUITÓ de las filas de
   Cosechas y Cereza comprada (ya no tiene sentido trillar desde ahí si
   esa acción ahora vive en "Pergamino") — ⚖️ (pesar) se queda en su
   pestaña de origen, porque pesar SÍ es específico de la etapa cereza.
2. **"que sea solo Cereza, Pergamino, Cafe verde y Tueste"** — un
   segundo pedido, más simple todavía: juntar TAMBIÉN "Cosechas" y
   "Cereza comprada" en una sola pestaña "Cereza", dejando 4 en vez de
   5. Se hizo de la forma más simple y segura: la pestaña `'cereza'`
   (antes solo cereza comprada) ahora pinta `vistaCosechas(cosechasPend)`
   seguido de `vistaCerezaComprada()`, cada una bajo su propio
   subtítulo ("🌱 Cosecha propia" / "🚚 Cereza comprada a terceros") —
   NO se fusionaron los datos ni las funciones en sí (siguen siendo dos
   tablas, dos formularios, dos historiales independientes, tal como ya
   documentaba la sección "Convenciones importantes" sobre Ventas vs.
   Maquila: cosas de negocio distintas no se mezclan por dentro aunque
   compartan pantalla) — solo se apiló su HTML bajo una sola pestaña de
   navegación. `trazaSubTab` pasó de 5 valores posibles a 4:
   `'cereza'` (por defecto ahora, antes era `'cosechas'`),
   `'pergamino'` (antes `'comprado'`), `'verde'`, `'tueste'`.

Contador de la pestaña "Cereza" en el subtab (`state.cosechas.length +
state.cerezaComprada.length`) sigue reflejando el total real de
registros aunque ahora estén agrupados visualmente. El de "Pergamino"
usa `entradasPergamino().length`, no `state.pergamino.length` —
importante si se vuelve a tocar este número, ya no es solo el
comprado.

Probado en el preview local: los 4 botones de subtab se ven parejos
(mismo estilo rectangular de siempre, sin volver a probar pills — ver
gotcha de arriba), "Cereza" pinta las dos secciones apiladas con las
filas de Cosechas sin 🌾, "Pergamino" junta los 3 orígenes y el 🌾 abre
el modal de trilla correcto para una entrada de tipo `'cosecha'`,
"Café verde" y "Tueste" sin cambios — sin errores de consola en ningún
recorrido.

## Calculadora de precio de cereza + badges 🏠/🚚 + café verde existente (2026-09-24)

Tres pedidos chicos de Juan seguidos, todos sobre el pipeline de café
verde/pergamino que se construyó el mismo día (ver secciones de arriba).

**¿Cuánto pagar por cierta cantidad de cereza?** (`bloqueCalculadoraCereza()`
+ `calcularPrecioCereza()`, tarjeta nueva en "Cereza", justo debajo del
formulario de "Registrar compra de cereza"): Juan dio un ejemplo real para
explicar cómo se calcula ("60 kilos de cereza, a precio de 12.5 kilos
seco, factor 88... ambos a precio del día") — resultó ser EXACTAMENTE la
misma cuenta que ya hacía "Completar pago" (💰, en la sección "Cereza
comprada a terceros" de más abajo): `60 × 4.000 = 240.000` de un lado,
`12,5 × 19.200 = 240.000` del otro, la misma plata vista dos formas (el
12.5 sale de aplicarle el rendimiento cereza→pergamino a 60 kg, no es un
número que se escriba a mano). Por eso esta calculadora NO inventa
ninguna fórmula nueva — reusa `proyectarDesdeCereza()` (que ya prefiere
el rendimiento APRENDIDO de tus propios datos, cayendo al genérico solo
mientras no hay suficientes muestras) y `precioPergaminoPorFactor()`
tal cual. Juan confirmó explícitamente **"que no se pierdan los cálculos
de rendimiento aprendido de la app"** — ninguna cifra fija reemplaza eso.
Es un calculador APARTE de "Completar pago": sirve para estimar ANTES de
comprar, sin crear ningún registro todavía (mismo espíritu que
`bloqueCalculadoraFactor()` de Resumen, pero para cereza en vez de
pergamino). De paso, `recalcularCompletarPago()` (💰) ganó una segunda
estadística "Por kilo de cereza" al lado de la de siempre — antes solo
mostraba el costo total, y Juan claramente piensa en $/kilo primero.

**Badges 🏠/🚚 en "Pergamino disponible"**: Juan pidió que la lista
unificada de Pergamino (`entradasPergamino()`, ver sección de arriba)
mostrara de un vistazo qué es de la finca y qué es comprado, en vez de
solo el texto `origenLabel` — comparó el patrón con el badge 🌐 que ya
usan las ventas de origen web. `entradasPergamino()` ganó un campo
`esComprado` (`false` para `'cosecha'`, `true` para `'cerezaComprada'` y
`'pergamino'`) y `vistaPergamino()` pinta un `<span class="badge-origen">`
(🏠 verde para casa, 🚚 azul para comprado) justo al lado del peso, antes
del texto de siempre — mismo lugar/patrón que `.badge-web`, CSS nuevo
`.badge-origen`/`.badge-origen.casa`/`.badge-origen.comprado` reusando
`--verde-bg`/`--azul-bg` que ya existían (nada de color nuevo).

**"+ Agregar café verde que ya tenías"** (`abrirAgregarVerdeExistente()`/
`guardarVerdeExistente()`, botón nuevo en la tarjeta "Café verde
disponible", junto a "Retirar para tostión"): "+ Agregar pergamino que ya
tenías" solo cubre el caso de stock viejo que TODAVÍA no está trillado —
Juan señaló que a veces lo que ya se tenía de antes de usar la app YA
estaba trillado (verde), y no había forma de sembrar ese caso sin
inventar una trilla falsa. Mismo patrón que el de pergamino
(Lote + Kilos + nota opcional), un escalón más adelante: el desplegable
de Malla usa `GRADOS_VERDE` completo, así que incluye "Sin clasificar"
para cuando no se tiene separado por tamaño de grano. Backend nuevo:
`POST /api/inventario-verde` (antes esa carpeta solo tenía GET), mismo
patrón que `POST /api/inventario-pergamino` — `ajustar_stock_verde` +
`registrarMovimiento(etapa:'verde', origen:'Café verde que ya tenías')`.

**Bug real encontrado de paso, mientras se armaba lo de arriba — "Sin
clasificar" nunca sumaba nada al inventario**: al revisar por qué Juan
reportó que trillar sin desglosar por malla "debería poder usarse para
tostar" (y sospechar que no funcionaba), se encontró que
`functions/_lib/verde.ts` tenía su PROPIO `GRADOS_VERDE` — copiado del de
`index.html` pero SIN "Sin clasificar" (`['Malla 18', 'Malla 16', 'Malla
14', 'Aprovechable', 'Pasilla']`, sin el 6º valor). `aplicarTrilla()`/
`revertirTrilla()`/`totalGrados()` usan ESE array para recorrer el
desglose (`for (const grado of GRADOS_VERDE)`) — así que un
`verdeGrados = {'Sin clasificar': 32.5}` (el resultado de trillar con el
checkbox "Desglosar por malla" desmarcado) daba `total = 0` en
`totalGrados()`, y el `for` nunca iteraba nada: **ni restaba del
pergamino disponible, ni sumaba al café verde** — el café quedaba
"perdido" entre las dos tablas, sin ningún error visible (el PATCH
respondía 200 igual, porque `cosechas.kilos_pergamino_real`/`verde_grados`
sí se guardaban bien; solo los inventarios agregados nunca se
actualizaban). Arreglado agregando `'Sin clasificar'` al `GRADOS_VERDE`
de `functions/_lib/verde.ts`, para que quede igual al de `index.html`.
Como la migración de este inventario (`migracion_inventario_verde.sql`)
todavía no se ha corrido en producción (ver "Pendiente" más abajo), este
bug nunca llegó a afectar datos reales — se encontró y corrigió antes de
que production lo pudiera tocar. Moraleja: cualquier constante que exista
DUPLICADA en frontend y backend (mismo nombre, mismo propósito) es un
lugar donde se pueden desincronizar en silencio — si se vuelve a tocar
`GRADOS_VERDE` en `index.html`, hay que revisar también el de
`functions/_lib/verde.ts`.

Probado en el preview local: la calculadora de cereza da el resultado
esperado con el mismo ejemplo de Juan (60 kg → ≈13.3 kg pergamino a tu
rendimiento real de 22.1%, no el genérico), los badges 🏠/🚚 se ven
correctos en "Pergamino disponible", y el modal de "Agregar café verde
que ya tenías" lista las 6 mallas (incluida "Sin clasificar") — sin
errores de consola.

## Auditoría de Cosecha & Tueste + Resumen (2026-09-24)

A pedido de Juan ("actúa como un auditor web profesional con experiencia
en finanzas"), se revisaron a fondo estas dos pantallas y se corrigió
todo lo encontrado en el mismo pase ("hazlo todo de una vez").

**🔴 Crítico, ya corregido — tres números de "pergamino disponible" que
no coincidían entre sí.** El stat de arriba de Cosecha & Tueste sumaba
TODO lo que `cosechas`/`cereza comprada`/`pergamino comprado` habían
producido alguna vez (un acumulado DE POR VIDA, que nunca bajaba aunque
ya se hubiera trillado y tostado) — mientras que la tarjeta "Pergamino
disponible" de la pestaña Café verde (`state.inventarioPergamino`) sí es
el stock REAL actual, que baja al trillar. Y NINGUNO de los dos incluía
el stock sembrado a mano con "+ Agregar pergamino/verde que ya tenías" —
justo el caso que originó toda esta función. Se corrigió:

- Los 4 stats de arriba de `renderTrazabilidad()` ahora se calculan
  desde `state.inventarioPergamino`/`state.inventarioVerde` (la MISMA
  fuente que ya usaba la pestaña Café verde) — "Pergamino pendiente por
  trillar" y "Verde disponible + esperado al trillar" (real +
  proyección de lo que falta) ya SIEMPRE coinciden con las tarjetas de
  abajo, e incluyen el stock agregado a mano. Se agregó una nota chica
  aclarando que combinan real + estimado.
- `vistaPergamino()` ahora muestra, justo debajo del título "Pergamino
  disponible", el mismo total real (`state.inventarioPergamino`) en
  negrita — antes esa cabecera no tenía ningún número propio, solo la
  lista de entradas (que sí sube pero nunca baja al trillar).
- Las entradas de la lista que ya se trillaron (`kilosVerdeReal > 0`) se
  ordenan al final, quedan con opacidad reducida y un badge
  "✅ Ya trillado" — antes se veían exactamente igual que las pendientes,
  con su kilaje completo en negrita como si todavía estuviera disponible.

**🟠 Alto, ya corregido — mismo problema, ya cubierto arriba** (el stock
"que ya tenías" ahora sí entra en los totales de arriba, por el mismo
cambio de fuente de datos).

**🟡 Medio, ya corregido — botones de solo ícono sin etiqueta.** Cereza
comprada (hasta 5 botones: 📏💰✎⚖️✕) y Pergamino (🌾✕) ganaron el mismo
`<span class="accion-texto">` que ya tenía Cosecha — el texto solo se ve
desde 700px de ancho (mismo breakpoint ya establecido, no rompe nada en
celular). Con esto, los 3 tipos de fila en "Cereza"/"Pergamino" quedan
igual de explicados, en vez de solo Cosecha.

**🟡 Medio, ya corregido — datos reales vs. estimados sin badge.** Ya
resuelto de raíz: los stats de arriba dejaron de ser una proyección de
TODO el histórico y pasaron a ser mayormente reales (inventario actual);
la nota nueva bajo el stat-grid explica que la parte "esperada" sigue
siendo proyección, sin necesitar un badge por stat.

**🟠 Alto, ya corregido — precio FNC (dato externo) antes que las
gráficas del propio negocio.** En `renderResumen()`, "Comportamiento en
el tiempo" (flujo, egresos por categoría, ventas por lote) ahora va
INMEDIATAMENTE después de los stats del mes, antes de "Precio de
referencia del café" — tu propia plata primero, el contexto de mercado
después.

**🟡 Medio, ya corregido — gráfica de producción mezclada con gráficas de
plata.** "Rendimiento de cosecha, mes a mes" salió de "Comportamiento en
el tiempo" (que ahora son solo las 3 gráficas financieras) y pasó a su
propia sección "Rendimiento de producción, mes a mes", después de Precio
FNC — con una nota explicando por qué está aparte (dato de producción,
no financiero).

**🟡 Medio, ya corregido — pantalla larga sin navegación interna.**
Fila nueva de 5 botones "↓ Comportamiento / ↓ Margen por lote /
↓ Mejores clientes / ↓ Balance de cuentas / ↓ Detalle del mes" justo
debajo de los stats del mes, con `scrollIntoView({behavior:'smooth'})` a
`id`s nuevos en cada `<h3>` de destino (`res-comportamiento`,
`res-margen`, `res-clientes`, `res-balance`, `res-detalle`). Reusa
`button.sec-btn` (el mismo estilo de píldora que ya usan "🔗 Unir
cosechas" y otros botones secundarios en toda la app) — a diferencia de
`.subtabs`, `.sec-btn` SÍ es redondeado desde siempre, así que esto no
repite el error de las pills que Juan revirtió en `.subtabs` (ver
sección de arriba), es el patrón ya aceptado para botones sueltos.

**🟡 Medio, deliberadamente NO hecho — cargar las 6 gráficas de Chart.js
solo cuando entran a la vista (lazy load).** Sería la forma correcta de
aliviar el peso de abrir Resumen en una conexión débil, pero es un
cambio de arquitectura real (coordinar `IntersectionObserver` con el
refresco de `cambiarRango()`/`cambiarPeriodoClientes()`, que hoy
reconstruyen TODO el HTML y vuelven a llamar `dibujarGraficos()` sin
condicional) — se decidió NO meterlo en este mismo lote de arreglos para
no arriesgar una regresión en las gráficas por apurar algo que no es un
error, es una optimización. Si se quiere, es una tarea aparte.

**🟢 Bajo, deliberadamente NO hecho — trazabilidad de quién corrigió qué
número y cuándo.** Necesitaría una tabla nueva (`migracion_*.sql`) y
enganchar el registro en cada uno de los endpoints de edición (ventas,
gastos, finca, cosechas, cereza comprada...) — un negocio familiar como
este no lo necesita todavía, así que se deja anotado acá para el día que
haga falta (ej. si entra alguien más a tocar la caja), en vez de
construirlo sin que nadie lo vaya a usar.

Probado en el preview local: el stat "Pergamino pendiente por trillar"
(54.5 kg) coincide EXACTO con la suma de `state.inventarioPergamino`; la
pestaña Pergamino muestra el mismo 54.5 kg en su cabecera; una entrada ya
trillada aparece al final, apagada, con "✅ Ya trillado"; los botones de
Cereza comprada muestran su texto en desktop; el orden
Comportamiento → Precio FNC → Rendimiento de producción se confirmó
programáticamente comparando posiciones en el HTML; los 5 `id` de
navegación existen — todo sin errores nuevos de consola.

## "🌾 Trillar pergamino disponible" — el hueco real que faltaba (2026-09-24)

Juan preguntó, muy concretamente: *"si en café verde pongo agregar
pergamino que ya tenía, dónde queda disponible ese para proseguir con la
trilla?"* — y la respuesta, revisando el código, era **"en ningún
lado"**. El 🌾 de la pestaña Pergamino solo vive pegado a una entrada
concreta de `cosechas`/`cerezaComprada`/`pergamino` (`abrirTrilla(tipo,
id)`, necesita un `id` real) — pero "+ Agregar pergamino que ya tenías"
(`POST /api/inventario-pergamino`) solo suma al POOL
(`inventario_pergamino[lote]`), sin crear ningún registro en esas 3
tablas. Si Juan sembraba, por ejemplo, 50 kg de Exótico que nunca tuvo
ninguna cosecha/compra en la app, ese Exótico aparecía correctamente en
los stats y en "Pergamino disponible" (kilos), pero **no había ningún
botón 🌾 en ningún lado de la pantalla para trillarlo** — quedaba
atrapado como un número sin acción posible.

Arreglado con un botón nuevo, "🌾 Trillar pergamino disponible", junto a
"+ Agregar pergamino que ya tenías" en la tarjeta de Café verde —
`abrirTrillarPergaminoExistente()` trilla DIRECTO del pool por lote
(elige el lote entre los que tengan stock > 0.01, muestra "Disponible: X
kg", mismo checkbox "Desglosar por malla" que ya usa `abrirTrilla()`,
con sus propios ids `tpe-*` para no chocar). Backend nuevo: `POST
/api/inventario-pergamino/trillar` (`functions/api/inventario-pergamino/
trillar.ts`) — llama a la MISMA `aplicarTrilla()` de siempre, sin
necesitar ningún registro de origen. A diferencia de PATCH
`/cosechas|cereza-comprada|pergamino/:id`, este es un movimiento de una
sola vía (no hay ningún `verde_grados` que revertir al corregir, porque
no hay ningún registro dueño) — mismo criterio que ya tiene "Retirar
para tostión".

## Gastos y Finca & Café, una sola pestaña (2026-09-24)

Juan: *"la pestaña finca y café es prácticamente una pestaña extra de
gastos... eliminemos esa pestaña para ahorrar espacio"* — tenía razón:
`renderFinca()` era estructuralmente IDÉNTICA a `renderGastos()` (mismo
formulario concepto/monto/categoría/estado/quién pagó, mismo ledger
mensual), solo con su propia tabla (`finca`) y categorías
(`CATEGORIAS_FINCA`). Se sacó el botón del sidebar
(`data-tab="finca"`) y su `<section id="view-finca">`, y Finca pasó a
ser una subpestaña DENTRO de Gastos (`gastosSubTab`, `'negocio'` |
`'finca'`, mismo patrón `.subtabs` de siempre) — igual que la fusión de
Cosechas + Cereza comprada en una sola pestaña "Cereza" de días atrás.

**Nada de la lógica financiera se tocó** — `state.finca` sigue siendo
exactamente la misma tabla, y todo lo que ya la leía (margen por lote,
balance de cuentas, `esGastoOperativo`, el aviso de huérfanos) sigue
funcionando idéntico, porque nada de eso depende de en qué pestaña vive
el formulario, solo de los datos. Lo único que cambió es dónde vive la
PANTALLA: `renderFinca()` se volvió `contenidoGastosFinca(mes, q)`
(devuelve HTML en vez de pintarlo directo), llamada desde
`renderGastos()` según `gastosSubTab`. `TABS_CON_BUSQUEDA` perdió
`'finca'` (ya no es una pestaña principal); el buscador global (🔍)
ahora revisa `gastosSubTab` dentro de la rama `tab === 'gastos'` del
modal de búsqueda, para buscar en la lista correcta según cuál de las
dos subpestañas esté activa. `renderTodo()`/`RENDER_POR_TAB` perdieron
su entrada de `finca` (ya se repinta solo, como parte de
`renderGastos()`).

## Café verde disponible, compacto (2026-09-24)

Pedido de Juan: *"pongamos los procesos y sin clasificar, y en caso de
que se desee anotar cada peso, poder abrir una pestaña para ver todo
eso"* — la tarjeta "Café verde disponible" mostraba SIEMPRE las 6
mallas de los 4 lotes (24 filas fijas), casi todas en $0 la mayoría del
tiempo. Ahora muestra solo 4 filas — una por lote, con el TOTAL del lote
y, si hay algo sin clasificar, una líneita chica avisándolo (lo único
que de verdad hace falta ver de entrada, porque avisa que falta separar
por malla) — y un "Ver mallas ›" que abre `abrirDetalleVerdeLote(lote)`,
un modal de solo lectura con el desglose completo de las 6 mallas de
ese lote. No cambia NINGÚN dato ni cálculo, es puramente visual — los
números vienen exactamente de donde ya venían
(`state.inventarioVerde`).

## "Subcard" ①② en Maquila y Cuentas de cobro (2026-09-24)

Pedido de Juan: *"haz las mejoras que consideres como si fuera una
empresa de 10 empleados y tuviera que ser extremadamente claro"*. La
sección "Profesionalizar la app interna" (arriba) ya había identificado
el patrón `.subcard`/`.subcard-titulo`/`.campo-ayuda` como reusable "en
Maquila, Gastos, Finca y Cuentas de cobro más adelante" — este es ese
pase, para los dos formularios que todavía mezclaban, sin separación
visual, "agregar UNA línea/concepto" con "cerrar TODO el registro" (el
mismo problema que ya se había corregido en Ventas):

- **Maquila**: "① Agregar servicio a la orden" (Servicio, Kilos o
  Presentación+Cantidad o nota de transporte según el servicio, Valor de
  esta línea) y "② Cerrar la orden" (Estado, Método de pago, Quién
  recibió) — Cliente se queda afuera de los dos, igual que Cliente/Tipo
  de cliente en Ventas.
- **Cuentas de cobro**: "① Agregar un concepto" (Descripción,
  Presentación, Cantidad, Valor unitario, Valor total — de ESE concepto,
  no de toda la cuenta) y "② Cerrar y generar el PDF" (Otros, envío,
  Total, botón de generar) — Cliente/NIT/Ciudad/A nombre de se quedan
  afuera, son datos del encabezado, no de un concepto ni del cierre.

Ningún `id`/`onchange`/`onclick` cambió — es puramente visual (agregar
los `<div class="subcard">`/`<p class="subcard-titulo">`/`<p
class="campo-ayuda">` alrededor de los campos que ya existían), mismo
criterio que ya se documentó para `.subtabs`: no inventar nada nuevo, ni
mezclar un rediseño con lógica nueva. Probado en el preview: Maquila
sigue calculando la línea/orden igual, el toggle de "Quién recibió"
según método sigue funcionando, y Cuentas de cobro sigue agregando
líneas y sumando el total — sin errores de consola.

**Sobre "extremadamente claro" a 10 empleados — una pregunta que no
resolví sola, porque es una decisión de negocio, no de UI**: lo más
grande que cambiaría la claridad real a esa escala es que **hoy toda la
app usa una sola cuenta compartida de Supabase Auth para todo el
equipo** (`CLAVE_CONFIG` aparte solo protege Configuración) — con 3
personas de confianza ya era una decisión consciente de Juan ("no hay
roles ni usuarios individuales"), pero con 10 empleados eso significa
que ningún registro se puede atribuir de verdad a quién lo hizo (más
allá de "quién pagó"/"quién recibió", que el usuario mismo escribe a
mano y puede equivocarse o mentir sin que quede rastro), y cualquiera
con la sesión abierta puede tocar cualquier cosa, incluida Configuración
si conoce la clave. No se tocó nada de esto — cambiar a cuentas
individuales es una decisión real de Juan (implica login individual,
recuperación de contraseña, posiblemente permisos por rol) y no algo
para decidir en silencio dentro de un pase de "mejoras de claridad".
Juan preguntó cómo se podría mejorar esto — se le presentaron 2 niveles
posibles. **El Nivel 1 ya está implementado (ver sección siguiente,
"Atribución real por sesión")**. El Nivel 2 sigue sin construirse,
anotado acá para cuando Juan lo quiera retomar:

- **Nivel 2 — Restricciones de verdad, sobre la base del Nivel 1**:
  decidir qué pantallas/acciones solo pueden tocar ciertas personas
  (ej. ¿quién entra a Configuración? ¿quién puede eliminar un
  registro?) — necesita que Juan defina esas reglas primero (no es algo
  para inventar), y un campo `rol` nuevo + lógica de permisos en cada
  pantalla sensible.

## Atribución real por sesión — Nivel 1 implementado (2026-09-24)

Juan confirmó el Nivel 1 descrito arriba ("solo atribución real, sin
restringir nada") y pidió el paso a paso — implementado por completo.

**Cómo funciona, de fondo**: el login de `index.html` (`iniciarSesion()`)
YA aceptaba cualquier correo/contraseña de Supabase Auth — nunca estuvo
atado a una sola cuenta por código, solo por costumbre (todo el equipo
usaba las mismas credenciales). Así que no hizo falta tocar NADA del
login ni de la UI para "activarlo" — el único cambio real es que ahora,
cuando alguien crea un registro, el backend guarda de forma automática
el correo de la sesión que lo creó, en vez de confiar en lo que el
navegador diga.

- **Migración nueva** (`migracion_atribucion_usuarios.sql`): columna
  `creado_por` (text, nullable) en las 9 tablas que importan para esto —
  `ventas`, `ordenes_maquila`, `gastos`, `finca`, `cosechas`,
  `compras_cereza`, `compras_pergamino`, `lotes_tueste`,
  `cuentas_cobro`.
- **`functions/_lib/auth.ts`**: nueva `requireAuthConUsuario(request,
  env)` — mismo contrato que `requireAuth()` (Response = corta la
  petición, sigue igual en todos los GET y en los PATCH/DELETE que no
  cambiaron), pero además devuelve el correo real de
  `supabase.auth.getUser(token)`. Los dos comparten una función interna
  (`validarSesion()`) para no repetir la lógica ni el `try/catch` del
  gotcha ya documentado ("JWT issued at future").
- **Los 9 endpoints POST correspondientes**: cambiaron `requireAuth()`
  por `requireAuthConUsuario()` y guardan `creado_por: email` en el
  INSERT — el navegador nunca manda este valor, así que no se puede
  falsear. Los `SELECT` de cada endpoint (mismos en GET y POST) ganaron
  `creadoPor:creado_por` para que `sincronizar()` lo traiga solo, como
  cualquier otro campo.
- **`nombreDeCorreo(correo)`** (`index.html`, junto a `fechaCorta`):
  saca la parte antes de la `@` y la pone con mayúscula inicial — para
  no mostrar el correo completo en cada fila. Es una aproximación (no
  lleva tildes, por ejemplo "Ines" en vez de "Inés", porque los correos
  no las llevan) — si hace falta más adelante un nombre bonito de
  verdad, tocaría una tabla chica correo→nombre, no se construyó todavía
  porque no se pidió.
- **Se muestra en las 9 filas correspondientes** (`filaVenta`,
  `filaOrdenMaquila`, `filaGasto`, `filaFinca`, `filaCuentaCobro`, la
  fila de Cosechas, la de Cereza comprada, la lista de
  `vistaPergamino()`/`entradasPergamino()`, y la de Tueste): `· agregado
  por <Nombre>` al final de la línea `.meta`, SOLO si `creadoPor` existe
  (los registros de antes de esta migración se quedan sin esa parte,
  sin romper nada). **"Quién pagó"/"Quién recibió" NO se tocaron** —
  siguen siendo campos que la persona llena a mano, sobre de qué CUENTA
  BANCARIA sale/entra la plata (un concepto distinto de quién usó la
  app para escribirlo, los dos coexisten). **Mismo criterio para
  `titular` en Cuentas de cobro** (confirmado por Juan): cualquiera
  puede generar una cuenta de cobro, `titular` solo dice a nombre de
  quién queda emitida en el PDF (Juan o Inés) — es un eje totalmente
  distinto de `creado_por` (quién la generó desde la app), y los dos
  campos son independientes a propósito, no hay que confundirlos ni
  fusionarlos si se toca esto de nuevo.

**Lo que Juan tiene que hacer para que se vea real** (nada de esto es
código, es un pendiente operativo — ver "Pendiente" más abajo):
1. Correr `migracion_atribucion_usuarios.sql` en el SQL Editor de
   Supabase.
2. Ir al panel de Supabase → Authentication → Users → "Add user" (o
   "Invite") por cada persona del equipo, con su correo real — Supabase
   ya soporta esto sin ningún cambio de código, es solo usar el panel.
3. Cada persona entra a la app con SU PROPIO correo/contraseña, en vez
   de la clave compartida de siempre — mismo formulario de login de
   siempre, no cambió nada ahí.
4. Opcional, cuando ya no se quiera que la cuenta compartida vieja
   siga funcionando: desactivarla o cambiarle la contraseña desde el
   panel de Supabase — nada de esto es código tampoco.

Mientras el paso 2 no se haga, `creado_por` va a seguir mostrando el
correo de la cuenta compartida de siempre para todo el mundo (degrada
con gracia, no rompe nada) — se vuelve realmente útil apenas Juan cree
las cuentas individuales.

**Estado real, confirmado por Juan (2026-09-24)**: se creó una cuenta
individual para Joaquín — Juan e Inés van a seguir compartiendo la
cuenta vieja de siempre, a propósito, no por falta de terminar el
proceso. Consecuencia esperada (no es un bug si alguien lo reporta):
cualquier registro que haga Juan O Inés va a mostrar el mismo "agregado
por" (el correo de esa cuenta compartida) — solo Joaquín queda
distinguido de verdad. Razón por la que esto no molesta en la práctica:
**Inés casi no anota nada en la app** — su uso real es casi
exclusivamente entrar a generar una cuenta de cobro, y ahí `titular` (a
nombre de quién queda emitida, ver arriba) ya distingue perfectamente
si es la de ella o la de Juan, sin depender de `creado_por` para nada.
Si más adelante se quiere separar también a Juan e Inés, es el mismo
paso de siempre (una cuenta más en el panel de Supabase, cero cambios
de código).

## `sincronizar()` ya no corta todo si un endpoint falla (2026-09-24)

**Incidente real**: al sumar `creadoPor:creado_por` al `SELECT` de 9
endpoints a la vez (ver "Atribución real por sesión" arriba) sin haber
corrido todavía `migracion_atribucion_usuarios.sql`, Juan reportó que la
app "dejó de funcionar" — no exageraba: literal, TODA la app quedó sin
datos frescos, no solo las 9 pantallas nuevas. Causa de fondo (no la de
esta vez puntual, sino la que ya venía de antes, documentada como
limitación conocida en el gotcha del `requireAuth()` de 2026-09-21):
`sincronizar()` pedía los 21 endpoints en paralelo con `Promise.all()`,
y si UNO SOLO devolvía `!r.ok`, la función cortaba ahí mismo — ningún
`state.x` se actualizaba, así que las otras 12 pantallas que sí habían
contestado bien igual se quedaban con datos viejos (o vacíos, si era la
primera carga) y un error genérico arriba. Antes esto se había sentido
como un problema aislado cada vez (un endpoint nuevo, recién agregado,
sin su migración) — esta vez, como el mismo cambio tocó 9 endpoints
EXISTENTES y muy usados a la vez, el impacto fue mucho más grande y
evidente: se sintió como que la app entera se rompió.

**Arreglo real, no un parche para esta vez**: `sincronizar()` ahora
resuelve cada endpoint por separado (`CLAVES_SINCRONIZAR`, mismo orden
que el array `endpoints`) — si uno falla, se guarda en una lista de
`fallos` y se sigue con los demás; los que sí contestaron bien
actualizan su parte de `state` y su caché local normalmente. Al final,
`renderTodo()` se llama SIEMPRE (con lo que sí llegó fresco + lo viejo
en caché para lo que falló) y el indicador de sincronización muestra
cuál endpoint falló y por qué (`Error en /api/gastos (500): column
"creado_por" does not exist`, con botón "Reintentar"), pero **ya no
bloquea el resto de la app** — el usuario puede seguir vendiendo,
registrando gastos, etc. con datos frescos mientras se corrige la
migración que falta. Si fallan varios a la vez, se muestra el primero
+ un contador ("+2 más — revisa Configuración", el panel de salud del
esquema ya lista todos).

**Lo que SÍ se quedó igual, a propósito**: un 401 (sesión vencida) y un
fallo del `fetch()` en sí (sin red de verdad) siguen cortando TODO de
una — no tiene sentido intentar sincronizar endpoint por endpoint si la
sesión ya no sirve o si no hay conexión, los 21 van a fallar por la
misma razón.

Probado en el preview simulando un 500 solo en `/api/gastos`
(interceptando `window.fetch` temporalmente): `state.ventas` se
actualizó normal, `state.gastos` se quedó con el valor anterior sin
borrarse, el indicador mostró el error específico de gastos con
"Reintentar", y Ventas siguió renderizando sin ningún problema — sin
tocar el camino feliz (sincronizar sin fallos sigue mostrando
"Sincronizado" exactamente igual que antes).

## Auditoría completa: pergamino/verde/tostado que "desaparecía" (2026-09-25)

Juan reportó: agregó pergamino con "+ Agregar pergamino que ya tenías",
le dio "🌾 Trillar pergamino disponible", y el café desapareció — no
bajó de pergamino de forma útil NI llegó a "Café verde disponible", así
que tampoco quedaba disponible para tostión. Pidió auditar TODA la
cadena cosecha→pergamino→trilla→verde→tueste.

**Causa raíz encontrada**: `ajustar_stock_pergamino`/`ajustar_stock_verde`
(las funciones SQL que mueven kilos entre las tablas de inventario) hacían
un `UPDATE ... WHERE lote = p_lote [AND grado = p_grado]` puro. Si esa
fila no existía todavía en la tabla (por la razón que sea — un lote que
no se seedeó, una malla que faltó, lo que sea), el `UPDATE` actualiza
CERO filas — Postgres no considera eso un error, simplemente no pasa
nada. Y ningún lugar del código TypeScript revisaba si la llamada
`supabase.rpc(...)` había devuelto un `error` — así que el código seguía
como si todo hubiera salido bien: mostraba el toast de éxito, guardaba un
movimiento en el historial (¡de un ajuste que en realidad nunca pasó en
la tabla real!), y `sincronizar()` traía números que nunca se habían
movido. Exactamente "desaparece" — ni error, ni rastro real, solo un
historial que decía que sí pasó.

**Arreglo, dos partes**:

1. **`migracion_robustez_inventario_cafe.sql`** — las 3 funciones que
   mueven inventario en esta app (`ajustar_stock_pergamino`,
   `ajustar_stock_verde`, y de paso `ajustar_stock_inventario` — la más
   vieja de todas, del café YA TOSTADO, mismo problema aunque nunca se
   había reportado) pasan de `UPDATE` puro a `INSERT ... ON CONFLICT DO
   UPDATE` (upsert): si la fila no existe, la CREA con el valor correcto,
   en vez de no hacer nada. Esto es indiferente a si se sembraron o no
   todas las combinaciones de lote×malla de antemano — funciona siempre.
2. **`functions/_lib/verde.ts`**: nuevo helper interno `ajustarStock()`
   que SÍ revisa `error` y TIRA si Supabase falla — `aplicarTrilla()` y
   `revertirTrilla()` lo usan internamente. Se exportaron además
   `ajustarStockPergamino(supabase, lote, delta)` y
   `ajustarStockVerde(supabase, lote, grado, delta)`, para que CUALQUIER
   otro lugar del código que toque estos dos inventarios directamente
   (no solo trillar) tenga la misma protección. Se reemplazaron TODAS
   las llamadas sueltas `supabase.rpc('ajustar_stock_pergamino'|
   'ajustar_stock_verde', ...)` que no revisaban error, en:
   `cosechas/[id].ts` (⚖️ pesar, PATCH y DELETE), `cereza-comprada/[id].ts`
   (⚖️ pesar, PATCH y DELETE), `pergamino/[id].ts` (🌾 trillar, PATCH y
   DELETE), `pergamino/index.ts` (comprar pergamino directo),
   `inventario-pergamino/trillar.ts` (el botón nuevo de "🌾 Trillar
   pergamino disponible"), y `tuestes/index.ts`/`tuestes/[id].ts`
   (retirar para tostión y devolverlo al borrar). De paso se aplicó el
   mismo criterio a `ajustar_stock_inventario` (café tostado) en
   `functions/_lib/convert.ts` (usado por ventas) y en `tuestes/index.ts`/
   `[id].ts` — mismo tipo de llamada, mismo hueco, aunque sin reporte
   de que hubiera fallado. Cada endpoint ahora, si el ajuste de inventario
   falla, responde 500 con un mensaje claro (`"Se guardó X, pero no se
   pudo ajustar el inventario: <error real>"`) en vez de fingir que salió
   bien — mismo criterio ya establecido en toda la app de mostrar el
   error real de Postgres en vez de tragárselo.
   `functions/api/inventario-pergamino/index.ts` e
   `functions/api/inventario-verde/index.ts` (los POST de "+ Agregar
   pergamino/verde que ya tenías") YA revisaban el error correctamente
   desde que se construyeron — no se tocaron.

**Qué hacer, en orden**:
1. Correr `migracion_robustez_inventario_cafe.sql` en Supabase — a
   diferencia de la migración de atribución de usuarios, esta NO agrega
   ninguna columna/tabla nueva, solo redefine 3 funciones existentes
   (`CREATE OR REPLACE FUNCTION`) — segura de correr en cualquier momento,
   no hace falta coordinarla con el deploy del código.
2. Una vez corrida, volver a intentar la operación que "desapareció"
   (agregar el pergamino que haga falta y trillarlo) — ahora, si algo
   vuelve a fallar, va a salir un error claro en vez de un silencio.
3. Si Juan sospecha que ya se perdieron kilos de un intento anterior (el
   caso real que reportó), lo más simple es corregir el número a mano con
   "+ Agregar pergamino que ya tenías" o "+ Agregar café verde que ya
   tenías" — las mismas herramientas que ya existían para sembrar stock
   viejo sirven igual de bien para corregir un número que quedó mal por
   este bug. "Historial de movimientos" puede tener una entrada de más de
   ese intento fallido (un movimiento se alcanzó a registrar aunque el
   ajuste real no pasó) — es la única cicatriz visible del bug viejo, no
   afecta nada hacia adelante.

Recorrido completo verificado leyendo TODO el código, extremo a extremo
(no solo el síntoma reportado): cosecha/cereza comprada → pesar pergamino
(⚖️) → pergamino disponible (pool) → trillar (🌾, tanto desde un registro
como desde "Trillar pergamino disponible") → café verde disponible (por
malla) → retirar para tostión → inventario tostado. Los 3 orígenes de
pergamino (cosecha propia, cereza comprada, comprado directo) y los 2
caminos de "ya tenía" (pergamino existente, verde existente) usan ahora
exactamente el mismo mecanismo protegido — no quedó ningún lugar que
toque estos inventarios sin revisar si de verdad funcionó.

## Primera foto real en "Del cafeto a tu taza" (2026-09-25)

Juan mandó 5 fotos + un video de la finca para usar en `.proceso-pasos`
(ver "Rediseño de lujo" más arriba — esa sección ya tenía anotado que
faltaba material real para esto). Revisado uno por uno (incluida una
vista previa del video sacada con `qlmanage -t`, ya que no hay
`ffmpeg`/`ffprobe` instalados para inspeccionarlo de otra forma): de las
6 piezas, **solo una foto y el video correspondían de verdad a un paso
específico** — ambos son cerezas de café maduras y verdes en la rama,
que encajan con "① Cereza". Las otras 4 fotos (puente de guadua entre
la maleza, una plántula con el perro y las botas de Juan, vista aérea
del dosel del bosque, la quebrada con piedras) son fotografía de
ambiente/sendero muy buena, pero no documentan específicamente
"② Lavado y secado", "③ Trilla" ni "④ Tueste" — se guardaron sin usar
en vez de forzarlas donde no corresponden (mismo criterio que ya se
había aplicado a las fotos de bolsa: no rellenar con algo genérico).

- **`pedidos/img/proceso-cereza.jpg`** (nueva, mismo patrón que
  `finca-flor.jpg`/`finca-ladera.jpg`: archivo real aparte, NO base64
  inline — son fotografías, no arte vectorial).
- **`.proceso-foto`** (CSS nueva, junto a `.proceso-paso p`): imagen de
  ancho completo hasta 280px, esquinas redondeadas, `aspect-ratio: 3/2`
  (la proporción real de la foto, 1280×853) para que no salte el layout
  mientras carga.
- Solo el `<div>` del paso "① Cereza" en `.proceso-pasos` ganó el
  `<img class="proceso-foto">` — los otros 3 pasos se quedan exactamente
  como estaban (número + texto, sin imagen) hasta que Juan consiga fotos
  reales de esos pasos. A propósito NO se rediseñó el bloque completo
  para "4 fotos parejas" con 3 placeholders vacíos — un paso con foto y
  tres sin ella se ve intencional (foto real cuando existe), un
  placeholder vacío se vería como un error.
- Probado en el preview local en desktop y en mobile (375px): la foto se
  ve completa, sin recortes raros, y los pasos 2-4 conservan su
  espaciado de siempre sin ningún hueco extra donde iría una imagen que
  no existe.

El video (el mismo tema, cereza con gotas de agua, cámara con
rack-focus) quedó sin usar todavía — se le propuso a Juan como fondo en
movimiento del Hero (en vez de `finca-flor.jpg`, la foto fija actual)
pero no se implementó, a la espera de que confirme si le interesa esa
idea o prefiere guardarlo para cuando tenga el resto del material.

**Segunda foto real, el mismo día — "② Lavado y secado" resuelto**: Juan
mandó un video más (WhatsApp, vertical, 464×832 — resolución nativa
real del archivo, confirmada con `mdls`, no una limitación de cómo se
extrajo) que sí muestra el paso que faltaba: las marquesinas/secaderos
de la finca con pergamino secándose al sol. Mismo método que con el
video de cereza (`qlmanage -t` para sacar un fotograma, ya que no hay
`ffmpeg` instalado) — el fotograma en sí ya era una composición buena,
no hizo falta pedir otro ángulo. Se guardó como
`pedidos/img/proceso-secado.jpg` y se agregó al `<div>` del paso
"② Lavado y secado", mismo patrón que Cereza. Única diferencia: como
la foto es VERTICAL (a diferencia de la de cereza, que es horizontal) y
`.proceso-foto` tiene `aspect-ratio: 3/2` (horizontal) para que las
fotos del carrusel no salten de tamaño entre sí, el recorte automático
(`object-fit: cover`, centrado por default) dejaba muy poco de las
marquesinas y de más el cielo/la montaña de fondo — se corrigió con
`style="object-position: center 40%"` inline en ESA imagen puntual (no
en la clase, que sigue sirviendo tal cual para fotos horizontales como
la de Cereza) para que el recorte se centre un poco más abajo, sobre el
pergamino, en vez de a la mitad exacta del cuadro. Quedan "③ Trilla" y
"④ Tueste" sin foto todavía.

**Tercera vuelta, mismo día — "Lavado y secado" en realidad son DOS
fotos, no una**: Juan notó algo real — el secado de Lavado (marquesinas
al aire libre, pergamino claro) y el de Honey/Natural (invernadero,
pergamino oscuro por la miel del mucílago) se ven bien distintos, y el
texto de este paso YA lo decía explícitamente ("Lavado es el más
rápido; Honey y Natural fermentan mucho más tiempo en caneca") — una
sola foto (la de Lavado) solo contaba la mitad de esa frase. Mandó 2
fotos reales del secado de Honey en el invernadero; se eligió la de
mejor perspectiva (misma composición "fila de secaderos en fuga" que ya
tenía la foto de Lavado, para que las dos combinen visualmente) como
`pedidos/img/proceso-secado-honey.jpg`.

- **`.proceso-fotos-par`** (CSS nueva): las dos fotos van lado a lado
  (flex, `gap:10px`, cada una a la mitad del ancho de `.proceso-foto`
  normal) con una etiqueta chica debajo de cada una ("LAVADO" /
  "HONEY Y NATURAL", `.proceso-foto-etiqueta`, mismo estilo de texto
  pequeño-mayúscula-teal que ya usa `.proceso-titulo` en otra parte del
  sitio) — sin esa etiqueta, dos fotos de secaderos una al lado de la
  otra no dejarían claro que son procesos distintos, no la misma cosa
  fotografiada dos veces.
- Este par SOLO existe en el paso "② Lavado y secado" — los demás pasos
  (Cereza, Trilla, Tueste) tienen un único `<img class="proceso-foto">`
  normal (o ninguno todavía), porque no describen dos procesos distintos
  en su texto. Si más adelante Trilla o Tueste también necesitaran
  mostrar una variación por proceso, este mismo patrón `.proceso-fotos-par`
  ya está listo para reusarse ahí, no hay que inventarlo de nuevo.
- Probado en desktop y mobile (375px): las dos fotos quedan del mismo
  tamaño, sin desbordar el ancho de la columna de texto (420px máximo de
  `.proceso-pasos`), y las etiquetas se leen bien en las dos anchuras.

## Pendiente / a medias

- **⚠️ Merch — falta correr la migración, Y sigue sin link público a
  propósito**: el código ya está (ver sección "Merch — pestaña nueva..."
  arriba), pero hasta que no se corra `migracion_merch.sql` en Supabase,
  la pestaña "Merch" de la app interna va a mostrar el error real de
  Postgres. Aparte de eso — a diferencia de cualquier otra migración
  pendiente de esta lista — esta sección NO debe lanzarse sola: aunque
  se corra la migración, `/merch` se queda sin ningún botón en la
  página pública hasta que Juan avise que ya armó el catálogo y quiera
  lanzarlo (ver el "Pendiente" al final de esa misma sección para el
  cambio de 2 líneas que hace falta ese día).
- **⚠️ Blog — faltan correr 2 migraciones**: el código ya está (ver
  secciones "Blog — pestaña nueva..." y "Blog — subir un artículo desde
  un archivo de Word" arriba), pero hasta que no se corran
  `migracion_blog.sql` (tabla `blog_posts`) Y `migracion_blog_html.sql`
  (columna `es_html`, para subir artículos desde Word) en Supabase, la
  pestaña "Blog" de la app interna va a mostrar el error real de Postgres
  y la sección "Blog" de la página de pedidos no va a poder cargar
  artículos — el panel de ⚠️ migraciones pendientes en Configuración ya
  detecta las dos por separado.
- **⚠️ Costos por kg tostado (Gas, etc.) — falta correr la migración**: el
  código ya está (ver sección "Costos por kg tostado, ahora una lista"
  arriba), pero hasta que no se corra `migracion_costos_por_kg.sql` en
  Supabase, Configuración → "Costos para 'Margen estimado por lote'" va
  a mostrar el error real de Postgres (columna `costos_por_kg`
  inexistente) en vez de la lista editable — el panel de ⚠️ migraciones
  pendientes ya lo detecta.
- **⚠️ Precios de Mayorista/Interno — falta correr la migración**: el
  código ya está (ver sección "Auditoría de claridad de precios" arriba),
  pero hasta que no se corra `migracion_precios_mayorista_interno.sql` en
  Supabase, elegir "Mayorista" o "Interno" en Ventas va a sugerir $0 (no
  hay fila todavía para esos tiers) — el panel de ⚠️ migraciones
  pendientes en Configuración ya lo detecta. Una vez corrida, revisar que
  el valor clonado de "Precio normal" sea el que Juan de verdad quiere
  cobrar en cada una — arranca igual al normal a propósito, como punto de
  partida editable, no como la tarifa final.
- **⚠️ Atribución de usuarios — falta correr la migración**: el código
  ya está (ver sección "Atribución real por sesión" arriba), pero a
  diferencia de migraciones anteriores (que afectaban 1-2 endpoints),
  esta vez el `SELECT` de 9 endpoints (ventas, maquila, gastos, finca,
  cosechas, cereza comprada, pergamino, tuestes, cuentas de cobro) ya
  incluye `creadoPor:creado_por` — mientras no se corra
  `migracion_atribucion_usuarios.sql` en Supabase, esos 9 van a fallar
  (columna inexistente) hasta que se corra. Esto YA NO tumba el resto de
  la app (ver "`sincronizar()` ya no corta todo si un endpoint falla" —
  se corrigió justo por este incidente real, 2026-09-24), pero esas 9
  pantallas igual se quedan con datos viejos hasta correrla — el panel
  de ⚠️ migraciones pendientes en Configuración ya lo detecta (2
  entradas nuevas en `CHEQUEOS`).
- **Cuentas individuales — falta que Juan las cree en Supabase**: aunque
  se corra la migración de arriba, `creado_por` va a seguir mostrando el
  correo de la cuenta compartida para todo el mundo hasta que Juan cree
  una cuenta de Supabase Auth por persona (panel de Supabase →
  Authentication → Users) y cada quien entre con la suya — ver el paso a
  paso completo en "Atribución real por sesión" arriba.
- **Inventario de café verde/pergamino — falta correr la migración**: el
  código ya está (ver sección "Inventario de café verde por malla +
  pergamino disponible" arriba), pero hasta que no se corra
  `migracion_inventario_verde.sql` en Supabase, la pestaña "Café verde"
  y el paso de trilla (🌾) en Cosechas/Cereza comprada/Pergamino comprado
  van a fallar con el error real de Postgres — mismo patrón ya
  establecido para cualquier migración nueva. El panel de ⚠️ migraciones
  pendientes en Configuración ya la detecta sola (se agregaron 2 entradas
  nuevas a `CHEQUEOS` en `functions/api/salud-esquema/index.ts`).
- **Entrega de maquila, saldo inicial y precio FNC — falta correr 3
  migraciones**: el código ya está (ver secciones "Órdenes de maquila...",
  "Balance de cuentas por persona" y "Precio de referencia del café"
  arriba), pero hasta que no se corran `migracion_entrega_maquila.sql`,
  `migracion_saldos_iniciales.sql` y `migracion_precio_fnc.sql` en
  Supabase, `sincronizar()` va a mostrar el aviso de error (columna/tabla
  inexistente) en vez de cargar los datos — es el mismo caso que ya pasó
  antes con `transporte` en cuentas de cobro, documentado en Gotchas más
  abajo. Corre las tres migraciones antes de dar por bueno el deploy.
  Además, el precio FNC no muestra nada real hasta que también se
  configure el cron externo (ver esa sección: mismo `CRON_SECRET` que ya
  existe, apuntando a `/api/cron/precio-fnc`).
- **Pasilla — falta correr la migración**: el código ya está (ver sección
  "Pasilla" arriba), pero hasta que no se corra `migracion_pasilla.sql`
  en Supabase, anotar kilos de pasilla al pesar pergamino va a fallar
  (columna `kilos_pasilla` inexistente) y el desplegable de Lote en
  Ventas/Tueste va a mostrar "Pasilla" pero sin precio sugerido (no
  existe todavía la fila en `precios_cafe`) — hay que corregir el valor a
  mano hasta que se corra.
- **Ventas/maquila pagadas en Efectivo antes del backfill**: el backfill
  (`migracion_backfill_recibido_por.sql`, ya corrida) solo pudo rellenar
  `recibido_por` en filas cuyo `metodo` ya nombraba a alguien — las que se
  pagaron en Efectivo quedaron sin dueño (no hay forma de deducirlo) y
  siguen pendientes de corregir a mano con ✎. El aviso ⚠️ en "Balance de
  cuentas" (`contarHuerfanos()`) las señala en tiempo real, así que se
  puede ir revisando esa lista sin necesidad de volver al SQL Editor.
- **Alerta de fermentación por WhatsApp — falta la configuración de Juan**:
  el código ya está (ver sección "Fermentación en caneca" arriba), pero no
  manda nada real hasta que Juan: 1) corra `migracion_fermentacion.sql` en
  Supabase, 2) active CallMeBot y ponga `CALLMEBOT_PHONE`/`CALLMEBOT_APIKEY`
  en Cloudflare, 3) invente una palabra para `CRON_SECRET` y la ponga
  también en Cloudflare, y 4) cree el cron en cron-job.org apuntando al
  endpoint con esa clave. Sin esos 4 pasos, los campos de fermentación se
  guardan bien pero nadie recibe el aviso.
- **Fotos reales de bolsa en `pedidos/index.html`**: las tarjetas de lote
  siguen siendo tipográficas (sin foto de producto) — clientes se habían
  quejado de que las fotos recortadas de la carta se veían pixeladas en
  pantallas retina (~220px estiradas a 260px). En vez de eso, desde la
  auditoría de identidad visual (ver "Identidad visual..." más abajo) el
  color/tipografía ya coinciden con la carta real, lo que resolvió la
  queja de que la página se veía genérica/"hecha con IA" sin necesitar
  fotos nuevas. Si más adelante Juan consigue fotos de bolsa en buena
  resolución (no capturas de pantalla comprimidas), se pueden agregar
  como imagen dentro de `.lote-cabecera` sin tocar el resto del rediseño.
  **Ampliado 2026-09-21** (una clienta real dio el mismo feedback, ver
  "Auditoría CRO 2026-09-21" más arriba): también falta una foto real
  por paso del Proceso (Cereza/Lavado y secado/Trilla/Tueste, para el
  carrusel que pidió) y más fotos de la finca/producto empacado en
  general — mismo bloqueo, falta que Juan mande el material real.
  **Avance 2026-09-25**: Juan mandó 5 fotos + un video reales de la
  finca — de eso, solo una foto (cerezas maduras y verdes en la rama) y
  el video (mismo tema, más cinematográfico, con gotas de agua)
  correspondían de verdad a un paso del Proceso — las otras 4 (puente
  de guadua, una plántula con el perro y las botas, vista aérea del
  dosel del bosque, la quebrada) son fotos de ambiente/sendero muy
  buenas pero no documentan Lavado/Trilla/Tueste específicamente, así
  que se guardaron sin usar por ahora en vez de forzarlas donde no
  corresponden (`pedidos/img/proceso-cereza.jpg`, agregada SOLO al paso
  "① Cereza" de `.proceso-pasos`, clase nueva `.proceso-foto` — ver
  sección propia más abajo). Juan confirmó que va a conseguir fotos
  reales de los otros 3 pasos más adelante — mientras tanto, esos 3
  siguen sin foto a propósito (no es un descuido, es no tener nada
  bueno todavía) en vez de rellenar con una foto de bosque genérica que
  no sea la etapa real.
  La tarifa `web` en `precios_cafe` con los precios reales del 2026 ya
  está corrida en producción (ver `migracion_precios_carta_2026.sql` y
  `migracion_exoticos_web_inicial.sql`) — ojo que los valores que quedaron
  ahí para Honey/Natural/Exótico se editaron después a mano desde
  Configuración y ya no coinciden exactamente con esos dos archivos; lo
  que hay en Supabase ahora mismo es lo vigente.
- **Catálogo como bolsa real**: hecho para los 3 lotes — Lavado con su
  propia bolsa tradicional, Honey y Natural compartiendo la bolsa con
  selector de "Proceso" (ver "Tarjeta-bolsa interactiva (Lavado)" y
  "Tarjeta-bolsa compartida (Honey/Natural)" arriba). `tarjetaListaHTML()`
  (la tarjeta de texto de siempre) queda como respaldo por si algún día
  se agrega un lote nuevo sin bolsa todavía.
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

- **`requireAuth()` sin `try/catch` alrededor de `supabase.auth.getUser(token)`
  tumbaba TODA la app por un solo endpoint** (2026-09-21): Juan reportó
  "Error en /api/pergamino (500): JWT issued at future" y toda la
  sincronización se rompió (no solo pergamino — `sincronizar()` corta en
  el PRIMER endpoint que falla, así que un solo endpoint atascado bloquea
  los otros 15). Causa: en un caso raro de desfase de reloj entre Supabase
  Auth y el Worker, `supabase.auth.getUser(token)` puede TIRAR una
  excepción en vez de devolver `{ error }` limpio — como `requireAuth()`
  no tenía `try/catch`, eso tumbaba la función entera con un 500 crudo
  (el mensaje de la excepción tal cual), en vez del 401 "No autorizado"
  de siempre que `sincronizar()` ya sabe manejar con "Tu sesión expiró".
  Arreglado envolviendo esa llamada en `try/catch`, tratando cualquier
  excepción igual que un token inválido (401). Esto NO tenía nada que ver
  con el precio del café ni con ninguna migración — pasó en un endpoint
  que no se había tocado — pero como bloqueaba toda la sincronización,
  se sentía como "la página entera tiene un error". Moraleja: en
  `functions/_lib/`, cualquier llamada a una librería externa (Supabase,
  CallMeBot, lo que sea) que pueda fallar de forma inesperada necesita su
  propio `try/catch` — un solo endpoint roto sin protección puede tumbar
  áreas de la app que no tienen nada que ver.
  **⚠️ Actualización 2026-09-24**: el "un solo endpoint atascado bloquea
  los otros 15" de arriba ya NO es cierto — ver "sincronizar() ya no
  corta todo si un endpoint falla" más abajo, donde se corrigió esa
  causa de fondo (no solo este síntoma puntual del reloj desfasado).

- La tabla `.tabla-clientes` se reutiliza en varios lados (Mejores
  clientes, Balance por persona, Por modalidad/cuenta) con un único
  `.fila-cliente { grid-template-columns: 1.6fr .7fr 1.1fr .9fr }` de 4
  columnas — bien para las que de verdad tienen 4 datos, pero "Por
  modalidad/cuenta" solo tiene 2 (Modalidad, Total) y rellenaba las otras
  dos con `<span></span>` vacíos, dejando ~45% de la fila en blanco a la
  derecha (se notaba tanto en mobile como en desktop ancho). Arreglado con
  una clase extra `.fila-modalidad { grid-template-columns: 2fr 1fr }`
  aplicada solo ahí. Moraleja: si una tabla nueva reutiliza
  `.tabla-clientes` pero con menos columnas reales, dale su propio
  modificador de `grid-template-columns` en vez de rellenar con spans
  vacíos — encontrado en la auditoría de claridad de cuentas/gráficas.
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
- Cualquier botón que solo cambia una subpestaña/rango/período y vuelve a
  llamar a un `renderX()` que reemplaza el `innerHTML` (en vez de un botón
  de navegación entre pestañas principales) tiene que envolver esa llamada
  en `conservarScroll(() => {...})` (definida junto a `cambiarPagina`) — si
  no, el usuario pierde el scroll y la pantalla salta arriba con cada clic.
  Pasó con las subpestañas de "Detalle del mes" en Resumen
  (`cambiarResumenSubTab`), el selector de rango de las gráficas
  (`cambiarRango`) y el de "Mejores clientes" (`cambiarPeriodoClientes`).
- `pintarNavRapida()` (los atajos ☕ Lavado · Honey · Natural · Exóticos
  pegados arriba de `pedidos/index.html`) arma cada `href="#lote-..."`
  con el nombre del lote en minúsculas — pero Honey y Natural NO tienen
  su propia tarjeta, comparten una sola con `id="lote-honeynatural"` (ver
  "Tarjeta-bolsa compartida (Honey/Natural)"). Si el link de Honey/Natural
  apunta a `#lote-honey`/`#lote-natural` (que no existe), el clic no hace
  nada — se queda estático, sin error en consola. Ya pasó una vez; el fix
  fue que `pintarNavRapida()` redirija esos dos casos a
  `lote-honeynatural` y además llame `elegirProceso(l)` en el `onclick`
  para que el panel muestre el proceso correcto al llegar, no el que
  haya quedado activo antes. Moraleja: cualquier `href`/`id` generado con
  el mismo patrón `lote-${lote.toLowerCase()}` hay que revisarlo a mano
  si el lote en cuestión vive agrupado con otro en una sola tarjeta.
- El selector de peso de las tarjetas-bolsa (Lavado y Honey/Natural)
  muestra el **peso neto** (`PESO_NETO_POR_PRES`: Media lb→250 gr,
  Libra→500 gr, Kilo→1000 gr, Cuarterón→2500 gr) en vez del nombre de la
  presentación — Juan pidió que fuera más claro en la elección. La clave
  interna (`peso`, usada en `carrito`, `precioDe`, el resumen del pedido
  y el mensaje de WhatsApp) sigue siendo el nombre de presentación de
  siempre (`ORDEN_PRES`); solo la etiqueta que se ve en `.bolsa-peso-bar`
  y en los `.peso-pill` pasa por `PESO_NETO_POR_PRES[peso] || peso`. Si
  se agrega una presentación nueva, hay que sumarle su gramaje ahí
  también o se va a ver el nombre de presentación como respaldo.
- Los `const` de logos/firmas en base64 (`LOGO_B64`, `FIRMA_B64`,
  `FIRMA_INES_B64`, etc., todos cerca del inicio del `<script>`) están
  declarados con `const`, así que si agregas algo que los referencia
  (como `TITULARES_CUENTA_COBRO`, que usa `FIRMA_B64`/`FIRMA_INES_B64`)
  tiene que ir DESPUÉS de esos blobs en el archivo — si queda antes, el
  navegador tira `ReferenceError: Cannot access '...' before
  initialization` (temporal dead zone) y la app no carga nada, sin avisar
  por qué. Ya pasó una vez armando `TITULARES_CUENTA_COBRO` cerca de los
  demás `EMISOR_*` (que están antes de los blobs) en vez de después.

## Auditoría de claridad de precios — "prueba" de Juan (2026-09-26)

Juan pidió, sin decir cuál era el detalle concreto ("si te digo, ya no
tendría sentido la prueba"), auditar a fondo que "nada se pise con nada,
que todo tenga sentido, que haya forma de modular los precios que se
pueden elegir". Encontrado revisando `tipoCliente` de punta a punta: el
selector "Tipo de cliente" en Ventas ofrece 4 opciones (Cliente normal,
Mayorista, Distribuidor, Interno), pero `tierDeCliente()` solo distinguía
2 tarifas reales — cualquier cosa que no fuera 'Distribuidor' caía en
'normal'. Mayorista e Interno se veían como opciones reales pero cobraban
exactamente lo mismo que Cliente normal, sin ningún aviso. Confirmado
Juan: **"Mayorista podría tener otro valor e interno otro, hagamos que
esto se pueda y pongámoslo en configuración también"**.

**Arreglo — cada tipo de cliente con su propia tarifa**:
`TIER_POR_TIPO_CLIENTE` (junto a `tierDeCliente`, `index.html`) mapea los
4 tipos a 4 tiers reales en `precios_cafe.tipo_cliente`: normal,
mayorista, distribuidor, interno (más 'web', que ya existía aparte para
la página pública). `renderConfig()` → "Precios de café" ahora muestra 4
secciones por lote (antes 2: normal/distribuidor) —
`migracion_precios_mayorista_interno.sql` siembra las filas de mayorista
e interno clonando el valor que hoy tiene 'normal' en cada lote/
presentación (punto de partida editable, no invent[a] ningún precio
nuevo) — segura de correr más de una vez (`WHERE NOT EXISTS`). El panel
de ⚠️ migraciones pendientes de Configuración la detecta con un
mecanismo nuevo (`CHEQUEOS_FILAS` en `functions/api/salud-esquema/
index.ts`) — a diferencia de los chequeos de siempre (columna/tabla que
no existe, Postgres tira error), esta migración no cambia el esquema,
solo siembra filas, así que el chequeo es "¿ya hay al menos una fila con
tipo_cliente='mayorista'/'interno'?" en vez de "¿la columna existe?".

**Segundo hallazgo, relacionado — "modular los precios" no era posible**:
ni `precios_cafe` ni `maquila_tarifas` tenían `POST`, solo `GET`+`PATCH`
— una fila nueva (un lote nuevo en una tarifa que no la tenía, como
Pasilla; un tier nuevo como mayorista/interno antes de la migración; un
servicio de maquila nuevo) solo se podía crear con una migración SQL a
mano. Juan: **"el cambio que dices con respecto a modular los precios me
parece excelente, hagámoslo"**. Se agregó `onRequestPost` a
`functions/api/precios-cafe/index.ts` y `functions/api/maquila/
index.ts` — cada uno valida los campos, revisa que la combinación no
exista ya (`maybeSingle()`, mismo patrón que ya usa `cuentas-cobro` para
`clientes`) y devuelve 409 si ya existe, o inserta y devuelve la fila
nueva. En `index.html`, Configuración → Precios ganó dos bloques nuevos:

- **"Agregar un precio nuevo"** (después de "Precios de la página web"):
  Lote (`LOTES_VENTA`, incluye Pasilla), Tarifa (los 4 tiers +
  'Página web'), Presentación (`presentacionesDeLote(lote)`, se
  actualiza sola al cambiar el lote — respeta que Pasilla solo vende en
  Libra), Precio. `agregarPrecioCafe()` revisa duplicados en el frontend
  ANTES de llamar al backend (mismo dato, doble red de seguridad) y
  agrega la fila devuelta a `state.preciosCafe` sin necesitar un
  `sincronizar()` completo.
- **"Agregar una tarifa de maquila nueva"** (después de "Tarifas de
  maquila"): Servicio (texto libre — puede ser un servicio que Juan
  empiece a ofrecer, no está atado a `ORDEN_SERVICIOS_MAQUILA`),
  Presentación (`— (se cobra por kg)` = `null`, o una de `PRESENTACIONES`),
  Precio. `agregarTarifaMaquila()`, mismo patrón.

La hoja "Precios de café" del Excel (`hojaPrecios` en la exportación)
ganó las columnas de Mayorista e Interno junto a Normal/Distribuidor,
para que el respaldo siga reflejando las 4 tarifas reales.

**Qué hacer**: correr `migracion_precios_mayorista_interno.sql` en
Supabase, y luego revisar en Configuración → Precios que el valor
clonado de "Precio mayorista"/"Precio interno" de cada lote sea el que
Juan de verdad quiere cobrar (hoy arranca igual a "Precio normal" — es
un punto de partida, no la tarifa final).

Probado en el preview local (mock con datos de precios para Lavado en
los 5 tiers y Honey solo en normal, para confirmar que un lote sin
alguna tarifa sigue sin romper el render): Ventas → Tipo de cliente
"Mayorista"/"Interno" ya sugieren un precio propio (no el de "Cliente
normal"); Configuración → "Agregar un precio nuevo" creó Honey/Libra/
Mayorista=$40.000 y apareció de inmediato como una fila editable nueva;
"Agregar una tarifa de maquila nueva" creó un servicio "Empaque al
vacío" nuevo; intentar agregar una tarifa ya existente ("Trilla") no
disparó ninguna llamada de red (bloqueado en el frontend antes de
llegar al backend). Sin errores nuevos de consola.

## El detalle real de la "prueba" — "Quién recibió" ofrecía "Efectivo" (2026-09-26)

Después de la auditoría de precios de arriba (que resultó útil pero NO
era el detalle que Juan había notado), lo dijo directo: **"quien recibe
tiene la opcion efectivo, pero efectivo no es una persona, asi que no
podria recibir ningun pedido"**. Exactamente eso — simple una vez que se
ve, y por eso costó encontrarlo con una auditoría de lógica de negocio en
vez de con sentido común de quien conoce el flujo real.

**La causa**: `CUENTAS_BALANCE` (`= [...PERSONAS_EQUIPO, 'Efectivo']`) se
reusaba para DOS preguntas con semántica distinta — "Quién pagó" (Gastos/
Finca/Cereza comprada, donde SÍ tiene sentido pagar directo de la caja
física) y "Quién recibió" (Ventas/Maquila, que solo se pregunta cuando el
método de pago es "Efectivo" — ver el comentario junto a
`METODO_A_PERSONA`: *"solo 'Efectivo' es ambiguo... y de verdad necesita
que se elija quién lo recibió [en mano]"*). Preguntar "¿quién lo recibió
en mano?" y ofrecer "Efectivo" como respuesta es circular — no identifica
ninguna persona, que es justo el propósito del campo. El código no se
rompía (`calcularBalancePersonas()` sumaría igual esa venta a la "cuenta"
Efectivo sin tirar ningún error), así que nunca se manifestó como un bug
técnico — era puramente una opción sin sentido en un desplegable.

**Arreglo**: los 4 `<select>` de "Quién recibió" (`v-recibio`/`m-recibio`
en Ventas, registrar y editar; `mq-recibio`/`m-recibio` en Maquila,
registrar y editar) pasaron de iterar `CUENTAS_BALANCE` a iterar
`PERSONAS_EQUIPO` (solo Juan/Inés/Joaquín, sin Efectivo). Los de "Quién
pagó" (Gastos, Finca, Cereza comprada — `g-pago`, `f-pago`, `cz-pago`,
`ecz-pago`, `cp-pago`, y los `m-pago` de edición) se quedaron con
`CUENTAS_BALANCE` intactos, porque ahí "Efectivo" sí es una respuesta
válida y ya está bien modelado en `calcularBalancePersonas()`. No hizo
falta ninguna migración — es puro JS, y cualquier venta vieja que ya
tenga `recibido_por = 'Efectivo'` (si la hay) se sigue sumando igual al
balance de esa "cuenta", solo que ya no se puede volver a elegir para una
venta nueva.

Probado en el preview local: con "Efectivo" como método de pago, el
desplegable "Quién recibió" de Ventas y de Maquila ya solo lista Juan/
Inés/Joaquín (confirmado leyendo las `options` reales del `<select>`);
"Quién pagó" en Gastos no se tocó. Sin errores nuevos de consola.

## Resumen — pestañas nuevas + identidad visual de pedidos (2026-09-26)

Pedido de Juan: "¿cómo podemos optimizar tanto visualmente como de
navegación el área de resultados?" — Resumen había crecido a una sola
página larga (7 tarjetas de stat, 6 gráficas de Chart.js, varias tablas)
con 5 botones "↓ saltar a..." que ni siquiera cubrían todo lo que hay ahí
(Precio FNC, Rendimiento de producción, Comparación anual y Riesgo de
fuga se quedaban fuera de esos 5). Confirmado con Juan: reorganizar en
pestañas de verdad, **solo en Resumen por ahora** (no en el resto de la
app interna), con la tipografía/colores de `pedidos/index.html` y forma
de pestaña redondeada/pill (no la rectangular de `.subtabs`).

**3 pestañas nuevas** (`resumenTab`, `cambiarResumenTab()`), reemplazando
los 5 botones de salto:
- **"Este mes"** (por defecto): "Detalle de {mes}" — el ledger
  transaccional (Pagadas/Por pagar/Gastos/Maquila) que ya existía.
- **"Clientes y balance"**: Mejores clientes, Clientes en riesgo de fuga,
  Balance de cuentas.
- **"Tendencias y mercado"**: Comportamiento en el tiempo (3 gráficas),
  Precio de referencia FNC, Rendimiento de producción, Comparación año
  contra año, Margen estimado por lote.

Los 7 stats de encabezado ("Resumen de {mes}") se quedan SIEMPRE
visibles arriba de las pestañas — son el vistazo rápido de siempre, no
tiene sentido esconderlos detrás de un clic.

**Efecto colateral bueno, sin buscarlo**: `dibujarGraficos()` (las 6
gráficas de Chart.js) y `renderMejoresClientes()`/`renderBalancePersonas()`
ahora solo se llaman cuando su pestaña está activa (`if (resumenTab ===
'tendencias') dibujarGraficos(mes);` etc.) — como el contenido de una
pestaña no activa ni siquiera se pinta en el DOM (mismo patrón que
`configSubTab`/`gastosSubTab`/`trazaSubTab`), esto es justo la
optimización de "no cargar todo de una" que la auditoría de 2026-09-24
había dejado pendiente a propósito por miedo a arriesgar una regresión —
acá salió gratis, como consecuencia natural de la reorganización, sin
tocar nada aparte. Cambiar de pestaña en "Tendencias" varias veces
seguidas no rompe nada — `graficos.X?.destroy()` (patrón que ya existía
en `dibujarGraficos()`) limpia la instancia vieja antes de crear la
nueva en el canvas fresco.

**Pestañas redondeadas, clase APARTE de `.subtabs`**: Juan había pedido
pill para `.subtabs` una vez (la fusión de Cosechas/Cereza comprada) y
después revirtió porque "se sentía menos visual y un poco más perdido"
en esa pantalla compartida por Ventas/Cosecha & Tueste/Configuración.
Esta vez SÍ quería pill, pero solo para Resumen — así que se creó
`.resumen-tabs` (clase nueva, no toca `.subtabs`) en vez de cambiar la
clase compartida. Las otras 3 pantallas con `.subtabs` no cambiaron en
nada. (El color de la pestaña activa cambió de dorado a teal sólido el
mismo día — ver la sección siguiente.)

**Tipografía**: `--teal`/`--dorado`/`--serif` YA existían en `index.html`
desde el 2026-09-21 (se habían traído de pedidos para los títulos de
sección — `h3.section-title` ya usaba `--teal` en TODA la app — y el
login), pero `--serif` (Fraunces) estaba limitado a "solo el login" a
propósito. Ahora también se usa en Resumen — `#view-resumen
h3.section-title` y `#view-resumen .stat .n` (los números grandes de las
tarjetas) — con selectores que empiezan en `#view-resumen` porque
`.stat`/`.stat-grid` se reusan en Cosecha & Tueste y en las calculadoras
de precio, y el pedido fue "solo Resumen por ahora". El comentario junto
a `--serif` que decía "SOLO para el login" se actualizó para que no
quede desactualizado.

Probado en el preview local, desktop y celular (375px): los títulos y
números de Resumen salen en Fraunces; las 3 pestañas cambian de
contenido correctamente (incluyendo las gráficas, que se vuelven a
dibujar sin error al volver a "Tendencias y mercado" varias veces
seguidas); en celular las pills bajan de línea limpiamente cuando no
caben las 3 en una fila; Ventas/Cosecha & Tueste/Configuración
(`.subtabs`) no se tocaron. Sin errores nuevos de consola.

## Pestañas de Resumen ancladas al hacer scroll + color teal (2026-09-26, mismo día)

Dos pedidos más de Juan sobre lo de arriba: que "Este mes / Clientes y
balance / Tendencias y mercado" se quedara ancladas arriba al bajar por
el contenido de una pestaña larga (para cambiar de pestaña sin tener que
volver a subir), y que la pestaña activa no resaltara en dorado sino en
"el mismo color que hay en la página de pedidos" — en pedidos, dorado ya
significa "elegiste este producto/opción" (peso-pill, molienda-btn); esto
es navegación (dónde estás parado), más parecido al teal sólido del botón
"Pedir →" en la barra de secciones de pedidos. Cambio simple:
`.resumen-tabs button.active` pasó de `background: var(--dorado)` a
`background: var(--teal)`.

**Anclarla NO se pudo resolver con `position: sticky` — y el motivo es un
bug real, preexistente, que no se había notado antes.** `html, body {
overflow-x: hidden }` (el arreglo del rebote lateral en celular,
2026-09-23, ya probado en el teléfono real de Juan) hace, por una regla
del spec de CSS ("si un eje es visible y el otro no, el visible se
computa como `auto`"), que `body` se vuelva su PROPIO contenedor de
scroll — uno que en la práctica nunca se mueve, porque el scroll real de
la página pasa en `<html>`. Cualquier `position: sticky` dentro de `body`
se ancla respecto a ESE scroll inerte de `body`, así que nunca se ve
pegado de verdad — simplemente se desliza fuera de la pantalla con el
resto del contenido. Se confirmó con `getBoundingClientRect()` en vivo
que esto **ya le pasaba de antes a `.mobile-menu-btn`** (el botón ☰ que
abre el sidebar en celular, también declarado `position: sticky` con un
`top` calculado) — un bug preexistente, no introducido en este cambio.
(Arreglado el mismo día, ver la sección de íconos más abajo — a
diferencia de `.resumen-tabs`, ahí no hizo falta ningún workaround en JS.)

No se tocó `html, body { overflow-x: hidden }` para arreglar esto —
es una regla ya validada en el teléfono real de Juan y no hay forma de
volver a probarla ahí desde acá; tocarla a ciegas es más riesgo del que
vale este ajuste. En vez de eso, `.resumen-tabs` se ancla a mano con JS
(`iniciarPestanasFijasResumen()`/`actualizarPestanasFijasResumen()`,
junto a `cambiarResumenTab()`): un `<div>` marcador invisible justo antes
de la barra mide dónde iría en flujo normal; un listener de `scroll` en
`window` (que sí refleja el scroll real, a diferencia del de `body`)
calcula si esa posición ya pasó el borde superior visible y alterna la
barra entre su lugar normal y `position: fixed` (capturando su propio
`left`/`width` en el momento del cambio, para que no salte de tamaño ni
se monte sobre el sidebar en escritorio). El offset superior es 66px en
celular (para no quedar detrás de `.bottom-nav-movil`, la barra fija de
arriba en celular pese al nombre) y 0 en escritorio — mismo cálculo que
ya usa `.mobile-menu-btn` para su propio `top`, solo que aplicado a mano
en vez de con CSS puro.

Probado en el preview: en celular (375px) la barra se ancla correctamente
debajo de la barra fija de arriba al bajar, y cambiar de pestaña estando
anclada sigue funcionando; en escritorio (1280px, con sidebar) se ancla
en `top: 0` sin montarse sobre el sidebar, respetando su ancho/posición
real. Sin errores nuevos de consola.

**Si en algún momento se quiere arreglar el bug de fondo (`.mobile-menu-btn`
y cualquier futuro `position: sticky` dentro de `body`)**: la única forma
real es que `html, body { overflow-x: hidden }` deje de tener el
`overflow-x` en AMBOS elementos a la vez — mover esa regla a un
contenedor interno (ej. `.app-shell`) es la opción más segura en teoría,
pero necesita probarse en un teléfono real (Android e iOS) antes de darla
por buena, porque el comportamiento de rebote lateral que resuelve es
específico de cada motor de navegador móvil.

## Serif en toda la app + modal de "ventas pendientes de envío" (2026-09-26)

Dos pedidos más de Juan, seguidos del pase de Resumen de arriba.

**Tipografía pareja en toda la app**: lo que se había probado solo en
Resumen (Fraunces en títulos de sección y números grandes) se llevó a
TODA la app interna — "que toda la app luzca igual en letra y colores".
Resultó ser un cambio chico: `h3.section-title` YA era teal en todos
lados desde 2026-09-21, así que solo hizo falta sumarle
`font-family: var(--serif)` a esa regla compartida (antes solo aplicaba
dentro de `#view-resumen`) y lo mismo a `.stat .n` — como las dos son
clases YA compartidas por las 8 pantallas, el cambio salió parejo sin
tocar Ventas/Maquila/Gastos/Cosecha & Tueste/etc. una por una. No se
tocó nada más (ni `.subtabs`, ni colores de botones, ni el resto de
tipografía de párrafos/controles) — mismo criterio de "solo momentos
grandes" que ya regía en pedidos/index.html y en Resumen.

**"Ventas pendientes de envío" abre un modal, no navega a otro lado**:
antes, tocar el aviso `#envioAlert` ("📦 X ventas pendientes de envío",
visible desde cualquier pestaña) te sacaba de donde estuvieras parado y
saltaba a Ventas → "Por enviar". Juan pidió que fuera "como cuando se
hace una búsqueda de cliente, que se abra la ventana ahí" — mismo
patrón que el modal de búsqueda: `abrirVentasPendientesEnvio()` reusa
`filaVenta()` tal cual (mismos botones ✎/✕/📋/🧾, mismo tag de estado de
envío) en vez de inventar una fila nueva.

`toggleEstadoEnvio()` ganó una llamada extra a
`renderVentasPendientesEnvioModal()` (no-op si ese modal no está
abierto, vía el `if (!cont) return` de siempre) — así que marcar una
venta como "Enviada" DESDE DENTRO del modal la saca de la lista al
instante, sin cerrar y reabrir el modal para verlo reflejado. Sin esto,
el modal se hubiera quedado mostrando datos viejos hasta cerrarlo (sí le
pasa esto al modal de búsqueda con otras acciones, pero ahí el flujo
normal es ir a editar en otro lado, no togglear en el sitio — acá SÍ
tiene sentido poder marcarla enviada de una, así que valía la pena el
refresco).

Probado en el preview (simulando 2 ventas pendientes a mano, ya que el
mock no trae ninguna): el modal abre con las 2, tocar "📦 Pendiente de
envío" en una la saca de la lista al instante y el aviso de fondo baja
de "2" a "1"; togglear la última muestra "Nada pendiente de envío. 🎉"
y el aviso de fondo desaparece. Sin errores nuevos de consola.

## Costos por kg tostado, ahora una lista (no solo Tostión) (2026-09-26)

Juan: en Configuración → "Costos para 'Margen estimado por lote'", quería
poder agregar un costo nuevo si sale un gasto adicional que deba tenerse
en cuenta (dio el ejemplo del gas) — antes Tostión era la ÚNICA columna
de "costo por kg tostado" en `costos_margen`, sin forma de sumar otro sin
una migración por cada uno. Confirmado que se reparte igual que Tostión
(un valor por kg, multiplicado por lo que tostó cada lote).

**`costos_por_kg`** (jsonb, `migracion_costos_por_kg.sql`): lista de
`{ nombre, costoPorKg }` — Tostión pasó a ser una fila más de esa lista,
ya no un caso especial aparte. La migración convierte el valor de
Tostión que ya hubiera configurado en la primera fila (para no perderlo)
— `costo_tostion_kg` (la columna vieja) se queda en la tabla sin
usarse, el código ya no la lee ni la escribe. `calcularMargenPorLote()`
ahora suma el `costoPorKg` de TODA la lista y multiplica por los kilos
tostados de cada lote (antes solo multiplicaba por el costo fijo de
Tostión) — agregar "Gas" con $500/kg simplemente suma a ese total.

**Configuración → Precios**: el campo único "Tostión (por kg tostado)"
se volvió una lista editable (Nombre + Costo por kg + ✕ para quitar,
"+ Agregar costo" para sumar una fila) — mismo patrón de "+Agregar
precio nuevo"/"+Agregar tarifa" de la auditoría de precios de esta misma
sesión. Buffer `costosPorKgEdit` (igual que `pesajesEdit` en el modal de
Pesajes de cereza): nada toca `state` hasta que se le da Guardar, así
que agregar/quitar filas no se pierde al repintar Configuración.

⚠️ *Gotcha real encontrado probando esto mismo*: la primera versión de
`costosPorKgEdit` se inicializaba con un simple `if (!costosPorKgEdit)`
— pero `renderConfig()` puede pintarse ANTES de que `sincronizar()`
traiga los datos reales (ej. justo al cargar la app), y ese `if` se
quedaba pegado con el primer valor (vacío/en $0) PARA SIEMPRE, aunque
después sí llegaran los datos reales de Supabase — Tostión se veía en
$0 en Configuración aunque `state.costosMargen` internamente sí tuviera
el valor correcto. Arreglado comparando contra `cm.ts` (el timestamp del
registro, que cambia cada vez que llega una versión nueva de verdad) en
vez de solo "¿ya existe el buffer?" — variable nueva `costosPorKgEditTs`
junto a `costosPorKgEdit`, actualizada también al guardar. Moraleja para
la próxima vez que se use este patrón de buffer-que-sobrevive-renders
FUERA de un modal (los modales como Pesajes se abren siempre con datos
ya cargados, por eso nunca les había pasado esto): si el dato de origen
puede llegar de forma asíncrona DESPUÉS del primer render, un buffer que
solo se inicializa "si no existe todavía" puede quedarse con datos
viejos/vacíos para siempre — hay que invalidarlo comparando algo que
cambie cuando el dato real llega (un timestamp, un id, etc.), no solo
"si ya se inicializó alguna vez".

Probado en el preview: Tostión mostró correctamente su valor real
($3.000) después del arreglo del gotcha; "+ Agregar costo" agregó una
fila "Gas" en $500 sin perder la de Tostión; Guardar persistió ambas
correctamente (confirmado leyendo `state.costosMargen` real); "✕" quitó
la fila de Gas sin problema (y no se ofrece "✕" cuando solo queda una
fila, para no dejar la lista vacía); `calcularMargenPorLote()` con
Tostión+Gas dio un costo mayor que con solo Tostión, confirmando que la
suma se está aplicando. Sin errores nuevos de consola.

## Íconos reales (Lucide) — primer pase en Ventas + arregla el botón ☰ (2026-09-26)

Juan pidió íconos "más lindos, no tan genéricos" en vez de emoji para
los botones de acción. Se usó **Lucide** (lucide.dev, SVG, licencia ISC —
básicamente MIT, gratis, sin marca de agua) — pero en vez de cargarlo por
CDN con el patrón `data-lucide="x"` + `lucide.createIcons()`, se bajó el
SVG crudo de cada ícono (`unpkg.com/lucide-static/icons/<nombre>.svg`) y
se embebió directo como string en `index.html` (`ICONOS_SVG`, función
`icono(nombre, tam)`, junto a `fmt`/`mesDe`). Razón: esta app arma TODA
su HTML con `innerHTML` sobre template literals — el patrón
`createIcons()` obligaría a llamarlo después de cada uno de los
decenas de renders que usan estos botones, con riesgo real de que algún
ícono se quede sin pintar si se olvida un solo sitio. Con el SVG ya
adentro del string, sale pintado de una junto con el resto del HTML,
igual que el emoji que reemplaza — `stroke="currentColor"` hereda el
color de texto del botón, así que los estados hover/activo (que cambian
`color`) lo siguen tiñendo solo, sin CSS aparte.

**Alcance de este primer pase, a propósito acotado**: solo `filaVenta()`
— los 3 botones de acción (🧾 recibo, ✎ editar, ✕ eliminar) y el tag de
envío (📦 Pendiente / ✅ Enviado). Si a Juan le gusta el resultado, se
extiende al resto de la app (Maquila, Cosecha & Tueste, Gastos, Cuentas
de cobro — unos 15+ íconos más, repartidos en ~19 lugares) en un pase
aparte, para no arriesgar 8 pantallas de una sola vez con una librería
nueva. `ICONOS_SVG` ya queda listo para sumarle entradas nuevas sin
tocar nada de lo que ya funciona.

**De paso, arreglado el bug real de `.mobile-menu-btn`** (el botón ☰ que
abre el sidebar en celular, encontrado mientras se armaba lo de
`.resumen-tabs` de más arriba — declaraba `position: sticky` pero nunca
se quedaba pegado de verdad, por el mismo motivo: `body` se vuelve su
propio contenedor de scroll inerte). A diferencia de `.resumen-tabs`
(que si necesitaba el workaround en JS, porque compite con contenido que
sí fluye alrededor), este botón nunca tuvo que "empezar en flujo normal
y luego pegarse" — su intención siempre fue flotar en el mismo lugar
mientras se hace scroll, ni más ni menos que `position: fixed` ya hace
de por sí. `fixed` no depende del contenedor de scroll de ningún
ancestro (se posiciona contra el viewport, o contra un ancestro con
`transform`, de los cuales no hay ninguno acá) — así que cambiar
`sticky` → `fixed` lo arregló sin ningún JS adicional. El `top` absorbe
los 12px que antes daba `margin-top` (un `margin` normal ya no aplica
igual a un elemento `fixed`).

Probado en el preview, ancho de celular (706px, bajo los 860px del
breakpoint): el botón ☰ se queda fijo en su lugar al hacer scroll (antes
se quedaba pintado en su posición de flujo original, sin seguir el
scroll); los íconos SVG en una fila de Ventas (recibo/editar/eliminar,
y el tag de envío en sus dos estados Pendiente/Enviado) se ven nítidos,
del tamaño esperado, centrados en el botón de 44×44px. Sin errores
nuevos de consola.

## Auditoría anti-bugs de lo construido hoy (2026-09-26)

A pedido de Juan ("generá una auditoría interna de todo que quede sin
bugs"), se revisó a fondo todo lo hecho en esta sesión — el hallazgo más
serio fue en la barra de pestañas de Resumen, en dos capas.

**🔴 Bug real, dos capas — `actualizarPestanasFijasResumen()` parpadeaba
entre fija/no fija cerca del punto de anclaje.** La primera versión
(commit de más arriba) medía `#resumen-tabs-marcador` en vez de la barra
misma para decidir si debía despegarse — el borde superior del marcador
no es lo mismo que el tope real de la barra una vez vuelta a flujo
normal (quedaba corrido por su propia altura, ~59px), así que al
scrollear hacia ARRIBA se despegaba antes de tiempo. Se corrigió para
medir la barra directamente — pero probándolo con scroll simulado
(`window.scrollTo` + evento `scroll` disparado a mano, en vez de solo
mirar capturas de pantalla), apareció algo peor: a la MISMA posición de
scroll (640px), la barra daba resultados distintos según si se llegaba
ahí bajando o subiendo — parpadeaba entre fija y no fija en una franja
angosta. Causa raíz: el marcador que reserva espacio en el layout
mientras la barra está fija CAMBIA DE ALTURA (0 ↔ ~59px), y esa misma
altura desplaza la posición de todo lo que viene después en el
documento — incluida la propia barra que se estaba tratando de medir.
Medir "la posición natural ahora mismo" en cada scroll era, sin darse
cuenta, medir algo que la función misma acababa de alterar un instante
antes.

**Arreglo real**: en vez de re-medir la posición en cada evento de
scroll, `resumenTabsTopDocumento` se captura UNA SOLA VEZ por render
(`iniciarPestanasFijasResumen()`, recién pintada la barra, en
coordenadas del DOCUMENTO completo — `rect.top + window.scrollY`, no
del viewport) y cada verificación posterior solo compara ese número fijo
contra cuánto se ha scrolleado (`resumenTabsTopDocumento - window.scrollY
<= offsetTop`) — ninguna de las dos cantidades cambia por culpa del
marcador, así que ya no hay ciclo que se retroalimente solo. Verificado
con una simulación de scroll de ida y vuelta (0→900→0 en desktop,
0→900→0 en celular, con paradas cada 10-30px cerca del punto de
anclaje): la transición es simétrica y estable en las dos direcciones,
sin ningún parpadeo — antes del arreglo, la misma prueba mostraba
`fijo:true` en 633px, `fijo:false` en 640px y `fijo:true` de nuevo en
660px (imposible de notar solo mirando capturas de pantalla, porque cada
prueba manual anterior había scrolleado de un salto, sin pasar
lentamente por la franja exacta donde ocurría). **Moraleja para la
próxima vez que se implemente algo tipo "sticky a mano" con JS**: probar
con scroll simulado punto por punto cerca del umbral, no solo con saltos
grandes — un bug de retroalimentación como este solo se nota si se pasa
lento por la zona exacta donde cambia de estado.

**Otras revisiones de la auditoría, sin hallazgos**: se confirmó que
`dibujarGraficos()`/`renderMejoresClientes()`/`renderBalancePersonas()`
solo pueden dispararse cuando su pestaña ya está activa (los botones que
los disparan viven DENTRO del HTML de esa misma pestaña, no hay forma de
tocarlos desde otra); no quedaron identificadores viejos sueltos
(`costoTostionKg`, `cmg-tostion`, los `id`s `res-*` de los botones de
salto que se reemplazaron); `paginas.resumen` sigue predeclarado (evita el
bug ya documentado de `paginar()` con una clave nueva sin declarar);
`.mobile-menu-btn` en `position:fixed` no tiene el mismo riesgo de
retroalimentación que `.resumen-tabs` porque nunca alterna entre estático
y fijo, siempre está fijo. Hallazgo menor, no corregido (bajo impacto,
cosmético): `agregarTarifaMaquila()`/el campo de nombre nuevo en
"Costos para Margen estimado por lote" comparan nombres de servicio/costo
con `===` exacto (sensible a mayúsculas/espacios) — alguien podría crear
"Gas" y "gas" como dos filas distintas por error de tipeo; igual que la
mayoría de los campos de texto libre en esta app, no hay normalización.
No se tocó porque cambiar ese comportamiento es una decisión de producto,
no un bug de por sí.

**🔴 Bug real de visibilidad, reportado por Juan usándolo de verdad**:
"no me apareció dónde podía editar Mayorista/Interno" en Configuración.
Causa: `filaTier()` (la función que pinta cada tarifa en "Precios de
café") devolvía `''` cuando un lote no tenía NINGUNA fila para esa
tarifa — pensado originalmente para Pasilla (que a propósito no tiene
tarifa normal/web), pero el mismo código también escondía Mayorista/
Interno para CUALQUIER lote mientras no se hubiera corrido
`migracion_precios_mayorista_interno.sql` (o si un lote se siembra
después sin esas filas) — sin dejar ningún rastro de que la tarifa
existe como concepto. Arreglado con `filaTierOCopiar()`: si el lote SÍ
tiene "Precio normal" pero le falta Mayorista/Distribuidor/Interno,
muestra "Sin configurar todavía para <lote>" + botón "Copiar de Precio
normal" (`copiarPreciosTierCafe()`, crea una fila por presentación via
`POST /api/precios-cafe`, mismo valor que Precio normal como punto de
partida) — funciona sin depender de si la migración ya corrió. Pasilla
sigue sin mostrar nada (no tiene "Precio normal" tampoco, así que
`filaTierOCopiar` se queda callada igual que antes — comportamiento
intencional sin cambios).

**Cierre de la auditoría — flujo de dinero y cambio de mes**: Juan pidió
explícitamente confirmar que el paso de septiembre a octubre (el cambio
de mes real que se venía esa semana) no fuera a romper nada. Se leyó el
código central de dinero (`renderResumen()` — `facturado`/`cobrado`/
`porCobrar`/`balance`/`librasVendidas` — ninguna línea tocada por los
cambios de esta sesión, solo se reorganizó DÓNDE se pinta cada sección,
no cómo se calcula) y se probó en vivo simulando el escenario real:
ventas de septiembre (una pendiente/sin enviar, una pagada/enviada) +
cambiar `filtroMes` a octubre. Confirmado: la pendiente de septiembre
aparece en "Pendientes de meses anteriores" (con "desde 2026-09"), la
pagada/enviada NO aparece ahí (ya está resuelta, como corresponde),
"Resumen de 2026-10" muestra $0 en todo sin romperse (mes nuevo, sin
datos todavía), y las 3 pestañas de Resumen (incluidas las gráficas)
renderizan sin errores con octubre seleccionado. "Balance de cuentas" y
"Margen estimado por lote" — las dos cosas que Juan mencionó explícitamente
como preocupación de "dinero" — son cálculos de TODO el histórico, no del
mes filtrado (ya documentado arriba), así que se confirmó que no cambian
en nada al cambiar de mes, tal como deben comportarse. Sin errores de
consola en ningún paso.

De paso, encontrado y limpiado (código muerto preexistente, no
introducido en esta sesión): `renderResumen()` calculaba `porLote`/
`maxLote` en cada render sin que nada los leyera — quedaba de un gráfico
de barras manual que en algún momento se reemplazó por la gráfica de
Chart.js "Ventas por lote de café", sin borrar el cálculo viejo. Se
confirmó con `grep` en toda la función que de verdad no se usaban en
ningún lado antes de quitarlos.

## El inventario se descuenta al ENVIAR, no al registrar la venta (2026-09-27)

Cambio de fondo pedido por Juan: "si hacen la orden no es que ya se
despacha, solo se descarga del stock al enviarse". Antes,
`POST /api/ventas` descontaba el inventario tostado de una, al
registrar el pedido — sin importar si de verdad había salido de la
bodega. Ahora el descuento pasa a `PATCH /api/ventas/:id` cuando
`estadoEnvio` cambia de "Pendiente" a "Enviado" (el mismo `toggleEstadoEnvio()`
de siempre) — registrar un pedido nuevo YA NO toca el inventario.

**`functions/api/ventas/index.ts` (POST)**: solo descuenta si el pedido
se crea YA marcado "Enviado" (no pasa hoy desde ningún formulario —
siempre arranca "Pendiente" — pero queda cubierto por si acaso).

**`functions/api/ventas/[id].ts` (PATCH)**: ahora hace `SELECT` del
registro ANTES del update (mismo patrón que ya usaban cosechas/cereza-
comprada/pergamino) para saber si YA estaba "Enviado". Dos casos, que el
frontend nunca combina en la misma llamada:
1. `toggleEstadoEnvio()` manda solo `{ estadoEnvio }` — Pendiente→Enviado
   descuenta TODO lo que trae el pedido; Enviado→Pendiente (corrigiendo
   un error) lo devuelve.
2. `guardarEdicionVenta()` manda `nuevosItems`/`itemsRemovidos` (líneas
   agregadas/quitadas al editar) — esto SOLO toca el inventario si el
   pedido YA estaba "Enviado" antes de la edición. Si seguía pendiente,
   no había nada descontado todavía, así que editar sus líneas tampoco
   debe tocar el inventario — se descontará completo, con los datos
   finales, el día que de verdad se envíe.

**`onRequestDelete`**: solo devuelve inventario si la venta que se borra
YA estaba "Enviado" (antes devolvía siempre). Un pedido borrado antes de
enviarse nunca llegó a descontar nada.

**Maquila no se toca** — nunca tocó inventario (es un servicio, no un
producto del inventario propio), sigue igual.

### 🔴 El problema real de la transición — pedidos que YA estaban pendientes

Se pensó con cuidado antes de escribir código: cualquier venta que en
producción esté HOY "Pendiente" de envío ya había descontado su café al
registrarse, bajo la regla VIEJA. Si no se corrige nada y ese pedido se
marca "Enviado" más adelante, el código NUEVO lo va a descontar OTRA
VEZ — inventario descontado dos veces por el mismo café, un problema
real de datos, no solo de código.

**Herramienta de corrección, en Configuración → Precios** (arriba de
"Saldo inicial", junto al aviso de migraciones pendientes, `calcularCorreccionInventarioPendientes()`
+ `aplicarCorreccionInventarioEnvio()`): suma, por lote, los kilos de
café de TODAS las ventas con `estadoEnvio !== 'Enviado'` ahora mismo —
reusando `kilosDeVentaPorLote()`, la MISMA conversión ya probada que usa
"Proyección de inventario" en Inventario Tostado, no una fórmula nueva.
Muestra los números exactos por lote y un botón "Aplicar corrección (una
sola vez)" que los suma de vuelta al stock (mismo `PATCH /api/inventario/:id`
que ya usa "Editar stock" a mano) — deliberadamente NO es una migración
SQL a ciegas: Juan ve los kilos reales antes de confirmar, calculados con
sus propios datos cargados en el navegador.

⚠️ **Gotcha real, encontrado probándolo antes de darlo por bueno**: el
bloque se calcula a partir de `state.ventas` (cuáles siguen sin
"Enviado"), pero aplicar la corrección NO cambia esas ventas — solo el
inventario. Sin nada más, el mismo botón con los MISMOS números iba a
seguir apareciendo cada vez que se entrara a Configuración (esas ventas
pueden tardar días en enviarse de verdad), con riesgo real de aplicarlo
dos veces por accidente y duplicar el ajuste. Arreglado con una marca en
`localStorage` (`cp_correccion_inventario_envio`) — una vez aplicada,
el bloque se queda oculto para siempre en ese navegador, sin importar
qué digan las ventas.

**Qué hacer**: entrar a Configuración → Precios UNA vez después de este
deploy, revisar los kilos que propone devolver (deberían coincidir con
lo que ya tenías pendiente de envío) y tocar "Aplicar corrección". Si el
bloque no aparece, es porque no había nada pendiente de envío con café
en ese momento — no hace falta hacer nada.

## Aviso de stock bajo lleva a Inventario Tostado (2026-09-27)

Pedido chico de Juan, junto con lo de arriba: tocar el aviso "⚠️ Stock
bajo de Lavado" ahora navega a Inventario Tostado (`irATab('inventario')`),
donde ya existía "Editar stock" por lote (`abrirEdicionInventario()`) —
no hizo falta ningún botón nuevo, ese ya era el lugar para corregir el
número si hacía falta (casi siempre ya hay tostado nuevo, pero cuando no,
ahora es un clic llegar ahí en vez de tener que buscar la pestaña).

## `.mobile-menu-btn` en `fixed` tapaba los avisos de arriba (2026-09-27)

Efecto colateral real del arreglo de `.mobile-menu-btn` (sticky→fixed,
ver más arriba) que solo se notó al probarlo en ancho de celular: con
`sticky` roto, el botón ☰ se scrolleaba fuera de la vista casi de
inmediato, así que casi nunca se lo veía tapando nada por más de un
instante. Con `fixed` de verdad, se queda flotando SIEMPRE en el mismo
lugar (`top: 66px+12px, left:12px`) — y `.app-main` (el contenido) solo
reservaba 66px de espacio arriba, no los 66+56px que el botón (12px de
margen + 44px de alto) en realidad ocupa. El aviso de stock bajo (lo
primero que pinta cada pestaña) quedaba con su borde izquierdo tapado
por el botón. Arreglado sumándole 64px más al padding-top de `.app-main`
en celular — no se movió el botón (arriesgaba chocar con los toasts, que
son casi de ancho completo y aparecen centrados abajo) sino que se le
dio a todo el contenido el espacio real que necesita para no toparse con
él, sin importar qué aviso sea el primero en pintarse en cada pestaña.

## "Prueba de taza" (precio fijo) + descuento por porcentaje en Maquila (2026-09-27)

Dos pedidos de Juan sobre Maquila: (1) un servicio nuevo, "Prueba de
taza", $45.000, que debe ir en el orden fijo de servicios justo antes de
Transporte; (2) un lugar para aplicar un descuento puntual por
porcentaje al total de una orden ("por ser vecino o por alguna cosa").

**Un cuarto modo de precio, además de por-kg/por-presentación/manual**:
los servicios de maquila ya tenían 3 formas de cobrarse — por kilo
(Trilla/Tostión, una sola tarifa sin presentación), por presentación
(Molienda/Empaque/Bolsas, una tarifa por cada una) y manual (Transporte,
siempre se escribe a mano, nunca sugiere nada). "Prueba de taza" no
encaja en ninguna: es un precio FIJO por vez, sin kilos ni presentación
de por medio. `SERVICIOS_FIJOS` (`index.html`, junto a
`SERVICIO_TRANSPORTE`) es un array nuevo para esto — hoy solo trae
`SERVICIO_PRUEBA_TAZA`, pensado para poder sumar otro servicio de precio
fijo más adelante sin tocar la lógica de nuevo. `ORDEN_SERVICIOS_MAQUILA`
ganó `SERVICIO_PRUEBA_TAZA` justo antes de `SERVICIO_TRANSPORTE`, tal
como pidió Juan.

Los 4 puntos que ya distinguían "es Transporte" (`onMaquilaServicioChange`,
`recalcularLineaMaquila`, `agregarLineaMaquila`, y sus mellizos del modal
de editar — `onEmqServicioChange`, `recalcularEmqLinea`, `agregarLineaEmq`)
ganaron el mismo `if` para "es fijo": ocultan los campos de Kilos Y de
Presentación/Cantidad (a diferencia de Transporte, que sí muestra su
campo de nota), y el "Valor de esta línea" se autocompleta directo con
`gruposDeServicio(servicio)[0].precio` — sin ninguna multiplicación,
porque no hay cantidad que multiplicar. Sigue siendo editable a mano
como cualquier otro valor sugerido. `tituloItemMaquila()` y
`detalleOrdenMaquila()` (usadas en el carrito, el historial de órdenes, y
al prellenar una cuenta de cobro desde una orden) también ganaron su
propio caso — sin él, se hubiera visto "Prueba de taza · 1kg" (heredando
el fallback que asume "sin presentación = por kg"), que no tiene sentido
para un precio fijo.

**El precio queda editable en Configuración sin ningún código nuevo**:
la tabla `maquila_tarifas` (y su UI en Configuración → Tarifas de
maquila) ya es genérica — cualquier servicio con una sola tarifa sin
presentación se lista con un campo editable + botón "Guardar" (el mismo
mecanismo que ya usan Trilla/Tostión). Lo único que hacía falta era que
la etiqueta ya no dijera siempre "(por kg)", que sería engañoso para un
precio fijo — ahora dice "(precio fijo)" si el servicio está en
`SERVICIOS_FIJOS`, "(por kg)" si no. La opción "— (se cobra por kg)" del
desplegable de "Agregar una tarifa de maquila nueva" (para cuando Juan
mismo siembre la tarifa la primera vez) se renombró a "— (se cobra por
kg o precio fijo)" por la misma razón.

**No hizo falta ninguna migración ni sembrar nada por código**: agregar
una tarifa nueva a `maquila_tarifas` ya tiene su propio POST
(`functions/api/maquila/index.ts`, construido en una sesión anterior
específicamente para esto — "ya no hace falta pedir una migración para
esto"), y el desplegable de servicios en Maquila (Registrar/Editar) SOLO
lista servicios que YA tienen al menos una tarifa configurada (a
diferencia de Transporte, que aparece siempre, fijo, sin depender de
ninguna tarifa) — así que "Prueba de taza" no aparece en ningún
formulario hasta que Juan la agregue él mismo una sola vez:
Configuración → Precios → "Agregar una tarifa de maquila nueva" →
Servicio "Prueba de taza", Presentación "— (se cobra por kg o precio
fijo)", Precio 45000 → "+ Agregar tarifa". De ahí en adelante ya queda
disponible en el desplegable de servicios y editable en la lista de
arriba, exactamente como cualquier otra tarifa.

**Descuento — un ítem más del carrito, negativo, no una columna nueva**:
`items` de `ordenes_maquila` ya es un jsonb genérico y TODO el cálculo de
totales en la app ya suma `it.valor` de cada ítem sin distinguir de qué
tipo es — así que un descuento no necesitó ninguna columna ni lógica de
suma aparte, solo un ítem más con `valor` NEGATIVO y
`esDescuento: true` (para poder detectarlo al mostrarlo/reemplazarlo) y
`notaDescuento` (el `%` tal cual, para mostrarlo y para precargar el
campo si se reabre la orden). `aplicarDescuentoMaquila(prefijo)` (una
sola función para los dos carritos — `carritoMaquila` en Registrar,
`editCarritoMaquila` en Editar, seleccionados por el prefijo `'mq'`/`'emq'`
que ya usan sus respectivos ids de DOM) SIEMPRE quita primero cualquier
descuento anterior de la lista (`esDescuento`) antes de agregar el nuevo
— un descuento REEMPLAZA al anterior, nunca se suman — y si el % queda
en 0/vacío, simplemente lo deja quitado. El monto se calcula sobre el
subtotal de los demás ítems en ESE momento (`Math.round(subtotal * pct /
100)`), no se recalcula solo si se agregan más servicios después — es
una acción puntual con un botón "Aplicar descuento", no un campo que
reaccione en vivo, tal como lo pidió Juan ("un espacio... poner un
porcentaje y que se aplique al total").

⚠️ *Ojo si se vuelve a tocar `carritoMaquila`/`editCarritoMaquila`*: son
referencias VIVAS a `ordenesMaquilaAbiertas[i].items` (Maquila SÍ
conserva el sistema de varias órdenes abiertas en paralelo con pestañas
— a diferencia de Ventas, donde se quitó el 2026-09-23, ver esa sección
más arriba). `aplicarDescuentoMaquila()` por eso muta el array en el
lugar (`splice`), nunca hace `carritoMaquila = carritoMaquila.filter(...)`
— reasignar hubiera desconectado la variable del `items` real de la
orden activa, el mismo tipo de bug que ya se evitó en
`quitarDeCarritoMaquila()`/`quitarDeEmqCarrito()` (que también usan
`splice`, nunca reasignación).

**Los montos negativos se ven en terracota con signo, no con `$` pegado
al `-`**: `fmt()` (el formateador de plata de toda la app) no maneja
signo — `fmt(-14500)` da `"$-14.500"` (el `-` queda después del `$`, se
ve raro). El patrón ya establecido en otras partes de la app (Gastos,
Finca) es mostrar el valor absoluto con un `-` puesto a mano delante del
`$fmt(...)` completo, en una clase `.amount.neg` (terracota) en vez de
`.amount.pos` (verde) — `montoItemMaquilaHTML(it)` nueva (compartida por
`pintarCarritoMaquila()` y `pintarEmqCarrito()`) aplica ese mismo patrón
según el signo de `it.valor`. La cuenta de cobro que se prellena desde
una orden de maquila con descuento (`prellenarCuentaCobroDesdeMaquila()`)
SÍ hereda ese `valorTotal` negativo tal cual, sin este mismo arreglo de
signo (`cc-lista`/`pintarCarritoCC()` no se tocó) — se ve "$-14.500" ahí
si se prellena una orden con descuento, pero es un carrito totalmente
editable antes de generar el PDF (Juan puede corregir o borrar esa línea
ahí mismo), así que no se consideró necesario tocar ese formulario
aparte para un caso tan puntual.

Probado en el preview local (mock): "Prueba de taza" no muestra campos de
Kilos ni Presentación, autocompleta $45.000, y aparece en el carrito
como "Prueba de taza" sin ningún "1kg" colgando; un descuento del 10%
sobre $145.000 (Prueba de taza + Trilla) da exactamente -$14.500 con
total $130.500, reemplazar por 20% da -$29.000 sin dejar el ítem viejo, y
vaciar el campo y aplicar lo quita del todo restaurando el total
completo — los tres casos probados en el carrito de Registrar Y en el de
Editar. En Configuración → Tarifas de maquila, "Prueba de taza (precio
fijo)" aparece con su campo editable y botón Guardar, igual que
Trilla/Tostión. Sin errores nuevos de consola en ningún recorrido.

## Sección "Maquila" en `pedidos/index.html` — una vista aparte, no un tramo más del scroll (2026-09-27)

Juan: *"me gustaría que en la página de pedidos haya una sección de
maquilas, pero que no esté dentro del scroll, podríamos organizar la
página por secciones más parecida a la app y que la gente sepa que se
presta el servicio"* — hasta ahora `pedidos/index.html` era un solo
scroll largo (Hero → Dato duro → Proceso → Tour → Catálogo), y nada en
la página mencionaba que Café Pandora también ofrece maquila (trillar/
tostar/moler/empacar café que trae el cliente) — un cliente nuevo no
tenía forma de enterarse de que ese servicio existe. Se le preguntó a
Juan explícitamente cómo quería que funcionara (una pestaña que
reemplaza el contenido, tipo la app / una sección ancla dentro del mismo
scroll / una página aparte) y qué debía mostrar — confirmó **pestaña que
reemplaza contenido** + descripción del servicio + lista de servicios
(sin precios) + botón de WhatsApp para cotizar.

**Cómo funciona**: `.nav-secciones` (la barra fija de arriba, ya
`position: sticky; top: 0` desde antes) ganó un 5º link "Maquila", entre
"Tour" y "Pedir →" — a diferencia de los otros 4 (que son anclas reales
a secciones del scroll de café), este no navega a ningún ancla:
`onclick="mostrarVista('maquila'); return false;"`. Todo el contenido de
comprar café (Hero, Dato duro, Proceso, Tour, y el `.wrap` con el
catálogo/carrito/checkout — TODO lo que ya existía) se envolvió en un
`<div id="vistaCafe">` nuevo; la sección nueva
(`<section id="vistaMaquila" style="display:none">`) vive JUSTO DESPUÉS,
antes de `.carrito-barra`. `mostrarVista(vista)` simplemente alterna
`style.display` entre los dos contenedores — cuando se oculta
`#vistaCafe` (que mide miles de píxeles de alto), `#vistaMaquila` queda
pintado inmediatamente debajo de la barra fija, sin nada de scroll de
por medio — literalmente "no está dentro del scroll", tal como lo pidió
Juan. Los 4 links de café (`La finca`/`Proceso`/`Tour`/`Pedir →`)
ganaron `onclick="mostrarVista('cafe')"` (SIN `return false` — el salto
de ancla normal del navegador sigue después) — así que si estás viendo
Maquila y tocás "Tour", primero se vuelve a mostrar el contenido de café
y LUEGO el navegador salta a esa sección, en el mismo clic.

**Contenido de la sección** (todo texto/HTML nuevo, sin datos de la
API): kicker "También ofrecemos" + título en serif + un párrafo
explicando qué es maquila (a propósito dice **"el café sigue siendo
tuyo, nosotros solo lo transformamos"**, la misma distinción producto-
vs-servicio que ya documenta este archivo en "Qué es esto") + una
cuadrícula de 6 tarjetas, una por servicio real de la app interna
(Trilla, Tostión, Molienda, Empaque, Prueba de taza, Transporte — mismo
set que `ORDEN_SERVICIOS_MAQUILA` en `index.html`, aunque "Bolsas
Negras"/"Bolsas Ziploc" se combinaron en la descripción de "Empaque" en
vez de 2 tarjetas separadas, para no saturar de detalle una vista que es
solo informativa) + una nota de que el precio varía y hay que escribir
para cotizar + un botón de WhatsApp (mismo número `573183926578`, mismo
patrón `wa.me/...?text=...` que ya usan el Tour y el banner de
Exóticos). **A propósito NO se muestran precios** — Juan lo confirmó
así: las tarifas de maquila varían mucho según cantidad/presentación
(y son las mismas que ya se configuran en la app interna, pensadas para
cotizar caso a caso, no para un catálogo público de precios fijos).

**Reusa CSS existente en vez de inventar**: el botón de WhatsApp usa
literalmente la clase `.hero-cta-primaria` (el mismo botón sólido teal
del Hero) — esa clase nunca estuvo escrita solo para `.hero`, así que
reusarla en otra sección no rompe nada y evita duplicar la misma regla.
Las 6 tarjetas de servicio son una cuadrícula CSS nueva
(`.maquila-servicios`, 2 columnas → 1 columna bajo 420px), con el mismo
lenguaje visual que el resto del sitio (kicker uppercase teal, título
serif, tarjetas con fondo `--crema-alt`, igual que `.proceso-paso`/
`.tour-incluye`) — nada de color ni tipografía nueva.

**El carrito de café no se pierde al ir a ver Maquila**: si el cliente
ya había armado un pedido de café (`carrito` con algo adentro) y toca
"Maquila" para curiosear, `.carrito-barra` (la barra flotante de abajo
con "Confirmar por WhatsApp") se oculta mientras se ve Maquila
(`classList.remove('visible')`, no tiene sentido mostrar un botón de
confirmar pedido de café encima del contenido de Maquila) pero el
`carrito` en memoria NO se toca — al volver a "café" (cualquiera de los
4 links), `actualizarBarra()` la vuelve a mostrar con el mismo contenido
de siempre. Probado explícitamente: agregar 2 líneas de café al
carrito, ir a Maquila (la barra desaparece con su transición normal de
opacidad/transform, no queda flotando encima del CTA de WhatsApp de
Maquila), volver a café (la barra reaparece con "2 productos $78.000"
intacto).

**`.revela` (animación de aparición al hacer scroll) en la sección
nueva**: como `#vistaMaquila` empieza en `display:none`, sus bloques
`.revela` nunca fueron observados por el `IntersectionObserver` que ya
se monta una sola vez al cargar la página (los elementos con
`display:none` no tienen tamaño, así que nunca "intersectan" nada) —
mismo gotcha ya documentado para el catálogo async
(`cargarCatalogo()` re-llama `iniciarRevelado()` después de pintar sus
tarjetas). `mostrarVista('maquila')` hace lo mismo: llama
`iniciarRevelado()` de nuevo justo después de mostrar la sección, para
que esos bloques sí se animen la primera vez que aparecen.

**No participa del scrollspy por posición** (el que resalta en la barra
de arriba qué sección se está viendo al hacer scroll, comparando
`getBoundingClientRect()` de cada sección contra el viewport) — "Maquila"
se marca activa/inactiva A MANO dentro de `mostrarVista()`
(`document.querySelectorAll('#navSecciones a').forEach(a =>
a.classList.remove('activo'))` + agregarla solo al link de Maquila si
corresponde), porque no tiene sentido que un IntersectionObserver la
detecte por scroll — nunca se "scrollea hasta ella", aparece de golpe.
El link de Maquila usa `href="#"` (no un ancla real), así que
`iniciarScrollspyNav()` lo incluye en su lista de links pero
`document.getElementById('')` da `null` y lo descarta antes de
observarlo — no compite ni interfiere con el resto del scrollspy.

Probado en el preview local (`mock_pedidos_server.py`), desktop y
celular (375px): tocar "Maquila" oculta TODO el contenido de café
(catálogo, hero, etc. — confirmado leyendo `style.display` real de
`#vistaCafe`) y muestra las 6 tarjetas de servicio + el botón de
WhatsApp, con el link "Maquila" resaltado y sin ningún link de café
resaltado; tocar "Tour" desde ahí vuelve al contenido de café Y salta
directo a la sección de Tour en el mismo clic (confirmado por el link
"Maquila" perdiendo el resaltado y "Tour" ganándolo); en celular la
cuadrícula de servicios baja a 1 columna sin desbordar. Sin errores
nuevos de consola en ningún recorrido (los únicos 404 que aparecen son
de imágenes que no existen en el preview local, no relacionados con
este cambio).

**Corrección real, mismo día**: Juan aclaró **"corrijamos el tema de
procesar la cereza, porque no se hace, solo si está en pergamino o en
verde"** — la maquila NUNCA recibe cereza (café recién cosechado, sin
secar/trillar); el cliente tiene que traerlo ya en pergamino o ya en
verde. El párrafo de intro decía "¿Ya tienes tu propio café en cereza,
pergamino o verde?" — se quitó "cereza", queda "¿Ya tienes tu propio
café en pergamino o verde?". Las 6 tarjetas de servicio ya estaban bien
(ninguna mencionaba cereza — "Trilla" ya asumía pergamino como entrada).

**Foto real de la tostadora**: Juan mandó una foto de la tostadora
PRISMA de la finca (con el logo "Café Pandora" grabado) y preguntó si se
podía poner en la sección — sí, mismo patrón ya establecido para fotos
reales (`pedidos/img/finca-flor.jpg`, `proceso-cereza.jpg`, etc.:
archivo aparte, NO base64 inline, porque es una fotografía real, no arte
vectorial). Procesada de HEIC a JPEG con `sips` (redimensionada a 1300px
de alto, calidad 80 — mismo rango de peso que las otras fotos reales,
~320 KB), guardada como `pedidos/img/maquila-tostadora.jpg`.
`.maquila-foto` (CSS nueva, entre la intro y la cuadrícula de servicios)
usa `aspect-ratio: 1017 / 1300` (las dimensiones reales del archivo) +
`object-fit: cover` + `border-radius: 16px` — mismo criterio que
`.proceso-foto` para que la página no salte de tamaño mientras la
imagen carga.

**Gotcha real durante la prueba, no un bug**: al simular el clic con
`javascript_tool` en vez de un clic real y sacar la screenshot de
inmediato, el título/intro/foto de Maquila aparecieron muy
desvanecidos — parecía que `.revela` no había funcionado. No era un bug:
`iniciarRevelado()` crea un `IntersectionObserver` nuevo cada vez que se
llama (ver "Sección Maquila..." más arriba), y su callback es asíncrono
— tarda un frame en marcar `.visible`. Con un clic real de una persona
(que siempre tarda más que un script) esto nunca se nota; se confirmó
esperando ~1s y volviendo a capturar, con todo ya nítido. Mismo tipo de
falso positivo ya documentado para el mock que usa `javascript_tool` con
`confirm()`/`prompt()` — hay que dejar pasar un instante después de
disparar algo con un observer async antes de dar por buena (o mala) una
captura.

Probado en el preview local, desktop y celular: la foto se ve completa
con esquinas redondeadas, sin recorte raro ni salto de layout; el texto
ya no menciona cereza. Sin errores nuevos de consola.

## Blog — pestaña nueva en la app interna + sección "Blog" en pedidos (2026-09-28)

Juan: *"podemos añadir una pequeña sección así como maquila pero que se
llame blog y que pueda subir ahí artículos y que si alguien quiere subir
uno pueda escribirme para someter a revisión"* — dos partes: (1) una
sección "Blog" en `pedidos/index.html`, misma idea de vista-aparte que
Maquila; (2) que Juan pueda subir artículos él mismo, sin pasar por
código cada vez. Se le preguntó explícitamente si los artículos debían
llevar foto de portada subida directo desde el formulario (self-serve,
achicada en el navegador) — confirmó que sí.

**Tabla nueva, mismo patrón interno/público que `precios_cafe`**:
`blog_posts` (`migracion_blog.sql` — id, titulo, extracto, contenido,
imagen, autor, estado, creado_por, ts). `estado` arranca en `'Borrador'`
— la pestaña "Blog" de la app interna (nueva, entre "Cuentas de cobro" y
"Configuración" en el sidebar) ve TODO (`GET /api/blog`, con login);
`GET /api/blog-publico` (sin login, mismo espíritu que
`catalogo-publico`) solo trae `estado = 'Publicado'` y deja afuera
`creado_por` (dato interno de quién lo escribió desde la app, no la
firma pública del artículo — para eso está "autor", un campo de texto
libre aparte). `POST /api/blog` usa `requireAuthConUsuario()` para
guardar `creado_por` real, igual que los otros 9 recursos de
"Atribución real por sesión"; `PATCH`/`DELETE /api/blog/:id` con
`requireAuth()` normal.

**Foto de portada — achicada en el navegador, sin servicio externo**:
`redimensionarImagenBlog(file)` (`index.html`, app interna) lee el
archivo con `FileReader`, lo dibuja en un `<canvas>` reducido a máximo
900px de ancho, y lo reexporta como JPEG calidad .75 con
`canvas.toDataURL()` — el resultado (un data URL base64) es lo que se
manda y se guarda tal cual en la columna `imagen`. Nada de esto pasa por
el backend hasta que ya está achicado, así que un archivo de varios MB
de la cámara del celular no infla la tabla sin control ni necesita
ningún servicio de almacenamiento de imágenes — mismo espíritu simple
que el resto de esta app (sin build, sin backend de archivos). Probado
con una imagen sintética de 1600×1200/55 KB: salió en 900×675/~8 KB.
Tanto el formulario de "Nuevo artículo" como el modal de "Editar
artículo" (`abrirEdicionBlog()`) usan la misma función — cada uno con su
propia variable de buffer (`imagenBlogNueva` / `imagenBlogEditando`) y
su propio `<img>` de vista previa, para no pisarse si los dos llegaran a
estar abiertos (no pasa en la práctica, pero mantiene el patrón limpio).
El modal de editar también deja "Quitar foto" si el artículo ya tenía
una y se quiere dejar sin portada.

**Pestaña "Blog" en la app interna** (`renderBlog()`, `filaBlogPost()`):
mismo patrón que Finca/Cuentas de cobro — un formulario arriba para
crear ("Nuevo artículo": título, extracto opcional, contenido en
textarea, autor opcional con el mismo `localStorage` que recuerda otros
campos "quién", estado, foto) y el historial abajo, cada fila con una
etiqueta-botón de estado (`toggleEstadoBlog()`, reusando las clases CSS
`.tag.pagado`/`.tag.pendiente` — verde/mostaza ya significan
genéricamente "resuelto/pendiente" en toda la app, igual que ya se
reusaron para envío de Ventas y entrega de Maquila) más ✎ Editar / ✕
Eliminar. Sumado a `sincronizar()` (`CLAVES_SINCRONIZAR`/`endpoints`,
posición 22 de 22), a `TABS_CON_BUSQUEDA` (busca por título/autor/
contenido) y al panel de ⚠️ migraciones pendientes de Configuración
(`salud-esquema`) — mismos 3 lugares que cualquier recurso nuevo de esta
app necesita tocar.

**Sección "Blog" en `pedidos/index.html`**: `mostrarVista()` (la función
que ya reemplazaba contenido para Maquila, ver esa sección más arriba)
se generalizó de 2 a 3 estados (`'cafe'`/`'maquila'`/`'blog'`) en vez de
un simple booleano `esMaquila` — mismo mecanismo, un 3er `<section
id="vistaBlog" style="display:none">` más, y un 3er link en
`.nav-secciones` (`Blog`, entre `Maquila` y `Pedir →`). A diferencia del
catálogo de café (que se carga siempre, de entrada) y de Maquila (texto
fijo, sin fetch), el Blog SÍ pide datos a un endpoint público
(`/api/blog-publico`) pero **solo la primera vez que alguien toca
"Blog"** (`cargarBlog()`, guardado con un flag `blogCargado` para no
repetir el fetch después) — no tiene sentido pedirlo de entrada para la
mayoría de visitantes que solo vienen a comprar café.

Dentro de la sección hay DOS vistas que se turnan el mismo contenedor
(`#blog-lista`, controladas por `articuloBlogAbierto`, `null` = lista):
una cuadrícula de tarjetas (imagen 16:9 si tiene, fecha, título,
extracto — el extracto usa el texto escrito a mano o, si Juan lo dejó
vacío, `resumenTextoBlog()` arma uno cortando el contenido a ~140
caracteres) y el artículo completo (imagen grande, título, fecha/autor,
párrafos — `contenido` se parte por líneas en blanco dobles,
`split(/\n{2,}/)`, cada trozo un `<p>`). Tocar una tarjeta abre el
artículo y sube al inicio de la página; "← Volver a los artículos"
regresa a la cuadrícula — todo sin ningún salto de página, ni back-
button del navegador involucrado (mismo espíritu que el resto de
`mostrarVista()`).

**Primera vez que esta página necesita escapar HTML**: hasta ahora
`pedidos/index.html` nunca había interpolado texto libre en `innerHTML`
(nombres de lote/presentación son valores fijos, no texto que alguien
escribió) — el blog es la primera excepción real (Juan escribe título y
contenido desde la app interna). Se copiaron `escapeHtml()`/
`escapeAttr()` de `index.html` tal cual (los dos archivos siguen sin
compartir módulos, mismo criterio que toda constante duplicada de este
proyecto) y se usan en título/extracto/contenido/autor del blog.

⚠️ **Gotcha real encontrado probando esto — las tarjetas volvían
invisibles para siempre después de ver un artículo y volver**:
`pintarBlog()` reemplaza el `innerHTML` completo de `#blog-lista` cada
vez que cambia entre lista y artículo — así que las tarjetas `.revela`
que aparecen al volver a la lista (`cerrarArticuloBlog()`) son nodos
DOM **nuevos**, no los mismos que ya había observado el
`IntersectionObserver` de `iniciarRevelado()` la primera vez. La versión
inicial solo llamaba `iniciarRevelado()` una vez, dentro de
`cargarBlog()` — así que abrir un artículo y volver dejaba las tarjetas
en `opacity:0` para siempre, sin ningún error visible (mismo tipo de bug
ya documentado para `cargarCatalogo()`, que sí lo tenía resuelto desde
el principio por la misma razón). Arreglado moviendo la llamada a
`iniciarRevelado()` al FINAL de `pintarBlog()` mismo, así cualquier
repintado (primera carga, abrir artículo, volver a la lista) siempre
re-observa lo que de verdad esté en el DOM en ese momento — no hace
falta acordarse de llamarla desde cada función que dispare un repintado.

Probado en el preview local (mock, ambas apps — `mock_index_server.py` y
`mock_pedidos_server.py` reescrito para servir `/api/blog-publico`,
antes no manejaba ninguna ruta de API): en la app interna, crear un
artículo, editarlo (con foto de portada de prueba, confirmando que se
guarda), togglear Borrador↔Publicado, y buscar por título — los 4
funcionan y el nuevo artículo aparece de inmediato en la lista sin
recargar. En pedidos, la sección Blog carga los 2 artículos publicados
del mock, muestra el resumen automático en el que no tiene extracto,
abre/cierra el artículo completo correctamente (incluida la foto de
portada, probada con la misma foto de la tostadora de Maquila), y se ve
bien en celular (375px). Sin errores nuevos de consola en ningún
recorrido, en ninguna de las dos apps.

**"Proponer un artículo" por correo, no por WhatsApp (mismo día)**: Juan
pidió que ese botón mande a `pandoracafedeorigen@gmail.com` en vez de
WhatsApp — mismo patrón `mailto:` con asunto/cuerpo prellenado que ya
usa `wa.me` en el resto del sitio (abre el cliente de correo con el
mensaje YA ESCRITO, la persona solo le da Enviar — no es un envío 100%
automático, igual que las notas de `wa.me` documentadas en "WhatsApp —
aviso de pedido nuevo y aviso al cliente" más arriba). Cambio de una sola
línea: `href="mailto:pandoracafedeorigen@gmail.com?subject=...&body=..."`
en vez de `wa.me`, sin `target="_blank"` (no hace falta para `mailto:`).

## Dominio propio + la raíz ahora es la página pública (2026-09-28)

Juan compró `cafepandora.co` (y `www.cafepandora.co`) directo en
Cloudflare Registrar y los activó como Custom domains del proyecto de
Pages — confirmado visitando los dos en el navegador, cargan el sitio
igual que `cafepandora.pages.dev` (ese sigue funcionando, es el mismo
despliegue con 3 dominios apuntando ahí). Con el dominio propio ya
puesto, Juan probó entrar y le apareció la pantalla de login del equipo
en vez de la página de comprar café — pidió que la raíz fuera "una
página mucho más profesional" y que hubiera "una opción de login" aparte
para el equipo. Petición razonable: hasta ahora la raíz del repo
(`index.html`) SIEMPRE había sido la app interna, y la página pública
vivía en `/pedidos/` — al revés de lo que cualquier visitante nuevo
esperaría de un dominio de marca.

**El cambio, completo**:
- `index.html` (app interna, lo que antes estaba en la raíz) →
  `gestion/index.html`. El nombre "gestión" no es antojado — es
  literalmente la palabra que ya usa el propio login
  ("Gestión integral — acceso del equipo"), más fácil de recordar para
  Juan/Inés que un genérico "/app/" en inglés.
- `pedidos/index.html` (página pública) → `index.html`, en la raíz.
- `pedidos/img/*.jpg` → `img/*.jpg` — las rutas relativas dentro del
  archivo (`src="img/..."`) no cambiaron ni una letra, porque el HTML y
  su carpeta de fotos se movieron JUNTOS, manteniendo la misma posición
  relativa entre ellos.
- `xlsx-lite.js` se quedó en la raíz, sin moverse — lo referencia
  `gestion/index.html` con una ruta ABSOLUTA (`<script src="/xlsx-lite.js">`),
  así que no le importa desde qué carpeta se sirva el HTML que lo pide.
  Mismo motivo por el que ninguna llamada a `/api/...` (siempre rutas
  absolutas) se vio afectada por el movimiento.
- **`_redirects`** (archivo nuevo, primera vez que existe en este repo):
  `/pedidos/*  /  301` — cualquier link viejo a `/pedidos/` (Instagram,
  WhatsApp Business, una tarjeta ya impresa) sigue funcionando, redirigido
  a la raíz en vez de dar 404. Formato de una sola línea
  `[origen] [destino] [código]`, verificado contra la documentación
  oficial de Cloudflare Pages antes de escribirlo.
- **Link "¿Eres del equipo? Inicia sesión →"** (`.footer-equipo`, nuevo en
  `index.html`): chico, apagado (opacity .7, sube a 1 en hover), al final
  de la página — vive FUERA de `#vistaCafe`/`#vistaMaquila`/`#vistaBlog`
  (junto a `.carrito-barra`, justo antes en el HTML) para que se vea sin
  importar cuál de las 3 vistas esté activa. Apunta a `/gestion/` — un
  clic normal de navegador, no pasa por `mostrarVista()` ni nada de JS.

**Nada de lógica se tocó** — ni un solo `onclick`/`id`/función cambió de
nombre; todo el trabajo de esta sesión (Maquila, Blog, WhatsApp→correo)
sigue funcionando exactamente igual, solo cambiaron las rutas de los 2
archivos HTML y su carpeta de imágenes. Confirmado leyendo TODO
`gestion/index.html` en busca de rutas relativas, `redirectTo` de
Supabase Auth, o cualquier otra cosa que asumiera "estoy en la raíz" —
no había ninguna (Supabase Auth acá es simple correo/contraseña, sin
magic link ni confirmación por correo que dependa de una URL de retorno).

⚠️ **Gotcha real, encontrado probando esto en el preview local — apuntar
el mock directo al proyecto real (en vez de copiar a `preview-root/`)
no funciona**: para evitar el ya conocido "se me olvidó sincronizar el
archivo antes de probar" (pasó varias veces esta sesión), se intentó
apuntar `ROOT` de `mock_pedidos_server.py`/`mock_index_server.py`
directo a la carpeta real del proyecto en `/Users/.../cafe-pandora-cf 2`
en vez de a `scratchpad/preview-root/`. El mismo script, corrido a mano
en Bash, servía el archivo real sin problema (confirmado con `curl`) —
pero lanzado a través de la herramienta `preview_start`, daba 404 para
TODO, aunque el archivo sí existía y sí era legible desde Bash. Causa:
el proceso que lanza `preview_start` corre sandboxeado, sin permiso de
lectura fuera de `scratchpad/` — el archivo "no existe" desde su punto de
vista, aunque exista de verdad en disco. Vuelto a `preview-root/` (con
la estructura nueva: `preview-root/index.html` + `preview-root/img/` +
`preview-root/gestion/index.html`, sincronizados a mano con `cp` antes de
cada prueba) — ahí sí funcionó. Moraleja para la próxima vez que se
quiera "simplificar" el mock apuntando directo al proyecto real: no
vale la pena, `preview_start` necesita que los archivos vivan dentro de
`scratchpad/`.

**Pendiente, operativo, no de código**: avisarle a Inés y Joaquín que el
link de acceso a la app interna cambió de `cafepandora.co` (o
`cafepandora.pages.dev`) a `cafepandora.co/gestion/` — quien tenga la
raíz vieja guardada como marcador/favorito ahora va a ver la página de
clientes en vez de su pantalla de login, tiene que actualizar el
marcador una sola vez.

Probado en el preview local: `index.html` (raíz) carga la página de
comprar café con las fotos reales funcionando (antes de este pase varias
daban 404 en el mock por un problema de sincronización previo, ya
resuelto de paso); el link "¿Eres del equipo?" lleva a `/gestion/` y
esa carga el login de la app interna sin ningún error de consola; la app
interna sigue sincronizando y funcionando igual que siempre desde su
nueva carpeta. No se pudo probar `_redirects` en el preview local (es
una función propia de Cloudflare Pages, el servidor mock de Python no la
interpreta) — la sintaxis se verificó contra la documentación oficial en
su lugar.

## Blog — subir un artículo desde un archivo de Word (2026-09-28)

Juan: *"para el archivo del blog, también sea posible subir un archivo de
Word para que si tiene tablas o algo así sigan viéndose, debido a que si
copio y pego y hay tablas todo queda escrito pegado y no queda tan
bonito"*. Hasta ahora "Contenido" era un `<textarea>` de texto plano
(párrafos separados por línea en blanco) — cualquier tabla de Word,
copiada y pegada ahí, perdía toda su estructura. La solución: convertir
el `.docx` a HTML DENTRO del navegador (nada se sube a ningún servicio
aparte) y guardar ESE html en vez de texto plano.

**`es_html`** (`migracion_blog_html.sql`, boolean, default `false`) —
columna nueva en `blog_posts` que le dice a la app (interna Y pública)
cómo tratar `contenido`: `false` (todos los artículos de siempre) = texto
plano, se sigue partiendo por párrafos como hasta hoy; `true` = ya es
HTML (tablas, negritas, listas, títulos, imágenes) y se pinta directo,
sin tocarlo. Los 3 endpoints de blog (`GET/POST /api/blog`,
`PATCH /api/blog/:id`, `GET /api/blog-publico`) suman `esHtml:es_html` a
su `SELECT`.

**Mammoth.js** (`https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js`,
CDN, sin instalar nada) hace la conversión — es la librería estándar para
esto, entiende el formato real de Word (OOXML) y produce HTML semántico
(`<table>`, `<strong>`, `<ul>`, `<h1-6>`...). Las imágenes que traiga el
.docx se configuran para venir inline como base64
(`mammoth.images.imgElement(...)`, del propio ejemplo de la documentación
de Mammoth) — mismo espíritu que la foto de portada del blog, sin
necesitar almacenamiento de archivos aparte. **DOMPurify**
(`https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js`) limpia el
HTML que devuelve Mammoth ANTES de guardarlo — es contenido que después
se pinta con `innerHTML`, primero en el preview de `gestion/index.html` y
luego en la página pública, así que lo que se guarda en la base de datos
ya tiene que estar filtrado. Se sanitiza OTRA VEZ (con el mismo DOMPurify,
cargado también ahí) justo antes de pintarlo en `index.html` (la página
pública) — defensa en profundidad, esa página pinta contenido que viene
de una API pública.

**Flujo en `gestion/index.html`** (mismo patrón en "Nuevo artículo" y en
el modal de "Editar"): debajo del `<textarea>` de siempre hay un
`<input type="file" accept=".docx">` nuevo. Al elegir un archivo,
`convertirWordABlogHtml(file)` (Mammoth + DOMPurify) llena un buffer JS
(`blogWordHtmlNuevo` / `blogWordHtmlEditando`, mismo patrón que
`imagenBlogNueva`/`imagenBlogEditando` para la foto de portada) y pinta
una vista previa real (`.blog-html-preview`, con la tabla ya con
bordes/encabezado — para que Juan confirme que el archivo se leyó bien
antes de guardar) — el `<textarea>` se deshabilita mientras tanto, con un
placeholder que explica que se va a usar el Word en su lugar, para que
no quede ambiguo cuál de los dos gana. Un botón "✕ Quitar Word, escribir
texto en su lugar" limpia el buffer y reactiva el `<textarea>`. Al
guardar, `contenido` es el HTML del Word si se subió uno (si no, el texto
del `<textarea>` de siempre) y `esHtml` viaja como `true`/`false` según
cuál se haya usado — **nunca se mezclan los dos** (uno reemplaza al otro
por completo, no se concatenan).

**Editar un artículo que ya es HTML**: `abrirEdicionBlog()` arranca el
buffer (`blogWordHtmlEditando`) con el HTML ya guardado si `p.esHtml` es
`true`, muestra ese HTML en el mismo `.blog-html-preview` de solo-lectura,
y deja el `<textarea>` deshabilitado — no tiene sentido mostrar HTML
crudo dentro de un `<textarea>` de texto plano. Para corregir el
contenido hay 2 caminos: subir OTRO `.docx` (reemplaza el HTML anterior),
o darle "Quitar Word" para volver a texto plano y escribir de cero.

**Fila de la lista y buscador**: `filaBlogPost()` ganó una etiqueta
"(Word)" junto al título cuando `p.esHtml`, y `textoPlanoDeHtml(html)`
(crea un `<div>` fuera del DOM visible, le pone el HTML, lee
`.textContent`) le quita las etiquetas antes de armar el resumen — sin
esto, un artículo sin "Extracto" escrito a mano hubiera mostrado las
etiquetas crudas en la vista previa de la lista. Mismo criterio, mismo
nombre de función (`textoPlanoDeHtmlBlog` en la página pública, por ser
archivos independientes) para el resumen de la tarjeta en `index.html`
cuando tampoco hay "Extracto".

**CSS de tablas/listas/títulos** (`.blog-html-preview` en
`gestion/index.html`, `.blog-articulo-html` en `index.html`) — el HTML
que devuelve Mammoth no trae clases propias (`<table>`, `<td>` pelados),
así que se estilan a mano: en el preview interno, genérico, solo para
que Juan confirme que se ve bien; en la página pública, ya con la
tipografía/colores reales del sitio (`--serif` en títulos, `--teal` en
encabezados de tabla). `table { display: block; overflow-x: auto; }` en
las dos — para que una tabla con muchas columnas se pueda desplazar de
lado en vez de desbordar la pantalla en celular (la tabla de prueba de 2
columnas cabía bien igual, pero no hay garantía de que un Word real
siempre traiga tablas angostas).

Probado de punta a punta con un `.docx` REAL construido a mano (ZIP +
XML mínimo válido, con un párrafo, una tabla de 2 columnas/3 filas con
encabezado en negrita, y otro párrafo) — no solo con HTML de prueba
tipeado directo: la conversión con Mammoth extrajo el párrafo, la tabla
completa (con `<strong>` en los encabezados) y el párrafo final
exactamente; el flujo completo en `gestion/index.html` (elegir archivo →
preview → guardar → aparece en la lista con "(Word)" → editar → sigue
ahí → "Quitar Word" vuelve a texto plano) funcionó sin errores de
consola; en la página pública, la tabla se ve con el estilo del sitio
tanto en desktop como en celular (375px), sin desbordar. Sin errores
nuevos de consola en ningún paso, en ninguna de las dos apps.

## Manifest para "Añadir a pantalla de inicio" de la app interna (2026-09-28)

Juan preguntó cómo hacer que, al anclar la página en la pantalla de
inicio del celular, lo que abra directo sea la app interna. **No hacía
falta ningún cambio de código para esto** — cuando un navegador guarda un
ícono en la pantalla de inicio, guarda la URL exacta donde estabas parado
en ese momento. La respuesta real: entrar a `cafepandora.co/gestion/`
desde el navegador del celular y ahí sí usar "Compartir → Añadir a
pantalla de inicio" (iPhone) o el menú de tres puntos → "Añadir a
pantalla de inicio"/"Instalar app" (Android) — nunca desde la raíz
(`cafepandora.co`), que ahora es la página pública.

**Lo que sí se mejoró de paso**: `gestion/index.html` YA tenía desde
antes (heredado de cuando vivía en la raíz, sin tocar en el intercambio
de rutas) las 3 etiquetas `apple-mobile-web-app-*` + `apple-touch-icon`
que hacen que iOS abra el ícono anclado a pantalla completa, sin la
barra de Safari — pero le faltaba el equivalente para Android
(`manifest.json`), que es lo que activa el mismo modo "app completa, sin
barra del navegador" ahí. Se agregó:

- **`gestion/manifest.json`** — `start_url`/`scope` fijos en `/gestion/`
  (así que si Android alguna vez decide relanzar la app desde otro punto,
  siempre vuelve a la pantalla de login, nunca a la página pública),
  `display: standalone`, y los 2 íconos (180×180, 512×512 — extraídos del
  mismo PNG que ya usaba `apple-touch-icon`, con `sips`, no un archivo
  nuevo de diseño).
- **`<link rel="manifest">`** nueva en `gestion/index.html`, junto a las
  etiquetas de Apple ya existentes.
- **`apple-mobile-web-app-title` cambió de "Café Pandora" a "Gestión"**
  (y el manifest usa el mismo `short_name`) — a propósito: como la página
  pública (`index.html`, raíz) todavía no tiene ninguna de estas etiquetas
  (nadie la ha anclado a pantalla de inicio todavía), no hay conflicto
  hoy, pero si alguien alguna vez ancla LAS DOS páginas, un ícono que
  simplemente dijera "Café Pandora" dos veces sería imposible de
  distinguir a simple vista en la pantalla de inicio — "Gestión" dejó
  claro cuál es cuál desde ya, sin tener que rehacer esto después.

No se tocó nada de `index.html` (la página pública) en este pase — el
mismo patrón se aplicó ahí el 2026-09-29, ver "Ícono de pantalla de
inicio de la página pública — el logo solo, sin el armadillo" más abajo.

Probado en el preview local: `/gestion/manifest.json` responde 200 con
el JSON esperado (`start_url`/`scope: "/gestion/"`, `short_name:
"Gestión"`), los 2 íconos (`/gestion/icon-180.png`,
`/gestion/icon-512.png`) responden 200, y la app interna sigue cargando
sin errores de consola. No se pudo probar el comportamiento real de
"Añadir a pantalla de inicio" (necesita un dispositivo físico o un modo
de instalación de PWA que el navegador de este entorno no dispara) — el
comportamiento esperado se basa en cómo Android/iOS documentan e
interpretan estas etiquetas, no en una prueba visual directa.

## Cada vista de la página pública con su propia URL — /maquila, /blog (2026-09-28)

Juan: *"que cada pestaña tenga su propia sección... por si quiero
compartir algo específico que no se vaya siempre a la de pedidos"*.
Hasta ahora `mostrarVista()` (la función que reemplaza contenido entre
café/Maquila/Blog, ver "Sección Maquila..." más arriba) nunca tocaba la
URL — siempre era `/`, sin importar qué vista estuvieras viendo, así que
no había forma de compartir un link directo a Maquila o al Blog.

**`_redirects`** (Cloudflare Pages) ganó reglas de "proxying" — código
`200`, no `301`/`302` — para `/pedidos`, `/maquila` y `/blog` (con y sin
`/` final, más comodín para cualquier cosa después): ese código hace que
Cloudflare sirva el contenido de `/` (el mismo `index.html` de siempre)
pero **mantenga la URL tal como se escribió** en la barra, a diferencia
de una redirección de verdad que sí la cambia. Reemplazó la regla vieja
`/pedidos/* / 301` (de cuando `/pedidos/` era la única URL de la página
pública, antes del dominio propio) — ya no hace falta redirigir esas
URLs a la raíz, ahora son válidas por derecho propio.

**El JS decide qué vista mostrar leyendo la URL**, no al revés:
`vistaDesdeURL()` (nueva) lee `location.pathname` y devuelve
`'maquila'`/`'blog'`/`'cafe'`. Se usa en 2 momentos:
1. **Al cargar la página** (`mostrarVista(vistaDesdeURL(), {sinURL:true,
   instantaneo:true})`, al final del script) — si alguien entra directo a
   un link compartido de `/maquila`, ve Maquila de una, no café.
2. **Botón atrás/adelante del navegador** (`popstate`) — mismo patrón,
   vuelve a leer la URL (que el navegador ya cambió solo) y muestra la
   vista que corresponda.

**`mostrarVista(vista, opciones)`** ganó un segundo parámetro:
- `sinURL: true` — no toca el historial (lo usan los 2 casos de arriba,
  porque la URL YA es la correcta, la puso el navegador solo; volver a
  empujarla crearía una entrada de historial duplicada y "atrás" se
  sentiría raro, sin volver a ningún lado la primera vez que se aprieta).
- `instantaneo: true` — el scroll al tope usa `behavior: 'auto'` en vez
  de `'smooth'` (para los 2 casos de arriba, donde no tiene sentido
  animar un scroll que el usuario ni siquiera pidió con un clic).
- Sin ninguna opción (el caso normal, clic en la barra de navegación):
  `history.pushState({vista}, '', RUTA_POR_VISTA[vista])` — la URL
  cambia de verdad y queda en el historial, para que "atrás" funcione.

Los links de "Maquila"/"Blog" en `.nav-secciones` pasaron de
`href="#"` (con `return false`, nunca navegaban de verdad) a
`href="/maquila"`/`href="/blog"` reales — mismo `onclick` de siempre
(`mostrarVista(...); return false;`, sigue interceptando el clic para
que sea instantáneo, sin recargar la página), pero ahora con una URL de
verdad detrás: si el JS fallara por lo que sea, o si alguien abre el
link en una pestaña nueva (clic derecho → abrir en pestaña nueva), el
`href` real sigue funcionando solo, sin depender del JS.

⚠️ **Gotcha real, encontrado probando esto — TDZ, mismo patrón ya
documentado en este archivo, esta vez en la página pública**: la primera
versión ponía la llamada inicial a `mostrarVista(vistaDesdeURL(), ...)`
justo debajo de la definición de `mostrarVista()`, ANTES de donde el
script más abajo declara `let blogPosts`/`let blogCargado` (sección
"Blog — lista pública"). Como `mostrarVista('blog')` dispara
`cargarBlog()`, que lee `blogCargado`, entrar directo a `/blog` tiraba
`"Cannot access 'blogCargado' before initialization"` — el mismo tipo de
error de TDZ ya documentado para `TITULARES_CUENTA_COBRO` en la app
interna (Gotchas, más arriba), esta vez del lado de `pedidos`/`index.html`.
Arreglado moviendo SOLO la llamada inicial (no la función
`vistaDesdeURL()` en sí, que no referencia nada `let` y es segura donde
está) hasta el final del script, después de `cargarCatalogo()` — para
entonces todo el archivo ya se terminó de ejecutar una vez, así que
cualquier `let`/`const` ya está inicializado sin importar en qué orden
aparezcan las secciones.

⚠️ **Segundo gotcha real, esta vez del entorno de pruebas, no del
código**: mientras se probaba esto, una pestaña "recién" navegada a
`http://localhost:8787/` seguía mostrando un documento de HORAS atrás
(confirmado con `document.lastModified`) aunque el archivo en disco y la
respuesta de un `fetch()` con `cache:'no-store'` sí estaban al día — el
navegador estaba cacheando agresivamente el HTML por URL (mismo problema
real que `_headers` con `Cache-Control: no-cache` ya resuelve en
producción, ver "Cómo se despliega" al principio de este archivo), pero
el servidor mock de Python (`mock_pedidos_server.py`/`mock_index_server.py`,
en el scratchpad de la sesión) nunca mandaba ese header, así que el
navegador quedaba libre de cachear agresivo. Arreglado agregándole
`Cache-Control: no-store` a las respuestas del mock
(`end_headers()` sobreescrito) — mismo motivo por el que existe
`_headers` en este repo, aplicado también al servidor de prueba. Mientras
tanto, cualquier URL que ya se hubiera cargado ANTES de este arreglo
seguía sirviendo la copia vieja cacheada hasta que se le agregó un
parámetro cualquiera (`?v=2`) para forzar una petición nueva — moraleja
para la próxima vez que algo se vea "viejo" en el preview local sin
explicación: sospechar de caché del navegador antes que del código,
sobre todo si `fetch()` manual sí muestra el contenido correcto pero la
página cargada no.

Probado de punta a punta en el preview local (con el mock ya corregido):
cargar `/maquila`, `/blog` y `/pedidos` DIRECTO (sin pasar por la
navegación interna) muestra la vista correcta de una, sin ningún error
de consola; tocar "Maquila" desde `/` cambia la URL a `/maquila` con
`pushState` (sin recargar la página — confirmado que la respuesta ya
traía el querystring de prueba y desapareció, señal de que no hubo
petición de red nueva); el botón atrás del navegador vuelve a `/` y
muestra café de nuevo; y el caso más delicado — estando en `/maquila` y
tocando "Tour" (un link de café con ancla, `#tourFinca`) — la URL queda
exactamente en `/#tourFinca` (no `/maquila#tourFinca` ni ningún otro
resultado raro), confirmando que el salto de ancla nativo del navegador
usa la URL ya actualizada por `mostrarVista('cafe')`, no la de antes del
clic.

## Merch — pestaña nueva, todavía SIN mostrarse públicamente (2026-09-28)

Juan: *"me gustaría que armáramos una pestaña nueva pero que aún no se
vea públicamente... que sea de merch, para subir pocillos, camisetas,
busos etc"*. Mismo patrón exacto que Blog (tabla con `estado`
Borrador/Publicado, endpoint público aparte, pestaña de administración
en la app interna) — la diferencia real está en que esta vez, ADEMÁS de
que cada producto tenga su propio estado, la SECCIÓN COMPLETA todavía no
tiene ningún link en `.nav-secciones` de la página pública.

**Qué significa "oculta" acá, en concreto — sin login, no es secreta de
verdad**: `/merch` funciona igual que `/maquila`/`/blog` si alguien
entra directo a esa URL (mismo `_redirects` de proxying, código 200,
mismo patrón que las otras 2 secciones) — simplemente no hay ningún
botón en la barra de arriba que lleve ahí, así que nadie la encuentra
navegando por el sitio. Es "no listada", no "protegida con clave" — se
lo aclaré a Juan explícitamente antes de construirlo, para que no
asuma que hace falta una contraseña. Si alguien comparte el link
`/merch` antes de que esté lista, sí se puede ver.

**`merch_productos`** (`migracion_merch.sql` — id, nombre, categoria,
precio, descripcion, imagen, estado, creado_por, ts). `GET /api/merch`
(con login, TODO — la pestaña "Merch" de la app interna) vs.
`GET /api/merch-publico` (sin login, solo `estado = 'Publicado'`) —
mismo patrón `POST`/`PATCH /api/merch/:id`/`DELETE` que Blog.
`CATEGORIAS_MERCH = ['Pocillos', 'Camisetas', 'Busos', 'Otro']`
(`gestion/index.html`) — lista fija editable a mano si hace falta un
tipo nuevo, mismo criterio que `LOTES`/`PRESENTACIONES` en el resto de
la app (no viene de la base de datos, es una constante de código).

**`redimensionarImagen()` se volvió genérica** — antes se llamaba
`redimensionarImagenBlog()` (el mismo canvas→JPEG que ya usaba la foto
de portada del blog); se renombró (y se le quitó "Blog" del nombre) para
que Merch también la use sin duplicar la misma lógica de achicar fotos
una segunda vez. Los 2 sitios que ya la llamaban (`onImagenBlogNueva`/
`onImagenBlogEdit`) se actualizaron al nuevo nombre, sin cambiar nada de
su comportamiento.

**Pestaña "Merch" en la app interna** (`renderMerch()`,
`filaMerchProducto()`): mismo patrón formulario-arriba + lista-abajo que
Blog, más simple (sin la complejidad de subir Word) — Nombre, Categoría,
Precio, Descripción opcional, Foto opcional, Estado. Arriba del todo, un
aviso fijo en la propia pantalla (fondo dorado, imposible de no ver)
recuerda que la sección pública todavía no tiene link — para que a
nadie del equipo le sorprenda no verla al entrar a `cafepandora.co`.
Sumado a `sincronizar()`, `TABS_CON_BUSQUEDA`, el modal de búsqueda
global, y al panel de ⚠️ migraciones pendientes — mismos 4 lugares que
cualquier recurso nuevo de esta app.

**Sección pública en `index.html`** (`#vistaMerch`, mismo mecanismo de
`mostrarVista()`/`RUTA_POR_VISTA` que Maquila/Blog): a diferencia de
esas 2, `mostrarVista()` necesitó generalizarse — antes buscaba el link
de nav a resaltar con un ternario de 2 opciones
(`vista === 'maquila' ? navMaquilaLink : navBlogLink`), que no tenía
forma de expresar "esta vista no tiene ningún link que resaltar". Se
reemplazó por un mapa, `LINK_ID_POR_VISTA = { maquila: 'navMaquilaLink',
blog: 'navBlogLink' }` (sin entrada para `merch`) — `mostrarVista()`
ahora hace `const linkId = LINK_ID_POR_VISTA[vista]; if (linkId)
document.getElementById(linkId).classList.add('activo');`, así que para
Merch simplemente no intenta resaltar nada, sin ningún `if` especial
para ese caso. Cuando se lance de verdad, el único cambio que hace
falta es agregar el `<a>` real en el HTML + una entrada más en ese mapa
— nada de lo demás cambia.

Cada tarjeta de producto (`.merch-card`, cuadrícula 2 columnas → 1 en
celular, mismo breakpoint 420px que `.maquila-servicios`) tiene su
PROPIO botón de WhatsApp — a diferencia de Maquila/Tour (un solo CTA
para todo el servicio), acá cada producto es distinto, así que cada uno
arma su propio mensaje prellenado con su nombre exacto
(`¡Hola! Quiero preguntar por: <nombre>.`) — mismo patrón `wa.me` de
siempre, sin carrito ni selección de talla/cantidad (deliberadamente
simple para este primer lanzamiento — si hace falta más adelante,
tallas/variantes/inventario es una ampliación aparte, no se inventó
nada de eso todavía porque no se pidió).

`_redirects` ganó las mismas 3 líneas de proxying que ya tienen
`/maquila`/`/blog` (`/merch`, `/merch/`, `/merch/*`, código 200) —
la ruta está lista desde ya, solo falta el botón.

Probado en el preview local: la pestaña "Merch" de la app interna crea,
edita, cambia de estado y busca productos correctamente (sin errores de
consola); `/merch` en la página pública muestra SOLO los 2 productos
`Publicado` del mock (el 1 en Borrador queda afuera, igual que un
artículo de blog sin publicar); confirmado por JS que `.nav-secciones`
tiene exactamente los 6 links de siempre y ninguno para Merch; cada
tarjeta arma su propio link de WhatsApp con el nombre correcto del
producto; la cuadrícula baja a 1 columna en celular (375px) sin
desbordar.

**Pendiente, para cuando Juan avise que ya armó el catálogo y quiere
lanzarlo**: correr `migracion_merch.sql`, y agregar
`<a href="/merch" id="navMerchLink" onclick="mostrarVista('merch');
return false;">Merch</a>` dentro de `.sidebar-nav` (en `index.html`) +
`merch: 'navMerchLink'` a `LINK_ID_POR_VISTA` — dos líneas, nada más, ya
está todo lo demás construido y probado. ⚠️ *Actualización 2026-09-28*:
`.nav-secciones` (mencionada arriba en este bloque) ya no existe — la
barra de arriba se reemplazó por una barra lateral, ver "Barra lateral +
catálogo como primera pantalla" más abajo; el lugar donde agregar el
link de Merch
ahora es `.sidebar-nav`, como se corrigió en este mismo párrafo.

## Barra lateral + catálogo como primera pantalla (2026-09-28)

Juan compartió un feedback real que le dio alguien de confianza (analiza
datos para otro negocio, nunca había visto la página — Juan solo se la
había pasado a conocidos) — dos mensajes, sin que se le preguntara nada
en concreto: **"es difícil diferenciar entre el consumidor final y lo
que tú tienes para negocios (maquilas)... como que intenta hacer muchas
cosas al mismo tiempo. Yo la separaría en consumidor y negocios. Si yo
quisiera comprar café, quisiera que eso estuviera más directo"**, y por
separado, sobre el recorrido hasta llegar al catálogo: **"no tanto me
parece que hay que leer mucho para llegar al catálogo, yo empezaría con
el catálogo"**. Juan pidió implementar los ajustes, y de paso: **"mejor
tener todo en una barra lateral de menú como en la app [interna], y que
la primera página a donde uno llegue sea el catálogo, y que lo de finca
y toda la info esté en una pestaña llamada 'conócenos' o algo parecido.
Que sea una web de compra de café antes que cualquier otra cosa"**.

⚠️ **Esto reemplaza por completo lo que describían varias secciones de
arriba sobre `pedidos/index.html`/`index.html`** ("Identidad visual...",
"Rediseño de lujo...", "Barra de secciones en pedidos/index.html",
"Sección 'Maquila'...", "Cada vista de la página pública con su propia
URL") — se dejaron tal cual, como registro histórico de CÓMO se llegó
hasta acá, pero el Hero de pantalla completa, `.nav-secciones` (la barra
fija de arriba con anclas `#datoDuro`/`#procesoSeccion`/`#tourFinca`), y
la idea de que "café" fuera un scroll largo con la historia de la finca
ANTES del catálogo, ya NO existen. Si algo de esta sección contradice a
una de arriba, esta gana — es la más reciente.

**El cambio real, de fondo — 5 vistas en vez de 4, con una barra lateral
en vez de una barra de arriba**:

- **"Catálogo"** (`#vistaCatalogo`, la URL raíz `/`) es la vista por
  defecto ahora — antes era "cafe" (Hero + Dato duro + Proceso + Tour +
  el catálogo, todo en un solo scroll largo). El Hero de 88vh se achicó a
  un encabezado compacto (`.cat-header`): el logo real, una línea de
  marca, y las 2 señales de confianza (WhatsApp en menos de una hora,
  +1.000 pedidos) — nada de CTAs ("Comprar café →"/"Conoce la finca ↓"),
  porque ya no hace falta saltar a ningún lado, el catálogo está
  INMEDIATAMENTE debajo. `.wrap` (el carrito/checkout de siempre) no se
  tocó por dentro — mismo `header-slim`/`guia-pasos`/`nav-rapida`/
  `#catalogo`/`#bannerExoticos`/`#resumenPedido`/`#confianzaPedido`/
  `#datosCliente`/`#pantallaFinal`, en el mismo orden, con la misma
  lógica de JS (`cargarCatalogo()`, `enviarPedido()`,
  `mostrarConfirmacion()`...) intacta.
- **"Conócenos"** (`#vistaConocenos`, `/conocenos`) — vista nueva que
  junta lo que antes era la portada larga: Dato duro (finca real) +
  Proceso (los 4 pasos, con sus fotos) + Tour de café, en ese mismo
  orden, apilados normalmente (sin anclas internas ni scrollspy — la
  barra lateral ya cubre la navegación de primer nivel, no hace falta
  saltar DENTRO de esta vista a una sub-sección). Arriba de Dato duro se
  agregó `.conocenos-arte` — la foto real de la finca
  (`finca-flor.jpg`) que antes vivía en el Hero, para que "Conócenos" no
  empiece en seco directo con el bloque oscuro de Dato duro.
- **Maquila y Blog** — sin cambios de contenido, solo se movieron de
  vivir sueltas bajo `<body>` a vivir dentro de `.main-content` (ver
  abajo). Maquila sigue siendo la vista que de entrada distingue
  cliente-final de negocio — exactamente lo que pedía el feedback.
- **Merch** — sin cambios, sigue sin link en la navegación a propósito
  (ver la sección de arriba).

**La barra lateral** (`.sidebar-publica`, nueva): en escritorio
(`min-width: 860px`) es una columna fija de `--sidebar-w` (236px) a la
izquierda, siempre visible, con 4 links (Catálogo/Maquila/Conócenos/
Blog, cada uno `icono + texto`) y, al fondo, el link "¿Eres del equipo?
Inicia sesión →" (antes vivía en un `<footer>` aparte, ahora es el pie
de la barra — mismo destino, `/gestion/`, sin cambios). En celular
(`max-width: 859px`) es un panel que se abre/cierra: `translateX(-100%)`
por defecto, `.abierta` lo trae a `translateX(0)`, con un botón
`☰`/`✕` fijo en la esquina (`.mobile-menu-btn`, `id="mobileMenuBtn"`,
`toggleSidebar()`) y un fondo oscuro (`.sidebar-overlay`) que lo cierra
al tocar fuera. `abrirSidebar()`/`cerrarSidebar()`/`toggleSidebar()`
(JS nuevo) — `mostrarVista()` llama `cerrarSidebar()` SIEMPRE al cambiar
de vista (no-op en escritorio, donde el panel nunca se "abre/cierra" de
verdad), así que tocar un link en celular navega Y cierra el panel en
el mismo gesto, sin un segundo toque.

`.main-content` (`id="mainContent"`) envuelve TODAS las vistas (antes
Maquila/Blog/Merch eran hermanos sueltos de `#vistaCafe` bajo `<body>`)
— en escritorio lleva `margin-left: var(--sidebar-w)` para no quedar
debajo de la barra; `.carrito-barra` (la barra flotante del carrito,
`position: fixed`, fuera de `.main-content`) recibe el mismo
`left: var(--sidebar-w)` en escritorio, para no taparse con la barra
lateral. Ninguna sección interna (Dato duro, Maquila, Blog...) necesitó
tocarse por este cambio — al vivir dentro de un contenedor con
`margin-left`, sus fondos "full-bleed" simplemente dejan de extenderse
por debajo de la barra lateral, que es el comportamiento correcto
(la propia barra ya tiene su fondo opaco).

**`mostrarVista()`/`RUTA_POR_VISTA`/`LINK_ID_POR_VISTA`/`vistaDesdeURL()`
se generalizaron de 4 a 5 vistas** (antes `cafe` era un caso especial —
"si no es ninguna de las otras 3, es cafe, y cafe no resalta ningún
link"; ahora las 5 vistas son simétricas, `catalogo` incluida, cada una
con su propio link que se resalta igual que las demás). `_redirects`
ganó `/conocenos`, `/conocenos/`, `/conocenos/*` (código 200, mismo
patrón de proxying que las demás — ver el comentario en el archivo).

⚠️ **Gotcha real durante la construcción (atrapado y corregido antes de
probar, no llegó a producción)**: el primer intento de mover Dato duro/
Proceso/Tour a `#vistaConocenos` cerró `#vistaCatalogo` justo después del
encabezado compacto (`.cat-header`) y ABRIÓ `#vistaConocenos` ahí mismo,
ANTES de `.wrap` — dejando el carrito/checkout completo (`.wrap`) como
hermano suelto de `.main-content`, sin ningún `id` de vista que lo
controlara, así que quedaba SIEMPRE visible sin importar qué vista
estuviera activa (o, según el punto exacto del corte, atrapado dentro de
`#vistaConocenos` y por lo tanto SIEMPRE oculto). Se encontró
inmediatamente con `grep -n` sobre el HTML (contando aperturas/cierres de
`id="vista*"` y `class="wrap"`) antes de siquiera abrir el preview — la
moraleja de siempre en este archivo, otra vez: cuando una edición mueve
bloques grandes de HTML entre contenedores con `display:none`, verificar
la posición exacta de cada apertura/cierre con `grep -n`, no confiar en
que "se ve bien" a simple vista en un diff largo.

⚠️ **Segundo hallazgo, de CSS, encontrado probando en el preview**: sin
`background: var(--crema)` propio, `.cat-header` dejaba ver la marca de
agua (armadillo, fixed, detrás de todo) mucho más marcada que su 5% de
opacidad real — el mismo problema que ya justificaba el fondo opaco de
`.hero` (ver el comentario original, seguía documentado en el CSS) —
solo que esta vez en un contenedor nuevo que no lo había heredado.
Arreglado agregándole el mismo `background: var(--crema)` +
`position: relative; z-index: 1` que ya usaba `.hero`.

Probado a fondo en el preview local, escritorio y celular (375px):
Catálogo carga de entrada en `/` con el encabezado compacto + guía +
catálogo, sin la portada larga de antes; Conócenos/Maquila/Blog cargan
completos al tocar cada link de la barra (y por URL directa —
`/conocenos`, `/maquila`, `/blog` — sin pasar por la navegación interna);
la barra lateral resalta el link correcto en las 4 vistas; `.carrito-barra`
no se monta sobre la barra lateral en escritorio; en celular el panel
`☰` abre con fondo oscuro, cierra al tocar un link o el fondo, y no tapa
el encabezado (`.sidebar-marca` con espacio de sobra para el botón fijo,
segundo gotcha chico encontrado y corregido en la misma pasada); se
armó un pedido completo (agregar café, llenar datos, "Confirmar por
WhatsApp") y la pantalla de confirmación se mostró igual que siempre,
con el resto del formulario oculto correctamente. `/merch` sigue
funcionando por URL directa, sin ningún link resaltado en la barra —
comportamiento sin cambios. Sin errores de consola en ningún recorrido.

**Ajuste el mismo día, después de ver la barra en vivo**: el usuario
pidió quitar los emoji de cada link (☕🫘📖📰, y el ☕ del propio
"Café Pandora" del encabezado de la barra) y usar una tipografía "más
elegante y bonita" — se quitaron los `<span class="ico">` por completo
(los 4 links de `.sidebar-nav` quedaron como texto solo) y
`.sidebar-nav a` pasó de Outfit (sans-serif de UI) a `var(--serif)`
(Fraunces, la misma serif del logo y los títulos de sección en toda la
página), subiendo el tamaño de 14.5px a 16.5px — a ese tamaño chico
Fraunces se ve apretada si no se agranda un poco. El link "¿Eres del
equipo?..." al pie de la barra NO se tocó — a propósito se queda chico
y en Outfit, porque es del equipo, no un ítem de navegación para
clientes (mismo criterio que ya tenía cuando era un `<footer>` aparte).
Probado en el preview, escritorio y celular (375px, panel abierto): los
4 links se ven en serif sin íconos, sin desbordar ni verse apretados;
sin errores de consola.

## Reordenar señales de confianza + catálogo en 2 columnas (2026-09-28)

Tres pedidos más del usuario, viendo ya el catálogo como primera
pantalla en vivo:

1. **"💬 Respondemos por WhatsApp en menos de una hora"** — se quitó del
   encabezado del catálogo (`.cat-header`) y se movió a `.wrap`, entre
   el banner de Exóticos y "Tus datos" (justo antes de `#resumenPedido`/
   `#confianzaPedido`) — el momento en que más ayuda saber que sí
   contestan rápido es cuando ya se está por llenar los datos, no antes
   de ver el catálogo.
2. **"☕ +1.000 pedidos de café entregados este año"** — se quitó del
   mismo encabezado y se movió al FINAL del todo, después de "Tus
   datos" (justo antes de `#pantallaFinal`) — un cierre de confianza
   justo antes de mandar el pedido, en vez de una introducción.
   `.cat-header` se quedó solo con el kicker, el logo y la línea de
   marca — más corto todavía que la primera versión del rediseño.
   Ninguna de las dos cambió de clase CSS (`.hero-confianza`/
   `.hero-prueba-social`, las mismas de siempre) — solo se les agregó
   `text-align: center` + su propio margen, porque `.wrap` (a diferencia
   de `.cat-header`) no centra el texto por defecto.
3. **Las dos "bolsas" (Lavado, Honey/Natural) una al lado de la otra —
   probado y REVERTIDO el mismo día**: se probó envolviendo lo que arma
   `pintarCatalogo()` en un `<div class="catalogo-grid">` (grid de 2
   columnas desde 860px, 1 columna en celular). Se vio en vivo y el
   usuario pidió dejarlo como estaba antes — vuelto a como era
   (`cont.innerHTML = html` directo, sin el `<div>` envolvente; se quitó
   también la clase `.catalogo-grid` del CSS, ya no se usa en ningún
   lado). Las tarjetas siguen una debajo de la otra, como siempre.

Probado en el preview: las 2 señales de confianza aparecen en su nueva
posición y el encabezado del catálogo quedó más corto (puntos 1 y 2, sí
se quedaron); las tarjetas de Lavado y Honey/Natural volvieron a verse
apiladas, una debajo de la otra (punto 3, revertido). Sin errores de
consola.

## Política real de envío en la nota de "Antes de pedir" (2026-09-28)

El texto de "Envío" en la tarjeta `#confianzaPedido` decía algo genérico
("coordinamos contigo la entrega o el envío por transportadora, según tu
ciudad") sin ningún día ni costo concreto — el usuario dio la política
real: los envíos son todos los jueves, y si el cliente necesita otro día
tiene un costo adicional de $5.000. Texto nuevo: "📦 Envío: hacemos
envíos todos los jueves — si necesitas que sea otro día, tiene un costo
adicional de $5.000." Mismo `<p class="confianza-item">` de siempre, sin
tocar CSS ni estructura — solo el texto. Probado en el preview, se ve
igual de bien que las otras 2 líneas de la misma tarjeta.

## Botón ☰ de celular: "Menú" con texto, se encoge al hacer scroll (2026-09-28)

Pedido del usuario: que el botón de la barra lateral en celular diga
"Menú" (texto, más fácil de reconocer para alguien que entra por
primera vez que un ícono solo) al abrir la página, y que se vuelva las
"3 barritas" (☰ solo) apenas se empieza a bajar.

`.mobile-menu-btn` pasó de círculo fijo de 44px con `☰` a una píldora
(`<span class="mmb-icono">☰</span><span class="mmb-texto">Menú</span>`,
`width: auto`, `padding: 0 18px`) que se encoge a los mismos 44px de
círculo con la clase `.compacta` (`width: 44px; padding: 0`, oculta
`.mmb-texto`). `actualizarBotonMenu()` (JS nuevo) decide cuándo aplicar
`.compacta` — `window.scrollY > UMBRAL_SCROLL_MENU` (24px, un margen
chico para no reaccionar al primer pixel) **o** el panel ya está
abierto (`abrirSidebar()`/`cerrarSidebar()` ahora llaman a esta función
en vez de escribir `.textContent` directo) — cuando está abierto se
queda compacto con `✕` sin importar el scroll, mismo comportamiento de
siempre solo que ahora pasa por un solo lugar. Un listener de `scroll`
en `window` (`{ passive: true }`) la llama en cada scroll.

No hizo falta tocar `mostrarVista()`: ya llamaba `cerrarSidebar()` +
`window.scrollTo({top:0})` en cada cambio de vista — el scroll a 0
dispara el listener y el botón vuelve solo a la píldora "Menú" al
llegar arriba, sin ningún cambio adicional.

Probado en el preview, celular (375px): arranca en píldora "☰ Menú";
al bajar 5 “ticks” de scroll se encoge a círculo con ☰ solo; abrirlo
muestra ✕ compacto con el panel de siempre; tocar "Maquila" cierra el
panel, navega, y el botón vuelve a la píldora "Menú" porque la vista
nueva arranca en scroll 0. Sin errores de consola.

## Ícono de pantalla de inicio de la página pública — el logo solo, sin el armadillo (2026-09-29)

Pedido del usuario, mandando el logo de "Café Pandora" en limpio (el
letrero negro, sin el armadillo): que al anclar `gestion/index.html`
(la app interna) a la pantalla de inicio del celular el ícono SIGA
siendo el armadillo (ya lo era, sin cambios — ver la sección de arriba,
"Manifest para 'Añadir a pantalla de inicio' de la app interna"), y que
al anclar `index.html` (la página pública, "pedidos") el ícono sea ESE
logo — el letrero solo, sin el armadillo. Mismo patrón que ya se había
dejado pendiente en esa sección de arriba, aplicado ahora acá.

**El logo real es un letrero ancho (1920×616 px), no sirve tal cual
como ícono cuadrado** — un ícono de pantalla de inicio necesita ser
cuadrado y con fondo opaco (iOS rellena de negro cualquier zona
transparente, se vería mal con el logo suelto sobre nada). Se generó un
ícono cuadrado nuevo con Python/Pillow (`icon-180.png`/`icon-512.png`,
en la raíz del repo): el logo recortado a su tamaño real (sin el margen
transparente que traía el archivo original) centrado sobre un cuadrado
de `--crema` (`#FCFAF3`, el mismo fondo de toda la página pública), a
~74% del ancho del cuadrado — suficiente margen para que no se sienta
apretado, sobre todo a 180px donde el ícono se ve chico en la pantalla
de inicio.

**Mismas 2 piezas que ya usa `gestion/manifest.json`, aplicadas a la
página pública**:
- `manifest.json` nuevo en la raíz (`start_url`/`scope: "/"`, `name`/
  `short_name: "Café Pandora"`, apunta a `/icon-180.png`/`/icon-512.png`)
  — para que "Añadir a pantalla de inicio" en Android también abra sin
  la barra del navegador.
- En `index.html`, 3 `apple-mobile-web-app-*` + `theme-color` +
  `<link rel="apple-touch-icon">` (el PNG de 180px embebido en base64,
  igual que hace `gestion/index.html` con el armadillo — así no
  depende de una petición aparte para que iOS lo encuentre) +
  `<link rel="manifest">` — todo agregado justo después de los `<link>`
  de Google Fonts, antes del `<link rel="icon">` (el favicon de la
  pestaña, que SIGUE siendo el armadillo, sin tocar — ver el punto
  siguiente).

**El favicon de la pestaña del navegador NO cambió, a propósito** — el
usuario pidió específicamente el ícono de "anclar a la pantalla", no el
de la pestaña; `<link rel="icon">` se queda con el armadillo de
siempre, igual que `gestion/index.html`. Los dos íconos (pestaña vs.
pantalla de inicio) ahora son intencionalmente distintos en la página
pública — no es una inconsistencia, es lo que se pidió.

Probado en el preview local: `/manifest.json` responde 200 con el JSON
esperado, `/icon-180.png` carga (180×180), y la página pública sigue
renderizando sin errores de consola con los `<link>`/`<meta>` nuevos en
el `<head>`. Igual que con el manifest de la app interna, no se pudo
probar el comportamiento real de "Añadir a pantalla de inicio" (necesita
un dispositivo físico) — se basa en cómo iOS/Android documentan estas
etiquetas.

## Fotos reales comprimidas + el bug real de por qué no cargaban en "algunas pestañas" (2026-09-29)

Juan reportó: "no están cargando las imágenes de la página de pedidos
en algunas de las pestañas" y pidió comprimirlas para que pesen menos
sin perder calidad. Las dos cosas eran ciertas y, revisando, la primera
tenía una causa concreta — no era solo "van lentas".

**El bug real**: `pintarHeroArte()` pintaba la foto de la finca
(`finca-flor.jpg`, en "Conócenos") de una, al cargar la página, con
`loading="lazy"` del navegador para no gastar esos KB en alguien que
nunca visita esa pestaña. El problema: ese `<img>` nacía DENTRO de
`#vistaConocenos`, que empieza en `display:none` hasta que se toca el
link — un elemento sin caja de layout (por vivir en un contenedor
`display:none`) no tiene una distancia calculable al viewport, así que
varios navegadores de celular (sobre todo Safari/iOS) nunca disparaban
la carga de esa imagen, ni siquiera después de mostrar la vista más
tarde. Era la ÚNICA imagen de todo el archivo con `loading="lazy"` —
las demás (Maquila, Proceso) son `<img>` fijos en el HTML de siempre,
sin este problema, así que el síntoma real era "en la pestaña Conócenos
específicamente, a veces".

**Arreglo, no un parche**: se quitó el `loading="lazy"` del navegador y
se reemplazó por el mismo patrón que ya usan `cargarBlog()`/
`cargarMerch()` — un flag (`conocenosArteCargada`) + una función
(`cargarConocenosArte()`) que arma el `<img>` recién la PRIMERA VEZ que
se muestra "Conócenos" (llamada desde `mostrarVista()`, junto a las
otras dos). Como para ese momento `#vistaConocenos` ya está
`display:''` (visible), no hay ningún contenedor oculto de por medio
cuando el navegador recibe el `<img>` — se carga siempre, sin depender
de que el lazy-loading nativo acierte. `pintarHeroArte()` se quedó solo
con el logo del encabezado (`#heroLogo`), que sí vive en una vista
visible desde el principio y nunca tuvo este problema.

**Compresión real, las 6 fotos** (`img/*.jpg`) — Pillow, no algo
manual: cada una se reescaló al ancho máximo que de verdad ocupa en
pantalla (revisando el CSS: `.conocenos-arte`/`.maquila-foto`/
`.proceso-foto` tienen su propio `max-width`), a 2.5-3× ese ancho para
verse nítidas en pantallas retina sin cargar más resolución de la que
un navegador va a mostrar nunca, más recompresión JPEG progresiva
(calidad 78-82, suficiente para foto real sin artefactos visibles —
revisado a ojo antes de aplicar). De paso, `ImageOps.exif_transpose()`
antes de guardar (respeta la rotación real de cada foto de celular) y
se descarta el EXIF al reguardar (menos peso, y de paso ya no queda
metadata como ubicación GPS en los archivos servidos). Antes/después:

| Archivo | Antes | Después |
|---|---|---|
| finca-flor.jpg | 436 KB | 278 KB |
| finca-ladera.jpg | 389 KB | 241 KB |
| maquila-tostadora.jpg | 315 KB | 152 KB |
| proceso-cereza.jpg | 211 KB | 92 KB |
| proceso-secado.jpg | 176 KB | 115 KB |
| proceso-secado-honey.jpg | 339 KB | 48 KB |

Total: 1.87 MB → 926 KB (~50% menos), sin ningún cambio visible a ojo
en el sitio real. `proceso-secado-honey.jpg` fue el caso más extremo —
1600 px de ancho de archivo real para un espacio de apenas ~135 px en
pantalla (la mitad de `.proceso-fotos-par`, 280px), así que casi toda
esa resolución nunca se llegaba a ver.

Probado en el preview local: "Conócenos" cargada DIRECTO por URL
(`/conocenos`, el caso más parecido al bug real — sin pasar por
navegación interna) muestra la foto de la finca sin problema; Maquila y
los pasos de Proceso (Cereza, Lavado/Honey secado en par) se ven nítidos
con las fotos ya comprimidas; sin errores de consola en ningún
recorrido.

## "Así se pide" en 2×2 en vez de 4 filas (2026-09-29)

Pedido del usuario: acortar el espacio que ocupa la guía antes de
llegar a la bolsa/catálogo, apenas se entra a la página. `.guia-pasos`
pasó de `display:flex; flex-direction:column` (los 4 pasos, uno debajo
del otro) a `display:grid; grid-template-columns:1fr 1fr` — los mismos
4 pasos, ahora en 2 filas de 2 en vez de 4 filas de 1, la mitad de
alto. El comentario viejo que justificaba "todos visibles de una, sin
scroll horizontal" (2026-09-22, el motivo por el que se había dejado
en columna) se actualizó — la cuadrícula sigue mostrando los 4 a la
vez, sin scroll, así que la razón original de ese cambio sigue
cumpliéndose, no se está revirtiendo. En celular angosto (375px), los
textos más largos ("Cantidad y molienda", "Confirma por WhatsApp")
bajan a 2 líneas dentro de su celda — se ve prolijo igual, y aun así el
bloque completo queda más bajo que las 4 filas de antes.

Probado en el preview, escritorio y celular (375px): los 4 pasos se
ven en cuadrícula 2×2, alineados, sin desbordar; sin errores de
consola.

## "Café Pandora" en la barra lateral, ahora clickeable (reemplaza a "Conócenos") (2026-09-29)

El usuario reportó: "hasta yo me confundí y traté de darle clic ya un
par de veces" — "Café Pandora" (el encabezado de la barra lateral,
`.sidebar-marca`) era solo texto, sin `href` ni `onclick`, pero un
nombre de marca destacado arriba de un menú se lee como un link en
casi cualquier sitio. Dio 2 opciones: hacerlo clickeable (y que
reemplace a "Conócenos", quitando ese link de la lista) o poner el
logo ahí para que se sienta menos interactivo. Se eligió la primera —
un logo/wordmark en un encabezado de marca es, si acaso, TODAVÍA más
esperable que sea clickeable que texto plano (el patrón "clic en el
logo" es universal en la web), así que solo cambiar texto por imagen no
iba a resolver la confusión real; hacerlo funcionar sí.

`<a href="/conocenos" id="navConocenosLink" onclick="mostrarVista(...)">`
se movió de `.sidebar-nav` (la lista de abajo) a `.sidebar-marca` (el
encabezado) — mismo `id`, así que `LINK_ID_POR_VISTA` no necesitó
ningún cambio, solo el HTML. La lista de abajo quedó con 3 links
(Catálogo, Maquila, Blog) en vez de 4. `.sidebar-marca a` es un estilo
nuevo, más sobrio que `.sidebar-nav a.activo` (que pinta todo el fondo
teal) — acá solo el TEXTO cambia a teal cuando está activo/en hover, sin
fondo, para que se siga sintiendo como un encabezado de marca y no como
un ítem más de la lista. El selector que limpia `.activo` en
`mostrarVista()` pasó de `'.sidebar-nav a'` a `'.sidebar-nav a,
.sidebar-marca a'` para cubrir el link que se movió.

Probado en el preview, escritorio y celular (panel abierto): tocar
"Café Pandora" navega a `/conocenos`, pinta su contenido, y el texto se
pone teal (activo); la lista de abajo solo tiene 3 links; en celular el
panel se cierra igual al tocarlo, mismo comportamiento de siempre. Sin
errores de consola.

## Auditoría de "código basura" en `index.html` (2026-09-29)

Pedido del usuario, después de la seguidilla de cambios de este mismo
día. Revisado a fondo, no a ojo: cada función declarada (`function`/
`async function`) contra sus llamadas reales, cada `let`/`const` de
nivel superior contra sus usos, cada `onclick`/`onchange`/etc. contra
que la función que invoca exista de verdad, cada clase CSS contra si
aparece en algún `class="..."` (HTML o plantillas de JS), y balance de
`{}`/`[]`/`()` de todo el `<script>`. Resultado: **ninguna función,
variable o clase CSS sin usar** en el código de este archivo — cada una
tiene al menos un uso real más allá de su propia declaración.

**Sí se encontraron 4 `id` sin ningún uso**, los 4 de bajo riesgo
(nunca tocados por JS ni CSS, solo ocupaban espacio en el HTML) — se
quitaron:
- `id="mainContent"` en `.main-content` — se agregó al construir la
  barra lateral (2026-09-28) por costumbre, junto a otros ids que sí se
  usan (`sidebarPublica`, `sidebarOverlay`), pero nunca hizo falta
  referenciarlo — el contenedor ya se controla por su clase.
- `id="datoDuro"`, `id="procesoSeccion"`, `id="tourFinca"` en sus
  respectivas `<section>` — eran los destinos de las anclas
  (`href="#datoDuro"` etc.) de la barra de arriba vieja
  (`.nav-secciones`), que se reemplazó por la barra lateral el
  2026-09-28. Al quitar esa barra se quitaron también sus links, pero
  estos 3 `id` de destino se quedaron sin que nada los apuntara ya —
  vestigio de ese cambio, no de este archivo original.

**Encontrado pero NO tocado, por ser una decisión ya documentada
antes de esta sesión**: `.tarjeta-bolsa` (el fondo degradado "kraft" +
sus overrides de color, ver el CSS cerca de `.card-lote`) no lo usa
ningún template — pero CLAUDE.md ya lo explicaba en la sección
"Rediseño de lujo de pedidos/index.html": se dejó a propósito "por si
se necesita para un lote nuevo algún día" cuando se reemplazó por
`.tarjeta-bolsa-clara` en las 3 bolsas actuales. No se borró — es una
decisión ya tomada, no un descuido de esta sesión; si el usuario
prefiere quitarlo definitivamente, es un cambio aparte.

Probado en el preview después de quitar los 4 `id`: Catálogo, Maquila,
Conócenos (con "Café Pandora" resaltando en teal, sin depender de
`id="datoDuro"` para nada) y Blog cargan igual que antes; sin errores
de consola.

## "Tipo de cliente" ahora se puede corregir al editar una venta (2026-09-29)

Juan: *"cuando un cliente es distribuidor quiero que se pueda descontar
una a una lo que va pagando, como Andrés Mall, porque Carlos Maya
sucede lo mismo pero no puedo hacerlo aún"*. El stepper "Pagado X de Y"
(ver "Pagos parciales de Distribuidores, paquete por paquete" más
arriba) ya existía y ya funciona — solo se ve cuando
`tipoCliente === 'Distribuidor'`. El problema real, confirmado con
Juan antes de tocar código: la venta de Carlos Maya no quedó marcada
como Distribuidor al registrarla, y **`abrirEdicionVenta()` nunca tuvo
un campo para corregir "Tipo de cliente"** una vez guardada la venta —
`editTipoCliente` se leía de `v.tipoCliente` al abrir el modal pero
nunca se podía reasignar. Sin poder corregir el dato, el stepper se
quedaba escondido para siempre en cualquier venta mal clasificada al
registrarla.

**El backend YA soportaba esto** — `functions/api/ventas/[id].ts`
(`onRequestPatch`) ya tenía `if (body.tipoCliente !== undefined)
updates.tipo_cliente = body.tipoCliente;` desde antes, sin usarse nunca
desde el frontend de edición. Por eso el arreglo fue 100% de
`gestion/index.html`, sin ninguna migración ni cambio de backend:

- `abrirEdicionVenta()` ganó un `<select id="em-tipo-cliente">` (mismas
  4 opciones de `TIPOS_CLIENTE`) arriba del todo, antes de "Agregar
  línea" — con una nota aclarando que corregirlo NO cambia el valor de
  las líneas ya guardadas (esto es corregir una etiqueta, no
  renegociar precios ya cobrados).
- `cambiarTipoClienteEdicion()` (nueva) actualiza `editTipoCliente` y
  llama a `pintarEdicionCarrito()` (para que el stepper aparezca/
  desaparezca al toque en cada línea de café ya guardada) y a
  `recalcularEmLinea()` (para que "Valor de esta línea", si ya se había
  elegido lote/presentación para una línea nueva, se recalcule con la
  tarifa del tier correcto).
- `guardarEdicionVenta()` suma `tipoCliente: editTipoCliente` al
  `PATCH` que ya mandaba — una línea.

Probado en el preview (con un cliente de prueba registrado como
"Cliente normal", simulando el caso real de Carlos Maya): abrir su
venta, cambiar "Tipo de cliente" a Distribuidor hace aparecer el
stepper "Pagado 0 de 2" en su línea de café al instante, y recalcula el
precio sugerido de la tarifa (confirmado que baja al precio de
Distribuidor); tocar "+" sube a "Pagado 1 de 2" correctamente. El mock
de preview no persiste ediciones de ventas (limitación conocida del
harness de pruebas, no del código real — ver el patrón ya documentado
para otros PATCH de este mismo mock), así que la confirmación final de
que se guarda bien se hizo interceptando `window.fetch` para capturar
el `PATCH` real antes de que saliera: llegó con
`"tipoCliente":"Distribuidor"` en el cuerpo, exactamente lo que espera
el backend real. Sin errores de consola.

## "Por pagar" de Ventas, separado en Clientes normales / Distribuidores (2026-09-29)

Pedido de Juan, el mismo día que se arregló lo de Carlos Maya arriba:
"para encontrar fácil los clientes distribuidores" dentro de "Por
pagar" — tiene sentido justo después de ese arreglo, porque los
Distribuidores son los que van pagando de a poco (el stepper "Pagado X
de Y") y conviene poder revisarlos aparte del resto sin leer fila por
fila.

`renderVentas()` ahora, SOLO cuando `ventasSubTab === 'porPagar'`,
separa `porPagarDelMes` en dos listas — `porPagarDistribuidores`
(`tipoCliente === 'Distribuidor'`) y `porPagarNormales` (todo lo
demás: Cliente normal, Mayorista e Interno juntos, tal como lo pidió
Juan — "clientes normales" en el sentido amplio, no solo el tier
literal "Cliente normal") — y pinta una segunda fila de `.subtabs`
(mismo estilo rectangular de siempre, sin pills — ver el gotcha ya
documentado sobre `.subtabs`) debajo de la primera, con su propio
estado (`ventasPorPagarSubTab`, `cambiarVentasPorPagarSubTab()`) y su
propia paginación (`ventasPorPagarNormales`/`ventasPorPagarDistribuidores`,
pre-declaradas en `paginas` — el gotcha de siempre de `paginar()`).
"Por enviar" y "Pagadas" no se tocaron — la sub-pestaña nueva solo
aparece dentro de "Por pagar".

`cambiarVentasPorPagarSubTab()` usa `conservarScroll()` (a diferencia
de `cambiarVentasSubTab()`, la de arriba, que no lo usaba — inconsistencia
preexistente que no se tocó, fuera de alcance de este pedido) para no
perder la posición del scroll al alternar entre las dos.

Probado en el preview (con una venta de prueba "Por pagar" de un
Distribuidor, ya que el mock no traía ninguna combinación así):
"Por pagar" muestra "Clientes normales (0)" / "Distribuidores (1)";
tocar "Distribuidores" lista la venta con su "1 de 3 paquetes pagados";
tocar "Clientes normales" muestra "Sin clientes normales por pagar
este mes."; "Por enviar" y "Pagadas" siguen sin la sub-pestaña nueva.
Sin errores de consola nuevos (los 404 de `xlsx-lite.js` que aparecen
son del respaldo automático del mock, ya documentados, sin relación
con este cambio).

## Barra lateral de pedidos, fondo teal en vez de crema (2026-09-29)

Pedido del usuario: "el menú... en vez de blanco en azul o verde que
hemos usado para la marca, para que sea más vistoso". `.sidebar-publica`
pasó de `background: var(--crema-alt)` a `background: var(--teal)` — el
teal ya era, por lejos, el color de marca más usado en todo el sitio
(botones, títulos de sección, el fondo del ítem activo de la barra
misma), así que esto es más una extensión natural que un color nuevo.

Con el fondo oscuro, todo el texto de adentro (`.sidebar-marca a`,
`.sidebar-nav a`, `.sidebar-footer a`) pasó de `var(--cafe)` (café
oscuro, pensado para fondo claro) a `var(--crema)` (claro). El
"elegido/activo" de cada link ya no se puede seguir marcando con fondo
teal sólido (se perdía contra el fondo teal de toda la barra) — se
cambió a **dorado**, el otro acento de marca, el mismo que ya usan los
`peso-pill`/`molienda-btn` elegidos en el catálogo para decir "esto es
lo que está seleccionado" — mismo lenguaje visual reusado, no inventado
de cero. El hover de los ítems no-activos pasó de `var(--linea)` (un
gris casi invisible sobre teal) a un blanco translúcido
(`rgba(252,250,243,.14)`).

Probado en el preview, escritorio y celular (panel abierto): la barra
se ve teal con texto claro en las 4 vistas (Catálogo/Maquila/Conócenos/
Blog), el ítem activo se resalta en dorado con texto oscuro, y "Café
Pandora" (el link del encabezado) también pasa a dorado cuando
Conócenos está activo. Sin errores de consola.
