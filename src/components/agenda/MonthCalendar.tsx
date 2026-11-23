import React from 'react';
import { CalendarOffIcon, ExternalLinkIcon, PlusIcon } from 'lucide-react';
import { Card, StatusIcon } from '../Card';
import { Button } from '../Button';
import { AppointmentStatusChip } from '../ui/StatusChip';
import { StatusPill } from '../ui/StatusPill';
import { TODAY_ISO, longDayLabel } from '../../data/agendaStore';
import type { CalAppointment } from '../../data/agendaStore';
import type { AgendaProfessional } from '../../data/agenda';
import { conflictReasonOf, useAgendaData } from '../../data/agendaLive';
import { clinicDay, dayHasFreeTime, useTeam } from '../../data/availability';
import { thirdPartyLabel, thirdPartyOf, useLegado } from '../../data/legado';
import { addDaysIso, weekdayIndex } from './AgendaDateNav';
import { useBusinessWords } from '../../data/empresa';
import { aulaRefOf } from '../../data/aulas';

const HEAD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const PREVIEW_MAX = 3;

const pad = (n: number) => String(n).padStart(2, '0');

type Props = {
  professionals: AgendaProfessional[];
  /** @deprecated o mês sempre mostra a contagem por profissional */
  layout?: 'colunas' | 'lista';
  /** Cabeçalho único da Agenda (controles + legenda), igual em Dia, Semana e Mês */
  toolbar?: React.ReactNode;
  /** Any date inside the month on screen */
  monthIso: string;
  /** Day being inspected below the grid */
  selectedIso: string;
  appointments: Record<string, CalAppointment[]>;
  loading?: boolean;
  /** "Ocultar dias fechados": no mês a grade continua com 7 colunas; os dias fechados ficam neutros, sem conteúdo */
  hideClosed?: boolean;
  onSelectDay: (iso: string) => void;
  onOpenDay: (iso: string) => void;
  /** Create on the selected day: date preselected, NO time chosen for the person */
  onCreateDay: (iso: string) => void;
  onAppointmentClick: (iso: string, appt: CalAppointment) => void;
};

const muted = (s: CalAppointment['status']) => s === 'cancelled' || s === 'no_show';
const closedBg = 'repeating-linear-gradient(135deg, rgba(122,149,147,0.10) 0 6px, transparent 6px 12px)';

/**
 * Mês: grade cronológica FIXA de 7 colunas (segunda a domingo), com a contagem por profissional em cada dia.
 * Dias em que a clínica está fechada (semana, feriado) ficam destacados, mas continuam selecionáveis: os
 * agendamentos deles aparecem abaixo e "Abrir dia" funciona. Com "Ocultar dias fechados" a grade continua com
 * 7 colunas e esses dias viram células neutras, sem conteúdo.
 * W3 (11/11/2026, Christian, A1-05): dia com agendamento em CONFLITO (folga, bloqueio, pausa, fora do horário) ganha o
 * mesmo alerta âmbar dos cartões do Dia e da Semana; na lista do dia escolhido, o agendamento mostra "Conflito".
 */
