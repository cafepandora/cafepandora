import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, cliente, usuario, items, valor, estado, metodo, ts';
const GENERICOS = ['', 'venta directa', 'n/a', '-'];

async function registrarCliente(supabase: ReturnType<typeof getSupabase>, nombre: unknown) {
  const limpio = String(nombre || '').trim();
  if (!limpio || GENERICOS.includes(limpio.toLowerCase())) return;
  try {
    await supabase.from('clientes').upsert(
      { nombre: limpio, tipo_cliente: 'Cliente normal', ts: Date.now() },
      { onConflict: 'nombre', ignoreDuplicates: true }
    );
  } catch {
    // El directorio es un apoyo: si falla no debe tumbar el registro de la orden.
  }
}

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
    ts: body.ts || Date.now(),
  }).select(SELECT).single();

  if (error) return new Response(error.message, { status: 500 });
  await registrarCliente(supabase, body.cliente);
  return Response.json(data, { status: 201 });
};
