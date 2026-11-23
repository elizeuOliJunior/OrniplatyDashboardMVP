import React, { useState } from 'react';
import { Alert, InfoTip, Modal } from '../Card';
import { Button } from '../Button';
import { useToast } from '../ui/Toast';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { ConversationThread } from '../conversas/ConversationThread';
import { KEEPS_CONVERSATION_TEXT } from '../conversas/TemplatePicker';
import { conversations } from '../../data/conversas';
import type { Conversation } from '../../data/conversas';
import { conversationSummaries, conversationThreads, ensureConversation, patchConversation, sendTeamMessage, sendTeamTemplate, useConversations, windowOf } from '../../data/conversasThreads';
import { conversationLink } from '../../data/deepLinks';
import { MESSAGE_TEMPLATES, WAITLIST_TEMPLATE, fillTemplate } from '../../data/messageTemplates';
import { offerMessage, offerTemplateValues, slotDayPhrase } from '../../data/waitlistPrefs';
import type { OfferText } from '../../data/waitlistPrefs';

/**
 * W1 (11/11/2026, Christian, decisão 17-A): "Chamar no WhatsApp" da vaga em espera. Abre a conversa do cliente AO LADO,
 * por cima da Agenda (mesmo padrão de Oportunidades › "Responder na conversa": `Modal placement="side"` + a coluna de
 * conversa de sempre), com a MENSAGEM DA OFERTA PRONTA e um botão para enviar. Quem quiser outro texto escreve na caixa de
 * mensagem, como em qualquer conversa.
 * A mensagem pronta fica FIXA acima da conversa (a conversa abre rolada no fim; dentro dela o aviso ficava escondido).
 * Conversa parada há mais de 24 h (janela fechada): só sai mensagem aprovada; a pronta passa a ser a mensagem aprovada
 * "Vaga na lista de espera" (data/messageTemplates.ts), já preenchida. O botão daqui se chama "Enviar a mensagem da vaga"
 * para não se confundir com o "Enviar mensagem aprovada" da conversa, que abre a lista de todas as mensagens aprovadas.
 * PROTÓTIPO: o envio é o mesmo da tela Conversas (entra no histórico; nada sai de verdade).
 *
 * W3 (11/11/2026, Christian, decisão G1): o MESMO mecanismo serve para "a clínica mudou o seu horário"
 * (`ChangeNoticePanel`, no fim do arquivo), chamado da lista "Falta avisar" das Notificações da agenda.
 *
 * I1 (11/11/2026, integração, item 17): quando o envio falha porque o WhatsApp da clínica está parado (motivo
 * `'whatsapp'` do `SendResult`, lote W4), o aviso diz isso, e não mais a frase da janela de 24 horas.
 *
 * L21 (17/11/2026, V5 T3/T4): o aviso da mensagem pronta diz, antes do envio, que a conversa fica com a equipe
 * (`KEEPS_CONVERSATION_TEXT`, a mesma frase da janela de mensagens aprovadas; é o que `sendTeamMessage` e
 * `sendTeamTemplate` fazem). A frase que estava ali ("Para mudar o texto…" / "Esta conversa está parada…") foi para o "i"
 * ao lado, palavra por palavra. Nada muda no envio.
 */
export type WaitlistChatTarget = {clientId: string;offer: OfferText;};

/** I1 (item 17): texto do envio que não saiu, pelo motivo devolvido por `sendTeamMessage`. */
const notSentText = (reason?: string) =>
reason === 'whatsapp' ?
'O WhatsApp da clínica não está funcionando: nenhuma mensagem sai pelo painel. Chame pelo celular até reconectar.' :
'Passaram 24 horas sem mensagem do cliente. Por aqui, só sai mensagem aprovada.';

/** L21: a frase antes do envio + o "i" com a frase que ficava visível antes. */
const KeepsConversation = ({ tipLabel, tip }: {tipLabel: string;tip: string;}) =>
<>
    {KEEPS_CONVERSATION_TEXT}{' '}
    <span className="inline-flex align-middle">
      <InfoTip label={tipLabel} content={tip} />
    </span>
  </>;


