/**
 * Regra ÚNICA de disponibilidade da agenda (protótipo, só front-end).
 * Todo caminho que cria, remarca ou SUGERE horário (Agenda Dia/Semana/Mês, Novo agendamento/Remarcar — usado por
 * Conversas, Clientes, Ficha, Retornos, Lista de espera e Início —, assistente da Agenda, Bloquear horário,
 * Funcionamento e Equipe) passa por aqui.
 *
 * Ordem da checagem (Q2: oferta = INTERSEÇÃO de tudo):
 *  1. Expediente da clínica na data (semana + feriado/fechamento + expediente reduzido + abertura extraordinária).
 *  2. Dia do profissional na data (semana individual de 7 dias com vários períodos; exceções por data: folga/férias,
 *     horário especial). A exceção do profissional vence a semana dele, mas nunca reabre a clínica fechada.
 *  3. O atendimento precisa caber INTEIRO num período do profissional ∩ expediente da clínica ('outside').
 *  4. Pausas do dia do profissional ('break') e pausa coletiva opcional ('shared-break').
 *  5. Bloqueio parcial da exceção do profissional e bloqueios manuais da Agenda ('block').
 *  6. Sobreposição com outro atendimento do mesmo profissional: inicio < fimOutro && inicioOutro < fim ('appointment').
 *  7. Intervalo do profissional (0/5/10/15/30): com 0, 10:00 encosta em quem termina 10:00; com 10, 10:00–10:09 ficam
 *     indisponíveis e 10:10 fica livre ('buffer').
 * Só `cancelled` libera horário. Outro profissional não bloqueia.
 * Encaixe excepcional (O03): `waive` dispensa só 'outside' e 'buffer'; só data/agendaLive.ts passa `waive`, com
 * autorização de dono/admin (data/exceptions.ts). Sugestões e ofertas automáticas nunca usam `waive`.
 * Precisão: 5 min (data/schedule.ts → TIME_STEP). Nenhum horário válido é arredondado para 15/30.
 */
import { useSyncExternalStore } from 'react';
import { businessHours as seedHours, clinicBlocksSeed, teamMembers } from './equipeFuncionamento';
import { markExamples } from './exampleRecords';
import type { BusinessDay, ClinicBlock, TeamMember } from './equipeFuncionamento';
import { TODAY_ISO } from './agendaStore';
import type { CalAppointment, CalBlock } from './agendaStore';
import { fromMinutes, toMinutes } from '../utils/time';
import { isExceptionalAppt } from './exceptions';
import { DEFAULT_BUFFER as SCHEDULE_DEFAULT_BUFFER, TIME_STEP, intersectRanges, parseRangeText, rangesText, resolveClinicDay, resolveProDay, weekdayOf } from './schedule';
import { syncCatalogProfessionals } from './catalogo';
import type { ClinicDayInfo, ProDay, TimeRange } from './schedule';
import { withCalendarInfo } from './clinicCalendar';
import { getServiceConflicts, recordMatches } from './serviceConflicts';
import { getBookingRules } from './bookingRules';
import type { AgendaProfessional } from './agenda';

/* ───────────── configuração viva (store compartilhado) ───────────── */

/**
 * Pausa coletiva (D6, ampliada em 19/10/2026): a clínica pode ter VÁRIAS, cada uma com nome, horário, dias da semana
 * (0 = segunda … 6 = domingo) e validade opcional. SOMA com as pausas de cada profissional.
 * Backend: existe só como bloqueio de clínica (schedule_exception com professional_id nulo, por intervalo de datas);
 * repetição por dia da semana e nome = CONTRATO NOVO.
 */
export type SharedBreakRule = {id: string;label: string;start: string;end: string;weekdays: number[];from?: string;to?: string;};
/** @deprecated formato antigo (uma pausa diária). Mantido só para leitura. */
export type SharedBreak = {enabled: boolean;start: string;end: string;label: string;};
type TeamState = {members: TeamMember[];sharedBreaks: SharedBreakRule[];hours: BusinessDay[];blocks: ClinicBlock[];};

