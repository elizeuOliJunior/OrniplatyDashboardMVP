/**
 * Editor de jornada individual (7 dias, vários períodos, pausas por dia, cópia entre dias), exceções por data e
 * intervalo entre atendimentos. Arquivo IDÊNTICO no Dashboard e no Onboarding (mesma estrutura de data/schedule.ts).
 * Só usa peças do design system (Button, IconButton, Toggle, Pill, Input, Checkbox) e TimeField/DateField de cada projeto.
 * G5 P8 (27/10/2026): botões de remover = `IconButton` do DS v3.18 (md 36, tom de perigo), nos dois projetos.
 */
// v2.3: botões internos em 36px (size md); este arquivo também existe no Onboarding (cópia própria), sincronizar se mudar lá.
import React, { useId, useState } from 'react';
import { CopyIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { Button } from '../Button';
import { Checkbox, IconButton, Input, Pill, Toggle } from '../Card';
import { TimeField } from '../ui/TimeField';
import { DateField } from '../ui/DateField';
import { wordsNow } from '../../data/segment';
import {
  BUFFER_OPTIONS,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  bufferLabel,
  clinicPeriods,
  copyDayTo,
  dayError,
  describeDay,
  describeOverride,
  newId,
  overrideError,
  overrideKindLabel,
  rangesText,
  toMin } from
'../../data/schedule';
import type { ClinicHoursDay, DaySchedule, OverrideKind, ProfessionalSchedule, ScheduleOverride, TimeRange, WeeklySchedule } from '../../data/schedule';

/** Escolhas do editor (dias, tipo de exceção, intervalo): `Pill` md do design system (40px), com o papel de rádio quando é escolha única. */
const radioPill = (on: boolean) => ({ selected: on, role: 'radio', 'aria-checked': on, 'aria-pressed': undefined }) as const;
// 19/10/2026: os antigos botões só texto viraram Button neutral/secondary do design system (nada de botão só texto).
/** Em telas estreitas o relógio do campo de horário some e o respiro diminui, para início, "às", fim e remover caberem numa linha */
const compactTime = 'min-w-0 [&_button]:px-2 sm:[&_button]:px-3.5 [&_button_svg]:hidden sm:[&_button_svg]:block';

/** Interruptor = `Toggle` do design system. O texto ao lado é um <label> que envolve o interruptor (clicar no texto liga/desliga). */
export function ScheduleSwitch({ checked, onChange, label, srLabel }: {checked: boolean;onChange: (v: boolean) => void;label: React.ReactNode;srLabel?: string;}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5">
      <Toggle checked={checked} onCheckedChange={onChange} aria-label={srLabel} />
      <span className="text-sm font-semibold text-text-primary">{label}</span>
    </label>);

}

/** Lista de faixas (períodos ou pausas) com início/fim em passos de 5 min */
function RangeList({ ranges, onChange, label, addLabel, emptyText, minOne, nameFor, disabled }: {ranges: TimeRange[];onChange: (r: TimeRange[]) => void;label: string;addLabel: string;emptyText?: string;minOne?: boolean;nameFor: (i: number) => string;disabled?: boolean;}) {
  const add = () => {
    const last = ranges[ranges.length - 1];
    const start = last ? Math.min(toMin(last.end) + 60, 22 * 60) : 8 * 60;
    const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    onChange([...ranges, { start: fmt(start), end: fmt(Math.min(start + 60, 23 * 60 + 55)) }]);
  };
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      {ranges.length === 0 && emptyText && <p className="mb-1.5 text-sm text-text-secondary">{emptyText}</p>}
      <ul className="flex flex-col gap-2">
        {ranges.map((r, i) =>
        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_2.25rem] items-center gap-2">
            <TimeField ariaLabel={`${nameFor(i)}, início`} value={r.start} disabled={disabled} onChange={(v) => onChange(ranges.map((x, j) => j === i ? { ...x, start: v } : x))} className={compactTime} />
            <span className="text-sm text-text-secondary">às</span>
            <TimeField ariaLabel={`${nameFor(i)}, fim`} value={r.end} disabled={disabled} onChange={(v) => onChange(ranges.map((x, j) => j === i ? { ...x, end: v } : x))} className={compactTime} />
            {!minOne || ranges.length > 1 ?
          <IconButton tone="danger" disabled={disabled} aria-label={`Remover ${nameFor(i).toLowerCase()}`} onClick={() => onChange(ranges.filter((_, j) => j !== i))} icon={<XIcon className="h-4 w-4" />} /> :

          <span aria-hidden="true" />
          }
          </li>
        )}
      </ul>
      <Button size="sm" variant="neutral" disabled={disabled} onClick={add} leftIcon={<PlusIcon className="h-4 w-4" />} className="mt-1.5">
        {addLabel}
      </Button>
    </div>);

}

