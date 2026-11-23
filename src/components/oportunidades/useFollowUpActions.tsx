import { wordsNow } from '../../data/segment';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Modal } from '../Card';
import { Textarea } from '../Textarea';
import { FecharAtendimentoModal } from '../modals/FecharAtendimentoModal';
import { setAppointmentStatus } from '../../data/agendaLive';
import { TODAY_ISO } from '../../data/agendaStore';
import { clientById } from '../../data/api/clientes';
import { serviceByLabel } from '../../data/catalogo';
import { requestBooking } from '../../data/bookingRequest';
import { MIN_REASON } from '../../data/legado';
import { contactBlockOf, STOP_CHOICE_DESCRIPTION } from '../../data/contactPreferences';
import { ensureConversation, sendTeamMessage } from '../../data/conversasThreads';
import { approveMessages, closeCase, firstName, markAnswered, markCalled, messageText, proName, retryCase, shortDate } from '../../data/followUp';
import { useSavedAutomationMode } from '../../data/automationMode';
import { savedSendWindows } from '../../data/automacoes';
import type { AutomationMode } from '../../data/automacoes';
import { hourText, hoursText } from '../../data/sendWindows';
import type { FollowUpCase } from '../../data/followUp';

export const RETRY_OPTIONS = [7, 15, 30] as const;

/**
 * L9 (16/11/2026, etapa de facilidade de uso, prova às cegas tarefa 7): “Encerrar” fecha SÓ este acompanhamento
 * (`closeCase` grava o fechamento deste caso). Lembretes de horário e os outros acompanhamentos do cliente continuam.
 * A mesma frase no menu “Decidir”, no “⋯” e no rodapé do painel do cliente. Textos curtos para o menu “Decidir” caber
 * acima do botão a 1512 × 805.
 */
export const END_MENU_TEXT = 'Só este acompanhamento; lembretes e outras mensagens continuam';
export const END_HINT_TEXT = 'fecha só este acompanhamento, que vai para Resolvidos com o motivo; lembretes e outras mensagens continuam.';
/** L9: a entrada que leva ao registro de verdade (o mesmo da Ficha). L24e: a descrição é a do dicionário ("Escolha o que parar."). */
export const OPT_OUT_MENU_TEXT = STOP_CHOICE_DESCRIPTION;
export const OPT_OUT_HINT_TEXT = 'abre a ficha para escolher o que parar.';

/**
 * W4 (11/11/2026, A2-03): o que “Tentar de novo” faz, pelo modo de envio salvo. O menu “Decidir” e o aviso depois da
 * escolha usam estas frases (antes diziam sempre que a Orniplaty manda, mesmo com os envios pausados).
 */
export const retryMenuText = (mode: AutomationMode) =>
mode === 'pausado' ? 'A mensagem fica pronta para você enviar nesse dia' : mode === 'supervisionado' ? 'A mensagem espera a sua aprovação nesse dia' : 'A Orniplaty manda uma nova mensagem nesse dia';
export const retryToastText = (mode: AutomationMode, d: string) =>
mode === 'pausado' ?
`Volta para “Programados”. Em ${d}, a mensagem fica pronta para você enviar (os envios estão pausados).` :
mode === 'supervisionado' ?
`Volta para “Programados”. Em ${d}, a mensagem espera a sua aprovação antes de sair.` :
`Volta para “Programados”. A Orniplaty manda a mensagem em ${d}, ${hoursText(savedSendWindows().campaigns)}.`;

