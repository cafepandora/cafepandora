-- Ejecuta esto en el SQL Editor de Supabase.
-- El tueste ya no exige el kilos_tostado al momento de registrar la entrada
-- de verde — se puede anotar después, cuando ya se sepa cuánto salió. Para
-- Lavado además se puede desglosar cuánto fue Tostión Media y cuánto Media
-- alta, para poder comparar la merma de cada una.

ALTER TABLE lotes_tueste ALTER COLUMN kilos_tostado DROP NOT NULL;
ALTER TABLE lotes_tueste ALTER COLUMN kilos_tostado SET DEFAULT NULL;
ALTER TABLE lotes_tueste ADD COLUMN IF NOT EXISTS kilos_tostado_media double precision;
ALTER TABLE lotes_tueste ADD COLUMN IF NOT EXISTS kilos_tostado_media_alta double precision;
