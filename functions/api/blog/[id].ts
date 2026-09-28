import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, titulo, extracto, contenido, imagen, autor, estado, esHtml:es_html, ts, creadoPor:creado_por';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const updates: Record<string, unknown> = {};
  if (body.titulo !== undefined) updates.titulo = body.titulo;
  if (body.extracto !== undefined) updates.extracto = body.extracto || null;
  if (body.contenido !== undefined) updates.contenido = body.contenido;
  if (body.imagen !== undefined) updates.imagen = body.imagen || null;
  if (body.autor !== undefined) updates.autor = body.autor || null;
  if (body.estado !== undefined) updates.estado = body.estado;
  if (body.esHtml !== undefined) updates.es_html = !!body.esHtml;

  if (Object.keys(updates).length === 0) return new Response('Sin cambios', { status: 400 });

  const { data: row, error } = await supabase.from('blog_posts').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Artículo no encontrado', { status: 404 });
  return Response.json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { error } = await supabase.from('blog_posts').delete().eq('id', context.params.id as string);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
