import { LoadErrorGate } from '../components/ui/LoadErrorGate';
import React, { useState } from 'react';
import { PackagePlusIcon, XIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Button } from '../components/Button';
import { Pill } from '../components/Pill';
import { ClientesTabs } from '../components/clientes/ClientesTabs';
import { PackagesTable } from '../components/clientes/PackagesTable';
import { PackageDetailModal } from '../components/pacotes/PackageDetailModal';
import { VendaDePacoteModal } from '../components/pacotes/VendaDePacoteModal';
import { listPackages, useBackendVersion } from '../data/api/pacotes';
import { clientById, isDeletedClientKey, useClientsVersion } from '../data/api/clientes';
import { STATUS_PACOTE } from '../data/pacotesLib';

const FILTROS = [{ value: 'todos', label: 'Todos' }, ...Object.entries(STATUS_PACOTE).map(([value, label]) => ({ value, label }))];

/** All packages sold (real: Financeiro → aba Pacotes), filtered by the status the API returns. */
export function ClientesPacotes() {
  useBackendVersion();
  useClientsVersion();
  const [filtro, setFiltro] = useState('todos');
  const [aberto, setAberto] = useState<{id: string;nome: string;} | null>(null);
  const [vendendo, setVendendo] = useState(false);
  // G4 (F-069): pacotes de cliente excluído saem da lista de operação; recebimentos e reembolsos continuam em Resultados.
  const [params, setParams] = useSearchParams();
  // G4 (F-056): a aba Pacotes é a casa dos pacotes; a Ficha leva para cá com `?cliente=<id>` (só os pacotes dele).
  const onlyClient = params.get('cliente');
  const onlyName = onlyClient ? clientById(onlyClient)?.name ?? null : null;
  const todos = listPackages().filter((p) => !isDeletedClientKey(p.client_id) && (!onlyName || p.client_id === onlyClient));
  const rows = filtro === 'todos' ? todos : todos.filter((p) => p.status === filtro);
  // L19: sem paginação (DS 5.1). Total de pacotes (sem o filtro de status nem o de cliente) para "{n} de {N} pacotes".
  const totalPacotes = listPackages().filter((p) => !isDeletedClientKey(p.client_id)).length;
  const filtrado = filtro !== 'todos' || !!onlyName;

  return (
    <DashboardLayout activeId="clientes" title="Clientes" subtitle="Quem são seus clientes e o histórico de cada um">
      <div className="mt-4 flex flex-col gap-5">
        <ClientesTabs active="pacotes" />

        {/* Barra da lista: filtros à esquerda, ação de criar junto da lista (não no cabeçalho da página) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
            {FILTROS.map((f) => {
              const n = f.value === 'todos' ? todos.length : todos.filter((p) => p.status === f.value).length;
              return (
                <Pill
                  key={f.value}
                  size="sm"
                  selected={filtro === f.value}
                  onClick={() => {
                    setFiltro(f.value);
                  }}>
                  
                  {f.label} ({n})
                </Pill>);

            })}
          </div>
          <Button leftIcon={<PackagePlusIcon className="h-4 w-4" />} onClick={() => setVendendo(true)}>
            Vender pacote
          </Button>
        </div>

        {onlyName &&
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span>
              Pacotes de <strong className="text-text-primary">{onlyName}</strong>
            </span>
            <Button
            variant="neutral"
            size="sm"
            leftIcon={<XIcon className="h-4 w-4" />}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('cliente');
              setParams(next, { replace: true });
            }}>
            
              Mostrar todos
            </Button>
          </div>
        }
        <LoadErrorGate k="pacotes" what="a lista de pacotes">
          {/* L19 (17/11/2026; DS 5.1 › Listas de registros): mesma regra de Clientes. Lista inteira, cabeçalho preso, contagem
               em cima ("{n} pacotes"; com filtro, "{n} de {N} pacotes").
               RV10 (20/11/2026): a contagem e a tabela formam um grupo, a 8 px uma da outra; a barra fica a 20 px da contagem. */}
          <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary" aria-live="polite">
            {filtrado ?
              <>
                <span className="font-semibold text-text-primary">{rows.length}</span> de <span className="font-semibold text-text-primary">{totalPacotes}</span> pacotes
              </> :

              <>
                <span className="font-semibold text-text-primary">{rows.length}</span> {rows.length === 1 ? 'pacote' : 'pacotes'}
              </>
              }
          </p>
          <PackagesTable rows={rows} onOpen={(p) => setAberto({ id: p.id, nome: p.client_name })} />
          </div>
        </LoadErrorGate>
      </div>

      <PackageDetailModal packageSaleId={aberto?.id ?? null} nomeDoPaciente={aberto?.nome} onClose={() => setAberto(null)} />
      <VendaDePacoteModal open={vendendo} clientePreSelecionadoId={onlyName ? onlyClient ?? undefined : undefined} onClose={() => setVendendo(false)} />
    </DashboardLayout>);

}