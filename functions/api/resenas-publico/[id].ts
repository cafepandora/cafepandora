import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

// A diferencia de GET/POST en index.ts (públicos, sin clave — los usa la
// página de pedidos), borrar una reseña SÍ exige login: es una acción de
// moderación (quitar spam o algo inapropiado), no algo que un cliente
// deba poder hacer. Sin pantalla propia en la app interna todavía — se
// llama a mano con el token de sesión mientras no se construya esa
// pantalla (ver CLAUDE.md, sección de Reseñas, "Pendiente").
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const { error } = await supabase.from('resenas').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
