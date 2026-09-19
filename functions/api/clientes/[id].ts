import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const updates: Record<string, unknown> = {};
  if (body.nombre !== undefined) updates.nombre = String(body.nombre).trim();
  if (body.nitCedula !== undefined) updates.nit_cedula = body.nitCedula || null;
  if (!Object.keys(updates).length) return new Response('Sin cambios', { status: 400 });

  const { data, error } = await supabase.from('clientes').update(updates).eq('id', id)
    .select('id, nombre, tipoCliente:tipo_cliente, nitCedula:nit_cedula, ts').single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
