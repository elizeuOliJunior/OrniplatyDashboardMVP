import { wordsNow } from '../../data/segment';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../Button';
import { Alert, Composer, ConversationHeader, InfoTip, MessageBubble, MessageDateDivider, MessageThread, useToast } from '../Card';
import type { StatusDotTone } from '../Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TemplatePicker } from './TemplatePicker';
import { QuickReplyForm } from './QuickReplyForm';
import { useBusinessName } from '../../data/empresa';
import { whatsappConnection } from '../../data/configuracoes';
import type { Conversation, ThreadMessage } from '../../data/conversas';
import { inQueue, lastFromClient, waitingOf } from '../../data/conversas';
import type { ConversationSummary } from '../../data/conversasThreads';
import { clearReadyMessage, holdRemainingMs, readyMessageOf, sendTeamMessage, sendTeamTemplate, useTick, whatsappDown } from '../../data/conversasThreads';
import { clockLabel, dayWord, leftLabel, reasonLine, replyWindow, windowBadge } from '../../data/replyWindow';
import type { WindowState } from '../../data/replyWindow';
import { TODAY_ISO, minutesLeftLabel } from '../../data/agendaStore';
import { useAccountSummary, useSettings, waKey } from '../../data/settingsStore';
import { useSavedAutomationMode } from '../../data/automationMode';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { isArchivedClient } from '../../data/archivedClients';
import { clientById } from '../../data/api/clientes';
import { MAX_QUICK_REPLIES, useQuickReplies } from '../../data/quickReplies';
import { useClientAgeLabel } from '../../data/clientAge';
import { KIND_ORDER, alwaysAnswersText, contactBlockOf, kindOf, kindStopped, listBadgeOf, stoppedLine, useContactBlocks } from '../../data/contactPreferences';
import { markSentByTeam } from '../../data/reminders';

type ConversationThreadProps = {
  conversation: Conversation;
  summary: ConversationSummary;
  messages: ThreadMessage[];
  onBack: () => void;
  /**
   * "Assumir conversa" ou "Devolver para a assistente" (já confirmado aqui). L6: pode devolver `{ answered }` (Conversas
   * devolve o resultado de `handBack`) para a linha "Devolvida para a assistente" usar o mesmo texto do aviso rápido.
   */
  onToggleHandler: () => void | {answered?: boolean;};
  onSend: (text: string) => void;
  /** T1 1l (05/11, Christian: "só Devolver"): IGNORADO. "Marcar como resolvida" saiu do Painel; fica só o tipo para não quebrar quem ainda passa. */
  onResolve?: () => void;
  /** T1 1i: abre/fecha a coluna da ficha resumida (botão de painel lateral no cabeçalho). */
  onOpenProfile?: () => void;
  /** T1 1i: a ficha está aberta (o botão fica pressionado e passa a fechar). */
  profileOpen?: boolean;
  /** Lote A: ações extras no cabeçalho (painel do cliente de Oportunidades). T1 1c: vão para a linha 2. */
  headerActions?: React.ReactNode;
  notice?: React.ReactNode;
  hideBack?: boolean;
  /**
   * I2 (item 17): quem abre a conversa ao lado já mostra a SUA mensagem pronta acima (oferta de vaga, mudança de horário).
   * Com isto ligado, a confirmação pronta do agendamento não aparece aqui: uma faixa por vez. Ela continua guardada e
   * aparece em Conversas.
   */
  hideReadyMessage?: boolean;
  /**
   * L24d (19/11/2026, decisão do Christian de 18/11, 23h51): conversa aberta pelo aviso de mudança de horário ("Falta
   * avisar" → "Chamar no WhatsApp", `ChangeThread`). Esse aviso NUNCA é bloqueado pela preferência de contato: a faixa de
   * baixo não diz que nada sai, e "Enviar mensagem aprovada" (com "Remarcar horário") fica disponível, como diz o aviso
   * de cima.
   */
  changeNotice?: boolean;
};

