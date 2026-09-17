import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const updates: Record<string, unknown> = {};
  if (body.concepto !== undefined) updates.concepto = body.concepto;
  if (body.categoria !== undefined) updates.categoria = body.categoria;
  if (body.monto !== undefined) updates.monto = Number(body.monto) || 0;
  if (body.estado !== undefined) updates.estado = body.estado;
  if (body.ts !== undefined) updates.ts = Number(body.ts);

  if (Object.keys(updates).length === 0) return new Response('Sin cambios', { status: 400 });

  const { data: row, error } = await supabase.from('finca').update(updates).eq('id', id).select().single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Registro no encontrado', { status: 404 });
  return Response.json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const { error } = await supabase.from('finca').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
