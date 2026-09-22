-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Compras de cereza en varios días (ej. Don Leo trae cereza día tras día,
-- se va pesando cada vez) — pesajes guarda el historial día a día
-- ({ fecha, kilos } por cada pesada); kilos_cereza sigue siendo el TOTAL
-- (la suma de pesajes), para que todo el código que ya usa kilos_cereza
-- (rendimientos, margen por lote, Excel) siga funcionando sin tocarlo.
ALTER TABLE "compras_cereza" ADD COLUMN IF NOT EXISTS "pesajes" jsonb;