/**
 * Ações de Oportunidades (Lote A, 20/10/2026; ajustes de 21/10/2026). Toda ação que tira alguém de "Precisa de você"
 * sem confirmação mostra Toast com "Desfazer" (regra v3.2). Envio sempre simulado; o aviso de simulação fica só no
 * seletor de telas (Lote C).
 *
 * 21/10/2026:
 * - "Responder na conversa" e "Ver conversa" abrem a conversa NO painel do cliente (`openConversation`), não levam
 *   mais para a tela Conversas. "Abrir em Conversas" (`openInConversas`) continua para quem quer a tela inteira.
 * - "Parar" pede confirmação (Modal sm danger) e depois mostra Toast com Desfazer. W4 (11/11/2026, remoção aprovada):
 *   "Parar" saiu das telas (fica um botão só, "Encerrar"); `stop` continua exportado por compatibilidade.
 * - Responder um caso "a assistente pediu ajuda" tira o caso de "Precisa de você" (decisão do Christian).
 *
 * L9 (16/11/2026): `optOut` leva à Ficha com a MESMA escolha de “Cliente pediu para parar”
 * (`?registrar=saida`; a escolha mora na Ficha e não se abre daqui sem copiar a lógica). `canOptOut`:
 * só para quem tem ficha e ainda não parou os avisos de retorno (regra de antes, sem mudança).
 * L24e (19/11/2026): descrição do menu = `STOP_CHOICE_DESCRIPTION` ("Escolha o que parar.").
 */
