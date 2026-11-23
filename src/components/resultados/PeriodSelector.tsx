import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { PillGroup } from '../Pill';
import { Select } from '../Select';
import { DateField } from '../ui/DateField';
import { IconButton } from '../Card';
import { resultadosMonthOptions } from '../../data/resultados';
import { PERIOD_MODES, addDaysIso, monthRangeOf, rangeFor, rangeLabel, validateRange, weekRangeOf } from '../../data/receiptsPeriod';
import type { DateRange, PeriodMode } from '../../data/receiptsPeriod';

type PeriodSelectorProps = {
  mode: PeriodMode;
  onModeChange: (m: PeriodMode) => void;
  anchor: string;
  onAnchorChange: (iso: string) => void;
  custom: DateRange;
  onCustomChange: (r: DateRange) => void;
};

function StepButton({ dir, onClick, label }: {dir: 'prev' | 'next';onClick: () => void;label: string;}) {
  return (
    <IconButton size="md" aria-label={label} onClick={onClick} icon={dir === 'prev' ? <ChevronLeftIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />} />);

}

/** Período único da tela: o que for escolhido aqui vale para todos os números abaixo. */
export function PeriodSelector({ mode, onModeChange, anchor, onAnchorChange, custom, onCustomChange }: PeriodSelectorProps) {
  const range = rangeFor(mode, anchor, custom);
  const error = mode === 'personalizado' ? validateRange(custom) : undefined;
  const month = anchor.slice(0, 7);

  const changeMode = (next: PeriodMode) => {
    if (next === 'personalizado' && mode !== 'personalizado') onCustomChange(rangeFor(mode, anchor, custom));
    onModeChange(next);
  };

  return (
    <section aria-label="Período" className="flex flex-col gap-3 rounded-inner border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <PillGroup
          label="Período"
          size="sm"
          options={PERIOD_MODES}
          value={mode}
          onChange={(v) => typeof v === 'string' && changeMode(v as PeriodMode)} />
        

        {mode === 'dia' &&
        <div className="flex items-end gap-2">
            <StepButton dir="prev" label="Dia anterior" onClick={() => onAnchorChange(addDaysIso(anchor, -1))} />
            <DateField label="Dia" value={anchor} onChange={(v) => v && onAnchorChange(v)} className="w-44" />
            <StepButton dir="next" label="Próximo dia" onClick={() => onAnchorChange(addDaysIso(anchor, 1))} />
          </div>
        }

        {mode === 'semana' &&
        <div className="flex items-center gap-2">
            <StepButton dir="prev" label="Semana anterior" onClick={() => onAnchorChange(addDaysIso(weekRangeOf(anchor).from, -7))} />
            <span className="min-w-[11rem] text-center text-sm font-semibold text-text-primary">Semana de {rangeLabel(weekRangeOf(anchor))}</span>
            <StepButton dir="next" label="Próxima semana" onClick={() => onAnchorChange(addDaysIso(weekRangeOf(anchor).from, 7))} />
          </div>
        }

        {mode === 'mes' && (
        /* 40 px (padrão dos controles md, igual aos botões ao lado) com nome acessível "Mês"; o foco e a lista seguem iguais. */
        <Select
          ariaLabel="Mês"
          value={month}
          onChange={(v: string) => onAnchorChange(monthRangeOf(`${v}-01`).from)}
          options={resultadosMonthOptions}
          className="w-52 [&_button]:min-h-[40px]" />)

        }

        {mode === 'personalizado' &&
        <div className="flex flex-wrap items-end gap-3">
            <DateField label="De" value={custom.from} onChange={(v) => onCustomChange({ ...custom, from: v })} className="w-44" />
            <DateField label="Até" value={custom.to} onChange={(v) => onCustomChange({ ...custom, to: v })} className="w-44" />
          </div>
        }
      </div>

      {error ?
      <p role="alert" className="text-sm font-semibold text-error">
          {error} Os números abaixo mostram o último período válido.
        </p> :

      <p className="text-sm text-text-secondary">
          Mostrando <strong className="text-text-primary">{rangeLabel(range)}</strong>. O mesmo período vale para os cartões, o gráfico, os serviços e os convênios.
        </p>
      }
    </section>);

}