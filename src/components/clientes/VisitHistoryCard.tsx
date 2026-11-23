import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlusIcon, ChevronRightIcon, MessageCircleIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { StatusBadge } from '../StatusBadge';
import { Button } from '../Button';
import { AppModal } from '../ui/AppModal';
import { LIST_LIMITS, ListPagination, usePaged } from '../ui/ListMore';
import type { ClientVisit } from '../../data/clientes';
import { formatBRL } from '../../utils/currency';

type VisitHistoryCardProps = {
  visits: ClientVisit[];
  /** Opens the new-appointment form with the same service and professional */
  onRebook?: (visit: ClientVisit) => void;
};

function Field({ label, children }: {label: string;children: React.ReactNode;}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-text-primary">{children}</dd>
    </div>);

}

function AttendanceBadge({ visit }: {visit: ClientVisit;}) {
  return visit.attendance === 'compareceu' ?
  <StatusBadge status="success" label="Compareceu" size="sm" /> :

  <StatusBadge status="warning" label="Faltou" size="sm" />;

}

export function VisitHistoryCard({ visits, onRebook }: VisitHistoryCardProps) {
  const [open, setOpen] = useState<ClientVisit | null>(null);
  const paged = usePaged(visits, LIST_LIMITS.visits);
  return (
    <Card as="section" padding="lg">
      <CardHeader>
        <CardTitle as="h2">Histórico de atendimentos</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {paged.pageItems.map((visit) =>
          <li key={visit.id} className="py-1 first:pt-0 last:pb-0">
              <button
              type="button"
              onClick={() => setOpen(visit)}
              aria-label={`Ver atendimento de ${visit.date}, ${visit.service}`}
              className="grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-button px-2 py-2 text-left transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:grid-cols-[56px_minmax(0,1fr)_110px_120px_16px]">
              
                <span className="text-sm font-bold tabular-nums text-text-primary">{visit.date}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-text-primary">{visit.service}</span>
                  <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: visit.professionalColor }} aria-hidden="true" />
                    {visit.professional}
                  </span>
                </span>
                <span className="text-right text-sm font-semibold tabular-nums text-text-primary">{formatBRL(visit.value)}</span>
                <span className="col-start-2 sm:col-start-auto sm:justify-self-end">
                  <AttendanceBadge visit={visit} />
                </span>
                <ChevronRightIcon className="hidden h-4 w-4 text-text-muted sm:block" aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
        <ListPagination
          page={paged.page}
          totalPages={paged.totalPages}
          onPageChange={paged.setPage}
          totalItems={visits.length}
          pageSize={LIST_LIMITS.visits}
          itemLabel="atendimentos" />
        
      </CardContent>

      <VisitDetailsModal visit={open} onClose={() => setOpen(null)} onRebook={onRebook} />
    </Card>);

}

/** Details of one past appointment (used in the client record and in Conversas). */
export function VisitDetailsModal({ visit, onClose, onRebook }: {visit: ClientVisit | null;onClose: () => void;onRebook?: (visit: ClientVisit) => void;}) {
  const navigate = useNavigate();
  return (
    <AppModal
      open={!!visit}
      onClose={onClose}
      title={visit ? visit.service : ''}
      description={visit ? `Atendimento de ${visit.date}` : undefined}
      footer={
      visit &&
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            {onRebook &&
        <Button
          fullWidth
          leftIcon={<CalendarPlusIcon className="h-4 w-4" />}
          onClick={() => {
            onRebook(visit);
            onClose();
          }}
          className="sm:order-2">
          
                Agendar de novo
              </Button>
        }
            <Button
          fullWidth
          variant="secondary"
          leftIcon={<MessageCircleIcon className="h-4 w-4" />}
          onClick={() => {
            onClose();
            navigate('/conversas');
          }}
          className={onRebook ? 'sm:order-1' : 'sm:col-span-2'}>
          
              Ver conversa
            </Button>
          </div>

      }>
      
      {visit &&
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Data">
            <span className="tabular-nums">{visit.date}</span>
          </Field>
          <Field label="Profissional">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: visit.professionalColor }} aria-hidden="true" />
              {visit.professional}
            </span>
          </Field>
          <Field label="Valor">
            <span className="tabular-nums">{formatBRL(visit.value)}</span>
          </Field>
          <Field label="Presença">
            <AttendanceBadge visit={visit} />
          </Field>
        </dl>
      }
    </AppModal>);

}