function CopyDayPanel({ from, onApply, onCancel }: {from: number;onApply: (targets: number[]) => void;onCancel: () => void;}) {
  const [targets, setTargets] = useState<number[]>([]);
  const toggle = (i: number) => setTargets((t) => t.includes(i) ? t.filter((x) => x !== i) : [...t, i]);
  return (
    <div role="group" aria-label={`Copiar ${WEEKDAY_LONG[from]} para outros dias`} className="mt-3 rounded-xl border border-border-strong bg-background p-3">
      <p className="text-sm font-semibold text-text-primary">Copiar {WEEKDAY_LONG[from].toLowerCase()} para:</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {WEEKDAY_SHORT.map((d, i) =>
        i === from ? null :
        <Pill key={d} aria-label={WEEKDAY_LONG[i]} onClick={() => toggle(i)} selected={targets.includes(i)}>
              {d}
            </Pill>

        )}
      </div>
      <p className="mt-2 text-xs text-text-secondary">Só os dias marcados mudam. Depois disso, cada dia continua independente.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="md" disabled={targets.length === 0} onClick={() => onApply(targets)}>
          Copiar para {targets.length || 'os'} {targets.length === 1 ? 'dia' : 'dias'}
        </Button>
        <Button size="md" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>);

}

/**
 * Semana individual. `clinicHours` (opcional) mostra o horário da clínica em cada dia: o que ficar fora dele
 * não é oferecido (vale a interseção). Cada dia mostra primeiro o RESUMO (atende/folga, horários e pausas) e o
 * horário da clínica numa linha alinhada; os campos abrem por dia em "Editar horários". Dia com erro fica aberto.
 */
