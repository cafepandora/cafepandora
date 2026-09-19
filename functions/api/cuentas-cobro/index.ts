import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, cliente, clienteNit:cliente_nit, items, otros, total, ventaId:venta_id, usuario, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('cuentas_cobro').select(SELECT).order('id', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return new Response('Sin líneas', { status: 400 });
  const cliente = String(body.cliente || '').trim();
  if (!cliente) return new Response('Falta el cliente', { status: 400 });

  const otros = Math.max(0, Number(body.otros) || 0);
  const subtotal = items.reduce((s: number, it: any) => s + (Number(it.valorTotal) || 0), 0);
  const total = subtotal + otros;

  const { data, error } = await supabase.from('cuentas_cobro').insert({
    cliente,
    cliente_nit: body.clienteNit || null,
    items,
    otros,
    total,
    venta_id: body.ventaId || null,
    usuario: body.usuario || null,
    ts: Date.now(),
  }).select(SELECT).single();

  if (error) return new Response(error.message, { status: 500 });

  // Guarda el NIT/cédula en el directorio del cliente para la próxima vez,
  // sin pisarle el tipo de cliente (normal/distribuidor) si ya existía.
  if (body.clienteNit) {
    const { data: existente } = await supabase.from('clientes').select('id').eq('nombre', cliente).maybeSingle();
    if (existente) {
      await supabase.from('clientes').update({ nit_cedula: body.clienteNit }).eq('id', existente.id);
    } else {
      await supabase.from('clientes').insert({ nombre: cliente, tipo_cliente: 'Cliente normal', nit_cedula: body.clienteNit, ts: Date.now() });
    }
  }

  return Response.json(data, { status: 201 });
};
