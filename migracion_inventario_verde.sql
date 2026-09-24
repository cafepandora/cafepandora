-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Inventario de café verde por malla, y de pergamino disponible antes de
-- trillar — para que el stock que ya tenían (pergamino de antes de usar
-- la app, que hoy mandan a trillar y seleccionar) quede contemplado, y
-- para poder "retirar" cierta cantidad de un grado para tostión y que se
-- descuente solo. Mismo patrón que ya usa "inventario" (café tostado):
-- una tabla con el saldo actual + una función SQL que lo ajusta en una
-- sola operación atómica, nunca un UPDATE directo desde la app.

CREATE TABLE IF NOT EXISTS "inventario_pergamino" (
  "lote" text PRIMARY KEY,
  "kilos" numeric NOT NULL DEFAULT 0
);
INSERT INTO "inventario_pergamino" ("lote", "kilos")
  VALUES ('Lavado', 0), ('Honey', 0), ('Natural', 0), ('Exotico', 0)
  ON CONFLICT ("lote") DO NOTHING;

CREATE OR REPLACE FUNCTION ajustar_stock_pergamino(p_lote text, p_delta double precision)
RETURNS void AS $$
BEGIN
  UPDATE inventario_pergamino
  SET kilos = kilos + p_delta
  WHERE lote = p_lote;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS "inventario_verde" (
  "lote" text NOT NULL,
  "grado" text NOT NULL,
  "kilos" numeric NOT NULL DEFAULT 0,
  PRIMARY KEY ("lote", "grado")
);
INSERT INTO "inventario_verde" ("lote", "grado")
  SELECT l.lote, g.grado
  FROM (VALUES ('Lavado'), ('Honey'), ('Natural'), ('Exotico')) AS l(lote),
       (VALUES ('Malla 18'), ('Malla 16'), ('Malla 14'), ('Aprovechable'), ('Pasilla')) AS g(grado)
  ON CONFLICT ("lote", "grado") DO NOTHING;

CREATE OR REPLACE FUNCTION ajustar_stock_verde(p_lote text, p_grado text, p_delta double precision)
RETURNS void AS $$
BEGIN
  UPDATE inventario_verde
  SET kilos = kilos + p_delta
  WHERE lote = p_lote AND grado = p_grado;
END;
$$ LANGUAGE plpgsql;

-- El desglose por malla que produjo la trilla de ESTE registro — para
-- poder revertirlo con precisión si el registro se borra (sin esto, solo
-- se sabría el total, no cuánto de cada malla, y borrar dejaría el
-- inventario de verde descuadrado).
ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "verde_grados" jsonb;
ALTER TABLE "compras_cereza" ADD COLUMN IF NOT EXISTS "verde_grados" jsonb;
ALTER TABLE "compras_pergamino" ADD COLUMN IF NOT EXISTS "verde_grados" jsonb;

-- Qué malla se retiró del inventario de verde para este tueste (nulo si
-- el tueste se registró "a mano", sin pasar por el inventario).
ALTER TABLE "lotes_tueste" ADD COLUMN IF NOT EXISTS "grado" text;
