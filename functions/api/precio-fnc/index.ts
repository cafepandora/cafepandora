import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'fecha, precioCarga:precio_carga, bolsaNy:bolsa_ny, tasaCambio:tasa_cambio, ts';

// Historial guardado por el cron de functions/api/cron/precio-fnc.ts —
// la app solo lee, nunca escribe aquí directamente.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('precio_cafe_fnc')
    .select(SELECT).order('fecha', { ascending: false }).limit(60);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
