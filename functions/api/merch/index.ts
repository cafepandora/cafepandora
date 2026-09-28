import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth, requireAuthConUsuario } from '../../_lib/auth.js';

const SELECT = 'id, nombre, categoria, precio, descripcion, imagen, estado, ts, creadoPor:creado_por';

// GET trae TODO (Borrador y Publicado) — es la vista de administración,
// desde la pestaña "Merch" de la app interna. La página pública usa
// /api/merch-publico (sin login, solo Publicado) en su lugar.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('merch_productos').select(SELECT).order('ts', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { error: authError, email } = await requireAuthConUsuario(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const nombre = String(body.nombre || '').trim();
  const categoria = String(body.categoria || '').trim();
  if (!nombre) return new Response('Falta el nombre', { status: 400 });
  if (!categoria) return new Response('Falta la categoría', { status: 400 });

  const { data: row, error } = await supabase
    .from('merch_productos')
    .insert({
      nombre,
      categoria,
      precio: Math.max(0, Number(body.precio) || 0),
      descripcion: body.descripcion || null,
      imagen: body.imagen || null,
      estado: body.estado || 'Borrador',
      creado_por: email,
      ts: body.ts || Date.now(),
    })
    .select(SELECT)
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(row, { status: 201 });
};
