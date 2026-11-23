import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarIcon, ClockIcon, MessageCircleIcon, UserIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Input } from '../Input';
import { Checkbox } from '../Checkbox';
import { Textarea } from '../Textarea';
import { PillGroup } from '../Pill';
import { DateField } from '../ui/DateField';
import { ModalActions } from '../ui/ModalActions';
import { AppointmentStatusChip } from '../ui/StatusChip';
import { StatusPill } from '../ui/StatusPill';
import { NoticeInline } from '../ui/Notice';
import { Alert, InfoTip, ReminderStatusRow, labelValueIconClass, labelValueItemClass } from '../Card';
import type { AppointmentStatus } from '../AppointmentItem';
import { NovoAgendamentoModal } from './NovoAgendamentoModal';
import { AppointmentPayment } from './AppointmentPayment';
import { useOpenConversation } from '../conversas/useOpenConversation';
import type { AgendamentoSalvo } from './NovoAgendamentoModal';
import { FecharAtendimentoModal } from './FecharAtendimentoModal';
import { professionalByLabel, serviceByLabel } from '../../data/catalogo';
import { actor, discardInvalidThirdParty, isPendingClosure, setThirdParty, thirdPartyDraftOf, thirdPartyLabel, thirdPartyOf, useLegado } from '../../data/legado';
import { cancelAppointment, conflictReasonOf, tryAddAppointment, useAgendaData } from '../../data/agendaLive';
import { TODAY_ISO, isPastNow, mediumDayLabel, nowStamp } from '../../data/agendaStore';
import type { CancelledBy } from '../../data/agendaStore';
import { agendaProfessionalOf, scheduleConflicts, useTeam } from '../../data/availability';
import { clientIdOfRecordedName, isDeletedRecordedName } from '../../data/api/clientes';
import { getPackage, usablePackagesFor, useBackendVersion } from '../../data/api/pacotes';
import { addDeposit, brl, clientMethodOptions, depositsOfAppointment, methodWithInstallments, moneyInput, parseMoney, useDeposits } from '../../data/convenios';
import { empresaStore } from '../../data/empresa';
import { useSavedStore } from '../../data/iaConfigStore';
import { effectivePayment } from '../../data/paymentRules';
import { serviceByName } from '../../data/servicesStore';
import { shortDate } from '../../data/catalogo';
import { markConfirmedByTeam, reminderOf, reminderRow, useRemindersVersion } from '../../data/reminders';
import { changeAutomationOn, changeText, useConflictCases } from '../../data/conflictCases';
import { proNotice, reminderNotice, toldText } from '../../data/appointmentNotices';
import { autoBookingOf, autoBookingTexts, canUndoAutoBooking, undoAutoBooking, useAutoBookings } from '../../data/waitlistAutoBooking';

export type AppointmentDetails = {
  /** id of the appointment in the agenda (when it comes from the agenda) */
  id?: string;
  time: string;
  /** Day label shown in the dialog, e.g. "Quinta, 01/10" */
  dayLabel: string;
  /** ISO date used to prefill the reschedule form */
  isoDate: string;
  clientName: string;
  service: string;
  professional?: string;
  professionalColor?: string;
  status: AppointmentStatus;
  fromWaitlist?: boolean;
};

type AppointmentDetailsModalProps = {
  appointment: AppointmentDetails | null;
  onClose: () => void;
  /** Called after the appointment is cancelled or closed, so the page can update its list */
  onStatusChange?: (status: AppointmentStatus) => void;
  /** Called when the appointment is moved to another day/time. Return { ok:false } to keep the form open. */
  onRescheduled?: (data: AgendamentoSalvo) => {ok: boolean;message?: string;} | void;
};

const WHO_CANCELLED = [
{ value: 'client', label: 'O cliente' },
{ value: 'clinic', label: 'A clínica' }];


