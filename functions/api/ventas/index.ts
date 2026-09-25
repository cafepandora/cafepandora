import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth, requireAuthConUsuario } from '../../_lib/auth.js';
import { ajustarInventarioPorLote, itemsCafeParaInventario } from '../../_lib/convert.js';

const SELECT_VENTA = 'id, usuario, cliente, tipoCliente:tipo_cliente, tipoVenta:tipo_venta, lote, presentacion, cantidad, servicios, items, valor, estado, estadoEnvio:estado_envio, metodo, recibidoPor:recibido_por, guiaEnvio:guia_envio, origenWeb:origen_web, creadoPor:creado_por, ts';
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
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('ventas').select(SELECT_VENTA);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// El cuerpo trae un pedido completo: { ...datos del cliente, items: [...], valor, estado, metodo }
// Cada item es { tipo:'cafe', lote, presentacion, cantidad, valor } o
// { tipo:'maquila', servicio, presentacion (o null si se cobra por kg), cantidad, valor }.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { error: authError, email } = await requireAuthConUsuario(context.request, context.env);
  if (authError) return authError;

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
      estado_envio: body.estadoEnvio || 'Pendiente',
      origen_web: !!body.origenWeb,
      metodo: body.metodo || '',
      recibido_por: body.recibidoPor || null,
      creado_por: email,
      ts: body.ts || Date.now(),
    })
    .select(SELECT_VENTA)
    .single();

  if (error) return new Response(error.message, { status: 500 });

  await registrarCliente(supabase, body.cliente, body.tipoCliente);

  // Descuenta el inventario de cada lote de café que traiga el pedido, de
  // forma atómica (no se pierde nada aunque otro celular venda al mismo tiempo).
  try {
    await ajustarInventarioPorLote(supabase, itemsCafeParaInventario(row), -1);
  } catch (err: any) {
    return new Response('Se guardó la venta, pero no se pudo descontar del inventario: ' + (err.message || ''), { status: 500 });
  }

  return Response.json(row, { status: 201 });
};
