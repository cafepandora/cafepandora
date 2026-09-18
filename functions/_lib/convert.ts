// El inventario se lleva en kilogramos reales. En Café Pandora "libra" es
// medio kilo exacto (500 g), no la libra imperial (~453 g) — confirmado:
// Media lb = 250 g, Libra = 500 g, Kilo = 1000 g, Cuarterón = 2500 g.
export const KG_POR_PRESENTACION: Record<string, number> = {
  'Media lb': 0.25,
  'Libra': 0.5,
  'Kilo': 1,
  'Cuarterón': 2.5,
};

export function kilosVendidos(presentacion: string, cantidad: number): number {
  const factor = KG_POR_PRESENTACION[presentacion] ?? 0;
  return factor * (Number(cantidad) || 0);
}

export interface ItemCafe {
  lote: string;
  presentacion: string;
  cantidad: number;
}

// Del array "items" de una venta (o de una fila vieja de una sola línea),
// saca solo las líneas de café con lote+presentación, listas para ajustar inventario.
export function itemsCafeParaInventario(venta: any): ItemCafe[] {
  const out: ItemCafe[] = [];
  if (venta && Array.isArray(venta.items) && venta.items.length && venta.items[0] && venta.items[0].tipo) {
    for (const it of venta.items) {
      if (it.tipo === 'cafe' && it.lote && it.presentacion) {
        out.push({ lote: it.lote, presentacion: it.presentacion, cantidad: Number(it.cantidad) || 0 });
      }
    }
  } else if (venta && venta.tipoVenta !== 'maquila' && venta.lote && venta.presentacion) {
    out.push({ lote: venta.lote, presentacion: venta.presentacion, cantidad: Number(venta.cantidad) || 1 });
  }
  return out;
}

// Suma (signo=1) o resta (signo=-1) el stock de cada lote involucrado, en
// una sola operación atómica por lote (vía la función SQL
// ajustar_stock_inventario), para que dos ventas simultáneas nunca se pisen.
export async function ajustarInventarioPorLote(supabase: any, itemsCafe: ItemCafe[], signo: 1 | -1) {
  const kgPorLote: Record<string, number> = {};
  for (const it of itemsCafe) {
    const kg = kilosVendidos(it.presentacion, it.cantidad);
    kgPorLote[it.lote] = (kgPorLote[it.lote] || 0) + kg;
  }
  for (const [lote, kg] of Object.entries(kgPorLote)) {
    if (kg > 0) {
      await supabase.rpc('ajustar_stock_inventario', { p_lote: lote, p_delta: signo * kg });
    }
  }
}
