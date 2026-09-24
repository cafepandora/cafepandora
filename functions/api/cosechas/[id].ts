import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { aplicarTrilla, revertirTrilla } from '../../_lib/verde.js';

const SELECT = 'id, fecha, kilosCereza:kilos_cereza, proceso, kilosPergaminoReal:kilos_pergamino_real, kilosVerdeReal:kilos_verde_real, kilosPasilla:kilos_pasilla, verdeGrados:verde_grados, notas, usuario, ts, fermentacionInicio:fermentacion_inicio, fermentacionFin:fermentacion_fin, fermentacionAlertado:fermentacion_alertado';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  // Hace falta el registro actual para dos cosas: ajustar el inventario
  // de pergamino por la DIFERENCIA (no el valor absoluto, para que
  // corregir un dato no descuadre el stock — mismo patrón que
  // ajustar_stock_inventario en tuestes), y revertir un desglose de
  // trilla anterior antes de aplicar uno nuevo si se corrige.
  const { data: actual } = await supabase.from('cosechas').select(SELECT).eq('id', id).single();
  if (!actual) return new Response('Cosecha no encontrada', { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.fecha !== undefined) updates.fecha = Number(body.fecha);
  if (body.kilosCereza !== undefined) updates.kilos_cereza = Math.max(0, Number(body.kilosCereza) || 0);
  if (body.proceso !== undefined) updates.proceso = body.proceso;
  if (body.kilosPergaminoReal !== undefined) updates.kilos_pergamino_real = body.kilosPergaminoReal === null ? null : Math.max(0, Number(body.kilosPergaminoReal) || 0);
  if (body.kilosPasilla !== undefined) updates.kilos_pasilla = body.kilosPasilla === null ? null : Math.max(0, Number(body.kilosPasilla) || 0);
  if (body.notas !== undefined) updates.notas = body.notas;
  if (body.fermentacionInicio !== undefined) {
    updates.fermentacion_inicio = body.fermentacionInicio === null ? null : Number(body.fermentacionInicio);
    updates.fermentacion_alertado = false; // si se corrige el inicio, la alerta se vuelve a evaluar
  }
  if (body.fermentacionFin !== undefined) {
    updates.fermentacion_fin = body.fermentacionFin === null ? null : Number(body.fermentacionFin);
    updates.fermentacion_alertado = false;
  }

  // Pesar pergamino real (⚖️) — suma (o corrige) el inventario de
  // pergamino disponible por la diferencia con lo que ya tenía.
  if (body.kilosPergaminoReal !== undefined) {
    const antes = Number(actual.kilosPergaminoReal) || 0;
    const ahora = body.kilosPergaminoReal == null ? 0 : Math.max(0, Number(body.kilosPergaminoReal) || 0);
    const delta = ahora - antes;
    if (delta !== 0 && actual.proceso) {
      await supabase.rpc('ajustar_stock_pergamino', { p_lote: actual.proceso, p_delta: delta });
    }
  }

  // Trillar (🌾) — body.verdeGrados = { 'Malla 18': kg, ... }. Si ya
  // había un desglose de una trilla anterior, se revierte primero (para
  // que corregirlo no duplique lo sumado).
  if (body.verdeGrados !== undefined) {
    const lote = (body.proceso as string) ?? actual.proceso;
    if (actual.verdeGrados) await revertirTrilla(supabase, actual.proceso, actual.verdeGrados as Record<string, number>);
    if (body.verdeGrados) {
      await aplicarTrilla(supabase, lote, body.verdeGrados);
      updates.kilos_verde_real = Object.values(body.verdeGrados as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
    } else {
      updates.kilos_verde_real = null;
    }
    updates.verde_grados = body.verdeGrados;
  } else if (body.kilosVerdeReal !== undefined) {
    // Corrección manual del total sin desglose (dato viejo, o ajuste a
    // mano) — no toca el inventario de verde, solo el número informativo.
    updates.kilos_verde_real = body.kilosVerdeReal === null ? null : Math.max(0, Number(body.kilosVerdeReal) || 0);
  }

  if (!Object.keys(updates).length) return new Response('Sin cambios', { status: 400 });

  const { data, error } = await supabase.from('cosechas').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;

  const { data: actual } = await supabase.from('cosechas').select(SELECT).eq('id', id).single();

  const { error } = await supabase.from('cosechas').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });

  if (actual && actual.proceso) {
    // Las dos cosas son independientes: revertir la trilla (si la hubo)
    // deja el pergamino como estaba justo DESPUÉS de pesarlo — hace
    // falta además restar ESE pergamino, porque el registro entero
    // desaparece, no solo su trilla.
    if (actual.verdeGrados) {
      await revertirTrilla(supabase, actual.proceso, actual.verdeGrados as Record<string, number>);
    }
    if (Number(actual.kilosPergaminoReal) > 0) {
      await supabase.rpc('ajustar_stock_pergamino', { p_lote: actual.proceso, p_delta: -Number(actual.kilosPergaminoReal) });
    }
  }

  return new Response(null, { status: 204 });
};
