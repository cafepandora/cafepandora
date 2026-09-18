import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('finca').select('*');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const { data: row, error } = await supabase
    .from('finca')
    .insert({
      concepto: body.concepto,
      categoria: body.categoria,
      monto: Number(body.monto) || 0,
      estado: body.estado || 'Pagado',
      ts: body.ts || Date.now(),
    })
    .select()
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(row, { status: 201 });
};
