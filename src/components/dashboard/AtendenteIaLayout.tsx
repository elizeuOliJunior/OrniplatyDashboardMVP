import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { tabListNoScroll } from '../ui/styles';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { useToast } from '../ui/Toast';
import { focusField } from '../../data/deepLinks';
import { DashboardLayout } from './DashboardLayout';
import { Tabs, TabsList, TabsTrigger } from '../Tabs';
import { ScrollableTabs } from '../ui/ScrollableTabs';
import { ReadinessCard } from '../atendente-ia/ReadinessCard';
import { AssistantStateCard, useAssistantPower } from '../atendente-ia/AssistantPower';
import { useBusinessWords } from '../../data/empresa';

/** Nível de IA saiu do Painel até a definição comercial (C1, 19/10/2026). */
export type AtendenteIaTab = 'empresa' | 'como-atender' | 'conhecimento' | 'automacoes';

type AtendenteIaLayoutProps = {
  activeTab: AtendenteIaTab;
  children?: React.ReactNode;
};

const atendenteIaTabs: {value: AtendenteIaTab;label: string;path: string;}[] = [
{ value: 'empresa', label: 'Empresa', path: '/atendente-ia/empresa' },
{ value: 'como-atender', label: 'Como atender', path: '/atendente-ia/como-atender' },
{ value: 'conhecimento', label: 'Conhecimento', path: '/atendente-ia/conhecimento' },
{ value: 'automacoes', label: 'Automações', path: '/atendente-ia/automacoes' }];


/**
 * L10 (16/11/2026): o cartão de prontidão fica como era em Empresa e Conhecimento (onde moram os itens que faltam) e vira
 * UMA linha compacta (título, barra, o mesmo botão) em Como atender e Automações, para o conteúdo da aba subir.
 */
const COMPACT_READINESS: AtendenteIaTab[] = ['como-atender', 'automacoes'];

/** `?campo=<id>` (vindo do cartão de prontidão) rola até o campo e dá foco nele. */
function useFocusField() {
  const { search, pathname, key } = useLocation();
  const toast = useToast();
  useEffect(() => {
    const campo = new URLSearchParams(search).get('campo');
    if (!campo) return;
    // 350 ms: depois do foco devolvido por um modal que acabou de fechar (ex.: "Completar antes").
    // G2 (F-034): campo inexistente avisa em vez de falhar em silêncio; a tela continua a mesma.
    return focusField(campo, { onMissing: () => toast({ title: 'Campo não encontrado', description: 'O atalho aponta para um campo que não existe nesta tela. Nada foi alterado.', tone: 'warning' }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pathname, key]);
}

export function AtendenteIaLayout({ activeTab, children }: AtendenteIaLayoutProps) {
  const navigate = useGuardedNavigate();
  const power = useAssistantPower();
  const w = useBusinessWords();
  useFocusField();

  return (
    <DashboardLayout
      activeId="atendente-ia"
      title="IA Orniplaty"
      subtitle={`Como a assistente atende e age em nome ${w.of}`}>
      
      {/* Lote E (E1): o liga/desliga saiu do topo. Cartão de estado entre o cabeçalho e as abas (vale para as 4 abas);
           o estado "parada pelo limite" substitui o aviso de uso que ficava acima do cartão de prontidão. */}
      <div className="mt-6">
        <AssistantStateCard onTurnOff={power.openOff} onTurnOn={() => power.openOn()} />
      </div>
      <ScrollableTabs className="mt-5">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const tab = atendenteIaTabs.find((t) => t.value === value);
            if (tab && tab.value !== activeTab) navigate(tab.path);
          }}
          className="min-w-max">
          
          <TabsList aria-label="Configurações da IA Orniplaty" className={tabListNoScroll}>
            {atendenteIaTabs.map((tab) =>
            <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </ScrollableTabs>
      <div className={`flex flex-col ${COMPACT_READINESS.includes(activeTab) ? 'mt-4 gap-5' : 'mt-5 gap-6'}`}>
        <ReadinessCard compact={COMPACT_READINESS.includes(activeTab)} />
        <div>{children}</div>
      </div>
      {power.modals}
    </DashboardLayout>);

}