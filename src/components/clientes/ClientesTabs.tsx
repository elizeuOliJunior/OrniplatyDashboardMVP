import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '../Tabs';
import { tabListNoScroll } from '../ui/styles';
import { useGuardedNavigate } from '../ui/UnsavedChanges';

/** C1 (ajustes do Lote C, 21/10/2026): a aba Retornos saiu. Os retornos ficam em Oportunidades › filtro Retorno. */
type TabId = 'clientes' | 'pacotes';

type ClientesTabsProps = {
  active: TabId;
};

const TAB_PATHS: Record<TabId, string> = {
  clientes: '/clientes',
  pacotes: '/clientes/pacotes'
};

export function ClientesTabs({ active }: ClientesTabsProps) {
  const navigate = useGuardedNavigate();
  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        if (value !== active) navigate(TAB_PATHS[value as TabId]);
      }}>
      
      <TabsList aria-label="Seções de clientes" className={tabListNoScroll}>
        <TabsTrigger value="clientes">Clientes</TabsTrigger>
        <TabsTrigger value="pacotes">Pacotes</TabsTrigger>
      </TabsList>
    </Tabs>);

}