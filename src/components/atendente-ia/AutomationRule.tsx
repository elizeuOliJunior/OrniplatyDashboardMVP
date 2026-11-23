import React from 'react';
import { Input } from '../Input';
import { Select } from '../Select';
import type { RuleSegment } from '../../data/automacoes';

type AutomationRuleProps = {
  segments: RuleSegment[];
  values: Record<string, number>;
  editable?: boolean;
  onValueChange?: (id: string, value: number) => void;
  /** G1 (F-055): erro de cada campo (mínimo), mostrado no próprio campo depois de tentar salvar. */
  errors?: Record<string, string>;
};

/** Frase da regra. Editável: números viram campos do design system (Input; Select quando há opções fixas). */
export function AutomationRule({ segments, values, editable = false, onValueChange, errors = {} }: AutomationRuleProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm ${editable ? 'text-text-primary' : 'text-text-secondary'}`}>
      {segments.map((segment, i) => {
        if (typeof segment === 'string') {
          const isPunctuation = /^[,.;]$/.test(segment);
          return (
            <span key={i} className={isPunctuation ? '-ml-1.5' : undefined}>
              {segment}
            </span>);

        }
        const value = values[segment.id] ?? segment.value;
        if (!editable) {
          return (
            <span key={segment.id} className="font-bold tabular-nums text-text-primary">
              {value}
            </span>);

        }
        if (segment.options) {
          return (
            <span key={segment.id} className="inline-block w-24">
              <Select
                ariaLabel={segment.label}
                value={String(value)}
                onChange={(v: string) => onValueChange?.(segment.id, Number(v))}
                options={segment.options.map((o) => ({ value: String(o), label: String(o) }))} />
              
            </span>);

        }
        return (
          <span key={segment.id} className={errors[segment.id] ? 'inline-block w-40' : 'inline-block w-20'}>
            <Input
              aria-label={segment.label}
              error={errors[segment.id]}
              inputMode="numeric"
              className="text-center font-bold tabular-nums"
              value={String(value)}
              onChange={(e) => onValueChange?.(segment.id, Number(e.target.value.replace(/\D/g, '').slice(0, 3) || 0))} />
            
          </span>);

      })}
    </div>);

}