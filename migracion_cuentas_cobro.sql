-- Ejecuta esto en el SQL Editor de Supabase.

-- El NIT o cédula queda guardado por cliente, para no tener que volver a
-- escribirlo cada vez que le generas una cuenta de cobro.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nit_cedula text;

-- Historial de cuentas de cobro emitidas — con numeración consecutiva (el
-- propio id de la fila) para que cada una tenga su "# de factura" único.
CREATE TABLE "cuentas_cobro" (
	"id" serial PRIMARY KEY,
	"cliente" text NOT NULL,
	"cliente_nit" text,
	"items" jsonb NOT NULL DEFAULT '[]',  -- [{descripcion, presentacion, cantidad, valorUnitario, valorTotal}]
	"otros" integer NOT NULL DEFAULT 0,
	"total" integer NOT NULL DEFAULT 0,
	"venta_id" integer,
	"usuario" text,
	"ts" bigint NOT NULL
);
