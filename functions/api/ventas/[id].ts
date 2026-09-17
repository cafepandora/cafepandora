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
  } catch {}
}

// Si el body trae "nuevosItems" (líneas que se le agregaron a un pedido ya
// existente, ej. una maquila que se va completando en varios días), se
// descuenta el inventario SOLO por esas líneas nuevas — las que ya estaban
// en el pedido no se vuelven a tocar.
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const updates: Record<string, unknown> = {};
  if (body.usuario !== undefined) updates.usuario = body.usuario;
  if (body.cliente !== undefined) updates.cliente = body.cliente;
  if (body.tipoCliente !== undefined) updates.tipo_cliente = body.tipoCliente;
  if (body.tipoVenta !== undefined) updates.tipo_venta = body.tipoVenta;
  if (body.lote !== undefined) updates.lote = body.lote;
  if (body.presentacion !== undefined) updates.presentacion = body.presentacion;
  if (body.cantidad !== undefined) updates.cantidad = Number(body.cantidad) || 1;
  if (body.servicios !== undefined) updates.servicios = body.servicios;
  if (body.items !== undefined) updates.items = body.items;
  if (body.valor !== undefined) updates.valor = Number(body.valor) || 0;
  if (body.estado !== undefined) updates.estado = body.estado;
  if (body.metodo !== undefined) updates.metodo = body.metodo;
  if (body.ts !== undefined) updates.ts = Number(body.ts);

  if (Object.keys(updates).length === 0) return new Response('Sin cambios', { status: 400 });

  const { data: row, error } = await supabase.from('ventas').update(updates).eq('id', id).select(SELECT_VENTA).single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Venta no encontrada', { status: 404 });

  if (body.cliente !== undefined) await registrarCliente(supabase, row.cliente, row.tipoCliente);

  const nuevosItems = Array.isArray(body.nuevosItems) ? body.nuevosItems : [];
  if (nuevosItems.length) {
    const librasPorLote: Record<string, number> = {};
    for (const it of nuevosItems) {
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
  }

  return Response.json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const { error } = await supabase.from('ventas').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
