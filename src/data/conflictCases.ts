/**
 * W3 (11/11/2026, Christian, decisão G1): LISTA DE TRABALHO DO DIA para horários que a CLÍNICA mudou ou cancelou.
 *
 * Antes (até a v169) a lista "Conflitos de horário" era recalculada a cada momento: depois de remarcar, o caso sumia sem
 * rastro e ninguém sabia se o cliente tinha sido avisado. Agora cada caso tem três estados:
 *  - `resolver` (Falta resolver): o agendamento continua em conflito com ausência, bloqueio, feriado ou horário;
 *  - `avisar`   (Falta avisar): a equipe remarcou ou a clínica cancelou, e o cliente ainda não foi avisado;
 *  - `resolvido` (Resolvido): avisado pela equipe, mensagem automática enviada, o cliente é que cancelou, ou o conflito
 *    deixou de existir sem mudar o horário (nada a avisar).
 * Mesma regra da lista de espera (decisões 17 e 18): com a automação "Avisar mudança de horário" LIGADA, a mensagem sai
 * sozinha e o caso vai direto para Resolvido; DESLIGADA (padrão), a equipe chama com a mensagem pronta e marca "Avisado".
 * "Não atendeu" registra a tentativa e mantém o caso aberto.
 * Cancelamento feito pela CLÍNICA fora de conflito também entra em "Falta avisar" (G1 + G3). Remarcação comum, sem
 * conflito, não entra (decisão do Christian no plano do W3).
 * I1 (11/11/2026, integração, B3): a automação `avisar-mudanca-horario` agora EXISTE em data/automacoes.ts (desligada por
 * padrão). A mensagem só conta como enviada quando a automação está ligada E a situação dela é "Sai sozinha": enquanto o
 * WhatsApp não aprova a mensagem, ou com o WhatsApp parado, o caso continua em "Falta avisar" (a equipe avisa).
 * PROTÓTIPO: vive na memória da sessão (recarregar zera); nenhuma mensagem sai de verdade.
 */
import { useSyncExternalStore } from 'react';
import { mediumDayLabel, nowStamp } from './agendaStore';
import type { CalAppointment, CancelledBy } from './agendaStore';
import { agendaProfessionalOf } from './availability';
import { automacoesStore, automationSituation, automations } from './automacoes';
import { getSettings } from './settingsStore';

export const CHANGE_AUTOMATION_ID = 'avisar-mudanca-horario';
export const changeAutomationOn = () => {
  const saved = automacoesStore.get();
  const a = automations.find((x) => x.id === CHANGE_AUTOMATION_ID);
  if (!a || !saved.enabled[CHANGE_AUTOMATION_ID]) return false;
  return automationSituation(a, true, saved.mode, getSettings()).group === 'sai';
};

export type CaseState = 'resolver' | 'avisar' | 'resolvido';
export type CaseChange = {kind: 'remarcado';iso: string;start: string;professionalId: string;} | {kind: 'cancelado';};

export type ConflictCase = {
  /** id do agendamento */
  id: string;
  client: string;
  service: string;
  /** horário ORIGINAL (o que entrou em conflito ou foi cancelado) */
  iso: string;
  start: string;
  professionalId: string;
  /** motivo do conflito (ou "Cancelado pela clínica") */
  reason: string;
  state: CaseState;
  change?: CaseChange;
  /** tentativas "Não atendeu" (carimbo do relógio do protótipo) */
  attempts: string[];
  /** como terminou (Resolvido) */
  outcome?: string;
  openedAt: string;
  closedAt?: string;
  /** CONTRATO NOVO (aulas em grupo, G2, 23/11/2026): mensagem pronta própria (aula cancelada ou mudada). */
  message?: string;
  /** CONTRATO NOVO (aulas em grupo, G2, 23/11/2026): caso de um cliente de uma AULA (`turma@data`), não de um agendamento. */
  aulaKey?: string;
};

let cases: ConflictCase[] = [];
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Casos do dia (todos os estados), na ordem do horário original. */
export function useConflictCases(): ConflictCase[] {
  useSyncExternalStore(subscribe, () => version);
  return cases;
}
export const getConflictCases = () => cases;
export const caseOf = (id: string) => cases.find((c) => c.id === id);

const put = (next: ConflictCase) => {
  cases = [...cases.filter((c) => c.id !== next.id), next].sort((a, b) => (a.iso + a.start).localeCompare(b.iso + b.start));
};

