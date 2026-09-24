import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';
import { aplicarTrilla } from '../../_lib/verde.js';

// Trilla directa del POOL de "pergamino disponible" (inventario_pergamino),
// para pergamino que no está atado a una cosecha/cereza comprada/compra
// puntual en la app — sobre todo el que se siembra con
// "+ Agregar pergamino que ya tenías" (POST /api/inventario-pergamino),
// que hasta ahora no tenía ningún botón 🌾 en ningún lado. A diferencia
// de PATCH /api/cosechas|cereza-comprada|pergamino/:id, esto no revierte
// nada al corregir (no hay ningún registro de origen que guarde su
// propio verde_grados) — es un movimiento de una sola vía, igual que
// "Retirar para tostión".
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();
  const lote = body.lote;
  const verdeGrados: Record<string, number> = body.verdeGrados || {};
  if (!lote || !Object.keys(verdeGrados).length) return new Response('Falta el lote o el desglose de verde', { status: 400 });

  await aplicarTrilla(supabase, lote, verdeGrados, 'Pergamino existente', body.nota || null);
  return Response.json({ ok: true }, { status: 201 });
};
