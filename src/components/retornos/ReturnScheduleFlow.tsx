import React, { useState } from 'react';
import { Button } from '../Button';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { useToast } from '../ui/Toast';
import { NovoAgendamentoModal } from '../modals/NovoAgendamentoModal';
import type { AgendamentoDefaults } from '../modals/NovoAgendamentoModal';
import { tryAddAppointment } from '../../data/agendaLive';
import { TODAY_ISO } from '../../data/agendaStore';
import { alwaysAnswersText, clientIdFromName, kindOf, stoppedLine } from '../../data/contactPreferences';
import { RETURN_GROUP_LABEL, dismissReturn, groupOf, markScheduled, snapshotReturn } from '../../data/returns';
import type { ReturnSuggestion } from '../../data/returns';
import { canSchedule, isOptOut, responseOf, setResponse } from '../../data/returnsFlow';
import type { ClientResponse } from '../../data/returnsFlow';

const firstName = (name: string) => name.split(' ')[0];

/**
 * Ação de 1 clique, sem confirmação, com "Desfazer" no Toast (regra v3.2 do Toast; mesmo padrão de
 * Oportunidades › "Agora não" em `components/oportunidades/OpportunityFlow.tsx`).
 * Guarda o retorno (e a resposta do cliente) antes, executa e mostra o toast; "Desfazer" restaura tudo como estava.
 */
export function useUndoableReturn() {
  const toast = useToast();
  return (r: ReturnSuggestion, act: () => void, msg: {title: string;description?: string;}) => {
    const undoItem = snapshotReturn(r.id);
    const prevResponse: ClientResponse = responseOf(r.id);
    const g = groupOf(r.status);
    const back = g === 'encerrados' ? 'Ver encerrados' : RETURN_GROUP_LABEL[g];
    act();
    toast({
      title: msg.title,
      description: msg.description,
      tone: 'info',
      action: {
        label: 'Desfazer',
        onClick: () => {
          undoItem();
          if (responseOf(r.id) !== prevResponse) setResponse(r.id, prevResponse);
          toast({ title: 'Pronto, desfeito', description: `${r.clientName} voltou para ${back}.`, tone: 'info' });
        }
      }
    });
  };
}

/**
 * Fluxo ÚNICO de "Agendar retorno" e "Dispensar" (Clientes › Retornos, ficha do cliente e detalhe do retorno).
 *  - Em contato: pergunta se o cliente aceitou; "Sim, escolher horário" registra o aceite (`setResponse('accepted')`) e SÓ ENTÃO
 *    abre o Novo agendamento. O agendamento é criado ao salvar (regra única de disponibilidade) e marca o retorno como agendado.
 *  - Para chamar (sem opt-out): não agenda; o cliente ainda não foi chamado. "Cliente aceitou" nunca aparece aqui.
 *  - Opt-out: confirma que o PRÓPRIO cliente pediu o horário antes de abrir o Novo agendamento.
 * L24d (19/11/2026): a janela de quem tem "Avisos de retorno" parados usa o dicionário (`stoppedLine('retorno')` +
 *  `alwaysAnswersText`), no lugar de "Ele pediu para não receber mensagens da clínica." e `optOutScopeNote`.
 */
