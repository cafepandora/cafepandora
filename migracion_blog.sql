-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Blog de Café Pandora (2026-09-28) — Juan pidió una sección de blog en
-- la página de pedidos, autoadministrable desde la app interna (nueva
-- pestaña "Blog"): escribe el artículo, opcionalmente le pone una foto
-- de portada, y lo deja en "Borrador" hasta que decide publicarlo.
--
-- "imagen" guarda la foto YA achicada/comprimida en el navegador (canvas,
-- ver subirImagenBlog() en index.html) como data URL base64 — mismo
-- espíritu simple que el resto de la app (sin build, sin servicio externo
-- de almacenamiento de imágenes), y el tamaño ya viene acotado desde el
-- cliente antes de llegar aquí, así que no infla la tabla sin control.
--
-- "estado" empieza en 'Borrador' — la página pública
-- (GET /api/blog-publico) solo muestra los que estén en 'Publicado'.
CREATE TABLE IF NOT EXISTS "blog_posts" (
	"id" bigserial PRIMARY KEY,
	"titulo" text NOT NULL,
	"extracto" text,
	"contenido" text NOT NULL,
	"imagen" text,
	"autor" text,
	"estado" text NOT NULL DEFAULT 'Borrador',
	"creado_por" text,
	"ts" bigint NOT NULL
);
