/**
 * W2 (11/11/2026, D-A3-1 do Christian): conflitos criados por uma MUDANÇA NO SERVIÇO (duração, quem faz, arquivar).
 * Nada muda sozinho no agendamento: ele continua como estava e aparece em "Conflitos a resolver" (Funcionamento) e na
 * contagem de conflitos da Agenda, com o motivo legível, até alguém remarcar.
 *
 * Por que um registro e não uma regra derivada: a amostra tem agendamentos com duração diferente da do cadastro; uma
 * regra derivada marcaria todos eles como conflito. Aqui só entra o que a mudança salva atingiu (calculado antes de
 * salvar por `serviceChangeConflicts`, em data/serviceArchiveImpact.ts).
 *
 * O registro só vale enquanto o agendamento continua IGUAL (mesmo dia, horário, profissional e serviço) e a causa
 * continua de pé (`pruneServiceConflicts`, chamado a cada salvar/arquivar/reativar serviço). Remarcar ou desfazer a
 * mudança tira o caso da lista sem ninguém apagar nada à mão.
 * Sem dependências de outros stores (data/availability.ts importa daqui).
 */
import { useSyncExternalStore } from 'react';

export type ServiceConflictKind = 'duration' | 'professional' | 'archived';

export type ServiceConflictRecord = {
  apptId: string;
  iso: string;
  start: string;
  end: string;
  professionalId: string;
  /** Nome do cliente como está no agendamento (só para mostrar no aviso). */
  clientName: string;
  /** Texto do serviço gravado no agendamento (nunca reescrito). */
  service: string;
  serviceId: string;
  kind: ServiceConflictKind;
  /** Motivo legível, ex.: "Dra. Carolina não faz mais Toxina botulínica." */
  message: string;
};

let records: ServiceConflictRecord[] = [];
const listeners = new Set<() => void>();
const emit = (next: ServiceConflictRecord[]) => {
  records = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getServiceConflicts = () => records;
export const useServiceConflicts = () => useSyncExternalStore(subscribe, () => records);

/** Grava (ou troca) os conflitos de uma mudança salva. Um agendamento tem no máximo um registro por serviço. */
export function addServiceConflicts(list: ServiceConflictRecord[]) {
  if (!list.length) return;
  const keys = new Set(list.map((r) => `${r.apptId}|${r.serviceId}`));
  emit([...records.filter((r) => !keys.has(`${r.apptId}|${r.serviceId}`)), ...list]);
}

/** Tira os registros cuja causa deixou de existir (ex.: o profissional voltou a fazer o serviço). */
export function pruneServiceConflicts(stillValid: (r: ServiceConflictRecord) => boolean) {
  const next = records.filter(stillValid);
  if (next.length !== records.length) emit(next);
}

/** O agendamento ainda é o mesmo que entrou em conflito? (remarcado, trocado de profissional ou cancelado = não) */
export function recordMatches(r: ServiceConflictRecord, iso: string, a: {id: string;start: string;end: string;professionalId: string;service: string;}) {
  return r.apptId === a.id && r.iso === iso && r.start === a.start && r.end === a.end && r.professionalId === a.professionalId && r.service === a.service;
}