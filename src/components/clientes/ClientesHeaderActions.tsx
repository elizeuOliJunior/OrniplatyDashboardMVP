import React, { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '../Button';
import { ImportarPlanilhaModal } from '../modals/ImportarPlanilhaModal';
import { NovoClienteModal } from '../modals/NovoClienteModal';
import type { NovoClienteData } from '../modals/NovoClienteModal';

type ClientesHeaderActionsProps = {
  onCreated?: (data: NovoClienteData) => void;
};

export function ClientesHeaderActions({ onCreated }: ClientesHeaderActionsProps) {
  const [importOpen, setImportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => setImportOpen(true)}>
        Importar planilha
      </Button>
      <Button leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
        Novo cliente
      </Button>
      <ImportarPlanilhaModal open={importOpen} onClose={() => setImportOpen(false)} />
      <NovoClienteModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={onCreated} />
    </div>);

}