import { twMerge } from 'tailwind-merge';
import React, { useRef, useState } from 'react';
import { ChevronDownIcon, MoreHorizontalIcon } from 'lucide-react';
import { PickerPopover } from './PickerPopover';
import { actionClass } from './actionStyles';
import type { ActionSize, ActionVariant } from './actionStyles';

export type ActionMenuItem = {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  /** Vermelho: ação destrutiva (sempre separada das demais por uma linha) */
  danger?: boolean;
  onSelect: () => void;
};

/**
 * Menu "Mais ações". Ações destrutivas ficam no fim, em vermelho.
 * Gatilho (20/10/2026): `Button` do design system (preenchido, via `actionClass`), com o tamanho da área (`size`).
 * `iconOnly` = só o ícone ⋯ (nome acessível em `label`); senão, rótulo + seta (ex.: "Adiar ▾").
 */
export function ActionMenu({
  label = 'Mais ações',
  items,
  variant = 'neutral',
  size = 'lg',
  iconOnly = false,
  icon








}: {label?: string;items: ActionMenuItem[];variant?: ActionVariant;size?: ActionSize;iconOnly?: boolean; /** Ícone à esquerda do rótulo (padrão: ⋯ só quando `iconOnly`). */icon?: React.ReactNode;}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const safe = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);

  const row = (i: ActionMenuItem) =>
  <button
    key={i.key}
    type="button"
    role="menuitem"
    onClick={() => {
      setOpen(false);
      i.onSelect();
    }}
    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset ${
    i.danger ? 'text-error hover:bg-error-background focus-visible:ring-error' : 'text-text-primary hover:bg-background focus-visible:ring-primary'}`
    }>
    
      {i.icon && <span className="mt-0.5 shrink-0" aria-hidden="true">{i.icon}</span>}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{i.label}</span>
        {i.description && <span className={`block text-xs font-normal ${i.danger ? 'text-error' : 'text-text-secondary'}`}>{i.description}</span>}
      </span>
    </button>;


  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => setOpen((o) => !o)}
        className={twMerge(actionClass(variant, size), iconOnly && 'aspect-square px-0')}>
        
        {iconOnly ?
        <MoreHorizontalIcon className="h-4 w-4" aria-hidden="true" /> :

        <>
            {icon}
            {label}
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </>
        }
      </button>
      <PickerPopover open={open} anchorRef={ref} onClose={() => setOpen(false)} width={288} label={label}>
        <div role="menu" aria-label={label} className="flex flex-col gap-0.5">
          {safe.map(row)}
          {danger.length > 0 && safe.length > 0 && <div className="my-1 border-t border-border" role="separator" />}
          {danger.map(row)}
        </div>
      </PickerPopover>
    </>);

}