function OfferThread({ target, onClose, onSent }: {target: WaitlistChatTarget;onClose: () => void;onSent: (how: 'mensagem' | 'aprovada') => void;}) {
  useConversations();
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const [sent, setSent] = useState(false);
  const { clientId, offer } = target;
  const first = offer.clientName.split(' ')[0];
  const conv: Conversation = conversations.find((x) => x.id === clientId) ?? { id: clientId, name: offer.clientName, preview: '', time: '', unread: 0, handler: 'ia' };
  const messages = conversationThreads[clientId] ?? [];
  const summary = conversationSummaries[clientId] ?? { name: offer.clientName, phone: '', recordPath: '/clientes', fields: [] };
  const closed = windowOf(clientId).band === 'fechada';
  const tpl = MESSAGE_TEMPLATES.find((t) => t.name === WAITLIST_TEMPLATE);
  const ready = closed && tpl ? fillTemplate(tpl.body, offerTemplateValues(offer)) : offerMessage(offer);

  const done = (how: 'mensagem' | 'aprovada') => {
    setSent(true);
    onSent(how);
  };
  const sendReady = () => {
    if (closed) {
      if (!tpl) return;
      sendTeamTemplate(clientId, offer.clientName, { title: tpl.title, text: ready, buttons: tpl.buttons });
      done('aprovada');
      return;
    }
    const r = sendTeamMessage(clientId, offer.clientName, ready);
    if (!r.ok) {
      toast({ title: 'Mensagem não enviada', description: notSentText(r.reason), tone: 'error' });
      return;
    }
    done('mensagem');
  };
  const toggle = () => {
    ensureConversation(clientId, offer.clientName);
    const now = conversations.find((x) => x.id === clientId);
    patchConversation(clientId, { handler: now?.handler === 'voce' ? 'ia' : 'voce' });
  };

  const notice = sent ?
  <Alert
    variant="success"
    compact
    title={`Mensagem enviada para ${first}`}
    actions={
    <Button size="md" variant="secondary" onClick={onClose}>
          Voltar para a vaga
        </Button>
    }>
    
      Quando {first} responder, volte para a vaga e registre a resposta: aceitou, recusou ou ficou sem resposta.
    </Alert> :
  closed ?
  <Alert
    variant="info"
    compact
    title={`Mensagem aprovada pronta: ${tpl?.title ?? 'Vaga na lista de espera'}`}
    actions={
    <Button size="md" onClick={sendReady}>
          Enviar a mensagem da vaga
        </Button>
    }>
    
      “{ready}” <KeepsConversation tipLabel="por que só mensagem aprovada" tip="Esta conversa está parada há mais de 24 horas, então por aqui só sai mensagem aprovada." />
    </Alert> :

  <Alert
    variant="info"
    compact
    title={`Mensagem pronta para ${first}`}
    actions={
    <Button size="md" onClick={sendReady}>
          Enviar a mensagem da vaga
        </Button>
    }>
    
      “{ready}” <KeepsConversation tipLabel="como mudar o texto" tip="Para mudar o texto, escreva a sua mensagem na caixa de baixo." />
    </Alert>;


  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-surface p-3">{notice}</div>
      <div className="min-h-0 flex-1">
        <ConversationThread
          conversation={conv}
          summary={summary}
          messages={messages}
          onBack={onClose}
          hideBack
          hideReadyMessage
          onToggleHandler={toggle}
          onSend={(text) => {
            const r = sendTeamMessage(clientId, offer.clientName, text);
            if (r.ok) done('mensagem');
          }}
          headerActions={
          <Button size="md" variant="neutral" onClick={() => navigate(conversationLink(clientId))}>
              Abrir em Conversas
            </Button>
          } />
        
      </div>
    </div>);

}

export function WaitlistConversationPanel({ target, onClose, onSent }: {target: WaitlistChatTarget | null;onClose: () => void;onSent: (how: 'mensagem' | 'aprovada') => void;}) {
  const when = target ? slotDayPhrase(target.offer.iso).replace(/^n[ao] /, '') : '';
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      placement="side"
      title={target?.offer.clientName ?? ''}
      description={target ? `Oferta da vaga de ${when}, às ${target.offer.time} · ${target.offer.professional}` : undefined}
      columns={target ? [{ id: 'conversa', label: 'Conversa', flush: true, content: <OfferThread key={`${target.clientId}-${target.offer.iso}-${target.offer.time}`} target={target} onClose={onClose} onSent={onSent} /> }] : undefined} />);


}

/* ───────────── W3 (G1): "a clínica mudou o seu horário" ───────────── */

/**
 * Alvo do aviso de mudança de horário: cliente, mensagem pronta e o que mudou (para o título da janela).
 * L8 (17/11/2026, etapa de facilidade de uso, só visual): conversa parada há mais de 24 h. A mensagem aprovada
 * "Remarcar horário" (`remarcar_horario`) existe e o "Enviar mensagem aprovada" da faixa de baixo da conversa já a abre
 * escolhida e preenchida (TemplatePicker, caso "Falta avisar"). O aviso de cima diz isso em UMA frase (antes dizia que
 * não havia mensagem aprovada, o que não era verdade); "ligue para…" foi para o "i". "Marcar como avisado" passou a
 * `secondary` nesse estado: o botão cheio é o que avisa o cliente ("Enviar mensagem aprovada").
 * L24c (19/11/2026, decisão do Christian de 18/11, 23h51): este aviso NUNCA é bloqueado pela preferência de contato do
 * cliente. É sobre um horário que o próprio cliente marcou (como "se o cliente pedir um horário, a clínica sempre
 * responde"). Saiu o ramo "Por aqui não sai mensagem" / "{nome} pediu para não receber mensagens"; a equipe sempre vê a
 * mensagem pronta (ou a aprovada, com a janela fechada).
 * L24d (19/11/2026): a conversa de baixo recebe `changeNotice`, para a faixa de baixo também não bloquear (antes ela ainda
 * dizia que nem mensagem aprovada saía, contra o aviso de cima).
 * L21: com a janela aberta, a mensagem pronta diz que a conversa fica com a equipe (como a da vaga). Com a janela fechada,
 * a frase aparece no rodapé da janela de mensagens aprovadas, onde o envio acontece.
 */
