/**
 * Modelo de JORNADA e EXCEÇÕES (protótipo, só front-end). Arquivo IDÊNTICO no Dashboard e no Onboarding:
 * o Onboarding monta a mesma estrutura que o Dashboard edita e a envia no handoff.
 *
 * - Cada profissional tem 7 dias INDEPENDENTES (segunda = 0 … domingo = 6). Cada dia: trabalha ou folga,
 *   um ou mais períodos (ex.: 08:00–12:00 e 14:00–18:00) e pausas próprias. Editar um dia nunca altera outro.
 * - Exceções por data (uma data ou um intervalo de datas): folga/férias, bloqueio parcial e horário especial
 *   (reduzido, estendido ou abertura extraordinária). A exceção vence a semana, mas NUNCA vence o fechamento da
 *   clínica: quem decide se a clínica abre é `resolveClinicDay` (inclui abertura extraordinária da própria clínica).
 * - Intervalo entre atendimentos: 0, 5, 10, 15 ou 30 min por profissional (0 = "Sem intervalo").
 *   Valores antigos fora da lista (ex.: 20) são PRESERVADOS até alguém trocar.
 * - Precisão de 5 min em tudo (horários, validação, sugestões). Nada é arredondado para 15/30.
 * G3 (26/10/2026, F-050 e F-058; mudança nos DOIS projetos no mesmo ciclo):
 * - A CLÍNICA pode ter vários períodos no mesmo dia (`ClinicHoursDay.periods`). `from`/`to` continuam gravados como o
 *   primeiro início e o último fim, para leitores antigos; sem `periods`, vale o período único `from`–`to` (compatível).
 * - Data especial com "Repetir todo ano" (`yearly`) vale na mesma data dos anos seguintes.
 * - Motivo INTERNO × texto PÚBLICO: `reason` é interno; o cliente só vê `publicLabel` (nome oficial de feriado, informação
 *   pública) ou o motivo marcado com `reasonShared` ("Mostrar o motivo ao cliente"). Sem marcação, fica oculto (D5).
 */

import { wordsNow } from './segment';
export type TimeRange = {start: string;end: string;};
export type DaySchedule = {working: boolean;periods: TimeRange[];breaks: TimeRange[];};
/** Sempre 7 posições: 0 = segunda … 6 = domingo */
export type WeeklySchedule = DaySchedule[];

export type OverrideKind = 'off' | 'block' | 'hours';
export type ScheduleOverride = {
  id: string;
  /** ISO AAAA-MM-DD (inclusivo) */
  from: string;
  /** ISO AAAA-MM-DD (inclusivo); igual a `from` para uma data só */
  to: string;
  kind: OverrideKind;
  /** block: períodos bloqueados · hours: períodos de atendimento que SUBSTITUEM a semana · off: vazio */
  ranges: TimeRange[];
  reason: string;
  /** G3 (F-058): "Mostrar o motivo ao cliente". Ausente/false = o motivo é só interno (padrão dos registros existentes). */
  reasonShared?: boolean;
};

export type ProfessionalSchedule = {week: WeeklySchedule;overrides: ScheduleOverride[];bufferMin: number;};

/**
 * Horário semanal da clínica (formato já usado pelos dois projetos). G3 (F-050): `periods` = vários períodos no dia;
 * `from`/`to` = primeiro início e último fim (compatibilidade). Sem `periods`, o dia tem o período único `from`–`to`.
 */
export type ClinicHoursDay = {day: string;open: boolean;from: string;to: string;periods?: TimeRange[];};
/**
 * Data especial da CLÍNICA inteira. closed = fechada · reduced = atende até `until` · open = abertura/horário
 * extraordinário `from`–`to` (reabre um dia fechado na semana ou substitui o horário do dia).
 */
export type ClinicException = {
  id: string;
  date: string;
  kind: 'closed' | 'reduced' | 'open';
  until?: string;
  from?: string;
  to?: string;
  /** Motivo/nota INTERNA (pode ser vazio). */
  reason: string;
  /** G3 (F-058): "Mostrar o motivo ao cliente". Ausente/false = oculto ao cliente (D5). */
  reasonShared?: boolean;
  /** G3 (F-058, D5): nome PÚBLICO de calendário (ex.: feriado nacional importado). Nunca é texto livre da clínica. */
  publicLabel?: string;
  /** G3 (F-049): "Repetir todo ano nesta data" — vale na mesma data dos anos seguintes. */
  yearly?: boolean;
};