export function WeeklyScheduleEditor({ week, onChange, clinicHours, showErrors = true, idPrefix = 'semana' }: {week: WeeklySchedule;onChange: (w: WeeklySchedule) => void;clinicHours?: ClinicHoursDay[];showErrors?: boolean;idPrefix?: string;}) {
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [openDays, setOpenDays] = useState<number[]>([]);
  const toggleOpen = (i: number) => setOpenDays((o) => o.includes(i) ? o.filter((x) => x !== i) : [...o, i]);
  const setDay = (i: number, d: DaySchedule) => onChange(week.map((x, j) => j === i ? d : x));
  return (
    <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Jornada semanal">
      {week.map((d, i) => {
        const err = showErrors ? dayError(d) : null;
        const clinic = clinicHours?.[i];
        const clinicClosed = clinic && !clinic.open;
        const open = d.working && (openDays.includes(i) || Boolean(err));
        const fieldsId = `${idPrefix}-${i}-campos`;
        return (
          <li key={i} id={`${idPrefix}-${i}`} className="px-3 py-2.5 sm:px-4">
            {/* Linha de resumo com colunas fixas: dia | horários do profissional + horário da clínica | ação */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
              <ScheduleSwitch
                checked={d.working}
                onChange={(v) => {
                  // G3 (F-050): começa com os períodos da clínica neste dia (um ou mais).
                  setDay(i, v ? { working: true, periods: d.periods.length ? d.periods : clinic?.open && clinicPeriods(clinic).length ? clinicPeriods(clinic) : [{ start: '08:00', end: '18:00' }], breaks: d.breaks } : { ...d, working: false });
                  if (v && !openDays.includes(i)) setOpenDays((o) => [...o, i]);
                }}
                label={<span className="whitespace-nowrap">{WEEKDAY_LONG[i]}</span>}
                srLabel={`${WEEKDAY_LONG[i]}: atende`} />
              
              <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <p className={`text-sm tabular-nums ${d.working ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{describeDay(d)}</p>
                {clinic && <p className={`text-xs tabular-nums ${clinicClosed ? 'font-semibold text-warning' : 'text-text-secondary'}`}>{clinicClosed ? `${wordsNow().Noun} ${wordsNow().closed} neste dia` : `${wordsNow().Noun} ${rangesText(clinicPeriods(clinic))}`}</p>}
              </div>
              <span className="col-start-2 row-start-1 flex justify-end sm:col-start-3">
                {d.working && !err &&
                <Button size="sm" variant="neutral" aria-expanded={open} aria-controls={fieldsId} aria-label={`${open ? 'Recolher horários de' : 'Editar horários de'} ${WEEKDAY_LONG[i].toLowerCase()}`} onClick={() => toggleOpen(i)}>
                    {open ? 'Recolher' : <><span className="sm:hidden">Editar</span><span className="hidden sm:inline">Editar horários</span></>}
                  </Button>
                }
              </span>
            </div>
            {open &&
            <div id={fieldsId} className="mt-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <RangeList ranges={d.periods} minOne label="Períodos de atendimento" addLabel="Adicionar período" nameFor={(k) => `${WEEKDAY_LONG[i]}, período ${k + 1}`} onChange={(periods) => setDay(i, { ...d, periods })} />
                  <RangeList ranges={d.breaks} label="Pausas deste dia" addLabel="Adicionar pausa" emptyText="Sem pausa." nameFor={(k) => `${WEEKDAY_LONG[i]}, pausa ${k + 1}`} onChange={(breaks) => setDay(i, { ...d, breaks })} />
                </div>
                <Button size="sm" variant="neutral" className="mt-2" aria-expanded={copyFrom === i} onClick={() => setCopyFrom(copyFrom === i ? null : i)} leftIcon={<CopyIcon className="h-4 w-4" />}>
                  Copiar para outros dias
                </Button>
              </div>
            }
            {d.working && clinicClosed && <p className="mt-2 text-xs text-warning">{wordsNow().The} está {wordsNow().closed} neste dia da semana: nada é oferecido, a menos que haja uma abertura extraordinária cadastrada.</p>}
            {err &&
            <p role="alert" className="mt-2 text-sm text-error">
                {err}
              </p>
            }
            {open && copyFrom === i &&
            <CopyDayPanel
              from={i}
              onCancel={() => setCopyFrom(null)}
              onApply={(targets) => {
                onChange(copyDayTo(week, i, targets));
                setCopyFrom(null);
              }} />

            }
          </li>);

      })}
    </ul>);

}

const KINDS: {value: OverrideKind;label: string;hint: string;}[] = [
{ value: 'off', label: overrideKindLabel.off, hint: 'Não atende na data ou no período de datas.' },
{ value: 'block', label: overrideKindLabel.block, hint: 'Atende, mas não neste horário (consulta, compromisso).' },
{ value: 'hours', label: overrideKindLabel.hours, hint: 'Substitui o horário da semana: reduzido, estendido ou abertura extra. Respeita o horário de funcionamento.' }];


/** Exceções por data do profissional. Agendamentos já existentes nunca são cancelados nem movidos. */
export function OverridesEditor({ schedule, onChange, defaultDate }: {schedule: ProfessionalSchedule;onChange: (overrides: ScheduleOverride[]) => void;defaultDate: string;}) {
  const blank = (): ScheduleOverride => ({ id: newId('ov'), from: defaultDate, to: defaultDate, kind: 'off', ranges: [], reason: '' });
  const [draft, setDraft] = useState<ScheduleOverride | null>(null);
  const [tried, setTried] = useState(false);
  const reasonId = useId();
  const sorted = [...schedule.overrides].sort((a, b) => a.from.localeCompare(b.from));
  const err = draft ? overrideError(draft) : null;
  const save = () => {
    setTried(true);
    if (!draft || err) return;
    const { reasonShared, ...rest } = draft;
    onChange([...schedule.overrides, { ...rest, reason: draft.reason.trim(), ranges: draft.kind === 'off' ? [] : draft.ranges, ...(reasonShared && draft.reason.trim() ? { reasonShared: true } : {}) }]);
    setDraft(null);
    setTried(false);
  };
  return (
    <div>
      {sorted.length === 0 ?
      <p className="text-sm text-text-secondary">Nenhuma exceção cadastrada.</p> :

      <ul className="flex flex-col gap-2">
          {sorted.map((o) =>
        <li key={o.id} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5">
              <p className="min-w-0 flex-1 text-sm text-text-primary">{describeOverride(schedule, o)}</p>
              <IconButton tone="danger" aria-label={`Remover exceção de ${describeOverride(schedule, o)}`} onClick={() => onChange(schedule.overrides.filter((x) => x.id !== o.id))} icon={<Trash2Icon className="h-4 w-4" />} />
            </li>
        )}
        </ul>
      }

      {draft ?
      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border-strong bg-background p-3">
          <div role="radiogroup" aria-label="Tipo de exceção" className="flex flex-wrap gap-1.5">
            {KINDS.map((k) =>
          <Pill key={k.value} {...radioPill(draft.kind === k.value)} onClick={() => setDraft({ ...draft, kind: k.value, ranges: k.value === 'off' ? [] : draft.ranges.length ? draft.ranges : [{ start: k.value === 'block' ? '14:00' : '08:00', end: k.value === 'block' ? '15:00' : '12:00' }] })}>
                {k.label}
              </Pill>
          )}
          </div>
          <p className="text-xs text-text-secondary">{KINDS.find((k) => k.value === draft.kind)?.hint}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DateField label="De" value={draft.from} onChange={(v) => setDraft({ ...draft, from: v, to: draft.to < v ? v : draft.to })} />
            <DateField label="Até (inclusive)" value={draft.to} onChange={(v) => setDraft({ ...draft, to: v })} />
          </div>
          {draft.kind !== 'off' &&
        <RangeList
          ranges={draft.ranges}
          minOne
          label={draft.kind === 'block' ? 'Horário bloqueado' : 'Horário de atendimento'}
          addLabel="Adicionar período"
          nameFor={(k) => `${draft.kind === 'block' ? 'Bloqueio' : 'Período especial'} ${k + 1}`}
          onChange={(ranges) => setDraft({ ...draft, ranges })} />

        }
          <div>
            <Input id={reasonId} label="Motivo (opcional)" value={draft.reason} maxLength={80} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="Ex.: Férias, Congresso, Plantão de sábado" />
            {/* G3 (F-058): o motivo é interno; só vai ao cliente com esta marcação. */}
            <Checkbox
            size="sm"
            className="mt-2"
            checked={!!draft.reasonShared}
            onChange={(checked) => setDraft({ ...draft, reasonShared: checked || undefined })}
            label={<span className="font-semibold">Mostrar o motivo ao cliente</span>}
            description={<span className="text-xs">Desmarcado: a assistente diz só que não há horário, sem o motivo.</span>} />
          
          </div>
          {tried && err &&
        <p role="alert" className="text-sm text-error">
              {err}
            </p>
        }
          <div className="flex flex-wrap gap-2">
            <Button size="md" onClick={save}>
              Adicionar ausência
            </Button>
            <Button
            size="md"
            variant="secondary"
            onClick={() => {
              setDraft(null);
              setTried(false);
            }}>
            
              Cancelar
            </Button>
          </div>
        </div> :

      <Button size="md" variant="secondary" className="mt-2" onClick={() => setDraft(blank())} leftIcon={<PlusIcon className="h-4 w-4" />}>
          Adicionar ausência (folga, férias, bloqueio ou horário especial)
        </Button>
      }
    </div>);

}

/** Intervalo entre atendimentos: 0/5/10/15/30. Um valor antigo fora da lista continua visível e selecionado. */
export function BufferPicker({ value, onChange, label = 'Intervalo entre atendimentos' }: {value: number;onChange: (n: number) => void;label?: string;}) {
  const options = BUFFER_OPTIONS.includes(value) ? BUFFER_OPTIONS : [...BUFFER_OPTIONS, value].sort((a, b) => a - b);
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-text-primary" aria-hidden="true">
        {label}
      </p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((n) =>
        <Pill key={n} {...radioPill(value === n)} onClick={() => onChange(n)}>
            {bufferLabel(n)}
            {!BUFFER_OPTIONS.includes(n) ? ' (valor atual)' : ''}
          </Pill>
        )}
      </div>
      <p className="mt-1.5 text-xs text-text-secondary">
        {value === 0 ? 'Sem intervalo: quem termina às 10:00 libera o próximo início às 10:00.' : `Quem termina às 10:00 libera o próximo início às ${`10:${String(value).padStart(2, '0')}`.replace('10:60', '11:00')}.`}
      </p>
    </div>);

}