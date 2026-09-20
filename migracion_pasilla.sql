-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Pasilla: subproducto de baja calidad que sale al procesar la cosecha —
-- no tiene su propia cosecha con cereza, se pesa aparte al anotar el
-- pergamino real (⚖️) de una cosecha existente de Lavado/Honey/Natural/
-- Exótico. De ahí en adelante sigue el mismo camino que cualquier lote:
-- se tuesta (Cosecha & Tueste → Tueste, eligiendo "Pasilla" como lote) y
-- se vende (Ventas, eligiendo "Pasilla" como lote) — pero solo a un
-- puñado de clientes, sobre todo una empresa distribuidora. Nunca se
-- ofrece en la página pública de pedidos ni en los atajos ⚡ de Ventas.
ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "kilos_pasilla" numeric;

-- Precio inicial: solo tarifa de distribuidor, y solo la presentación
-- Libra (500 g) — es la única que se maneja para pasilla. Las otras 3
-- presentaciones quedan en $0 (mismo patrón que ya existe para Honey/
-- Natural en varias presentaciones) y las tarifas normal/web ni se crean
-- a propósito, para que Pasilla no aparezca ni en "Precio normal" de
-- Configuración ni en la página pública. Ajusta el precio cuando quieras
-- desde Configuración → Precios de café → Pasilla → Precio distribuidor.
INSERT INTO "precios_cafe" ("lote", "presentacion", "tipo_cliente", "precio", "ts") VALUES
  ('Pasilla', 'Media lb',  'distribuidor', 0,     (extract(epoch from now()) * 1000)::bigint),
  ('Pasilla', 'Libra',     'distribuidor', 22000, (extract(epoch from now()) * 1000)::bigint),
  ('Pasilla', 'Kilo',      'distribuidor', 0,     (extract(epoch from now()) * 1000)::bigint),
  ('Pasilla', 'Cuarterón', 'distribuidor', 0,     (extract(epoch from now()) * 1000)::bigint);
