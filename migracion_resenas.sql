-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Reseñas con estrellas (2026-09-29) — bajo cada producto del catálogo
-- público (Lavado, Honey, Natural) cualquier cliente puede dejar una
-- calificación de 1 a 5 estrellas + un comentario opcional, sin login
-- (mismo espíritu que pedidos_web: público, sin clave). GET/POST son
-- ambos públicos en /api/resenas-publico — a diferencia de blog/merch,
-- acá NO hay "estado Borrador/Publicado" ni pantalla de moderación: la
-- reseña se ve de inmediato apenas se publica (retroalimentación
-- inmediata es parte de que sea "cómoda" para dejarla), tal como se
-- comportan la mayoría de sitios de reseñas reales.
CREATE TABLE IF NOT EXISTS "resenas" (
	"id" bigserial PRIMARY KEY,
	"lote" text NOT NULL,
	"nombre" text,
	"calificacion" smallint NOT NULL CHECK ("calificacion" BETWEEN 1 AND 5),
	"comentario" text,
	"ts" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "resenas_lote_idx" ON "resenas" ("lote");
