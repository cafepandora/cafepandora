import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

const SELECT = 'id, fecha, lote, kilosVerde:kilos_verde, kilosTostado:kilos_tostado, kilosTostadoMedia:kilos_tostado_media, kilosTostadoMediaAlta:kilos_tostado_media_alta, origen, notasCata:notas_cata, usuario, ts, grado';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('lotes_tueste').select(SELECT).order('fecha', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// Registra la ENTRADA de verde. El tostado que sale ya no es obligatorio
// aquí — se puede anotar después con PATCH, cuando se sepa cuánto salió
// (y para Lavado, cuánto fue Tostión Media y cuánto Media alta). Solo se
// suma al inventario si ya viene el dato de salida en este mismo registro.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const tieneSalida = body.kilosTostado !== undefined && body.kilosTostado !== null && body.kilosTostado !== '';
  const kilosTostado = tieneSalida ? Math.max(0, Number(body.kilosTostado) || 0) : null;
  const kilosVerde = Math.max(0, Number(body.kilosVerde) || 0);

  const { data, error } = await supabase.from('lotes_tueste').insert({
    fecha: body.fecha || Date.now(),
    lote: body.lote,
    kilos_verde: kilosVerde,
    kilos_tostado: kilosTostado,
    kilos_tostado_media: null,
    kilos_tostado_media_alta: null,
    origen: body.origen || null,
    notas_cata: body.notasCata || null,
    usuario: body.usuario || null,
    grado: body.grado || null,
    ts: Date.now(),
  }).select(SELECT).single();

  if (error) return new Response(error.message, { status: 500 });

  if (tieneSalida && kilosTostado! > 0 && body.lote) {
    await supabase.rpc('ajustar_stock_inventario', { p_lote: body.lote, p_delta: kilosTostado });
  }

  // "Retirar para tostión" desde el inventario de café verde por malla —
  // se descuenta de una vez, apenas entra a tostión (no cuando se pesa
  // lo que sale). Solo cuando el registro trae grado (viene del
  // inventario); un tueste anotado "a mano" sin grado no toca nada.
  if (body.grado && kilosVerde > 0 && body.lote) {
    await supabase.rpc('ajustar_stock_verde', { p_lote: body.lote, p_grado: body.grado, p_delta: -kilosVerde });
  }

  return Response.json(data, { status: 201 });
};