/** "Hoje" · "Ontem" · "29/09" */
const dayLabel = (iso: string) => {
  const w = dayWord(iso);
  return w === 'hoje' ? 'Hoje' : w === 'ontem' ? 'Ontem' : w === 'amanhã' ? 'Amanhã' : w;
};

/**
 * Quem atende, no cabeçalho, com o resumo que aparece ao passar o mouse (T1 1d, pedido do Christian: explicar cada aviso
 * de um jeito que um usuário novo entenda sem treinamento).
 */
function headerHandler(conv: Conversation, answering: boolean, stoppedLabel: string, backIn: string | null): {tone: StatusDotTone;label: string;hint: string;} {
  if (conv.resolved) return { tone: 'off', label: 'Resolvida', hint: 'Esta conversa foi encerrada e saiu da fila. Ninguém está respondendo agora; se o cliente escrever de novo, a assistente responde.' };
  if (inQueue(conv)) {
    const w = waitingOf(conv);
    return {
      tone: 'waiting',
      label: 'Aguardando você',
      hint: w?.aiOff ?
      // W4 (G5, A5-01): espera derivada (assistente desligada, parada ou sem resposta em 15 min).
      `${w.reason ?? ''} A conversa fica com a sua equipe até alguém responder.` :
      w?.kind === 'equipe' ?
      'A conversa está com você e o cliente mandou uma mensagem que ainda está sem resposta. A assistente não responde enquanto a conversa estiver com você.' :
      'A assistente pediu ajuda e parou de responder este cliente. O motivo está na faixa logo abaixo. Responda pela caixa de mensagem; quando terminar, devolva para a assistente.'
    };
  }
  // W4 (G7): com a equipe até “Devolver”; 2 h sem ação da equipe e ela volta para a assistente.
  if (conv.handler !== 'ia')
  return {
    tone: 'team',
    label: 'Você está atendendo',
    hint: `A conversa está com a sua equipe e a assistente não responde este cliente até você devolver. ${backIn ? `Se ninguém da equipe fizer nada, ela ${backIn}.` : 'Depois de 2 horas sem resposta da equipe, ela volta sozinha para a assistente.'}`
  };
  return answering ?
  { tone: 'assistant', label: 'Assistente atendendo', hint: 'A assistente está conversando com este cliente sozinha. Você não precisa fazer nada. Para responder você mesmo, use “Assumir conversa”.' } :
  { tone: 'off', label: stoppedLabel, hint: 'A assistente não está respondendo nenhum cliente agora, então esta conversa está com a sua equipe. Nada está esperando resposta aqui. O motivo e como resolver estão no aviso do topo da tela.' };
}

/** Resumo do selo da janela de 24 h (ao passar o mouse). */
function windowHint(win: WindowState) {
  if (win.band === 'fechada') return 'Passaram mais de 24 h desde a última mensagem do cliente. Por aqui, só saem mensagens aprovadas pela Meta (texto fixo com campos). A conversa reabre quando o cliente responder.';
  const base = `O WhatsApp deixa ${wordsNow().the} escrever livremente por 24 h depois da última mensagem do cliente. Faltam ${leftLabel(win.leftMin)} (até ${dayWord(win.closesAt.slice(0, 10))}, ${clockLabel(win.closesAt)}). Cada nova mensagem do cliente renova as 24 h.`;
  return win.band === 'fechando' ? `${base} Responda logo: depois disso, só mensagem aprovada.` : base;
}

/** W4 (A5-02): faixa fixa no lugar da caixa de escrever quando o WhatsApp da clínica não funciona. */
const WA_DOWN_TEXT = 'Nenhuma mensagem sai daqui até reconectar. Responda pelo celular ou conecte em Configurações › WhatsApp.';

type ConfirmKind = 'assumir' | 'devolver';

/** "i" dentro de uma faixa (mesmo uso da faixa da janela de 24 h). */
const BannerTip = ({ label, content }: {label: string;content: React.ReactNode;}) =>
<span className="ml-1 inline-flex align-middle">
    <InfoTip label={label} content={content} />
  </span>;