export const SCHEDULE_VERSION = 2;
export const TIME_STEP = 5;
export const BUFFER_OPTIONS = [0, 5, 10, 15, 30];
/**
 * Valor inicial para profissionais NOVOS: "Sem intervalo" (decisão do Christian, 16/10/2026: a agenda não nasce com
 * faixas bloqueadas entre atendimentos). Existentes mantêm o que já tinham; a clínica liga o intervalo se quiser.
 */
export const DEFAULT_BUFFER = 0;
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const WEEKDAY_LONG = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

export const bufferLabel = (n: number) => n === 0 ? 'Sem intervalo' : `${n} min`;
export const overrideKindLabel: Record<OverrideKind, string> = { off: 'Folga ou férias', block: 'Bloqueio parcial', hours: 'Horário especial' };

/* ───────────── tempo e datas ───────────── */

const pad = (n: number) => String(n).padStart(2, '0');
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
/** "HH:MM" válido e múltiplo de 5 min */
export const isStepTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t ?? '') && toMin(t) % TIME_STEP === 0;

export function weekdayOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const covers = (o: {from: string;to: string;}, iso: string) => o.from <= iso && iso <= o.to;

/* ───────────── intervalos ───────────── */

type R = {s: number;e: number;};
const toR = (r: TimeRange): R => ({ s: toMin(r.start), e: toMin(r.end) });
const fromR = (r: R): TimeRange => ({ start: fromMin(r.s), end: fromMin(r.e) });
export const sortRanges = (list: TimeRange[]) => [...list].sort((a, b) => toMin(a.start) - toMin(b.start));

/** Interseção de dois conjuntos de faixas */
export function intersectRanges(a: TimeRange[], b: TimeRange[]): TimeRange[] {
  const out: R[] = [];
  a.map(toR).forEach((x) =>
  b.map(toR).forEach((y) => {
    const s = Math.max(x.s, y.s);
    const e = Math.min(x.e, y.e);
    if (e > s) out.push({ s, e });
  })
  );
  return out.sort((p, q) => p.s - q.s).map(fromR);
}

/** Remove de `base` tudo o que cai em `minus` */
export function subtractRanges(base: TimeRange[], minus: TimeRange[]): TimeRange[] {
  let cur: R[] = base.map(toR);
  minus.map(toR).forEach((m) => {
    const next: R[] = [];
    cur.forEach((c) => {
      if (m.e <= c.s || m.s >= c.e) return next.push(c);
      if (m.s > c.s) next.push({ s: c.s, e: m.s });
      if (m.e < c.e) next.push({ s: m.e, e: c.e });
    });
    cur = next;
  });
  return cur.filter((r) => r.e > r.s).sort((p, q) => p.s - q.s).map(fromR);
}

export const rangesText = (list: TimeRange[]) => sortRanges(list).map((r) => `${r.start}–${r.end}`).join(', ');
export const minutesIn = (list: TimeRange[]) => list.reduce((n, r) => n + Math.max(0, toMin(r.end) - toMin(r.start)), 0);

/* ───────────── semana ───────────── */

export const offDay = (): DaySchedule => ({ working: false, periods: [], breaks: [] });
export const cloneDay = (d: DaySchedule): DaySchedule => ({ working: d.working, periods: d.periods.map((p) => ({ ...p })), breaks: d.breaks.map((b) => ({ ...b })) });
export const cloneWeek = (w: WeeklySchedule): WeeklySchedule => w.map(cloneDay);

/** Copia o dia `from` para os dias escolhidos (cópia profunda: depois disso cada dia segue independente). */
export function copyDayTo(week: WeeklySchedule, from: number, targets: number[]): WeeklySchedule {
  return week.map((d, i) => i !== from && targets.includes(i) ? cloneDay(week[from]) : d);
}

/* ───────────── horário da clínica (G3, F-050) ───────────── */

