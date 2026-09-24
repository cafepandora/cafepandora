import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth, requireAuthConUsuario } from '../../_lib/auth.js';

// Café en cereza comprado a terceros (no de la finca propia) — mismo
// recorrido que una cosecha (cereza → pergamino real → verde real), pero
// con proveedor, costo y quién lo pagó, para que entre al balance de
// cuentas y también aporte a los rendimientos reales (rendimientosReales()
// en index.html suma esta tabla junto con cosechas).
const SELECT = 'id, fecha, proveedor, kilosCereza:kilos_cereza, proceso, costo, pagadoPor:pagado_por, kilosPergaminoReal:kilos_pergamino_real, kilosVerdeReal:kilos_verde_real, notas, usuario, ts, pesajes, creadoPor:creado_por';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('compras_cereza').select(SELECT).order('fecha', { ascending: false });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { error: authError, email } = await requireAuthConUsuario(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const { data, error } = await supabase.from('compras_cereza').insert({
    fecha: body.fecha || Date.now(),
    proveedor: body.proveedor || null,
    kilos_cereza: Math.max(0, Number(body.kilosCereza) || 0),
    proceso: body.proceso,
    costo: Math.max(0, Number(body.costo) || 0),
    pagado_por: body.pagadoPor || null,
    kilos_pergamino_real: body.kilosPergaminoReal != null ? Number(body.kilosPergaminoReal) : null,
    kilos_verde_real: body.kilosVerdeReal != null ? Number(body.kilosVerdeReal) : null,
    notas: body.notas || null,
    usuario: body.usuario || null,
    creado_por: email,
    ts: Date.now(),
    pesajes: Array.isArray(body.pesajes) ? body.pesajes : null,
  }).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
};
