import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { Toggle } from '../Toggle';
import { StatusBadge } from '../StatusBadge';
import type { ClientRecord } from '../../data/clientes';

type ClientSidePanelsProps = {
  record: ClientRecord;
};

export function ClientSidePanels({ record }: ClientSidePanelsProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card as="section" padding="lg">
        <CardHeader>
          <CardTitle as="h2">Preferência de contato</CardTitle>
        </CardHeader>
        <CardContent>
          <Toggle
            defaultChecked={record.receivesAutomatedMessages}
            labelPosition="left"
            label="Recebe mensagens automáticas"
            description="Se a cliente pedir para parar, desligamos automaticamente." />
          
        </CardContent>
      </Card>

      <Card as="section" padding="lg">
        <CardHeader>
          <CardTitle as="h2">Observações</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {record.observations.map((obs) =>
            <li key={obs.id} className="flex flex-col gap-2 py-3 first:pt-0">
                <p className="text-sm font-semibold text-text-primary">{obs.text}</p>
                <Toggle size="sm" defaultChecked={obs.aiCanUse} label="A IA pode usar esta informação" />
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs text-text-muted">Desligado por padrão. Só ligue o que ajuda a IA a atender melhor.</p>
        </CardContent>
      </Card>

      <Card as="section" padding="lg">
        <CardHeader>
          <CardTitle as="h2">Oportunidades e acionamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {record.opportunities.map((op) =>
            <li key={op.id} className="flex items-center justify-between gap-3">
                <p className="text-sm text-text-primary">{op.text}</p>
                <StatusBadge status="success" label={op.badge} size="sm" className="shrink-0" />
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>);

}