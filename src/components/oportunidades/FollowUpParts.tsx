import { wordsNow } from '../../data/segment';
import React from 'react';
import { CalendarClockIcon, ChevronRightIcon, CopyIcon, MoreVerticalIcon } from 'lucide-react';
import { Button } from '../Button';
import { IconButton } from '../Card';
import {
  Alert,
  Avatar,
  Card,
  Checkbox,
  ClientProcess,
  Dropdown,
  InfoTip,
  MessageBubble,
  MessageThread,
  Modal,
  ProfessionalTag,
  ProgressBar,
  StatusBadge,
  StatusBadgeGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  clickableChevronClass,
  clickableHoverClass } from
'../Card';
import { ConversationThread } from '../conversas/ConversationThread';
import { OPT_OUT_ACTION_LABEL } from '../client/ContatoCard';
import { alwaysAnswersText, kindOf, stoppedLine } from '../../data/contactPreferences';
import { formatBRL } from '../../utils/currency';
import { MOTIVE_LABEL, OUTCOME_LABEL, answeredIsoOf, firstName, messageState, messageText, nextLine, outcomeLabelOf, plainModel, proColor, proName, processItems, shortDate, stepInfo, whoActs } from '../../data/followUp';
import type { FollowUpCase } from '../../data/followUp';
import { savedSendWindows } from '../../data/automacoes';
import type { AutomationMode } from '../../data/automacoes';
import { hourText, hoursText } from '../../data/sendWindows';
import { oneSentence } from '../../data/assistantStopNotice';
import { useBusinessName } from '../../data/empresa';
import { conversations } from '../../data/conversas';
import type { Conversation, ThreadMessage } from '../../data/conversas';
import { conversationSummaries, conversationThreads, ensureConversation, handBack, takeOver, useConversations } from '../../data/conversasThreads';
import { useSavedAutomationMode } from '../../data/automationMode';
import { END_HINT_TEXT, END_MENU_TEXT, OPT_OUT_HINT_TEXT, OPT_OUT_MENU_TEXT, RETRY_OPTIONS, retryMenuText } from './useFollowUpActions';
import type { FollowUpActions } from './useFollowUpActions';

/**
 * Clique num botão de dentro do cartão/linha não abre o painel. Só o CLIQUE é barrado: teclas não (o cartão e a linha já
 * ignoram teclas vindas de dentro, e barrar tecla impedia o Esc de chegar ao painel do cliente).
 *
 * I3 (11/11/2026, conferência do passo 7): o selo do desfecho em Resolvidos (linha da lista, painel do cliente e
 * “Também acompanha”) usa `outcomeLabelOf` (data/followUp.ts), como a Ficha e Conversas. `OUTCOME_LABEL` fica só para a
 * cor do selo.
 *
 * L9 (16/11/2026, etapa de facilidade de uso):
 * - “Encerrar” diz que fecha SÓ este acompanhamento (lembretes e outras mensagens continuam), no “Decidir”, no “⋯” e no
 *   rodapé do painel. Ao lado, `OPT_OUT_ACTION_LABEL` leva à Ficha com a escolha “Cliente pediu para parar” (`actions.optOut`),
 *   só quando `actions.canOptOut`.
 * - Cartão de “Precisa de você”: título + UMA frase (`oneSentence`); o texto inteiro fica no aviso do painel do cliente.
 * - Linha de Resolvidos: nome e etiqueta do motivo na mesma linha.
 *
 * L13 (17/11/2026, DS 4.9):
 * - “Decidir”: `maxMenuHeight={320}` (o menu rola por dentro e nunca encosta na borda da tela).
 * - “⋯”: `portal` + `maxMenuHeight={320}` (o menu abre por cima de tudo, para cima quando falta espaço embaixo, e não
 *   fica cortado pela tabela de Resolvidos).
 * - Painel do cliente: `Modal dismissToasts` (abrir o painel fecha os toasts abertos).
 *
 * L20 (17/11/2026, ponto 7, DS 5.1 › rodapé com muitas ações): ver `ClientPanel`.
 *
 * L21 (17/11/2026, V5 T9: procurou “enviar mensagem” em “Decidir” e só achou “Ver conversa” no “⋮”): nos cartões de
 * “Precisa de você” com “Decidir”, “Ver conversa” aparece como botão secundário ao lado, como no painel lateral (tabela do
 * L20). Continua também no “⋮”. Faz o mesmo de sempre (`actions.conversation`).
 *
 * L24e (19/11/2026): textos de “não receber” pelo dicionário (`data/contactPreferences.ts`). Aviso de Resolvidos:
 * “Saiu do acompanhamento: parou os avisos de retorno” + `stoppedLine('retorno')` + `alwaysAnswersText()`. Menu: “Escolha o que parar.”.
 */
