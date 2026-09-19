-- Ejecuta esto en el SQL Editor de Supabase. Crea una función que suma o
-- resta stock en UNA sola operación atómica de base de datos, en vez de
-- "leer el valor, calcular, y guardar" desde la app (que es donde puede
-- perderse un descuento si dos celulares venden del mismo lote casi al
-- mismo segundo).

CREATE OR REPLACE FUNCTION ajustar_stock_inventario(p_lote text, p_delta double precision)
RETURNS void AS $$
BEGIN
  UPDATE inventario
  SET stock_lb = stock_lb + p_delta, ts = extract(epoch from now()) * 1000
  WHERE lote = p_lote;
END;
$$ LANGUAGE plpgsql;
