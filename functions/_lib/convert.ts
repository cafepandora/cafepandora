export const LB_POR_PRESENTACION: Record<string, number> = {
  'Media lb': 0.5,
  'Libra': 1,
  'Kilo': 2.2046,
  'Cuarterón': 0.275, // 125 g
};

export function librasVendidas(presentacion: string, cantidad: number): number {
  const factor = LB_POR_PRESENTACION[presentacion] ?? 0;
  return factor * (Number(cantidad) || 0);
}