let team: TeamState = {
  members: teamMembers,
  sharedBreaks: [],
  hours: seedHours,
  // G3 (F-049/F-058): repetição anual e nome público de feriado nacional passam para o próprio registro (sem texto livre).
  blocks: withCalendarInfo(clinicBlocksSeed)
};

// G4 · fechamento: a equipe de exemplo é substituível até alguém editá-la (data/exampleRecords.ts).
markExamples('profissional', teamMembers.map((m) => m.id));

/** Pausas coletivas que valem numa data (dia da semana + validade). */
export function sharedBreaksOn(iso: string, rules: SharedBreakRule[] = team.sharedBreaks): SharedBreakRule[] {
  const wd = weekdayOf(iso);
  return rules.filter((r) => r.weekdays.includes(wd) && (!r.from || iso >= r.from) && (!r.to || iso <= r.to));
}

/** Profissional arquivado sai das listas de escolha; o histórico e a Agenda continuam mostrando o que já foi marcado. */
export const isActiveMember = (m: TeamMember) => m.active !== false;

function syncProfessionalsCatalog(members: TeamMember[]) {
  syncCatalogProfessionals(members.map((m) => ({ value: m.id, label: m.name, color: m.color, active: isActiveMember(m) })));
}
syncProfessionalsCatalog(team.members);
const listeners = new Set<() => void>();
const emit = (next: TeamState) => {
  team = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getTeam = () => team;
export const useTeam = () => useSyncExternalStore(subscribe, () => team);

/* ───────────── profissionais para a Agenda (G1, F-003: equipe viva, sem lista paralela) ───────────── */

const toAgendaProfessional = (m: TeamMember): AgendaProfessional => ({ id: m.id, name: m.name, color: m.color });
/** Profissionais ATIVOS, no formato das colunas/filtro da Agenda. Arquivados saem das colunas; o que já foi marcado com eles aparece em "Conflitos". */
export const activeAgendaProfessionals = (members: TeamMember[] = team.members) => members.filter(isActiveMember).map(toAgendaProfessional);
/** Qualquer profissional (inclusive arquivado) pelo id — histórico, detalhes, cores. */
export const agendaProfessionalOf = (id: string): AgendaProfessional | undefined => {
  const m = team.members.find((x) => x.id === id);
  return m ? toAgendaProfessional(m) : undefined;
};
export const agendaProfessionalByName = (name: string): AgendaProfessional | undefined => {
  const m = team.members.find((x) => x.name === name);
  return m ? toAgendaProfessional(m) : undefined;
};
/** Hook: redesenha quando a equipe muda (criar, arquivar, renomear, trocar cor). */
export function useAgendaProfessionals() {
  const t = useTeam();
  return { active: activeAgendaProfessionals(t.members), all: t.members.map(toAgendaProfessional), byId: (id: string) => {const m = t.members.find((x) => x.id === id);return m ? toAgendaProfessional(m) : undefined;} };
}
export function setMembers(u: TeamMember[] | ((prev: TeamMember[]) => TeamMember[])) {
  const members = typeof u === 'function' ? u(team.members) : u;
  syncProfessionalsCatalog(members);
  emit({ ...team, members });
}
export function saveMember(m: TeamMember) {
  setMembers((list) => list.some((x) => x.id === m.id) ? list.map((x) => x.id === m.id ? m : x) : [...list, m]);
}
export function setSharedBreaks(sharedBreaks: SharedBreakRule[]) {
  emit({ ...team, sharedBreaks });
}
/** Horário semanal da clínica (Serviços e equipe › Funcionamento). Vale para a Agenda e para o assistente. */
export function setClinicHours(hours: BusinessDay[]) {
  emit({ ...team, hours });
}
/** Datas especiais da clínica (feriado, recesso, expediente reduzido, abertura extraordinária). */
export function setClinicBlocks(u: ClinicBlock[] | ((prev: ClinicBlock[]) => ClinicBlock[])) {
  emit({ ...team, blocks: typeof u === 'function' ? u(team.blocks) : u });
}

/* ───────────── leitura da configuração ───────────── */

export type Range = TimeRange;

/** Compatibilidade: "12:00 às 13:00" → {start,end}; vazio / "Sem pausa" → null */
export const parseLunch = (lunch: string): Range | null => parseRangeText(lunch);
export const formatLunch = (r: Range | null) => r ? `${r.start} às ${r.end}` : 'Sem pausa';
/** Compatibilidade: "08:00 – 18:00" → {start,end} */
export const parseHours = (hours: string | null | undefined): Range | null => parseRangeText(hours);

/** 0 = segunda … 6 = domingo */
export const weekdayIdx = weekdayOf;

export const timeLabel = (r: Range) => `${r.start} às ${r.end}`;

/** Intervalo inicial de um profissional NOVO. Opções: 0 (sem intervalo), 5, 10, 15, 30. */
export const DEFAULT_BUFFER = SCHEDULE_DEFAULT_BUFFER;

/** Intervalo configurado do profissional (minutos). Sem profissional: padrão. */
export function bufferMinutes(member?: TeamMember): number {
  if (!member) return DEFAULT_BUFFER;
  return Number.isFinite(member.bufferMin) && member.bufferMin >= 0 ? member.bufferMin : DEFAULT_BUFFER;
}

/* ───────────── expediente da clínica em uma data ───────────── */

/** G3: o mesmo formato de `resolveClinicDay` (períodos do dia em `windows`; `publicWhy` = o que o cliente pode ver). */
export type ClinicDay = ClinicDayInfo;

/** Expediente da clínica em uma data (semana + datas especiais). Ver `resolveClinicDay` em data/schedule.ts. */
export function clinicDay(iso: string, cfg: {hours?: BusinessDay[];blocks?: ClinicBlock[];} = {}): ClinicDay {
  return resolveClinicDay(cfg.hours ?? team.hours, cfg.blocks ?? team.blocks, iso);
}

/** Janela (em minutos) em que a clínica atende na data, ou null se estiver fechada. */
export function dayWindow(iso: string): {start: number;end: number;} | null {
  const c = clinicDay(iso);
  return c.open ? { start: toMinutes(c.start), end: toMinutes(c.end) } : null;
}

/** Próxima data (depois de `iso`) em que a clínica abre, ou null se não houver nos próximos dias. */
export function nextOpenIso(iso: string, maxDays = 21): string | null {
  const [y, m, d] = iso.split('-').map(Number);
  for (let i = 1; i <= maxDays; i++) {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    const next = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
    if (clinicDay(next).open) return next;
  }
  return null;
}

/* ───────────── dia efetivo de um profissional ───────────── */

export type EffectiveDay = ProDay & {
  clinic: ClinicDay;
  /** períodos do profissional ∩ expediente da clínica (vazio = não atende) */
  windows: Range[];
};

/** Dia do profissional já combinado com o expediente da clínica. Usado pela grade do Dia, Semana e perfis. */
export function effectiveDay(member: TeamMember | undefined, iso: string, cfg: {hours?: BusinessDay[];blocks?: ClinicBlock[];} = {}): EffectiveDay {
  const clinic = clinicDay(iso, cfg);
  // G3 (F-050): a clínica pode ter vários períodos no dia; o profissional só atende dentro deles.
  const pd: ProDay = member ? resolveProDay(member, iso) : { working: true, periods: clinic.open ? clinic.windows : [], breaks: [], blocks: [] };
  const windows = clinic.open && pd.working ? intersectRanges(pd.periods, clinic.windows) : [];
  return { ...pd, clinic, windows };
}

export function effectiveDayById(professionalId: string, iso: string) {
  return effectiveDay(team.members.find((m) => m.id === professionalId), iso);
}

/* ───────────── regra única ───────────── */

export type AgendaSnapshot = {
  appointments: Record<string, CalAppointment[]>;
  blocks: Record<string, CalBlock[]>;
};

/** W2 (11/11/2026): 'service' = mudança no serviço (duração, quem faz, arquivado), registrada em data/serviceConflicts.ts. */
export type ConflictKind = 'closed' | 'off' | 'outside' | 'break' | 'shared-break' | 'block' | 'appointment' | 'buffer' | 'service';
export type WaivableKind = 'outside' | 'buffer';
export type AvailabilityResult =
{ok: true;} |
{ok: false;kind: ConflictKind;start: string;end: string;message: string;conflictId?: string;};

export type AvailabilityRequest = {
  professionalId: string;
  iso: string;
  start: string;
  /** informe end OU durationMin */
  end?: string;
  durationMin?: number;
  /** agendamento que está sendo remarcado (não conflita consigo mesmo) */
  ignoreId?: string;
  /** Encaixe excepcional autorizado (O3): dispensa só estes motivos. NUNCA use em ofertas automáticas. */
  waive?: WaivableKind[];
};

type Opts = {
  /** configuração hipotética (pré-visualização nos modais de configuração) */
  members?: TeamMember[];
  sharedBreaks?: SharedBreakRule[];
  hours?: BusinessDay[];
  clinicBlocks?: ClinicBlock[];
  /** 'schedule' = só configuração (expediente, jornada, pausas, exceções); ignora agendamentos e bloqueios manuais */
  scope?: 'all' | 'schedule';
};

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;
const active = (a: CalAppointment) => a.status !== 'cancelled';

/**
 * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): outras coisas que ocupam o profissional além dos agendamentos — hoje,
 * as aulas das turmas (data/aulas.ts registra a fonte ao carregar, sem import circular). Cada aula ativa entra na regra
 * única como um horário ocupado (sobreposição e intervalo), então TODO caminho que cria, remarca ou sugere horário a vê.
 * Devolve só itens ativos, no formato de agendamento (`clientName` = nome do serviço da aula).
 */
type ExtraBusyProvider = (iso: string, professionalId: string) => CalAppointment[];
let extraBusy: ExtraBusyProvider | null = null;
export function setExtraBusyProvider(fn: ExtraBusyProvider) {
  extraBusy = fn;
}

export function checkAvailability(data: AgendaSnapshot, req: AvailabilityRequest, opts: Opts = {}): AvailabilityResult {
  const members = opts.members ?? team.members;
  const shared = sharedBreaksOn(req.iso, opts.sharedBreaks ?? team.sharedBreaks);
  const waived = (k: WaivableKind) => !!req.waive?.includes(k);
  const s = toMinutes(req.start);
  const e = req.end ? toMinutes(req.end) : s + (req.durationMin ?? 30);
  const endStr = fromMinutes(e);
  const member = members.find((m) => m.id === req.professionalId);
  const who = member?.name ?? 'O profissional';
  const fail = (kind: ConflictKind, start: string, end: string, message: string, conflictId?: string): AvailabilityResult => ({ ok: false, kind, start, end, message, conflictId });

  const day = effectiveDay(member, req.iso, { hours: opts.hours, blocks: opts.clinicBlocks });
  const clinic = day.clinic;
  if (!clinic.open) return fail('closed', '00:00', '23:59', clinic.message);
  if (e <= s) return fail('outside', req.start, endStr, 'O horário final precisa ser depois do inicial.');

  if (member && member.active === false) return fail('off', '00:00', '23:59', `${who} está arquivado e não recebe agendamentos.`);
  if (member && !day.working) {
    const o = day.override;
    return fail('off', '00:00', '23:59', o ? `${who} está de folga neste dia${o.reason.trim() ? ` (${o.reason.trim()})` : ''}.` : `${who} não atende neste dia.`);
  }
  if (!waived('outside')) {
    if (!clinic.windows.some((w) => s >= toMinutes(w.start) && e <= toMinutes(w.end))) {
      const w = clinic.windows.find((x) => s < toMinutes(x.end)) ?? clinic.windows[clinic.windows.length - 1];
      return fail('outside', w.start, w.end, `Fora do horário de funcionamento (${rangesText(clinic.windows).replace(/–/g, ' às ').replace(/, /g, ' e ')}${clinic.why ? `, ${clinic.why}` : ''}).`);
    }
    if (member && !day.windows.some((w) => s >= toMinutes(w.start) && e <= toMinutes(w.end))) {
      const w = day.windows[0] ?? { start: clinic.start, end: clinic.end };
      return fail('outside', w.start, w.end, day.windows.length ? `${who} atende ${rangesText(day.windows).replace(/, /g, ' e ')} neste dia${day.override?.kind === 'hours' && day.override.reason.trim() ? ` (${day.override.reason.trim()})` : ''}.` : `${who} não tem horário dentro do horário de funcionamento neste dia.`);
    }
  }

  const brk = day.breaks.find((b) => overlaps(s, e, toMinutes(b.start), toMinutes(b.end)));
  if (member && brk) return fail('break', brk.start, brk.end, `${who} está em pausa das ${brk.start} às ${brk.end}.`);
  const sb = shared.find((r) => overlaps(s, e, toMinutes(r.start), toMinutes(r.end)));
  if (sb) return fail('shared-break', sb.start, sb.end, `${sb.label || 'Pausa coletiva'} das ${sb.start} às ${sb.end}.`);

  const proBlock = day.blocks.find((b) => overlaps(s, e, toMinutes(b.range.start), toMinutes(b.range.end)));
  if (member && proBlock) return fail('block', proBlock.range.start, proBlock.range.end, `${who} tem bloqueio das ${proBlock.range.start} às ${proBlock.range.end}${proBlock.reason.trim() ? ` (${proBlock.reason.trim()})` : ''}.`);

  if (opts.scope === 'schedule') return { ok: true };

  const blk = (data.blocks[req.iso] ?? []).find(
    (b) => (b.professionalId === null || b.professionalId === req.professionalId) && overlaps(s, e, toMinutes(b.start), toMinutes(b.end))
  );
  if (blk) return fail('block', blk.start, blk.end, `Horário bloqueado das ${blk.start} às ${blk.end} (${blk.label}).`, blk.id);

  const listed = (data.appointments[req.iso] ?? []).filter((a) => a.professionalId === req.professionalId && active(a) && a.id !== req.ignoreId);
  // G2: aulas da turma ocupam o profissional (a aula já listada no retrato da tela não entra duas vezes).
  const seenIds = new Set(listed.map((a) => a.id));
  const mine = [...listed, ...(extraBusy?.(req.iso, req.professionalId) ?? []).filter((a) => a.id !== req.ignoreId && !seenIds.has(a.id))];
  const hit = mine.find((a) => overlaps(s, e, toMinutes(a.start), toMinutes(a.end)));
  if (hit) return fail('appointment', hit.start, hit.end, `${who} já tem ${(hit as {aula?: unknown;}).aula ? `aula de ${hit.clientName}` : hit.clientName} das ${hit.start} às ${hit.end}.`, hit.id);

  const gap = bufferMinutes(member);
  if (gap > 0 && !waived('buffer')) {
    const near = mine.find((a) => overlaps(s - gap, e + gap, toMinutes(a.start), toMinutes(a.end)));
    if (near) {
      const before = toMinutes(near.end) <= s;
      const free = before ? fromMinutes(toMinutes(near.end) + gap) : null;
      return fail(
        'buffer',
        near.start,
        near.end,
        `${who} precisa de ${gap} min entre atendimentos: ${near.clientName} ${before ? `termina às ${near.end}; o próximo início possível é ${free}` : `começa às ${near.start}`}.`,
        near.id
      );
    }
  }

  return { ok: true };
}

export type CellState = 'free' | 'booked' | 'blocked' | 'break' | 'buffer' | 'off';
/** Estado de uma célula do calendário, derivado da MESMA regra. */
export function cellState(data: AgendaSnapshot, professionalId: string, iso: string, start: string, end: string, ignoreId?: string): CellState {
  const r = checkAvailability(data, { professionalId, iso, start, end, ignoreId });
  if (r.ok) return 'free';
  if (r.kind === 'appointment') return 'booked';
  if (r.kind === 'buffer') return 'buffer';
  if (r.kind === 'block') return 'blocked';
  if (r.kind === 'break' || r.kind === 'shared-break') return 'break';
  return 'off';
}

/**
 * TODOS os inícios livres (passo de 5 min) para um profissional/duração na data, dentro do expediente da clínica.
 * `notBefore` ("HH:MM") corta horários que já passaram (relógio do protótipo).
 */
export function allFreeStartTimes(data: AgendaSnapshot, professionalId: string, iso: string, durationMin: number, ignoreId?: string, notBefore?: string): string[] {
  const out: string[] = [];
  const w = dayWindow(iso);
  if (!w) return out;
  const min = notBefore ? Math.max(w.start, Math.ceil(toMinutes(notBefore) / TIME_STEP) * TIME_STEP) : w.start;
  for (let t = min; t + durationMin <= w.end; t += TIME_STEP) {
    const start = fromMinutes(t);
    if (checkAvailability(data, { professionalId, iso, start, durationMin, ignoreId }).ok) out.push(start);
  }
  return out;
}

/**
 * Horários SUGERIDOS: o primeiro início exato de cada faixa livre (ex.: 10:10 depois de um atendimento que termina
 * 10:00 com intervalo de 10 min) e, dentro da faixa, os horários do passo das Regras de agendamento (padrão 30 min). Nada é arredondado: todo
 * horário sugerido passou pela regra única.
 */
export function freeStartTimes(data: AgendaSnapshot, professionalId: string, iso: string, durationMin: number, ignoreId?: string, notBefore?: string): string[] {
  const all = allFreeStartTimes(data, professionalId, iso, durationMin, ignoreId, notBefore);
  // W2 (D-A3-2): o passo dos horários sugeridos vem das Regras de agendamento da clínica (antes: fixo em 30 min).
  const step = getBookingRules().slotStepMin || 30;
  return all.filter((t, i) => i === 0 || toMinutes(all[i - 1]) !== toMinutes(t) - TIME_STEP || toMinutes(t) % step === 0);
}

/** Algum horário livre no dia (mínimo `minutes`)? Usado no Mês/Semana para oferecer criação. */
export function dayHasFreeTime(data: AgendaSnapshot, professionalIds: string[], iso: string, minutes = 30): boolean {
  const w = dayWindow(iso);
  if (!w) return false;
  for (const id of professionalIds) {
    for (let t = w.start; t + minutes <= w.end; t += TIME_STEP) {
      if (checkAvailability(data, { professionalId: id, iso, start: fromMinutes(t), durationMin: minutes }).ok) return true;
    }
  }
  return false;
}

/* ───────────── conflitos de configuração (horário/pausa/exceção × agendamentos existentes) ───────────── */

export type ScheduleConflict = {iso: string;appt: CalAppointment;kind: ConflictKind;message: string;};

/** Encaixes excepcionais autorizados não contam como conflito (foram aprovados de propósito). */
export function scheduleConflicts(data: AgendaSnapshot, opts: Opts = {}): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  Object.entries(data.appointments).forEach(([iso, list]) => {
    if (iso < TODAY_ISO) return;
    list.forEach((a) => {
      if (!active(a) || a.status === 'completed' || a.status === 'no_show' || isExceptionalAppt(a.id)) return;
      const r = checkAvailability(data, { professionalId: a.professionalId, iso, start: a.start, end: a.end }, { ...opts, scope: 'schedule' });
      if (!r.ok) out.push({ iso, appt: a, kind: r.kind, message: r.message });
    });
  });
  // W2 (D-A3-1): agendamentos que uma mudança salva no SERVIÇO deixou fora da regra. Valem só enquanto o agendamento
  // continua igual (remarcar ou cancelar tira da lista). Um agendamento aparece uma vez só (o motivo de horário vem antes).
  const seen = new Set(out.map((c) => c.appt.id));
  getServiceConflicts().forEach((rec) => {
    if (rec.iso < TODAY_ISO || seen.has(rec.apptId)) return;
    const a = (data.appointments[rec.iso] ?? []).find((x) => x.id === rec.apptId);
    if (!a || !active(a) || a.status === 'completed' || a.status === 'no_show' || !recordMatches(rec, rec.iso, a)) return;
    seen.add(a.id);
    out.push({ iso: rec.iso, appt: a, kind: 'service', message: rec.message });
  });
  return out.sort((x, y) => (x.iso + x.appt.start).localeCompare(y.iso + y.appt.start));
}

/**
 * Agendamentos que PASSARIAM a conflitar com uma configuração hipotética e hoje não conflitam
 * (evita avisar de conflitos que já existiam por outro motivo). Nada é cancelado nem movido.
 */
export function newScheduleConflicts(data: AgendaSnapshot, opts: Opts): ScheduleConflict[] {
  const before = new Set(scheduleConflicts(data).map((c) => c.appt.id));
  return scheduleConflicts(data, opts).filter((c) => !before.has(c.appt.id));
}