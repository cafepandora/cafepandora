import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, fecha, kilosCereza:kilos_cereza, proceso, kilosPergaminoReal:kilos_pergamino_real, kilosVerdeReal:kilos_verde_real, notas, usuario, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('cosechas').select(SELECT).order('fecha', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const { data, error } = await supabase.from('cosechas').insert({
    fecha: body.fecha || Date.now(),
    kilos_cereza: Math.max(0, Number(body.kilosCereza) || 0),
    proceso: body.proceso,
    kilos_pergamino_real: body.kilosPergaminoReal != null ? Number(body.kilosPergaminoReal) : null,
    notas: body.notas || null,
    usuario: body.usuario || null,
    ts: Date.now(),
  }).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
