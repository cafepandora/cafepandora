-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Hasta ahora, "Tipo de cliente" en Ventas ofrecía 4 opciones (Cliente
-- normal, Mayorista, Distribuidor, Interno) pero solo Distribuidor tenía su
-- propia tarifa en `precios_cafe` — Mayorista e Interno caían en silencio
-- en la misma tarifa "normal", sin ningún aviso (tierDeCliente() en
-- index.html los colapsaba a 'normal'). Encontrado en la auditoría de
-- claridad de precios de 2026-09-26, a pedido de Juan: "Mayorista podría
-- tener otro valor e interno otro".
--
-- Esta migración solo SIEMBRA las filas nuevas (tipo_cliente =
-- 'mayorista'/'interno') para que existan desde ya y se puedan editar en
-- Configuración → Precios → "Precio mayorista"/"Precio interno" — clona el
-- valor que hoy tiene la tarifa 'normal' de cada lote/presentación como
-- punto de partida (para no dejar $0 de la nada en algo que ya se estaba
-- cobrando), no inventa ningún número nuevo. Ajusta cada uno a lo que
-- corresponda apenas la corras.
--
-- Segura de correr más de una vez: el WHERE NOT EXISTS evita duplicar una
-- fila que ya se haya creado (a mano, desde "Agregar un precio nuevo" en
-- Configuración, o corriendo esto de nuevo por error).

INSERT INTO precios_cafe (lote, presentacion, tipo_cliente, precio, ts)
SELECT n.lote, n.presentacion, 'mayorista', n.precio, (extract(epoch from now()) * 1000)::bigint
FROM precios_cafe n
WHERE n.tipo_cliente = 'normal'
  AND NOT EXISTS (
    SELECT 1 FROM precios_cafe m
    WHERE m.lote = n.lote AND m.presentacion = n.presentacion AND m.tipo_cliente = 'mayorista'
  );

INSERT INTO precios_cafe (lote, presentacion, tipo_cliente, precio, ts)
SELECT n.lote, n.presentacion, 'interno', n.precio, (extract(epoch from now()) * 1000)::bigint
FROM precios_cafe n
WHERE n.tipo_cliente = 'normal'
  AND NOT EXISTS (
    SELECT 1 FROM precios_cafe i
    WHERE i.lote = n.lote AND i.presentacion = n.presentacion AND i.tipo_cliente = 'interno'
  );
