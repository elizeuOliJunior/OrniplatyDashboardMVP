import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlusIcon, ChevronRightIcon, SearchIcon } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../Table';
import { Avatar } from '../Avatar';
import { Card, EmptyState } from '../Card';
import { TagBadge } from '../client/ClientSummary';
import { smallButton } from '../ui/styles';
import { ContactListBadge } from './ClientBadges';
import type { ClientResponse } from '../../data/api/clientes';
import { TODAY_ISO } from '../../data/agendaStore';
import { dataBR } from '../../data/fichaLib';
import { useContactBlocks } from '../../data/contactPreferences';

type ClientsTableProps = {
  rows: ClientResponse[];
  onAgendar: (client: ClientResponse) => void;
};

function diasAtras(iso: string) {
  const d = Math.round((Date.parse(`${TODAY_ISO}T12:00:00`) - Date.parse(iso)) / 86400000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

/**
 * Etiqueta de restrição de contato (mesmo registro da Ficha, Retornos e Lista de espera).
 * L24a: = `ContactListBadge` (dicionário único de data/contactPreferences.ts). Mesmo tom e tamanho de antes.
 */
const OptOutPill = ContactListBadge;

/** Same columns as the real client list (Minha Empresa → Clientes), all from GET /api/clients. */
export function ClientsTable({ rows, onAgendar }: ClientsTableProps) {
  useContactBlocks();
  const navigate = useNavigate();
  const open = (c: ClientResponse) => navigate(`/clientes/${c.id}`);

  if (rows.length === 0) {
    // L22d (18/11/2026, DS 6.1): vazio = `EmptyState variant="dotted"` (antes cartão com texto centralizado). Texto igual.
    return <EmptyState variant="dotted" icon={<SearchIcon />} title="Nenhum cliente encontrado." description="Tente outro nome ou telefone." />;
  }

  // G4 (F-069): cliente arquivado não é agendado pela lista (restaure na ficha).
  const agendar = (c: ClientResponse) => c.archived_at ?
  <span className="text-xs font-semibold text-text-secondary">Arquivado</span> :

  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onAgendar(c);
    }}
    className={smallButton}
    aria-label={`Agendar ${c.name}`}>
    
      <CalendarPlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
      Agendar
    </button>;


  return (
    <>
      <div className="hidden lg:block">
        {/* L19 (17/11/2026, DS 5.1 › Listas de registros): lista inteira, cabeçalho preso no topo enquanto a página rola.
             `stickyTop={0}`: no computador a linha do topo do Painel rola junto (não fica presa). A tabela só aparece a
             partir de 1024 px; abaixo disso a lista é de cartões e não tem cabeçalho. */}
        <Table stickyHeader stickyTop={0} containerClassName="bg-surface">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Última mensagem</TableHead>
              <TableHead>Último atendimento</TableHead>
              <TableHead align="right">Atend.</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead align="right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) =>
            <TableRow
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => open(c)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') open(c);
              }}
              className="cursor-pointer focus:outline-none focus-visible:bg-surface-muted">
              
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-text-primary">{c.name}</p>
                      <p className="text-xs text-text-secondary">{c.phone}</p>
                      <OptOutPill clientId={c.id} />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="tabular-nums text-text-primary">{dataBR(c.last_contact_at) ?? '—'}</p>
                  {c.last_contact_at && <p className="text-xs text-text-muted">{diasAtras(c.last_contact_at)}</p>}
                </TableCell>
                <TableCell className="tabular-nums text-text-secondary">{dataBR(c.last_completed_at) ?? '—'}</TableCell>
                <TableCell numeric className="font-semibold text-text-primary">
                  {c.completed_appointments}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.tag_items.map((t) =>
                  <TagBadge key={t.id} tag={t} />
                  )}
                  </div>
                </TableCell>
                <TableCell align="right">
                  <div className="flex justify-end">{agendar(c)}</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((c) =>
        <li key={c.id}>
            <Card padding="sm" className="flex items-start gap-3">
              <button type="button" onClick={() => open(c)} className="flex min-w-0 flex-1 items-start gap-3 rounded-button text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Avatar name={c.name} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-text-primary">{c.name}</span>
                  <span className="block text-xs text-text-secondary">{c.phone}</span>
                  <OptOutPill clientId={c.id} />
                  <span className="mt-2 block text-xs text-text-secondary">
                    Último atendimento: <span className="font-semibold tabular-nums text-text-primary">{dataBR(c.last_completed_at) ?? '—'}</span> · {c.completed_appointments} atend.
                  </span>
                  {c.tag_items.length > 0 &&
                <span className="mt-2 flex flex-wrap gap-1">
                      {c.tag_items.map((t) =>
                  <TagBadge key={t.id} tag={t} />
                  )}
                    </span>
                }
                </span>
                <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              </button>
              {agendar(c)}
            </Card>
          </li>
        )}
      </ul>
    </>);

}