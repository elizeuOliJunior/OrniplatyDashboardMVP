/**
 * Aulas (G2, aulas em grupo, 23/11/2026). Mesmo estilo de data/turmas.ts: store em memória.
 *
 * Aula = cada data de uma turma ATIVA de um serviço em grupo ATIVO (claude/aulas-em-grupo/00-base.md). Nunca é digitada:
 * nasce da turma para cada data em que ela cai, a partir de `since`, e pula o dia em que a empresa não abre e a ausência
 * do profissional (mesmas regras da agenda: `effectiveDayById`). Por aula, só o que MUDOU fica guardado (`AulaChange`):
 * cancelada (com motivo), mudada de dia/horário, avisos de falta e a chamada. Os avulsos de uma data continuam sendo
 * inscrições da turma com `date` (data/turmas.ts): um lugar só para quem está na aula.
 *
 * Ocupação de uma aula = fixos + avulsos daquela data − quem avisou que falta. A aula ocupa o profissional: a regra única
 * de horário (data/availability.ts) recebe as aulas por `setExtraBusyProvider`, então todo "horário livre" a trata como
 * ocupado e nada é marcado por cima dela.
 *
 * CONTRATO NOVO (aulas em grupo, 23/11/2026): nada disto existe no backend.
 * Protótipo: só memória; recarregar volta à amostra.
 */
import { useSyncExternalStore } from 'react';
import { NOW, TODAY_ISO, isPastNow, mediumDayLabel, nowStamp } from './agendaStore';
import type { CalAppointment } from './agendaStore';
import { addDays, weekdayOf } from './schedule';
import { effectiveDayById, getTeam, setExtraBusyProvider } from './availability';
import { dayWordsOf, dayWordsOfService, getServices, isGroupService } from './servicesStore';
import type { DayWords } from './turmaWords';
import { getTurmas, useTurmas } from './turmas';
import type { Enrollment, Turma, Weekday } from './turmas';
import { clientById } from './api/clientes';
import { getMakeupRules } from './makeupRules';
import { creditUseOf, releaseCredit, spendCredit, syncAulaGrants, validCreditsFor } from './makeupCredits';
import type { CreditReason, CreditView } from './makeupCredits';
import { creditsOf } from './makeupCredits';
import { consumeSession, consumptionOf, listPackages, reverseConsumption } from './api/pacotes';
import { textoDisponiveis } from './pacotesLib';
import { actor } from './legado';
import { fromMinutes, toMinutes } from '../utils/time';

/** CONTRATO NOVO (aulas em grupo, 23/11/2026): marcação da chamada de um cliente. */
export type RollMark = 'presente' | 'faltou';

/** CONTRATO NOVO (aulas em grupo, 23/11/2026): o que mudou numa aula (só existe quando algo mudou). */
export type AulaChange = {
  /**
   * G3 (CONTRATO NOVO, aulas em grupo): `makeupFor` = clientes que ganharam reposição com este cancelamento (regra "Aula
   * cancelada pela empresa" ligada NA HORA de cancelar; quem já ganhou pelo aviso de falta não ganha de novo).
   */
  cancelled?: {reason?: string;at: string;by: string;makeupFor?: string[];};
  /** Novo dia e horário (o profissional continua o da turma). */
  moved?: {iso: string;start: string;at: string;by: string;reason?: string;};
  /** Clientes (id do cadastro) que avisaram que faltam nesta aula. */
  warned?: string[];
  /** Dos que avisaram: quem avisou dentro do prazo da regra de reposição (G3: ganha o crédito, data/makeupCredits.ts). */
  makeup?: string[];
  /** Chamada salva: presente ou faltou, por cliente. */
  rollCall?: Record<string, RollMark>;
  rollCallAt?: string;
};

/** Situação de um cliente nesta aula. */
export type AulaClientState = 'vai' | 'avisou' | 'presente' | 'faltou';
export const AULA_CLIENT_LABEL: Record<AulaClientState, string> = { vai: 'Vai', avisou: 'Avisou que falta', presente: 'Presente', faltou: 'Faltou' };

