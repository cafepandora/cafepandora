import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('inventario')
    .select('id, lote, stockLb:stock_lb, ts')
    .order('lote');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
