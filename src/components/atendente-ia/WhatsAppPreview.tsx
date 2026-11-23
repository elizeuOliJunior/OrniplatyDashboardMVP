import { businessWords } from '../../data/segment';
import React from 'react';
import { ArrowLeftIcon, MoreVerticalIcon } from 'lucide-react';
import { InfoTip } from '../Card';
import { MessageBubble, MessageThread } from '../MessageBubble';
import { Avatar } from '../Avatar';
import { useSavedStore } from '../../data/iaConfigStore';
import { empresaStore } from '../../data/empresa';

/**
 * `from`: 'ai' = assistente; 'team' = equipe da clínica; 'client' = o cliente.
 * `content` substitui `text` quando o balão precisa de conteúdo próprio. `senderName` e `contactName` ficam por
 * compatibilidade e são ignorados: na visão do cliente não existe nome em cima do balão (D3).
 */
export type PreviewMessage = {
  from: 'client' | 'ai' | 'team';
  text: string;
  time?: string;
  buttons?: string[];
  senderName?: string;
  content?: React.ReactNode;
};

export const CLIENT_VIEW_TIP = 'Assim aparece no celular do cliente. O nome no topo vem do seu perfil do WhatsApp Business.';

/** Topo da conversa como o cliente vê: Avatar + nome da clínica (sem "online"). Usado também pela demonstração de tom. */
export function ClientChatHeader({ clinicName }: {clinicName: string;}) {
  return (
    <div className="flex items-center gap-2.5 bg-sidebar-background px-3 py-2.5 text-white">
      <ArrowLeftIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <Avatar name={clinicName} aria-label={clinicName} size="sm" tone="neutral" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{clinicName}</span>
      <MoreVerticalIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
    </div>);

}

/** Título "Como o cliente vê" + "i" (Lote E, E7). */
export function ClientViewTitle({ children = 'Como o cliente vê' }: {children?: React.ReactNode;}) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
      {children}
      <InfoTip label="Como o cliente vê" content={CLIENT_VIEW_TIP} />
    </span>);

}

/**
 * Prévia de conversa no WhatsApp COMO O CLIENTE VÊ (Lote E, E7, decisão D3; DS v3.14 `MessageThread perspective="client"`):
 * topo com o nome da clínica salvo em Empresa; mensagens da clínica à esquerda, do cliente à direita; nada em cima dos balões.
 * A assistente diz o nome dela só no texto. Usada nas abas da IA Orniplaty, no exemplo de automação e na mensagem do serviço.
 * Conversas e o painel do cliente de Oportunidades NÃO usam esta prévia (tela da clínica, decisão v3.10).
 */
export function WhatsAppPreview({
  title = 'Como o cliente vê',
  clinicName,
  messages,
  caption











}: {title?: string;clinicName?: string; /** @deprecated ignorado (visão do cliente). */contactName?: string; /** @deprecated ignorado. */contactSubtitle?: string; /** @deprecated o nome da assistente aparece só no texto. */assistantName?: string;messages: PreviewMessage[];caption?: React.ReactNode;}) {
  const saved = useSavedStore(empresaStore);
  const clinic = (clinicName ?? saved.name).trim() || businessWords(saved.segment).Your;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption>
        <ClientViewTitle>{title}</ClientViewTitle>
      </figcaption>
      <div className="w-full overflow-hidden rounded-xl border border-border shadow-sm" aria-label={title}>
        <ClientChatHeader clinicName={clinic} />
        <MessageThread perspective="client" className="rounded-none p-3 pb-4">
          {messages.map((m, i) =>
          <MessageBubble key={i} sender={m.from === 'ai' ? 'lia' : m.from} timestamp={m.time ?? '09:00'} buttons={m.from === 'client' ? undefined : m.buttons}>
              {m.content ?? m.text}
            </MessageBubble>
          )}
        </MessageThread>
      </div>
      {caption && <p className="text-xs text-text-muted">{caption}</p>}
    </figure>);

}