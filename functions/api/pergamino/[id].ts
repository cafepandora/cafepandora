import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { aplicarTrilla, revertirTrilla } from '../../_lib/verde.js';

const SELECT = 'id, fecha, proveedor, kilosPergamino:kilos_pergamino, proceso, costo, kilosVerdeReal:kilos_verde_real, verdeGrados:verde_grados, notas, usuario, ts';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const body: any = await context.request.json();

  const { data: actual } = await supabase.from('compras_pergamino').select(SELECT).eq('id', id).single();
  if (!actual) return new Response('Compra no encontrada', { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.kilosVerdeReal !== undefined) updates.kilos_verde_real = body.kilosVerdeReal === null ? null : Math.max(0, Number(body.kilosVerdeReal) || 0);
  if (body.proveedor !== undefined) updates.proveedor = body.proveedor;
  if (body.notas !== undefined) updates.notas = body.notas;

  // Trillar (🌾) — este pergamino ya sumó al inventario disponible desde
  // que se compró (POST), así que acá solo aplica la trilla en sí.
  if (body.verdeGrados !== undefined) {
    if (actual.verdeGrados) await revertirTrilla(supabase, actual.proceso, actual.verdeGrados as Record<string, number>);
    if (body.verdeGrados) {
      await aplicarTrilla(supabase, actual.proceso, body.verdeGrados);
      updates.kilos_verde_real = Object.values(body.verdeGrados as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
    } else {
      updates.kilos_verde_real = null;
    }
    updates.verde_grados = body.verdeGrados;
  }

  if (!Object.keys(updates).length) return new Response('Sin cambios', { status: 400 });

  const { data, error } = await supabase.from('compras_pergamino').update(updates).eq('id', id).select(SELECT).single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const id = context.params.id as string;

  const { data: actual } = await supabase.from('compras_pergamino').select(SELECT).eq('id', id).single();

  const { error } = await supabase.from('compras_pergamino').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });

  if (actual && actual.proceso) {
    if (actual.verdeGrados) {
      await revertirTrilla(supabase, actual.proceso, actual.verdeGrados as Record<string, number>);
    }
    if (Number(actual.kilosPergamino) > 0) {
      await supabase.rpc('ajustar_stock_pergamino', { p_lote: actual.proceso, p_delta: -Number(actual.kilosPergamino) });
    }
  }

  return new Response(null, { status: 204 });
};
