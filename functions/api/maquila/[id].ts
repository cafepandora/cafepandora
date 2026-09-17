import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  if (body.precioPorKg === undefined) return new Response('Falta precioPorKg', { status: 400 });

  const { data: row, error } = await supabase
    .from('maquila_tarifas')
    .update({ precio_por_kg: Number(body.precioPorKg) || 0, ts: Date.now() })
    .eq('id', id)
    .select('id, servicio, precioPorKg:precio_por_kg, ts')
    .single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Servicio no encontrado', { status: 404 });
  return Response.json(row);
};