/** Períodos de um dia da clínica (vários; sem `periods`, o período único `from`–`to`). Ordenados. */
export function clinicPeriods(h: ClinicHoursDay | undefined): TimeRange[] {
  if (!h) return [];
  const list = h.periods && h.periods.length ? h.periods : h.from && h.to ? [{ start: h.from, end: h.to }] : [];
  return sortRanges(list.map((p) => ({ start: p.start, end: p.end })));
}
/** Grava os períodos e mantém `from`/`to` (primeiro início, último fim) para leitores antigos. */
export function withClinicPeriods(h: ClinicHoursDay, periods: TimeRange[]): ClinicHoursDay {
  const ps = sortRanges(periods);
  return { ...h, periods: ps.map((p) => ({ ...p })), from: ps[0]?.start ?? h.from, to: ps[ps.length - 1]?.end ?? h.to };
}
/** Erro de um dia da clínica (ou null): mesmos critérios dos períodos do profissional. */
export function clinicDayError(h: ClinicHoursDay): string | null {
  if (!h.open) return null;
  const ps = clinicPeriods(h);
  if (ps.length === 0) return 'Inclua ao menos um período ou marque o dia como fechado.';
  for (const r of ps) {
    if (!isStepTime(r.start) || !isStepTime(r.end)) return 'Use horários em passos de 5 minutos.';
    if (toMin(r.end) <= toMin(r.start)) return 'O fechamento deve ser depois da abertura.';
  }
  for (let i = 1; i < ps.length; i++) if (toMin(ps[i].start) < toMin(ps[i - 1].end)) return 'Os períodos não podem se sobrepor.';
  return null;
}
/** "08:00–12:00 e 14:00–18:00" (ou "Fechado"). */
export const clinicDayText = (h: ClinicHoursDay | undefined) => h?.open && clinicPeriods(h).length ? rangesText(clinicPeriods(h)).replace(/, /g, ' e ') : 'Fechado';

/** Semana a partir do horário semanal da clínica (ponto de partida de um profissional novo). */
export function weekFromClinicHours(hours: ClinicHoursDay[], breaks: TimeRange[] = []): WeeklySchedule {
  return Array.from({ length: 7 }, (_, i) => {
    const h = hours[i];
    if (!h?.open || clinicDayError(h)) return offDay();
    const periods = clinicPeriods(h);
    return { working: true, periods, breaks: intersectRanges(breaks, periods) };
  });
}

/** Erro de um dia (ou null) */
export function dayError(d: DaySchedule): string | null {
  if (!d.working) return null;
  if (d.periods.length === 0) return 'Inclua ao menos um período ou marque como folga.';
  for (const r of [...d.periods, ...d.breaks]) {
    if (!isStepTime(r.start) || !isStepTime(r.end)) return 'Use horários em passos de 5 minutos.';
    if (toMin(r.end) <= toMin(r.start)) return 'O fim precisa ser depois do início.';
  }
  const ps = sortRanges(d.periods);
  for (let i = 1; i < ps.length; i++) if (toMin(ps[i].start) < toMin(ps[i - 1].end)) return 'Os períodos não podem se sobrepor.';
  for (const b of d.breaks) {
    const inside = ps.some((p) => toMin(b.start) >= toMin(p.start) && toMin(b.end) <= toMin(p.end));
    if (!inside) return `A pausa ${b.start}–${b.end} precisa ficar dentro de um período de atendimento.`;
  }
  return null;
}

export function weekErrors(w: WeeklySchedule): (string | null)[] {
  return w.map(dayError);
}

export function overrideError(o: ScheduleOverride): string | null {
  if (!isIso(o.from) || !isIso(o.to)) return 'Escolha a data.';
  if (o.to < o.from) return 'A data final precisa ser igual ou depois da inicial.';
  if (o.kind === 'off') return null;
  if (o.ranges.length === 0) return o.kind === 'block' ? 'Informe o período bloqueado.' : 'Informe o horário de atendimento.';
  for (const r of o.ranges) {
    if (!isStepTime(r.start) || !isStepTime(r.end)) return 'Use horários em passos de 5 minutos.';
    if (toMin(r.end) <= toMin(r.start)) return 'O fim precisa ser depois do início.';
  }
  const ps = sortRanges(o.ranges);
  for (let i = 1; i < ps.length; i++) if (toMin(ps[i].start) < toMin(ps[i - 1].end)) return 'Os períodos não podem se sobrepor.';
  return null;
}

