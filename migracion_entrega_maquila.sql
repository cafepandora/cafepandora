-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Estado de entrega de una orden de maquila (Pendiente/Entregado) —
-- independiente del estado de pago (Pagado/Pendiente), igual que "estado"
-- vs "estado_envio" ya funcionan por separado en ventas.
ALTER TABLE "ordenes_maquila" ADD COLUMN IF NOT EXISTS "estado_entrega" text DEFAULT 'Pendiente';
