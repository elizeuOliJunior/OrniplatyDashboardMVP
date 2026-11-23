/**
 * Pedido para abrir o Novo agendamento de qualquer tela (Lote B, 20/10/2026).
 * Usado pelo Fechar atendimento › Retorno "Já marcado": o atendimento fecha e o Novo agendamento abre preenchido.
 * O modal fica num host único (components/modals/BookingHost.tsx, montado no DashboardLayout), porque o modal de
 * fechamento some ao fechar e levaria o agendamento junto.
 */
import { useSyncExternalStore } from 'react';
import type { AgendamentoDefaults } from '../components/modals/NovoAgendamentoModal';

/**
 * G1 subetapa 2 (F-025): pedido vindo de um caso de Oportunidades ("Agendar") leva o id do caso. O horário criado guarda
 * `followUpCaseId` (ligação EXPLÍCITA): é ela que dá "Agendou" e, depois de atendido e pago, "Voltou".
 */
export type BookingRequest = AgendamentoDefaults & {followUpCaseId?: string;};

let current: BookingRequest | null = null;
const listeners = new Set<() => void>();

export function requestBooking(defaults: BookingRequest) {
  current = { ...defaults };
  listeners.forEach((l) => l());
}
export function clearBookingRequest() {
  current = null;
  listeners.forEach((l) => l());
}
export function useBookingRequest() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current
  );
}