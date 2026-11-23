/**
 * Período de Resultados › Recebimentos (SIMULAÇÃO de protótipo, só front-end).
 *
 * Um ÚNICO período (Dia, Semana, Mês ou Personalizado) vale para TODOS os números da aba: cartões, gráfico, serviços e convênios.
 * Os dados de exemplo cobrem apenas 01/09/2026 a 30/09/2026 (dias úteis, em `data/recebimentos.ts`). Fora disso a tela diz
 * que não há dados de exemplo; nada é inventado.
 *
 * Tudo é DERIVADO do dia: recebido, agendado, atendimentos, faltas. Ticket médio = recebido ÷ atendimentos (não é mais um número
 * solto), taxa de presença = atendidos ÷ (atendidos + faltas). Serviços: a quantidade do período é repartida na proporção do mês
 * de exemplo e o valor segue a quantidade (serviço com 0 atendimentos tem R$ 0), sempre somando exatamente o recebido.
 * BACKEND (verificado em 28/09/2026): `/dashboard` aceita `period=7|30|90|mes`; `/financial/summary` aceita `start_date`/`end_date`.
 * Dia/Semana/Personalizado em toda a tela dependem de estender o backend (item B). Este arquivo não chama rede.
 */
import { dailyReceipts, topServices } from './recebimentos';

export type PeriodMode = 'dia' | 'semana' | 'mes' | 'personalizado';
export type DateRange = {from: string;to: string;};

export const PERIOD_MODES: {value: PeriodMode;label: string;}[] = [
{ value: 'dia', label: 'Dia' },
{ value: 'semana', label: 'Semana' },
{ value: 'mes', label: 'Mês' },
{ value: 'personalizado', label: 'Personalizado' }];


export const SAMPLE_FROM = '2026-09-01';
export const SAMPLE_TO = '2026-09-30';
/** Último dia com dados de exemplo; ponto de partida do seletor. */
export const DEFAULT_ANCHOR = '2026-09-30';

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDaysIso = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};

/** Segunda a domingo. */
export function weekRangeOf(iso: string): DateRange {
  const dow = (toDate(iso).getUTCDay() + 6) % 7;
  const from = addDaysIso(iso, -dow);
  return { from, to: addDaysIso(from, 6) };
}

export function monthRangeOf(iso: string): DateRange {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

export function rangeFor(mode: PeriodMode, anchor: string, custom: DateRange): DateRange {
  if (mode === 'dia') return { from: anchor, to: anchor };
  if (mode === 'semana') return weekRangeOf(anchor);
  if (mode === 'mes') return monthRangeOf(anchor);
  return custom;
}

const MAX_DAYS = 366;

/** Mensagem de erro do período personalizado, ou undefined se estiver válido. */
export function validateRange(r: DateRange): string | undefined {
  if (!r.from || !r.to) return 'Informe a data inicial e a final.';
  if (r.from > r.to) return 'A data inicial não pode ser depois da final.';
  const days = Math.round((toDate(r.to).getTime() - toDate(r.from).getTime()) / 86400000) + 1;
  if (days > MAX_DAYS) return 'Escolha no máximo 12 meses.';
  return undefined;
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const rangeLabel = (r: DateRange) => r.from === r.to ? br(r.from) : `${br(r.from)} a ${br(r.to)}`;

/** Reparte `total` (inteiro) entre os pesos sem perder nem criar centavos: a soma bate exatamente. */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map((w) => total * w / sum);
  const base = raw.map(Math.floor);
  const rest = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let k = 0; k < rest; k++) base[order[k % order.length].i] += 1;
  return base;
}

/** Atendimentos realizados por dia útil de setembro (soma 80, igual à tabela de serviços). */
const ATTENDED = [3, 4, 3, 5, 4, 3, 4, 3, 5, 4, 3, 4, 3, 5, 4, 3, 4, 3, 5, 4, 3, 1];
/** Dias com 1 falta (7 no mês: 80 de 87 = 92% de presença). */
const NO_SHOW_AT = new Set([1, 4, 7, 10, 13, 16, 19]);
const SCHEDULED_MONTH = 21300;

const SCHEDULED = apportion(SCHEDULED_MONTH, dailyReceipts.map((d) => d.value));

export type DayRow = {iso: string;label: string;received: number;scheduled: number;attended: number;noShow: number;};

export const dayRows: DayRow[] = dailyReceipts.map((d, i) => ({
  iso: `2026-09-${d.day.slice(0, 2)}`,
  label: d.day,
  received: d.value,
  scheduled: SCHEDULED[i],
  attended: ATTENDED[i],
  noShow: NO_SHOW_AT.has(i) ? 1 : 0
}));

export type ServiceRow = {id: string;name: string;count: number;value: number;};

export type PeriodSummary = {
  range: DateRange;
  days: DayRow[];
  hasData: boolean;
  /** O período vai além dos dias com dados de exemplo */
  outsideSample: boolean;
  received: number;
  scheduled: number;
  attended: number;
  presence: number;
  /** recebido ÷ atendimentos, em reais */
  ticket: number;
  services: ServiceRow[];
};

export function summarize(range: DateRange): PeriodSummary {
  const days = dayRows.filter((d) => d.iso >= range.from && d.iso <= range.to);
  const received = days.reduce((s, d) => s + d.received, 0);
  const scheduled = days.reduce((s, d) => s + d.scheduled, 0);
  const attended = days.reduce((s, d) => s + d.attended, 0);
  const booked = attended + days.reduce((s, d) => s + d.noShow, 0);
  const counts = apportion(attended, topServices.map((s) => s.count));
  // valor segue a quantidade (preço médio do serviço no mês de exemplo); quantidade 0 => valor 0
  const values = apportion(received, topServices.map((s, i) => counts[i] * (s.value / s.count)));
  return {
    range,
    days,
    hasData: days.length > 0,
    outsideSample: range.from < SAMPLE_FROM || range.to > SAMPLE_TO,
    received,
    scheduled,
    attended,
    presence: booked ? Math.round(attended / booked * 100) : 0,
    ticket: attended ? Math.round(received / attended * 100) / 100 : 0,
    services: topServices.map((s, i) => ({ id: s.id, name: s.name, count: counts[i], value: values[i] })).filter((s) => s.count > 0)
  };
}