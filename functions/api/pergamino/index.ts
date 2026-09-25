import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth, requireAuthConUsuario } from '../../_lib/auth.js';
import { registrarMovimiento, ajustarStockPergamino } from '../../_lib/verde.js';

const SELECT = 'id, fecha, proveedor, kilosPergamino:kilos_pergamino, proceso, costo, kilosVerdeReal:kilos_verde_real, notas, usuario, ts, creadoPor:creado_por';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('compras_pergamino').select(SELECT).order('fecha', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { error: authError, email } = await requireAuthConUsuario(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const kilosPergamino = Math.max(0, Number(body.kilosPergamino) || 0);
  const { data, error } = await supabase.from('compras_pergamino').insert({
    fecha: body.fecha || Date.now(),
    proveedor: body.proveedor,
    kilos_pergamino: kilosPergamino,
    proceso: body.proceso,
    costo: Math.max(0, Number(body.costo) || 0),
    notas: body.notas || null,
    usuario: body.usuario || null,
    creado_por: email,
    ts: Date.now(),
  }).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });

  // Este pergamino ya está seco y en bodega — a diferencia de cosecha
  // propia / cereza comprada, acá no hay un paso de "pesar" aparte, así
  // que suma al inventario de pergamino disponible desde ya.
  if (kilosPergamino > 0 && body.proceso) {
    try {
      await ajustarStockPergamino(supabase, body.proceso, kilosPergamino);
      await registrarMovimiento(supabase, { etapa: 'pergamino', lote: body.proceso, kilos: kilosPergamino, origen: 'Pergamino comprado', referencia: body.proveedor, fecha: body.fecha });
    } catch (err: any) {
      return new Response('Se guardó la compra, pero no se pudo sumar al inventario de pergamino: ' + (err.message || ''), { status: 500 });
    }
  }

  return Response.json(data, { status: 201 });
};
