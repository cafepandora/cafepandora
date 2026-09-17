import { getSupabase, Env } from '../../_lib/supabase.js';
import { librasVendidas } from '../../_lib/convert.js';

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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const tipoVenta = body.tipoVenta === 'maquila' ? 'maquila' : 'cafe';
  let valor = Number(body.valor) || 0;
  const cantidad = Number(body.cantidad) || 1;

  if (tipoVenta === 'maquila' && Array.isArray(body.servicios) && body.servicios.length && !body.valor) {
    const { data: tarifas } = await supabase.from('maquila_tarifas').select('servicio, precio_por_kg');
    const porNombre = Object.fromEntries((tarifas || []).map((t: any) => [t.servicio, t.precio_por_kg]));
    valor = body.servicios.reduce((acc: number, s: { servicio: string; cantidadKg: number }) => {
      return acc + (porNombre[s.servicio] || 0) * (Number(s.cantidadKg) || 0);
    }, 0);
  }

  const { data: row, error } = await supabase
    .from('ventas')
    .insert({
      usuario: body.usuario,
      cliente: body.cliente,
      tipo_cliente: body.tipoCliente,
      tipo_venta: tipoVenta,
      lote: body.lote || null,
      presentacion: body.presentacion || null,
      cantidad,
      servicios: tipoVenta === 'maquila' ? body.servicios || [] : null,
      items: body.items || [],
      valor,
      estado: body.estado,
      metodo: body.metodo || '',
      ts: body.ts || Date.now(),
    })
    .select(SELECT_VENTA)
    .single();

  if (error) return new Response(error.message, { status: 500 });

  await registrarCliente(supabase, body.cliente, body.tipoCliente);

  // Café vendido de un lote concreto: descuenta del inventario tostado.
  if (tipoVenta === 'cafe' && body.lote && body.presentacion) {
    const lb = librasVendidas(body.presentacion, cantidad);
    if (lb > 0) {
      const { data: inv } = await supabase.from('inventario').select('id, stock_lb').eq('lote', body.lote).single();
      if (inv) {
        await supabase.from('inventario').update({ stock_lb: Number(inv.stock_lb) - lb, ts: Date.now() }).eq('id', inv.id);
      }
    }
  }

  return Response.json(row, { status: 201 });
};