/**
 * Details of one appointment with its actions: remarcar, cancelar, ver conversa, fechar.
 * T1 1l (05/11, Christian): dentro de Conversas, "Ver conversa" NÃO aparece (levaria para a conversa que já está aberta).
 * Nas outras telas (Agenda, Clientes, Início…) continua igual. Sem ele, "Fechar atendimento" ocupa a linha inteira.
 * Rodada 8 (12/11/2026, Christian): bloco "Pagamento" (valor, forma, situação e data), lido do fechamento ou do
 * lançamento avulso (`AppointmentPayment`). Aparece em todo lugar que abre este detalhe.
 * W3 (11/11/2026, Christian):
 *  - A1-05: horário em conflito (ausência, bloqueio, feriado) mostra o aviso aqui também; caso "Falta avisar" idem.
 *  - A1-07/G3: o cancelamento pergunta QUEM cancelou (cliente ou clínica) e diz se o horário fica livre ou não.
 *  - A1-11: uma linha diz quem recebe aviso (profissional) e quando sai o lembrete automático do cliente.
 *  - A1-15: histórico "Remarcado de … para …".
 *  - A1-17: para horário FUTURO, o botão principal é "Remarcar" ("Fechar atendimento" vira secundário).
 *  - Combinado 3 entre faixas: "A confirmar" no lugar de "Aguardando confirmação".
 * I3 (11/11/2026):
 *  - G12: a linha do lembrete automático recebe o nome do cliente e respeita o pedido de saída (`reminderNotice`).
 *  - G14: com UM pacote válido, o texto diz que ele já vem escolhido em “Fechar atendimento” (não manda escolher).
 *    Com mais de um, continua pedindo a escolha.
 * I4 (12/11/2026, Christian, decisão I1-3): horário que a ASSISTENTE marcou sozinha (cliente aceitou a vaga da lista de
 * espera com a automação ligada) mostra o aviso "Marcado pela assistente" com o botão "Desfazer", no lugar do aviso
 * "marcado para uma pessoa da lista de espera". Regra e textos em data/waitlistAutoBooking.ts.
 * L3 (16/11/2026, etapa de facilidade de uso, só visual):
 *  - O botão cheio é o próximo passo: horário em conflito → "Remarcar" (também quando já começou); passado sem fechamento →
 *    "Fechar atendimento"; futuro sem pendência → "Remarcar". "Cancelar agendamento" usa o gatilho destrutivo (`dangerSoft`);
 *    o vermelho forte (`danger`) fica só na confirmação.
 *  - Cada aviso: título + uma frase; o resto foi para o "i" (`InfoTip`). Os avisos do que fazer agora vêm primeiro (conflito,
 *    falta avisar, sem fechamento, confirmação), depois os informativos.
 *  - Toast do cancelamento com botão para o próximo passo: "Ver lista de espera" (cliente cancelou, horário futuro ficou livre
 *    e há gente na fila) ou "Ver quem falta avisar" (clínica cancelou e a mensagem automática está desligada). Só navegação.
 *    "Completar" (WhatsApp do profissional) continua no toast quando nenhum dos dois vale; o mesmo botão já existe nesta
 *    janela, em "Quem é avisado".
 *  - Confirmação do cancelamento em janela `md` (o botão "Cancelar agendamento" era cortado na `sm`).
 * L5 (16/11/2026, só visual): uma frase antes da ação também nos blocos "Sinal" e "Atendimento para terceiro" e na
 * confirmação "Cancelar este agendamento?" (com "A clínica", eram quatro frases e um caminho em texto). O resto foi para o
 * "i"; nenhum texto saiu da tela.
 * L12 (17/11/2026, só visual):
 *  - O aviso "Esse horário não pode ser usado" aparece em TODO caso que está em "Falta resolver", inclusive quando o
 *    serviço mudou de duração: o motivo é o mesmo texto da linha de Notificações da agenda (`scheduleConflicts`). Só o
 *    aviso: os botões, o cancelamento e o resto da janela continuam lendo `conflictReasonOf`, como antes.
 *  - "Atendimento para terceiro": o erro "Informe o nome do terceiro…" só aparece depois que a pessoa sai do campo vazio
 *    (antes aparecia assim que a caixa era marcada).
 * L24g (19/11/2026, só layout): o rodapé deixou a grade de 2 colunas com botões esticados e usa o `ModalActions` (DS 6.2):
 *    "Cancelar agendamento" à esquerda (`start`), e à direita "Ver conversa" → secundário → principal por último. Os botões
 *    têm a largura deles e só descem para outra linha quando não cabem. Mesmas ações, mesmas condições.
 * RV3 (20/11/2026, Christian, DS 6.4 › "Mais ações" do `ModalActions`): "Cancelar agendamento" saiu da borda esquerda
 *    (`start`) e vai no menu "Mais ações" (`more`), sempre por último, em vermelho (`danger`); escolher abre a mesma
 *    confirmação "Cancelar este agendamento?". "Ver conversa" vai para o menu só na situação cheia (em aberto, sem pendência
 *    de fechamento, com "Fechar atendimento" e "Remarcar" à vista): primeiro item, depois um separador. Nas outras
 *    situações continua botão. Fechado, cancelado e "faltou": sem menu. Mesmas ações, mesmas condições, mesmos textos.
 * RV4 (20/11/2026, Christian): "Ver conversa" vai para o menu em TODO estado em aberto em que existe (não só na situação
 *    cheia): condição `!finished && showConversation`. Motivo: em "passou sem fechar" os três controles não cabiam por
 *    16 px no computador e "Fechar atendimento" descia sozinho com a largura toda. Em aberto o menu tem sempre "Ver
 *    conversa" · separador · "Cancelar agendamento"; dentro de Conversas ou cliente excluído, só "Cancelar agendamento".
 *    O item do menu não tem ícone (igual ao menu de Oportunidades). O botão visível "Ver conversa" (fechado e "faltou")
 *    continua com o ícone, sem mudança.
 * RV13 (20/11/2026): os 4 itens do topo (Dia, Horário, Profissional, Status) usam a receita de rótulo e valor do DS 6.5
 *    (`labelValueItemClass`/`labelValueIconClass`): o Status, que não tem ícone, começa alinhado com os outros rótulos.
 *    Os itens de largura total abaixo continuam na borda.
 */
