/** Formats a number as Brazilian Real, e.g. 1260 → "R$ 1.260,00". */
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
}

/**
 * G1 subetapa 4 (F-055): conversor ÚNICO de valor digitado. Aceita "12,50", "12.50", "1.234,56", "1234.56", "R$ 1.234" e
 * "1.000" (milhar). Regra: com vírgula e ponto, o último separador é o decimal; só com um tipo de separador, ele é decimal
 * quando tem 1 ou 2 dígitos depois dele (e aparece uma vez só); senão é milhar. Vazio ou inválido = NaN.
 */
export function parseBRL(raw: string): number {
  const s = (raw ?? '').replace(/[^\d,.-]/g, '');
  if (!/\d/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    normalized = s.split(thou).join('').replace(dec, '.');
  } else {
    const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : '';
    if (!sep) normalized = s;else
    {
      const parts = s.split(sep);
      const tail = parts[parts.length - 1];
      normalized = parts.length === 2 && tail.length >= 1 && tail.length <= 2 ? `${parts[0]}.${tail}` : parts.join('');
    }
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}
/** Centavos a partir do texto digitado (inválido = 0, como antes). */
export const parseBRLCents = (raw: string) => {
  const n = parseBRL(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};