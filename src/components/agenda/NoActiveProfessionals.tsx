import React from 'react';
import { UsersIcon } from 'lucide-react';
import { Card } from '../Card';
import { Button } from '../Button';
import { StatusPill } from '../ui/StatusPill';
import { agendaProfessionalOf } from '../../data/availability';
import { mediumDayLabel } from '../../data/agendaStore';
import type { CalAppointment } from '../../data/agendaStore';

const STATUS_TEXT: Record<CalAppointment['status'], string> = {
  confirmed: 'Confirmado',
  pending_confirmation: 'A confirmar',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Faltou'
};

export type OrphanItem = {iso: string;appt: CalAppointment;conflict?: string;};

/**
 * Agenda SEM profissional ativo (G1, ajuste do F-003, 23/10/2026). A grade continua vindo só da equipe ATIVA (fonte
 * canônica), então não há colunas. Em vez de uma grade vazia, este cartão explica o motivo e lista os agendamentos já
 * marcados no período (nada é cancelado nem movido); cada linha abre o atendimento e os conflitos ficam em Notificações.
 */
export function NoActiveProfessionals({
  toolbar,
  periodLabel,
  items,
  conflictsCount,
  onOpen,
  onConflicts,
  onTeam








}: {toolbar: React.ReactNode;periodLabel: string;items: OrphanItem[];conflictsCount: number;onOpen: (iso: string, appt: CalAppointment) => void;onConflicts: () => void;onTeam: () => void;}) {
  return (
    <Card as="section" padding="none" aria-labelledby="agenda-sem-profissional" className="min-w-0 overflow-hidden">
      <div className="border-b border-border">{toolbar}</div>
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
            <UsersIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="agenda-sem-profissional" className="text-base font-bold text-text-primary">
              Nenhum profissional ativo
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              A agenda mostra uma coluna para cada profissional ativo. Como todos estão arquivados, nenhum horário novo é oferecido, nem
              pela assistente. Nada foi cancelado nem movido: os agendamentos já marcados continuam guardados e aparecem abaixo.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="md" onClick={onTeam} className="w-full sm:w-auto">
            Reativar ou adicionar profissional
          </Button>
          {conflictsCount > 0 &&
          <Button variant="secondary" size="md" onClick={onConflicts} className="w-full sm:w-auto">
              Ver conflitos ({conflictsCount})
            </Button>
          }
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-bold text-text-primary">
            Agendamentos · {periodLabel} <span className="font-semibold tabular-nums text-text-muted">({items.length})</span>
          </h3>
          {items.length === 0 ?
          <p className="mt-2 text-sm text-text-secondary">Nenhum agendamento neste período.</p> :

          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {items.map(({ iso, appt, conflict }) => {
              const pro = agendaProfessionalOf(appt.professionalId);
              return (
                <li key={`${iso}-${appt.id}`}>
                    <button
                    type="button"
                    onClick={() => onOpen(iso, appt)}
                    aria-label={`${mediumDayLabel(iso)}, ${appt.start}, ${appt.clientName}, ${appt.service}${conflict ? '. Conflito de horário' : ''}. Abrir atendimento`}
                    className="flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:flex-row sm:items-center sm:gap-3">
                    
                      <span className="shrink-0 text-xs font-bold tabular-nums text-text-secondary sm:w-36">
                        {mediumDayLabel(iso)} · {appt.start}–{appt.end}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text-primary">{appt.clientName}</span>
                        <span className="block truncate text-xs text-text-secondary">
                          {appt.service}
                          {pro ? ` · ${pro.name} (arquivado)` : ''}
                        </span>
                      </span>
                      <span className="shrink-0">
                        {conflict ? <StatusPill tone="error" label="Conflito" /> : <StatusPill tone="neutral" label={STATUS_TEXT[appt.status] ?? appt.status} />}
                      </span>
                    </button>
                  </li>);

            })}
            </ul>
          }
        </div>
      </div>
    </Card>);

}