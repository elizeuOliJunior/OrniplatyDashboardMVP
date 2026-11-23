/**
 * Fluxo de contato dos retornos (protótipo, só front-end). Fonte única para Clientes › Retornos, Oportunidades › Retorno próximo,
 * Início e a ficha do cliente.
 *
 * Regras:
 *  - APROVAR ≠ ENVIAR ≠ AGENDAR (status e funções separados). `approveReturnContact` aprova; se o modo salvo das campanhas não for
 *    Pausado, a mensagem fica PROGRAMADA (`simulateSend`, interno). Nada sai de verdade e nenhum texto diz que a mensagem chegou;
 *  - resposta do cliente é registrada pela clínica (no sistema real viria da conversa);
 *  - o agendamento só é criado DEPOIS de registrar o aceite (`setResponse('accepted')` → Novo agendamento → `markScheduled`);
 *  - EXCEÇÃO: quem pediu para não receber mensagens não é aprovado nem programado, mas pode ser agendado quando o PRÓPRIO
 *    cliente pede (a clínica confirma antes; o opt-out vale só para mensagens que a clínica inicia);
 *  - opt-out fica fora de seleção, aprovação, lote e contagens;
 *  - o retorno já agendado nunca gera um segundo agendamento (ver `canSchedule`).
 * L24d (19/11/2026): o motivo de quem fica de fora vem do dicionário (`stoppedLine('retorno')`: "Não recebe avisos de
 *  retorno: {motivo}"). Nenhuma regra mudou.
 * DEPENDE DO BACKEND (ver CLAUDE.md): fila persistente, opt-out por finalidade, envio real e resposta vinda da conversa.
 */
import { useSyncExternalStore } from 'react';
import { TODAY_ISO } from './agendaStore';
import { businessName } from './empresa';
import { dataBR } from './fichaLib';
import { serviceByLabel, shortDate } from './catalogo';
import { clientIdFromName, contactBlockOfName, kindOf, stoppedLine } from './contactPreferences';
import { getSavedAutomationMode } from './automationMode';
import type { AutomationMode } from './automacoes';
import { approveContact, daysBetween, groupOf, simulateSend } from './returns';
import type { ReturnSuggestion } from './returns';

export type ClientResponse = 'none' | 'accepted' | 'declined';
export const RESPONSE_LABEL: Record<ClientResponse, string> = { none: 'Sem resposta', accepted: 'Cliente aceitou', declined: 'Cliente recusou' };

let responses: Record<string, ClientResponse> = {};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useResponses = () => useSyncExternalStore(subscribe, () => responses);
export const responseOf = (id: string): ClientResponse => responses[id] ?? 'none';
export function setResponse(id: string, r: ClientResponse) {
  responses = { ...responses, [id]: r };
  listeners.forEach((l) => l());
}

/** Texto padrão da mensagem (ou o editado pela clínica). */
export function returnMessage(r: ReturnSuggestion): string {
  if (r.customMessage) return r.customMessage;
  const first = r.clientName.split(' ')[0];
  const dias = Math.max(0, daysBetween(r.sourceIso, TODAY_ISO));
  return `Olá, ${first}! Aqui é da ${businessName()}. Já faz ${dias} ${dias === 1 ? 'dia' : 'dias'} desde o seu atendimento de ${r.serviceLabel.toLowerCase()}. O ideal é voltar por volta de ${dataBR(r.recommendedIso)}. Posso ver um horário para você?`;
}

/** O cliente pediu para não receber mensagens (opt-out)? Então o agendamento só acontece a pedido dele. */
export const scheduleNeedsClientRequest = (r: ReturnSuggestion) => !!contactBlockOfName(r.clientName);
export const isOptOut = scheduleNeedsClientRequest;

