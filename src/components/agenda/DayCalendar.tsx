import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarOffIcon, ChevronLeftIcon, ChevronRightIcon, ListOrderedIcon, ZapIcon } from 'lucide-react';
import { AGENDA_HATCH } from './AgendaLegend';
import { Card, IconButton, StatusBadge, StatusIcon } from '../Card';
import { useToast } from '../ui/Toast';
import type { AgendaProfessional } from '../../data/agenda';
import type { CalAppointment, CalBlock } from '../../data/agendaStore';
import { NOW, TODAY_ISO } from '../../data/agendaStore';
import { fromMinutes, toMinutes } from '../../utils/time';
import { bufferMinutes, checkAvailability, clinicDay, effectiveDay, sharedBreaksOn, useTeam } from '../../data/availability';
import { TIME_STEP, intersectRanges, rangesText, subtractRanges } from '../../data/schedule';
import type { TimeRange } from '../../data/schedule';
import { isExceptionalAppt } from '../../data/exceptions';
import { useBusinessWords } from '../../data/empresa';
import { thirdPartyLabel, thirdPartyOf, useLegado } from '../../data/legado';
import { recordMatches, useServiceConflicts } from '../../data/serviceConflicts';
import { aulaRefOf } from '../../data/aulas';

const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 48;
const GUTTER = 60;
/** Narrowest a professional column can get before the next ones move to another page */
const MIN_COLUMN = 200;
/** Janela mostrada quando a clínica está fechada no dia (a camada "fechado" cobre a grade). */
const FALLBACK_START = toMinutes('08:00');
const FALLBACK_END = toMinutes('18:00');

/**
 * A grade acompanha o expediente da clínica NAQUELE dia (semana + feriado/expediente reduzido/abertura extraordinária)
 * e se amplia para não esconder nenhum atendimento já marcado fora dele (ex.: encaixe excepcional, dia fechado).
 */
function gridRange(iso: string, appointments: CalAppointment[]) {
  const c = clinicDay(iso);
  let a = c.open ? toMinutes(c.start) : FALLBACK_START;
  let b = c.open ? toMinutes(c.end) : FALLBACK_END;
  appointments.forEach((x) => {
    a = Math.min(a, toMinutes(x.start));
    b = Math.max(b, toMinutes(x.end));
  });
  return { start: Math.floor(a / SLOT_MINUTES) * SLOT_MINUTES, end: Math.ceil(b / SLOT_MINUTES) * SLOT_MINUTES };
}

/** Junta faixas que se sobrepõem ou encostam (ex.: intervalo depois de A e antes de B no mesmo vão). */
function mergeRanges(list: TimeRange[]): TimeRange[] {
  const sorted = list.filter((r) => toMinutes(r.end) > toMinutes(r.start)).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const out: TimeRange[] = [];
  sorted.forEach((r) => {
    const last = out[out.length - 1];
    if (last && toMinutes(r.start) <= toMinutes(last.end)) {
      if (toMinutes(r.end) > toMinutes(last.end)) last.end = r.end;
    } else out.push({ start: r.start, end: r.end });
  });
  return out;
}

export type DayLayout = 'colunas' | 'lista';

type DayCalendarProps = {
  /** Professionals chosen in the filter, in display order (one column each) */
  professionals: AgendaProfessional[];
  /** ISO date shown (qualquer dia, inclusive sábado, domingo e dias fechados) */
  iso: string;
  /** @deprecated a agenda do dia sempre usa uma coluna por profissional */
  layout?: DayLayout;
  /** Cabeçalho único da Agenda (controles + legenda), igual em Dia, Semana e Mês */
  toolbar?: React.ReactNode;
  appointments: CalAppointment[];
  blocks: CalBlock[];
  /** @deprecated o fechamento vem de `clinicDay` e não cobre os agendamentos existentes */
  closedLabel?: string;
  onAppointmentClick: (appt: CalAppointment) => void;
  /** Click on a FREE slot: opens "Novo agendamento" prefilled */
  onSlotClick: (professionalId: string, time: string) => void;
  /** G2 (F-036): clique num bloqueio MANUAL (os da ausência do profissional continuam só desenhados) */
  onBlockClick?: (block: CalBlock) => void;
  /** G2 (F-032): link direto para um profissional/item: a página de colunas que o contém fica visível */
  focusProfessionalId?: string;
};

const muted = (s: CalAppointment['status']) => s === 'cancelled' || s === 'no_show';
const hatch = AGENDA_HATCH;

