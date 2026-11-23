import React, { useState } from 'react';
import { BarChart3Icon, ChevronRightIcon } from 'lucide-react';
import { Button } from '../Button';
import { AppModal } from '../ui/AppModal';
import { NoticeInline } from '../ui/Notice';
import { EmptyState } from '../EmptyState';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { KpiStatCard } from '../KpiStatCard';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../Table';
import { ConvenioCard } from '../convenios/ConvenioPanel';
import { SAMPLE_FROM, SAMPLE_TO, rangeLabel } from '../../data/receiptsPeriod';
import type { DayRow, PeriodSummary, ServiceRow } from '../../data/receiptsPeriod';
import { formatBRL } from '../../utils/currency';

/** Gráfico de colunas "Recebido por dia" do período escolhido, em SVG, uma cor só. */
function DailyReceiptsChart({ days, label }: {days: DayRow[];label: string;}) {
  const width = 720;
  const height = 220;
  const pad = { top: 12, right: 8, bottom: 28, left: 68 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const step = 350;
  const maxValue = Math.max(step, Math.ceil(Math.max(...days.map((d) => d.received)) / step) * step);
  const ticks = [0, 1, 2, 3, 4].map((i) => maxValue / 4 * i);
  const slot = innerW / days.length;
  const barW = Math.min(36, slot * 0.6);
  const every = Math.ceil(days.length / 11);
  const y = (v: number) => pad.top + innerH - v / maxValue * innerH;

  return (
    <Card as="section" padding="lg" className="flex h-full flex-col">
      <CardHeader>
        <CardTitle as="h2">Recebido por dia</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[480px]" role="img" aria-label={`Gráfico de colunas com o valor recebido em cada dia útil de ${label}`}>
            {ticks.map((t) =>
            <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#EAF2F1" strokeWidth={1} />
                <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#587371">
                  {t === 0 ? 'R$ 0' : `R$ ${Math.round(t).toLocaleString('pt-BR')}`}
                </text>
              </g>
            )}
            {days.map((d, i) => {
              const x = pad.left + i * slot + (slot - barW) / 2;
              return (
                <g key={d.iso}>
                  <rect x={x} y={y(d.received)} width={barW} height={pad.top + innerH - y(d.received)} rx={3} fill="#0E7490">
                    <title>{`${d.label}: ${formatBRL(d.received)}`}</title>
                  </rect>
                  {i % every === 0 &&
                  <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="#587371">
                      {d.label}
                    </text>
                  }
                </g>);

            })}
          </svg>
        </div>
      </CardContent>
    </Card>);

}

function TopServicesCard({ services }: {services: ServiceRow[];}) {
  const [open, setOpen] = useState<ServiceRow | null>(null);
  const total = services.reduce((sum, s) => sum + s.value, 0);
  return (
    <Card as="section" padding="lg" className="flex h-full flex-col">
      <CardHeader>
        <CardTitle as="h2">Serviços mais realizados</CardTitle>
      </CardHeader>
      <CardContent>
        <Table containerClassName="bg-surface">
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead align="right">Quantidade</TableHead>
              <TableHead align="right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) =>
            <TableRow key={s.id}>
                <TableCell className="font-semibold text-text-primary">
                  <button
                  type="button"
                  onClick={() => setOpen(s)}
                  aria-label={`Ver detalhes de ${s.name}`}
                  className="inline-flex items-center gap-1 rounded-sm text-left underline-offset-2 hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7490]">
                  
                    {s.name}
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  </button>
                </TableCell>
                <TableCell numeric className="text-text-secondary">
                  {s.count}
                </TableCell>
                <TableCell numeric className="font-semibold text-text-primary">
                  {formatBRL(s.value)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <AppModal
        open={!!open}
        onClose={() => setOpen(null)}
        size="sm"
        title={open?.name ?? ''}
        description="Recebido no período escolhido"
        footer={
        <Button fullWidth variant="secondary" onClick={() => setOpen(null)}>
            Fechar
          </Button>
        }>
        
        {open &&
        <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Atendimentos</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-text-primary">{open.count}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Recebido</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-text-primary">{formatBRL(open.value)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Valor médio</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{open.count ? formatBRL(Math.round(open.value / open.count)) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Parte desta lista</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{total ? Math.round(open.value / total * 100) : 0}%</dd>
            </div>
          </dl>
        }
      </AppModal>
    </Card>);

}

/** Recebimentos do período escolhido: TODOS os blocos usam o mesmo `summary.range`. */
export function RecebimentosTab({ summary }: {summary: PeriodSummary;}) {
  const { range } = summary;
  const label = rangeLabel(range);
  return (
    <div className="flex flex-col gap-6">
      {!summary.hasData ?
      <EmptyState
        icon={<BarChart3Icon />}
        title={`Sem dados de exemplo para ${label}`}
        description={`No protótipo, os números de exemplo cobrem os dias úteis de ${rangeLabel({ from: SAMPLE_FROM, to: SAMPLE_TO })}. No produto, cada período mostra o que foi recebido.`} /> :


      <>
          {summary.outsideSample &&
        <NoticeInline tone="warning" role="status" title="Parte deste período está fora dos dados de exemplo">
              Os números contam só {rangeLabel({ from: SAMPLE_FROM, to: SAMPLE_TO })}.
            </NoticeInline>
        }
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiStatCard label="Faturamento realizado" value={summary.received} format="currency" />
            <KpiStatCard label="Valor agendado" value={summary.scheduled} format="currency" />
            <KpiStatCard label="Taxa de presença" value={summary.presence} format="percent" decimals={0} />
            <KpiStatCard label="Ticket médio" value={summary.ticket} format="currency" />
          </div>
          {/* UX-03/UX-06 (15/10/2026): definição curta de cada indicador, na mesma ordem dos cartões. Coerente com data/receiptsPeriod.ts. */}
          <dl aria-label="Como cada número é calculado" className="-mt-3 flex flex-col gap-1 text-xs text-text-muted">
            <div>
              <dt className="inline font-semibold">Faturamento realizado:</dt> <dd className="inline">valor recebido no período.</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Valor agendado:</dt> <dd className="inline">soma do preço dos atendimentos marcados no período, com ou sem comparecimento.</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Taxa de presença:</dt> <dd className="inline">atendidos ÷ (atendidos + faltas).</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Ticket médio:</dt>{' '}
              <dd className="inline">
                faturamento ÷ {summary.attended} {summary.attended === 1 ? 'atendimento realizado' : 'atendimentos realizados'} no período.
              </dd>
            </div>
          </dl>
          <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <DailyReceiptsChart days={summary.days} label={label} />
            <TopServicesCard services={summary.services} />
          </div>
        </>
      }
      <ConvenioCard range={range} />
    </div>);

}