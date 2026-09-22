import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

// Costos internos editables para "Margen estimado por lote" (Resumen) —
// una sola fila (id fijo 1), se sobreescribe con upsert, no hay histórico.
const SELECT = 'costoTostionKg:costo_tostion_kg, costoBolsaMediaLb:costo_bolsa_media_lb, costoBolsaLibra:costo_bolsa_libra, costoBolsaKilo:costo_bolsa_kilo, costoBolsaCuarteron:costo_bolsa_cuarteron, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('costos_margen').select(SELECT).eq('id', 1).maybeSingle();
  if (error) return new Response(error.message, { status: 500 });
  // Sin fila todavía (nadie los ha puesto) — todo en 0, el cálculo de
  // margen simplemente no resta nada por bolsa/tostión/cosecha propia.
  return Response.json(data || { costoTostionKg: 0, costoBolsaMediaLb: 0, costoBolsaLibra: 0, costoBolsaKilo: 0, costoBolsaCuarteron: 0, ts: null });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const num = (v: any) => Math.max(0, Number(v) || 0);
  const { data, error } = await supabase.from('costos_margen').upsert({
    id: 1,
    costo_tostion_kg: num(body.costoTostionKg),
    costo_bolsa_media_lb: num(body.costoBolsaMediaLb),
    costo_bolsa_libra: num(body.costoBolsaLibra),
    costo_bolsa_kilo: num(body.costoBolsaKilo),
    costo_bolsa_cuarteron: num(body.costoBolsaCuarteron),
    ts: Date.now(),
  }, { onConflict: 'id' }).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