const proName = (id: string) => agendaProfessionalOf(id)?.name ?? '';
/** "sexta, 02/10, às 09:00, com Dra. Carolina" */
export const slotText = (iso: string, start: string, professionalId?: string) => {
  const day = mediumDayLabel(iso);
  const who = professionalId ? proName(professionalId) : '';
  return `${day.charAt(0).toLowerCase()}${day.slice(1)}, às ${start}${who ? `, com ${who}` : ''}`;
};

/** O que mudou, em texto curto da equipe. */
export function changeText(c: ConflictCase): string {
  if (!c.change) return '';
  // G2 (aulas em grupo; CONTRATO NOVO): caso de cliente de uma aula.
  if (c.aulaKey) return c.change.kind === 'cancelado' ? 'Aula cancelada' : `Aula mudou para ${slotText(c.change.iso, c.change.start)}`;
  if (c.change.kind === 'cancelado') return 'Cancelado pela clínica';
  return `Remarcado para ${slotText(c.change.iso, c.change.start, c.change.professionalId)}`;
}

/** Mensagem pronta para o cliente (Falta avisar). Sem nome da clínica: a conversa já é do WhatsApp dela. */
export function changeMessage(c: ConflictCase): string {
  if (c.message) return c.message;
  const first = c.client.split(' ')[0];
  const old = slotText(c.iso, c.start, c.professionalId);
  if (c.change?.kind === 'remarcado') {
    return `Oi, ${first}! Precisamos mudar o seu horário de ${c.service}: era ${old} e passou para ${slotText(c.change.iso, c.change.start, c.change.professionalId)}. Se esse horário não der para você, responda aqui que vemos outro.`;
  }
  return `Oi, ${first}! Precisamos cancelar o seu horário de ${c.service} de ${old}. Quer que eu veja outro horário para você?`;
}

type Conflict = {iso: string;appt: CalAppointment;message: string;};

/**
 * Abre um caso para cada conflito novo e fecha, como "nada a avisar", o conflito que sumiu sem a clínica mexer no horário
 * (a ausência ou o bloqueio foi tirado). Chamado pela Agenda sempre que a lista de conflitos muda.
 */
export function syncConflicts(list: Conflict[], appointments: Record<string, CalAppointment[]>) {
  let changed = false;
  const ids = new Set(list.map((c) => c.appt.id));
  list.forEach((c) => {
    const ex = caseOf(c.appt.id);
    if (!ex || ex.state === 'resolvido' && !ex.change) {
      if (ex && ex.reason === c.message && ex.iso === c.iso && ex.start === c.appt.start && ex.state === 'resolver') return;
      put({ id: c.appt.id, client: c.appt.clientName, service: c.appt.service, iso: c.iso, start: c.appt.start, professionalId: c.appt.professionalId, reason: c.message, state: 'resolver', attempts: [], openedAt: nowStamp() });
      changed = true;
    } else if (ex.state === 'resolver' && ex.reason !== c.message) {
      put({ ...ex, reason: c.message });
      changed = true;
    }
  });
  cases.forEach((ex) => {
    if (ex.state !== 'resolver' || ids.has(ex.id)) return;
    const found = Object.entries(appointments).flatMap(([iso, l]) => l.filter((a) => a.id === ex.id).map((a) => ({ iso, a })))[0];
    if (found && found.a.status === 'cancelled') {
      resolveChange(ex, { kind: 'cancelado' }, found.a.cancelledBy);
    } else if (found && (found.iso !== ex.iso || found.a.start !== ex.start || found.a.professionalId !== ex.professionalId)) {
      resolveChange(ex, { kind: 'remarcado', iso: found.iso, start: found.a.start, professionalId: found.a.professionalId });
    } else {
      put({ ...ex, state: 'resolvido', outcome: 'O conflito deixou de existir (a ausência ou o bloqueio saiu). O horário continua o mesmo: não há o que avisar.', closedAt: nowStamp() });
    }
    changed = true;
  });
  if (changed) emit();
}

function resolveChange(ex: ConflictCase, change: CaseChange, cancelledBy?: CancelledBy) {
  if (change.kind === 'cancelado' && cancelledBy === 'client') {
    put({ ...ex, change, state: 'resolvido', outcome: 'O cliente cancelou: não há o que avisar.', closedAt: nowStamp() });
  } else if (changeAutomationOn()) {
    put({ ...ex, change, state: 'resolvido', outcome: 'Mensagem automática enviada ao cliente (automação “Avisar mudança de horário”).', closedAt: nowStamp() });
  } else {
    put({ ...ex, change, state: 'avisar', outcome: undefined, closedAt: undefined });
  }
}