const stopClick = (e: React.SyntheticEvent) => e.stopPropagation();

/** L13 (DS 4.9): teto dos menus longos; o menu rola por dentro. */
const MENU_MAX_HEIGHT = 320;

/** Etiqueta do motivo (cinza) ou "Sem fechamento" (âmbar) — StatusBadge v3.8. */
export function MotiveBadge({ c }: {c: FollowUpCase;}) {
  if (!c.motive) return <StatusBadge status="warning" label="Sem fechamento" />;
  return <StatusBadge status="neutral" label={MOTIVE_LABEL[c.motive]} />;
}

function Pro({ id }: {id: string;}) {
  return <ProfessionalTag name={proName(id)} color={proColor(id)} size="sm" />;
}

/** L9: entrada “Cliente pediu para parar” nos menus (só quando cabe). */
const optOutItems = (c: FollowUpCase, actions: FollowUpActions) =>
actions.canOptOut(c) ? [{ id: 'nao-receber', label: OPT_OUT_ACTION_LABEL, description: OPT_OUT_MENU_TEXT, onSelect: () => actions.optOut(c) }] : [];

/** “⋯” de cada cliente. W4 (remoção aprovada em 11/11/2026): “Parar” saiu; fica um botão só, “Encerrar” (com o motivo). */
export function MoreMenu({ c, actions }: {c: FollowUpCase;actions: FollowUpActions;}) {
  const items =
  c.situation === 'resolvidos' || c.need?.kind === 'sem-fechamento' ?
  [
  { id: 'conv', label: 'Ver conversa', onSelect: () => actions.conversation(c) },
  { id: 'ficha', label: 'Abrir ficha', onSelect: () => actions.record(c) }] :

  [
  { id: 'conv', label: 'Ver conversa', onSelect: () => actions.conversation(c) },
  // F-025: os desfechos de qualquer caso em andamento (inclusive depois de "Responder na conversa").
  { id: 'agendar', label: 'Agendar', description: 'Abre o Novo agendamento da Agenda; o caso vira "Agendou"', onSelect: () => actions.schedule(c) },
  { id: 'encerrar', label: 'Encerrar', description: END_MENU_TEXT, onSelect: () => actions.finish(c) },
  ...optOutItems(c, actions)];

  return (
    <span onClick={stopClick}>
      <Dropdown portal maxMenuHeight={MENU_MAX_HEIGHT} triggerLabel={`Mais ações para ${c.clientName}`} align="end" items={items} />
    </span>);

}

/**
 * O botão fixo de cada situação de "Precisa de você" (mesma largura e posição em todos os cartões).
 * L20: `fit` = largura do próprio texto no computador (rodapé do painel em linha, DS 5.1); nos cartões continua 13rem.
 */
