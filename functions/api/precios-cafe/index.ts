import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase
    .from('precios_cafe')
    .select('id, lote, presentacion, tipoCliente:tipo_cliente, precio, ts')
    .order('lote')
    .order('tipo_cliente');
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// Antes esta tabla solo tenía PATCH — una fila (lote/presentación/tipo de
// cliente) que no existiera todavía solo se podía crear con una migración a
// mano (ver migracion_pasilla.sql, migracion_precios_mayorista_interno.sql).
// Con esto, Configuración → Precios → "Agregar un precio nuevo" puede
// crearla directo, sin pedir un cambio de código cada vez.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const lote = body.lote;
  const presentacion = body.presentacion;
  const tipoCliente = body.tipoCliente;
  if (!lote || !presentacion || !tipoCliente) return new Response('Falta lote, presentación o tipo de cliente', { status: 400 });

  const { data: existente } = await supabase
    .from('precios_cafe')
    .select('id')
    .eq('lote', lote).eq('presentacion', presentacion).eq('tipo_cliente', tipoCliente)
    .maybeSingle();
  if (existente) return new Response('Ya existe un precio para esa combinación de lote/presentación/tipo de cliente', { status: 409 });

  const { data: row, error } = await supabase
    .from('precios_cafe')
    .insert({ lote, presentacion, tipo_cliente: tipoCliente, precio: Number(body.precio) || 0, ts: Date.now() })
    .select('id, lote, presentacion, tipoCliente:tipo_cliente, precio, ts')
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(row);
};
