import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth, requireAuthConUsuario } from '../../_lib/auth.js';

const SELECT = 'id, titulo, extracto, contenido, imagen, autor, estado, esHtml:es_html, ts, creadoPor:creado_por';

// GET trae TODO (Borrador y Publicado) — es la vista de administración,
// desde la pestaña "Blog" de la app interna. La página pública usa
// /api/blog-publico (sin login, solo Publicado) en su lugar.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('blog_posts').select(SELECT).order('ts', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { error: authError, email } = await requireAuthConUsuario(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const titulo = String(body.titulo || '').trim();
  const contenido = String(body.contenido || '').trim();
  if (!titulo) return new Response('Falta el título', { status: 400 });
  if (!contenido) return new Response('Falta el contenido', { status: 400 });

  const { data: row, error } = await supabase
    .from('blog_posts')
    .insert({
      titulo,
      extracto: body.extracto || null,
      contenido,
      imagen: body.imagen || null,
      autor: body.autor || null,
      estado: body.estado || 'Borrador',
      es_html: !!body.esHtml,
      creado_por: email,
      ts: body.ts || Date.now(),
    })
    .select(SELECT)
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(row, { status: 201 });
};
