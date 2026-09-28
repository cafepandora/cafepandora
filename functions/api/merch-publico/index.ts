import { getSupabase, Env } from '../../_lib/supabase.js';

// Endpoint público (sin clave) para la sección "Merch" de la página de
// pedidos — mismo patrón que catalogo-publico/blog-publico. Solo trae
// los productos en estado 'Publicado'. Ojo: este endpoint responde
// igual aunque la sección no tenga link en la navegación todavía (no
// está enlazada, pero no es privada de verdad — cualquiera que conozca
// la URL /merch o llame este endpoint directo puede verlo).
const SELECT = 'id, nombre, categoria, precio, descripcion, imagen, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('merch_productos')
    .select(SELECT)
    .eq('estado', 'Publicado')
    .order('ts', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
