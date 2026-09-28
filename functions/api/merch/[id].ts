import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, nombre, categoria, precio, descripcion, imagen, estado, ts, creadoPor:creado_por';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const updates: Record<string, unknown> = {};
  if (body.nombre !== undefined) updates.nombre = body.nombre;
  if (body.categoria !== undefined) updates.categoria = body.categoria;
  if (body.precio !== undefined) updates.precio = Math.max(0, Number(body.precio) || 0);
  if (body.descripcion !== undefined) updates.descripcion = body.descripcion || null;
  if (body.imagen !== undefined) updates.imagen = body.imagen || null;
  if (body.estado !== undefined) updates.estado = body.estado;

  if (Object.keys(updates).length === 0) return new Response('Sin cambios', { status: 400 });

  const { data: row, error } = await supabase.from('merch_productos').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Producto no encontrado', { status: 404 });
  return Response.json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { error } = await supabase.from('merch_productos').delete().eq('id', context.params.id as string);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
