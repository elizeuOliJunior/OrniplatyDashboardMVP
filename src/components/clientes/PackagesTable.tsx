import React from 'react';
import { ChevronRightIcon, SearchIcon } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../Table';
import { Avatar } from '../Avatar';
import { Card, EmptyState } from '../Card';
import { ProgressBar } from '../ProgressBar';
import { PackagePendingAlert, PackageStatusBadge, SessionsBar } from '../pacotes/PackageSummaryCard';
import type { PackageSale } from '../../data/api/pacotes';
import { dataBR, formatarValor, textoDisponiveis, textoValidade } from '../../data/pacotesLib';

type Row = PackageSale & {client_name: string;};

/**
 * Sessões na tabela (L7, 16/11/2026): o texto fica em cima da barra, no fluxo normal da célula, para a tabela medir a
 * coluna pelo texto. Antes (`SessionsBar`, texto ao lado da barra sem quebrar) "Nenhuma sessão restante de 10" passava
 * por cima da validade. Mesmo texto e mesma barra (`ProgressBar xs`) da `SessionsBar`; no celular continua a `SessionsBar`.
 */
function SessionsCell({ pacote }: {pacote: Row;}) {
  const restantes = Math.max(0, pacote.saldo);
  const texto = textoDisponiveis(pacote);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold tabular-nums text-text-primary">{texto}</span>
      <ProgressBar value={Math.round(restantes / pacote.total_sessions * 100)} size="xs" ariaLabel={`Sessões: ${texto}`} className="w-full" />
    </div>);

}

/** Packages sold, as returned by GET /api/packages. Clicking a row opens the package detail (the chevron says so). */
export function PackagesTable({ rows, onOpen }: {rows: Row[];onOpen: (row: Row) => void;}) {
  if (rows.length === 0) {
    // L22d (18/11/2026, DS 6.1): vazio = `EmptyState variant="dotted"` (antes cartão com texto centralizado). Texto igual.
    return <EmptyState variant="dotted" icon={<SearchIcon />} title="Nenhum pacote neste filtro." />;
  }

  return (
    <>
      {/* R5 (06/11/2026, A-32): `relative` no contêiner da tabela (regra do DS, component-usage.md › Tables): o rótulo só
           para leitor de tela da coluna da seta ("Abrir detalhes") não alarga mais a página a 1024 px; a tabela rola dentro
           do próprio cartão quando não cabe.
           L19 (17/11/2026, DS 5.1 › Listas de registros): lista inteira com o cabeçalho preso enquanto a página rola
           (`stickyHeader`, `stickyTop={0}`: a linha do topo do Painel não fica presa no computador). */}
      <div className="hidden lg:block">
        <Table stickyHeader stickyTop={0} containerClassName="relative bg-surface">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Pacote</TableHead>
              <TableHead>Sessões</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead align="right">Recebido</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-8">
                <span className="sr-only">Abrir detalhes</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) =>
            <TableRow
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`Abrir pacote de ${p.client_name}: ${p.service_name_snapshot}`}
              onClick={() => onOpen(p)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') onOpen(p);
              }}
              className="group cursor-pointer focus:outline-none focus-visible:bg-surface-muted">
              
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={p.client_name} size="sm" />
                    <span className="truncate text-sm font-bold text-text-primary">{p.client_name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-text-primary">{p.service_name_snapshot}</p>
                  <p className="text-xs text-text-muted">vendido em {dataBR(p.sold_at)}</p>
                </TableCell>
                <TableCell>
                  {p.status === 'cancelled' ? <span className="text-sm text-text-muted">—</span> : <SessionsCell pacote={p} />}
                </TableCell>
                <TableCell className="tabular-nums text-text-secondary">{textoValidade(p)}</TableCell>
                <TableCell numeric>
                  <p className="font-semibold text-text-primary">{formatarValor(p.recebido_cents)}</p>
                  <p className="text-xs text-text-muted">de {formatarValor(p.total_amount_cents)}</p>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <PackageStatusBadge status={p.status} />
                    {p.status !== 'cancelled' && <PackagePendingAlert pacote={p} />}
                  </div>
                </TableCell>
                <TableCell className="w-8">
                  <ChevronRightIcon className="h-4 w-4 text-text-muted transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((p) =>
        <li key={p.id}>
            <Card padding="sm" variant="interactive" onClick={() => onOpen(p)} className="cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={p.client_name} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-text-primary">{p.client_name}</p>
                    <p className="truncate text-xs text-text-secondary">{p.service_name_snapshot}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <PackageStatusBadge status={p.status} />
                  <ChevronRightIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                </div>
              </div>
              {p.status !== 'cancelled' && <SessionsBar pacote={p} className="mt-3" />}
              <p className="mt-2 text-xs text-text-secondary">
                {textoValidade(p)} · recebido {formatarValor(p.recebido_cents)} de {formatarValor(p.total_amount_cents)}
              </p>
              {p.status !== 'cancelled' &&
            <div className="mt-1">
                  <PackagePendingAlert pacote={p} />
                </div>
            }
            </Card>
          </li>
        )}
      </ul>
    </>);

}