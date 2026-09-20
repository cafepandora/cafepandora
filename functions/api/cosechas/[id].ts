import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, fecha, kilosCereza:kilos_cereza, proceso, kilosPergaminoReal:kilos_pergamino_real, kilosVerdeReal:kilos_verde_real, kilosPasilla:kilos_pasilla, notas, usuario, ts, fermentacionInicio:fermentacion_inicio, fermentacionFin:fermentacion_fin, fermentacionAlertado:fermentacion_alertado';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const updates: Record<string, unknown> = {};
  if (body.fecha !== undefined) updates.fecha = Number(body.fecha);
  if (body.kilosCereza !== undefined) updates.kilos_cereza = Math.max(0, Number(body.kilosCereza) || 0);
  if (body.proceso !== undefined) updates.proceso = body.proceso;
  if (body.kilosPergaminoReal !== undefined) updates.kilos_pergamino_real = body.kilosPergaminoReal === null ? null : Math.max(0, Number(body.kilosPergaminoReal) || 0);
  if (body.kilosVerdeReal !== undefined) updates.kilos_verde_real = body.kilosVerdeReal === null ? null : Math.max(0, Number(body.kilosVerdeReal) || 0);
  if (body.kilosPasilla !== undefined) updates.kilos_pasilla = body.kilosPasilla === null ? null : Math.max(0, Number(body.kilosPasilla) || 0);
  if (body.notas !== undefined) updates.notas = body.notas;
  if (body.fermentacionInicio !== undefined) {
    updates.fermentacion_inicio = body.fermentacionInicio === null ? null : Number(body.fermentacionInicio);
    updates.fermentacion_alertado = false; // si se corrige el inicio, la alerta se vuelve a evaluar
  }
  if (body.fermentacionFin !== undefined) {
    updates.fermentacion_fin = body.fermentacionFin === null ? null : Number(body.fermentacionFin);
    updates.fermentacion_alertado = false;
  }
  if (!Object.keys(updates).length) return new Response('Sin cambios', { status: 400 });

  const { data, error } = await supabase.from('cosechas').update(updates).eq('id', context.params.id as string).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { error } = await supabase.from('cosechas').delete().eq('id', context.params.id as string);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
