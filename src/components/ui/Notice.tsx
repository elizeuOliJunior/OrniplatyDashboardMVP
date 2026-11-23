import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import * as DesignSystem from '../Card';
import { Alert, ConflictNotice as DsConflictNotice, StatusIcon, clickableRowClass, clickableGroupCardClass, clickableChevronClass, groupActionHoverClass as dsGroupActionHoverClass } from '../Card';
import type { ConflictItem as DsConflictItem } from '../Card';
import { StatusPill } from './StatusPill';
import type { PillTone } from './StatusPill';

/**
 * PADRÃO ÚNICO DE AVISOS = `Alert` do design system ORNIPLATY (v2.1) (decisão do Christian, 16/10/2026).
 * Este arquivo só adapta os nomes antigos do Painel às peças do design system:
 *  - Cartão BRANCO com borda; nunca caixa com fundo colorido.
 *  - A cor do tipo fica só no ícone redondo preenchido (`StatusIcon`), tamanho ÚNICO de 28px em todos os avisos.
 *    O ícone é sempre o de status (✓ ! ✕ i): ícones próprios passados em `icon` são ignorados.
 *  - Botões sempre preenchidos (`Button`). Aviso que leva a outra tela = cartão inteiro clicável com o hover único.
 *  - `NoticeBanner` (aviso de página), `NoticeInline` (dentro de cartão, formulário ou janela), `ConflictNotice`.
 *
 * HOVER ÚNICO DE CLICÁVEIS (design system): borda verde-azulada, fundo #F8FAFA (sem verde), seta que anda; clique #F1F5F5.
 */
export const interactiveRowClass = clickableRowClass;

/** Para o `Card` do design system dentro de um link com `group`. */
export const interactiveCardClass = clickableGroupCardClass;

/** Seta das linhas e cartões clicáveis. */
export const interactiveChevronClass = clickableChevronClass;

/** Botão "de enfeite" dentro de um cartão clicável: escurece junto quando o mouse passa no cartão. */
export const groupActionHoverClass = dsGroupActionHoverClass;

export type NoticeTone = 'warning' | 'error' | 'info' | 'success';

/** Ícone de status do design system (círculo preenchido + símbolo branco), 28px. `size` e `children` ficam só por compatibilidade. */
export function NoticeIcon({ tone }: {tone: NoticeTone;children?: React.ReactNode;size?: 'sm' | 'md';}) {
  return <StatusIcon tone={tone} />;
}

/**
 * Ícone de NOTIFICAÇÕES = `NotificationIcon` do design system (v2.5, 19/10/2026): sino branco em círculo
 * verde-azulado, 28px, sempre a mesma cor (a gravidade fica nas etiquetas). Repasse puro. Enquanto o Painel
 * estiver numa versão do design system anterior à 2.5 (antes do "Update" no editor), cai no `StatusIcon` info.
 */
export function NotificationIcon() {
  const DsNotificationIcon = (DesignSystem as unknown as {NotificationIcon?: React.ComponentType;}).NotificationIcon;
  return DsNotificationIcon ? <DsNotificationIcon /> : <StatusIcon tone="info" />;
}

/** Aviso de página. Com `to`, o cartão INTEIRO vira link; a `action` deve ser só visual (`<span>` com `groupActionHoverClass`). */
export function NoticeBanner({
  tone,
  title,
  description,
  action,
  to,
  ariaLabel,
  role = 'status',
  className = ''










}: {tone: NoticeTone;icon?: React.ReactNode;title: React.ReactNode;description?: React.ReactNode;action?: React.ReactNode;to?: string;ariaLabel?: string;role?: 'status' | 'alert';className?: string;}) {
  return (
    <Alert variant={tone} title={title} actions={action} to={to} openLabel={ariaLabel} role={role} className={className}>
      {description}
    </Alert>);

}

/** Aviso dentro de cartão, formulário ou janela (versão compacta do `Alert`, mesmo ícone). */
export function NoticeInline({
  tone,
  title,
  children,
  role = 'note',
  className = ''







}: {tone: NoticeTone;icon?: React.ReactNode;title?: React.ReactNode;children?: React.ReactNode;role?: 'note' | 'status' | 'alert';className?: string;}) {
  return (
    <Alert variant={tone} title={title} compact role={role} className={className}>
      {children}
    </Alert>);

}

export type ConflictItem = DsConflictItem;

/** Agendamentos em conflito = `ConflictNotice` do design system. Nada é cancelado nem movido. */
export function ConflictNotice(props: {title: string;items: ConflictItem[];footnote?: string;ack?: boolean;onAck?: (v: boolean) => void;max?: number;className?: string;}) {
  return <DsConflictNotice {...props} />;
}

/**
 * Linha clicável de um item que pede atenção (fechamento pendente, conflito…). Mesmo desenho das linhas de
 * "Atendimentos de hoje": horário à esquerda, nome e detalhe, etiqueta de status e seta; a linha inteira abre o item.
 */
export function AttentionRow({
  time,
  date,
  title,
  meta,
  dotColor,
  tone,
  status,
  onClick,
  ariaLabel










}: {time: string;date?: string;title: string;meta: React.ReactNode;dotColor?: string;tone: PillTone;status: string;onClick: () => void;ariaLabel: string;}) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={interactiveRowClass}>
      <span className="w-12 shrink-0">
        <span className="block text-sm font-bold tabular-nums text-text-primary">{time}</span>
        {date && <span className="block text-xs text-text-muted">{date}</span>}
      </span>
      <span className="min-w-0 flex-1 basis-40">
        <span className="block truncate text-sm font-bold text-text-primary">{title}</span>
        <span className="flex items-start gap-1.5 text-sm text-text-secondary">
          {dotColor && <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden="true" />}
          <span className="min-w-0">{meta}</span>
        </span>
      </span>
      <StatusPill tone={tone} label={status} />
      <ChevronRightIcon className={interactiveChevronClass} aria-hidden="true" />
    </button>);

}