export function scheduleErrors(ps: ProfessionalSchedule): string | null {
  const w = weekErrors(ps.week);
  const i = w.findIndex(Boolean);
  if (i >= 0) return `${WEEKDAY_LONG[i]}: ${w[i]}`;
  if (!ps.week.some((d) => d.working)) return 'Marque ao menos um dia de atendimento.';
  const o = ps.overrides.find((x) => overrideError(x));
  if (o) return `Exceção ${dmy(o.from)}: ${overrideError(o)}`;
  return null;
}

/* ───────────── migração do formato antigo ───────────── */

/** Formato antigo do Dashboard: um texto por dia ("08:00 – 18:00" ou null), um almoço e o intervalo em texto. */
export type LegacyMember = {schedule?: {day: string;hours: string | null;}[];lunch?: string;gap?: string;};

const RANGE_RE = /(\d{1,2}:\d{2})\s*(?:às|–|-|a)\s*(\d{1,2}:\d{2})/;
export function parseRangeText(text: string | null | undefined): TimeRange | null {
  const m = RANGE_RE.exec(text ?? '');
  if (!m) return null;
  const r = { start: m[1].padStart(5, '0'), end: m[2].padStart(5, '0') };
  return toMin(r.end) > toMin(r.start) ? r : null;
}

/** "10 min" → 10 · "sem intervalo" → 0 · "20 min" → 20 (preservado) · vazio → padrão */
export function parseBuffer(gap: string | number | undefined | null): number {
  if (typeof gap === 'number') return Number.isFinite(gap) && gap >= 0 ? gap : DEFAULT_BUFFER;
  const g = (gap ?? '').toLowerCase();
  if (/sem/.test(g)) return 0;
  const digits = g.replace(/\D/g, '');
  return digits ? Number(digits) : DEFAULT_BUFFER;
}

/**
 * Converte o formato antigo SEM perder informação: cada dia com horário vira um período; o almoço único vira a
 * pausa de cada dia em que cabe (fora do expediente ele não tinha efeito); o intervalo é mantido como estava.
 */
export function migrateLegacySchedule(m: LegacyMember): ProfessionalSchedule {
  const lunch = parseRangeText(m.lunch);
  const week: WeeklySchedule = Array.from({ length: 7 }, (_, i) => {
    const r = parseRangeText(m.schedule?.[i]?.hours ?? null);
    if (!r) return offDay();
    return { working: true, periods: [r], breaks: lunch ? intersectRanges([lunch], [r]).filter((b) => b.start === lunch.start && b.end === lunch.end) : [] };
  });
  return { week, overrides: [], bufferMin: parseBuffer(m.gap) };
}

/** Aceita qualquer coisa (payload, seed antiga) e devolve uma jornada completa e válida em forma. */
export function normalizeSchedule(raw: any, fallbackWeek?: WeeklySchedule): ProfessionalSchedule {
  if (raw && Array.isArray(raw.week) && raw.week.length === 7) {
    return {
      week: raw.week.map((d: any) => ({
        working: !!d?.working,
        periods: Array.isArray(d?.periods) ? d.periods.map((p: any) => ({ start: String(p.start), end: String(p.end) })) : [],
        breaks: Array.isArray(d?.breaks) ? d.breaks.map((p: any) => ({ start: String(p.start), end: String(p.end) })) : []
      })),
      overrides: Array.isArray(raw.overrides) ?
      raw.overrides.map((o: any) => ({
        id: String(o.id),
        from: String(o.from),
        to: String(o.to ?? o.from),
        kind: o.kind,
        ranges: Array.isArray(o.ranges) ? o.ranges.map((p: any) => ({ start: String(p.start), end: String(p.end) })) : [],
        reason: String(o.reason ?? ''),
        // G3 (F-058): só `true` explícito mostra o motivo ao cliente; o resto continua interno.
        ...(o.reasonShared === true ? { reasonShared: true } : {})
      })) :
      [],
      bufferMin: parseBuffer(raw.bufferMin)
    };
  }
  if (raw && (raw.schedule || raw.lunch || raw.gap)) return migrateLegacySchedule(raw);
  return { week: fallbackWeek ? cloneWeek(fallbackWeek) : Array.from({ length: 7 }, offDay), overrides: [], bufferMin: DEFAULT_BUFFER };
}

