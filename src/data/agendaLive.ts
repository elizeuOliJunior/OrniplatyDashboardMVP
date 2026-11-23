/**
 * Live agenda shared by every screen of the prototype (Agenda, Conversas…).
 * Front-end only: it lives while the page is open and starts again from the sample week on reload.
 * Toda criação/remarcação passa pela regra única de data/availability.ts.
 * Encaixe excepcional (O3): só vale dentro de `runWithException` (data/exceptions.ts), aberto apenas pelo modal
 * "Novo agendamento" depois de a pessoa informar o motivo e confirmar. A IA, a lista de espera e os retornos não usam isso.
 * W1 (11/11/2026, Christian): (1) quando a oferta de uma vaga é ACEITA (quem recebeu a oferta foi marcado no horário), o
 * pedido sai da lista de espera sozinho (decisão 19); (2) remarcar um agendamento libera o horário antigo como vaga;
 * (3) a fila viva é espelhada em `agendaWaitlist` (data/agenda.ts), que a assistente da Agenda lê.
 * W3 (11/11/2026, Christian): (1) A1-01 — remarcar SEM "O cliente já confirmou o novo horário" deixa o agendamento
 * "A confirmar" (antes um horário confirmado continuava confirmado); (2) A1-15 — cada remarcação fica no `history` do
 * agendamento; (3) G3 — o cancelamento grava QUEM cancelou (`cancelledBy`: 'client' | 'clinic') e o Perfil da equipe em
 * `cancelledByUser`; (4) G1 — remarcar ou cancelar um horário em conflito (ou cancelar pela clínica) abre/atualiza o caso
 * da lista de trabalho do dia (data/conflictCases.ts); (5) pedido VENCIDO da lista de espera (decisão B): pedido com "Até"
 * sai da fila sozinho no dia seguinte ao "Até" e vai para `expired` ("Pedidos vencidos"); sem "Até" nunca vence.
 */
import { useSyncExternalStore } from 'react';
import type { AppointmentStatus } from '../components/AppointmentItem';
import { serviceByValue, serviceOptions } from './catalogo';
import { NOW, TODAY_ISO, endFor, initialAppointments, nowStamp } from './agendaStore';
import { actor } from './legado';
import type { CalAppointment, CalBlock, CancelledBy } from './agendaStore';
import { agendaWaitlist } from './agenda';
import type { AgendaWaitlistEntry } from './agenda';
import { checkAvailability, getTeam } from './availability';
import type { AvailabilityRequest, AvailabilityResult, WaivableKind } from './availability';
import { addException, currentGrant, isExceptionalAppt, removeExceptionFor } from './exceptions';
import { noteRescheduled, reconcileOffers } from './freedSlots';
import type { ExceptionKind } from './exceptions';
import { noteCaseChange, slotText } from './conflictCases';
import { toMinutes } from '../utils/time';

type AgendaState = {
  appointments: Record<string, CalAppointment[]>;
  blocks: Record<string, CalBlock[]>;
  waitlist: AgendaWaitlistEntry[];
  /** W3 (pedido vencido): pedidos que saíram da fila porque a data "Até" passou. Mais recente primeiro. */
  expired: AgendaWaitlistEntry[];
};

const addDaysIso = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
/** W3 (decisão B): vence no dia SEGUINTE ao "Até" (no próprio dia ainda vale). Sem "Até", nunca vence. */
export const isExpiredRequest = (e: AgendaWaitlistEntry) => !!e.untilIso && e.untilIso < TODAY_ISO;
const asExpired = (e: AgendaWaitlistEntry): AgendaWaitlistEntry => ({ ...e, expiredOn: e.expiredOn ?? addDaysIso(e.untilIso!, 1) });

const initialQueue = agendaWaitlist.filter((e) => !isExpiredRequest(e));
const initialExpired = agendaWaitlist.filter(isExpiredRequest).map(asExpired);
// A assistente da Agenda lê este array: ele passa a ser só a fila viva (sem os vencidos).
agendaWaitlist.splice(0, agendaWaitlist.length, ...initialQueue);

let state: AgendaState = { appointments: initialAppointments(), blocks: {}, waitlist: [...initialQueue], expired: initialExpired };
const listeners = new Set<() => void>();

