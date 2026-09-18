import { getSupabase, Env } from '../../_lib/supabase.js';

const SELECT = 'id, fecha, proveedor, kilosPergamino:kilos_pergamino, proceso, costo, kilosVerdeReal:kilos_verde_real, notas, usuario, ts';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const updates: Record<string, unknown> = {};
  if (body.kilosVerdeReal !== undefined) updates.kilos_verde_real = body.kilosVerdeReal === null ? null : Math.max(0, Number(body.kilosVerdeReal) || 0);
  if (body.proveedor !== undefined) updates.proveedor = body.proveedor;
  if (body.notas !== undefined) updates.notas = body.notas;
  if (!Object.keys(updates).length) return new Response('Sin cambios', { status: 400 });

  const { data, error } = await supabase.from('compras_pergamino').update(updates).eq('id', context.params.id as string).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { error } = await supabase.from('compras_pergamino').delete().eq('id', context.params.id as string);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
