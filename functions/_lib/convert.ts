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