export function AppointmentDetailsModal({ appointment, onClose, onStatusChange, onRescheduled }: AppointmentDetailsModalProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const openConversation = useOpenConversation();
  const inConversas = useLocation().pathname.startsWith('/conversas');
  useLegado();
  useRemindersVersion();
  useTeam();
  useAutoBookings();
  const cases = useConflictCases();
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBy, setCancelBy] = useState<string>('');
  const [cancelTried, setCancelTried] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositValue, setDepositValue] = useState('');
  const [depositMethod, setDepositMethod] = useState('pix');
  const [depositDate, setDepositDate] = useState(TODAY_ISO);
  const [depositTried, setDepositTried] = useState(false);
  /** L12: o campo do nome do terceiro já foi deixado (só então o erro de nome vazio aparece). */
  const [thirdLeft, setThirdLeft] = useState(false);
  const a = appointment;
  // G3: o registro VIVO do agendamento (observações, pacote vinculado, motivo do cancelamento, status atual).
  const { appointments, blocks, waitlist } = useAgendaData();
  useBackendVersion();
  useDeposits();
  const empresa = useSavedStore(empresaStore);
  const live = a?.id ? (appointments[a.isoDate] ?? []).find((x) => x.id === a.id) : undefined;
  const status: AppointmentStatus = live?.status ?? a?.status ?? 'confirmed';
  const linkedPackage = (() => {
    if (!live?.packageSaleId) return null;
    try {
      return getPackage(live.packageSaleId);
    } catch {
      return null;
    }
  })();
  const deposits = a?.id ? depositsOfAppointment(a.id) : [];
  const svcItem = a ? serviceByName(a.service) : undefined;
  const depositRule = svcItem ? effectivePayment(svcItem, empresa).deposit : null;
  const asksDeposit = !!depositRule && depositRule.deposit === 'sim';
  const methodOpts = clientMethodOptions(empresa.payments.length ? empresa.payments : ['pix', 'credito', 'debito', 'dinheiro']);
  useEffect(() => {
    setCancelReason('');
    setCancelBy('');
    setCancelTried(false);
    setDepositOpen(false);
    setDepositTried(false);
    setThirdLeft(false);
    setDepositDate(TODAY_ISO);
    setDepositMethod(methodOpts[0]?.value ?? 'pix');
    setDepositValue(depositRule && depositRule.deposit === 'sim' && depositRule.depositKind === 'fixo' && depositRule.depositValue ? moneyInput(parseMoney(depositRule.depositValue)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id]);
  const depositCents = parseMoney(depositValue);
  const depositErrors = {
    value: depositCents <= 0 ? 'Informe o valor recebido.' : undefined,
    date: !depositDate ? 'Informe a data do recebimento.' : depositDate > TODAY_ISO ? 'O recebimento não pode ser no futuro.' : undefined
  };
  const saveDeposit = () => {
    setDepositTried(true);
    if (!a?.id || depositErrors.value || depositErrors.date) return;
    addDeposit({ appointmentId: a.id, clientId: clientIdOfRecordedName(a.clientName), clientName: a.clientName, service: a.service, iso: depositDate, cents: depositCents, method: depositMethod, by: actor(), at: nowStamp() });
    toast({ title: 'Sinal registrado', description: `${brl(depositCents)} recebido em ${shortDate(depositDate)} via ${methodWithInstallments(depositMethod)}. Entra em Recebimentos nessa data e é descontado ao fechar.` });
    setDepositOpen(false);
    setDepositTried(false);
  };

  const finished = a ? status === 'completed' || status === 'cancelled' || status === 'no_show' : false;
  /** P4b: cliente excluído do cadastro não tem conversa nem pode virar "atendimento para terceiro" (o registro fica só para consulta). */
  const deletedClient = a ? isDeletedRecordedName(a.clientName) : false;
  /** T1 1l: "Ver conversa" some dentro de Conversas. */
  const showConversation = !deletedClient && !inConversas;
  const service = a ? serviceByLabel(a.service) : undefined;
  /** Terceiro válido (nome preenchido) — é o que aparece na agenda e no histórico. */
  const third = a?.id ? thirdPartyOf(a.id) : null;
  /** Rascunho do formulário: pode estar com o nome vazio (inválido) até o usuário preencher. */
  const draft = a?.id ? thirdPartyDraftOf(a.id) : null;
  const nameMissing = !!draft && !draft.name.trim();
  /** L12: o erro só aparece depois que a pessoa deixou o campo vazio (a regra do nome obrigatório não muda). */
  const showNameError = nameMissing && thirdLeft;
  const [, endMin] = [0, service ? service.minutes : 60];
  const pending = a ? isPendingClosure(a.isoDate, { status, end: addMinutes(a.time, endMin) }) : false;
  /** W3 (A1-17): horário que ainda não começou (relógio do protótipo). */
  const future = !!a && !isPastNow(a.isoDate, a.time);
  /** W3 (A1-05/G1): conflito AGORA e caso da lista de trabalho do dia. */
  const conflict = a && live ? conflictReasonOf(a.isoDate, live) : null;
  /**
   * L12: motivo do aviso "Esse horário não pode ser usado". Quando `conflictReasonOf` não tem motivo (ex.: o serviço passou
   * a durar mais), usa o motivo da linha de "Falta resolver" em Notificações da agenda (mesma fonte: `scheduleConflicts`).
   */
  const listReason = a?.id && live && !conflict && !finished ? scheduleConflicts({ appointments, blocks }).find((c) => c.appt.id === a.id)?.message ?? null : null;
  const noticeReason = conflict ?? listReason;
  /** L3: o botão cheio é o próximo passo. Conflito ou horário futuro → Remarcar; senão → Fechar atendimento. */
  const reschedulePrimary = !pending && (future || !!conflict && !finished);
  const caseNow = a?.id ? cases.find((c) => c.id === a.id) : undefined;
  const toNotify = caseNow?.state === 'avisar';
  /** W3 (A1-11): quem recebe aviso (profissional) e o lembrete do cliente. */
  const proId = live?.professionalId ?? (a?.professional ? professionalByLabel(a.professional)?.value : undefined);
  const proInfo = proId ? proNotice(proId) : null;
  /**
   * R3 (06/11/2026, Christian, A-14): horário que já passou sem fechamento não oferece Remarcar (feche como compareceu/faltou
   * em “Fechar atendimento”); Cancelar agendamento continua disponível, como antes. Depois de marcar falta, “Remarcar” volta e cria um horário NOVO: a falta
   * continua no histórico (mover o próprio registro apagaria a falta).
   */
  const rebook = !!a && status === 'no_show' && !deletedClient;
  /**
   * R3 (06/11/2026, Christian, A-14): antes do Remarcar depois da falta (que cria um horário NOVO), avisa se o cliente JÁ tem
   * outro agendamento futuro em aberto (não cancelado/concluído/falta; data/hora a partir de agora pelo relógio do protótipo).
   * Mesmo cliente = mesmo id do cadastro (`clientIdOfRecordedName`, cobre nome antigo); sem cadastro, o nome gravado igual.
   * Só informa: não bloqueia.
   */
  const clientKey = a ? clientIdOfRecordedName(a.clientName) : null;
  const sameClient = (name: string) => clientKey ? clientIdOfRecordedName(name) === clientKey : name === a?.clientName;
  const upcoming = rebook ?
  Object.entries(appointments).
  flatMap(([iso, list]) => list.filter((x) => x.id !== a!.id && x.status !== 'cancelled' && x.status !== 'completed' && x.status !== 'no_show' && !isPastNow(iso, x.start) && sameClient(x.clientName)).map((x) => ({ iso, x }))).
  sort((p, q) => (p.iso + p.x.start).localeCompare(q.iso + q.x.start)) :
  [];
  /**
   * R3 (06/11/2026, Christian, A-23): agendamento em aberto SEM pacote vinculado mostra o pacote que pode cobrir esta sessão
   * (mesma regra de `usablePackagesFor` que o Fechar atendimento usa: mesmo cliente e serviço, ativo, com saldo e validade
   * até a data). Só informa: nada é vinculado nem consumido aqui; a escolha continua no Fechar atendimento.
   * I3 (G14): com um pacote só, o Fechar atendimento já abre em “Usar sessão do pacote”; o texto não manda escolher.
   */
  const suggestedPackages = a && !finished && !linkedPackage && !deletedClient ? usablePackagesFor(clientIdOfRecordedName(a.clientName), service?.label ?? a.service, a.isoDate, a.id) : [];
  const sessoes = (n: number) => `${n} ${n === 1 ? 'sessão restante' : 'sessões restantes'}`;
  /**
   * §3.F: o LEMBRETE do agendamento (um por agendamento, sem reenvio) = `ReminderStatusRow` dentro do cartão, pela mesma
   * fonte de Conversas (`reminderRow`). Só para agendamento em aberto. "O cliente confirmou" continua pelo caminho de
   * status de sempre (`onStatusChange`) e, quando o cliente respondeu por mensagem, grava também no lembrete.
   */
  const rem = a && !finished ? reminderRow(reminderOf(a.isoDate, a.clientName, a.time), a.isoDate) : null;
  const confirmButton =
  a && status === 'pending_confirmation' && onStatusChange ?
  <Button
    size="sm"
    variant="secondary"
    onClick={() => {
      onStatusChange('confirmed');
      if (rem?.canConfirm) markConfirmedByTeam(a.isoDate, a.clientName, a.time);
      toast({ title: 'Agendamento confirmado', description: `${a.clientName} confirmou o horário (registro manual).` });
    }}>
    
        O cliente confirmou
      </Button> :
  undefined;

  /** Todo caminho de saída (X, Esc, botões, sub-modais) descarta rascunho sem nome: o contrato exige o nome. */
  const close = () => {
    discardInvalidThirdParty(a?.id);
    onClose();
  };

  const doCancel = () => {
    setCancelTried(true);
    if (!cancelBy) return;
    const by = cancelBy as CancelledBy;
    // G3 (F-046): cancela com motivo e histórico; o agendamento não é apagado. W3 (G3): grava quem cancelou.
    if (a?.id) cancelAppointment(a.isoDate, a.id, cancelReason, by);
    onStatusChange?.('cancelled');
    const told = proId && a ? toldText('cancelado', [proId], a.isoDate, a.time, a.clientName) : null;
    const slotLine = conflict ? 'O horário continua indisponível.' : 'O horário voltou a ficar livre na agenda.';
    const automationOn = changeAutomationOn();
    const notifyLine = by === 'clinic' ? automationOn ? 'A mensagem automática avisa o cliente.' : 'Falta avisar o cliente.' : '';
    // L3: botão para o próximo passo (só navegação; nada é oferecido nem enviado sozinho).
    const offerFreedSlot = by === 'client' && !conflict && future && waitlist.length > 0;
    const clientToNotify = by === 'clinic' && !automationOn;
    const action = offerFreedSlot ?
    { label: 'Ver lista de espera', onClick: () => navigate('/agenda?secao=lista-espera') } :
    clientToNotify ?
    { label: 'Ver quem falta avisar', onClick: () => navigate('/agenda?secao=notificacoes') } :
    told?.missingPro ?
    { label: 'Completar', onClick: () => navigate('/servicos-equipe?aba=equipe') } :
    undefined;
    toast({
      title: 'Agendamento cancelado',
      description: [slotLine, notifyLine, told?.text].filter(Boolean).join(' '),
      duration: 8000,
      ...(action ? { action } : {})
    });
    setCancelling(false);
    close();
  };

  /**
   * L5: confirmação do cancelamento = título + UMA frase (o que acontece com o horário e, com “A clínica”, quem avisa o
   * cliente). As frases que estavam na tela continuam inteiras no "i", na mesma ordem.
   */
  const cancelAutomationOn = changeAutomationOn();
  const cancelSlotPart = conflict ? 'O horário continua indisponível' : 'O horário volta a ficar livre na agenda';
  const cancelSentence =
  cancelBy === 'clinic' ? `${cancelSlotPart} e ${cancelAutomationOn ? 'o cliente recebe a mensagem automática' : 'quem avisa o cliente é a equipe'}.` : `${cancelSlotPart}.`;
  const cancelMore = [
  conflict ? `O agendamento é cancelado. O horário continua indisponível: ${conflict}` : 'O horário volta a ficar livre na agenda.',
  'O agendamento continua no histórico como cancelado.',
  cancelBy === 'clinic' ?
  cancelAutomationOn ?
  'A automação “Avisar mudança de horário” está ligada: o cliente recebe a mensagem sozinho.' :
  'Quem avisa o cliente é a equipe. Depois de cancelar, o caso fica em Notificações da agenda › Falta avisar, com a mensagem pronta.' :
  ''].

  filter(Boolean).
  join(' ');

  const historyLines = live?.history ?? [];

  /** I4: marcação feita pela assistente (lista de espera) e o Desfazer dela. */
  const auto = a?.id ? autoBookingOf(a.id) : undefined;
  const autoTexts = auto ? autoBookingTexts(auto) : null;
  const autoUndo = !!a?.id && canUndoAutoBooking(a.id);
  const doUndoAuto = () => {
    if (!a?.id || !autoTexts) return;
    if (!undoAutoBooking(a.id)) {
      toast({ tone: 'error', title: 'Não deu para desfazer', description: autoTexts.undoLocked });
      return;
    }
    toast({ title: autoTexts.undoneTitle, description: autoTexts.undoneText, duration: 8000 });
    close();
  };
  const autoMore = autoTexts ? autoUndo ? autoTexts.undoHelp : finished ? '' : autoTexts.undoLocked : '';

  /**
   * RV3/RV4: menu "Mais ações" do rodapé (só agendamento em aberto). RV4: em todo estado em aberto em que "Ver conversa"
   * existe, ela vai para o menu, como primeiro item (sem ícone), seguida de um separador.
   * "Cancelar agendamento" é sempre o último item, em vermelho, e abre a mesma confirmação de antes.
   */
  const conversationInMenu = !finished && showConversation;
  const showConversationButton = showConversation && !conversationInMenu;
  const goToConversation = () => {
    if (!a) return;
    const name = a.clientName;
    close();
    openConversation({ name });
  };
  const moreItems = !finished ?
  [
  ...(conversationInMenu ?
  [
  { id: 'ver-conversa', label: 'Ver conversa', onSelect: goToConversation },
  { id: 'separador', type: 'separator' as const }] :

  []),
  { id: 'cancelar-agendamento', label: 'Cancelar agendamento', variant: 'danger' as const, onSelect: () => setCancelling(true) }] :

  undefined;

  return (
    <>
      {/* Os campos de terceiro se aplicam na hora: sem aviso de "alterações não salvas" ao fechar */}
      <AppModal
        open={!!a && !rescheduling && !cancelling && !closing}
        onClose={close}
        unsavedGuard={false}
        title={a?.clientName ?? ''}
        description={a ? `${a.service}${service ? ` · ${service.minutes} min` : ''}` : undefined}
        footer={
        a && (!finished || showConversation || rebook) &&
        // RV3: rodapé padrão com o menu "Mais ações" (primeiro do grupo, vem do `ModalActions`); depois "Ver conversa" quando
        // está à vista → secundário → principal por último. "Cancelar agendamento" está no menu (último item, vermelho).
        <ModalActions more={moreItems} moreLabel={`Mais ações para ${a.clientName}`}>
              {rebook &&
          <Button variant="secondary" onClick={() => setRescheduling(true)}>
                  Remarcar
                </Button>
          }
              {showConversationButton &&
          <Button variant="secondary" leftIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={goToConversation}>
                  Ver conversa
                </Button>
          }
              {/* L3: um botão cheio por janela, e ele é o próximo passo (ver `reschedulePrimary`). */}
              {!finished && (
          reschedulePrimary ?
          <>
                    <Button variant="secondary" onClick={() => setClosing(true)}>
                      Fechar atendimento
                    </Button>
                    <Button variant="primary" onClick={() => setRescheduling(true)}>
                      Remarcar
                    </Button>
                  </> :

          <>
                    {/* R3 (06/11/2026, Christian, A-14): horário passado sem fechamento: Remarcar sai; Cancelar agendamento fica. */}
                    {!pending &&
            <Button variant="secondary" onClick={() => setRescheduling(true)}>
                        Remarcar
                      </Button>
            }
                    <Button variant="primary" onClick={() => setClosing(true)}>
                      Fechar atendimento
                    </Button>
                  </>)
          }
            </ModalActions>

        }>
        
        {a &&
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* RV13: receita de rótulo e valor do DS 6.5 nos 4 itens do topo; o Status (sem ícone) alinha com os outros. */}
            <div className={labelValueItemClass()}>
              <CalendarIcon className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true" />
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Dia</dt>
              <dd className="text-sm font-semibold text-text-primary">{a.dayLabel}</dd>
            </div>
            <div className={labelValueItemClass()}>
              <ClockIcon className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true" />
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Horário</dt>
              <dd className="text-sm font-semibold tabular-nums text-text-primary">{a.time}</dd>
            </div>
            <div className={labelValueItemClass()}>
              <UserIcon className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true" />
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Profissional</dt>
              <dd className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                {a.professionalColor && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.professionalColor }} aria-hidden="true" />}
                {a.professional ?? '—'}
              </dd>
            </div>
            <div className={labelValueItemClass()}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Status</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <AppointmentStatusChip status={status} />
                {pending && <StatusPill tone="warning" label="A fechar" />}
                {conflict && !finished && <StatusPill tone="error" label="Conflito" />}
                {third && <StatusPill tone="info" label={thirdPartyLabel(third)} />}
              </dd>
            </div>
            {/* L3: avisos do que fazer AGORA primeiro; cada um com título + uma frase, o resto no "i". */}
            {/* W3 (A1-05): mesmo aviso do Remarcar quando o horário não pode ser usado. L12: também com o motivo da lista. */}
            {noticeReason && !finished &&
          <NoticeInline tone="warning" title="Esse horário não pode ser usado" className="sm:col-span-2">
                {noticeReason} Nada foi cancelado nem movido.{' '}
                <InfoTip label="este aviso" content="Remarque ou cancele, e depois avise o cliente. O caso fica em Notificações da agenda." />
              </NoticeInline>
          }
            {/* W3 (G1): remarcado ou cancelado pela clínica e o cliente ainda não foi avisado. */}
            {toNotify && caseNow &&
          <NoticeInline tone="warning" title="Falta avisar o cliente" className="sm:col-span-2">
                {changeText(caseNow)}: {a.clientName} ainda não sabe da mudança.{' '}
                <InfoTip
              label="este aviso"
              content={`Em Notificações da agenda, use “Chamar no WhatsApp” e depois marque “Avisado”.${caseNow.attempts.length > 0 ? ` Tentativas sem resposta: ${caseNow.attempts.join(', ')}.` : ''}`} />
            
              </NoticeInline>
          }
            {pending &&
          <NoticeInline tone="warning" title="Atendimento sem fechamento" className="sm:col-span-2">
                O horário já passou e ninguém registrou comparecimento nem falta.{' '}
                <InfoTip label="este aviso" content="Use “Fechar atendimento” para concluir. Para remarcar, feche como “Faltou”: depois disso o Remarcar fica disponível." />
              </NoticeInline>
          }
            {rem &&
          <div className="flex flex-col gap-2 rounded-button border border-border px-3 py-2.5 sm:col-span-2">
                <ReminderStatusRow flush state={rem.state} text={rem.text} detail={rem.detail} action={confirmButton} />
              </div>
          }
            {!rem && confirmButton &&
          <div className="flex flex-col gap-2 rounded-button border border-border px-3 py-2.5 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-text-secondary">A confirmar: o cliente ainda não confirmou este horário.</p>
                {confirmButton}
              </div>
          }
            {/* R3 (06/11/2026, Christian, A-14): o cliente já tem horário futuro em aberto; o Remarcar continua disponível. */}
            {upcoming.length > 0 &&
          <NoticeInline tone="info" className="sm:col-span-2">
                {a.clientName} já tem horário marcado: {mediumDayLabel(upcoming[0].iso)} às {upcoming[0].x.start}
                {agendaProfessionalOf(upcoming[0].x.professionalId) ? `, com ${agendaProfessionalOf(upcoming[0].x.professionalId)!.name}` : ''}
                {upcoming.length > 1 ? ` (e mais ${upcoming.length - 1})` : ''}.{' '}
                <InfoTip label="este aviso" content="Remarcar cria outro horário; o que já existe continua." />
              </NoticeInline>
          }
            {/* I4: marcado pela assistente → aviso próprio, com o Desfazer (botão de aviso, 36px). Senão, o aviso de sempre. */}
            {autoTexts ?
          <Alert
            variant="info"
            compact
            role="note"
            className="sm:col-span-2"
            title={autoTexts.noticeTitle}
            actions={
            autoUndo ?
            <Button size="md" variant="secondary" onClick={doUndoAuto}>
                      Desfazer
                    </Button> :
            undefined
            }>
            
                {autoTexts.noticeText}
                {autoMore ?
            <>
                    {' '}
                    <InfoTip label="este aviso" content={autoMore} />
                  </> :
            null}
              </Alert> :

          (live?.fromWaitlist ?? a.fromWaitlist) &&
          <NoticeInline tone="info" className="sm:col-span-2">
                  Este horário foi marcado para uma pessoa da lista de espera.
                </NoticeInline>

          }
            {/* R3 (06/11/2026, Christian, A-23): pacote que pode cobrir este agendamento (sem vínculo, só aviso). I3 (G14): um pacote só já vem escolhido. */}
            {suggestedPackages.length > 0 &&
          <NoticeInline tone="info" className="sm:col-span-2">
                {suggestedPackages.length === 1 ?
            `Pode usar sessão do pacote ${suggestedPackages[0].service_name_snapshot} · ${sessoes(suggestedPackages[0].saldo)}.` :
            `Pode usar sessão de um dos ${suggestedPackages.length} pacotes de ${suggestedPackages[0].service_name_snapshot} (${suggestedPackages.map((p) => sessoes(p.saldo)).join(' e ')}).`}{' '}
                <InfoTip
              label="este aviso"
              content={
              suggestedPackages.length === 1 ?
              'Em “Fechar atendimento”, o pacote já vem escolhido: a sessão só é usada ao fechar o atendimento.' :
              'Para usar, escolha o pacote em “Fechar atendimento”: a sessão só é usada ao fechar o atendimento.'
              } />
            
              </NoticeInline>
          }
            {/* W3 (A1-11): quem recebe aviso e quando sai o lembrete automático do cliente. I3 (G12): respeita o pedido de saída. */}
            {!finished && future && (proInfo || !rem) &&
          <div className="flex flex-col gap-2 rounded-button border border-border px-3 py-2.5 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Quem é avisado</p>
                {proInfo && <p className="text-sm text-text-secondary">{proInfo.text}</p>}
                {!rem && <p className="text-sm text-text-secondary">{reminderNotice(a.isoDate, a.time, a.clientName)}</p>}
                {proInfo?.missing &&
            <div>
                    <Button size="sm" variant="neutral" onClick={() => {close();navigate('/servicos-equipe?aba=equipe');}}>
                      Completar o WhatsApp de {proInfo.name}
                    </Button>
                  </div>
            }
              </div>
          }
            {live?.note &&
          <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Observação do agendamento</dt>
                <dd className="mt-1 whitespace-pre-line text-sm text-text-primary">{live.note}</dd>
              </div>
          }
            {live?.closingNote &&
          <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Observação do fechamento</dt>
                <dd className="mt-1 whitespace-pre-line text-sm text-text-primary">{live.closingNote}</dd>
              </div>
          }
            {/* W3 (A1-15): histórico das remarcações. */}
            {historyLines.length > 0 &&
          <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Histórico</dt>
                <dd className="mt-1 flex flex-col gap-0.5 text-sm text-text-primary">
                  {historyLines.map((h, i) =>
              <span key={i}>{h.text}</span>
              )}
                </dd>
              </div>
          }
            {status === 'cancelled' && (live?.cancelReason || live?.cancelledAt || live?.cancelledBy) &&
          <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Cancelamento</dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {live?.cancelledBy === 'client' ? 'O cliente cancelou' : live?.cancelledBy === 'clinic' ? 'A clínica cancelou' : 'Cancelado'}
                  {live?.cancelReason ? ` · Motivo: ${live.cancelReason}` : ' · Sem motivo informado'}
                  {live?.cancelledAt ? ` · ${live.cancelledAt}` : ''}
                  {live?.cancelledByUser ? ` · registrado por ${live.cancelledByUser}` : ''}
                </dd>
              </div>
          }
            {linkedPackage &&
          <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Pacote</dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {status === 'completed' ? 'Sessão do pacote' : 'Vinculado ao pacote'} de {linkedPackage.service_name_snapshot} · {linkedPackage.saldo} {linkedPackage.saldo === 1 ? 'sessão restante' : 'sessões restantes'}
                  {status === 'completed' ? '' : '. A sessão só é usada ao fechar o atendimento.'}
                </dd>
              </div>
          }
            {/* Rodada 8 (12/11/2026, Christian): valor, forma de pagamento, situação e data do pagamento deste atendimento. */}
            <AppointmentPayment
            appointmentId={a.id}
            isoDate={a.isoDate}
            time={a.time}
            clientName={a.clientName}
            service={a.service}
            completed={status === 'completed'}
            packageShown={!!linkedPackage} />
          
            {a.id && (asksDeposit || deposits.length > 0) &&
          <div className="rounded-button border border-border px-3 py-2.5 sm:col-span-2">
                <p className="text-sm font-semibold text-text-primary">Sinal</p>
                {deposits.length > 0 ?
            <ul className="mt-1 text-sm text-text-secondary">
                    {deposits.map((d) =>
              <li key={d.id}>
                        Recebido em {shortDate(d.iso)} · {brl(d.cents)} · {methodWithInstallments(d.method)} · {d.by}
                      </li>
              )}
                  </ul> :

            // L5: uma frase; "pedir o sinal não é pagamento" foi para o "i".
            <p className="mt-1 text-sm text-text-secondary">
                    {a.service} pede sinal e nenhum sinal recebido foi registrado.{' '}
                    <InfoTip label="o sinal" content={`${a.service} pede sinal. Nenhum sinal recebido foi registrado: pedir o sinal não é pagamento.`} />
                  </p>
            }
                {!finished && !depositOpen &&
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setDepositOpen(true)}>
                    Registrar sinal recebido
                  </Button>
            }
                {!finished && depositOpen &&
            <div className="mt-3 flex flex-col gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input label="Valor recebido" prefix="R$" inputMode="decimal" value={depositValue} onChange={(e) => setDepositValue(e.target.value)} error={depositTried ? depositErrors.value : undefined} />
                      <DateField label="Recebido em" value={depositDate} onChange={setDepositDate} error={depositTried ? depositErrors.date : undefined} />
                    </div>
                    <PillGroup label="Forma" size="sm" options={methodOpts} value={depositMethod} onChange={(v) => typeof v === 'string' && setDepositMethod(v)} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={saveDeposit}>
                        Registrar sinal
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setDepositOpen(false)}>
                        Cancelar
                      </Button>
                    </div>
                    <p className="text-xs text-text-muted">
                      Aqui você registra o sinal que já recebeu.{' '}
                      <InfoTip label="o registro do sinal" content="Ele entra em Resultados › Recebimentos na data informada." />
                    </p>
                  </div>
            }
              </div>
          }
            {a.id && !(deletedClient && !draft) &&
          <div className="rounded-button border border-border px-3 py-2.5 sm:col-span-2">
                <Checkbox
              size="sm"
              label={<span className="font-semibold">Atendimento para terceiro</span>}
              checked={!!draft}
              disabled={finished && !draft}
              onChange={(checked) => {
                setThirdLeft(false);
                setThirdParty(a.id!, checked ? { name: '' } : null);
              }} />
            
                {draft ?
            <div className="mt-2">
                    <Input
                id="terceiro-nome"
                label="Nome do terceiro (obrigatório)"
                type="text"
                value={draft.name}
                maxLength={80}
                required
                aria-required="true"
                error={showNameError ? 'Informe o nome do terceiro. Sem nome, o atendimento não fica marcado como terceiro.' : undefined}
                aria-describedby={showNameError ? 'terceiro-nome-message terceiro-nome-ajuda' : 'terceiro-nome-ajuda'}
                onBlur={() => setThirdLeft(true)}
                onChange={(e) => setThirdParty(a.id!, { name: e.target.value })} />
              
                    {/* L5: uma frase; "Vale só para este atendimento" foi para o "i". */}
                    <p id="terceiro-nome-ajuda" className="mt-1 text-xs text-text-muted">
                      {a.clientName} continua sendo quem agendou e paga.{' '}
                      <InfoTip label="o atendimento para terceiro" content="Vale só para este atendimento." />
                    </p>
                  </div> :

            // L5: uma frase; o exemplo e "o nome do terceiro é obrigatório" foram para o "i".
            <p className="mt-1 text-xs text-text-muted">
                    Marque quando quem agenda não é quem será atendido.{' '}
                    <InfoTip label="o atendimento para terceiro" content="Ex.: mãe agendando para a filha. O nome do terceiro é obrigatório." />
                  </p>
            }
              </div>
          }
          </dl>
        }
      </AppModal>

      {/* R3 (06/11/2026, Christian, A-14): depois da falta, Remarcar cria um horário NOVO (a falta fica no histórico); antes, move o mesmo agendamento. */}
      <NovoAgendamentoModal
        open={rescheduling}
        mode={rebook ? 'novo' : 'remarcar'}
        ignoreAppointmentId={rebook ? undefined : a?.id}
        onSaved={rebook ? (data) => tryAddAppointment(data) : onRescheduled}
        onClose={() => {
          setRescheduling(false);
          close();
        }}
        defaults={
        a ?
        {
          client: a.clientName,
          service: service?.value,
          professional: a.professional ? professionalByLabel(a.professional)?.value : undefined,
          date: rebook ? TODAY_ISO : a.isoDate,
          time: rebook ? undefined : a.time,
          note: rebook ? undefined : live?.note
        } :
        undefined
        } />
      

      {/* L3: janela `md` (na `sm` o botão "Cancelar agendamento" era cortado nas duas pontas). Mesmos botões e textos. */}
      <AppModal
        open={cancelling}
        unsavedGuard={false}
        size="md"
        title="Cancelar este agendamento?"
        description={a ? `${a.clientName} · ${a.dayLabel} às ${a.time}` : undefined}
        onClose={() => {
          setCancelling(false);
          close();
        }}
        footer={
        <ModalActions equal={2}>
            <Button
            variant="secondary"
            onClick={() => {
              setCancelling(false);
              close();
            }}>
            
              Voltar
            </Button>
            <Button variant="danger" onClick={doCancel}>
              Cancelar agendamento
            </Button>
          </ModalActions>
        }>
        
        <div className="flex flex-col gap-3">
          {/* W3 (G3): quem cancelou é obrigatório e começa vazio. */}
          <PillGroup label="Quem cancelou?" size="sm" options={WHO_CANCELLED} value={cancelBy} onChange={(v) => typeof v === 'string' && setCancelBy(v)} />
          {cancelTried && !cancelBy &&
          <p role="alert" className="text-sm text-error">
              Escolha quem cancelou.
            </p>
          }
          {/* W3 (A1-07): dentro de ausência ou bloqueio o horário NÃO fica livre. L5: uma frase; o resto no "i". */}
          <p className="text-sm text-text-secondary">
            {cancelSentence} <InfoTip label="o cancelamento" content={cancelMore} />
          </p>
          <Textarea label="Motivo (opcional)" rows={2} value={cancelReason} maxLength={200} onChange={(e) => setCancelReason(e.target.value)} />
        </div>
      </AppModal>

      <FecharAtendimentoModal
        open={closing}
        appointment={a ? { clientName: a.clientName, service: a.service, when: `${a.dayLabel}, ${a.time}`, professional: a.professional, iso: a.isoDate, time: a.time, id: a.id } : null}
        onClose={() => {
          setClosing(false);
          close();
        }}
        onClosed={(attended) => onStatusChange?.(attended ? 'completed' : 'no_show')} />
      
    </>);

}

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}