export type ChangeChatTarget = {clientId: string;clientName: string;message: string;what: string;};

const RESCHEDULE_TEMPLATE = 'remarcar_horario';

function ChangeThread({ target, onClose, onNotified }: {target: ChangeChatTarget;onClose: () => void;onNotified: () => void;}) {
  useConversations();
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const [sent, setSent] = useState(false);
  const { clientId, clientName, message } = target;
  const first = clientName.split(' ')[0];
  const conv: Conversation = conversations.find((x) => x.id === clientId) ?? { id: clientId, name: clientName, preview: '', time: '', unread: 0, handler: 'ia' };
  const messages = conversationThreads[clientId] ?? [];
  const summary = conversationSummaries[clientId] ?? { name: clientName, phone: '', recordPath: '/clientes', fields: [] };
  const closed = windowOf(clientId).band === 'fechada';
  const rescheduleTitle = MESSAGE_TEMPLATES.find((t) => t.name === RESCHEDULE_TEMPLATE)?.title ?? 'Remarcar horário';

  const sendReady = () => {
    const r = sendTeamMessage(clientId, clientName, message);
    if (!r.ok) {
      toast({ title: 'Mensagem não enviada', description: notSentText(r.reason), tone: 'error' });
      return;
    }
    setSent(true);
  };
  const toggle = () => {
    ensureConversation(clientId, clientName);
    const now = conversations.find((x) => x.id === clientId);
    patchConversation(clientId, { handler: now?.handler === 'voce' ? 'ia' : 'voce' });
  };
  const notified = (variant: 'primary' | 'secondary') =>
  <Button
    size="md"
    variant={variant}
    onClick={() => {
      onNotified();
      onClose();
    }}>
    
      Marcar como avisado
    </Button>;


  const notice = sent ?
  <Alert variant="success" compact title={`Mensagem enviada para ${first}`} actions={notified('primary')}>
      Marque como avisado para o caso sair de “Falta avisar”. Se {first} pedir outro horário, remarque pela Agenda.
    </Alert> :
  closed ?
  <Alert variant="warning" compact title="Por aqui só sai mensagem aprovada" actions={notified('secondary')}>
      Conversa parada há mais de 24 horas: a mensagem aprovada “{rescheduleTitle}” já abre preenchida em “Enviar mensagem aprovada”.{' '}
      <span className="inline-flex align-middle">
        <InfoTip label="outro jeito de avisar" content={`Se preferir, ligue para ${first}. Depois de avisar, marque como avisado para o caso sair de “Falta avisar”.`} />
      </span>
    </Alert> :

  <Alert
    variant="info"
    compact
    title={`Mensagem pronta para ${first}`}
    actions={
    <Button size="md" onClick={sendReady}>
          Enviar a mensagem
        </Button>
    }>
    
      “{message}” <KeepsConversation tipLabel="como mudar o texto" tip="Para mudar o texto, escreva a sua mensagem na caixa de baixo." />
    </Alert>;


  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-surface p-3">{notice}</div>
      <div className="min-h-0 flex-1">
        <ConversationThread
          conversation={conv}
          summary={summary}
          messages={messages}
          onBack={onClose}
          hideBack
          hideReadyMessage
          changeNotice
          onToggleHandler={toggle}
          onSend={(text) => {
            const r = sendTeamMessage(clientId, clientName, text);
            if (r.ok) setSent(true);
          }}
          headerActions={
          <Button size="md" variant="neutral" onClick={() => navigate(conversationLink(clientId))}>
              Abrir em Conversas
            </Button>
          } />
        
      </div>
    </div>);

}

export function ChangeNoticePanel({ target, onClose, onNotified }: {target: ChangeChatTarget | null;onClose: () => void;onNotified: () => void;}) {
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      placement="side"
      title={target?.clientName ?? ''}
      description={target ? `Avisar a mudança: ${target.what}` : undefined}
      columns={target ? [{ id: 'conversa', label: 'Conversa', flush: true, content: <ChangeThread key={`${target.clientId}-${target.what}`} target={target} onClose={onClose} onNotified={onNotified} /> }] : undefined} />);


}