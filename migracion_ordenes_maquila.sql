-- Ejecuta esto en el SQL Editor de Supabase. Crea la tabla de órdenes de
-- maquila, separada de ventas (maquila es un servicio sobre café del
-- cliente, no un producto de tu inventario, así que no toca stock).

CREATE TABLE "ordenes_maquila" (
	"id" serial PRIMARY KEY,
	"cliente" text NOT NULL,
	"usuario" text,
	"items" jsonb NOT NULL DEFAULT '[]',  -- [{servicio, presentacion, cantidad, valor}]
	"valor" integer NOT NULL DEFAULT 0,
	"estado" text NOT NULL DEFAULT 'Pendiente',
	"metodo" text DEFAULT '',
	"ts" bigint NOT NULL
);
