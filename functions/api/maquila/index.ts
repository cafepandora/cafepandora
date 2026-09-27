import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('maquila_tarifas')
    .select('id, servicio, presentacion, precio, ts')
    .order('servicio');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// Antes esta tabla solo tenía PATCH — un servicio nuevo (o una presentación
// nueva de uno que ya existe) solo se podía crear con una migración a mano.
// Con esto, Configuración → Tarifas de maquila → "Agregar una tarifa
// nueva" puede crearla directo. `presentacion` puede venir null (servicios
// que se cobran por kg, como Trilla/Tostión).
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const servicio = (body.servicio || '').trim();
  const presentacion = body.presentacion || null;
  if (!servicio) return new Response('Falta el nombre del servicio', { status: 400 });

  let query = supabase.from('maquila_tarifas').select('id').eq('servicio', servicio);
  query = presentacion ? query.eq('presentacion', presentacion) : query.is('presentacion', null);
  const { data: existente } = await query.maybeSingle();
  if (existente) return new Response('Ya existe una tarifa para ese servicio/presentación', { status: 409 });

  const { data: row, error } = await supabase
    .from('maquila_tarifas')
    .insert({ servicio, presentacion, precio: Number(body.precio) || 0, ts: Date.now() })
    .select('id, servicio, presentacion, precio, ts')
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(row);
};