export function MonthCalendar({ professionals, toolbar, monthIso, selectedIso, appointments, loading, hideClosed = false, onSelectDay, onOpenDay, onCreateDay, onAppointmentClick }: Props) {
  const data = useAgendaData();
  useTeam();
  useLegado();
  const w = useBusinessWords();
  const ids = new Set(professionals.map((p) => p.id));
  const idList = professionals.map((p) => p.id);
  const colorOf = (id: string) => professionals.find((p) => p.id === id)?.color ?? '#7F9694';
  const [y, m] = monthIso.split('-').map(Number);
  const first = `${y}-${pad(m)}-01`;
  const gridStart = addDaysIso(first, -weekdayIndex(first));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((weekdayIndex(first) + last) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDaysIso(gridStart, i));
  const inMonth = (iso: string) => iso.slice(0, 7) === first.slice(0, 7);

  const forDay = (iso: string) => (appointments[iso] ?? []).filter((a) => ids.has(a.professionalId)).sort((a, b) => a.start.localeCompare(b.start));
  const monthTotal = days.filter(inMonth).reduce((n, iso) => n + forDay(iso).filter((a) => a.status !== 'cancelled').length, 0);
  /** W3 (A1-05): agendamentos em conflito no dia (mesma regra da lista de Notificações da agenda). */
  const conflictsOn = (iso: string) => forDay(iso).filter((a) => !!conflictReasonOf(iso, a)).length;

  const selList = forDay(selectedIso);
  const selClinic = clinicDay(selectedIso);
  const selClosed = !selClinic.open;
  const selFree = !selClosed && dayHasFreeTime(data, idList, selectedIso);
  const selCount = selList.filter((a) => a.status !== 'cancelled').length;
  const item = (a: CalAppointment) => {
    const third = thirdPartyOf(a.id);
    const conflict = conflictReasonOf(selectedIso, a);
    return (
      <li key={a.id}>
        <button
          type="button"
          onClick={() => onAppointmentClick(selectedIso, a)}
          title={conflict ?? undefined}
          aria-label={`${a.start}, ${aulaRefOf(a) ? `aula de ${a.clientName}, ${aulaRefOf(a)!.full ? 'lotada' : `${a.service} vagas ocupadas`}` : `${a.clientName}, ${a.service}`}${third ? `. ${thirdPartyLabel(third)}` : ''}${muted(a.status) ? `. ${a.status === 'cancelled' ? 'Cancelado' : 'Faltou'}` : ''}${conflict ? `. Conflito: ${conflict}` : ''}`}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${muted(a.status) ? 'bg-active-surface' : ''}`}>
          
          <span className="w-12 shrink-0 text-sm font-bold tabular-nums text-text-primary">{a.start}</span>
          <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: muted(a.status) ? 'var(--border-strong)' : colorOf(a.professionalId) }} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-bold ${muted(a.status) ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
              {a.clientName}
              {third && <span className="font-semibold text-primary no-underline"> · {thirdPartyLabel(third)}</span>}
            </span>
            <span className="block truncate text-xs text-text-secondary">{aulaRefOf(a) ? `Aula em grupo · ${a.service}` : a.service}</span>
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
            {conflict && <StatusPill tone="error" label="Conflito" />}
            {/* G2 (aulas em grupo; CONTRATO NOVO): aula aberta não tem confirmação; lotada mostra "Lotada". */}
            {aulaRefOf(a) ? aulaRefOf(a)!.full && a.status === 'confirmed' ? <StatusPill tone="neutral" label="Lotada" minWidth="lg" /> : a.status !== 'confirmed' ? <AppointmentStatusChip status={a.status} /> : null : <AppointmentStatusChip status={a.status} />}
          </span>
        </button>
      </li>);

  };

  return (
    <Card as="section" padding="none" aria-label="Agenda do mês" className="min-w-0 overflow-hidden">
      <div className="border-b border-border">{toolbar}</div>

      {loading ?
      <div className="grid animate-pulse grid-cols-7 gap-px bg-border p-px" aria-busy="true" aria-label="Carregando o mês">
          {Array.from({ length: 35 }, (_, i) =>
        <div key={i} className="h-24 bg-white" />
        )}
        </div> :

      <>
          <div className="grid grid-cols-7 border-b border-border bg-background" aria-hidden="true">
            {HEAD.map((h) =>
          <span key={h} className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-text-muted">
                {h}
              </span>
          )}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border" role="grid" aria-label="Dias do mês">
            {days.map((iso) => {
            const list = forDay(iso);
            const active = list.filter((a) => a.status !== 'cancelled');
            const c = clinicDay(iso);
            const closed = !c.open;
            // Dia fechado com a preferência ligada: célula neutra, sem hachura nem conteúdo (continua selecionável)
            const neutral = hideClosed && closed;
            const selected = iso === selectedIso;
            const today = iso === TODAY_ISO;
            const day = Number(iso.slice(8));
            const hasFree = !closed && dayHasFreeTime(data, idList, iso);
            const nConflicts = iso >= TODAY_ISO ? conflictsOn(iso) : 0;
            const perPro = professionals.map((p) => ({ p, n: active.filter((a) => a.professionalId === p.id).length })).filter((x) => x.n > 0);
            return (
              <div key={iso} role="gridcell" aria-selected={selected} className="group relative min-w-0">
                <button
                  type="button"
                  aria-label={`${longDayLabel(iso)}${today ? ' (hoje)' : ''}${inMonth(iso) ? '' : ', fora deste mês'}${closed ? `, ${w.noun} ${w.closed}${c.why ? ` (${c.why})` : ''}` : ''}: ${active.length} ${active.length === 1 ? 'atendimento' : 'atendimentos'}${nConflicts ? `, ${nConflicts} em conflito` : ''}`}
                  onClick={() => onSelectDay(iso)}
                  className={`flex h-full min-h-[82px] w-full min-w-0 flex-col items-stretch gap-1 p-1.5 pb-9 text-left transition-colors focus:outline-none focus-visible:z-[1] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:min-h-[124px] sm:p-2 sm:pb-10 ${
                  selected ? 'bg-primary-soft' : !inMonth(iso) ? 'bg-background hover:bg-hover-surface' : closed ? 'bg-hover-surface hover:bg-hover-surface' : 'bg-white hover:bg-background'}`
                  }
                  style={closed && !selected && !neutral ? { backgroundImage: closedBg } : undefined}>
                  
                  <span className="flex items-center justify-between gap-1">
                    <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums ${today ? 'bg-primary text-white' : inMonth(iso) && !neutral ? 'text-text-primary' : 'text-text-muted'}`}>{day}</span>
                    <span className="flex items-center gap-1">
                      {nConflicts > 0 && !neutral &&
                      <span title={`${nConflicts} ${nConflicts === 1 ? 'agendamento em conflito' : 'agendamentos em conflito'}`}>
                          <StatusIcon tone="warning" size={16} />
                        </span>
                      }
                      {active.length > 0 && !neutral && <span className="rounded-full bg-surface-muted px-1.5 text-[11px] font-bold tabular-nums text-text-secondary">{active.length}</span>}
                    </span>
                  </span>
                  {closed && !neutral && inMonth(iso) && <span className="hidden truncate text-[11px] font-semibold text-text-secondary sm:block">{c.why || 'Fechado'}</span>}
                  {!closed && c.open && c.special && inMonth(iso) && <span className="hidden truncate text-[11px] font-semibold text-primary sm:block">{c.why || `${c.start}–${c.end}`}</span>}
                  <span className={`flex flex-wrap gap-0.5 sm:hidden ${neutral ? 'invisible' : ''}`} aria-hidden="true">
                    {perPro.map(({ p }) =>
                    <span key={p.id} className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                    )}
                  </span>
                  <span className={`hidden min-w-0 flex-col gap-0.5 sm:flex ${neutral ? 'sm:invisible' : ''}`} aria-hidden={neutral || undefined}>
                    {perPro.slice(0, PREVIEW_MAX).map(({ p, n }) =>
                    <span key={p.id} className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-text-secondary">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto tabular-nums text-text-primary">{n}</span>
                      </span>
                    )}
                    {perPro.length > PREVIEW_MAX && <span className="text-[11px] font-bold text-primary">+{perPro.length - PREVIEW_MAX} mais</span>}
                  </span>
                  </button>
                  {hasFree && inMonth(iso) &&
                <button
                  type="button"
                  onClick={() => onCreateDay(iso)}
                  aria-label={`Marcar agendamento em ${longDayLabel(iso)}`}
                  title={`Marcar agendamento em ${longDayLabel(iso)}`}
                  className="absolute bottom-1.5 left-1.5 right-1.5 z-10 flex min-h-8 items-center justify-center gap-0.5 whitespace-nowrap rounded-lg border border-primary bg-white px-1 text-[11px] font-bold text-primary opacity-100 shadow-sm transition-[opacity,background-color] hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:left-2 sm:right-2 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  
                    <PlusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {/* Célula estreita: só o ícone (o nome acessível vem do aria-label); o texto cresce com a largura */}
                    <span className="hidden sm:inline">Agendar</span>
                    <span className="hidden xl:inline">&nbsp;neste dia</span>
                  </button>
                }
                </div>);

          })}
          </div>
        </>
      }

      {!loading && monthTotal === 0 && <p className="border-t border-border px-4 py-3 text-center text-sm text-text-muted">Nenhum atendimento neste mês para os profissionais escolhidos.</p>}

      <section aria-label="Atendimentos do dia selecionado" className="border-t border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-text-primary">{longDayLabel(selectedIso)}</h2>
            <p className="text-xs text-text-secondary">
              {selClosed ? `${w.Noun} ${w.closed}${selClinic.why ? ` · ${selClinic.why}` : ''} · ${selCount} ${selCount === 1 ? 'atendimento' : 'atendimentos'}` : `${selCount} ${selCount === 1 ? 'atendimento' : 'atendimentos'}${selFree ? '' : ' · sem horários livres'}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="md" leftIcon={<ExternalLinkIcon className="h-4 w-4" />} onClick={() => onOpenDay(selectedIso)}>
              Abrir dia
            </Button>
            <Button size="md" disabled={!selFree} title={selClosed ? `${w.The} está ${w.closed} nesta data` : !selFree ? 'Sem horários livres nesta data' : undefined} leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => onCreateDay(selectedIso)}>
              Novo agendamento neste dia
            </Button>
          </div>
        </div>
        {selClosed &&
        <p className="flex items-center gap-2 px-4 pb-2 text-sm text-text-secondary">
            <CalendarOffIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {selClinic.message} Nenhum horário é oferecido{selCount ? '; os agendamentos já marcados continuam abaixo.' : '.'}
          </p>
        }
        {selList.length === 0 ?
        <p className="px-4 pb-4 text-sm text-text-muted">Nenhum atendimento neste dia.</p> :

        <div className="flex flex-col gap-2 px-2 pb-3">
            {professionals.map((p) => {
            const mine = selList.filter((a) => a.professionalId === p.id);
            if (mine.length === 0) return null;
            return (
              <div key={p.id}>
                  <h3 className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wide text-text-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                    {p.name} <span className="tabular-nums text-text-muted">· {mine.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-0.5">{mine.map(item)}</ul>
                </div>);

          })}
          </div>
        }
      </section>
    </Card>);

}