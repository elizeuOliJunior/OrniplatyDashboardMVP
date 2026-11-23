import React from 'react';
import { CheckIcon } from 'lucide-react';
import { automationModes } from '../../data/automacoes';
import type { AutomationMode } from '../../data/automacoes';

type AutomationModePickerProps = {
  value: AutomationMode;
  onChange: (mode: AutomationMode) => void;
};

/** Seletor do modo de envio das campanhas (P01): Pausado, Supervisionado ou Automático, cada um com "Na prática".
 * Cartão selecionado com contorno extra por anel (16/10/2026): não muda de tamanho ao ser escolhido. Só tokens. */
export function AutomationModePicker({ value, onChange }: AutomationModePickerProps) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-text-primary">Modo de envio das campanhas</legend>
      <div role="radiogroup" aria-label="Modo de envio das campanhas" className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
        {automationModes.map((mode) => {
          const selected = mode.id === value;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(mode.id)}
              className={`relative flex flex-col items-start gap-1.5 rounded-[12px] bg-surface p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              selected ? 'border border-primary ring-1 ring-primary bg-primary-soft/40' : 'border border-border hover:border-border-strong'}`
              }>
              
              <span className="flex w-full items-center justify-between gap-2">
                <span className={`text-sm font-bold ${selected ? 'text-primary' : 'text-text-primary'}`}>{mode.label}</span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-primary text-primary-foreground' : ''}`}
                  aria-hidden="true">
                  
                  {selected && <CheckIcon className="h-3 w-3" />}
                </span>
              </span>
              <span className="text-sm text-text-secondary">{mode.description}</span>
              <span className="text-xs text-text-muted">
                <span className="font-semibold text-text-secondary">Na prática:</span> {mode.practice}
              </span>
            </button>);

        })}
      </div>
    </fieldset>);

}