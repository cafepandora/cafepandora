import { getSupabase, Env } from '../../_lib/supabase.js';

// Endpoint público (sin clave) para la página de pedidos de clientes.
// Usa la tarifa "web" — independiente de "normal" y "distribuidor" —
// para poder ir ajustando los precios de los clientes nuevos sin tocar
// los de los clientes de siempre.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('precios_cafe')
    .select('lote, presentacion, precio')
    .eq('tipo_cliente', 'web')
    .order('lote');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
