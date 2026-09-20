import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'persona, monto, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('saldos_iniciales').select(SELECT);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// Un solo valor por persona (Juan/Inés/Joaquín/Efectivo) — se sobreescribe
// si ya existía, no se acumula histórico de cambios.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const persona = String(body.persona || '').trim();
  if (!persona) return new Response('Falta persona', { status: 400 });

  const { data, error } = await supabase.from('saldos_iniciales')
    .upsert({ persona, monto: Number(body.monto) || 0, ts: Date.now() }, { onConflict: 'persona' })
    .select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
