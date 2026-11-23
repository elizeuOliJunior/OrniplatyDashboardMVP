import React from 'react';
import { NovoAgendamentoModal } from './NovoAgendamentoModal';
import { tryAddAppointment } from '../../data/agendaLive';
import { clearBookingRequest, useBookingRequest } from '../../data/bookingRequest';

/** Host único do Novo agendamento pedido por outra tela (ver data/bookingRequest.ts). Pedido de um caso guarda a ligação (G1). */
export function BookingHost() {
  const request = useBookingRequest();
  const { followUpCaseId, ...defaults } = request ?? {};
  return (
    <NovoAgendamentoModal
      open={!!request}
      defaults={request ? defaults : undefined}
      onClose={clearBookingRequest}
      onSaved={(data) => tryAddAppointment(data, followUpCaseId ? { followUpCaseId } : undefined)} />);


}