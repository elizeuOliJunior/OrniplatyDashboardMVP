import React, { useRef, useState } from 'react';
import { CalendarDaysIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button, IconButton, SegmentedControl } from '../Card';
import { PickerPopover } from '../ui/PickerPopover';
import { smallButton, smallButtonNeutral } from '../ui/styles';
import { TODAY_ISO } from '../../data/agendaStore';
import { clinicDay, useTeam } from '../../data/availability';
import { useBusinessWords } from '../../data/empresa';

export type AgendaView = 'dia' | 'semana' | 'mes';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
};

/** Moves an ISO date by whole months, clamping the day (31/01 + 1 month = 28/02). */
export function addMonthsIso(iso: string, months: number) {
  const { y, m, d } = parse(iso);
  const total = y * 12 + m + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return toIso(ny, nm, Math.min(d, last));
}

/** Moves an ISO date by whole days. */
export function addDaysIso(iso: string, n: number) {
  const { y, m, d } = parse(iso);
  const t = new Date(Date.UTC(y, m, d + n));
  return toIso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(iso: string) {
  const { y, m, d } = parse(iso);
  return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
}

/**
 * @deprecated A Agenda mostra os 7 dias; fim de semana não é mais empurrado para segunda.
 * Mantido só para leitores antigos: devolve a própria data.
 */
export function toWeekday(iso: string) {
  return iso;
}

/** Position of a date in the sample calendar: week offset (0 = week of 28/09/2026) and weekday index (0 = Monday ... 6 = Sunday). */
export function locateIso(iso: string) {
  const { y, m, d } = parse(iso);
  const days = Math.round((Date.UTC(y, m, d) - Date.UTC(2026, 8, 28)) / 86400000);
  const week = Math.floor(days / 7);
  return { week, index: days - week * 7 };
}

export function monthLabel(iso: string) {
  const { y, m } = parse(iso);
  return `${MONTHS[m].charAt(0).toUpperCase()}${MONTHS[m].slice(1)} de ${y}`;
}

function mondayOf(iso: string) {
  return addDaysIso(iso, -weekdayIndex(iso));
}

type Props = {
  view: AgendaView;
  onViewChange: (v: AgendaView) => void;
  /** Text shown on the date button (day, week range or month) */
  periodLabel: string;
  /** Date currently on screen (the day in Dia, any day of the week in Semana, any day of the month in Mês) */
  currentIso: string;
  atToday: boolean;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Called with the chosen day; the page decides how each view reacts */
  onPickDate: (iso: string) => void;
};

const UNIT: Record<AgendaView, {prev: string;next: string;}> = {
  dia: { prev: 'Dia anterior', next: 'Próximo dia' },
  semana: { prev: 'Semana anterior', next: 'Próxima semana' },
  mes: { prev: 'Mês anterior', next: 'Próximo mês' }
};

/**
 * L18, 2ª rodada (17/11/2026): Dia · Semana · Mês saiu da linha da data e foi para a linha "como ver" da barra
 * (`AgendaToolbar`). Mesma peça do DS (`SegmentedControl`, 32 px), mesmo texto e mesmo comportamento.
 */
export function AgendaViewSwitch({ view, onViewChange }: {view: AgendaView;onViewChange: (v: AgendaView) => void;}) {
  return (
    <SegmentedControl
      label="Visualização da agenda"
      value={view}
      onChange={(v) => onViewChange(v as AgendaView)}
      options={[
      { value: 'dia', label: 'Dia' },
      { value: 'semana', label: 'Semana' },
      { value: 'mes', label: 'Mês' }]
      } />);


}

/**
 * Barra compacta, igual nas três visualizações: Hoje, anterior/próximo e a data, que é um botão com ícone e seta e abre
 * um calendário (dia, mês e ano). L18, 2ª rodada: "Hoje" vem antes das setas (padrão de agenda: voltar a hoje, andar,
 * ver a data); Dia/Semana/Mês está em `AgendaViewSwitch`.
 * O calendário permite escolher QUALQUER data (fim de semana, feriado, dia fechado): dias sem atendimento só
 * aparecem destacados. Todos os controles têm largura FIXA (igual em Dia, Semana e Mês), para trocar de visualização
 * não deslocar nada; o botão da data tem largura para o rótulo mais longo ("Semana de 28/09 a 04/10").
 */
export function AgendaDateNav({ view, periodLabel, currentIso, atToday, onToday, onPrev, onNext, onPickDate }: Props) {
  useTeam();
  const w = useBusinessWords();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'dias' | 'meses'>('dias');
  const base = parse(currentIso);
  const [cursor, setCursor] = useState({ y: base.y, m: base.m });

  const openPicker = () => {
    if (!open) {
      const b = parse(currentIso);
      setCursor({ y: b.y, m: b.m });
      setMode('dias');
    }
    setOpen((o) => !o);
  };
  const shiftMonth = (step: number) =>
  setCursor((v) => {
    const t = v.y * 12 + v.m + step;
    return { y: Math.floor(t / 12), m: (t % 12 + 12) % 12 };
  });
  const pick = (iso: string) => {
    onPickDate(iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const weekStart = mondayOf(currentIso);
  const weekDays = new Set(Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)));
  const firstWeekday = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const popWidth = typeof window !== 'undefined' ? Math.min(304, window.innerWidth - 24) : 304;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Design system: "Hoje" = Button md (36px, como a data e as setas). */}
      <Button type="button" size="md" variant={atToday ? 'neutral' : 'secondary'} onClick={onToday} aria-pressed={atToday} aria-label="Ir para hoje" className="shrink-0">
        Hoje
      </Button>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton size="md" aria-label={UNIT[view].prev} onClick={onPrev} className="border border-border-strong bg-white" icon={<ChevronLeftIcon className="h-4 w-4" />} />
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${periodLabel}. Escolher data no calendário`}
          onClick={openPicker}
          className={`flex h-9 w-60 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-button border bg-white px-2.5 text-sm font-bold tabular-nums text-text-primary shadow-sm transition-colors hover:border-primary hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${open ? 'border-primary bg-active-surface' : 'border-border-strong'}`}>
          
          <CalendarDaysIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 truncate whitespace-nowrap text-center" aria-live="polite">
            {periodLabel}
          </span>
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        <IconButton size="md" aria-label={UNIT[view].next} onClick={onNext} className="border border-border-strong bg-white" icon={<ChevronRightIcon className="h-4 w-4" />} />
      </div>

      <PickerPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} width={popWidth} label="Escolher data da agenda">
        <div className="flex items-center justify-between gap-1 px-1 pb-2">
          <IconButton size="sm" aria-label={mode === 'dias' ? 'Mês anterior' : 'Ano anterior'} onClick={() => mode === 'dias' ? shiftMonth(-1) : setCursor((v) => ({ ...v, y: v.y - 1 }))} icon={<ChevronLeftIcon className="h-4 w-4" />} />
          <button
            type="button"
            onClick={() => setMode((m) => m === 'dias' ? 'meses' : 'dias')}
            aria-label={mode === 'dias' ? 'Escolher mês e ano' : 'Voltar para os dias'}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold text-text-primary hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            
            {mode === 'dias' ? `${MONTHS[cursor.m].charAt(0).toUpperCase()}${MONTHS[cursor.m].slice(1)} de ${cursor.y}` : cursor.y}
            <ChevronDownIcon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          </button>
          <IconButton size="sm" aria-label={mode === 'dias' ? 'Próximo mês' : 'Próximo ano'} onClick={() => mode === 'dias' ? shiftMonth(1) : setCursor((v) => ({ ...v, y: v.y + 1 }))} icon={<ChevronRightIcon className="h-4 w-4" />} />
        </div>

        {mode === 'meses' ?
        <div className="grid grid-cols-3 gap-1.5">
            {MONTHS_SHORT.map((label, m) => {
            const current = cursor.y === base.y && m === base.m;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={current}
                onClick={() => {
                  setCursor({ y: cursor.y, m });
                  setMode('dias');
                }}
                className={`h-10 rounded-lg text-sm font-semibold capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${current ? 'bg-primary text-white' : 'text-text-primary hover:bg-primary-soft'}`}>
                
                  {label}
                </button>);

          })}
          </div> :

        <div className="grid grid-cols-7 gap-1 text-center" role="grid">
            {WEEKDAYS.map((w, i) =>
          <span key={i} className="pb-1 text-xs font-semibold text-text-muted" aria-hidden="true">
                {w}
              </span>
          )}
            {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const iso = toIso(cursor.y, cursor.m, d);
            const dow = new Date(Date.UTC(cursor.y, cursor.m, d)).getUTCDay();
            // Dia sem atendimento: só destacado (sublinhado tracejado + rótulo). Continua selecionável.
            const closed = !clinicDay(iso).open;
            const selected = view === 'semana' ? weekDays.has(iso) : iso === currentIso;
            const today = iso === TODAY_ISO;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={selected}
                aria-label={`${WEEKDAY_NAMES[dow]}, ${d} de ${MONTHS[cursor.m]} de ${cursor.y}${today ? ' (hoje)' : ''}${closed ? ` (${w.noun} ${w.closed})` : ''}`}
                title={closed ? `${w.Noun} ${w.closed} nesta data` : undefined}
                onClick={() => pick(iso)}
                className={`flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected ?
                view !== 'semana' ?
                'bg-primary font-bold text-white' :
                'bg-primary-soft font-bold text-primary hover:bg-primary-soft' :
                today ?
                'font-bold text-primary ring-1 ring-inset ring-primary hover:bg-primary-soft' :
                closed ?
                'text-text-secondary underline decoration-dotted underline-offset-4 hover:bg-background' :
                'text-text-primary hover:bg-primary-soft'}`
                }>
                
                  {d}
                </button>);

          })}
          </div>
        }

        <p className="mt-2 px-1 text-xs text-text-secondary">Datas sublinhadas: {w.noun} {w.closed}. Elas podem ser abertas para consultar agendamentos.</p>

        <div className="mt-2 border-t border-border px-1 pt-2">
          <p className="mb-1.5 text-xs font-semibold text-text-muted">Ir para daqui a</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 3, 6, 12].map((n) =>
            <button key={n} type="button" onClick={() => pick(addMonthsIso(currentIso, n))} className={`${smallButtonNeutral} !px-1`}>
                {n === 12 ? '1 ano' : n === 1 ? '1 mês' : `${n} meses`}
              </button>
            )}
            <button type="button" onClick={() => pick(TODAY_ISO)} className={`${smallButton} col-span-4`}>
              Hoje
            </button>
          </div>
        </div>
      </PickerPopover>
    </div>);

}