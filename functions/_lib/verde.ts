// "Sin clasificar" tiene que estar acá igual que en el GRADOS_VERDE de
// index.html — es el destino cuando se trilla sin desglosar por malla
// (checkbox "Desglosar por malla"). Sin él en esta lista, totalGrados()
// contaba 0 kg para un desglose {'Sin clasificar': X} y aplicarTrilla()
// nunca sumaba nada a inventario_verde ni restaba de inventario_pergamino
// — el café quedaba "perdido" entre las dos tablas, sin error visible
// (bug real reportado 2026-09-24: "cuando se añade cafe que no se
// selecciona por mallas igual debería poderse utilizar... para tostar").
export const GRADOS_VERDE = ['Malla 18', 'Malla 16', 'Malla 14', 'Aprovechable', 'Pasilla', 'Sin clasificar'];

function totalGrados(verdeGrados: Record<string, number>): number {
  return GRADOS_VERDE.reduce((s, g) => s + (Number(verdeGrados[g]) || 0), 0);
}

// Deja registro de cada entrada/salida con su origen ("Cosecha propia",
// "Compra a Don Leo", "Retiro para tostión"...) — el inventario en sí
// sigue siendo un solo número por lote (o lote+malla), esto es solo para
// poder ver de dónde vino cada aporte sin separar el stock por proveedor.
export async function registrarMovimiento(
  supabase: any,
  m: { etapa: 'pergamino' | 'verde'; lote: string; grado?: string | null; kilos: number; origen: string; referencia?: string | null; fecha?: number }
) {
  if (!m.kilos) return;
  await supabase.from('movimientos_inventario_cafe').insert({
    fecha: m.fecha || Date.now(),
    etapa: m.etapa,
    lote: m.lote,
    grado: m.grado || null,
    kilos: m.kilos,
    origen: m.origen,
    referencia: m.referencia || null,
    ts: Date.now(),
  });
}

// Ajusta un stock por RPC y TIRA si Supabase devuelve error — antes estas
// llamadas no revisaban `error` para nada: si la función SQL fallaba (o,
// antes de la migración de robustez, si la fila lote/malla no existía
// todavía y el UPDATE no tocaba nada), el código seguía como si hubiera
// funcionado, sin ningún aviso, y hasta dejaba un movimiento en el
// historial de un ajuste que en realidad nunca pasó. Bug real reportado
// 2026-09-25 (pergamino que "desaparecía" al trillarlo). Ver
// migracion_robustez_inventario_cafe.sql para el otro lado del arreglo
// (las funciones SQL pasaron de UPDATE a UPSERT).
async function ajustarStock(supabase: any, fn: 'ajustar_stock_pergamino' | 'ajustar_stock_verde', params: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, params);
  if (error) throw new Error(`${fn} falló: ${error.message}`);
}

// Wrappers exportados — cualquier endpoint que toque directamente el
// inventario de pergamino/verde (⚖️ pesar, comprar pergamino directo,
// retirar para tostión…) debe usar ESTOS en vez de `supabase.rpc(...)` a
// mano, para no repetir el mismo hueco de "falla en silencio".
export async function ajustarStockPergamino(supabase: any, lote: string, delta: number) {
  if (!delta) return;
  await ajustarStock(supabase, 'ajustar_stock_pergamino', { p_lote: lote, p_delta: delta });
}
export async function ajustarStockVerde(supabase: any, lote: string, grado: string, delta: number) {
  if (!delta) return;
  await ajustarStock(supabase, 'ajustar_stock_verde', { p_lote: lote, p_grado: grado, p_delta: delta });
}

// Efecto de trillar: resta del inventario de pergamino disponible lo que
// se consumió, y suma cada malla del desglose al inventario de verde —
// mismo lote para las dos cosas, trillar no cambia el proceso/lote.
export async function aplicarTrilla(supabase: any, lote: string, verdeGrados: Record<string, number>, origen: string, referencia?: string | null) {
  const total = totalGrados(verdeGrados);
  if (total > 0) {
    await ajustarStock(supabase, 'ajustar_stock_pergamino', { p_lote: lote, p_delta: -total });
    await registrarMovimiento(supabase, { etapa: 'pergamino', lote, kilos: -total, origen: 'Trilla: ' + origen, referencia });
  }
  for (const grado of GRADOS_VERDE) {
    const kg = Number(verdeGrados[grado]) || 0;
    if (kg > 0) {
      await ajustarStock(supabase, 'ajustar_stock_verde', { p_lote: lote, p_grado: grado, p_delta: kg });
      await registrarMovimiento(supabase, { etapa: 'verde', lote, grado, kilos: kg, origen, referencia });
    }
  }
}

// Revierte aplicarTrilla() — al borrar un registro que ya había trillado,
// o antes de aplicar un desglose corregido.
export async function revertirTrilla(supabase: any, lote: string, verdeGrados: Record<string, number>, origen: string, referencia?: string | null) {
  const total = totalGrados(verdeGrados);
  if (total > 0) {
    await ajustarStock(supabase, 'ajustar_stock_pergamino', { p_lote: lote, p_delta: total });
    await registrarMovimiento(supabase, { etapa: 'pergamino', lote, kilos: total, origen: 'Corrección: ' + origen, referencia });
  }
  for (const grado of GRADOS_VERDE) {
    const kg = Number(verdeGrados[grado]) || 0;
    if (kg > 0) {
      await ajustarStock(supabase, 'ajustar_stock_verde', { p_lote: lote, p_grado: grado, p_delta: -kg });
      await registrarMovimiento(supabase, { etapa: 'verde', lote, grado, kilos: -kg, origen: 'Corrección: ' + origen, referencia });
    }
  }
}