export function NeedAction({ c, actions, size = 'md', block = false, fit = false }: {c: FollowUpCase;actions: FollowUpActions;size?: 'md' | 'lg';block?: boolean;fit?: boolean;}) {
  const kind = c.need?.kind;
  const mode = useSavedAutomationMode();
  const wide = block ? 'w-full' : fit ? 'w-full sm:w-auto' : 'w-full sm:w-52';
  const fill = `${wide} [&>div]:w-full [&_button]:w-full [&_button]:justify-center`;
  if (kind === 'pausado') {
    return (
      <div className={`flex flex-col gap-2 sm:flex-row ${block ? 'w-full sm:justify-end' : ''}`} onClick={stopClick}>
        <Button size={size} variant="neutral" onClick={() => actions.copy(c)} aria-label={`Copiar mensagem para ${c.clientName}`}>
          Copiar mensagem
        </Button>
        <Button size={size} onClick={() => actions.called(c)} aria-label={`Marcar ${c.clientName} como chamado`}>
          Marcar como chamado
        </Button>
      </div>);

  }
  if (kind === 'sem-resposta' || kind === 'nao-entregue') {
    return (
      <div className={fill} onClick={stopClick}>
        <Dropdown
          triggerVariant="primary"
          triggerSize={size}
          trigger="Decidir"
          align="end"
          maxMenuHeight={MENU_MAX_HEIGHT}
          items={[
          // W4 (A2-11): mensagem não entregue → corrigir o telefone no cadastro.
          ...(kind === 'nao-entregue' ? [{ id: 'phone', label: 'Corrigir telefone', description: 'Abre o cadastro do cliente para trocar o número', onSelect: () => actions.fixPhone(c) }] : []),
          { id: 'call', label: 'Vou ligar', description: 'Sai da lista e fica em Resolvidos', onSelect: () => actions.callMe(c) },
          { id: 'agendar', label: 'Agendar', description: 'Abre o Novo agendamento; o caso vira "Agendou"', onSelect: () => actions.schedule(c) },
          { id: 'sep1', type: 'separator' },
          { id: 'lbl', type: 'label', label: 'Tentar de novo em…' },
          // W4 (A2-03): a frase segue o modo de envio salvo.
          ...RETRY_OPTIONS.map((d) => ({ id: `retry-${d}`, label: `${d} dias`, description: retryMenuText(mode), onSelect: () => actions.retry(c, d) })),
          { id: 'sep2', type: 'separator' },
          { id: 'end', label: 'Encerrar', description: END_MENU_TEXT, onSelect: () => actions.finish(c) },
          ...optOutItems(c, actions)]
          } />
        
      </div>);

  }
  const button =
  kind === 'ia-ajuda' ?
  { label: 'Responder na conversa', on: () => actions.conversation(c) } :
  kind === 'sem-fechamento' ?
  { label: 'Fechar atendimento', on: () => actions.closeAppointment(c) } :
  { label: 'Aprovar', on: () => actions.approve([c]) };
  return (
    <div className={fill} onClick={stopClick}>
      <Button size={size} onClick={button.on} aria-label={`${button.label}: ${c.clientName}`}>
        {button.label}
      </Button>
    </div>);

}

/** Abre o painel com Enter/Espaço vindos do próprio cartão (teclas de botões de dentro não). */
const openOnKey = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    open();
  }
};

