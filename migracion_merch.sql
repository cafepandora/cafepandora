-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Merch (2026-09-28) — pocillos, camisetas, busos, etc. Mismo patrón que
-- blog_posts: "estado" arranca en 'Borrador'; el endpoint público
-- (GET /api/merch-publico) solo muestra 'Publicado'. La pestaña "Merch"
-- de la app interna ve TODO, para ir armando el catálogo con calma.
--
-- La SECCIÓN completa (no solo cada producto) todavía no tiene link en
-- la barra de navegación de la página pública — Juan pidió que "aún no
-- se vea públicamente" mientras arma el catálogo. La página en
-- /merch YA funciona si se entra directo a esa URL (para que Juan la
-- pueda revisar), pero nadie la encuentra navegando — no está enlazada
-- desde ningún lado todavía. Cuando esté listo para lanzarla, avisar
-- para agregar el link — no hace falta ninguna migración nueva para eso.
CREATE TABLE IF NOT EXISTS "merch_productos" (
	"id" bigserial PRIMARY KEY,
	"nombre" text NOT NULL,
	"categoria" text NOT NULL,
	"precio" numeric NOT NULL DEFAULT 0,
	"descripcion" text,
	"imagen" text,
	"estado" text NOT NULL DEFAULT 'Borrador',
	"creado_por" text,
	"ts" bigint NOT NULL
);
