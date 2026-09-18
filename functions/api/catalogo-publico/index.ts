import { getSupabase, Env } from '../../_lib/supabase.js';

// Endpoint público (sin clave) para la página de pedidos de clientes.
// Solo expone precios "normal" — nunca los de distribuidor.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('precios_cafe')
    .select('lote, presentacion, precio')
    .eq('tipo_cliente', 'normal')
    .order('lote');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
