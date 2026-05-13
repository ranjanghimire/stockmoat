/** Yahoo chart endpoints expect e.g. `BRK-B` instead of `BRK.B`. */
export function yahooSymbolForChart(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\./g, '-')
}
