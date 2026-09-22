import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, fecha, proveedor, kilosCereza:kilos_cereza, proceso, costo, pagadoPor:pagado_por, kilosPergaminoReal:kilos_pergamino_real, kilosVerdeReal:kilos_verde_real, notas, usuario, ts, pesajes';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const updates: Record<string, unknown> = {};
  if (body.fecha !== undefined) updates.fecha = Number(body.fecha);
  if (body.proveedor !== undefined) updates.proveedor = body.proveedor;
  if (body.kilosCereza !== undefined) updates.kilos_cereza = Math.max(0, Number(body.kilosCereza) || 0);
  if (body.proceso !== undefined) updates.proceso = body.proceso;
  if (body.costo !== undefined) updates.costo = Math.max(0, Number(body.costo) || 0);
  if (body.pagadoPor !== undefined) updates.pagado_por = body.pagadoPor;
  if (body.kilosPergaminoReal !== undefined) updates.kilos_pergamino_real = body.kilosPergaminoReal === null ? null : Math.max(0, Number(body.kilosPergaminoReal) || 0);
  if (body.kilosVerdeReal !== undefined) updates.kilos_verde_real = body.kilosVerdeReal === null ? null : Math.max(0, Number(body.kilosVerdeReal) || 0);
  if (body.notas !== undefined) updates.notas = body.notas;
  if (body.pesajes !== undefined) updates.pesajes = Array.isArray(body.pesajes) ? body.pesajes : null;
  if (!Object.keys(updates).length) return new Response('Sin cambios', { status: 400 });

  const { data, error } = await supabase.from('compras_cereza').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { error } = await supabase.from('compras_cereza').delete().eq('id', context.params.id as string);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
