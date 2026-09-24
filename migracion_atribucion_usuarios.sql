-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Atribución real de quién creó cada registro (2026-09-24, a pedido de
-- Juan pensando en una empresa de 10 empleados) — hasta ahora la app
-- solo guardaba "usuario"/"pagadoPor"/"recibidoPor" como TEXTO que la
-- persona escribe a mano al llenar el formulario (o que queda guardado
-- en localStorage del celular) — nada de eso prueba de verdad quién
-- estaba usando la sesión. `creado_por` es distinto: lo llena el
-- SERVIDOR, leyendo el correo real de la sesión de Supabase Auth que
-- hizo la petición — el navegador no puede mandar un valor falso para
-- esta columna, porque ni se le pregunta.
--
-- Ojo: esto NO reemplaza "Quién pagó"/"Quién recibió" — esos siguen
-- siendo sobre de qué CUENTA BANCARIA sale/entra la plata (Juan puede
-- registrar una venta que en realidad recibió Inés en su cuenta), cosa
-- que la sesión no puede saber sola. `creado_por` es sobre quién usó la
-- app para escribir el registro, un dato distinto que ahora también
-- queda guardado, automático, sin tener que seleccionarlo en ningún
-- lado.

ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "creado_por" text;
ALTER TABLE "ordenes_maquila" ADD COLUMN IF NOT EXISTS "creado_por" text;
ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "creado_por" text;
ALTER TABLE "finca" ADD COLUMN IF NOT EXISTS "creado_por" text;
ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "creado_por" text;
ALTER TABLE "compras_cereza" ADD COLUMN IF NOT EXISTS "creado_por" text;
ALTER TABLE "compras_pergamino" ADD COLUMN IF NOT EXISTS "creado_por" text;
ALTER TABLE "lotes_tueste" ADD COLUMN IF NOT EXISTS "creado_por" text;
ALTER TABLE "cuentas_cobro" ADD COLUMN IF NOT EXISTS "creado_por" text;
