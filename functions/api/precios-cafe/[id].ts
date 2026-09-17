import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  if (body.precio === undefined) return new Response('Falta precio', { status: 400 });

  const { data: row, error } = await supabase
    .from('precios_cafe')
    .update({ precio: Number(body.precio) || 0, ts: Date.now() })
    .eq('id', id)
    .select('id, lote, presentacion, tipoCliente:tipo_cliente, precio, ts')
    .single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Precio no encontrado', { status: 404 });
  return Response.json(row);
};
