-- Ejecuta esto en el SQL Editor de Supabase.
-- Agrega "quién recibió" (ventas, órdenes de maquila) y "quién pagó" (gastos,
-- finca) para poder armar el balance de cuentas por persona. También crea la
-- tabla de compras de cereza a terceros (con su propio flujo de secado y
-- trilla, igual que las cosechas propias, para que esos kilos también
-- cuenten en los rendimientos reales).

ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "recibido_por" text;
ALTER TABLE "ordenes_maquila" ADD COLUMN IF NOT EXISTS "recibido_por" text;
ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "pagado_por" text;
ALTER TABLE "finca" ADD COLUMN IF NOT EXISTS "pagado_por" text;

CREATE TABLE IF NOT EXISTS "compras_cereza" (
  "id" serial PRIMARY KEY,
  "fecha" bigint NOT NULL,
  "proveedor" text,
  "kilos_cereza" numeric NOT NULL DEFAULT 0,
  "proceso" text NOT NULL,
  "costo" numeric NOT NULL DEFAULT 0,
  "pagado_por" text,
  "kilos_pergamino_real" numeric,
  "kilos_verde_real" numeric,
  "notas" text,
  "usuario" text,
  "ts" bigint NOT NULL
);
