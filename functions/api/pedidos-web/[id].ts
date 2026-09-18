import { getSupabase, Env } from '../../_lib/supabase.js';

const SELECT = 'id, nombreCliente:nombre_cliente, telefono, items, valorTotal:valor_total, notas, estado, ts';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  if (body.estado === undefined) return new Response('Falta estado', { status: 400 });

  const { data, error } = await supabase.from('pedidos_web')
    .update({ estado: body.estado })
    .eq('id', context.params.id as string)
    .select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { error } = await supabase.from('pedidos_web').delete().eq('id', context.params.id as string);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
