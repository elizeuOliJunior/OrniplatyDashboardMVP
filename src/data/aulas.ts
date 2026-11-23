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
import { getServices, isGroupService } from './servicesStore';
import { getTurmas, useTurmas } from './turmas';
import type { Enrollment, Turma, Weekday } from './turmas';
import { clientById } from './api/clientes';
import { getMakeupRules } from './makeupRules';
import { actor } from './legado';
import { fromMinutes, toMinutes } from '../utils/time';

/** CONTRATO NOVO (aulas em grupo, 23/11/2026): marcação da chamada de um cliente. */
export type RollMark = 'presente' | 'faltou';

/** CONTRATO NOVO (aulas em grupo, 23/11/2026): o que mudou numa aula (só existe quando algo mudou). */
export type AulaChange = {
  cancelled?: {reason?: string;at: string;by: string;};
  /** Novo dia e horário (o profissional continua o da turma). */
  moved?: {iso: string;start: string;at: string;by: string;reason?: string;};
  /** Clientes (id do cadastro) que avisaram que faltam nesta aula. */
  warned?: string[];
  /** Dos que avisaram: quem avisou dentro do prazo da regra de reposição (o crédito é do lote G3). */
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
    done: !!change.rollCallAt
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
export type AulaRef = {key: string;full: boolean;};
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
    aula: { key: a.key, full: a.full && !a.cancelled }
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
/** Mensagem pronta para o cliente (Falta avisar). */
export function aulaChangeMessage(clientName: string, serviceName: string, fromIso: string, fromStart: string, to: {iso: string;start: string;} | null, reason?: string) {
  const first = clientName.split(' ')[0];
  const what = `A aula de ${serviceName} de ${aulaDayText(fromIso)}, às ${fromStart}`;
  const r = reason?.trim() ? ` Motivo: ${reason.trim().replace(/[.!]+$/, '')}.` : '';
  return to ? `Oi, ${first}! ${what}, mudou para ${aulaDayText(to.iso)}, às ${to.start}.${r}` : `Oi, ${first}! ${what}, foi cancelada.${r}`;
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
  return before;
}
/** Desfazer de qualquer ação desta janela: a aula volta como estava. */
export function restoreAula(key: string, before: AulaChange) {
  const next = { ...changes };
  if (Object.keys(before).length) next[key] = before;else
  delete next[key];
  emit(next);
}

/** Salva a chamada (presente ou faltou de cada cliente que não avisou). */
export function saveRollCall(key: string, marks: Record<string, RollMark>): AulaChange {
  const before = changes[key] ?? {};
  patch(key, (c) => ({ ...c, rollCall: marks, rollCallAt: nowStamp() }));
  return before;
}

/** Cancela a aula (com motivo opcional). Devolve a mudança de antes. */
export function cancelAula(key: string, reason?: string): AulaChange {
  const before = changes[key] ?? {};
  patch(key, (c) => ({ ...c, cancelled: { reason: reason?.trim() || undefined, at: nowStamp(), by: actor() } }));
  return before;
}

/** Muda o dia/horário da aula (mesmo profissional). Devolve a mudança de antes. */
export function moveAula(key: string, iso: string, start: string, reason?: string): AulaChange {
  const before = changes[key] ?? {};
  patch(key, (c) => ({ ...c, moved: { iso, start, at: nowStamp(), by: actor(), reason: reason?.trim() || undefined } }));
  return before;
}