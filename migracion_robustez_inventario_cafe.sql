-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Corrige un bug real reportado por Juan (2026-09-25): pergamino agregado
-- con "+ Agregar pergamino que ya tenías" y luego trillado con
-- "🌾 Trillar pergamino disponible" desaparecía — no llegaba a
-- "Café verde disponible" ni quedaba disponible para tostión.
--
-- Causa raíz: `ajustar_stock_pergamino`/`ajustar_stock_verde` (creadas en
-- migracion_inventario_verde.sql) hacían un UPDATE puro:
--   UPDATE inventario_verde SET kilos = kilos + p_delta WHERE lote = p_lote AND grado = p_grado;
-- Si por CUALQUIER motivo esa fila (lote, grado) no existía todavía en la
-- tabla, el UPDATE actualiza 0 filas — Postgres NO tira ningún error por
-- eso, simplemente no hace nada. El código que llama a esta función
-- tampoco revisaba si de verdad se ajustó algo, así que el kilaje
-- "desaparecía" en silencio: no quedaba ni en pergamino ni en verde, sin
-- ningún aviso de error en ningún lado.
--
-- Arreglo: las dos funciones pasan de UPDATE a UPSERT (INSERT ... ON
-- CONFLICT DO UPDATE) — si la fila no existe, la CREA con el valor
-- correcto, en vez de fallar en silencio. Esto no depende de haber
-- sembrado antes todas las combinaciones lote×malla — funciona sin
-- importar qué filas existan de antemano.

CREATE OR REPLACE FUNCTION ajustar_stock_pergamino(p_lote text, p_delta double precision)
RETURNS void AS $$
BEGIN
  INSERT INTO inventario_pergamino (lote, kilos) VALUES (p_lote, p_delta)
  ON CONFLICT (lote) DO UPDATE SET kilos = inventario_pergamino.kilos + p_delta;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ajustar_stock_verde(p_lote text, p_grado text, p_delta double precision)
RETURNS void AS $$
BEGIN
  INSERT INTO inventario_verde (lote, grado, kilos) VALUES (p_lote, p_grado, p_delta)
  ON CONFLICT (lote, grado) DO UPDATE SET kilos = inventario_verde.kilos + p_delta;
END;
$$ LANGUAGE plpgsql;

-- Mismo problema, mismo arreglo, en la función más vieja de todas (café
-- YA TOSTADO — migracion_ajuste_inventario_atomico.sql, de antes de que
-- existiera nada de pergamino/verde). No hay un reporte de que esto haya
-- fallado, pero es la MISMA clase de bug (UPDATE puro, sin fila = no pasa
-- nada, sin error) — se corrige de una vez ya que se está auditando toda
-- la cadena cosecha→pergamino→verde→tueste.
CREATE OR REPLACE FUNCTION ajustar_stock_inventario(p_lote text, p_delta double precision)
RETURNS void AS $$
BEGIN
  INSERT INTO inventario (lote, stock_lb, ts) VALUES (p_lote, p_delta, extract(epoch from now()) * 1000)
  ON CONFLICT (lote) DO UPDATE SET stock_lb = inventario.stock_lb + p_delta, ts = extract(epoch from now()) * 1000;
END;
$$ LANGUAGE plpgsql;

-- Diagnóstico rápido (opcional, corre esto aparte si quieres ver el
-- estado actual antes/después): compara el total que la app calcula por
-- lote contra lo que hay en cada tabla.
-- SELECT lote, kilos FROM inventario_pergamino ORDER BY lote;
-- SELECT lote, grado, kilos FROM inventario_verde ORDER BY lote, grado;
-- SELECT etapa, lote, grado, kilos, origen, referencia, to_timestamp(fecha/1000) AS fecha
--   FROM movimientos_inventario_cafe ORDER BY ts DESC LIMIT 50;