/** Pode virar agendamento? Só se o cliente aceitou (ou, no opt-out, pediu ele mesmo) e ainda não há agendamento deste retorno. */
export function canSchedule(r: ReturnSuggestion): {ok: boolean;reason?: string;} {
  if (r.status === 'scheduled') return { ok: false, reason: 'Este retorno já está agendado.' };
  if (r.status === 'dismissed' || r.status === 'handled') return { ok: false, reason: 'Reabra o retorno antes de agendar.' };
  if (scheduleNeedsClientRequest(r)) return { ok: true };
  if (responseOf(r.id) !== 'accepted') return { ok: false, reason: 'Registre que o cliente aceitou antes de agendar.' };
  return { ok: true };
}

/** "Para chamar" sem opt-out: é o número que aparece em Retornos, Oportunidades › Retorno próximo, Início e menu. */
export const isToCall = (r: ReturnSuggestion) => groupOf(r.status) === 'chamar' && !isOptOut(r);

/**
 * Aprova o contato (ação principal de "Para chamar"). Nunca para quem pediu para não receber.
 * Modo ≠ Pausado: a mensagem fica programada para a janela 09:00–20:00 (nada sai de verdade no protótipo).
 */
export function approveReturnContact(r: ReturnSuggestion, mode: AutomationMode = getSavedAutomationMode()): {ok: boolean;reason?: string;} {
  const block = contactBlockOfName(r.clientName);
  if (block) return { ok: false, reason: stoppedLine('retorno', kindOf(clientIdFromName(r.clientName), 'retorno')) };
  if (groupOf(r.status) !== 'chamar') return { ok: false, reason: 'contato já aprovado' };
  approveContact(r.id);
  if (mode !== 'pausado') simulateSend(r.id);
  return { ok: true };
}

export type SkippedDetail = {name: string;reason: string;};
export type BulkResult = {affected: number;skipped: number;skippedDetail: SkippedDetail[];};

/** Aprova em lote. Opt-out e quem já está em contato ficam de fora, com o motivo. */
export function approveMany(items: ReturnSuggestion[], mode: AutomationMode = getSavedAutomationMode()): BulkResult {
  let affected = 0;
  const skippedDetail: SkippedDetail[] = [];
  for (const r of items) {
    const res = approveReturnContact(r, mode);
    if (res.ok) affected++;else
    skippedDetail.push({ name: r.clientName, reason: res.reason ?? 'não foi possível' });
  }
  return { affected, skipped: skippedDetail.length, skippedDetail };
}

/** Subtexto de "Em contato", derivado do modo salvo. Nunca diz que a mensagem chegou. */
export function contactSubtext(r: ReturnSuggestion, mode: AutomationMode): string {
  if (r.status === 'contacted' && !r.simulatedSendAt) return 'Avisado por telefone';
  if (mode === 'pausado') return 'Aprovado · envio pausado';
  return 'Mensagem programada';
}

/** "Retorno ideal: 06/10 · em 5 dias" / "atrasado 3 dias" / "hoje". */
export function dueLabel(r: ReturnSuggestion): {date: string;when: string;late: boolean;} {
  const d = daysBetween(TODAY_ISO, r.recommendedIso);
  const when = d < 0 ? `atrasado ${-d} ${-d === 1 ? 'dia' : 'dias'}` : d === 0 ? 'hoje' : `em ${d} ${d === 1 ? 'dia' : 'dias'}`;
  return { date: shortDate(r.recommendedIso), when, late: d < 0 };
}

/** Agrupamento dentro de "Para chamar". */
export type DueBucket = 'atrasados' | 'semana' | 'adiante';
export const DUE_BUCKET_LABEL: Record<DueBucket, string> = { atrasados: 'Atrasados', semana: 'Esta semana', adiante: 'Mais adiante' };
export function dueBucket(r: ReturnSuggestion): DueBucket {
  const d = daysBetween(TODAY_ISO, r.recommendedIso);
  return d < 0 ? 'atrasados' : d <= 7 ? 'semana' : 'adiante';
}

/** Dias desde a última visita (o atendimento de origem). */
export const daysSinceVisit = (r: ReturnSuggestion) => Math.max(0, daysBetween(r.sourceIso, TODAY_ISO));

/** Valor do retorno = preço do serviço no catálogo (MESMA fonte de opportunityQueue). */
export const returnValue = (r: ReturnSuggestion) => serviceByLabel(r.serviceLabel)?.price;