export function DayCalendar({ professionals, iso, toolbar, appointments, blocks, onAppointmentClick, onSlotClick, onBlockClick, focusProfessionalId }: DayCalendarProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(4);
  const [page, setPage] = useState(0);
  const team = useTeam();
  const w = useBusinessWords();
  const toast = useToast();
  useLegado();
  // I2 (costura 2): conflitos criados por mudança no SERVIÇO (W2) também marcam o cartão do Dia, com o motivo do W2.
  const serviceConflicts = useServiceConflicts();
  const snapshot = useMemo(() => ({ appointments: { [iso]: appointments }, blocks: { [iso]: blocks } }), [iso, appointments, blocks]);

  const cDay = clinicDay(iso);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => gridRange(iso, appointments), [iso, appointments, team.hours, team.blocks]);
  const DAY_START = range.start;
  const DAY_END = range.end;
  const slots = useMemo(() => Array.from({ length: Math.max(1, (DAY_END - DAY_START) / SLOT_MINUTES) }, (_, i) => DAY_START + i * SLOT_MINUTES), [DAY_START, DAY_END]);
  const gridHeight = slots.length * SLOT_HEIGHT;
  const topFor = (time: string) => (toMinutes(time) - DAY_START) / SLOT_MINUTES * SLOT_HEIGHT;
  const heightFor = (start: string, end: string) => (toMinutes(end) - toMinutes(start)) / SLOT_MINUTES * SLOT_HEIGHT;
  const clamp = (min: number) => Math.min(Math.max(min, DAY_START), DAY_END);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setPerPage(Math.max(1, Math.floor((el.clientWidth - GUTTER) / MIN_COLUMN)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pages = Math.max(1, Math.ceil(professionals.length / perPage));
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);
  const proKey = professionals.map((p) => p.id).join(',');
  useEffect(() => {
    if (!focusProfessionalId) return;
    const i = proKey.split(',').indexOf(focusProfessionalId);
    if (i >= 0) setPage(Math.floor(i / perPage));
  }, [focusProfessionalId, proKey, perPage]);
  const current = Math.min(page, pages - 1);
  const shown = professionals.slice(current * perPage, current * perPage + perPage);

  const pager =
  pages > 1 ?
  <div className="flex items-center gap-1" aria-label="Páginas de profissionais">
        <span className="text-xs font-semibold tabular-nums text-text-muted">
          {current * perPage + 1}–{Math.min(professionals.length, (current + 1) * perPage)} de {professionals.length}
        </span>
        <IconButton size="sm" aria-label="Profissionais anteriores" disabled={current === 0} onClick={() => setPage(current - 1)} icon={<ChevronLeftIcon className="h-4 w-4" />} />
        <IconButton size="sm" aria-label="Próximos profissionais" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} icon={<ChevronRightIcon className="h-4 w-4" />} />
      </div> :
  null;

  const columns = `${GUTTER}px repeat(${shown.length}, minmax(0, 1fr))`;
  const dayOf = (id: string) => effectiveDay(team.members.find((m) => m.id === id), iso);

  /**
   * Minuto livre = dá para ocupar aqueles 5 min (passo da agenda) pela regra única. A grade mostra o tempo REAL livre;
   * a duração do serviço é validada no Novo agendamento. (Antes a célula testava 30 min e marcava a meia hora inteira
   * como "intervalo" quando um atendimento de 30 min não cabia, ex.: 08:30–09:00 com 5 min de intervalo antes das 09:00.)
   */
  /**
   * R3 (06/11/2026, Christian, A-20): hoje, minuto antes de agora (relógio do protótipo, `NOW`) não é livre na grade, igual ao
   * Novo agendamento (início antes de NOW não é oferecido; o encaixe excepcional continua só pelo modal, dono/admin). A célula
   * em que NOW cai passa a oferecer "+ HH:MM" a partir de NOW (ex.: + 09:20). Datas passadas inteiras não mudam aqui.
   */
  const nowMin = iso === TODAY_ISO ? toMinutes(NOW) : null;
  const minuteFree = (proId: string, t: number) => (nowMin === null || t >= nowMin) && checkAvailability(snapshot, { professionalId: proId, iso, start: fromMinutes(t), durationMin: TIME_STEP }).ok;
  /** Primeiro minuto livre (passo de 5 min) dentro de uma célula de 30 min. */
  const firstFreeIn = (proId: string, slot: number) => {
    for (let t = slot; t < slot + SLOT_MINUTES; t += TIME_STEP) if (minuteFree(proId, t)) return t;
    return null;
  };
  /** Fim do trecho livre contínuo que começa em `from`, sem passar do fim da célula. */
  const freeUntil = (proId: string, from: number, cellEnd: number) => {
    for (let t = from; t < cellEnd; t += TIME_STEP) if (!minuteFree(proId, t)) return t;
    return cellEnd;
  };

  /**
   * Faixa do INTERVALO entre atendimentos (16/10/2026): reage ao mouse e, ao clicar, explica por que não dá para agendar
   * ali, com a mesma mensagem da regra única de disponibilidade. Cursor normal (seta), pedido do Christian.
   */
  const explainBuffer = (proId: string, proName: string, start: string, gap: number) => {
    const r = checkAvailability(snapshot, { professionalId: proId, iso, start, durationMin: TIME_STEP });
    const how = 'Para mudar, edite o profissional em Serviços e equipe › Equipe.';
    toast({
      title: 'Intervalo entre atendimentos',
      description: !r.ok && r.kind === 'buffer' ? `${r.message} ${how}` : `${proName} tem ${gap} min de intervalo entre atendimentos. ${how}`,
      tone: 'info',
      duration: 8000
    });
  };
  const bufferCellClass =
  'absolute inset-x-0 z-[2] flex cursor-default items-center justify-center overflow-hidden whitespace-nowrap bg-background text-[11px] font-semibold text-transparent transition-colors hover:bg-active-surface hover:text-text-secondary focus:outline-none focus-visible:bg-active-surface focus-visible:text-text-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';

  return (
    <Card as="section" padding="none" aria-label="Agenda do dia" className="min-w-0 overflow-hidden">
      <div className="border-b border-border">{toolbar}</div>

      {!cDay.open &&
      <p role="status" className="flex items-center gap-2 border-b border-border bg-hover-surface px-4 py-2 text-sm font-semibold text-text-secondary">
          <CalendarOffIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {cDay.message} Nenhum horário é oferecido; agendamentos já marcados continuam visíveis.
        </p>
      }
      {cDay.open && cDay.special &&
      <p role="status" className="border-b border-border bg-background px-4 py-2 text-sm font-semibold text-primary">
          Expediente especial {w.of} hoje: {cDay.start}–{cDay.end}
          {cDay.why ? ` · ${cDay.why}` : ''}
        </p>
      }

      {pager && <div className="flex justify-end border-b border-border px-4 py-1.5">{pager}</div>}

      <div className="overflow-x-auto">
        <div ref={boxRef} style={{ minWidth: GUTTER + MIN_COLUMN }}>
          {/* Column headers */}
          <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }}>
            <div />
            {shown.map((pro) => {
              const d = dayOf(pro.id);
              const o = d.override;
              const text = !cDay.open ?
              `${w.Noun} ${w.closed}` :
              !d.working ?
              o ?
              `Folga${o.reason.trim() ? ` · ${o.reason.trim()}` : ''}` :
              'Não atende neste dia' :
              d.windows.length ?
              `${rangesText(d.windows)}${d.breaks.length ? ` · pausa ${rangesText(d.breaks)}` : ''}` :
              'Sem horário no expediente';
              return (
                <div key={pro.id} className="min-w-0 border-l border-border px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pro.color }} aria-hidden="true" />
                    <span className="truncate text-sm font-bold text-text-primary">{pro.name}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-text-secondary" title={text}>
                    {text}
                  </p>
                  {cDay.open && o?.kind === 'hours' && <p className="truncate text-[11px] font-semibold text-primary">Horário especial{o.reason.trim() ? ` · ${o.reason.trim()}` : ''}</p>}
                </div>);

            })}
          </div>

          {/* Body */}
          <div className="relative grid" style={{ gridTemplateColumns: columns, height: gridHeight }}>
            <div className="relative">
              {slots.map((slot, i) =>
              <div key={slot} className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-text-muted" style={{ top: i * SLOT_HEIGHT }}>
                  {i === 0 ? <span className="inline-block translate-y-2">{fromMinutes(slot)}</span> : fromMinutes(slot)}
                </div>
              )}
            </div>

            {shown.map((pro, proIndex) => {
              const member = team.members.find((m) => m.id === pro.id);
              const d = dayOf(pro.id);
              const gap = bufferMinutes(member);
              // Fora do horário = tudo o que não está nas janelas (períodos do profissional ∩ expediente da clínica)
              const offRanges = subtractRanges([{ start: fromMinutes(DAY_START), end: fromMinutes(DAY_END) }], d.windows).map((r) => [toMinutes(r.start), toMinutes(r.end)] as [number, number]);
              const offLabel = !cDay.open ? `${w.Noun} ${w.closed}` : !d.working ? d.override ? 'Folga' : 'Não atende neste dia' : 'Fora do horário';
              const breaks = [
              ...d.breaks.map((b) => ({ ...b, label: 'Pausa' })),
              ...sharedBreaksOn(iso).map((r) => ({ start: r.start, end: r.end, label: r.label }))];

              const proBlocks = d.blocks.map((b, k) => ({ id: `pb${k}`, start: b.range.start, end: b.range.end, label: `Bloqueio${b.reason.trim() ? ` · ${b.reason.trim()}` : ''}` }));
              const mine = appointments.filter((a) => a.professionalId === pro.id);
              const myBlocks = [...blocks.filter((b) => b.professionalId === null || b.professionalId === pro.id), ...proBlocks];
              // Faixas de INTERVALO com o tamanho EXATO (16/10/2026): [início − intervalo, início) e [fim, fim + intervalo) de
              // cada atendimento que ocupa horário (só cancelado libera, igual à regra única), dentro do horário do
              // profissional e fora de pausas, bloqueios e outros atendimentos. Vale para 5, 10, 15, 30 min ou qualquer valor.
              const occupying = mine.filter((a) => a.status !== 'cancelled');
              const gapBands =
              gap > 0 && d.windows.length > 0 ?
              subtractRanges(
                intersectRanges(
                  mergeRanges(occupying.flatMap((a) => [{ start: fromMinutes(Math.max(0, toMinutes(a.start) - gap)), end: a.start }, { start: a.end, end: fromMinutes(toMinutes(a.end) + gap) }])),
                  d.windows
                ),
                [...occupying.map((a) => ({ start: a.start, end: a.end })), ...breaks.map((b) => ({ start: b.start, end: b.end })), ...myBlocks.map((b) => ({ start: b.start, end: b.end }))]
              ) :
              [];
              return (
                <div key={pro.id} className="relative border-l border-border">
                  {/* grid lines. T1 1p (05/11, Christian: no escuro os pontilhados atrapalham a leitura dos nomes): a linha da
                       meia hora era `border-border/70`, classe que não existe (as cores do DS são var(--x) e não aceitam "/70"),
                       então caía no cinza-claro padrão do Tailwind (#E5E7EB), que no escuro ficava quase branco. Agora usa o
                       token `border-border` (tracejada continua indicando a meia hora). */}
                  {slots.map((slot, i) =>
                  <div key={slot} aria-hidden="true" className={`pointer-events-none absolute inset-x-0 border-t ${i % 2 === 0 ? 'border-border' : 'border-dashed border-border'}`} style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }} />
                  )}

                  {/* Só o trecho realmente livre de cada célula é clicável, a partir do primeiro minuto livre exato (ex.: 10:05). */}
                  {slots.map((slot, i) => {
                    const from = firstFreeIn(pro.id, slot);
                    if (from === null) return null;
                    const exact = fromMinutes(from);
                    const until = freeUntil(pro.id, from, slot + SLOT_MINUTES);
                    const offset = (from - slot) / SLOT_MINUTES * SLOT_HEIGHT;
                    const height = (until - from) / SLOT_MINUTES * SLOT_HEIGHT;
                    return (
                      <React.Fragment key={slot}>
                        {offset > 0 && <div aria-hidden="true" className="absolute inset-x-0 z-[1] bg-background" style={{ top: i * SLOT_HEIGHT, height: offset }} />}
                        <button
                          type="button"
                          aria-label={`Agendar ${exact} com ${pro.name}`}
                          onClick={() => onSlotClick(pro.id, exact)}
                          className={`group absolute inset-x-0 z-[1] flex items-center justify-center overflow-hidden text-[11px] font-semibold transition-colors hover:bg-primary-soft hover:text-primary focus:outline-none focus-visible:bg-primary-soft focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${exact !== fromMinutes(slot) ? 'text-text-secondary' : 'text-transparent'}`}
                          style={{ top: i * SLOT_HEIGHT + offset, height }}>
                          
                          + {exact}
                        </button>
                      </React.Fragment>);

                  })}

                  {/* intervalo entre atendimentos: tamanho exato, clicável para explicar o motivo */}
                  {gapBands.map((b) => {
                    const h = heightFor(b.start, b.end);
                    return (
                      <button
                        key={`gap-${b.start}`}
                        type="button"
                        aria-label={`Intervalo de ${gap} min entre atendimentos de ${pro.name}, ${b.start} a ${b.end}. Ver motivo`}
                        onClick={() => explainBuffer(pro.id, pro.name, b.start, gap)}
                        className={bufferCellClass}
                        style={{ top: topFor(b.start), height: h }}>
                        
                        {h >= 18 ? `Intervalo · ${gap} min` : ''}
                      </button>);

                  })}

                  {/* outside working hours (clinic hours ∩ professional periods), folga, clínica fechada */}
                  {offRanges.
                  filter(([a, b]) => b > a).
                  map(([a, b], k) =>
                  <div key={k} aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-[2] flex items-start justify-center bg-active-surface" style={{ top: (a - DAY_START) / SLOT_MINUTES * SLOT_HEIGHT, height: (b - a) / SLOT_MINUTES * SLOT_HEIGHT, backgroundImage: hatch }}>
                        {(d.windows.length === 0 || b - a >= 60 && a > DAY_START && b < DAY_END) &&
                    <span className="mt-2 rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-text-secondary">{offLabel}</span>
                    }
                      </div>
                  )}

                  {/* breaks (individual by day + clinic-wide) */}
                  {d.windows.length > 0 &&
                  breaks.
                  filter((b) => toMinutes(b.end) > DAY_START && toMinutes(b.start) < DAY_END).
                  map((b, k) =>
                  <div key={`br${k}`} aria-hidden="true" className="pointer-events-none absolute inset-x-1.5 z-[3] flex items-center justify-center rounded-lg border border-border-strong" style={{ top: topFor(fromMinutes(clamp(toMinutes(b.start)))) + 2, height: Math.max(8, (clamp(toMinutes(b.end)) - clamp(toMinutes(b.start))) / SLOT_MINUTES * SLOT_HEIGHT - 4), backgroundColor: 'var(--disabled-surface)', backgroundImage: hatch }}>
                          <span className="truncate rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-text-secondary">
                            {b.label} · {b.start}–{b.end}
                          </span>
                        </div>
                  )}

                  {/* manual blocks + partial blocks from the professional's exceptions */}
                  {myBlocks.
                  filter((b) => toMinutes(b.end) > DAY_START && toMinutes(b.start) < DAY_END).
                  map((b) => {
                    const style = { top: topFor(fromMinutes(clamp(toMinutes(b.start)))) + 2, height: Math.max(8, heightFor(fromMinutes(clamp(toMinutes(b.start))), fromMinutes(clamp(toMinutes(b.end)))) - 4), backgroundColor: 'var(--surface-muted)', backgroundImage: hatch };
                    const tag = <span className="truncate rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-text-secondary">{b.label}</span>;
                    // G2 (F-036): bloqueio MANUAL (vem de `blocks`) abre os detalhes; o da ausência do profissional não.
                    const manual = onBlockClick ? blocks.find((x) => x.id === b.id) : undefined;
                    if (!manual) return (
                      <div key={b.id} aria-hidden="true" className="pointer-events-none absolute inset-x-1.5 z-[3] flex items-center justify-center rounded-lg border border-dashed border-disabled-text" style={style}>
                          {tag}
                        </div>);

                    // Bloqueio de toda a equipe aparece em todas as colunas: o id do destino fica só na primeira.
                    const anchor = manual.professionalId === pro.id || manual.professionalId === null && proIndex === 0;
                    return (
                      <button
                        key={b.id}
                        id={anchor ? `agenda-block-${b.id}` : undefined}
                        type="button"
                        onClick={() => onBlockClick?.(manual)}
                        aria-label={`${b.label}, ${b.start} às ${b.end}, ${manual.professionalId ? pro.name : 'toda a equipe'}. Ver detalhes do bloqueio`}
                        className="absolute inset-x-1.5 z-[3] flex items-center justify-center rounded-lg border border-dashed border-disabled-text transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        style={style}>
                        
                          {tag}
                        </button>);

                  })}

                  {/* appointments always above everything else */}
                  {/* G3: cancelado que tem outro agendamento ativo por cima não é desenhado (o horário foi reaproveitado; o
                       cancelamento continua nos detalhes, na Ficha e nas Vagas liberadas). */}
                  {/* T1 1p: o cartão é OPACO (fundo da superfície + a mesma tinta de 8% da cor do profissional por cima), para
                       as linhas da grade não passarem por cima do nome do cliente. No claro a aparência é a mesma de antes. */}
                  {mine.filter((appt) => appt.status !== 'cancelled' || !occupying.some((o) => toMinutes(o.start) < toMinutes(appt.end) && toMinutes(appt.start) < toMinutes(o.end))).map((appt) => {
                    const exceptional = isExceptionalAppt(appt.id);
                    const off = muted(appt.status);
                    const third = thirdPartyOf(appt.id);
                    const conflict = off || appt.status === 'completed' || exceptional ? null : checkAvailability(snapshot, { professionalId: pro.id, iso, start: appt.start, end: appt.end }, { scope: 'schedule' });
                    const scheduleConflict = !!conflict && !conflict.ok;
                    const svc = off || appt.status === 'completed' ? undefined : serviceConflicts.find((r) => recordMatches(r, iso, appt));
                    const conflictMessage = conflict && !conflict.ok ? conflict.message : svc ? svc.message : '';
                    const hasConflict = scheduleConflict || !!svc;
                    return (
                      <button
                        key={appt.id}
                        id={`agenda-appt-${appt.id}`}
                        type="button"
                        onClick={() => onAppointmentClick(appt)}
                        aria-label={`${appt.start}, ${aulaRefOf(appt) ? `${aulaRefOf(appt)!.word} de ${appt.clientName}, ${aulaRefOf(appt)!.full ? 'turma lotada' : `${appt.service} vagas ocupadas`}` : `${appt.clientName}, ${appt.service}`}${third ? `. ${thirdPartyLabel(third)}` : ''}${off ? `. ${appt.status === 'cancelled' ? 'Cancelado' : 'Faltou'}` : ''}${exceptional ? '. Encaixe excepcional' : ''}${scheduleConflict ? '. Conflita com a configuração de horários' : svc ? '. Fora da regra do serviço' : ''}`}
                        className={`absolute inset-x-1.5 z-10 overflow-hidden rounded-lg border-l-4 px-2.5 py-1.5 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${hasConflict ? 'ring-2 ring-warning-icon' : ''}`}
                        style={{
                          top: topFor(appt.start) + 2,
                          height: heightFor(appt.start, appt.end) - 4,
                          backgroundColor: off ? 'var(--active-surface)' : 'var(--surface)',
                          backgroundImage: off ? undefined : `linear-gradient(${pro.color}14, ${pro.color}14)`,
                          borderLeftColor: off ? 'var(--border-strong)' : pro.color
                        }}>
                        
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[11px] font-bold tabular-nums" style={{ color: off ? 'var(--text-secondary)' : pro.color }}>
                            {appt.start}–{appt.end}
                          </p>
                          <span className="flex items-center gap-1">
                            {exceptional &&
                            <span title="Encaixe excepcional (registrado)" className="text-warning">
                                <ZapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                            }
                            {hasConflict &&
                            <span title={conflictMessage} className="inline-flex">
                                <StatusIcon tone="warning" size={16} />
                              </span>
                            }
                            {appt.status === 'pending_confirmation' && <span title="A confirmar" className="h-2 w-2 rounded-full bg-warning-icon" />}
                            {appt.status === 'completed' && <span title="Concluído" className="h-2 w-2 rounded-full bg-success" />}
                            {appt.fromWaitlist &&
                            <span title="Veio da lista de espera" aria-label="Veio da lista de espera" style={{ color: pro.color }}>
                                <ListOrderedIcon className="h-3.5 w-3.5" />
                              </span>
                            }
                          </span>
                        </div>
                        <p className={`truncate text-xs font-bold text-text-primary ${off ? 'line-through' : ''}`}>
                          {appt.clientName}
                          {third && <span className="font-semibold text-text-secondary"> · {thirdPartyLabel(third)}</span>}
                        </p>
                        {/* G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): aula = o mesmo cartão; "3 de 4" no lugar do serviço e,
                             lotada, a etiqueta "Lotada" (a mesma da aba Turmas). */}
                        {aulaRefOf(appt)?.full && !off ?
                        <StatusBadge status="neutral" label="Lotada" className="mt-0.5" /> :

                        <p className="truncate text-xs text-text-secondary">{appt.status === 'cancelled' ? 'Cancelado' : appt.status === 'no_show' ? 'Faltou' : appt.service}</p>
                        }
                      </button>);

                  })}
                </div>);

            })}
          </div>
        </div>
      </div>
    </Card>);

}