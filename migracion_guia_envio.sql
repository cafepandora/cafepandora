-- Ejecuta esto en el SQL Editor de Supabase.
-- Guarda la foto de la guía de envío (si aplica) directo en la venta, para
-- poder descargarla junto con el recibo cuando el cliente ya pagó.

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS guia_envio text;
