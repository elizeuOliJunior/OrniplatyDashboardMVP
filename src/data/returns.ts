/**
 * Gestão inteligente de retornos (protótipo, só front-end).
 *
 * TELA (20/10/2026): os status internos abaixo NÃO mudaram; a tela agrupa em 3 estados (`groupOf`):
 *  "Para chamar" = pending_approval + postponed · "Em contato" = approved + contacted · "Agendados" = scheduled.
 *  dismissed/handled ficam em "Ver encerrados". Aprovar ≠ enviar ≠ agendar continuam funções e status separados.
 *
 * Regras de negócio aprovadas:
 *  - o retorno é gerado automaticamente quando um agendamento é marcado como CONCLUÍDO;
 *  - o prazo vem do intervalo de retorno configurado no serviço (Serviços e equipe → coluna Retorno);
 *  - nunca é gerado para cancelado, falta (no_show) ou não concluído, nem para serviço sem intervalo;
 *  - o contato com o cliente é MANUAL por padrão (a clínica aprova); a automação é opcional e fica desligada;
 *  - um retorno NÃO ocupa horário na agenda: só vira agendamento real quando alguém cria o agendamento;
 *  - quem pediu para não receber mensagens (data/contactPreferences.ts) nunca tem o contato aprovado, nem pela automação.
 * L24d (19/11/2026): a linha do histórico de quem tem "Avisos de retorno" parados vem do dicionário
 *  (`stoppedLine('retorno')`). Nenhuma regra mudou.
 *
 * Nada aqui envia mensagem de verdade nem grava no backend. Dependências estão em CLAUDE.md.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useAgendaData } from './agendaLive';
import type { CalAppointment } from './agendaStore';
import { TODAY_ISO } from './agendaStore';
import { serviceByLabel } from './catalogo';
import { serviceByName } from './servicesStore';
import { returnDaysOf } from './followUpModels';
import { clientIdOfRecordedName, contactBlockOfRecordedName } from './api/clientes';
import { kindOf, stoppedLine } from './contactPreferences';

export type ReturnStatus = 'pending_approval' | 'approved' | 'contacted' | 'scheduled' | 'postponed' | 'dismissed' | 'handled';

export const RETURN_STATUS: Record<ReturnStatus, {label: string;tone: 'warning' | 'info' | 'violet' | 'success' | 'muted';}> = {
  pending_approval: { label: 'A aprovar', tone: 'warning' },
  approved: { label: 'Aprovado', tone: 'info' },
  contacted: { label: 'Contatado', tone: 'violet' },
  scheduled: { label: 'Agendado', tone: 'success' },
  postponed: { label: 'Adiado', tone: 'muted' },
  dismissed: { label: 'Dispensado', tone: 'muted' },
  handled: { label: 'Resolvido', tone: 'success' }
};

/** Estados em que ainda há algo a fazer pela clínica. */
export const ACTIONABLE: ReturnStatus[] = ['pending_approval', 'approved', 'contacted', 'postponed'];

export type ReturnLog = {at: string;text: string;};

export type ReturnSuggestion = {
  /** `ret-{id do atendimento de origem}`: um retorno por atendimento concluído (evita duplicar) */
  id: string;
  clientName: string;
  sourceApptId: string;
  sourceIso: string;
  sourceStart: string;
  serviceValue: string;
  serviceLabel: string;
  professionalId: string;
  intervalDays: number;
  recommendedIso: string;
  reason: string;
  status: ReturnStatus;
  /** A clínica aprovou o contato (isso NÃO é o mesmo que ter enviado algo) */
  contactApproved: boolean;
  /** Hora do "envio" simulado; nulo = nada foi enviado */
  simulatedSendAt: string | null;
  /** Mensagem editada pela clínica (nulo = texto padrão de `returnMessage`) */
  customMessage?: string | null;
  /** Data ou motivo editados à mão: nunca são sobrescritos por um novo processamento */
  manualEdit: boolean;
  autoApproved: boolean;
  scheduledIso: string | null;
  scheduledApptId: string | null;
  log: ReturnLog[];
};

type State = {items: ReturnSuggestion[];automation: boolean;version: number;};
let state: State = { items: [], automation: false, version: 0 };
const listeners = new Set<() => void>();
function emit(next: Partial<State>) {
  state = { ...state, ...next, version: state.version + 1 };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const daysBetween = (a: string, b: string) => {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86400000);
};
const stamp = () => 'agora';

/**
 * Intervalo de retorno (dias) do serviço, ou null quando o modelo não gera retorno.
 * G1 (F-015): UMA fonte — o modelo de acompanhamento do serviço (`followUp`, data/servicesStore.ts), via `returnDaysOf`.
 * Serviço novo com modelo (manutenção/série/revisão) já gera retorno ao concluir o atendimento, sem campo paralelo.
 */
