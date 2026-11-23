import React, { useRef, useState } from 'react';
import { ChevronDownIcon, SlidersHorizontalIcon } from 'lucide-react';
import { Checkbox, CountBadge } from '../Card';
import { Button } from '../Button';
import { FilterButton } from '../ui/FilterButton';
import { PickerPopover } from '../ui/PickerPopover';
import { AgendaDateNav, AgendaViewSwitch } from './AgendaDateNav';
import type { AgendaView } from './AgendaDateNav';
import { AgendaLegend } from './AgendaLegend';
import { ProfessionalFilter } from './ProfessionalFilter';
import type { AgendaProfessional } from '../../data/agenda';

/** @deprecated mantido só por compatibilidade de tipos; a agenda não tem mais a chave "Por profissional / Todos juntos". */
export type AgendaGrouping = 'colunas' | 'lista';

type Props = {
  view: AgendaView;
  onViewChange: (v: AgendaView) => void;
  periodLabel: string;
  currentIso: string;
  atToday: boolean;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPickDate: (iso: string) => void;
  professionals: AgendaProfessional[];
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
  hideNonWorkingDays: boolean;
  onHideNonWorkingDaysChange: (value: boolean) => void;
  /** Dias fechados escondidos na semana atual que têm agendamentos (só na Semana) */
  hiddenWithAppointments?: number;
  /** W3 (G4): filtro "Só A confirmar" (Dia e Semana). */
  onlyPending?: boolean;
  onOnlyPendingChange?: (value: boolean) => void;
  /** Quantos "A confirmar" há no período mostrado. */
  pendingCount?: number;
  /** P2: legenda recolhida (estado na página, para não fechar ao trocar Dia/Semana/Mês). */
  legendOpen?: boolean;
  onLegendOpenChange?: (open: boolean) => void;
  /** L18, rodada 4: ações da página ("Bloquear horário ou folga" e "+ Novo agendamento"), no fim da linha 1. */
  actions?: React.ReactNode;
};

const LEGEND_ID = 'agenda-legenda';

/**
 * Cabeçalho ÚNICO da Agenda (Dia, Semana e Mês), sempre na mesma ordem.
 * L18, rodada 4 (17/11/2026, pedido do Christian; substitui as rodadas 1 a 3):
 * - linha 1: "Hoje", setas e data à esquerda · "Bloquear horário ou folga" e "+ Novo agendamento" à direita (36 px).
 * - linha 2: Dia/Semana/Mês · "Filtros" · "Exibição" · "Todos os profissionais". "Filtros" e "Exibição" abrem painéis
 *   flutuantes (`PickerPopover`):
 *   - "Filtros da agenda": "Só “A confirmar”" (com o número) e "Ocultar dias fechados" como caixas de marcar e "Limpar filtros".
 *   - "Exibição da agenda": "Mostrar legenda" (abre a legenda embaixo da barra) e a legenda de estados.
 * - Embaixo: a legenda aberta e/ou a frase do filtro "Só A confirmar".
 * L22 (DS 6.1 = "5.2" do DS4): "Filtros" = `FilterButton size="md"` e "Exibição" = `Button variant="neutral" size="md"`
 * com ícone e seta (36 px, texto 14 px, como o resto da barra). Dentro das janelinhas: `Checkbox size="sm"` (14 px).
 */
