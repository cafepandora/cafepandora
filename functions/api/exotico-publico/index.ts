import { getSupabase, Env } from '../../_lib/supabase.js';

// GET público, sin clave — lo usa index.html (catálogo) para pintar el
// banner de "✨ Ediciones especiales de cafés exóticos" con la foto,
// nombre, descripción y unidades disponibles que Juan dejó puestas desde
// la app interna (ver /api/exotico-actual). Mismo espíritu que
// catalogo-publico/blog-publico/merch-publico: público, sin moderación.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('exotico_actual').select('variedad, descripcion, imagen, stock').eq('id', 1).maybeSingle();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data || { variedad: '', descripcion: '', imagen: '', stock: 0 });
};
