import { getSupabase, Env } from '../../_lib/supabase.js';

// Endpoint público (sin clave) para la sección "Blog" de la página de
// pedidos — mismo patrón que catalogo-publico. Solo trae los artículos
// en estado 'Publicado' (nunca Borradores), y deja afuera "creadoPor"
// (quién lo escribió desde la app interna, un dato interno, no de la
// firma pública del artículo — para eso está "autor").
const SELECT = 'id, titulo, extracto, contenido, imagen, autor, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('blog_posts')
    .select(SELECT)
    .eq('estado', 'Publicado')
    .order('ts', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