export function AgendaToolbar({ professionals, selectedIds, onSelectedIds, hideNonWorkingDays, onHideNonWorkingDaysChange, hiddenWithAppointments = 0, onlyPending = false, onOnlyPendingChange, pendingCount = 0, legendOpen = false, onLegendOpenChange, actions, ...nav }: Props) {
  const showBadge = hideNonWorkingDays && nav.view === 'semana' && hiddenWithAppointments > 0;
  const badgeText = `${hiddenWithAppointments} ${hiddenWithAppointments === 1 ? 'dia oculto tem agendamentos' : 'dias ocultos têm agendamentos'}`;
  const showPending = !!onOnlyPendingChange && nav.view !== 'mes';
  const showStatus = showPending && onlyPending;
  const filtersRef = useRef<HTMLButtonElement>(null);
  const displayRef = useRef<HTMLButtonElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const activeFilters = (showPending && onlyPending ? 1 : 0) + (hideNonWorkingDays ? 1 : 0);
  const clearFilters = () => {
    if (onlyPending) onOnlyPendingChange?.(false);
    if (hideNonWorkingDays) onHideNonWorkingDaysChange(false);
  };
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <AgendaDateNav {...nav} />
          {actions && <div className="w-full sm:ml-auto sm:w-auto">{actions}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AgendaViewSwitch view={nav.view} onViewChange={nav.onViewChange} />
          <FilterButton ref={filtersRef} size="md" count={activeFilters} open={filtersOpen} onClick={() => setFiltersOpen((v) => !v)} />
          <Button
            ref={displayRef}
            variant="neutral"
            size="md"
            aria-haspopup="dialog"
            aria-expanded={displayOpen}
            onClick={() => setDisplayOpen((v) => !v)}
            leftIcon={<SlidersHorizontalIcon className="h-4 w-4" />}
            rightIcon={<ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${displayOpen ? 'rotate-180' : ''}`} />}>
            
            Exibição
          </Button>
          <ProfessionalFilter professionals={professionals} selected={selectedIds} onChange={onSelectedIds} />
        </div>
      </div>

      <PickerPopover open={filtersOpen} anchorRef={filtersRef} onClose={() => setFiltersOpen(false)} width={300} label="Filtros da agenda" padding="p-4">
        <p className="text-sm font-bold text-text-primary">Filtros da agenda</p>
        <div className="mt-3 flex flex-col gap-3">
          {showPending &&
          <Checkbox
            size="sm"
            checked={onlyPending}
            onChange={(c: boolean) => onOnlyPendingChange?.(c)}
            aria-label={`Só A confirmar. ${pendingCount} a confirmar ${nav.view === 'dia' ? 'neste dia' : 'nesta semana'}`}
            label={
            <span className="inline-flex items-center gap-2">
                  Só “A confirmar”
                  <CountBadge count={pendingCount} size="sm" aria-hidden="true" />
                </span>
            } />

          }
          <Checkbox
            size="sm"
            checked={hideNonWorkingDays}
            onChange={(c: boolean) => onHideNonWorkingDaysChange(c)}
            label={
            <span className="inline-flex items-center gap-2">
                Ocultar dias fechados
                {showBadge && <CountBadge count={hiddenWithAppointments} size="sm" aria-hidden="true" />}
              </span>
            }
            description={showBadge ? badgeText : undefined} />
          
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <Button size="sm" variant="neutral" onClick={clearFilters} disabled={activeFilters === 0} className="w-full justify-center">
            Limpar filtros
          </Button>
        </div>
      </PickerPopover>

      <PickerPopover open={displayOpen} anchorRef={displayRef} onClose={() => setDisplayOpen(false)} width={320} label="Exibição da agenda" padding="p-4">
        <p className="text-sm font-bold text-text-primary">Exibição da agenda</p>
        <div className="mt-3">
          <Checkbox size="sm" checked={legendOpen} onChange={(c: boolean) => onLegendOpenChange?.(c)} label="Mostrar legenda" description="Embaixo da barra, em Dia, Semana e Mês." />
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Legenda de estados</p>
          <AgendaLegend className="!grid !grid-cols-1 !gap-y-2" />
        </div>
      </PickerPopover>

      {(legendOpen || showStatus) &&
      <div className="flex flex-col gap-2 border-t border-border px-4 py-2">
          {legendOpen && <AgendaLegend id={LEGEND_ID} className="w-full sm:!gap-x-4" />}
          {showStatus &&
        <p role="status" className="w-full text-xs font-semibold text-text-secondary">
              {pendingCount === 0 ?
          `Nenhum agendamento “A confirmar” ${nav.view === 'dia' ? 'neste dia' : 'nesta semana'}. ` :
          `Mostrando só os ${pendingCount} agendamentos “A confirmar”. `}
              Os outros continuam marcados e ocupam o horário. Para ver todos, desmarque “Só A confirmar” em Filtros.
            </p>
        }
        </div>
      }
    </div>);

}