export type AulaClient = {enrollment: Enrollment;clientId: string;name: string;state: AulaClientState;makeup: boolean;};

export type Aula = {
  /** `turmaId@data original` */
  key: string;
  /** id do cartão na Agenda (`aula:turma:data`) */
  id: string;
  turma: Turma;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  professionalId: string;
  /** data original (identidade da aula) */
  origIso: string;
  /** data e horário de agora (mudam com "Mudar horário desta aula") */
  iso: string;
  start: string;
  end: string;
  capacity: number;
  change: AulaChange;
  clients: AulaClient[];
  occupancy: number;
  full: boolean;
  cancelled: boolean;
  /** chamada salva */
  done: boolean;
  /** G5 (CONTRATO NOVO, aulas em grupo): a palavra que o serviço usa para cada dia ("esta aula" / "este treino"). */
  words: DayWords;
};

/* ───────────── store das mudanças ───────────── */

let changes: Record<string, AulaChange> = {};
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = (next: Record<string, AulaChange>) => {
  changes = next;
  version += 1;
  listeners.forEach((l) => l());
};
const patch = (key: string, fn: (c: AulaChange) => AulaChange) => emit({ ...changes, [key]: fn(changes[key] ?? {}) });

export const aulaKey = (turmaId: string, origIso: string) => `${turmaId}@${origIso}`;
const idOf = (turmaId: string, origIso: string) => `aula:${turmaId}:${origIso}`;
export const isAulaId = (id: string) => id.startsWith('aula:');

/* ───────────── derivação ───────────── */

const nameOf = (clientId: string) => clientById(clientId)?.name ?? 'Cliente removido';

function build(t: Turma, origIso: string): Aula | null {
  const svc = getServices().services.find((x) => x.id === t.serviceId);
  if (!svc || !svc.active || !isGroupService(svc)) return null;
  const key = aulaKey(t.id, origIso);
  const change = changes[key] ?? {};
  const iso = change.moved?.iso ?? origIso;
  const start = change.moved?.start ?? t.startTime;
  const end = fromMinutes(toMinutes(start) + svc.durationMin);
  const list = getTurmas().enrollments.filter((e) => e.turmaId === t.id && (e.kind === 'fixo' || e.date === origIso));
  const warned = new Set(change.warned ?? []);
  const makeup = new Set(change.makeup ?? []);
  const clients: AulaClient[] = list.
  map((e) => {
    const mark = change.rollCall?.[e.clientId];
    const state: AulaClientState = warned.has(e.clientId) ? 'avisou' : mark ?? 'vai';
    return { enrollment: e, clientId: e.clientId, name: nameOf(e.clientId), state, makeup: makeup.has(e.clientId) };
  }).
  sort((a, b) => Number(a.enrollment.kind === 'avulso') - Number(b.enrollment.kind === 'avulso') || a.name.localeCompare(b.name));
  const occupancy = clients.filter((c) => c.state !== 'avisou').length;
  const capacity = svc.group?.capacity ?? 0;
  return {
    key,
    id: idOf(t.id, origIso),
    turma: t,
    serviceId: svc.id,
    serviceName: svc.name,
    durationMin: svc.durationMin,
    professionalId: t.professionalId,
    origIso,
    iso,
    start,
    end,
    capacity,
    change,
    clients,
    occupancy,
    full: capacity > 0 && occupancy >= capacity,
    cancelled: !!change.cancelled,
    done: !!change.rollCallAt,
    words: dayWordsOf(svc)
  };
}

/** A turma tem aula nesta data (data original)? Pula dia fechado e ausência do profissional, salvo aula que já mudou. */
function fallsOn(t: Turma, iso: string): boolean {
  if (!t.active || iso < (t.since ?? TODAY_ISO) || !t.weekdays.includes(weekdayOf(iso) as Weekday)) return false;
  const day = effectiveDayById(t.professionalId, iso);
  if (day.clinic.open && day.working) return true;
  // G2b (23/11/2026; CONTRATO NOVO, aulas em grupo): em dia fechado ou na ausência do profissional nenhuma aula nasce.
  // Só continua aparecendo o registro de uma aula que já foi cancelada ou teve a chamada salva (como o agendamento
  // cancelado continua na Agenda). Antes, qualquer mudança (ex.: um aviso de falta) mantinha a aula viva num dia que
  // depois foi fechado.
  const c = changes[aulaKey(t.id, iso)];
  return !!c && (!!c.cancelled || !!c.rollCallAt);
}