export function useFollowUpActions(opts: {openConversation?: (c: FollowUpCase) => void;} = {}) {
  const toast = useToast();
  const navigate = useNavigate();
  const mode = useSavedAutomationMode();
  const [closing, setClosing] = useState<FollowUpCase | null>(null);
  const [stopping, setStopping] = useState<FollowUpCase | null>(null);
  // F-025: "Encerrar" pede o motivo (mínimo de 5 caracteres, mesmo padrão das correções).
  const [ending, setEnding] = useState<FollowUpCase | null>(null);
  const [endReason, setEndReason] = useState('');
  const [endTried, setEndTried] = useState(false);

  const undoable = (title: string, description: string, undo: () => void, back: string) =>
  toast({
    title,
    description,
    tone: 'info',
    action: {
      label: 'Desfazer',
      onClick: () => {
        undo();
        toast({ title: 'Pronto, desfeito', description: back, tone: 'info' });
      }
    }
  });

  const callMe = (c: FollowUpCase) => {
    const undo = closeCase(c, `você vai ligar (${shortDate(TODAY_ISO)})`);
    undoable(`${c.clientName}: você vai ligar`, 'Saiu de "Precisa de você" e fica em Resolvidos.', undo, `${c.clientName} voltou para "Precisa de você".`);
  };
  const retry = (c: FollowUpCase, days: number) => {
    const { undo, iso } = retryCase(c, days);
    undoable(`Nova tentativa para ${firstName(c.clientName)} em ${shortDate(iso)}`, retryToastText(mode, shortDate(iso)), undo, `${c.clientName} voltou para "Precisa de você".`);
  };
  /** "Encerrar" abre o pedido de motivo; quem encerra de verdade é `confirmEnd`. */
  const finish = (c: FollowUpCase) => {
    setEndReason('');
    setEndTried(false);
    setEnding(c);
  };
  const confirmEnd = () => {
    const c = ending;
    setEndTried(true);
    if (!c || endReason.trim().length < MIN_REASON) return;
    setEnding(null);
    const undo = closeCase(c, `encerrado ${wordsNow().by}: ${endReason.trim()}`);
    undoable(`${c.clientName}: acompanhamento encerrado`, 'Está em Resolvidos, com o motivo. A Orniplaty não manda mais mensagens sobre isto.', undo, `${c.clientName} voltou para onde estava.`);
  };
  /** L9: pode abrir “Cliente pediu para parar”? Só com ficha e com os avisos de retorno ainda chegando (regra de antes). */
  const canOptOut = (c: FollowUpCase) => !!clientById(c.clientId) && !contactBlockOf(c.clientId);
  /** L9: Ficha do cliente com a escolha “Cliente pediu para parar” aberta (a mesma do cartão “Preferência de contato”). */
  const optOut = (c: FollowUpCase) => navigate(`/clientes/${encodeURIComponent(c.clientId)}?registrar=saida`);
  /**
   * F-025: "Agendar" abre o Novo agendamento da Agenda (mesma regra única), já preenchido. O horário criado fica LIGADO ao
   * caso: o caso vira "Agendou" e, depois de atendido e pago, "Voltou" com o valor pago.
   */
  const schedule = (c: FollowUpCase) =>
  requestBooking({ client: c.clientName, service: serviceByLabel(c.service)?.value ?? '', professional: c.professionalId || undefined, followUpCaseId: c.id });
  /** "Parar" só pede a confirmação; quem para de verdade é `confirmStop`. */
  const stop = (c: FollowUpCase) => setStopping(c);
  const confirmStop = () => {
    const c = stopping;
    setStopping(null);
    if (!c) return;
    const undo = closeCase(c, `parado ${wordsNow().by}`);
    undoable(`Acompanhamento de ${firstName(c.clientName)} parado`, 'Está em Resolvidos como Encerrado. Nenhuma mensagem programada sai.', undo, `${c.clientName} voltou para onde estava.`);
  };
  const approve = (list: FollowUpCase[]) => {
    if (list.length === 0) return;
    const undo = approveMessages(list);
    undoable(
      list.length === 1 ? `Mensagem de ${firstName(list[0].clientName)} aprovada` : `${list.length} mensagens aprovadas`,
      // W4 (A2-13): mesma frase do cartão (mensagem atrasada sai hoje).
      list.every((c) => !!c.next && c.next.plannedIso <= TODAY_ISO) ?
      `Sai hoje, até as ${hourText(savedSendWindows().campaigns.end)}.` :
      list.some((c) => !!c.next && c.next.plannedIso <= TODAY_ISO) ?
      `As atrasadas saem hoje, até as ${hourText(savedSendWindows().campaigns.end)}; as outras no dia programado, ${hoursText(savedSendWindows().campaigns)}.` :
      `Sai no dia programado, ${hoursText(savedSendWindows().campaigns)}.`,
      undo,
      list.length === 1 ? `${list[0].clientName} voltou para "Precisa de você".` : 'Voltaram para "Precisa de você".'
    );
  };
  const called = (c: FollowUpCase) => {
    const undo = markCalled(c);
    undoable(`${c.clientName} marcado como chamado`, 'Nada foi enviado pelo sistema. O caso foi para "Programados", aguardando a resposta; a próxima mensagem automática não fica prevista.', undo, `${c.clientName} voltou para "Precisa de você".`);
  };
  const copy = async (c: FollowUpCase) => {
    const text = c.next ? messageText(c, c.next) : '';
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Mensagem copiada', description: `Cole no WhatsApp ${wordsNow().of} para enviar.`, tone: 'success' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'Abra o cliente e copie o texto da mensagem à mão.', tone: 'warning' });
    }
  };
  /** Abre a conversa no painel do cliente (duas colunas no computador; aba "Conversa" no celular). */
  const conversation = (c: FollowUpCase) => {
    if (opts.openConversation) opts.openConversation(c);else
    openInConversas(c);
  };
  /** Tela inteira de Conversas (link discreto "Abrir em Conversas"). */
  const openInConversas = (c: FollowUpCase) => {
    ensureConversation(c.clientId, c.clientName);
    navigate(`/conversas?cliente=${encodeURIComponent(c.clientId)}`);
  };
  /**
   * Resposta enviada pelo painel do cliente (simulada): vai para o histórico e para a tela Conversas.
   * W4 (A2-05): o caso sai de “Precisa de você” pela própria resposta na conversa (mesma regra de Conversas). Sem
   * “Desfazer”: a mensagem já está na conversa. Com o WhatsApp parado, nada sai e o caso não muda.
   */
  const reply = (c: FollowUpCase, text: string) => {
    const r = sendTeamMessage(c.clientId, c.clientName, text);
    if (!r.ok) {
      toast({ title: 'Mensagem não enviada', description: r.reason === 'whatsapp' ? 'O WhatsApp não está funcionando. Nenhuma mensagem sai daqui até reconectar.' : 'Passaram 24 horas sem mensagem do cliente. Por aqui, só sai mensagem aprovada.', tone: 'error' });
      return;
    }
    if (c.situation === 'precisa' && c.need?.kind === 'ia-ajuda') {
      markAnswered(c);
      toast({ title: `Resposta enviada para ${firstName(c.clientName)}`, description: 'Saiu de “Precisa de você” e está em “Programados”. A conversa fica com a sua equipe até você devolver.', tone: 'info' });
    }
  };
  /** W4 (A2-11): mensagem não entregue → abre o cadastro do cliente na ficha, já em edição, para corrigir o telefone. */
  const fixPhone = (c: FollowUpCase) => navigate(clientById(c.clientId) ? `/clientes/${c.clientId}?editar=cadastro` : '/clientes');
  // Ficha só para quem tem cadastro (data/api/clientes.ts); contatos que só pediram preço vão para a lista.
  const record = (c: FollowUpCase) => navigate(clientById(c.clientId) ? `/clientes/${c.clientId}` : '/clientes');

  const modals =
  <>
      {/* G1 (F-001, v6): o fechamento casa com a agenda pelo nome registrado no agendamento. */}
      <FecharAtendimentoModal
      open={!!closing}
      appointment={
      closing?.appt ?
      { clientName: closing.recordedName ?? closing.clientName, service: closing.service, when: `${shortDate(closing.appt.iso)}, ${closing.appt.start}`, professional: proName(closing.professionalId), iso: closing.appt.iso, time: closing.appt.start, id: closing.appt.id } :
      null
      }
      onClose={() => setClosing(null)}
      onClosed={(attended) => {
        if (closing?.appt) setAppointmentStatus(closing.appt.iso, closing.appt.id, attended ? 'completed' : 'no_show');
      }} />
    
      <Modal
      open={!!ending}
      onClose={() => setEnding(null)}
      size="sm"
      title={ending ? `Encerrar o acompanhamento de ${ending.clientName}?` : ''}
      description={
      ending ?
      `${firstName(ending.clientName)} vai para Resolvidos como Encerrado, com o motivo. As mensagens programadas deste acompanhamento não saem; lembretes e outras mensagens continuam. As já enviadas continuam no histórico.` :
      undefined
      }
      footer={
      <>
            <Button variant="secondary" onClick={() => setEnding(null)}>
              Manter
            </Button>
            <Button onClick={confirmEnd}>Encerrar</Button>
          </>
      }>
      
        <Textarea
        label="Motivo"
        required
        rows={2}
        placeholder="Ex.: Agendou por telefone com a recepção."
        value={endReason}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEndReason(e.target.value)}
        error={endTried && endReason.trim().length < MIN_REASON ? `Explique o motivo (mínimo ${MIN_REASON} caracteres).` : undefined} />
      
      </Modal>
      <Modal
      open={!!stopping}
      onClose={() => setStopping(null)}
      size="sm"
      tone="danger"
      title={stopping ? `Parar o acompanhamento de ${stopping.clientName}?` : ''}
      description={
      stopping ?
      `As mensagens programadas não saem. ${firstName(stopping.clientName)} vai para Resolvidos como Encerrado. Dá para retomar com o Desfazer, logo depois.` :
      undefined
      }
      footer={
      <>
            <Button variant="secondary" onClick={() => setStopping(null)}>
              Manter
            </Button>
            <Button variant="danger" onClick={confirmStop}>
              Sim, parar
            </Button>
          </>
      } />
    
    </>;


  return {
    fixPhone,
    callMe,
    retry,
    finish,
    canOptOut,
    optOut,
    schedule,
    stop,
    approve,
    called,
    copy,
    conversation,
    openInConversas,
    reply,
    record,
    closeAppointment: (c: FollowUpCase) => setClosing(c),
    modals
  };
}

export type FollowUpActions = ReturnType<typeof useFollowUpActions>;