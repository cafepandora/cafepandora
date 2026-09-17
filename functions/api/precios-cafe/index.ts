import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('precios_cafe')
    .select('id, lote, presentacion, tipoCliente:tipo_cliente, precio, ts')
    .order('lote')
    .order('tipo_cliente');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
