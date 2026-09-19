-- Rellena "quién recibió" en ventas y órdenes de maquila que ya existían
-- antes de que ese campo se empezara a derivar automáticamente del método
-- de pago. Sin esto, esas filas antiguas no entran en el balance de
-- cuentas de nadie y las cuentas no cuadran con la plata real.
-- Solo toca filas donde recibido_por está vacío; no pisa nada que ya
-- tenga un valor (por ejemplo, corregido a mano).

-- "Transferencia a Juan" es un valor viejo de método (de antes de que la
-- transferencia de Juan se separara en "Juan Nequi"/"Juan Bancolombia")
-- que ya no está en el desplegable actual, pero sigue guardado tal cual en
-- filas antiguas — igual de inequívoco que los demás, así que también
-- cuenta.
UPDATE "ventas" SET "recibido_por" = 'Joaquín' WHERE "recibido_por" IS NULL AND "metodo" = 'Transferencia a Joaquín';
UPDATE "ventas" SET "recibido_por" = 'Inés'    WHERE "recibido_por" IS NULL AND "metodo" = 'Transferencia a Inés';
UPDATE "ventas" SET "recibido_por" = 'Juan'    WHERE "recibido_por" IS NULL AND "metodo" IN ('Juan Nequi', 'Juan Bancolombia', 'Transferencia a Juan');

UPDATE "ordenes_maquila" SET "recibido_por" = 'Joaquín' WHERE "recibido_por" IS NULL AND "metodo" = 'Transferencia a Joaquín';
UPDATE "ordenes_maquila" SET "recibido_por" = 'Inés'    WHERE "recibido_por" IS NULL AND "metodo" = 'Transferencia a Inés';
UPDATE "ordenes_maquila" SET "recibido_por" = 'Juan'    WHERE "recibido_por" IS NULL AND "metodo" IN ('Juan Nequi', 'Juan Bancolombia', 'Transferencia a Juan');

-- Lo pagado en Efectivo NO se puede deducir del método (no dice quién lo
-- recibió en mano) — esas filas quedan sin dueño hasta que alguien las
-- corrija a mano desde el botón ✎ de Ventas/Maquila. Para ubicarlas:
-- SELECT id, cliente, valor, ts FROM ventas WHERE estado='Pagado' AND metodo='Efectivo' AND recibido_por IS NULL ORDER BY ts DESC;
-- SELECT id, cliente, valor, ts FROM ordenes_maquila WHERE estado='Pagado' AND metodo='Efectivo' AND recibido_por IS NULL ORDER BY ts DESC;
