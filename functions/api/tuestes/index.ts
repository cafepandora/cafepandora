import { getSupabase, Env } from '../../_lib/supabase.js';

const SELECT = 'id, fecha, lote, kilosVerde:kilos_verde, kilosTostado:kilos_tostado, origen, notasCata:notas_cata, usuario, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('lotes_tueste').select(SELECT).order('fecha', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// Registrar un tueste SUMA los kilos tostados al inventario de ese lote.
// Es la única entrada de stock del sistema: todo lo demás solo resta.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const kilosTostado = Math.max(0, Number(body.kilosTostado) || 0);

  const { data, error } = await supabase.from('lotes_tueste').insert({
    fecha: body.fecha || Date.now(),
    lote: body.lote,
    kilos_verde: Math.max(0, Number(body.kilosVerde) || 0),
    kilos_tostado: kilosTostado,
    origen: body.origen || null,
    notas_cata: body.notasCata || null,
    usuario: body.usuario || null,
    ts: Date.now(),
  }).select(SELECT).single();

  if (error) return new Response(error.message, { status: 500 });

  if (kilosTostado > 0 && body.lote) {
    await supabase.rpc('ajustar_stock_inventario', { p_lote: body.lote, p_delta: kilosTostado });
  }

  return Response.json(data, { status: 201 });
};
