import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { ajustarInventarioPorLote, itemsCafeParaInventario } from '../../_lib/convert.js';

const SELECT_VENTA = 'id, usuario, cliente, tipoCliente:tipo_cliente, tipoVenta:tipo_venta, lote, presentacion, cantidad, servicios, items, valor, estado, estadoEnvio:estado_envio, metodo, recibidoPor:recibido_por, guiaEnvio:guia_envio, origenWeb:origen_web, ts';
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
// existente) se descuenta inventario por esas. Si trae "itemsRemovidos"
// (líneas originales que se quitaron al editar) se le devuelve el
// inventario correspondiente. Ambos ajustes son atómicos por lote.
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

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
  if (body.estadoEnvio !== undefined) updates.estado_envio = body.estadoEnvio;
  if (body.metodo !== undefined) updates.metodo = body.metodo;
  if (body.recibidoPor !== undefined) updates.recibido_por = body.recibidoPor;
  if (body.ts !== undefined) updates.ts = Number(body.ts);
  if (body.guiaEnvio !== undefined) updates.guia_envio = body.guiaEnvio;

  if (Object.keys(updates).length === 0) return new Response('Sin cambios', { status: 400 });

  const { data: row, error } = await supabase.from('ventas').update(updates).eq('id', id).select(SELECT_VENTA).single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Venta no encontrada', { status: 404 });

  if (body.cliente !== undefined) await registrarCliente(supabase, row.cliente, row.tipoCliente);

  try {
    const nuevosItems = Array.isArray(body.nuevosItems) ? body.nuevosItems : [];
    if (nuevosItems.length) {
      await ajustarInventarioPorLote(supabase, itemsCafeParaInventario({ items: nuevosItems }), -1);
    }
    const itemsRemovidos = Array.isArray(body.itemsRemovidos) ? body.itemsRemovidos : [];
    if (itemsRemovidos.length) {
      await ajustarInventarioPorLote(supabase, itemsCafeParaInventario({ items: itemsRemovidos }), 1);
    }
  } catch (err: any) {
    return new Response('Se guardó la edición, pero no se pudo ajustar el inventario: ' + (err.message || ''), { status: 500 });
  }

  return Response.json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;

  // Antes de borrar, revisa qué café traía esta venta, para devolverlo al inventario.
  const { data: venta } = await supabase.from('ventas').select(SELECT_VENTA).eq('id', id).single();

  const { error } = await supabase.from('ventas').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });

  if (venta) {
    try {
      await ajustarInventarioPorLote(supabase, itemsCafeParaInventario(venta), 1);
    } catch (err: any) {
      return new Response('Se eliminó la venta, pero no se pudo devolver el inventario: ' + (err.message || ''), { status: 500 });
    }
  }

  return new Response(null, { status: 204 });
};
