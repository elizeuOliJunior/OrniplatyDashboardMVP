import React from 'react';
import { CalendarOffIcon, ListOrderedIcon, PlusIcon, ZapIcon } from 'lucide-react';
import { Card, StatusBadge, StatusIcon } from '../Card';
import type { AgendaProfessional } from '../../data/agenda';
import type { CalAppointment } from '../../data/agendaStore';
import { useAgendaData } from '../../data/agendaLive';
import { checkAvailability, clinicDay, dayHasFreeTime, effectiveDay, useTeam } from '../../data/availability';
import { rangesText } from '../../data/schedule';
import { isExceptionalAppt } from '../../data/exceptions';
import { thirdPartyLabel, thirdPartyOf, useLegado } from '../../data/legado';
import { smallButton } from '../ui/styles';
import { useBusinessWords } from '../../data/empresa';
import { aulaRefOf } from '../../data/aulas';

/** Largura mínima de cada dia: abaixo disso a grade rola para o lado (nunca espreme o texto) */
const MIN_DAY = 136;

export type WeekColumn = {
  iso: string;
  label: string;
  date: string;
  isToday?: boolean;
  appointments: CalAppointment[];
};

type WeekCalendarProps = {
  /** Professionals chosen in the filter (only their appointments are shown) */
  professionals: AgendaProfessional[];
  /** @deprecated a semana sempre agrupa por profissional */
  layout?: 'colunas' | 'lista';
  /** Cabeçalho único da Agenda (controles + legenda), igual em Dia, Semana e Mês */
  toolbar?: React.ReactNode;
  /** Dias da semana a mostrar (segunda a domingo; a preferência "Ocultar dias fechados" pode tirar dias fechados) */
  days: WeekColumn[];
  onAppointmentClick: (iso: string, appt: CalAppointment) => void;
  /** Clicking the day title opens that day in the "Dia" view */
  onDayClick: (iso: string) => void;
  /** "Agendar" in a day: opens the form with the DATE preselected (time stays to be chosen) */
  onCreateDay: (iso: string) => void;
};

const statusDot: Record<string, string> = { completed: 'var(--success)', pending_confirmation: 'var(--warning-icon)' };

/**
 * Semana: SEMPRE os 7 dias (segunda a domingo) por padrão. Cada dia rola sozinho, atendimentos agrupados por
 * profissional (cores do filtro). Dia fechado continua visível (com o motivo) e não oferece "Agendar".
 * Folgas e horários especiais de quem está no filtro aparecem no topo do dia.
 * W3 (11/11/2026, combinado 3): o ponto amarelo diz “A confirmar” (antes “Aguardando confirmação”).
 */
