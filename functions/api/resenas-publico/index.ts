import { getSupabase, Env } from '../../_lib/supabase.js';

// Mismos 4 lotes que ofrece el catálogo público (LOTES en index.html) —
// Pasilla no se vende ahí, así que no tiene sentido dejarle reseñas acá.
const LOTES_VALIDOS = ['Lavado', 'Honey', 'Natural', 'Exotico'];

const SELECT = 'id, lote, nombre, calificacion, comentario, ts';

// GET y POST son los dos públicos (sin clave) — la página de pedidos los
// llama directo, sin pasar por apiFetch/login, igual que catalogo-publico
// y pedidos-web. No hay tabla de moderación: la reseña se ve de una,
// apenas se publica (ver el comentario de migracion_resenas.sql).
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('resenas').select(SELECT).order('ts', { ascending: false }).limit(500);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const lote = String(body.lote || '');
  if (!LOTES_VALIDOS.includes(lote)) return new Response('Lote inválido', { status: 400 });

  const calificacion = Number(body.calificacion);
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return new Response('La calificación debe ser un número entero de 1 a 5', { status: 400 });
  }

  const nombre = String(body.nombre || '').trim().slice(0, 60) || null;
  const comentario = String(body.comentario || '').trim().slice(0, 500) || null;

  const { data, error } = await supabase.from('resenas').insert({
    lote,
    nombre,
    calificacion,
    comentario,
    ts: Date.now(),
  }).select(SELECT).single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