function emit(next: AgendaState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type Updater<T> = T | ((prev: T) => T);
const apply = <T,>(prev: T, u: Updater<T>) => typeof u === 'function' ? (u as (p: T) => T)(prev) : u;

export const getAgendaState = () => state;

export function setAppointments(u: Updater<AgendaState['appointments']>) {
  const appointments = apply(state.appointments, u);
  emit({ ...state, appointments });
  // G3 (F-045, correção da revisão): grava a transição da oferta de vaga (aceita/encerrada/livre de novo) junto da mudança.
  // W1 (decisão 19): oferta aceita → o pedido que recebeu a oferta sai da lista de espera sozinho.
  const accepted = reconcileOffers(appointments);
  if (accepted.length > 0) setWaitlist((list) => list.filter((e) => !accepted.includes(e.id)));
}

export function setBlocks(u: Updater<AgendaState['blocks']>) {
  emit({ ...state, blocks: apply(state.blocks, u) });
}

export function setWaitlist(u: Updater<AgendaState['waitlist']>) {
  const all = apply(state.waitlist, u);
  // W3 (decisão B): pedido com "Até" já passado nunca fica na fila; vai para "Pedidos vencidos".
  const due = all.filter(isExpiredRequest);
  const waitlist = due.length ? all.filter((e) => !isExpiredRequest(e)) : all;
  // W1: espelha a fila viva no array que a assistente da Agenda lê (antes ela via só a amostra inicial).
  agendaWaitlist.splice(0, agendaWaitlist.length, ...waitlist);
  emit({ ...state, waitlist, expired: due.length ? [...due.map(asExpired), ...state.expired] : state.expired });
}

/**
 * W3 (pedido vencido): "Voltar para a fila" — o pedido vencido, com as datas novas que a equipe escolheu, entra de novo
 * no FIM da fila (é um pedido renovado). Sai de "Pedidos vencidos".
 */
export function restoreExpired(id: string, renewed: AgendaWaitlistEntry) {
  const { expiredOn: _gone, ...entry } = renewed;
  const expired = state.expired.filter((e) => e.id !== id);
  emit({ ...state, expired });
  setWaitlist((list) => [...list, { ...entry, id }]);
}

/** Appointments and blocks of the whole prototype, always up to date. */
export function useAgendaData() {
  return useSyncExternalStore(subscribe, () => state);
}

/** Verifica um horário contra o estado atual da agenda (regra única). */
export function checkNow(req: AvailabilityRequest): AvailabilityResult {
  return checkAvailability(state, req);
}

/**
 * W3 (G1, A3-12): motivo de um horário não poder ser usado pela CONFIGURAÇÃO agora (ausência, jornada, pausa, feriado,
 * horário da clínica) ou por um bloqueio manual da Agenda. Ignora outros agendamentos. null = pode.
 */
export function scheduleIssueOf(professionalId: string, iso: string, start: string, end: string): string | null {
  const r = checkAvailability(state, { professionalId, iso, start, end }, { scope: 'schedule' });
  if (!r.ok) return r.message;
  const b = (state.blocks[iso] ?? []).find(
    (x) => (x.professionalId === null || x.professionalId === professionalId) && toMinutes(start) < toMinutes(x.end) && toMinutes(x.start) < toMinutes(end)
  );
  return b ? `Horário bloqueado das ${b.start} às ${b.end} (${b.label}).` : null;
}

/**
 * W3 (G1): motivo do conflito de um agendamento AGORA (ausência, horário, pausa, feriado ou bloqueio manual), ou null.
 * Mesma regra da lista "Conflitos de horário" da Agenda. Encaixe excepcional autorizado não conta.
 */
export function conflictReasonOf(iso: string, a: CalAppointment): string | null {
  if (iso < TODAY_ISO || a.status === 'cancelled' || a.status === 'completed' || a.status === 'no_show' || isExceptionalAppt(a.id)) return null;
  return scheduleIssueOf(a.professionalId, iso, a.start, a.end);
}

/** Same data that the form "Novo agendamento" returns. */
export type SavedAppointment = {
  client: string;
  service: string;
  professional: string;
  date: string;
  time: string;
  /** G3 (F-043): observação interna do agendamento. */
  note?: string;
  /** G3 (F-052): pacote pré-vinculado (não consome sessão). `null` = tirar o vínculo ao remarcar. */
  packageSaleId?: string | null;
  /** G3 (F-044, decisão D4): só `true` quando a pessoa marcou "O cliente já confirmou". */
  confirmed?: boolean;
};

export type AddResult = {ok: true;appt: CalAppointment;} | {ok: false;message: string;};

function build(data: SavedAppointment, base?: Partial<CalAppointment>): CalAppointment {
  const service = serviceByValue(data.service)?.label ?? data.service;
  return {
    id: base?.id ?? `n${Date.now()}${Math.floor(Math.random() * 1000)}`,
    professionalId: data.professional,
    start: data.time,
    end: endFor(service, data.time),
    clientName: data.client,
    service,
    fromWaitlist: base?.fromWaitlist,
    // G3 (F-044, D4): agendamento manual nasce "A confirmar"; confirmado só com a marcação explícita.
    // Confirmação ≠ comparecimento, e nenhum lembrete é enviado por isto.
    status: base?.status ?? (data.confirmed ? 'confirmed' : 'pending_confirmation'),
    note: data.note !== undefined ? data.note.trim() || undefined : base?.note,
    packageSaleId: data.packageSaleId !== undefined ? data.packageSaleId : base?.packageSaleId,
    // G1 subetapas 2/3: ligação com o caso e origem explícita. Horário novo criado no Painel = `painel`/`user`, com a data do relógio.
    followUpCaseId: base?.followUpCaseId,
    createdIso: base?.createdIso ?? TODAY_ISO,
    source: base?.source ?? 'painel',
    createdActorType: base?.createdActorType ?? 'user',
    history: base?.history
  };
}

/**
 * Confere o horário pela regra única. Se falhar SÓ por expediente ou intervalo e houver autorização válida de encaixe
 * (motivo preenchido), tenta de novo dispensando exatamente esses motivos. Duplo agendamento, bloqueio, pausa e dia
 * fechado nunca são dispensados.
 */
function verdict(req: AvailabilityRequest): {r: AvailabilityResult;waived: ExceptionKind[];} {
  let r = checkAvailability(state, req);
  const waived: WaivableKind[] = [];
  const grant = currentGrant();
  while (grant && !r.ok && (r.kind === 'outside' || r.kind === 'buffer') && !waived.includes(r.kind)) {
    waived.push(r.kind);
    r = checkAvailability(state, { ...req, waive: [...waived] });
  }
  return { r, waived: r.ok ? waived : [] };
}

function logException(appt: CalAppointment, iso: string, waived: ExceptionKind[]) {
  const grant = currentGrant();
  // R3 (06/11/2026, Christian, A-20): com autorização de encaixe, horário de hoje antes de agora (`NOW`) também é registrado
  // (tipo 'past'), mesmo sem expediente/intervalo dispensados. A regra única não olha hora passada; o modal é que exige o encaixe.
  const kinds: ExceptionKind[] = iso === TODAY_ISO && appt.start < NOW ? [...waived, 'past'] : waived;
  if (!grant || kinds.length === 0) return;
  addException({
    at: NOW,
    by: grant.by,
    apptId: appt.id,
    client: appt.clientName,
    professional: getTeam().members.find((m) => m.id === appt.professionalId)?.name ?? appt.professionalId,
    iso,
    start: appt.start,
    end: appt.end,
    kinds,
    reason: grant.reason.trim()
  });
}

/**
 * G3 (revisão v3): horário novo ou remarcado só com serviço ATIVO do catálogo (o id vem do formulário ou da assistente).
 * Sem serviço, serviço arquivado ou id desconhecido: recusa (antes gravava o agendamento com serviço vazio e 60 min).
 */
function serviceError(serviceId: string): string | null {
  if (!serviceId) return 'Escolha o serviço.';
  if (serviceOptions.some((o) => o.value === serviceId)) return null;
  const known = serviceByValue(serviceId);
  return known ? `${known.label} está arquivado em Serviços e equipe. Escolha um serviço ativo.` : 'Esse serviço não está mais no catálogo. Escolha um serviço ativo.';
}

/** Cria um agendamento SE o horário estiver livre. Nunca sobrescreve nem duplica. */
export function tryAddAppointment(data: SavedAppointment, base?: Partial<CalAppointment>): AddResult {
  if (!data.time) return { ok: false, message: 'Escolha o horário.' };
  const svcError = serviceError(data.service);
  if (svcError) return { ok: false, message: svcError };
  const appt = build(data, base);
  const v = verdict({ professionalId: appt.professionalId, iso: data.date, start: appt.start, end: appt.end });
  if (!v.r.ok) return { ok: false, message: v.r.message };
  setAppointments((map) => ({ ...map, [data.date]: [...(map[data.date] ?? []), appt] }));
  logException(appt, data.date, v.waived);
  return { ok: true, appt };
}

/** Compatível com os chamadores antigos: devolve o agendamento ou null se o horário não estiver livre. */
export function addAppointment(data: SavedAppointment, base?: Partial<CalAppointment>): CalAppointment | null {
  const r = tryAddAppointment(data, base);
  return r.ok ? r.appt : null;
}

/** W3 (A1-15): o agendamento antes de uma remarcação (para o aviso "de … para …" e para o Desfazer da assistente). */
export type MoveResult = {ok: true;appt: CalAppointment;before: {iso: string;appt: CalAppointment;};} | {ok: false;message: string;};

/**
 * Remarca de forma atômica: valida o novo horário ignorando o próprio agendamento; se estiver
 * ocupado, NADA muda. Mantém id, cliente e origem (lista de espera).
 * W3 (A1-01): sem `confirmed`, o horário novo fica "A confirmar" (o cliente ainda não confirmou ESTE horário).
 * `opts.restore` (só o Desfazer): devolve o status e o histórico de antes, sem nova linha de histórico.
 */
export function moveAppointment(fromIso: string, id: string, to: SavedAppointment, opts?: {restore?: CalAppointment;}): MoveResult {
  const current = (state.appointments[fromIso] ?? []).find((a) => a.id === id);
  if (!current) return { ok: false, message: 'Agendamento não encontrado.' };
  const svcError = serviceError(to.service);
  if (svcError) return { ok: false, message: svcError };
  const moved = fromIso !== to.date || current.start !== to.time || current.professionalId !== to.professional;
  const line = moved ?
  { at: nowStamp(), text: `Remarcado em ${nowStamp()}: de ${slotText(fromIso, current.start, current.professionalId)} para ${slotText(to.date, to.time, to.professional)}.` } :
  null;
  // Remarcar mantém a ligação com o caso e a origem do horário (G1).
  const next = build(to, {
    id,
    status: opts?.restore ? opts.restore.status : to.confirmed ? 'confirmed' : 'pending_confirmation',
    note: current.note,
    packageSaleId: current.packageSaleId,
    fromWaitlist: current.fromWaitlist,
    followUpCaseId: current.followUpCaseId,
    createdIso: current.createdIso,
    source: current.source,
    createdActorType: current.createdActorType,
    history: opts?.restore ? opts.restore.history : line ? [...(current.history ?? []), line] : current.history
  });
  const v = verdict({ professionalId: next.professionalId, iso: to.date, start: next.start, end: next.end, ignoreId: id });
  if (!v.r.ok) return { ok: false, message: v.r.message };
  // W3 (G1): o horário estava em conflito? A remarcação vai para "Falta avisar" (ou Resolvido, com a automação ligada).
  if (moved && !opts?.restore) {
    noteCaseChange(current, fromIso, conflictReasonOf(fromIso, current), { kind: 'remarcado', iso: to.date, start: next.start, professionalId: next.professionalId });
  }
  // W1 (11/11/2026, Christian): a remarcação também libera vaga. O horário ANTIGO vira vaga para a lista de espera
  // (data/freedSlots.ts) quando o agendamento muda de dia, hora ou profissional.
  if (current.status !== 'cancelled' && moved) {
    noteRescheduled({
      apptId: id,
      iso: fromIso,
      professionalId: current.professionalId,
      start: current.start,
      end: current.end,
      clientName: current.clientName,
      at: nowStamp(),
      to: { iso: to.date, professionalId: next.professionalId, start: next.start, end: next.end }
    });
  }
  setAppointments((map) => ({
    ...map,
    [fromIso]: (map[fromIso] ?? []).filter((a) => a.id !== id),
    [to.date]: [...(fromIso === to.date ? (map[fromIso] ?? []).filter((a) => a.id !== id) : map[to.date] ?? []), next]
  }));
  removeExceptionFor(id);
  logException(next, to.date, v.waived);
  return { ok: true, appt: next, before: { iso: fromIso, appt: current } };
}

export function removeAppointment(iso: string, id: string) {
  setAppointments((map) => ({ ...map, [iso]: (map[iso] ?? []).filter((a) => a.id !== id) }));
}

export function setAppointmentStatus(iso: string, id: string, status: AppointmentStatus) {
  setAppointments((map) => ({ ...map, [iso]: (map[iso] ?? []).map((a) => a.id === id ? { ...a, status } : a) }));
}

/** G3: grava campos do agendamento (observação do fechamento, vínculo de pacote) sem mexer no horário. */
export function patchAppointment(iso: string, id: string, patch: Partial<Pick<CalAppointment, 'closingNote' | 'packageSaleId' | 'note'>>) {
  setAppointments((map) => ({ ...map, [iso]: (map[iso] ?? []).map((a) => a.id === id ? { ...a, ...patch } : a) }));
}

/**
 * G3 (F-046): cancela SEM apagar. Grava o motivo, a data/hora do relógio e o Perfil do momento; o horário volta a ficar
 * livre pela regra única (só `cancelled` libera). Use no lugar de `removeAppointment` em toda ação do usuário.
 * W3 (G3): `by` = quem cancelou (cliente ou clínica). Cancelamento da clínica (ou de horário em conflito) abre o caso
 * "Falta avisar" (G1). Chamadores antigos sem `by` gravam sem essa informação (lida como "não informado").
 */
export function cancelAppointment(iso: string, id: string, reason?: string, by?: CancelledBy) {
  const current = (state.appointments[iso] ?? []).find((a) => a.id === id);
  if (current && current.status !== 'cancelled') noteCaseChange(current, iso, conflictReasonOf(iso, current), { kind: 'cancelado' }, by);
  setAppointments((map) => ({
    ...map,
    [iso]: (map[iso] ?? []).map((a) =>
    a.id === id ? { ...a, status: 'cancelled' as AppointmentStatus, cancelReason: reason?.trim() || undefined, cancelledAt: nowStamp(), cancelledBy: by, cancelledByUser: actor() } : a
    )
  }));
}

/** W3 (A1-02): Desfazer de um cancelamento feito pela assistente da Agenda. Volta o status de antes e limpa o registro. */
export function undoCancel(iso: string, before: CalAppointment) {
  setAppointments((map) => ({ ...map, [iso]: (map[iso] ?? []).map((a) => a.id === before.id ? { ...before } : a) }));
}

/* Relógio único do protótipo: `NOW`/`TODAY_ISO` em data/agendaStore.ts (G1, F-017). */

const isOff = (a: CalAppointment) => a.status === 'cancelled' || a.status === 'no_show';

/** Next appointment of a client that has not started yet. */
export function nextAppointmentOf(client: string, appointments: AgendaState['appointments']) {
  return Object.entries(appointments).
  flatMap(([iso, list]) => list.map((a) => ({ iso, a }))).
  filter((x) => x.a.clientName === client && !isOff(x.a) && x.a.status !== 'completed').
  filter((x) => x.iso > TODAY_ISO || x.iso === TODAY_ISO && x.a.start >= NOW).
  sort((x, y) => (x.iso + x.a.start).localeCompare(y.iso + y.a.start))[0];
}

/** Most recent finished appointment of a client in the agenda. */
export function lastCompletedOf(client: string, appointments: AgendaState['appointments']) {
  return Object.entries(appointments).
  flatMap(([iso, list]) => list.map((a) => ({ iso, a }))).
  filter((x) => x.a.clientName === client && x.a.status === 'completed').
  sort((x, y) => (y.iso + y.a.start).localeCompare(x.iso + x.a.start))[0];
}