# Café Pandora — con Supabase + Cloudflare Pages

## Qué es esto
- `index.html` + `xlsx-lite.js`: la app completa (Ventas, Inventario Tostado,
  Gastos, Finca & Café, Resumen, Configuración). No la toques, no necesita
  ningún cambio para conectar con Supabase.
- `functions/`: el backend. Corre en Cloudflare, nunca en el navegador. Es lo
  único que conoce la clave secreta de Supabase.
- `migration.sql`: crea las 6 tablas.
- `datos_historicos.sql`: carga tus ventas y gastos antiguos de Netlify.

## Paso 1 — Crear el proyecto en Supabase
1. Entra a **https://supabase.com**, crea una cuenta gratis (con GitHub es
   más rápido) y dale "New project".
2. Ponle un nombre (ej. cafe-pandora), elige una contraseña para la base de
   datos (guárdala, aunque no la vas a necesitar en este flujo) y la región
   más cercana. Dale "Create new project" — tarda 1-2 minutos en aprovisionar.

## Paso 2 — Crear las tablas
1. En el menú izquierdo, entra a **"SQL Editor"** → **"New query"**.
2. Abre `migration.sql`, copia TODO su contenido, pégalo ahí, y dale **"Run"**.
   Deja creadas las 6 tablas con los lotes y tarifas de maquila en $0.
3. Borra el contenido de la caja (Ctrl+A y borrar), pega ahora TODO
   `datos_historicos.sql`, y dale "Run" otra vez — carga tus 17 gastos y
   37 ventas antiguas.

## Paso 3 — Copiar las claves de conexión
1. En el menú izquierdo, entra a **"Project Settings"** (ícono de engranaje)
   → **"API"**.
2. Vas a ver dos datos que necesitas copiar y guardar por ahora en un Bloc
   de notas:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **service_role key** (en la sección "Project API keys" — es la clave
     larga marcada como "secret", NO la "anon public"). Dale clic a "Reveal"
     y cópiala completa.

⚠️ La `service_role key` da acceso total a la base de datos — solo la vas a
pegar en Cloudflare (paso 5), nunca en ningún otro lado, nunca en el código
del navegador.

## Paso 4 — Subir el proyecto a GitHub
1. Entra a **github.com**, crea un repositorio nuevo (puede ser privado), sin
   marcar "Add a README".
2. Descomprime el zip que te compartí. Entra a la carpeta `cafe-pandora-cf`,
   selecciona TODO lo que hay adentro (no la carpeta misma) — `index.html`,
   `package.json`, `migration.sql`, `datos_historicos.sql`, `xlsx-lite.js`,
   y las carpetas `functions/` — y arrástralo con "Add file" → "Upload files"
   a la raíz del repositorio. Confirma con "Commit changes".
3. Verifica que `index.html` quede LISTADO DIRECTO en la raíz del repo, no
   dentro de ninguna carpeta.

## Paso 5 — Crear el sitio en Cloudflare Pages
1. Entra a **dash.cloudflare.com**, crea una cuenta gratis.
2. Ve a **"Workers & Pages"** → **"Create"**. Si te da a elegir entre
   "Workers" y "Pages", entra a **Pages** → **"Connect to Git"**.
3. Autoriza GitHub y elige tu repositorio.
4. En "Build settings": Framework preset **None**, Build command **vacío**,
   Build output directory: **/**
5. Antes de darle a "Save and Deploy", busca **"Environment variables"**
   (puede estar bajo "Advanced") y agrega DOS variables:
   - `SUPABASE_URL` → pega el Project URL del paso 3
   - `SUPABASE_SERVICE_ROLE_KEY` → pega la service_role key del paso 3
6. Dale **"Save and Deploy"**. Espera 1-2 minutos.

## Paso 6 — Probar
Abre la URL `.pages.dev` que te da Cloudflare en los 3 celulares, mete la
clave `pandora2026`, y deberías ver ya cargado todo tu histórico. Cualquier
cosa que registre cualquiera de los tres se ve al instante (o al refrescar)
en los otros dos — todo vive en la misma base de datos de Supabase.

## Costos
- Cloudflare Pages: $0, para siempre, sin límite de visitas.
- Supabase: $0 en el plan gratis (500 MB de base de datos, de sobra para
  años de este negocio). Ojo: si el proyecto queda 1 semana sin ninguna
  actividad, Supabase lo pausa automáticamente en el plan gratis — basta con
  entrar al dashboard y darle "Restore" para reactivarlo, no se pierde nada.
- Dominio propio (opcional): ~USD 10-11/año en Cloudflare Registrar.
- Nada de esto consume créditos de Claude — eso solo se gasta cuando hablas
  conmigo para seguir mejorando la app.

## Cosas para tener en cuenta
- La clave de acceso (`pandora2026`) es un filtro liviano, no seguridad real
  — la seguridad de verdad está en que solo el backend conoce la
  service_role key de Supabase.
- Los precios de café por lote (`PRECIOS_LOTE` dentro de `index.html`) son
  valores de referencia — ajústalos a los tuyos.
- Editar una venta ya guardada (cambiar lote/cantidad) no reajusta el
  inventario solo, para evitar descuadres — corrige el stock a mano desde
  Inventario Tostado si te equivocaste.
