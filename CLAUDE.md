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

`_headers` en la raíz le dice a Cloudflare Pages que sirva todo con
`Cache-Control: no-cache` — Juan reportó que después de un redeploy el
navegador seguía mostrando la versión vieja (típico sin esto: como es
puro HTML estático sin build ni hash en el nombre del archivo, el
navegador lo cachea agresivo por defecto). Con `no-cache` el navegador
siempre revalida con el servidor antes de usar una copia guardada, así
que cada redeploy se ve de inmediato sin necesitar hard-refresh.

**"Sin conexión (viendo caché)" no siempre es de verdad falta de
conexión**: `sincronizar()` (en `index.html`) llama los ~14 endpoints en
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
functions/api/cron/precio-fnc.ts   # scrape del precio de referencia FNC — la llama un cron externo, no la app
functions/api/precio-fnc/          # GET del historial de precio de referencia (con login)
functions/api/saldos-iniciales/    # saldo inicial por persona, para el balance de cuentas
functions/api/inventario-pergamino/ # pergamino disponible por lote, antes de trillar
functions/api/inventario-verde/    # café verde disponible por lote × malla, después de trillar
functions/api/movimientos-inventario/ # historial de entradas/salidas de pergamino/verde, con origen
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

## Pendiente / a medias

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
