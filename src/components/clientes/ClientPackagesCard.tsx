import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { ProgressBar } from '../ProgressBar';
import { Button } from '../Button';
import { StatusBadge } from '../StatusBadge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import type { ClientRecordPackage } from '../../data/clientes';

type ClientPackagesCardProps = {
  packages: ClientRecordPackage[];
};

type PkgState = 'ativo' | 'congelado' | 'cancelado';

export function ClientPackagesCard({ packages }: ClientPackagesCardProps) {
  const toast = useToast();
  const [states, setStates] = useState<Record<string, PkgState>>({});
  const [cancelling, setCancelling] = useState<ClientRecordPackage | null>(null);
  const stateOf = (id: string) => states[id] ?? 'ativo';

  const toggleFreeze = (pkg: ClientRecordPackage) => {
    const frozen = stateOf(pkg.id) === 'congelado';
    setStates((s) => ({ ...s, [pkg.id]: frozen ? 'ativo' : 'congelado' }));
    toast(
      frozen ?
      { title: 'Pacote descongelado', description: `${pkg.service} volta a contar a validade.` } :
      { title: 'Pacote congelado', description: 'A validade fica pausada e a assistente não lembra a cliente das sessões.', tone: 'info' }
    );
  };

  return (
    <Card as="section" padding="lg">
      <CardHeader>
        <CardTitle as="h2">Pacotes</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {packages.map((pkg) => {
            const state = stateOf(pkg.id);
            return (
              <li key={pkg.id} className={`rounded-inner border border-border p-4 ${state === 'cancelado' ? 'bg-surface-muted' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm text-text-secondary">
                    <span className="font-bold text-text-primary">{pkg.service}</span> · {pkg.used} de {pkg.total} sessões usadas · válido até{' '}
                    {pkg.validUntil}
                  </p>
                  {state === 'congelado' && <StatusBadge status="info" label="Congelado" size="sm" />}
                  {state === 'cancelado' && <StatusBadge status="muted" label="Cancelado" size="sm" />}
                </div>
                <ProgressBar
                  value={Math.round(pkg.used / pkg.total * 100)}
                  ariaLabel={`${pkg.used} de ${pkg.total} sessões usadas`}
                  className="mt-3" />
                
                {state !== 'cancelado' &&
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => toggleFreeze(pkg)}>
                      {state === 'congelado' ? 'Descongelar' : 'Congelar'}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setCancelling(pkg)}>
                      Cancelar
                    </Button>
                  </div>
                }
              </li>);

          })}
        </ul>
      </CardContent>

      <ConfirmDialog
        open={!!cancelling}
        danger
        title="Cancelar este pacote?"
        description={
        cancelling ?
        `${cancelling.service} · ${cancelling.total - cancelling.used} sessões restantes. O reembolso, se houver, é combinado direto com a cliente.` :
        undefined
        }
        confirmLabel="Cancelar pacote"
        onClose={() => setCancelling(null)}
        onConfirm={() => {
          if (!cancelling) return;
          setStates((s) => ({ ...s, [cancelling.id]: 'cancelado' }));
          toast({ title: 'Pacote cancelado', description: cancelling.service });
        }} />
      
    </Card>);

}