/* ───────────── resolução por data ───────────── */

export type ProDay = {
  working: boolean;
  periods: TimeRange[];
  breaks: TimeRange[];
  /** bloqueios parciais da própria exceção do profissional */
  blocks: {range: TimeRange;reason: string;}[];
  /** exceção que decidiu o dia (folga ou horário especial) */
  override?: ScheduleOverride;
};

/** Dia efetivo do profissional, SEM considerar a clínica. Folga vence horário especial; o último cadastrado vence. */
export function resolveProDay(ps: ProfessionalSchedule, iso: string): ProDay {
  const hits = ps.overrides.filter((o) => covers(o, iso));
  const base = ps.week[weekdayOf(iso)] ?? offDay();
  const blocks = hits.filter((o) => o.kind === 'block').flatMap((o) => o.ranges.map((range) => ({ range, reason: o.reason })));
  const off = [...hits].reverse().find((o) => o.kind === 'off');
  if (off) return { working: false, periods: [], breaks: [], blocks, override: off };
  const special = [...hits].reverse().find((o) => o.kind === 'hours');
  if (special) {
    const periods = sortRanges(special.ranges);
    // pausas da semana continuam valendo quando cabem inteiras no horário especial
    const breaks = base.breaks.filter((b) => periods.some((p) => toMin(b.start) >= toMin(p.start) && toMin(b.end) <= toMin(p.end)));
    return { working: periods.length > 0, periods, breaks, blocks, override: special };
  }
  return { working: base.working && base.periods.length > 0, periods: base.working ? sortRanges(base.periods) : [], breaks: base.working ? base.breaks : [], blocks };
}

/**
 * `why` = motivo INTERNO (telas da equipe). `publicWhy` = o que o CLIENTE pode ver (nome público de feriado ou motivo
 * marcado para o cliente; vazio = não dizer o motivo). G3 (F-050): `windows` = períodos do dia; `start`/`end` = limites.
 */
export type ClinicDayInfo =
{open: false;message: string;why: string;publicWhy: string;} |
{open: true;start: string;end: string;windows: TimeRange[];why: string;publicWhy: string;special: boolean;};

/** Data especial vale nesta data (mesma data; com "Repetir todo ano", a mesma data dos anos seguintes). */
export const exceptionOn = (b: Pick<ClinicException, 'date' | 'yearly'>, iso: string) => b.date === iso || !!b.yearly && iso > b.date && b.date.slice(5) === iso.slice(5);
/**
 * Texto que o cliente pode ver de uma data especial (vazio = não mostrar motivo).
 * Correção da revisão (F-058): o nome oficial do feriado (`publicLabel`) continua; o motivo escrito pela clínica só entra
 * com "Mostrar o motivo ao cliente" (`reasonShared`) e, nesse caso, entra JUNTO do nome oficial (antes o nome oficial
 * escondia o motivo marcado). Sem a marcação, o motivo fica interno, inclusive em registros antigos: ser feriado nunca
 * torna texto livre público.
 */
export const publicReasonOf = (b: Pick<ClinicException, 'reason' | 'reasonShared' | 'publicLabel'>) => {
  const label = b.publicLabel?.trim() ?? '';
  const shared = b.reasonShared ? b.reason.trim() : '';
  if (!shared) return label;
  if (!label) return shared;
  const low = (x: string) => x.toLocaleLowerCase('pt-BR');
  if (low(shared).includes(low(label))) return shared;
  return `${label}: ${shared}`;
};

/**
 * Expediente da clínica numa data: semana + datas especiais. Fechamento vence tudo; abertura extraordinária reabre
 * um dia fechado na semana (ou troca o horário do dia); expediente reduzido corta o fim (vale o mais cedo).
 */