/**
 * T1 1c (04/11/2026): cabeçalho enxuto, janela com o tempo que falta, compositor de 1 linha, respostas rápidas com "+" e
 * seletor de MENSAGENS APROVADAS (O-13). Opt-out: com a janela fechada, nada sai por aqui até o cliente escrever.
 * T1 1d (05/11/2026, Christian): Assumir e Devolver pedem CONFIRMAÇÃO, e cada confirmação diz o que acontece.
 * T1 1i (05/11/2026, Christian): o menu "⋮" (Mais ações) SAIU. "Copiar número" e "Ligar" não voltam (decisão de 05/11, 1l).
 * T1 1l (05/11/2026, Christian: "só Devolver"): "Marcar como resolvida" SAIU. A equipe tem uma ação só para tirar a
 * conversa da fila: "Devolver para a assistente". O backend continua com `POST /conversations/{id}/resolve` (main de
 * 22/10); encerrar conversa vira tarefa do sistema (T2).
 * L6 (16/11/2026, etapa de facilidade de uso, só visual):
 * - Respostas rápidas recolhidas (L13: agora pelo próprio `Composer`, ver abaixo). Aberto, o `Composer` mostra a MESMA
 *   faixa de antes (mesmos itens, ×, "+").
 * - Assumir/Devolver em `secondary`: na conversa o único botão cheio é o "Enviar".
 * - Faixa do topo curta, sempre dizendo quem responde: "Você responde agora:" (aguardando a equipe; o motivo vai para o
 *   "i"), "Você está atendendo:" (com a equipe) e "Devolvida para a assistente:" (depois de devolver, com o texto do aviso
 *   rápido). Uma linha quando cabe; quebra em vez de cortar. Entra com movimento curto (180 ms) e respeita "reduzir
 *   movimento".
 * L13 (17/11/2026, DS 4.9, aprovado pelo Christian em 17/11): o botão flutuante "Respostas rápidas" (L6/L8) SAIU
 *   (substituição, não apagamento). No lugar, o próprio `Composer quickRepliesCollapsible`: botão redondo de raio na linha
 *   do campo, logo depois do botão de mensagens aprovadas. Mesmos itens, mesmo "+", mesmo limite. Fechado por padrão
 *   (`repliesOpen`, volta a fechar ao trocar de conversa); some com o campo travado, como antes. O marcador do fim perdeu a
 *   altura que o L8 tinha dado para o botão flutuante não cobrir a última mensagem.
 * L21 (17/11/2026, V5 T3/T9): o aviso "Mensagem aprovada enviada" oferece o próximo passo, "Devolver para a assistente"
 *   (botão do aviso, `actionBelow`). Ele abre a MESMA confirmação do botão do cabeçalho. Só aparece quando o envio deu
 *   certo e o "Devolver" existe (assistente atendendo). Quem fica com a conversa não mudou.
 * L24d (19/11/2026): as frases de "não receber" vêm do dicionário (`data/contactPreferences.ts`): os tipos parados
 *   (`stoppedLine`) + `alwaysAnswersText`; o selo do cabeçalho usa `listBadgeOf` (o mesmo de Clientes). A regra de quem
 *   fica sem mensagem aprovada não mudou ("Avisos de retorno" parados, `contactBlockOf`), exceto na conversa aberta pelo
 *   aviso de mudança de horário (`changeNotice`), que nunca é bloqueada (decisão de 18/11, 23h51).
 * L24h (19/11/2026, decisão 6.2 (b) do arquiteto sobre o L24d): com 2 ou mais tipos parados (ex.: Diego), a faixa de baixo
 *   mostra só o selo da lista (`listBadgeOf`) + `alwaysAnswersText`; as linhas de cada tipo (`stoppedLine`) vão para o "i"
 *   da própria faixa (o mesmo `InfoTip`), antes da regra das 24 horas. Com 1 tipo parado (ex.: Igor), nada muda. O selo do
 *   cabeçalho, o `changeNotice` e as regras não mudaram.
 */
