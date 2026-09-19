import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, usuario, concepto, monto, categoria, estado, ts, pagadoPor:pagado_por, transferidoA:transferido_a';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const updates: Record<string, unknown> = {};
  if (body.usuario !== undefined) updates.usuario = body.usuario;
  if (body.concepto !== undefined) updates.concepto = body.concepto;
  if (body.monto !== undefined) updates.monto = Number(body.monto) || 0;
  if (body.categoria !== undefined) updates.categoria = body.categoria;
  if (body.estado !== undefined) updates.estado = body.estado;
  if (body.pagadoPor !== undefined) updates.pagado_por = body.pagadoPor;
  if (body.transferidoA !== undefined) updates.transferido_a = body.transferidoA;
  if (body.ts !== undefined) updates.ts = Number(body.ts);

  if (Object.keys(updates).length === 0) return new Response('Sin cambios', { status: 400 });

  const { data: row, error } = await supabase.from('gastos').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Gasto no encontrado', { status: 404 });
  return Response.json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const { error } = await supabase.from('gastos').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
