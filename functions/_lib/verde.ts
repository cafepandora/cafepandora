export const GRADOS_VERDE = ['Malla 18', 'Malla 16', 'Malla 14', 'Aprovechable', 'Pasilla'];

function totalGrados(verdeGrados: Record<string, number>): number {
  return GRADOS_VERDE.reduce((s, g) => s + (Number(verdeGrados[g]) || 0), 0);
}

// Efecto de trillar: resta del inventario de pergamino disponible lo que
// se consumió, y suma cada malla del desglose al inventario de verde —
// mismo lote para las dos cosas, trillar no cambia el proceso/lote.
export async function aplicarTrilla(supabase: any, lote: string, verdeGrados: Record<string, number>) {
  const total = totalGrados(verdeGrados);
  if (total > 0) await supabase.rpc('ajustar_stock_pergamino', { p_lote: lote, p_delta: -total });
  for (const grado of GRADOS_VERDE) {
    const kg = Number(verdeGrados[grado]) || 0;
    if (kg > 0) await supabase.rpc('ajustar_stock_verde', { p_lote: lote, p_grado: grado, p_delta: kg });
  }
}

// Revierte aplicarTrilla() — al borrar un registro que ya había trillado,
// o antes de aplicar un desglose corregido.
export async function revertirTrilla(supabase: any, lote: string, verdeGrados: Record<string, number>) {
  const total = totalGrados(verdeGrados);
  if (total > 0) await supabase.rpc('ajustar_stock_pergamino', { p_lote: lote, p_delta: total });
  for (const grado of GRADOS_VERDE) {
    const kg = Number(verdeGrados[grado]) || 0;
    if (kg > 0) await supabase.rpc('ajustar_stock_verde', { p_lote: lote, p_grado: grado, p_delta: -kg });
  }
}