export function ConversationThread({ conversation, summary, messages, onBack, onToggleHandler, onSend, onOpenProfile, profileOpen, headerActions, notice, hideBack = false, hideReadyMessage = false, changeNotice = false }: ConversationThreadProps) {
  const companyName = useBusinessName();
  const toast = useToast();
  const quick = useQuickReplies();
  const age = useClientAgeLabel(conversation.id);
  const reduceMotion = useReducedMotion();
  useContactBlocks();
  // L24d: o aviso de mudança de horário nunca é bloqueado pela preferência de contato.
  const optOut = changeNotice ? null : contactBlockOf(conversation.id);
  const stoppedLines = KIND_ORDER.filter((k) => kindStopped(conversation.id, k)).map((k) => stoppedLine(k, kindOf(conversation.id, k)));
  const stoppedText = stoppedLines.join('. ');
  const blockedText = `${stoppedText ? `${stoppedText}. ` : ''}${alwaysAnswersText()}`;
  // L24h: com 2 ou mais tipos parados, a faixa de baixo mostra o selo da lista + a frase de sempre; as linhas vão para o "i".
  const stripBadge = stoppedLines.length >= 2 ? listBadgeOf(conversation.id) : null;
  const stripLines = stripBadge ? stoppedLines : null;
  const stripText = stripBadge ? `${stripBadge}. ${alwaysAnswersText()}` : blockedText;
  const [draft, setDraft] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [returnedText, setReturnedText] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  useTick(15000);
  const account = useAccountSummary();
  const youHandle = conversation.handler !== 'ia';
  const settings = useSettings();
  const mode = useSavedAutomationMode();
  const navigate = useGuardedNavigate();
  // W4 (G7): “youHandle” = a conversa está com a equipe (a antiga “pausa” vale como equipe).
  const teamHolds = conversation.handler !== 'ia';
  const aiOff = account.assistant.key === 'desligada' || account.assistant.key === 'desligada-tudo';
  const answering = account.assistant.answering;
  // W4 (remoção aprovada em 11/11): “Devolver” fica escondido enquanto a assistente está desligada ou parada.
  const returnHidden = teamHolds && !answering;
  const queued = inQueue(conversation);
  const remaining = teamHolds && !conversation.waiting ? holdRemainingMs(conversation.id) : null;
  const backIn = remaining !== null ? `volta para a assistente em ${remaining >= 3600000 ? `${Math.floor(remaining / 3600000)} h ${Math.ceil(remaining % 3600000 / 60000)} min` : minutesLeftLabel(remaining)}` : null;
  // W4 (A5-02): WhatsApp da clínica sem funcionar → nada sai pelo painel.
  const waDown = whatsappDown();
  const waDownId = `whatsapp-parado-${conversation.id}`;
  const readyMsg = readyMessageOf(conversation.id);
  const win = replyWindow(conversation.lastInboundAt, conversation.windowClosed);
  const closed = win.band === 'fechada';
  const lockId = `janela-fechada-${conversation.id}`;
  const templatesButtonId = `modelos-${conversation.id}`;
  const phone = clientById(conversation.id)?.phone || summary.phone;
  const archived = isArchivedClient(conversation.id);

  useEffect(() => {
    setDraft('');
    setTemplatesOpen(false);
    setRepliesOpen(false);
    setReturnedText(null);
    setConfirm(null);
  }, [conversation.id]);
  // A conversa voltou para a equipe (assumiu de novo ou o cliente escreveu): a linha "Devolvida" sai.
  useEffect(() => {
    if (conversation.handler !== 'ia' || queued) setReturnedText(null);
  }, [conversation.handler, queued]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, conversation.id]);

  const closeTemplates = useCallback(() => setTemplatesOpen(false), []);

  const sendTemplate = (msg: {name: string;title: string;text: string;buttons?: string[];appointment?: {iso: string;clientName: string;start: string;};}) => {
    const res = sendTeamTemplate(conversation.id, summary.name, msg);
    // R3 (06/11/2026, Christian, A-39): lembrete de horário enviado à mão conta como o lembrete daquele agendamento.
    if (res.ok && msg.appointment) markSentByTeam(msg.appointment.iso, msg.appointment.clientName, msg.appointment.start);
    setTemplatesOpen(false);
    // L21: o próximo passo depois do envio é devolver; o botão abre a mesma confirmação do cabeçalho.
    const offerHandBack = res.ok && answering;
    toast({
      title: 'Mensagem aprovada enviada',
      description: closed ? `${msg.title} para ${summary.name}. A conversa reabre quando o cliente responder.` : `${msg.title} para ${summary.name}.`,
      ...(offerHandBack ? { action: { label: 'Devolver para a assistente', onClick: () => setConfirm('devolver') }, actionBelow: true } : {})
    });
  };

  const unansweredClient = lastFromClient(conversation.id);
  // L6: depois de devolver, a mesma frase do aviso rápido fica na faixa do topo.
  const handBackAndShow = () => {
    const r = onToggleHandler();
    const answered = r && typeof r === 'object' ? !!r.answered : !!unansweredClient && answering;
    setReturnedText(answered ? `Ela respondeu ${summary.name} agora.` : `Ela volta a responder ${summary.name} a partir da próxima mensagem.`);
  };
  const CONFIRM: Record<ConfirmKind, {title: string;description: string;confirmLabel: string;cancelLabel?: string;run: () => void;}> = {
    assumir: {
      title: `Assumir a conversa com ${summary.name}?`,
      description: 'A assistente para de responder este cliente e a conversa fica com você até você devolver. Depois de 2 horas sem resposta da equipe, ela volta sozinha para a assistente, a não ser que o cliente esteja esperando resposta.',
      confirmLabel: 'Assumir conversa',
      run: () => {
        onToggleHandler();
        setReturnedText(null);
      }
    },
    // W4 (G6): com mensagem do cliente sem resposta, a janela avisa e a assistente responde na hora.
    devolver: unansweredClient ?
    {
      title: 'Devolver para a assistente?',
      description: `A última mensagem de ${summary.name} ainda não foi respondida. Se você devolver agora, a assistente responde na hora. Se preferir responder você, volte e escreva antes de devolver.`,
      confirmLabel: 'Devolver agora',
      cancelLabel: 'Responder antes',
      run: handBackAndShow
    } :
    {
      title: 'Devolver para a assistente?',
      description: `A assistente volta a responder ${summary.name} a partir da próxima mensagem do cliente. A conversa vai para “Com a assistente”.`,
      confirmLabel: 'Devolver para a assistente',
      run: handBackAndShow
    }
  };

  /*
   * Uma faixa só no topo da conversa (nunca duas). L6: curta e sempre dizendo quem responde; o resto vai para o "i".
   * `bannerKey` muda quando a situação muda, para a faixa nova entrar com o movimento curto. `lines="auto"`: quebra em
   * vez de cortar quando a coluna é estreita.
   */
  let bannerKey = 'nenhuma';
  let topBanner: React.ReactNode = null;
  if (conversation.resolved) {
    bannerKey = 'encerrada';
    topBanner =
    <Alert layout="banner" variant="info" lines="auto" title="Conversa encerrada.">
        {conversation.resolvedAt ? `Saiu da fila ${dayWord(conversation.resolvedAt.slice(0, 10))} às ${clockLabel(conversation.resolvedAt)}. ` : ''}Se o cliente escrever de novo, a assistente responde.
      </Alert>;

  } else if (queued && waitingOf(conversation)) {
    // R3 (06/11/2026, Christian, A-12): a espera pode ser derivada (assistente desligada); aí não diz que ela pediu ajuda.
    const w = waitingOf(conversation)!;
    const reason = reasonLine(w.reason, w.kind);
    const short = w.kind === 'ia' && !w.aiOff ? 'a assistente pediu ajuda e parou de responder.' : w.aiOff ? 'a assistente não está respondendo.' : 'o cliente está esperando a sua resposta.';
    bannerKey = 'aguardando';
    topBanner =
    <Alert layout="banner" variant="warning" lines="auto" title="Você responde agora:">
        {short}
        {reason && <BannerTip label="o motivo" content={reason} />}
      </Alert>;

  } else if (teamHolds) {
    bannerKey = 'equipe';
    topBanner =
    <Alert layout="banner" variant="info" lines="auto" title="Você está atendendo:">
        a assistente espera você devolver.
        <BannerTip
        label="quando a conversa volta para a assistente"
        content={`A assistente não responde ${summary.name} até você devolver. ${backIn ? `Se ninguém da equipe fizer nada, ela ${backIn}.` : 'Depois de 2 horas sem resposta da equipe, ela volta sozinha para a assistente.'}`} />
      
      </Alert>;

  } else if (returnedText) {
    bannerKey = 'devolvida';
    topBanner =
    <Alert layout="banner" variant="info" lines="auto" title="Devolvida para a assistente:">
        {returnedText}
      </Alert>;

  } else if (conversation.handler === 'ia' && conversation.returnedAt) {
    // W4 (G7): aviso da volta automática depois de 2 h sem ação da equipe.
    bannerKey = 'voltou';
    topBanner =
    <Alert layout="banner" variant="info" lines="auto" title={`Voltou para a assistente às ${conversation.returnedAt}:`}>
        2 horas sem resposta da equipe.
      </Alert>;

  }

  const waBanner = waDown ?
  <Alert
    layout="banner"
    id={waDownId}
    edge="top"
    variant="error"
    lines="auto"
    title={waKey(settings) === 'desconectado' ? `O WhatsApp ${wordsNow().of} está desconectado.` : `O WhatsApp ${wordsNow().of} não está funcionando.`}
    actions={
    <Button size="sm" onClick={() => navigate('/configuracoes?secao=whatsapp')}>
          Conectar o WhatsApp
        </Button>
    }>
    
      {WA_DOWN_TEXT}
    </Alert> :
  undefined;

  // L24h: a regra das 24 horas (o texto do "i" de antes) e, com 2 ou mais tipos parados, as linhas de cada tipo antes dela.
  const rule24 = `O WhatsApp só deixa a empresa escrever livremente até 24 h depois da última mensagem do cliente. Depois disso, só saem mensagens aprovadas pela Meta (texto fixo com campos). Quando o cliente responder, a conversa volta ao normal. Você também pode responder pelo WhatsApp Business no celular ${wordsNow().of}, ${whatsappConnection.number}: a assistente pausa nesta conversa.`;
  const showStripLines = !!optOut && !!stripLines;

  const closedBanner = closed ?
  <Alert layout="banner"
  id={lockId}
  edge="top"
  variant="info"
  lines="auto"
  title="Mais de 24 h sem mensagem do cliente."
  actions={
  optOut ? undefined :
  <Button size="sm" onClick={() => setTemplatesOpen(true)}>
            Enviar mensagem aprovada
          </Button>

  }>
    
      {optOut ? stripText : 'Por aqui, só mensagem aprovada até o cliente responder.'}{' '}
      <span className="inline-flex align-middle">
        <InfoTip
        label={showStripLines ? 'o que o cliente não recebe e a regra das 24 horas' : 'a regra das 24 horas'}
        content={
        showStripLines && stripLines ?
        <span className="flex flex-col gap-1">
                {stripLines.map((l) =>
          <span key={l}>{l}.</span>
          )}
                <span>{rule24}</span>
              </span> :

        rule24

        } />
      
      </span>
    </Alert> :
  undefined;

  const hint = closed || waDown ?
  undefined :
  !answering ?
  aiOff ?
  'A assistente está desligada: esta conversa fica com a sua equipe até você ligá-la de novo.' :
  'A assistente está parada: esta conversa fica com a sua equipe até ela voltar.' :
  youHandle ?
  'A conversa fica com você até você devolver. Depois de 2 horas sem resposta da equipe, ela volta sozinha para a assistente.' :
  'Se você responder, a conversa fica com você até devolver para a assistente.';

  // L6: Assumir/Devolver em `secondary`; o botão cheio da conversa é o "Enviar".
  const primaryAction = (compact: boolean) => {
    const full = youHandle ? 'Devolver para a assistente' : 'Assumir conversa';
    // W4 (remoção aprovada em 11/11): sem “Devolver” enquanto a assistente está desligada ou parada (a dica do compositor explica).
    if (returnHidden) return null;
    return (
      <Button size="sm" variant="secondary" onClick={() => setConfirm(youHandle ? 'devolver' : 'assumir')} aria-label={compact ? full : undefined}>
        {compact ? youHandle ? 'Devolver' : 'Assumir' : full}
      </Button>);

  };

  /* W4 (A2-09): confirmação pronta depois de agendar pela conversa (mesmo mecanismo da oferta de vaga do W1). */
  const sendReady = () => {
    if (!readyMsg) return;
    const r = sendTeamMessage(conversation.id, summary.name, readyMsg.text);
    if (!r.ok) {
      toast({ title: 'Mensagem não enviada', description: r.reason === 'whatsapp' ? WA_DOWN_TEXT : 'Passaram 24 horas sem mensagem do cliente. Por aqui, só sai mensagem aprovada.', tone: 'error' });
      return;
    }
    clearReadyMessage(conversation.id);
    toast({ title: 'Confirmação enviada', description: `${summary.name} recebe a mensagem e o agendamento continua “A confirmar” até ${summary.name.split(' ')[0]} responder.` });
  };
  const readyNotice = readyMsg && !hideReadyMessage ?
  <div className="shrink-0 border-b border-border bg-surface p-3">
      <Alert
      variant="info"
      compact
      title={readyMsg.title}
      actions={
      waDown || closed ?
      <Button size="md" variant="neutral" onClick={() => clearReadyMessage(conversation.id)}>
              Dispensar
            </Button> :

      <Button size="md" onClick={sendReady}>
              {readyMsg.sendLabel}
            </Button>

      }>
      
        “{readyMsg.text}”{' '}
        {waDown ?
      'O WhatsApp não está funcionando: avise o cliente pelo celular.' :
      closed ?
      'Esta conversa está parada há mais de 24 horas: por aqui, só sai mensagem aprovada (botão de mensagens aprovadas, embaixo).' :
      'Para mudar o texto, escreva a sua mensagem na caixa de baixo.'}
      </Alert>
    </div> :
  null;

  // R2 (06/11/2026, A-26) + L24d: o selo do topo diz o mesmo que a faixa de baixo, com as frases do dicionário.
  const badge = optOut && win.band === 'fechada' ? { ...windowBadge(win), label: listBadgeOf(conversation.id) ?? windowBadge(win).label, spoken: blockedText } : windowBadge(win);
  const pending = confirm ? CONFIRM[confirm] : null;

  // Mensagens agrupadas por dia, com separador.
  let lastDay = '';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationHeader
        className="py-1.5"
        name={summary.name}
        phone={phone}
        age={age}
        handler={headerHandler(conversation, answering, account.assistant.badge.label, backIn)}
        window={{ ...badge, hint: optOut && win.band === 'fechada' ? blockedText : windowHint(win) }}
        clientBadge={archived ? 'Arquivado' : undefined}
        primaryAction={primaryAction}
        secondaryActions={headerActions}
        onBack={hideBack ? undefined : onBack}
        onOpenProfile={onOpenProfile}
        profileOpen={profileOpen} />
      
      {topBanner &&
      <motion.div key={bannerKey} className="shrink-0" initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
          {topBanner}
        </motion.div>
      }
      {readyNotice}
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto bg-[#ECE5DD]" data-area="mensagens">
          <MessageThread appearance="panel" className="min-h-full">
            {notice && <div className="mb-2">{notice}</div>}
            {messages.length === 0 && <p className="py-8 text-center text-sm text-text-secondary">Nenhuma mensagem ainda.</p>}
            {messages.map((msg, i) => {
              const prev = messages[i - 1];
              const day = msg.day ?? TODAY_ISO;
              const divider = day !== lastDay ? <MessageDateDivider label={dayLabel(day)} /> : null;
              lastDay = day;
              return (
                <React.Fragment key={msg.id}>
                  {divider}
                  <MessageBubble
                    sender={msg.sender}
                    senderName={msg.sender === 'client' ? summary.name : msg.sender === 'team' ? `${companyName}${msg.via === 'celular' ? ' · enviada pelo celular' : ''}` : 'Assistente'}
                    timestamp={msg.timestamp}
                    status={msg.sender !== 'client' ? msg.status : undefined}
                    failedText={msg.status === 'failed' ? msg.failedText ?? 'Não enviada · passaram 24 h sem mensagem do cliente' : undefined}
                    audio={msg.audio}
                    templateTitle={msg.template?.title}
                    buttons={msg.template?.buttons}
                    isFirstInGroup={!prev || prev.sender !== msg.sender || divider !== null}>
                    
                    {msg.textFor ? msg.textFor(mode) : msg.text}
                  </MessageBubble>
                </React.Fragment>);

            })}
            {/* L13: marcador do fim sem altura (o botão flutuante "Respostas rápidas" saiu; o botão fica na linha do campo). */}
            <div ref={bottomRef} aria-hidden="true" />
          </MessageThread>
        </div>
      </div>
      {/* A-38 (DS v4.0, 06/11/2026): no limite de 10, o "+" fica visível e DESATIVADO, com o motivo na dica e para o leitor de tela (`addReplyDisabledReason`). L13: a faixa abre e fecha pelo botão do próprio `Composer` (`quickRepliesCollapsible`). */}
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={(text) => {
          onSend(text);
          setDraft('');
        }}
        quickReplies={quick.replies}
        onRemoveReply={quick.remove}
        canAddReply={quick.canAdd}
        addReplyDisabledReason={`Limite de ${MAX_QUICK_REPLIES} respostas rápidas. Para criar outra, remova uma no × ao lado do nome.`}
        addReplyForm={(close) => <QuickReplyForm full={!quick.canAdd} onAdd={quick.add} onAddSuggestion={quick.addSuggestion} suggestions={quick.suggestions} onClose={close} />}
        quickRepliesCollapsible
        quickRepliesOpen={repliesOpen}
        onQuickRepliesOpenChange={setRepliesOpen}
        onToggleTemplates={waDown ? undefined : () => setTemplatesOpen((v) => !v)}
        templatesOpen={templatesOpen}
        templatesButtonId={templatesButtonId}
        overlay={templatesOpen && !waDown ? <TemplatePicker clientId={conversation.id} clientName={summary.name} windowClosed={closed} onClose={closeTemplates} onSend={sendTemplate} ignoreId={templatesButtonId} /> : undefined}
        hint={hint}
        banner={waBanner ?? closedBanner}
        locked={
        waDown ?
        { placeholder: 'Nenhuma mensagem sai até reconectar o WhatsApp', describedBy: waDownId } :
        closed ?
        { placeholder: optOut ? 'Espere o cliente escrever' : 'Só mensagem aprovada até o cliente responder', describedBy: lockId } :
        undefined
        } />
      
      <ConfirmDialog
        open={!!pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => pending?.run()}
        title={pending?.title ?? ''}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel ?? 'Confirmar'}
        cancelLabel={pending?.cancelLabel} />
      
    </div>);

}