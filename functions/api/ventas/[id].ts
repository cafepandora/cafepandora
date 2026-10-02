import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { ajustarInventarioPorLote, itemsCafeParaInventario } from '../../_lib/convert.js';

const SELECT_VENTA = 'id, usuario, cliente, tipoCliente:tipo_cliente, tipoVenta:tipo_venta, lote, presentacion, cantidad, servicios, items, valor, estado, estadoEnvio:estado_envio, metodo, recibidoPor:recibido_por, guiaEnvio:guia_envio, origenWeb:origen_web, ts, fechaPago:fecha_pago';
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

// El inventario se mueve en DOS casos distintos acá, y solo uno a la vez
// en la práctica (el frontend nunca los combina en la misma llamada):
// 1) toggleEstadoEnvio() manda SOLO { estadoEnvio } — si pasa de
//    Pendiente a Enviado, ahí es cuando de verdad se descuenta el café
//    (2026-09-27: "solo se descarga del stock al enviarse", no al
//    registrar el pedido); si pasa de Enviado de vuelta a Pendiente
//    (corrigiendo un error), se devuelve.
// 2) guardarEdicionVenta() manda "nuevosItems"/"itemsRemovidos" (líneas
//    que se agregaron/quitaron al editar) — pero SOLO tiene sentido
//    tocar el inventario por esto si el pedido YA estaba "Enviado"
//    ANTES de esta edición (si todavía no se había enviado, nunca se
//    descontó nada por él, así que editar sus líneas tampoco debe
//    tocar el inventario — se descontará lo que corresponda, completo,
//    el día que de verdad se envíe).
// Por eso hace falta el registro ANTES del update (para saber si ya
// estaba Enviado), igual que ya hacían cosechas/cereza-comprada/pergamino.
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const { data: actual } = await supabase.from('ventas').select(SELECT_VENTA).eq('id', id).single();
  if (!actual) return new Response('Venta no encontrada', { status: 404 });

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
  // fecha_pago: cuándo entró la plata de verdad, separado de `ts` (cuándo
  // se registró el pedido) — "Cobrado" en Resumen se agrupa por esto, no
  // por `ts` (Juan: "lo que queda por cobrar del mes anterior [que] entre
  // en ingresos del mes actual... porque la plata está entrando en este
  // mes"). Se pone sola al pasar a "Pagado" (solo si no estaba Pagado ya
  // — así un PATCH repetido con el mismo estado no la pisa con la fecha
  // de hoy) y se limpia si se corrige de vuelta a "Pendiente".
  if (body.estado !== undefined) {
    updates.estado = body.estado;
    if (body.estado === 'Pagado' && actual.estado !== 'Pagado') updates.fecha_pago = Date.now();
    else if (body.estado !== 'Pagado') updates.fecha_pago = null;
  }
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

  const yaEnviadoAntes = actual.estadoEnvio === 'Enviado';
  try {
    if (body.estadoEnvio !== undefined) {
      // Caso 1: toggleEstadoEnvio() — mueve el inventario completo del
      // pedido, en el sentido que corresponda según hacia dónde cambió.
      const yaEnviadoDespues = row.estadoEnvio === 'Enviado';
      if (!yaEnviadoAntes && yaEnviadoDespues) {
        await ajustarInventarioPorLote(supabase, itemsCafeParaInventario(row), -1);
      } else if (yaEnviadoAntes && !yaEnviadoDespues) {
        await ajustarInventarioPorLote(supabase, itemsCafeParaInventario(row), 1);
      }
    } else if (yaEnviadoAntes) {
      // Caso 2: edición de líneas (guardarEdicionVenta) — solo ajusta si
      // el pedido YA estaba enviado; si seguía pendiente, no había nada
      // descontado todavía y no hay nada que corregir acá.
      const nuevosItems = Array.isArray(body.nuevosItems) ? body.nuevosItems : [];
      if (nuevosItems.length) {
        await ajustarInventarioPorLote(supabase, itemsCafeParaInventario({ items: nuevosItems }), -1);
      }
      const itemsRemovidos = Array.isArray(body.itemsRemovidos) ? body.itemsRemovidos : [];
      if (itemsRemovidos.length) {
        await ajustarInventarioPorLote(supabase, itemsCafeParaInventario({ items: itemsRemovidos }), 1);
      }
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

  // Antes de borrar, revisa qué café traía esta venta, para devolverlo al
  // inventario — SOLO si de verdad se había descontado (ya estaba
  // "Enviado"; un pedido borrado antes de enviarse nunca tocó el
  // inventario, así que no hay nada que devolver).
  const { data: venta } = await supabase.from('ventas').select(SELECT_VENTA).eq('id', id).single();

  const { error } = await supabase.from('ventas').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });

  if (venta && venta.estadoEnvio === 'Enviado') {
    try {
      await ajustarInventarioPorLote(supabase, itemsCafeParaInventario(venta), 1);
    } catch (err: any) {
      return new Response('Se eliminó la venta, pero no se pudo devolver el inventario: ' + (err.message || ''), { status: 500 });
    }
  }

  return new Response(null, { status: 204 });
};
