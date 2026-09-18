import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, cliente, usuario, items, valor, estado, metodo, ts';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const updates: Record<string, unknown> = {};
  if (body.items !== undefined) updates.items = body.items;
  if (body.valor !== undefined) updates.valor = Math.max(0, Number(body.valor) || 0);
  if (body.estado !== undefined) updates.estado = body.estado;
  if (body.metodo !== undefined) updates.metodo = body.metodo;
  if (!Object.keys(updates).length) return new Response('Sin cambios', { status: 400 });

  const { data, error } = await supabase.from('ordenes_maquila').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  if (!data) return new Response('Orden no encontrada', { status: 404 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { error } = await supabase.from('ordenes_maquila').delete().eq('id', context.params.id as string);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
