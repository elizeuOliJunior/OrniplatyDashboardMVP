import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { StatusBadge, clickableCardClass, clickableRowClass, clickableChevronClass } from '../Card';
import { Button } from '../Button';
import type { ButtonSize } from '../Button';
import type { Notice, Tone } from '../../data/settingsStore';

/**
 * Peças de composição de Configurações, feitas SÓ com peças do design system (sem estilo próprio):
 * - StateRow = `clickableRowClass` + `StatusBadge` + seta (`clickableChevronClass`), como "Atendimentos de hoje" no Início.
 * - NoticeActionButton = `Button` do design system; "Conectar com o Facebook" é a única exceção de cor (token `facebook`).
 */
export function StateRow({
  label,
  badge,
  summary,
  onClick,
  ariaLabel,
  card = false,
  icon










}: {label: string;badge: {tone: Tone;label: string;};summary: string;onClick: () => void;ariaLabel?: string; /** DS v3.14: linha que pede ação = cartão com borda (`clickableCardClass`); em dia = linha com divisória. */card?: boolean; /** L11: `StatusIcon` de 20px antes do nome (DS v3.14, lista de itens prontos e pendentes). */icon?: React.ReactNode;}) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel ?? `${label}: ${badge.label}. ${summary}. Abrir`} className={`${card ? clickableCardClass : clickableRowClass} flex-wrap`}>
      {icon ?
      <span className="flex w-full items-center gap-2 sm:w-40 sm:shrink-0">
          <span className="shrink-0" aria-hidden="true">{icon}</span>
          <span className="text-sm font-bold text-text-primary">{label}</span>
        </span> :

      <span className="w-full text-sm font-bold text-text-primary sm:w-40 sm:shrink-0">{label}</span>
      }
      <StatusBadge status={badge.tone} label={badge.label} />
      <span className="min-w-0 flex-1 basis-40 text-sm text-text-secondary">{summary}</span>
      <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
    </button>);

}

/** Linha que leva a outra tela (atalhos e "Resolva rápido"). */
export function LinkRow({ label, hint, onClick }: {label: string;hint?: string;onClick: () => void;}) {
  return (
    <button type="button" onClick={onClick} className={clickableRowClass}>
      <span className="min-w-0 flex-1 basis-48 text-sm font-semibold text-text-primary">{label}</span>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
      <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
    </button>);

}

export const facebookButtonClass = 'bg-facebook text-white hover:bg-facebook hover:brightness-95 active:brightness-90 focus-visible:ring-facebook';

export function NoticeActionButton({ action, onClick, size = 'md', fullWidthMobile = true }: {action: NonNullable<Notice['action']>;onClick: () => void;size?: ButtonSize;fullWidthMobile?: boolean;}) {
  const mobile = fullWidthMobile ? 'w-full sm:w-auto' : '';
  if (action.kind === 'facebook')
  return (
    <Button size={size} onClick={onClick} className={`${facebookButtonClass} ${mobile}`}>
        {action.label}
      </Button>);

  return (
    <Button size={size} variant={action.kind === 'neutral' ? 'neutral' : 'primary'} onClick={onClick} className={mobile}>
      {action.label}
    </Button>);

}