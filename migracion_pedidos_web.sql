-- Ejecuta esto en el SQL Editor de Supabase. Es la bandeja de entrada de
-- pedidos que hagan tus clientes desde la página pública — no toca ninguna
-- de tus tablas actuales. Tú decides desde la app interna si un pedido se
-- convierte en una venta de verdad.

CREATE TABLE "pedidos_web" (
	"id" serial PRIMARY KEY,
	"nombre_cliente" text NOT NULL,
	"telefono" text,
	"items" jsonb NOT NULL DEFAULT '[]',   -- [{lote, presentacion, cantidad, valor}]
	"valor_total" integer NOT NULL DEFAULT 0,
	"notas" text,
	"estado" text NOT NULL DEFAULT 'nuevo', -- nuevo | visto | convertido | descartado
	"ts" bigint NOT NULL
);