export function resolveClinicDay(hours: ClinicHoursDay[], exceptions: ClinicException[], iso: string): ClinicDayInfo {
  const ex = exceptions.filter((b) => exceptionOn(b, iso));
  const closed = ex.find((b) => b.kind === 'closed');
  if (closed) {
    const why = closed.reason.trim();
    return { open: false, message: `${wordsNow().The} está ${wordsNow().closed} em ${dmy(iso)}${why ? ` (${why})` : ''}.`, why, publicWhy: publicReasonOf(closed) };
  }
  const opening = [...ex].reverse().find((b) => b.kind === 'open' && b.from && b.to);
  const biz = hours[weekdayOf(iso)];
  let windows: TimeRange[];
  let why = '';
  let publicWhy = '';
  let special = false;
  if (opening) {
    windows = [{ start: opening.from!, end: opening.to! }];
    why = opening.reason.trim();
    publicWhy = publicReasonOf(opening);
    special = true;
  } else {
    if (!biz?.open) return { open: false, message: `${wordsNow().The} está ${wordsNow().closed} neste dia.`, why: '', publicWhy: '' };
    windows = clinicPeriods(biz);
    if (windows.length === 0) return { open: false, message: `${wordsNow().The} está ${wordsNow().closed} neste dia.`, why: '', publicWhy: '' };
  }
  const reduced = ex.filter((b) => b.kind === 'reduced' && b.until).sort((a, b) => toMin(a.until!) - toMin(b.until!))[0];
  if (reduced) {
    windows = intersectRanges(windows, [{ start: '00:00', end: reduced.until! }]);
    why = reduced.reason.trim() || why;
    publicWhy = publicReasonOf(reduced) || publicWhy;
    special = true;
    if (windows.length === 0) return { open: false, message: `${wordsNow().The} está ${wordsNow().closed} em ${dmy(iso)}${why ? ` (${why})` : ''}.`, why, publicWhy };
  }
  return { open: true, start: windows[0].start, end: windows[windows.length - 1].end, windows, why, publicWhy, special };
}

export function clinicExceptionLabel(b: ClinicException) {
  const what = b.kind === 'closed' ? `${wordsNow().noun} ${wordsNow().closed}` : b.kind === 'reduced' ? `expediente até ${b.until ?? ''}` : `abertura extraordinária ${b.from ?? ''}–${b.to ?? ''}`;
  const why = b.reason.trim();
  return why ? `${why} · ${what}` : what.charAt(0).toUpperCase() + what.slice(1);
}

/* ───────────── textos ───────────── */

export function describeDay(d: DaySchedule): string {
  if (!d.working || d.periods.length === 0) return 'Folga';
  return `${rangesText(d.periods)}${d.breaks.length ? ` · pausa ${rangesText(d.breaks)}` : ''}`;
}

/** "Horário reduzido" / "Horário estendido" / "Abertura extra" para uma exceção de horário especial */
export function hoursOverrideHint(ps: ProfessionalSchedule, o: ScheduleOverride): string {
  if (o.kind !== 'hours') return overrideKindLabel[o.kind];
  const base = ps.week[weekdayOf(o.from)];
  if (!base?.working) return 'Abertura extra';
  const a = minutesIn(o.ranges);
  const b = minutesIn(base.periods);
  return a < b ? 'Horário reduzido' : a > b ? 'Horário estendido' : 'Horário alterado';
}

export function describeOverride(ps: ProfessionalSchedule, o: ScheduleOverride): string {
  const when = o.from === o.to ? dmy(o.from) : `${dmy(o.from)} a ${dmy(o.to)}`;
  const label = o.kind === 'hours' ? hoursOverrideHint(ps, o) : overrideKindLabel[o.kind];
  const ranges = o.kind === 'off' ? '' : ` · ${rangesText(o.ranges)}`;
  const why = o.reason.trim() ? ` · ${o.reason.trim()}${o.reasonShared ? ' (o cliente vê o motivo)' : ' (motivo interno)'}` : '';
  return `${when} · ${label}${ranges}${why}`;
}

export const newId = (p = 'x') => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;