export function WeekCalendar({ professionals, toolbar, days, onAppointmentClick, onDayClick, onCreateDay }: WeekCalendarProps) {
  const data = useAgendaData();
  const team = useTeam();
  useLegado();
  const w = useBusinessWords();
  const ids = new Set(professionals.map((p) => p.id));
  const idList = professionals.map((p) => p.id);
  const colorOf = (id: string) => professionals.find((p) => p.id === id)?.color ?? '#7F9694';

  const card = (iso: string, a: CalAppointment) => {
    const color = colorOf(a.professionalId);
    const off = a.status === 'cancelled' || a.status === 'no_show';
    const exceptional = isExceptionalAppt(a.id);
    const third = thirdPartyOf(a.id);
    const conflict = off || a.status === 'completed' || exceptional ? null : checkAvailability(data, { professionalId: a.professionalId, iso, start: a.start, end: a.end }, { scope: 'schedule' });
    const hasConflict = conflict && !conflict.ok;
    return (
      <li key={a.id}>
        <button
          type="button"
          onClick={() => onAppointmentClick(iso, a)}
          title={hasConflict && conflict && !conflict.ok ? conflict.message : exceptional ? 'Encaixe excepcional (registrado)' : undefined}
          aria-label={`${a.start} a ${a.end}, ${aulaRefOf(a) ? `aula de ${a.clientName}, ${aulaRefOf(a)!.full ? 'lotada' : `${a.service} vagas ocupadas`}` : `${a.clientName}, ${a.service}`}${third ? `. ${thirdPartyLabel(third)}` : ''}${off ? `. ${a.status === 'cancelled' ? 'Cancelado' : 'Faltou'}` : ''}${hasConflict ? '. Conflita com a configuração de horários' : ''}`}
          className={`block w-full rounded-lg border-l-4 px-2.5 py-1.5 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${hasConflict ? 'ring-2 ring-warning-icon' : ''}`}
          style={{ backgroundColor: off ? 'var(--active-surface)' : `${color}14`, borderLeftColor: off ? 'var(--border-strong)' : color }}>
          
          <span className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold tabular-nums" style={{ color: off ? 'var(--text-secondary)' : color }}>
              {a.start}–{a.end}
            </span>
            <span className="flex items-center gap-1">
              {exceptional && <ZapIcon className="h-3.5 w-3.5 text-warning" aria-label="Encaixe excepcional" />}
              {hasConflict && <StatusIcon tone="warning" size={16} />}
              {statusDot[a.status] && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusDot[a.status] }} title={a.status === 'completed' ? 'Concluído' : 'A confirmar'} />}
              {a.fromWaitlist &&
              <span title="Veio da lista de espera" aria-label="Veio da lista de espera" style={{ color }}>
                  <ListOrderedIcon className="h-3.5 w-3.5" />
                </span>
              }
            </span>
          </span>
          <span className={`block truncate text-xs font-bold text-text-primary ${off ? 'line-through' : ''}`}>{a.clientName}</span>
          {third && <span className="block truncate text-xs font-semibold text-primary">{thirdPartyLabel(third)}</span>}
          {/* G2 (aulas em grupo; CONTRATO NOVO): aula lotada = etiqueta "Lotada" no lugar de "3 de 4". */}
          {aulaRefOf(a)?.full && !off ?
          <StatusBadge status="neutral" label="Lotada" className="mt-0.5" /> :

          <span className="block truncate text-xs text-text-secondary">{a.status === 'cancelled' ? 'Cancelado' : a.status === 'no_show' ? 'Faltou' : a.service}</span>
          }
        </button>
      </li>);

  };

  return (
    <div className="h-[clamp(460px,calc(100vh-190px),1100px)] min-w-0">
      <Card as="section" padding="none" aria-label="Agenda da semana" className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border">{toolbar}</div>
        {days.length === 0 ?
        <p className="flex flex-1 items-center justify-center gap-2 px-4 py-8 text-center text-sm text-text-secondary">
            <CalendarOffIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {w.The} não atende em nenhum dia desta semana. Use “Mostrar dias fechados” para ver esses dias.
          </p> :

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div className="grid h-full divide-x divide-border" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(${MIN_DAY}px, 1fr))`, minWidth: days.length * MIN_DAY }}>
              {days.map((day) => {
              const list = day.appointments.filter((a) => ids.has(a.professionalId)).sort((a, b) => a.start.localeCompare(b.start));
              const active = list.filter((a) => a.status !== 'cancelled');
              const clinic = clinicDay(day.iso);
              const hasFree = clinic.open && dayHasFreeTime(data, idList, day.iso);
              // Exceções de quem está no filtro nesta data (folga, férias, horário especial)
              const notes = clinic.open ?
              professionals.
              map((p) => {
                const m = team.members.find((x) => x.id === p.id);
                if (!m) return null;
                const ed = effectiveDay(m, day.iso);
                if (ed.override?.kind === 'off') return { p, text: `${p.name}: folga${ed.override.reason.trim() ? ` (${ed.override.reason.trim()})` : ''}` };
                if (ed.override?.kind === 'hours') return { p, text: `${p.name}: ${ed.windows.length ? rangesText(ed.windows) : 'sem horário'}${ed.override.reason.trim() ? ` (${ed.override.reason.trim()})` : ''}` };
                return null;
              }).
              filter(Boolean) :
              [];
              return (
                <div key={day.iso} className={`flex min-h-0 min-w-0 flex-col ${day.isToday ? 'bg-background' : !clinic.open ? 'bg-hover-surface' : ''}`}>
                    <div className="shrink-0 border-b border-border px-2 py-2">
                      <button
                      type="button"
                      onClick={() => onDayClick(day.iso)}
                      aria-label={`Abrir ${day.label} ${day.date} na visão de dia${clinic.open ? '' : `. ${w.Noun} ${w.closed}`}`}
                      className="block w-full rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      
                        <p className={`text-sm font-bold ${day.isToday ? 'text-primary' : 'text-text-primary'}`}>
                          {day.label} <span className="font-semibold tabular-nums">{day.date}</span>
                        </p>
                        <p className="text-xs text-text-secondary">
                          {clinic.open ? `${active.length} ${active.length === 1 ? 'atendimento' : 'atendimentos'}${clinic.special ? ` · ${clinic.start}–${clinic.end}` : ''}` : `Fechado${clinic.why ? ` · ${clinic.why}` : ''}`}
                        </p>
                      </button>
                      <button
                      type="button"
                      onClick={() => onCreateDay(day.iso)}
                      disabled={!hasFree}
                      title={!clinic.open ? `${w.The} está ${w.closed} neste dia` : !hasFree ? 'Sem horários livres para os profissionais escolhidos' : undefined}
                      aria-label={hasFree ? `Agendar em ${day.label} ${day.date}` : `${day.label} ${day.date} ${clinic.open ? 'sem horários livres' : `${w.noun} ${w.closed}`}`}
                      className={`${smallButton} mt-1.5 w-full disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-text-secondary`}>
                      
                        {clinic.open ? <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <CalendarOffIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                        {hasFree ? 'Agendar' : clinic.open ? 'Sem horários' : 'Fechado'}
                      </button>
                      {notes.length > 0 &&
                    <ul className="mt-1.5 flex flex-col gap-0.5" aria-label="Exceções de profissionais neste dia">
                          {notes.map((n) =>
                      <li key={n!.p.id} className="flex items-start gap-1 text-[11px] font-semibold leading-tight text-text-secondary">
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: n!.p.color }} aria-hidden="true" />
                              <span className="min-w-0">{n!.text}</span>
                            </li>
                      )}
                        </ul>
                    }
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto" tabIndex={0} role="region" aria-label={`Atendimentos de ${day.label} ${day.date}`}>
                      {list.length === 0 ?
                    <p className="px-3 py-4 text-xs text-text-secondary">{clinic.open ? 'Sem atendimentos' : `Sem atendimentos · ${w.noun} ${w.closed}`}</p> :

                    <div className="flex flex-col gap-1 p-2">
                          {professionals.map((p) => {
                        const mine = list.filter((a) => a.professionalId === p.id);
                        if (mine.length === 0) return null;
                        return (
                          <section key={p.id} aria-label={`${p.name}, ${mine.length} ${mine.length === 1 ? 'atendimento' : 'atendimentos'}`} className="flex flex-col gap-1.5 pb-2">
                                <h3 className="sticky top-0 z-[1] flex items-center gap-1.5 bg-white/95 px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-text-secondary backdrop-blur-sm">
                                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                                  <span className="truncate">{p.name}</span>
                                  <span className="ml-auto tabular-nums text-text-muted">{mine.length}</span>
                                </h3>
                                <ul className="flex flex-col gap-2">{mine.map((a) => card(day.iso, a))}</ul>
                              </section>);

                      })}
                        </div>
                    }
                    </div>
                  </div>);

            })}
            </div>
          </div>
        }
      </Card>
    </div>);

}