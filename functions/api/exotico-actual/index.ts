import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

// Una sola fila (id fijo 1, upsert, sin histórico) — mismo patrón que
// costos_margen. Con login: lo usa la app interna para que Juan vea/edite
// el exótico actual (foto, nombre, descripción, unidades disponibles).
// El catálogo público lee lo mismo, campo por campo, pero sin login, por
// /api/exotico-publico — dos endpoints en vez de uno solo condicional,
// mismo criterio que blog/blog-publico y merch/merch-publico.
const SELECT = 'variedad, descripcion, imagen, stock, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('exotico_actual').select(SELECT).eq('id', 1).maybeSingle();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data || { variedad: '', descripcion: '', imagen: '', stock: 0, ts: null });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const { data, error } = await supabase.from('exotico_actual').upsert({
    id: 1,
    variedad: String(body.variedad || '').trim().slice(0, 80) || null,
    descripcion: String(body.descripcion || '').trim().slice(0, 200) || null,
    imagen: body.imagen || null,
    stock: Math.max(0, Math.round(Number(body.stock) || 0)),
    ts: Date.now(),
  }, { onConflict: 'id' }).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};
