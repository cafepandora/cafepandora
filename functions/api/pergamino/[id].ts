import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { aplicarTrilla, revertirTrilla, registrarMovimiento, ajustarStockPergamino } from '../../_lib/verde.js';

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
    try {
      if (actual.verdeGrados) await revertirTrilla(supabase, actual.proceso, actual.verdeGrados as Record<string, number>, 'Pergamino comprado', actual.proveedor);
      if (body.verdeGrados) {
        await aplicarTrilla(supabase, actual.proceso, body.verdeGrados, 'Pergamino comprado', actual.proveedor);
        updates.kilos_verde_real = Object.values(body.verdeGrados as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
      } else {
        updates.kilos_verde_real = null;
      }
      updates.verde_grados = body.verdeGrados;
    } catch (err: any) {
      return new Response(err.message || 'No se pudo trillar', { status: 500 });
    }
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
    try {
      if (actual.verdeGrados) {
        await revertirTrilla(supabase, actual.proceso, actual.verdeGrados as Record<string, number>, 'Pergamino comprado (registro eliminado)', actual.proveedor);
      }
      if (Number(actual.kilosPergamino) > 0) {
        await ajustarStockPergamino(supabase, actual.proceso, -Number(actual.kilosPergamino));
        await registrarMovimiento(supabase, { etapa: 'pergamino', lote: actual.proceso, kilos: -Number(actual.kilosPergamino), origen: 'Pergamino comprado (registro eliminado)', referencia: actual.proveedor });
      }
    } catch (err: any) {
      return new Response('Se eliminó la compra, pero no se pudo corregir el inventario: ' + (err.message || ''), { status: 500 });
    }
  }

  return new Response(null, { status: 204 });
};