/* Cache por data: a regra única de horário pergunta muitas vezes pela mesma data. */
let cacheDeps: unknown[] = [];
let cache = new Map<string, Aula[]>();
function aulasOnUncached(iso: string): Aula[] {
  const { turmas } = getTurmas();
  const out: Aula[] = [];
  turmas.forEach((t) => {
    if (fallsOn(t, iso)) {
      const a = build(t, iso);
      if (a && !a.change.moved) out.push(a);
    }
  });
  // Aulas que vieram de outra data para esta.
  Object.entries(changes).forEach(([key, c]) => {
    if (c.moved?.iso !== iso) return;
    const [turmaId, origIso] = key.split('@');
    const t = turmas.find((x) => x.id === turmaId);
    if (!t || !t.active) return;
    const a = build(t, origIso);
    if (a) out.push(a);
  });
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
/** Aulas que ACONTECEM nesta data (inclusive canceladas), na ordem do horário. */
export function aulasOn(iso: string): Aula[] {
  const deps = [getTurmas(), changes, getServices(), getTeam()];
  if (deps.some((d, i) => d !== cacheDeps[i])) {
    cacheDeps = deps;
    cache = new Map();
  }
  let v = cache.get(iso);
  if (!v) {
    v = aulasOnUncached(iso);
    cache.set(iso, v);
  }
  return v;
}

/** Aula pela chave (`turma@data original`), onde ela estiver agora. */
export function aulaByKey(key: string): Aula | null {
  const [turmaId, origIso] = key.split('@');
  const t = getTurmas().turmas.find((x) => x.id === turmaId);
  return t ? build(t, origIso) : null;
}

/**
 * CONTRATO NOVO (aulas em grupo, G2): o cartão de uma AULA na Agenda é um agendamento com `aula` (chave da aula e se está
 * lotada). Uma aula nunca é gravada como agendamento; o campo só existe nos cartões que a Agenda desenha.
 */
/** G5: `word` = a palavra do serviço, minúscula ("aula", "treino"), para o nome lido em voz alta do cartão. */
export type AulaRef = {key: string;full: boolean;word: string;};
export type CalAulaAppointment = CalAppointment & {aula?: AulaRef;};
/** A ligação do cartão com a aula (undefined = agendamento comum). */
export const aulaRefOf = (a: CalAppointment): AulaRef | undefined => (a as CalAulaAppointment).aula;

/** Cartão da Agenda (mesmo formato de agendamento): serviço no lugar do cliente e "3 de 4" no lugar do serviço. */
export function aulaAppointment(a: Aula): CalAulaAppointment {
  return {
    id: a.id,
    professionalId: a.professionalId,
    start: a.start,
    end: a.end,
    clientName: a.serviceName,
    service: `${a.occupancy} de ${a.capacity}`,
    status: a.cancelled ? 'cancelled' : a.done ? 'completed' : 'confirmed',
    source: 'painel',
    createdActorType: 'user',
    aula: { key: a.key, full: a.full && !a.cancelled, word: a.words.one }
  };
}

/** Agendamentos + aulas de cada data do intervalo (só para DESENHAR a Agenda; os agendamentos gravados não mudam). */
export function withAulas(appointments: Record<string, CalAppointment[]>, isos: string[]): Record<string, CalAppointment[]> {
  const out = { ...appointments };
  isos.forEach((iso) => {
    const list = aulasOn(iso);
    if (list.length) out[iso] = [...(appointments[iso] ?? []), ...list.map(aulaAppointment)];
  });
  return out;
}

/** Hook: redesenha quando turmas, inscrições ou mudanças das aulas mudam. */
export function useAulasVersion() {
  useTurmas();
  return useSyncExternalStore(subscribe, () => version);
}

/** Próximas aulas de um serviço em grupo, de agora em diante (até `n`), sem as canceladas. */
export function nextAulasOfService(serviceId: string, n = 8, reach = 60): Aula[] {
  const out: Aula[] = [];
  for (let i = 0; i <= reach && out.length < n; i++) {
    const iso = addDays(TODAY_ISO, i);
    aulasOn(iso).forEach((a) => {
      if (out.length < n && a.serviceId === serviceId && !a.cancelled && !a.done && !isPastNow(a.iso, a.start)) out.push(a);
    });
  }
  return out;
}

/* Regra única de horário: as aulas ativas ocupam o profissional. */
setExtraBusyProvider((iso, professionalId) =>
aulasOn(iso).
filter((a) => !a.cancelled && a.professionalId === professionalId).
map(aulaAppointment)
);

/* ───────────── textos ───────────── */

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/** "quinta, 01/10" */
export const aulaDayText = (iso: string) => lowerFirst(mediumDayLabel(iso));
/** "Ter, 06/10 · 17:00 · Rafael · 1 vaga" (Novo agendamento). */
export function aulaOptionText(a: Aula) {
  const d = mediumDayLabel(a.iso);
  const pro = getTeam().members.find((m) => m.id === a.professionalId)?.name ?? '';
  const free = Math.max(0, a.capacity - a.occupancy);
  return `${d.slice(0, 3)}, ${d.slice(-5)} · ${a.start} · ${pro} · ${a.full ? 'Lotada' : `${free} ${free === 1 ? 'vaga' : 'vagas'}`}`;
}
/**
 * Mensagem pronta para o cliente (Falta avisar). G5 (CONTRATO NOVO, aulas em grupo): sem a palavra do dia ("aula",
 * "treino"…) e sem nada que concorde em gênero com o nome do serviço: "‹Serviço› de ‹dia›, às ‹hora›, não vai acontecer."
 */
export function aulaChangeMessage(clientName: string, serviceName: string, fromIso: string, fromStart: string, to: {iso: string;start: string;} | null, reason?: string) {
  const first = clientName.split(' ')[0];
  const what = `${serviceName} de ${aulaDayText(fromIso)}, às ${fromStart}`;
  const r = reason?.trim() ? ` Motivo: ${reason.trim().replace(/[.!]+$/, '')}.` : '';
  return to ? `Oi, ${first}! ${what}, mudou para ${aulaDayText(to.iso)}, às ${to.start}.${r}` : `Oi, ${first}! ${what}, não vai acontecer.${r}`;
}

/* ───────────── ações ───────────── */

/** Horas entre agora (relógio do protótipo) e o início da aula. */
const hoursUntil = (iso: string, start: string) => {
  const days = (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(+TODAY_ISO.slice(0, 4), +TODAY_ISO.slice(5, 7) - 1, +TODAY_ISO.slice(8, 10))) / 86400000;
  return days * 24 + (toMinutes(start) - toMinutes(NOW)) / 60;
};
/** O aviso de falta feito agora ganha reposição (regra "Cliente que avisa com antecedência", se ligada)? */
export const noticeGivesMakeup = (a: Aula) => {
  const r = getMakeupRules();
  return r.onClientNotice && hoursUntil(a.iso, a.start) >= r.clientNoticeHours;
};
/** Cancelar a aula dá reposição (regra "Aula cancelada pela empresa", se ligada)? */
export const cancelGivesMakeup = () => getMakeupRules().onBusinessCancel;

/** "Avisou que falta": libera a vaga só nesta data. Devolve a mudança de antes (Desfazer). */
export function warnAbsence(key: string, clientId: string): AulaChange {
  const before = changes[key] ?? {};
  const a = aulaByKey(key);
  const makeup = !!a && noticeGivesMakeup(a);
  patch(key, (c) => ({
    ...c,
    warned: [...(c.warned ?? []).filter((x) => x !== clientId), clientId],
    makeup: makeup ? [...(c.makeup ?? []).filter((x) => x !== clientId), clientId] : (c.makeup ?? []).filter((x) => x !== clientId)
  }));
  syncGrants(key);
  return before;
}
/** Desfazer de qualquer ação desta janela: a aula volta como estava. */
export function restoreAula(key: string, before: AulaChange) {
  const next = { ...changes };
  if (Object.keys(before).length) next[key] = before;else
  delete next[key];
  emit(next);
  // G3: o crédito de reposição e o que a chamada usou (sessão de pacote, reposição) voltam junto.
  syncGrants(key);
  syncRollCallEffects(key);
}

/** Salva a chamada (presente ou faltou de cada cliente que não avisou). */
export function saveRollCall(key: string, marks: Record<string, RollMark>): AulaChange {
  const before = changes[key] ?? {};
  patch(key, (c) => ({ ...c, rollCall: marks, rollCallAt: nowStamp() }));
  syncRollCallEffects(key);
  return before;
}

/** Cancela a aula (com motivo opcional). Devolve a mudança de antes. */
export function cancelAula(key: string, reason?: string): AulaChange {
  const before = changes[key] ?? {};
  // G3: com a regra ligada, cada cliente da aula nesta data ganha uma reposição (menos quem já ganhou pelo aviso de falta).
  const a = aulaByKey(key);
  const makeupFor = a && cancelGivesMakeup() ? a.clients.filter((c) => !c.makeup).map((c) => c.clientId) : [];
  patch(key, (c) => ({ ...c, cancelled: { reason: reason?.trim() || undefined, at: nowStamp(), by: actor(), ...(makeupFor.length ? { makeupFor } : {}) } }));
  syncGrants(key);
  return before;
}

/** Muda o dia/horário da aula (mesmo profissional). Devolve a mudança de antes. */
export function moveAula(key: string, iso: string, start: string, reason?: string): AulaChange {
  const before = changes[key] ?? {};
  patch(key, (c) => ({ ...c, moved: { iso, start, at: nowStamp(), by: actor(), reason: reason?.trim() || undefined } }));
  return before;
}

/* ───────────── G3: crédito de reposição, como cada aula é paga, chamada e dinheiro ───────────── */

/**
 * CONTRATO NOVO (aulas em grupo, G3, 23/11/2026): id do "atendimento" de UM cliente numa aula. É o que liga a presença ao
 * razão do pacote (`consumeSession`) e ao fechamento do dinheiro (`closeFinance`, `appointmentId`).
 */
export const aulaClientApptId = (key: string, clientId: string) => `aula:${key}:${clientId}`;

/** Os créditos que esta aula deu ficam iguais ao que a aula registra agora (aviso no prazo e cancelamento). */
function syncGrants(key: string) {
  const a = aulaByKey(key);
  if (!a) return;
  const c = changes[key] ?? {};
  const desired: {clientId: string;reason: CreditReason;}[] = [
  ...(c.makeup ?? []).filter((id) => (c.warned ?? []).includes(id)).map((clientId) => ({ clientId, reason: 'aviso' as const })),
  ...(c.cancelled?.makeupFor ?? []).map((clientId) => ({ clientId, reason: 'cancelada' as const }))];

  syncAulaGrants(key, a.serviceId, a.origIso, desired);
}

/**
 * O que a chamada usa fica igual à chamada salva (vale para salvar, corrigir e Desfazer):
 *  - Presente que paga por pacote: UMA sessão do pacote, pelo mesmo `consumeSession` do fechamento (idempotente);
 *  - Presente que paga com reposição: UM crédito do mesmo serviço;
 *  - Faltou, avisou ou fora da chamada: nada é usado (a sessão ou o crédito já usados voltam).
 * O dinheiro de quem paga por aula NÃO mora aqui: é o fechamento de cada cliente (janela "Pagamento da aula").
 * Devolve o que não pôde ser usado (ex.: pacote sem sessão), uma frase por cliente.
 */
export function syncRollCallEffects(key: string): string[] {
  const a = aulaByKey(key);
  if (!a) return [];
  const problems: string[] = [];
  a.clients.forEach((cl) => {
    const e = cl.enrollment;
    const present = cl.state === 'presente' && !a.cancelled;
    const apptId = aulaClientApptId(key, cl.clientId);
    const used = consumptionOf(apptId);
    if (present && e.payment === 'pacote' && e.packageId) {
      if (!used) {
        try {
          consumeSession(e.packageId, apptId, a.iso, cl.clientId, a.serviceName);
        } catch (err) {
          problems.push(`${cl.name}: ${(err as Error).message}`);
        }
      }
    } else if (used) reverseConsumption(used.saleId, used.entry.id, `Chamada ${a.words.ofThe} corrigida`);
    if (present && e.payment === 'credito') {
      if (!creditUseOf(key, cl.clientId)) {
        try {
          // G4: usa o crédito que estava reservado para esta aula (o mesmo que a Ficha mostrava como "Reservado").
          const reserved = [...creditReservations(cl.clientId, undefined, key).entries()].find(([, r]) => r.enrollmentId === e.id)?.[0];
          spendCredit(key, a.iso, cl.clientId, a.serviceId, reserved);
        } catch (err) {
          problems.push(`${cl.name}: ${(err as Error).message}`);
        }
      }
    } else releaseCredit(key, cl.clientId);
  });
  return problems;
}

/**
 * G4 (CONTRATO NOVO, aulas em grupo, 23/11/2026): crédito prometido a uma aula. Cada avulso que paga com reposição e
 * cuja aula ainda não teve a chamada (nem foi cancelada) reserva UM crédito do mesmo serviço: da aula mais próxima para a
 * mais distante, o que vence antes entre os que ainda valem na data da aula. Nada é gravado: tirar o avulso da aula ou
 * cancelar a aula devolve o crédito a "Disponível" (se o cancelamento der reposição, o cliente fica com duas).
 * `ignoreEnrollmentId` = o avulso que está sendo editado; `rollCallOf` = aula cuja chamada está sendo salva agora. Devolve: id do crédito → aula reservada.
 */
export function creditReservations(clientId: string, ignoreEnrollmentId?: string, rollCallOf?: string): Map<string, {enrollmentId: string;aulaKey: string;iso: string;start: string;}> {
  const { turmas, enrollments } = getTurmas();
  const promised = enrollments.
  filter((e) => e.id !== ignoreEnrollmentId && e.clientId === clientId && e.payment === 'credito' && e.kind === 'avulso' && !!e.date).
  map((e) => {
    const t = turmas.find((x) => x.id === e.turmaId);
    if (!t) return null;
    const k = aulaKey(t.id, e.date!);
    if (creditUseOf(k, clientId) || changes[k]?.cancelled || changes[k]?.rollCallAt && k !== rollCallOf) return null;
    const aula = aulaByKey(k);
    return { e, serviceId: t.serviceId, k, iso: aula?.iso ?? e.date!, start: aula?.start ?? t.startTime };
  }).
  filter((x): x is {e: Enrollment;serviceId: string;k: string;iso: string;start: string;} => !!x).
  sort((x, y) => (x.iso + x.start).localeCompare(y.iso + y.start));
  const out = new Map<string, {enrollmentId: string;aulaKey: string;iso: string;start: string;}>();
  promised.forEach((p) => {
    const g = validCreditsFor(clientId, p.serviceId, p.iso).find((c) => !out.has(c.id));
    if (g) out.set(g.id, { enrollmentId: p.e.id, aulaKey: p.k, iso: p.iso, start: p.start });
  });
  return out;
}

/**
 * Reposições que o cliente ainda pode prometer a uma aula deste serviço na data `iso`: válidas até ela e não reservadas
 * para outra aula (`creditReservations`).
 */
export function freeCreditsFor(clientId: string, serviceId: string, iso: string, ignoreEnrollmentId?: string) {
  const reserved = creditReservations(clientId, ignoreEnrollmentId);
  const free = validCreditsFor(clientId, serviceId, iso).filter((c) => !reserved.has(c.id));
  return { free: free.length, next: free[0] ?? null };
}

/** G4: créditos do cliente para a Ficha, com "Reservado" para os prometidos a uma aula ainda sem chamada. */
export function creditsWithReservations(clientId: string): (CreditView & {reservedFor?: {iso: string;start: string;};})[] {
  const reserved = creditReservations(clientId);
  return creditsOf(clientId).map((c) => {
    const r = c.state === 'disponivel' ? reserved.get(c.id) : undefined;
    return r ? { ...c, state: 'reservado' as const, reservedFor: { iso: r.iso, start: r.start } } : c;
  });
}

/** Aulas com chamada salva em que o cliente está (Presente ou Faltou), da mais nova para a mais antiga (histórico da Ficha). */
export function rollCallsOfClient(clientId: string): {aula: Aula;mark: RollMark;}[] {
  return Object.entries(changes).
  filter(([, c]) => !c.cancelled && !!c.rollCallAt && !!c.rollCall?.[clientId]).
  map(([key, c]) => ({ aula: aulaByKey(key), mark: c.rollCall![clientId] })).
  filter((x): x is {aula: Aula;mark: RollMark;} => !!x.aula).
  sort((x, y) => (y.aula.iso + y.aula.start).localeCompare(x.aula.iso + x.aula.start));
}

/**
 * G4 (CONTRATO NOVO, aulas em grupo, 23/11/2026): regra dos números. Todo número que conta ATENDIMENTOS conta cada cliente
 * marcado Presente numa chamada como UM atendimento daquele serviço e profissional (e cada Faltou como uma falta); todo
 * número que conta VEZES NA AGENDA conta a aula uma vez. Esta é a leitura das chamadas salvas (aulas não canceladas), um
 * item por cliente. `id` = `aulaClientApptId`, o mesmo id do fechamento do dinheiro de quem paga por aula.
 */
export function rollCallAttendances(): {id: string;aulaKey: string;clientId: string;client: string;iso: string;time: string;service: string;professionalId: string;mark: RollMark;}[] {
  return Object.entries(changes).
  filter(([, c]) => !c.cancelled && !!c.rollCallAt && !!c.rollCall).
  flatMap(([key, c]) => {
    const a = aulaByKey(key);
    if (!a) return [];
    return Object.entries(c.rollCall!).map(([clientId, mark]) => ({ id: aulaClientApptId(key, clientId), aulaKey: key, clientId, client: nameOf(clientId), iso: a.iso, time: a.start, service: a.serviceName, professionalId: a.professionalId, mark }));
  });
}

/** Próxima aula (de agora em diante, não cancelada) de uma inscrição. */
export function nextAulaOf(e: Enrollment, reach = 60): Aula | null {
  const t = getTurmas().turmas.find((x) => x.id === e.turmaId);
  if (!t || !t.active) return null;
  for (let i = 0; i <= reach; i++) {
    const iso = addDays(TODAY_ISO, i);
    const hit = aulasOn(iso).find((a) => a.turma.id === t.id && !a.cancelled && !a.done && !isPastNow(a.iso, a.start) && (e.kind === 'fixo' || a.origIso === e.date));
    if (hit) return hit;
  }
  return null;
}

/** G5: a palavra do serviço da turma desta inscrição. */
const turmaWordsOf = (e: Enrollment) => dayWordsOfService(getTurmas().turmas.find((t) => t.id === e.turmaId)?.serviceId ?? '');
/** "Pacote · 3 de 8 restantes" · "Reposição" · "Paga por aula" / "Paga por treino" (janela da aula e Ficha do cliente). */
export function enrollmentPayText(e: Enrollment) {
  if (e.payment === 'credito') return 'Reposição';
  if (e.payment !== 'pacote') return `Paga por ${turmaWordsOf(e).one}`;
  const p = listPackages({ client_id: e.clientId }).find((x) => x.id === e.packageId);
  return p ? `Pacote · ${textoDisponiveis(p)}` : 'Pacote';
}