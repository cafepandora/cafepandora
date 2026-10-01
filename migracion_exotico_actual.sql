-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Exótico actual (2026-10-01) — la edición especial que se ofrece en el
-- catálogo público (sección "✨ Ediciones especiales de cafés exóticos")
-- va rotando: cada vez que sale una variedad nueva, Juan necesita poder
-- cambiar la foto de la etiqueta y las unidades disponibles él mismo,
-- desde la app interna, sin pedírselo a Claude cada vez. Una sola fila
-- (id fijo 1, se sobreescribe con upsert, no hay histórico) — mismo
-- patrón que costos_margen.
CREATE TABLE IF NOT EXISTS "exotico_actual" (
	"id" smallint PRIMARY KEY DEFAULT 1,
	"variedad" text,
	"descripcion" text,
	"imagen" text,
	"stock" integer NOT NULL DEFAULT 0,
	"ts" bigint
);
