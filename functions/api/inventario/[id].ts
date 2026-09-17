import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  if (body.stockLb === undefined) return new Response('Falta stockLb', { status: 400 });

  const { data: row, error } = await supabase
    .from('inventario')
    .update({ stock_lb: Number(body.stockLb) || 0, ts: Date.now() })
    .eq('id', id)
    .select('id, lote, stockLb:stock_lb, ts')
    .single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Lote no encontrado', { status: 404 });
  return Response.json(row);
};
