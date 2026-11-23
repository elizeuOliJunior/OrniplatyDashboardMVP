import { wordsNow } from '../../data/segment';
import React from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, CornerDownLeftIcon, InfoIcon, LockIcon, MessageSquareTextIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { Avatar, ContextPanel, ContextSection, InfoTip } from '../Card';
import { WhatsAppBadge } from '../ui/WhatsAppIcon';
import { byLongestWait, conversations, inQueue, waitMinutes } from '../../data/conversas';
import { useConversations } from '../../data/conversasThreads';
import { agoLabel, replyWindow } from '../../data/replyWindow';
import { whatsappConnection } from '../../data/configuracoes';
import { useSettings, waKey } from '../../data/settingsStore';
import { assistantStopNotice } from '../../data/assistantStopNotice';

/*
 * T1 1n (05/11/2026, Christian, referência Tend "Pick a conversation"): ao abrir Conversas SEM uma conversa escolhida,
 * o centro explica o que acontece antes de responder, e a coluna da direita mostra quem está esperando a equipe.
 * - `NoConversationSelected`: centro. Abaixo da explicação, a lista de quem espera aparece AQUI quando a coluna da direita
 *   não cabe (`showWaiting`).
 * - `WaitingPanel`: coluna da direita (mesma largura da ficha resumida).
 * Teclas: ↑ ↓ andam pela lista de conversas e Enter abre (a lista já fazia isso; Conversas leva o foco para ela).
 * T1 1p (05/11, Christian): a logo do WhatsApp segue o padrão de Configurações › WhatsApp: o mesmo `WhatsAppBadge`
 * (círculo verde do WhatsApp com a logo branca; cinza quando a conexão não está em dia), mesmo tamanho (48 px).
 * Só tokens do DS (cores e cantos) e peças já existentes (Avatar, ContextPanel/ContextSection, WhatsAppBadge).
 * W4 (11/11/2026, G5 e G7): textos com a regra única (15 minutos sem resposta da assistente; 2 horas sem ação da equipe).
 * L6 (16/11/2026, só visual): "Escolha uma conversa" com UMA frase (o resto no "i"). Com a assistente parada (inclusive
 * WhatsApp desconectado), a frase é a mesma frase curta do aviso do topo, e não diz que as respostas saem pelo WhatsApp.
 * Os dois avisos da coluna da direita ficam com uma frase cada e o resto no "i".
 */

const waitTone = (mins: number) => mins >= 60 ? 'text-error' : mins >= 15 ? 'text-warning' : 'text-text-secondary';

function useWaitingData() {
  useConversations();
  const waiting = conversations.filter(inQueue).sort(byLongestWait);
  const closed = conversations.filter((c) => replyWindow(c.lastInboundAt, c.windowClosed).band === 'fechada').length;
  return { waiting, closed };
}

function WaitingList({ onSelect }: {onSelect: (id: string) => void;}) {
  const { waiting } = useWaitingData();
  if (waiting.length === 0) return <p className="text-sm text-text-secondary">Ninguém esperando por você agora.</p>;
  return (
    <ul className="-mx-2 flex flex-col" aria-label="Conversas aguardando você">
      {waiting.map((c) => {
        const mins = waitMinutes(c);
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              
              <Avatar name={c.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text-primary">{c.name}</span>
                <span className={twMerge('block text-xs font-semibold', waitTone(mins))}>Esperando {agoLabel(mins)}</span>
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </li>);

      })}
    </ul>);

}

function NoteCard({ icon, children }: {icon: React.ReactNode;children: React.ReactNode;}) {
  return (
    <div className="flex gap-3 rounded-inner border border-border bg-surface-muted px-3.5 py-3 text-sm leading-5 text-text-secondary [&>svg]:mt-0.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-text-muted">
      {icon}
      <p>{children}</p>
    </div>);

}

const Tip = ({ label, content }: {label: string;content: React.ReactNode;}) =>
<span className="ml-1 inline-flex align-middle">
    <InfoTip label={label} content={content} />
  </span>;


function Notes() {
  const { closed } = useWaitingData();
  return (
    <>
      {closed > 0 &&
      <NoteCard icon={<LockIcon aria-hidden="true" />}>
          <strong className="font-semibold text-text-primary">
            {closed} {closed === 1 ? 'conversa passou' : 'conversas passaram'}
          </strong>{' '}
          das 24 h sem mensagem do cliente.
          <Tip label="as conversas paradas há mais de 24 h" content="Nelas, só sai mensagem aprovada até o cliente responder." />
        </NoteCard>
      }
      <NoteCard icon={<InfoIcon aria-hidden="true" />}>
        Quando a assistente precisa de você, a conversa entra em “Aguardando você”.
        <Tip label="Aguardando você" content="Quando a assistente não sabe responder ou não responde em 15 minutos, a conversa entra em “Aguardando você”." />
      </NoteCard>
    </>);

}

/** Coluna da direita quando nenhuma conversa está aberta. */
export function WaitingPanel({ onSelect }: {onSelect: (id: string) => void;}) {
  return (
    <ContextPanel label="Aguardando você">
      <ContextSection title="Aguardando você">
        <WaitingList onSelect={onSelect} />
      </ContextSection>
      <ContextSection>
        <Notes />
      </ContextSection>
    </ContextPanel>);

}

function Key({ children, label }: {children: React.ReactNode;label: string;}) {
  return (
    <kbd aria-label={label} className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-xs border border-border bg-surface px-1.5 font-sans text-xs text-text-secondary shadow-xs [&>svg]:h-3.5 [&>svg]:w-3.5">
      {children}
    </kbd>);

}

/** Centro de Conversas quando nenhuma conversa está aberta. */
export function NoConversationSelected({ showWaiting, onSelect }: {showWaiting: boolean;onSelect: (id: string) => void;}) {
  const s = useSettings();
  const key = waKey(s);
  const connected = s.wa.status === 'connected' && key !== 'vencida' && key !== 'cancelada';
  // L6: com a assistente parada (limite do mês ou WhatsApp sem funcionar), a mesma frase curta do aviso do topo.
  const stop = assistantStopNotice(s);
  return (
    <div className="orni-chat-bg flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="m-auto flex w-full max-w-[460px] flex-col items-center px-6 py-10 text-center">
        <WhatsAppBadge connected={connected} />
        <h2 className="mt-5 text-xl font-bold text-text-primary">Escolha uma conversa</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {stop ?
          stop.short :

          <>
              As respostas saem pelo WhatsApp {wordsNow().of}, {whatsappConnection.number}.
              <Tip
              label="como funciona a caixa de entrada"
              content="Toda a equipe vê a mesma caixa de entrada. Quando alguém da equipe responde, a conversa fica com a equipe até ser devolvida para a assistente; depois de 2 horas sem resposta da equipe, ela volta sozinha." />
            
            </>
          }
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Key label="Seta para cima">
              <ArrowUpIcon aria-hidden="true" />
            </Key>
            <Key label="Seta para baixo">
              <ArrowDownIcon aria-hidden="true" />
            </Key>
            andam pela lista
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Key label="Enter">
              <CornerDownLeftIcon aria-hidden="true" />
            </Key>
            abre a conversa
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Key label="Botão de mensagens aprovadas">
              <MessageSquareTextIcon aria-hidden="true" />
            </Key>
            mensagens aprovadas
          </span>
        </div>
        {showWaiting &&
        <div className="mt-8 w-full text-left">
            <ContextPanel label="Aguardando você">
              <ContextSection title="Aguardando você">
                <WaitingList onSelect={onSelect} />
              </ContextSection>
            </ContextPanel>
          </div>
        }
      </div>
    </div>);

}