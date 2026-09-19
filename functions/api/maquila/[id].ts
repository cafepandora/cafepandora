import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  if (body.precio === undefined) return new Response('Falta precio', { status: 400 });

  const { data: row, error } = await supabase
    .from('maquila_tarifas')
    .update({ precio: Number(body.precio) || 0, ts: Date.now() })
    .eq('id', id)
    .select('id, servicio, presentacion, precio, ts')
    .single();
  if (error) return new Response(error.message, { status: 500 });
  if (!row) return new Response('Servicio no encontrado', { status: 404 });
  return Response.json(row);
};
