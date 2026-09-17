import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('maquila_tarifas')
    .select('id, servicio, precioPorKg:precio_por_kg, ts')
    .order('servicio');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