/** Cartão grande de "Precisa de você" (P1). Clicar no cartão abre o painel do cliente (P2). */
export function NeedCard({
  c,
  mode,
  actions,
  onOpen,
  selectable,
  selected,
  onSelect








}: {c: FollowUpCase;mode: AutomationMode;actions: FollowUpActions;onOpen: (c: FollowUpCase) => void;selectable?: boolean;selected?: boolean;onSelect?: (checked: boolean) => void;}) {
  const open = () => onOpen(c);
  // L21: “Ver conversa” à vista ao lado de “Decidir” (secundário, mesmo tamanho), como no painel lateral.
  const decide = c.need?.kind === 'sem-resposta' || c.need?.kind === 'nao-entregue';
  return (
    <Card
      as="article"
      variant="interactive"
      padding="md"
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${c.clientName}`}
      onClick={open}
      onKeyDown={openOnKey(open)}
      className={`cursor-pointer ${selected ? 'border-primary bg-active-surface' : ''}`}>
      
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {selectable &&
            <span onClick={stopClick}>
                <Checkbox size="sm" checked={!!selected} onChange={(v: boolean) => onSelect?.(v)} aria-label={`Selecionar ${c.clientName}`} />
              </span>
            }
            <h3 className="text-base font-extrabold text-text-primary">{c.clientName}</h3>
            <MotiveBadge c={c} />
          </div>
          {c.need &&
          <>
              <p className="mt-2 text-sm font-bold text-text-primary">{c.need.title}</p>
              {/* L9: uma frase; o texto inteiro está no aviso do painel do cliente (clique no cartão). */}
              <p className="mt-0.5 text-sm text-text-secondary">{oneSentence(c.need.text)}</p>
            </>
          }
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
            <span>
              {c.service} · {formatBRL(c.value)}
            </span>
            <Pro id={c.professionalId} />
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <ClientProcess items={processItems(c, mode)} />
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {decide &&
          <span className="shrink-0" onClick={stopClick}>
              <Button size="md" variant="secondary" onClick={() => actions.conversation(c)} aria-label={`Ver conversa com ${c.clientName}`}>
                Ver conversa
              </Button>
            </span>
          }
          <NeedAction c={c} actions={actions} />
          <MoreMenu c={c} actions={actions} />
        </div>
      </div>
    </Card>);

}

/**
 * Cartão de “Programados” (antes “A Orniplaty está cuidando”; W4, G8). Processo em andamento, mais leve que os de
 * “Precisa de você”. Motivo + “Em andamento” (verde), modelo em linguagem simples, progresso, a PRÓXIMA mensagem em
 * destaque e, W4 (G8), QUEM AGE pelo modo de envio. O cartão inteiro abre o painel; “⋯” tem Ver conversa, Agendar e Encerrar.
 */
export function CaringCard({ c, mode, actions, onOpen }: {c: FollowUpCase;mode: AutomationMode;actions: FollowUpActions;onOpen: (c: FollowUpCase) => void;}) {
  const open = () => onOpen(c);
  const { step, total, sent } = stepInfo(c);
  const progress = c.next ? (step - 1) / Math.max(1, total) * 100 : sent / Math.max(1, total) * 100;
  return (
    <Card as="article" variant="interactive" padding="sm" role="button" tabIndex={0} aria-label={`Abrir ${c.clientName}`} onClick={open} onKeyDown={openOnKey(open)} className="cursor-pointer">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold text-text-primary">{c.clientName}</h3>
            <StatusBadgeGroup direction="row">
              <MotiveBadge c={c} />
              <StatusBadge status="success" label="Em andamento" />
            </StatusBadgeGroup>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
            <span>
              {c.service} · {plainModel(c)}
            </span>
            <Pro id={c.professionalId} />
          </div>
        </div>
        <MoreMenu c={c} actions={actions} />
      </div>
      <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-center">
        <ProgressBar
          value={progress}
          label={c.next ? `Mensagem ${step} de ${total}` : `${sent} de ${total} ${total === 1 ? 'mensagem enviada' : 'mensagens enviadas'}`}
          valueLabel={c.next ? sent === 0 ? 'nenhuma enviada' : `${sent} enviada${sent > 1 ? 's' : ''}` : undefined}
          ariaLabel={`Progresso do acompanhamento de ${c.clientName}`} />
        
        <p className="inline-flex items-start gap-2 text-sm font-semibold text-text-primary">
          <CalendarClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {nextLine(c, mode)}
            <span className="block font-normal text-text-secondary">{whoActs(c, mode)}</span>
          </span>
        </p>
      </div>
    </Card>);

}

/** Linhas compactas de "Resolvidos" (só "⋯"). Clicar na linha abre o painel. */
export function CaseRows({ rows, mode, actions, onOpen }: {rows: FollowUpCase[];mode: AutomationMode;actions: FollowUpActions;onOpen: (c: FollowUpCase) => void;}) {
  const resolved = rows[0]?.situation === 'resolvidos';
  return (
    <Table containerClassName="relative">
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead className="hidden md:table-cell">Serviço</TableHead>
          <TableHead>{resolved ? 'Resultado' : 'Processo'}</TableHead>
          <TableHead className="hidden lg:table-cell">Profissional</TableHead>
          <TableHead>
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => {
          const o = c.outcome;
          return (
            <TableRow
              key={c.id}
              tabIndex={0}
              role="button"
              aria-label={`Abrir ${c.clientName}`}
              onClick={() => onOpen(c)}
              onKeyDown={openOnKey(() => onOpen(c))}
              className={`group cursor-pointer ${clickableHoverClass}`}>
              
              <TableCell>
                {/* L9: nome e motivo na mesma linha (descem juntos só quando não cabem). */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="font-bold text-text-primary">{c.clientName}</span>
                  <MotiveBadge c={c} />
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <span className="text-text-primary">{c.service}</span>
                <span className="block text-xs text-text-muted">{c.model}</span>
              </TableCell>
              <TableCell>
                {resolved && o ?
                <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={OUTCOME_LABEL[o.kind].tone} label={outcomeLabelOf(c)} />
                    <span className="text-sm text-text-secondary">
                      {o.note}
                      {/* F-006: valor RECUPERADO = o que foi pago (reembolso descontado), nunca o preço do cadastro. */}
                      {o.kind === 'voltou' && o.paidValue ? ` · ${formatBRL(o.paidValue)} pagos` : ''}
                    </span>
                  </div> :

                <ClientProcess compact items={processItems(c, mode)} />
                }
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <Pro id={c.professionalId} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <MoreMenu c={c} actions={actions} />
                  <ChevronRightIcon className={`h-4 w-4 ${clickableChevronClass}`} aria-hidden="true" />
                </div>
              </TableCell>
            </TableRow>);

        })}
      </TableBody>
    </Table>);

}

/**
 * Mensagens do acompanhamento como um cartão de WhatsApp (A6, Lote A 21/10/2026): cabeçalho da clínica (como o topo de
 * uma conversa) e os balões; a situação de cada mensagem fica ABAIXO do balão, em texto de tamanho normal, com etiqueta.
 */
/** L22b: `onCopy` = ícone "Copiar mensagem" (`IconButton` do DS) na mensagem pronta (`c.next`), em "Hora de chamar". */
function FollowUpWhatsApp({ c, mode, onCopy }: {c: FollowUpCase;mode: AutomationMode;onCopy?: () => void;}) {
  const companyName = useBusinessName();
  const replies = c.replies ?? [];
  const timeline = [...c.messages.map((m) => ({ kind: 'msg' as const, iso: m.plannedIso, m })), ...replies.map((r) => ({ kind: 'reply' as const, iso: r.iso, r }))].sort((a, b) =>
  a.iso.localeCompare(b.iso)
  );
  return (
    <figure className="overflow-hidden rounded-xl border border-border shadow-sm" aria-label={`Mensagens do acompanhamento para ${c.clientName}`}>
      <div className="flex items-center gap-2.5 bg-sidebar-background px-3 py-2.5 text-white">
        <Avatar name={companyName} size="sm" tone="brand" />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{companyName}</span>
          <span className="text-xs text-sidebar-text">Mensagens do acompanhamento para {firstName(c.clientName)}</span>
        </span>
        <MoreVerticalIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      </div>
      <MessageThread className="rounded-none p-3 pb-2">
        {timeline.map((t, i) => {
          if (t.kind === 'reply') {
            return (
              <MessageBubble key={`r${i}`} sender="client" senderName={c.clientName} timestamp={shortDate(t.iso)}>
                {t.r.text}
              </MessageBubble>);

          }
          const st = messageState(c, t.m, mode);
          return (
            <React.Fragment key={`m${t.m.n}`}>
              <MessageBubble sender="team" senderName={companyName} status={t.m.status === 'nao-entregue' ? 'failed' : undefined} timestamp={shortDate(t.m.plannedIso)}>
                {messageText(c, t.m)}
              </MessageBubble>
              <div className="mb-2 mt-1 flex flex-wrap items-center justify-end gap-2 text-sm text-text-primary">
                <StatusBadge status={st.tone} label={st.tag} />
                <span>{st.text}</span>
                {onCopy && c.next && t.m.n === c.next.n &&
                <IconButton size="sm" aria-label={`Copiar mensagem para ${c.clientName}`} icon={<CopyIcon className="h-4 w-4" />} onClick={onCopy} />
                }
              </div>
            </React.Fragment>);

        })}
      </MessageThread>
    </figure>);

}

/** Coluna da conversa (mesma peça e mesma fonte da tela Conversas). Envio simulado. */
function ConversationColumn({
  c,
  actions,
  narrow,
  onCloseChat,
  onBackToClient






}: {c: FollowUpCase;actions: FollowUpActions;narrow: boolean;onCloseChat: () => void;onBackToClient: () => void;}) {
  useConversations();
  const existing = conversations.find((x) => x.id === c.clientId);
  const thread = conversationThreads[c.clientId] ?? [];
  const saved = thread.length > 0;
  const conv: Conversation = existing ?? { id: c.clientId, name: c.clientName, preview: '', time: '', unread: 0, handler: 'ia' };
  const summary = conversationSummaries[c.clientId] ?? { name: c.clientName, phone: c.phone, recordPath: '/clientes', fields: [] };
  // Sem conversa salva: mostra só as mensagens do acompanhamento que já saíram (nada inventado).
  const sent = c.messages.filter((m) => m.status === 'enviada');
  const messages: ThreadMessage[] = saved ? thread : sent.map((m) => ({ id: `fu-${c.id}-${m.n}`, sender: 'team', timestamp: shortDate(m.plannedIso), text: messageText(c, m) }));
  const first = firstName(c.clientName);
  const notice = saved ? null :
  <Alert variant="info" compact title={`Ainda não há conversa com ${first}.`}>
      {sent.length > 0 ?
    `Estas são as mensagens que a Orniplaty mandou no acompanhamento. Quando ${first} responder, a resposta aparece aqui.` :
    `Quando ${first} responder ou você escrever, a conversa aparece aqui.`}
    </Alert>;

  // W4 (G6, G7): mesma regra de Conversas (Assumir fica com a equipe; Devolver com mensagem sem resposta = a assistente responde na hora).
  const toggle = () => {
    ensureConversation(c.clientId, c.clientName);
    const now = conversations.find((x) => x.id === c.clientId);
    if (now?.handler === 'ia') takeOver(c.clientId);else
    handBack(c.clientId);
  };
  return (
    <ConversationThread
      conversation={conv}
      summary={{ ...summary, phone: summary.phone || c.phone }}
      messages={messages}
      onBack={onBackToClient}
      hideBack
      onToggleHandler={toggle}
      onSend={(text) => actions.reply(c, text)}
      notice={notice}
      headerActions={
      <>
          <Button size="md" variant="neutral" onClick={() => actions.openInConversas(c)}>
            Abrir em Conversas
          </Button>
          {!narrow &&
        <Button size="md" variant="neutral" onClick={onCloseChat}>
              Fechar conversa
            </Button>
        }
        </>
      } />);


}

type Hint = {label: string;text: string;};
/** L20: botão secundário do rodapé (os dois primeiros ficam à vista; o resto vai para “Mais ações”). */
type FooterAction = {key: string;label: string;variant: 'secondary' | 'neutral';onSelect: () => void;description?: string;ariaLabel?: string;};

/**
 * L20: texto de um aviso = UMA frase à vista e o resto num "i" (regra 6). Mesmo texto, só dividido.
 */
function NoticeText({ title, text }: {title: string;text: string;}) {
  const first = oneSentence(text);
  const rest = text.slice(first.length).trim();
  if (!rest) return <>{text}</>;
  return (
    <>
      {first}{' '}
      <span className="inline-flex align-middle">
        <InfoTip label={title} content={rest} />
      </span>
    </>);

}

/**
 * Painel do cliente (P2; ajustes A4 e A6 de 21/10/2026). `Modal placement="side"` do DS; com a conversa aberta,
 * `size="wide"` + duas colunas (Cliente | Conversa) no computador. No celular: tela cheia com as abas "Cliente" e
 * "Conversa".
 * L20 (17/11/2026, ponto 7, regra do rodapé do DS 5.1, no painel e na janela com a conversa):
 * - `footerLayout="row"`: os botões têm a própria largura, numa linha, à direita (o botão cheio também: `NeedAction fit`).
 * - Botão cheio: o MESMO de antes em cada situação (`NeedAction`; em “Hora de chamar”, “Marcar como chamado”); por último.
 * - No máximo dois secundários à vista; o resto em “Mais ações” (`Dropdown triggerVariant="neutral" triggerSize="lg"`,
 *   `align="end"`, `portal`), com a mesma frase de ajuda dos outros menus (“Encerrar” continua dizendo que fecha só este
 *   acompanhamento: a armadilha fechada no L9 continua fechada).
 * - “Cliente pediu para parar”: no menu “Mais ações” desde o L22b (descrição “Escolha o que parar.”, L24e), só quando
 *   `actions.canOptOut`.
 * - Aviso do topo (“Duas tentativas sem resposta”, “Hora de chamar”…): uma frase à vista e o resto no "i".
 */
export function ClientPanel({
  c,
  mode,
  actions,
  onClose,
  chat,
  onChat,
  tab,
  onTab,
  narrow,
  onOpenCase












}: {c: FollowUpCase | null;mode: AutomationMode;actions: FollowUpActions;onClose: () => void; /** F-008: abrir outro caso do mesmo cliente ("Também acompanha"). */onOpenCase?: (id: string) => void;chat: boolean;onChat: (open: boolean) => void;tab: string;onTab: (tab: string) => void;narrow: boolean;}) {
  const chatShown = narrow ? tab === 'conversa' : chat;
  const showConversation = () => narrow ? onTab('conversa') : onChat(true);

  let footer: React.ReactNode = null;
  if (c) {
    const kind = c.need?.kind;
    const resolved = c.situation === 'resolvidos';
    /*
     * L22b (17/11/2026, decisão 4a do Christian, regra de rodapé do DS 6.1): layout fixo
     * [Mais ações ▾] [Ver conversa] [Agendar] [principal], sempre nesta ordem e com estes nomes. Só o principal muda com a
     * situação (o mesmo de antes em cada situação). Ação que não existe na situação fica fora e as outras mantêm a ordem.
     * "Mais ações" tem sempre os mesmos dois itens; o que não vale na situação aparece desativado, com o motivo na linha.
     * Saíram (pedido do Christian): "O que cada botão faz" e o botão "Cliente pediu…" à esquerda (agora no menu).
     * "Copiar mensagem" virou ícone na própria mensagem pronta (mesma ação e mesmo aviso).
     */
    const showConv = !chatShown && !(c.situation === 'precisa' && kind === 'ia-ajuda');
    const showSchedule = !resolved && kind !== 'sem-fechamento';
    const canEnd = !resolved && kind !== 'sem-fechamento';
    const canOpt = !resolved && kind !== 'sem-fechamento' && actions.canOptOut(c);
    const NOT_HERE = 'Não vale nesta situação';
    let primary: React.ReactNode = null;
    if (resolved) {
      primary =
      <Button key="ficha" onClick={() => actions.record(c)}>
          Abrir ficha
        </Button>;

    } else if (c.situation === 'precisa') {
      if (kind === 'pausado') {
        primary =
        <Button key="need" onClick={() => actions.called(c)} aria-label={`Marcar ${c.clientName} como chamado`}>
            Marcar como chamado
          </Button>;

      } else {
        // "Responder na conversa" no painel abre a coluna; os outros que levam a outra janela fecham o painel antes.
        const hideHere = kind === 'ia-ajuda' && chatShown;
        if (!hideHere) {
          primary =
          <div key="need" onClickCapture={() => kind === 'sem-fechamento' && onClose()}>
              <NeedAction c={c} actions={actions} size="lg" fit />
            </div>;

        }
      }
    }
    footer =
    <>
        <Dropdown
        portal
        triggerVariant="neutral"
        triggerSize="lg"
        trigger="Mais ações"
        triggerLabel={`Mais ações para ${c.clientName}`}
        align="end"
        maxMenuHeight={MENU_MAX_HEIGHT}
        items={[
        { id: 'nao-receber', label: OPT_OUT_ACTION_LABEL, description: canOpt ? OPT_OUT_MENU_TEXT : NOT_HERE, disabled: !canOpt, onSelect: () => actions.optOut(c) },
        { id: 'sep', type: 'separator' },
        { id: 'encerrar', label: 'Encerrar', description: canEnd ? END_MENU_TEXT : NOT_HERE, disabled: !canEnd, onSelect: () => actions.finish(c) }]
        } />
      
        {showConv &&
      <Button variant="secondary" onClick={showConversation}>
            Ver conversa
          </Button>
      }
        {showSchedule &&
      <Button variant="secondary" onClick={() => actions.schedule(c)}>
            Agendar
          </Button>
      }
        {primary}
      </>;

  }

  const clientColumn = c &&
  <div className="flex flex-col gap-5">
      {c.situation === 'precisa' && c.need &&
    <Alert variant="warning" compact title={c.need.title}>
          <NoticeText title={c.need.title} text={c.need.text} />
        </Alert>
    }
      {c.situation === 'cuidando' && c.held && c.next &&
    <Alert variant="info" compact title="Mensagem em análise no WhatsApp">
          {/* W4 (A2-08): o texto segue o modo de envio salvo. */}
          {mode === 'pausado' ?
      'A mensagem está pronta, mas só sai quando você mandar.' :
      mode === 'supervisionado' ?
      'Ela só sai depois que o WhatsApp liberar a mensagem e você aprovar o envio.' :
      'Ela sai sozinha quando o WhatsApp liberar a mensagem.'}
        </Alert>
    }
      {c.situation === 'cuidando' && !c.held && mode === 'pausado' && c.next &&
    <Alert variant="info" compact title="Envios pausados por você">
          A mensagem está pronta, mas só sai quando você enviar ou ligar os envios.
        </Alert>
    }
      {c.situation === 'resolvidos' && c.outcome?.kind === 'nao-recebe' &&
    <Alert variant="info" compact title="Saiu do acompanhamento: parou os avisos de retorno">
          {stoppedLine('retorno', kindOf(c.clientId, 'retorno'))}. {alwaysAnswersText()}
        </Alert>
    }
      {c.situation === 'resolvidos' && c.outcome &&
    <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={OUTCOME_LABEL[c.outcome.kind].tone} label={outcomeLabelOf(c)} />
          <span className="text-sm text-text-secondary">{c.outcome.note}</span>
        </div>
    }
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-text-muted">Serviço</dt>
        <dd className="font-semibold text-text-primary">
          {c.service} · {formatBRL(c.value)}
        </dd>
        <dt className="text-text-muted">Acompanhamento</dt>
        <dd className="font-semibold text-text-primary">{c.model}</dd>
        <dt className="text-text-muted">Prazo</dt>
        <dd className="font-semibold text-text-primary">{c.deadline}</dd>
        <dt className="text-text-muted">Profissional</dt>
        <dd>
          <Pro id={c.professionalId} />
        </dd>
      </dl>
      <ClientProcess title="Processo" items={processItems(c, mode)} />
      {c.others && c.others.length > 0 &&
    <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-text-primary">Também acompanha</h3>
          <ul className="flex flex-col gap-2">
            {c.others.map((o) =>
        <li key={o.id}>
                <button
            type="button"
            onClick={() => onOpenCase?.(o.id)}
            className={`group flex w-full items-center justify-between gap-3 rounded-button border border-border bg-surface px-3 py-2.5 text-left ${clickableHoverClass}`}>
            
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <MotiveBadge c={o} />
                      <span className="text-sm font-semibold text-text-primary">{o.service}</span>
                    </span>
                    <span className="text-sm text-text-secondary">
                      {o.situation === 'resolvidos' && o.outcome ? `${outcomeLabelOf(o)}: ${o.outcome.note}` : o.situation === 'precisa' ? o.need?.title ?? 'Precisa de você' : nextLine(o, mode)}
                    </span>
                  </span>
                  <ChevronRightIcon className={`h-4 w-4 shrink-0 ${clickableChevronClass}`} aria-hidden="true" />
                </button>
              </li>
        )}
          </ul>
        </div>
    }
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-text-primary">Mensagens do acompanhamento</h3>
        {c.messages.length === 0 ?
      <p className="text-sm text-text-secondary">Nenhuma mensagem ainda. Depois do fechamento, a Orniplaty chama o cliente na data de volta do serviço.</p> :

      <FollowUpWhatsApp c={c} mode={mode} onCopy={c.situation === 'precisa' && c.need?.kind === 'pausado' ? () => actions.copy(c) : undefined} />
      }
      </div>
    </div>;


  const columns = c ?
  [
  { id: 'cliente', label: 'Cliente', content: clientColumn },
  ...(narrow || chat ?
  [{ id: 'conversa', label: 'Conversa', flush: true, content: <ConversationColumn c={c} actions={actions} narrow={narrow} onCloseChat={() => onChat(false)} onBackToClient={() => onTab('cliente')} /> }] :
  [])] :

  undefined;

  return (
    <Modal
      open={!!c}
      onClose={onClose}
      placement="side"
      size={!narrow && chat ? 'wide' : 'md'}
      title={c?.clientName ?? ''}
      description={c ? [c.phone, c.motive ? MOTIVE_LABEL[c.motive] : 'Sem fechamento', c.service].filter(Boolean).join(' · ') : undefined}
      columns={columns}
      activeColumn={narrow ? tab : undefined}
      onActiveColumnChange={onTab}
      footer={footer}
      footerLayout="row"
      dismissToasts />);


}