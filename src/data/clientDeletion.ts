/**
 * G4 (F-069): exclusão definitiva do cliente, com o efeito que a confirmação descreve.
 *
 * O que SAI das telas de operação:
 * - o cadastro (Clientes, busca, seletores);
 * - a conversa da lista de Conversas (as mensagens trocadas ficam no histórico e continuam contando em Resultados);
 * - os pedidos dele na Lista de espera;
 * - os casos dele em Oportunidades (precisa de você / está cuidando / resolvidos);
 * - os pacotes dele na aba Pacotes;
 * - os horários FUTUROS (ainda não começados) são CANCELADOS com o motivo "Cliente excluído do cadastro" (não apagados).
 *
 * O que FICA (histórico): atendimentos passados, fechamentos, recebimentos, reembolsos, sessões usadas, mensagens enviadas,
 * trilhas de auditoria e os números de Resultados. No sistema real, o que é retido e por quanto tempo é contrato do G6
 * (hoje o backend lido só tem `DELETE /clients/{id}` em cascata).
 */
import { NOW, TODAY_ISO } from './agendaStore';
import type { CalAppointment } from './agendaStore';
import { cancelAppointment, getAgendaState, setWaitlist } from './agendaLive';
import { conversations } from './conversas';
import { notifyConversations } from './conversasThreads';
import { clientById, clientIdOfRecordedName, deleteClientPermanently } from './api/clientes';
import { listPackages } from './api/pacotes';

export const DELETED_CANCEL_REASON = 'Cliente excluído do cadastro';

const notStarted = (iso: string, a: CalAppointment) => iso > TODAY_ISO || iso === TODAY_ISO && a.start > NOW;
const isOpen = (a: CalAppointment) => a.status !== 'cancelled' && a.status !== 'completed' && a.status !== 'no_show';

/** Horários futuros (ainda não começados, não cancelados) do cliente. */
export function futureAppointmentsOf(clientId: string) {
  return Object.entries(getAgendaState().appointments).flatMap(([iso, list]) =>
  list.filter((a) => isOpen(a) && notStarted(iso, a) && clientIdOfRecordedName(a.clientName) === clientId).map((a) => ({ iso, a }))
  );
}

export function waitlistEntriesOf(clientId: string) {
  return getAgendaState().waitlist.filter((e) => clientIdOfRecordedName(e.clientName) === clientId);
}

export type DeletionImpact = {future: number;waitlist: number;conversation: boolean;packages: number;activePackages: number;};

export function deletionImpact(clientId: string): DeletionImpact {
  const pk = listPackages({ client_id: clientId });
  return {
    future: futureAppointmentsOf(clientId).length,
    waitlist: waitlistEntriesOf(clientId).length,
    conversation: conversations.some((c) => c.id === clientId),
    packages: pk.length,
    activePackages: pk.filter((p) => p.status === 'active').length
  };
}

/** Exclui e aplica os efeitos acima. Devolve o que foi feito (para o Toast). */
export function deleteClientWithEffects(clientId: string): DeletionImpact | null {
  if (!clientById(clientId)) return null;
  const impact = deletionImpact(clientId);
  // Antes de tirar do cadastro: depois disso o nome gravado não casa mais com o id.
  for (const { iso, a } of futureAppointmentsOf(clientId)) cancelAppointment(iso, a.id, DELETED_CANCEL_REASON);
  const waitIds = new Set(waitlistEntriesOf(clientId).map((e) => e.id));
  if (waitIds.size) setWaitlist((l) => l.filter((e) => !waitIds.has(e.id)));
  const ci = conversations.findIndex((c) => c.id === clientId);
  if (ci >= 0) conversations.splice(ci, 1);
  deleteClientPermanently(clientId);
  notifyConversations();
  return impact;
}