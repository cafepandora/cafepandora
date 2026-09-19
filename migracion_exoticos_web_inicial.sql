-- Ejecuta esto en el SQL Editor de Supabase.
-- Le pone un precio inicial a Exóticos en la tarifa "web" (antes estaba en
-- $0, por eso no aparecía el aviso en la página). Ajústalo cuando quieras
-- desde Configuración → Precios de la página web → Exotico.

UPDATE precios_cafe SET precio = 37000 WHERE tipo_cliente = 'web' AND lote = 'Exotico' AND presentacion = 'Media lb';