export function useReturnScheduleFlow() {
  const toast = useToast();
  const [askAccept, setAskAccept] = useState<ReturnSuggestion | null>(null);
  const [askRequested, setAskRequested] = useState<ReturnSuggestion | null>(null);
  const [scheduling, setScheduling] = useState<ReturnSuggestion | null>(null);
  const [dismissing, setDismissing] = useState<ReturnSuggestion | null>(null);

  const openScheduler = (r: ReturnSuggestion) => {
    const g = canSchedule(r);
    if (!g.ok) {
      toast({ title: 'Ainda não dá para agendar', description: g.reason, tone: 'warning' });
      return;
    }
    setScheduling(r);
  };

  /** Ação "Agendar retorno" / "Agendar a pedido dele". */
  const request = (r: ReturnSuggestion) => {
    if (isOptOut(r)) return setAskRequested(r);
    if (groupOf(r.status) !== 'contato') {
      toast({ title: 'Aprove o contato primeiro', description: `${r.clientName} ainda não foi chamado para o retorno.`, tone: 'warning' });
      return;
    }
    if (responseOf(r.id) === 'accepted') return openScheduler(r);
    setAskAccept(r);
  };

  const defaults: AgendamentoDefaults | undefined = scheduling ?
  { client: scheduling.clientName, service: scheduling.serviceValue, professional: scheduling.professionalId, date: scheduling.recommendedIso < TODAY_ISO ? TODAY_ISO : scheduling.recommendedIso } :
  undefined;

  const dialogs =
  <>
      <AppModal
      open={!!askAccept}
      onClose={() => setAskAccept(null)}
      title={`${askAccept ? firstName(askAccept.clientName) : 'O cliente'} aceitou o retorno?`}
      description="O horário só é marcado depois que o cliente aceita."
      footer={
      <ModalActions equal={2}>
            <Button variant="neutral" onClick={() => setAskAccept(null)}>
              Ainda não
            </Button>
            <Button
          onClick={() => {
            const r = askAccept;
            setAskAccept(null);
            if (!r) return;
            setResponse(r.id, 'accepted');
            openScheduler(r);
          }}>
          
              Sim, escolher horário
            </Button>
          </ModalActions>
      }>
      
        <p className="text-sm text-text-secondary">Se ele ainda não respondeu, o retorno continua em contato até você registrar a resposta.</p>
      </AppModal>

      <AppModal
      open={!!askRequested}
      onClose={() => setAskRequested(null)}
      title={`${askRequested?.clientName ?? 'O cliente'} pediu este agendamento?`}
      description={askRequested ? stoppedLine('retorno', kindOf(clientIdFromName(askRequested.clientName), 'retorno')) : undefined}
      footer={
      <ModalActions equal={2}>
            <Button variant="neutral" onClick={() => setAskRequested(null)}>
              Cancelar
            </Button>
            <Button
          onClick={() => {
            const r = askRequested;
            setAskRequested(null);
            if (r) openScheduler(r);
          }}>
          
              Sim, ele pediu
            </Button>
          </ModalActions>
      }>
      
        <p className="text-sm text-text-secondary">
          {alwaysAnswersText()} Confirme só se ele mesmo pediu o horário (por mensagem, ligação ou presencialmente). Nenhuma mensagem é enviada por causa disto.
        </p>
      </AppModal>

      <AppModal
      open={!!dismissing}
      onClose={() => setDismissing(null)}
      tone="danger"
      title={`Dispensar o retorno de ${dismissing?.clientName ?? ''}?`}
      footer={
      <ModalActions equal={2}>
            <Button variant="neutral" onClick={() => setDismissing(null)}>
              Voltar
            </Button>
            <Button
          variant="danger"
          onClick={() => {
            const r = dismissing;
            setDismissing(null);
            if (!r) return;
            dismissReturn(r.id);
            toast({ title: 'Retorno dispensado', description: 'Ele sai da fila. Você pode reabri-lo em Ver encerrados.', tone: 'info' });
          }}>
          
              Dispensar retorno
            </Button>
          </ModalActions>
      }>
      
        <p className="text-sm text-text-secondary">O cliente não será chamado para este retorno. Nenhum agendamento é apagado.</p>
      </AppModal>

      <NovoAgendamentoModal
      open={!!scheduling}
      mode="novo"
      defaults={defaults}
      onClose={() => setScheduling(null)}
      onSaved={(data) => {
        const res = tryAddAppointment(data);
        if (res.ok && scheduling) {
          markScheduled(scheduling.id, data.date, res.appt.id);
          toast({ title: 'Retorno agendado', description: 'O agendamento já está na Agenda.' });
        }
        return res;
      }} />
    
    </>;


  return { request, confirmDismiss: setDismissing, dialogs };
}