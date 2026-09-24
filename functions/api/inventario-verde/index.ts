import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { registrarMovimiento } from '../../_lib/verde.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('inventario_verde').select('lote, grado, kilos').order('lote').order('grado');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// Suma café verde (ya trillado) existente que no viene de trillar nada
// dentro de la app — para cuando lo que ya tenías de antes NO era
// pergamino sin trillar, sino café ya trillado (con o sin clasificar por
// malla — "grado" acepta 'Sin clasificar' igual que cualquier malla real).
// Mismo patrón que /api/inventario-pergamino, pero un escalón más
// adelante en el pipeline.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const kilos = Math.max(0, Number(body.kilos) || 0);
  if (!body.lote || !body.grado || !kilos) return new Response('Falta el lote, la malla o los kilos', { status: 400 });

  const { error } = await supabase.rpc('ajustar_stock_verde', { p_lote: body.lote, p_grado: body.grado, p_delta: kilos });
  if (error) return new Response(error.message, { status: 500 });
  await registrarMovimiento(supabase, { etapa: 'verde', lote: body.lote, grado: body.grado, kilos, origen: 'Café verde que ya tenías', referencia: body.nota || null });
  const { data, error: error2 } = await supabase.from('inventario_verde').select('lote, grado, kilos').eq('lote', body.lote).eq('grado', body.grado).single();
  if (error2) return new Response(error2.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
