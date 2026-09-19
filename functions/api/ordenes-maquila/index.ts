import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, cliente, usuario, items, valor, estado, metodo, recibidoPor:recibido_por, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('ordenes_maquila').select(SELECT);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// Igual que las ventas: el body trae { cliente, items:[...], valor, estado, metodo }.
// No toca inventario — maquila es un servicio sobre el café del cliente.
// Nota: a propósito NO se registra al cliente en el directorio compartido
// (tabla "clientes") — los clientes de maquila quedan independientes de los
// de ventas de café, cada uno con su propio directorio.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const items = Array.isArray(body.items) ? body.items : [];
  const valor = Number(body.valor) || items.reduce((s: number, it: any) => s + (Number(it.valor) || 0), 0);

  const { data, error } = await supabase.from('ordenes_maquila').insert({
    cliente: body.cliente || 'Sin nombre',
    usuario: body.usuario || null,
    items,
    valor,
    estado: body.estado || 'Pendiente',
    metodo: body.metodo || '',
    recibido_por: body.recibidoPor || null,
    ts: body.ts || Date.now(),
  }).select(SELECT).single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
