import React, { useState } from 'react';
import { PackageIcon, PackagePlusIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { Button } from '../Button';
import { PackageSummaryCard } from './PackageSummaryCard';
import { PackageDetailModal } from './PackageDetailModal';
import { VendaDePacoteModal } from './VendaDePacoteModal';
import { listPackages, useBackendVersion } from '../../data/api/pacotes';
import { TEXTO_SEM_PACOTE } from '../../data/pacotesLib';

/** The patient's packages (real `ClientPackagesModal`): list, detail and "Vender pacote" with the patient preselected. */
export function ClientPackagesModal({ open, clientId, clientName, onClose, canSell = true }: {open: boolean;clientId: string;clientName: string;onClose: () => void;canSell?: boolean;}) {
  useBackendVersion();
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [vendendo, setVendendo] = useState(false);
  const itens = listPackages({ client_id: clientId });

  return (
    <>
      <AppModal
        open={open && !abertoId && !vendendo}
        onClose={onClose}
        title="Pacotes"
        description={clientName}
        footer={
        <>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            {itens.length > 0 && canSell &&
          <Button leftIcon={<PackagePlusIcon className="h-4 w-4" />} onClick={() => setVendendo(true)}>
                Vender pacote
              </Button>
          }
          </>
        }>
        
        {itens.length === 0 ?
        <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
              <PackageIcon className="h-5 w-5 text-text-muted" aria-hidden="true" />
            </span>
            <p className="text-sm font-bold text-text-primary">Nenhum pacote</p>
            <p className="max-w-sm text-sm text-text-secondary">{canSell ? TEXTO_SEM_PACOTE : 'Cliente arquivado: restaure para vender um pacote.'}</p>
            {canSell &&
          <Button className="mt-2" leftIcon={<PackagePlusIcon className="h-4 w-4" />} onClick={() => setVendendo(true)}>
                Vender pacote
              </Button>
          }
          </div> :

        <ul className="flex flex-col gap-3">
            {itens.map((p) =>
          <li key={p.id}>
                <PackageSummaryCard pacote={p} onAbrir={(x) => setAbertoId(x.id)} />
              </li>
          )}
          </ul>
        }
      </AppModal>

      <PackageDetailModal packageSaleId={abertoId} nomeDoPaciente={clientName} onClose={() => setAbertoId(null)} />
      <VendaDePacoteModal open={vendendo} clientePreSelecionadoId={clientId} onClose={() => setVendendo(false)} />
    </>);

}