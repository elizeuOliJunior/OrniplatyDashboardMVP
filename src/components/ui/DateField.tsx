import React, { useId, useRef, useState } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { FieldShell, PickerPopover, PickerTrigger } from './PickerPopover';
import { smallButton, smallButtonNeutral } from './styles';
import { IconButton } from '../Card';

/** "Today" in the prototype (sample data is built around 01/10/2026). */
const TODAY = '2026-10-01';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parse(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

/** "2026-10-01" → "01/10/2026" */
export function formatDateBR(iso: string) {
  if (!iso) return '';
  const { y, m, d } = parse(iso);
  return `${pad(d)}/${pad(m + 1)}/${y}`;
}

type DateFieldProps = {
  label?: string;
  /** ISO date "YYYY-MM-DD" or "" */
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  error?: string;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Hide "Limpar" when the field cannot be empty */
  clearable?: boolean;
  className?: string;
};

/** Date picker drawn by the dashboard itself (same look on every computer and browser). G5 P8: setas = `IconButton` do DS v3.18. */
export function DateField({
  label,
  value,
  onChange,
  required,
  error,
  helperText,
  placeholder = 'dd/mm/aaaa',
  disabled,
  clearable = false,
  className
}: DateFieldProps) {
  const id = `date-${useId()}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const base = parse(value || TODAY);
  const [view, setView] = useState({ y: base.y, m: base.m });

  const openPicker = () => {
    const b = parse(value || TODAY);
    setView({ y: b.y, m: b.m });
    setOpen((o) => !o);
  };

  const shift = (step: number) =>
  setView((v) => {
    const m = v.m + step;
    return { y: v.y + Math.floor(m / 12), m: (m % 12 + 12) % 12 };
  });

  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const message = error ?? helperText;

  return (
    <FieldShell id={id} label={label} required={required} message={message} error={Boolean(error)} className={className}>
      <PickerTrigger
        ref={triggerRef}
        id={id}
        value={formatDateBR(value)}
        placeholder={placeholder}
        icon={<CalendarIcon className="h-4 w-4" />}
        open={open}
        error={Boolean(error)}
        disabled={disabled}
        onClick={openPicker}
        describedBy={message ? `${id}-message` : undefined} />
      
      <PickerPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} width={296} label={label ? `Escolher ${label.toLowerCase()}` : 'Escolher data'}>
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <IconButton size="sm" aria-label="Mês anterior" onClick={() => shift(-1)} icon={<ChevronLeftIcon className="h-4 w-4" />} />
          <p className="text-sm font-bold text-text-primary" aria-live="polite">
            {MONTHS[view.m].charAt(0).toUpperCase() + MONTHS[view.m].slice(1)} de {view.y}
          </p>
          <IconButton size="sm" aria-label="Próximo mês" onClick={() => shift(1)} icon={<ChevronRightIcon className="h-4 w-4" />} />
        </div>

        <div className="grid grid-cols-7 gap-1 text-center" role="grid">
          {WEEKDAYS.map((w, i) =>
          <span key={i} className="pb-1 text-xs font-semibold text-text-muted" aria-hidden="true">
              {w}
            </span>
          )}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const iso = toIso(view.y, view.m, d);
            const selected = iso === value;
            const isToday = iso === TODAY;
            const weekday = new Date(Date.UTC(view.y, view.m, d)).getUTCDay();
            return (
              <button
                key={i}
                type="button"
                aria-pressed={selected}
                aria-label={`${WEEKDAY_NAMES[weekday]}, ${d} de ${MONTHS[view.m]} de ${view.y}${isToday ? ' (hoje)' : ''}`}
                onClick={() => pick(iso)}
                className={`flex h-9 items-center justify-center rounded-xs text-sm tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected ?
                'bg-primary font-bold text-white' :
                isToday ?
                'font-bold text-primary ring-1 ring-inset ring-primary hover:bg-primary-soft' :
                'text-text-primary hover:bg-primary-soft'}`
                }>
                
                {d}
              </button>);

          })}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-border px-1 pt-2">
          {clearable ?
          <button
            type="button"
            onClick={() => pick('')}
            className={smallButtonNeutral}>
            
              Limpar
            </button> :

          <span />
          }
          <button
            type="button"
            onClick={() => pick(TODAY)}
            className={smallButton}>
            
            Hoje
          </button>
        </div>
      </PickerPopover>
    </FieldShell>);

}