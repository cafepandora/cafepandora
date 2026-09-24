import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

// Historial de entradas/salidas de "pergamino disponible" y "café verde
// disponible" (ver migracion_inventario_verde.sql) — el inventario en sí
// es un solo número por lote (o lote+malla), esto deja ver de dónde vino
// o hacia dónde fue cada aporte ("Cosecha propia", "Compra a Don Leo",
// "Retiro para tostión"...), sin separar el stock por proveedor.
const SELECT = 'id, fecha, etapa, lote, grado, kilos, origen, referencia, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('movimientos_inventario_cafe')
    .select(SELECT)
    .order('fecha', { ascending: false })
    .limit(300);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
