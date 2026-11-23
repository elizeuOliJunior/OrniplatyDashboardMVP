import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { revenueSources } from '../../data/resultados';
import { formatBRL } from '../../utils/currency';

export function RevenueSourcesCard() {
  const max = Math.max(...revenueSources.map((s) => s.value));
  return (
    <Card as="section" padding="lg">
      <CardHeader>
        <CardTitle as="h2">De onde veio</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {revenueSources.map((source) =>
          <li key={source.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-text-primary">
                  {source.label}
                  {source.note && <span className="ml-2 text-xs font-medium text-text-muted">{source.note}</span>}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-text-primary">{formatBRL(source.value)}</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${max ? source.value / max * 100 : 0}%` }} />
              </div>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>);

}