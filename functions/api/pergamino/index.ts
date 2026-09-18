import { getSupabase, Env } from '../../_lib/supabase.js';

const SELECT = 'id, fecha, proveedor, kilosPergamino:kilos_pergamino, proceso, costo, notas, usuario, ts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('compras_pergamino').select(SELECT).order('fecha', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const { data, error } = await supabase.from('compras_pergamino').insert({
    fecha: body.fecha || Date.now(),
    proveedor: body.proveedor,
    kilos_pergamino: Math.max(0, Number(body.kilosPergamino) || 0),
    proceso: body.proceso,
    costo: Math.max(0, Number(body.costo) || 0),
    notas: body.notas || null,
    usuario: body.usuario || null,
    ts: Date.now(),
  }).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
