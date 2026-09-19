import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, fecha, lote, kilosVerde:kilos_verde, kilosTostado:kilos_tostado, kilosTostadoMedia:kilos_tostado_media, kilosTostadoMediaAlta:kilos_tostado_media_alta, origen, notasCata:notas_cata, usuario, ts';

// Anota (o corrige) cuánto salió tostado de un lote ya registrado. Para
// Lavado se puede desglosar en Tostión Media / Media alta; para los demás
// lotes solo el total. El inventario se ajusta por la DIFERENCIA entre lo
// que ya tenía sumado antes y el nuevo total — así una corrección posterior
// nunca duplica ni descuadra el stock.
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const { data: actual } = await supabase.from('lotes_tueste').select(SELECT).eq('id', id).single();
  if (!actual) return new Response('Tueste no encontrado', { status: 404 });

  const updates: Record<string, unknown> = {};
  let nuevoTotal: number;

  if (body.kilosTostadoMedia !== undefined || body.kilosTostadoMediaAlta !== undefined) {
    const media = Math.max(0, Number(body.kilosTostadoMedia) || 0);
    const mediaAlta = Math.max(0, Number(body.kilosTostadoMediaAlta) || 0);
    updates.kilos_tostado_media = media;
    updates.kilos_tostado_media_alta = mediaAlta;
    nuevoTotal = media + mediaAlta;
  } else {
    nuevoTotal = Math.max(0, Number(body.kilosTostado) || 0);
    updates.kilos_tostado_media = null;
    updates.kilos_tostado_media_alta = null;
  }
  updates.kilos_tostado = nuevoTotal;

  const { data, error } = await supabase.from('lotes_tueste').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });

  const anterior = Number(actual.kilosTostado) || 0;
  const delta = nuevoTotal - anterior;
  if (delta !== 0 && actual.lote) {
    await supabase.rpc('ajustar_stock_inventario', { p_lote: actual.lote, p_delta: delta });
  }

  return Response.json(data);
};

// Al borrar un tueste hay que devolver el inventario que había sumado,
// igual que al anular una venta se le devuelve el café.
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;

  const { data: tueste } = await supabase.from('lotes_tueste').select(SELECT).eq('id', id).single();

  const { error } = await supabase.from('lotes_tueste').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });

  if (tueste && Number(tueste.kilosTostado) > 0 && tueste.lote) {
    await supabase.rpc('ajustar_stock_inventario', { p_lote: tueste.lote, p_delta: -Number(tueste.kilosTostado) });
  }

  return new Response(null, { status: 204 });
};