export function returnIntervalFor(serviceLabel: string): {value: string;days: number;} | null {
  const value = serviceByLabel(serviceLabel)?.value;
  if (!value) return null;
  const svc = serviceByName(serviceLabel);
  const days = svc ? returnDaysOf(svc.followUp) : null;
  return days && days > 0 ? { value, days } : null;
}

const isOpenAppt = (a: CalAppointment) => a.status !== 'cancelled' && a.status !== 'no_show' && a.status !== 'completed';

/**
 * Processa a agenda: cria retornos para atendimentos concluídos (uma vez por atendimento), tira os que ainda
 * não foram tocados quando o atendimento deixa de estar concluído e acompanha agendamentos reais.
 * Seguro para rodar quantas vezes for preciso (idempotente).
 */
export function syncReturns(appointments: Record<string, CalAppointment[]>) {
  const all = Object.entries(appointments).flatMap(([iso, list]) => list.map((a) => ({ iso, a })));
  const byId = new Map(all.map((x) => [x.a.id, x]));
  let items = state.items;
  let changed = false;

  // 1) criar
  for (const { iso, a } of all) {
    if (a.status !== 'completed') continue;
    const id = `ret-${a.id}`;
    if (items.some((r) => r.id === id)) continue;
    const interval = returnIntervalFor(a.service);
    if (!interval) continue;
    const blocked = !!contactBlockOfRecordedName(a.clientName);
    const auto = state.automation && !blocked;
    const s: ReturnSuggestion = {
      id,
      clientName: a.clientName,
      sourceApptId: a.id,
      sourceIso: iso,
      sourceStart: a.start,
      serviceValue: interval.value,
      serviceLabel: a.service,
      professionalId: a.professionalId,
      intervalDays: interval.days,
      recommendedIso: addDays(iso, interval.days),
      reason: `Retorno de ${a.service.toLowerCase()} a cada ${interval.days} dias.`,
      status: auto ? 'approved' : 'pending_approval',
      contactApproved: auto,
      simulatedSendAt: null,
      manualEdit: false,
      autoApproved: auto,
      scheduledIso: null,
      scheduledApptId: null,
      log: [
      {
        at: stamp(),
        text: blocked ?
        `Gerado ao concluir o atendimento. ${stoppedLine('retorno', kindOf(clientIdOfRecordedName(a.clientName), 'retorno'))}.` :
        auto ?
        'Gerado ao concluir o atendimento. Contato aprovado pela automação.' :
        'Gerado ao concluir o atendimento. Para você chamar.'
      }]

    };
    items = [...items, s];
    changed = true;
  }

  // 2) remover os intocados cujo atendimento não está mais concluído; reverter agendamentos que sumiram
  items = items.flatMap((r) => {
    const src = byId.get(r.sourceApptId);
    if (r.status === 'pending_approval' && !r.manualEdit && (!src || src.a.status !== 'completed')) {
      changed = true;
      return [];
    }
    if (r.status === 'scheduled' && r.scheduledApptId) {
      const hit = byId.get(r.scheduledApptId);
      if (!hit || !isOpenAppt(hit.a)) {
        changed = true;
        return [{ ...r, status: 'pending_approval' as ReturnStatus, scheduledIso: null, scheduledApptId: null, log: [...r.log, { at: stamp(), text: 'O agendamento do retorno foi cancelado ou removido. O retorno voltou para a fila.' }] }];
      }
    }
    return [r];
  });

  // 3) agendamento real do mesmo serviço, depois do atendimento de origem, confirma o retorno
  items = items.map((r) => {
    if (!ACTIONABLE.includes(r.status)) return r;
    const hit = all.
    filter((x) => x.a.clientName === r.clientName && x.a.service === r.serviceLabel && isOpenAppt(x.a) && x.iso > r.sourceIso).
    sort((p, q) => (p.iso + p.a.start).localeCompare(q.iso + q.a.start))[0];
    if (!hit) return r;
    changed = true;
    return { ...r, status: 'scheduled' as ReturnStatus, scheduledIso: hit.iso, scheduledApptId: hit.a.id, log: [...r.log, { at: stamp(), text: 'Agendamento real encontrado na Agenda. Retorno marcado como agendado.' }] };
  });

  if (changed) emit({ items });
}

/** Mantém os retornos em dia com a agenda em qualquer tela que os mostre. */
export function useReturns() {
  const { appointments } = useAgendaData();
  useEffect(() => {
    syncReturns(appointments);
  }, [appointments]);
  useSyncExternalStore(subscribe, () => state.version);
  return { items: state.items, automation: state.automation };
}

function patch(id: string, fn: (r: ReturnSuggestion) => ReturnSuggestion) {
  emit({ items: state.items.map((r) => r.id === id ? fn(r) : r) });
}
const log = (r: ReturnSuggestion, text: string) => [...r.log, { at: stamp(), text }];

/**
 * Guarda o retorno como está agora e devolve a função que o restaura (botão "Desfazer" do Toast, regra v3.2 do design system).
 * Restaura o item inteiro (status, data, mensagem, histórico): serve para aprovar, adiar, avisar por telefone, recusar e reabrir.
 */
