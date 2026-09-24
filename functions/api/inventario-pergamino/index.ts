import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { registrarMovimiento } from '../../_lib/verde.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('inventario_pergamino').select('lote, kilos').order('lote');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// Suma pergamino existente que no viene de ninguna cosecha/compra dentro
// de la app — sobre todo para el stock de antes de empezar a usarla.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const kilos = Math.max(0, Number(body.kilos) || 0);
  if (!body.lote || !kilos) return new Response('Falta el lote o los kilos', { status: 400 });

  const { error } = await supabase.rpc('ajustar_stock_pergamino', { p_lote: body.lote, p_delta: kilos });
  if (error) return new Response(error.message, { status: 500 });
  await registrarMovimiento(supabase, { etapa: 'pergamino', lote: body.lote, kilos, origen: 'Pergamino que ya tenías', referencia: body.nota || null });
  const { data, error: error2 } = await supabase.from('inventario_pergamino').select('lote, kilos').eq('lote', body.lote).single();
  if (error2) return new Response(error2.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