/**
 * Chamado por data/agendaLive.ts ANTES de gravar uma remarcação ou um cancelamento. `conflictReason` = o agendamento
 * estava em conflito agora (mesmo que a Agenda ainda não tenha aberto o caso). Sem caso e sem conflito: só o cancelamento
 * feito pela clínica abre um caso.
 */
export function noteCaseChange(appt: CalAppointment, fromIso: string, conflictReason: string | null, change: CaseChange, cancelledBy?: CancelledBy) {
  let ex = caseOf(appt.id);
  if (ex && ex.state === 'resolvido' && !conflictReason) ex = undefined;
  if (!ex) {
    if (!conflictReason && !(change.kind === 'cancelado' && cancelledBy === 'clinic')) return;
    ex = { id: appt.id, client: appt.clientName, service: appt.service, iso: fromIso, start: appt.start, professionalId: appt.professionalId, reason: conflictReason ?? 'Cancelado pela clínica.', state: 'resolver', attempts: [], openedAt: nowStamp() };
  }
  resolveChange(ex, change, cancelledBy);
  emit();
}

/**
 * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): a empresa cancelou ou mudou uma AULA. Um caso por cliente avisado, com a
 * mensagem pronta da aula, pela MESMA regra dos agendamentos (`resolveChange`, cancelamento da empresa): com "Avisar mudança
 * de horário" ligada, vai direto para Resolvido; desligada, entra em "Falta avisar" com "Chamar no WhatsApp" e "Avisado".
 * O caso da própria aula em "Falta resolver" (aula sob bloqueio), se houver, fecha como resolvido.
 */
export function noteAulaChange(
aula: {key: string;id: string;serviceName: string;iso: string;start: string;professionalId: string;},
clients: {clientId: string;name: string;message: string;}[],
change: CaseChange)
: 'auto' | 'avisar' {
  const reason = change.kind === 'cancelado' ? 'Aula cancelada pela empresa.' : 'Aula mudou de horário.';
  clients.forEach((c) => {
    const ex: ConflictCase = { id: `${aula.id}:${c.clientId}`, client: c.name, service: aula.serviceName, iso: aula.iso, start: aula.start, professionalId: aula.professionalId, reason, state: 'resolver', attempts: [], openedAt: nowStamp(), message: c.message, aulaKey: aula.key };
    resolveChange(ex, change, 'clinic');
  });
  const own = caseOf(aula.id);
  if (own && own.state === 'resolver') put({ ...own, state: 'resolvido', change, outcome: change.kind === 'cancelado' ? 'Aula cancelada: os clientes entram em “Falta avisar”.' : 'Aula mudou de horário: os clientes entram em “Falta avisar”.', closedAt: nowStamp() });
  emit();
  return changeAutomationOn() ? 'auto' : 'avisar';
}
/** Desfazer de `noteAulaChange`: tira os casos dos clientes daquela aula abertos depois de `since` (lista anterior). */
export function restoreCases(prev: ConflictCase[]) {
  cases = prev;
  emit();
}

/** "Avisado": fecha o caso. Devolve o caso anterior (para o Desfazer). */
export function markNotified(id: string): ConflictCase | undefined {
  const ex = caseOf(id);
  if (!ex) return undefined;
  put({ ...ex, state: 'resolvido', outcome: `Avisado pela equipe em ${nowStamp()}.`, closedAt: nowStamp() });
  emit();
  return ex;
}

/** "Não atendeu": registra a tentativa; o caso continua em Falta avisar. */
export function markNoAnswer(id: string): ConflictCase | undefined {
  const ex = caseOf(id);
  if (!ex) return undefined;
  put({ ...ex, attempts: [...ex.attempts, nowStamp()] });
  emit();
  return ex;
}

/** Desfazer: volta o caso como estava. */
export function restoreCase(prev: ConflictCase) {
  put(prev);
  emit();
}

/** Desfazer de uma ação que ABRIU um caso que não existia: o caso sai. */
export function removeCase(id: string) {
  if (!caseOf(id)) return;
  cases = cases.filter((c) => c.id !== id);
  emit();
}