import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { clickableHoverClass, clickableChevronClass } from '../Card';

/**
 * Linha de informação que leva a algum lugar (agendamento, pacote, profissional…).
 * Borda e fundo discretos, hover e foco claros, linha inteira clicável e acessível pelo teclado.
 * Informação estática NÃO usa este estilo.
 */
export const clickableRowClass = `group flex w-full cursor-pointer items-center gap-2 rounded-button border border-border bg-white px-3 py-2 text-left ${clickableHoverClass}`;

type ClickableRowProps = {
  label: string;
  value: string;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
};

export function ClickableRow({ label, value, onClick, ariaLabel, className = '' }: ClickableRowProps) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel ?? `${label}: ${value}. Ver detalhes`} className={`${clickableRowClass} ${className}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-text-muted">{label}</span>
        <span className="mt-0.5 block text-sm font-semibold text-text-primary">{value}</span>
      </span>
      <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
    </button>);

}