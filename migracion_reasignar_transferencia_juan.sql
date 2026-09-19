-- "Transferencia a Juan" es un valor viejo de método (de antes de que se
-- separara en "Juan Nequi"/"Juan Bancolombia") que ya no está en el
-- desplegable actual. El balance POR PERSONA de Juan ya estaba bien
-- (recibido_por se rellenó con el backfill anterior), pero la tabla "Por
-- modalidad / cuenta" agrupa por el texto exacto de metodo, así que esas
-- filas seguían apareciendo como una 3ª cuenta separada de Juan en vez de
-- caer en una de sus 2 cuentas reales. Confirmado con Juan: esas ventas
-- fueron todas a Bancolombia.
UPDATE "ventas" SET "metodo" = 'Juan Bancolombia' WHERE "metodo" = 'Transferencia a Juan';
UPDATE "ordenes_maquila" SET "metodo" = 'Juan Bancolombia' WHERE "metodo" = 'Transferencia a Juan';
