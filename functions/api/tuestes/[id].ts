import { getSupabase, Env } from '../../_lib/supabase.js';

const SELECT = 'id, fecha, lote, kilosVerde:kilos_verde, kilosTostado:kilos_tostado, origen, notasCata:notas_cata, usuario, ts';

// Al borrar un tueste hay que devolver el inventario que había sumado,
// igual que al anular una venta se le devuelve el café.
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;

  const { data: tueste } = await supabase.from('lotes_tueste').select(SELECT).eq('id', id).single();

  const { error } = await supabase.from('lotes_tueste').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });

  if (tueste && tueste.kilosTostado > 0 && tueste.lote) {
    await supabase.rpc('ajustar_stock_inventario', { p_lote: tueste.lote, p_delta: -Number(tueste.kilosTostado) });
  }

  return new Response(null, { status: 204 });
};
