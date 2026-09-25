import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { aplicarTrilla, revertirTrilla, registrarMovimiento, ajustarStockPergamino } from '../../_lib/verde.js';

const SELECT = 'id, fecha, proveedor, kilosCereza:kilos_cereza, proceso, costo, pagadoPor:pagado_por, kilosPergaminoReal:kilos_pergamino_real, kilosVerdeReal:kilos_verde_real, verdeGrados:verde_grados, notas, usuario, ts, pesajes';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const { data: actual } = await supabase.from('compras_cereza').select(SELECT).eq('id', id).single();
  if (!actual) return new Response('Compra no encontrada', { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.fecha !== undefined) updates.fecha = Number(body.fecha);
  if (body.proveedor !== undefined) updates.proveedor = body.proveedor;
  if (body.kilosCereza !== undefined) updates.kilos_cereza = Math.max(0, Number(body.kilosCereza) || 0);
  if (body.proceso !== undefined) updates.proceso = body.proceso;
  if (body.costo !== undefined) updates.costo = Math.max(0, Number(body.costo) || 0);
  if (body.pagadoPor !== undefined) updates.pagado_por = body.pagadoPor;
  if (body.kilosPergaminoReal !== undefined) updates.kilos_pergamino_real = body.kilosPergaminoReal === null ? null : Math.max(0, Number(body.kilosPergaminoReal) || 0);
  if (body.notas !== undefined) updates.notas = body.notas;
  if (body.pesajes !== undefined) updates.pesajes = Array.isArray(body.pesajes) ? body.pesajes : null;

  try {
    // Pesar pergamino real (⚖️, solo o repartido desde "Pesar en conjunto")
    // — suma/corrige el inventario de pergamino disponible por la diferencia.
    if (body.kilosPergaminoReal !== undefined) {
      const antes = Number(actual.kilosPergaminoReal) || 0;
      const ahora = body.kilosPergaminoReal == null ? 0 : Math.max(0, Number(body.kilosPergaminoReal) || 0);
      const delta = ahora - antes;
      if (delta !== 0 && actual.proceso) {
        await ajustarStockPergamino(supabase, actual.proceso, delta);
        await registrarMovimiento(supabase, { etapa: 'pergamino', lote: actual.proceso, kilos: delta, origen: 'Cereza comprada', referencia: actual.proveedor, fecha: actual.fecha });
      }
    }

    // Trillar (🌾) — mismo mecanismo que cosechas/[id].ts.
    if (body.verdeGrados !== undefined) {
      const lote = (body.proceso as string) ?? actual.proceso;
      if (actual.verdeGrados) await revertirTrilla(supabase, actual.proceso, actual.verdeGrados as Record<string, number>, 'Cereza comprada', actual.proveedor);
      if (body.verdeGrados) {
        await aplicarTrilla(supabase, lote, body.verdeGrados, 'Cereza comprada', actual.proveedor);
        updates.kilos_verde_real = Object.values(body.verdeGrados as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
      } else {
        updates.kilos_verde_real = null;
      }
      updates.verde_grados = body.verdeGrados;
    } else if (body.kilosVerdeReal !== undefined) {
      updates.kilos_verde_real = body.kilosVerdeReal === null ? null : Math.max(0, Number(body.kilosVerdeReal) || 0);
    }
  } catch (err: any) {
    return new Response(err.message || 'No se pudo ajustar el inventario', { status: 500 });
  }

  if (!Object.keys(updates).length) return new Response('Sin cambios', { status: 400 });

  const { data, error } = await supabase.from('compras_cereza').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;

  const { data: actual } = await supabase.from('compras_cereza').select(SELECT).eq('id', id).single();

  const { error } = await supabase.from('compras_cereza').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });

  if (actual && actual.proceso) {
    try {
      if (actual.verdeGrados) {
        await revertirTrilla(supabase, actual.proceso, actual.verdeGrados as Record<string, number>, 'Cereza comprada (registro eliminado)', actual.proveedor);
      }
      if (Number(actual.kilosPergaminoReal) > 0) {
        await ajustarStockPergamino(supabase, actual.proceso, -Number(actual.kilosPergaminoReal));
        await registrarMovimiento(supabase, { etapa: 'pergamino', lote: actual.proceso, kilos: -Number(actual.kilosPergaminoReal), origen: 'Cereza comprada (registro eliminado)', referencia: actual.proveedor });
      }
    } catch (err: any) {
      return new Response('Se eliminó la compra, pero no se pudo corregir el inventario: ' + (err.message || ''), { status: 500 });
    }
  }

  return new Response(null, { status: 204 });
};
