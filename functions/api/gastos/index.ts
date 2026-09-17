import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('gastos').select('*');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const { data: row, error } = await supabase
    .from('gastos')
    .insert({
      usuario: body.usuario,
      concepto: body.concepto,
      monto: Number(body.monto) || 0,
      categoria: body.categoria,
      estado: body.estado || 'Pagado',
      ts: body.ts || Date.now(),
    })
    .select()
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(row, { status: 201 });
};
