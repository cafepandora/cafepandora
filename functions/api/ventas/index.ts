import { getSupabase, Env } from '../../_lib/supabase.js';
import { kilosVendidos } from '../../_lib/convert.js';

const SELECT_VENTA = 'id, usuario, cliente, tipoCliente:tipo_cliente, tipoVenta:tipo_venta, lote, presentacion, cantidad, servicios, items, valor, estado, metodo, ts';
const GENERICOS = ['', 'venta directa', 'n/a', '-'];

async function registrarCliente(supabase: ReturnType<typeof getSupabase>, nombre: unknown, tipoCliente: unknown) {
  const limpio = String(nombre || '').trim();
  if (!limpio || GENERICOS.includes(limpio.toLowerCase())) return;
  try {
    await supabase.from('clientes').upsert(
      { nombre: limpio, tipo_cliente: String(tipoCliente || 'Cliente normal'), ts: Date.now() },
      { onConflict: 'nombre' }
    );
  } catch {
    // El directorio es un apoyo: si falla no debe tumbar el registro de la venta.
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('ventas').select(SELECT_VENTA);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// El cuerpo trae un pedido completo: { ...datos del cliente, items: [...], valor, estado, metodo }
// Cada item es { tipo:'cafe', lote, presentacion, cantidad, valor } o
// { tipo:'maquila', servicio, presentacion (o null si se cobra por kg), cantidad, valor }.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const items = Array.isArray(body.items) ? body.items : [];
  const valor = Number(body.valor) || items.reduce((s: number, it: any) => s + (Number(it.valor) || 0), 0);

  const { data: row, error } = await supabase
    .from('ventas')
    .insert({
      usuario: body.usuario,
      cliente: body.cliente,
      tipo_cliente: body.tipoCliente,
      tipo_venta: 'pedido',
      lote: null,
      presentacion: null,
      cantidad: 1,
      servicios: null,
      items,
      valor,
      estado: body.estado,
      metodo: body.metodo || '',
      ts: body.ts || Date.now(),
    })
    .select(SELECT_VENTA)
    .single();

  if (error) return new Response(error.message, { status: 500 });

  await registrarCliente(supabase, body.cliente, body.tipoCliente);

  // Suma cuántas libras se venden de cada lote en este pedido (puede tener
  // varias líneas del mismo lote) y descuenta el inventario una sola vez por lote.
  const librasPorLote: Record<string, number> = {};
  for (const it of items) {
    if (it && it.tipo === 'cafe' && it.lote && it.presentacion) {
      const lb = kilosVendidos(it.presentacion, Number(it.cantidad) || 0);
      librasPorLote[it.lote] = (librasPorLote[it.lote] || 0) + lb;
    }
  }
  for (const [lote, lb] of Object.entries(librasPorLote)) {
    if (lb > 0) {
      const { data: inv } = await supabase.from('inventario').select('id, stock_lb').eq('lote', lote).single();
      if (inv) {
        await supabase.from('inventario').update({ stock_lb: Number(inv.stock_lb) - lb, ts: Date.now() }).eq('id', inv.id);
      }
    }
  }

  return Response.json(row, { status: 201 });
};
