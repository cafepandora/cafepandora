import { getSupabase, Env } from '../../_lib/supabase.js';

const SELECT = 'id, nombreCliente:nombre_cliente, telefono, items, valorTotal:valor_total, notas, estado, ts';

// GET lo usa la app interna para ver la bandeja de pedidos entrantes.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('pedidos_web').select(SELECT);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// POST es público (sin clave) — lo llama la página de pedidos del cliente.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return new Response('El pedido está vacío', { status: 400 });
  const nombreCliente = String(body.nombreCliente || '').trim();
  if (!nombreCliente) return new Response('Falta el nombre del cliente', { status: 400 });

  const valorTotal = items.reduce((s: number, it: any) => s + (Number(it.valor) || 0), 0);

  const { data, error } = await supabase.from('pedidos_web').insert({
    nombre_cliente: nombreCliente,
    telefono: body.telefono || null,
    items,
    valor_total: valorTotal,
    notas: body.notas || null,
    estado: 'nuevo',
    ts: Date.now(),
  }).select(SELECT).single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
