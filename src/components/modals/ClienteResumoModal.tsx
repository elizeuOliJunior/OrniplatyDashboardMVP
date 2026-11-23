import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlusIcon, MessageCircleIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { Button } from '../Button';
import { Avatar } from '../Avatar';
import { ClientMessagesBadge, ClientTags, packageLabel } from '../clientes/ClientBadges';
import { NovoAgendamentoModal } from './NovoAgendamentoModal';
import type { Client } from '../../data/clientes';
import { formatBRL } from '../../utils/currency';

/** Quick view for clients whose full record is not built in the prototype. */
export function ClienteResumoModal({ client, onClose }: {client: Client | null;onClose: () => void;}) {
  const navigate = useNavigate();
  const [scheduling, setScheduling] = useState(false);

  return (
    <>
      <AppModal
        open={!!client && !scheduling}
        onClose={onClose}
        title={client?.name ?? ''}
        description={client?.phone}
        footer={
        <>
            <Button
            variant="secondary"
            leftIcon={<MessageCircleIcon className="h-4 w-4" />}
            onClick={() => {
              onClose();
              navigate('/conversas');
            }}>
            
              Ver conversas
            </Button>
            <Button leftIcon={<CalendarPlusIcon className="h-4 w-4" />} onClick={() => setScheduling(true)}>
              Agendar
            </Button>
          </>
        }>
        
        {client &&
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={client.name} size="lg" />
              <ClientTags tags={client.tags} />
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-semibold text-text-muted">Última visita</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{client.lastVisit}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-muted">Total gasto</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{formatBRL(client.totalSpent)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-muted">Pacote</dt>
                <dd className="mt-0.5 text-sm font-semibold text-text-primary">{packageLabel(client)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-muted">Mensagens automáticas</dt>
                <dd className="mt-1">
                  <ClientMessagesBadge status={client.messages} />
                </dd>
              </div>
            </dl>
          </div>
        }
      </AppModal>

      <NovoAgendamentoModal
        open={scheduling}
        defaults={client ? { client: client.name } : undefined}
        onClose={() => {
          setScheduling(false);
          onClose();
        }} />
      
    </>);

}