export function snapshotReturn(id: string): () => void {
  const prev = state.items.find((r) => r.id === id);
  return () => {
    if (prev) patch(id, () => prev);
  };
}

export function setReturnDate(id: string, iso: string) {
  patch(id, (r) => ({ ...r, recommendedIso: iso, manualEdit: true, log: log(r, `Data recomendada alterada para ${iso.split('-').reverse().join('/')}.`) }));
}
export function setReturnReason(id: string, reason: string) {
  patch(id, (r) => ({ ...r, reason, manualEdit: true }));
}
export function setReturnMessage(id: string, text: string | null) {
  patch(id, (r) => ({ ...r, customMessage: text && text.trim() ? text : null, manualEdit: true }));
}
/** Só APROVA. Não envia nada e não agenda nada. */
export function approveContact(id: string) {
  patch(id, (r) => ({ ...r, status: 'approved', contactApproved: true, log: log(r, 'Contato aprovado por você.') }));
}
export function markContacted(id: string, note = 'Você avisou o cliente por telefone.') {
  patch(id, (r) => ({ ...r, status: 'contacted', contactApproved: true, log: log(r, note) }));
}
/**
 * Marca a mensagem como PROGRAMADA para a janela de envio (protótipo: nada sai de verdade; nome mantido por compatibilidade).
 * Nunca registra que a mensagem chegou ao cliente.
 */
export function simulateSend(id: string) {
  patch(id, (r) => ({ ...r, status: 'contacted', simulatedSendAt: 'programada', log: log(r, 'Mensagem programada para o horário de envio (09:00 às 20:00).') }));
}
export function postponeReturn(id: string, iso: string) {
  patch(id, (r) => ({ ...r, status: 'postponed', recommendedIso: iso, manualEdit: true, log: log(r, `Adiado para ${iso.split('-').reverse().join('/')}.`) }));
}
export function dismissReturn(id: string, reason?: string) {
  patch(id, (r) => ({ ...r, status: 'dismissed', log: log(r, reason ? `Dispensado por você: ${reason}.` : 'Dispensado por você.') }));
}
export function markHandled(id: string) {
  patch(id, (r) => ({ ...r, status: 'handled', log: log(r, 'Marcado como resolvido por você.') }));
}
export function reopenReturn(id: string) {
  patch(id, (r) => ({ ...r, status: r.contactApproved ? 'approved' : 'pending_approval', log: log(r, 'Reaberto por você.') }));
}
export function markScheduled(id: string, iso: string, apptId: string) {
  patch(id, (r) => ({ ...r, status: 'scheduled', scheduledIso: iso, scheduledApptId: apptId, log: log(r, `Agendado de verdade na Agenda em ${iso.split('-').reverse().join('/')}.`) }));
}

/**
 * Liga/desliga a aprovação automática de contato. SEM USO NA TELA desde 20/10/2026: o controle de envio fica só em
 * IA Orniplaty › Automações (modo + automação "retorno"). Mantido para não quebrar cópias antigas.
 */
export function setAutomation(enabled: boolean) {
  emit({ automation: enabled });
}

/** Próximo retorno que ainda exige ação da clínica para um cliente (o card "Próximo retorno" da ficha). */
export function nextActionableFor(items: ReturnSuggestion[], clientName: string) {
  return items.
  filter((r) => r.clientName === clientName && (ACTIONABLE.includes(r.status) || r.status === 'scheduled')).
  sort((a, b) => {
    const sa = a.status === 'scheduled' ? 1 : 0;
    const sb = b.status === 'scheduled' ? 1 : 0;
    return sa - sb || a.recommendedIso.localeCompare(b.recommendedIso);
  })[0];
}

export const isOverdue = (r: ReturnSuggestion) => ACTIONABLE.includes(r.status) && r.recommendedIso < TODAY_ISO;

/** Os 3 estados visíveis da fila (os status internos não mudam). */
export type ReturnGroup = 'chamar' | 'contato' | 'agendados' | 'encerrados';
export function groupOf(s: ReturnStatus): ReturnGroup {
  if (s === 'pending_approval' || s === 'postponed') return 'chamar';
  if (s === 'approved' || s === 'contacted') return 'contato';
  if (s === 'scheduled') return 'agendados';
  return 'encerrados';
}
/** Rótulo do estado em Retornos, Oportunidades e Ficha (mesmo texto nos três lugares). */
export const RETURN_GROUP_LABEL: Record<ReturnGroup, string> = {
  chamar: 'Para chamar',
  contato: 'Em contato',
  agendados: 'Agendado',
  encerrados: 'Encerrado'
};
export const RETURN_GROUP_TONE: Record<ReturnGroup, 'warning' | 'info' | 'success' | 'muted'> = {
  chamar: 'warning',
  contato: 'info',
  agendados: 'success',
  encerrados: 'muted'
};