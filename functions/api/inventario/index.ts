import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('inventario')
    .select('id, lote, stockLb:stock_lb, ts')
    .order('lote');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
