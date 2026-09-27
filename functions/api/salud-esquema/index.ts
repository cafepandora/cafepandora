import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

// Chequea EN VIVO (no de memoria) si las tablas/columnas de features
// recientes ya existen en Supabase — para que "falta correr una
// migración" se vea como un aviso claro en Configuración en vez de
// descubrirse cuando sincronizar() ya tronó para toda la app (ver
// Gotcha del requireAuth() + el patrón de "Error en /api/x (500):
// column no existe" documentado en CLAUDE.md). Cada entrada intenta un
// SELECT liviano (limit 1) — si la tabla/columna no existe, Postgres
// responde con error y eso es justo lo que se reporta como pendiente.
const CHEQUEOS = [
  { tabla: 'costos_margen', columna: 'id', migracion: 'migracion_costos_margen.sql', descripcion: 'Costos editables para "Margen estimado por lote"' },
  { tabla: 'compras_cereza', columna: 'pesajes', migracion: 'migracion_pesajes_cereza.sql', descripcion: 'Pesajes día a día de cereza comprada (📏)' },
  { tabla: 'saldos_iniciales', columna: 'persona', migracion: 'migracion_saldos_iniciales.sql', descripcion: 'Saldo inicial de cada cuenta' },
  { tabla: 'precio_cafe_fnc', columna: 'fecha', migracion: 'migracion_precio_fnc.sql', descripcion: 'Precio de referencia de la Federación' },
  { tabla: 'ordenes_maquila', columna: 'estado_entrega', migracion: 'migracion_entrega_maquila.sql', descripcion: 'Estado de entrega de maquila' },
  { tabla: 'cosechas', columna: 'kilos_pasilla', migracion: 'migracion_pasilla.sql', descripcion: 'Kilos de pasilla al pesar pergamino' },
  { tabla: 'inventario_verde', columna: 'kilos', migracion: 'migracion_inventario_verde.sql', descripcion: 'Inventario de café verde por malla y pergamino disponible' },
  { tabla: 'cosechas', columna: 'verde_grados', migracion: 'migracion_inventario_verde.sql', descripcion: 'Desglose por malla al trillar' },
  { tabla: 'movimientos_inventario_cafe', columna: 'kilos', migracion: 'migracion_inventario_verde.sql', descripcion: 'Historial de movimientos del inventario de café' },
  { tabla: 'ventas', columna: 'creado_por', migracion: 'migracion_atribucion_usuarios.sql', descripcion: 'Atribución real de quién creó cada registro (creado_por)' },
  { tabla: 'cuentas_cobro', columna: 'creado_por', migracion: 'migracion_atribucion_usuarios.sql', descripcion: 'Atribución real de quién creó cada registro (creado_por)' },
  { tabla: 'costos_margen', columna: 'costos_por_kg', migracion: 'migracion_costos_por_kg.sql', descripcion: 'Costos personalizados por kg tostado (ej. gas) en "Margen estimado por lote"' },
];

// A diferencia de CHEQUEOS de arriba (columna/tabla que no existe todavía —
// Postgres responde error), esto es para una migración que no cambia el
// esquema, solo SIEMBRA filas (migracion_precios_mayorista_interno.sql) —
// la columna/tabla ya existe, así que un SELECT normal nunca falla; lo que
// hay que comprobar es si ya hay al menos una fila con ese filtro.
const CHEQUEOS_FILAS = [
  { tabla: 'precios_cafe', filtro: { tipo_cliente: 'mayorista' }, migracion: 'migracion_precios_mayorista_interno.sql', descripcion: 'Precios propios para "Mayorista" (hoy usaría $0 en vez de la tarifa normal)' },
  { tabla: 'precios_cafe', filtro: { tipo_cliente: 'interno' }, migracion: 'migracion_precios_mayorista_interno.sql', descripcion: 'Precios propios para "Interno" (hoy usaría $0 en vez de la tarifa normal)' },
];

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const resultados = await Promise.all(CHEQUEOS.map(async (c) => {
    const { error } = await supabase.from(c.tabla).select(c.columna).limit(1);
    return { tabla: c.tabla, migracion: c.migracion, descripcion: c.descripcion, ok: !error };
  }));
  const resultadosFilas = await Promise.all(CHEQUEOS_FILAS.map(async (c) => {
    let q = supabase.from(c.tabla).select('id');
    for (const [columna, valor] of Object.entries(c.filtro)) q = q.eq(columna, valor);
    const { data, error } = await q.limit(1);
    return { tabla: c.tabla, migracion: c.migracion, descripcion: c.descripcion, ok: !error && !!(data && data.length) };
  }));
  return Response.json([...resultados, ...resultadosFilas]);
};
