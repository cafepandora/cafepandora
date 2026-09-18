import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT_CLIENTE = 'id, nombre, tipoCliente:tipo_cliente, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('clientes').select(SELECT_CLIENTE).order('nombre');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const nombre = String(body.nombre || '').trim();
  if (!nombre) return new Response('Nombre requerido', { status: 400 });
  const tipoCliente = body.tipoCliente || 'Cliente normal';

  const { data: row, error } = await supabase
    .from('clientes')
    .upsert({ nombre, tipo_cliente: tipoCliente, ts: body.ts || Date.now() }, { onConflict: 'nombre' })
    .select(SELECT_CLIENTE)
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(row, { status: 201 });
};
