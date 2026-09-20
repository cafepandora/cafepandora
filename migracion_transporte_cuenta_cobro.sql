-- Costo de transporte/envío, opcional, en cuentas de cobro — se factura
-- aparte del resto porque es un servicio distinto (no lleva retención).
ALTER TABLE "cuentas_cobro" ADD COLUMN IF NOT EXISTS "transporte" numeric DEFAULT 0;
