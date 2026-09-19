-- Ejecuta esto en el SQL Editor de Supabase.
-- Agrega un estado de ENVÍO a las ventas, independiente del estado de PAGO
-- que ya existía. Una venta puede estar pagada y sin enviar, enviada y sin
-- pagar, o cualquier combinación — son dos cosas distintas.

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado_envio text NOT NULL DEFAULT 'Pendiente';
