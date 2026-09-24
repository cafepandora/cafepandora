import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth, requireAuthConUsuario } from '../../_lib/auth.js';

const SELECT = 'id, fecha, kilosCereza:kilos_cereza, proceso, kilosPergaminoReal:kilos_pergamino_real, kilosVerdeReal:kilos_verde_real, kilosPasilla:kilos_pasilla, notas, usuario, ts, fermentacionInicio:fermentacion_inicio, fermentacionFin:fermentacion_fin, fermentacionAlertado:fermentacion_alertado, creadoPor:creado_por';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('cosechas').select(SELECT).order('fecha', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { error: authError, email } = await requireAuthConUsuario(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const { data, error } = await supabase.from('cosechas').insert({
    fecha: body.fecha || Date.now(),
    kilos_cereza: Math.max(0, Number(body.kilosCereza) || 0),
    proceso: body.proceso,
    kilos_pergamino_real: body.kilosPergaminoReal != null ? Number(body.kilosPergaminoReal) : null,
    kilos_pasilla: body.kilosPasilla != null ? Number(body.kilosPasilla) : null,
    notas: body.notas || null,
    usuario: body.usuario || null,
    fermentacion_inicio: body.fermentacionInicio != null ? Number(body.fermentacionInicio) : null,
    fermentacion_fin: body.fermentacionFin != null ? Number(body.fermentacionFin) : null,
    creado_por: email,
    ts: Date.now(),
  }).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
