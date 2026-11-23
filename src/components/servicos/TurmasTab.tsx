import React, { useMemo, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { ProfessionalTag, StatusBadge, clickableChevronClass, clickableCardClass } from '../Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../Table';
import { Select } from '../Select';
import { PillGroup } from '../Pill';
import { EmptyState } from '../EmptyState';
import { toolbarClass } from '../ui/styles';
import { isGroupService } from '../../data/servicesStore';
import type { ServiceItem } from '../../data/servicesStore';
import type { TeamMember } from '../../data/equipeFuncionamento';
import { occupancyOf, turmaWhen, useTurmas } from '../../data/turmas';
import type { Turma } from '../../data/turmas';

type Props = {
  turmas: Turma[];
  services: ServiceItem[];
  members: TeamMember[];
  onOpen: (t: Turma) => void;
  /** Botão à direita da barra da lista ("+ Nova turma"), como em Serviços. */
  action?: React.ReactNode;
};

const ALL = 'todos';

/**
 * Serviços e equipe › Turmas (G1, aulas em grupo, 23/11/2026; CONTRATO NOVO). Mesmo padrão da lista de serviços
 * (`ServicosTab`): barra com filtro e "+ Nova turma" à direita, tabela com linha inteira clicável e seta, cartões no
 * celular, vazio pontilhado. A aba só existe enquanto há um serviço em grupo ativo (pages/ServicosEquipe.tsx).
 */
export function TurmasTab({ turmas, services, members, onOpen, action }: Props) {
  const turmasState = useTurmas();
  const [service, setService] = useState(ALL);
  const [show, setShow] = useState<'ativas' | 'arquivadas'>('ativas');
  const groupServices = services.filter((s) => isGroupService(s) && (s.active || turmas.some((t) => t.serviceId === s.id)));
  const filtered = useMemo(
    () =>
    turmas.
    filter((t) => (show === 'ativas' ? t.active : !t.active) && (service === ALL || t.serviceId === service)).
    sort((a, b) => a.weekdays[0] - b.weekdays[0] || a.startTime.localeCompare(b.startTime)),
    [turmas, show, service]
  );
  const archivedCount = turmas.filter((t) => !t.active).length;
  const serviceOf = (t: Turma) => services.find((s) => s.id === t.serviceId);
  const proOf = (t: Turma) => members.find((m) => m.id === t.professionalId);
  const seats = (t: Turma) => {
    const capacity = serviceOf(t)?.group?.capacity ?? 0;
    const n = occupancyOf(t.id, turmasState);
    return { n, capacity, full: capacity > 0 && n >= capacity };
  };
  const Seats = ({ t }: {t: Turma;}) => {
    const v = seats(t);
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="tabular-nums font-semibold text-text-primary">
          {v.n} de {v.capacity}
        </span>
        {v.full && <StatusBadge status="neutral" label="Lotada" />}
      </span>);

  };
  const Pro = ({ t }: {t: Turma;}) => {
    const p = proOf(t);
    return p ? <ProfessionalTag name={p.name} color={p.color} size="sm" /> : <span className="text-sm text-text-muted">Sem profissional</span>;
  };
  const rowKey = (t: Turma) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(t);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`${toolbarClass} justify-between`}>
        <div className={toolbarClass}>
          <Select ariaLabel="Serviço" className="w-full sm:w-60" options={[{ value: ALL, label: 'Todos os serviços' }, ...groupServices.map((s) => ({ value: s.id, label: s.name }))]} value={service} onChange={setService} />
          <PillGroup
            size="sm"
            options={[
            { value: 'ativas', label: 'Ativas' },
            { value: 'arquivadas', label: archivedCount ? `Arquivadas (${archivedCount})` : 'Arquivadas' }]
            }
            value={show}
            onChange={(v) => (v === 'ativas' || v === 'arquivadas') && setShow(v)} />
          
        </div>
        {action}
      </div>

      {filtered.length === 0 ?
      <EmptyState
        variant="dotted"
        title={show === 'arquivadas' ? 'Nenhuma turma arquivada' : service !== ALL ? 'Nenhuma turma deste serviço' : 'Nenhuma turma cadastrada'}
        description={show === 'arquivadas' ? 'Turmas arquivadas saem da lista. Os clientes inscritos ficam guardados.' : 'Crie uma turma para dizer em que dias e horário o serviço em grupo acontece e quem participa.'} /> :


      <>
          {/* Desktop / tablet */}
          <div className="hidden md:block">
            <Table containerClassName="bg-surface">
              <TableHeader>
                <TableRow>
                  <TableHead>Turma</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Vagas</TableHead>
                  <TableHead align="right">
                    <span className="sr-only">Abrir</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) =>
              <TableRow key={t.id} tabIndex={0} role="button" aria-label={`Abrir turma de ${serviceOf(t)?.name ?? ''}, ${turmaWhen(t)}`} onClick={() => onOpen(t)} onKeyDown={rowKey(t)} className="group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                    <TableCell>
                      <p className="text-sm font-bold text-text-primary">{serviceOf(t)?.name ?? 'Serviço removido'}</p>
                      <p className="text-xs text-text-secondary">{turmaWhen(t)}</p>
                    </TableCell>
                    <TableCell>
                      <Pro t={t} />
                    </TableCell>
                    <TableCell>
                      <Seats t={t} />
                    </TableCell>
                    <TableCell align="right">
                      <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                    </TableCell>
                  </TableRow>
              )}
              </TableBody>
            </Table>
          </div>

          {/* Celular */}
          <ul className="flex flex-col gap-3 md:hidden">
            {filtered.map((t) =>
          <li key={t.id}>
                <button type="button" onClick={() => onOpen(t)} className={`${clickableCardClass} flex-col items-stretch`} aria-label={`Abrir turma de ${serviceOf(t)?.name ?? ''}, ${turmaWhen(t)}`}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-text-primary">{serviceOf(t)?.name ?? 'Serviço removido'}</span>
                      <span className="block text-xs text-text-secondary">{turmaWhen(t)}</span>
                    </span>
                    <ChevronRightIcon className={`${clickableChevronClass} mt-0.5`} aria-hidden="true" />
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                    <Pro t={t} />
                    <Seats t={t} />
                  </span>
                </button>
              </li>
          )}
          </ul>
        </>
      }
    </div>);

}