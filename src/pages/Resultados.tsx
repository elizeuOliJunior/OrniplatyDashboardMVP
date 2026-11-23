import { LoadErrorGate } from '../components/ui/LoadErrorGate';
import React, { useEffect, useMemo, useState } from 'react';
import { tabListNoScroll } from '../components/ui/styles';
import { CountBadge } from '../components/CountBadge';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { useLocation, useNavigate } from 'react-router-dom';
import { DateRangePicker, FadeMotion, ScrollableTabs, Tabs, TabsList, TabsTrigger, previousRange, rangeAddDays } from '../components/Card';
import type { DateRangePreset } from '../components/Card';
import { RecebimentosResumo, useClientReceivables } from '../components/resultados/RecebimentosResumo';
import { GeradoIaResumo } from '../components/resultados/GeradoIaResumo';
import { resultadosTabs } from '../data/resultados';
import { RESULTADOS_TODAY, summarize } from '../data/resultadosDemo';
import { useResultsSources } from '../data/resultadosLive';
import type { DateRange } from '../data/resultadosDemo';
import { useScreenInit } from '../useScreenInit.js';

/** Esqueleto ao trocar o período (simulação de carregamento do protótipo). */

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const monthEnd = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
const prevMonthStart = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
/**
 * G1 subetapa 3 (F-023): períodos de CALENDÁRIO, iguais para todos os números. Só usa o `presets` do DateRangePicker do
 * design system (sem mudança no DS).
 * L20 (17/11/2026, ponto 8, decisão do arquiteto em 08-pedidos): atalhos Hoje, Ontem, Esta semana, Este mês, Mês passado,
 * Este ano, nessa ordem. "Dia/Semana/Mês" passaram a "Hoje/Esta semana/Este mês" com os MESMOS intervalos de antes
 * (Esta semana = segunda a domingo; Este mês = do dia 1 ao último dia). Ontem = o dia anterior; Mês passado = o mês
 * anterior inteiro; Este ano = 1º de janeiro até hoje (o hoje do protótipo). "Comparando com …" continua sendo o período
 * anterior de mesmo tamanho (`previousRange` do DS). Esta é a única tela do Painel com DateRangePicker (busca no código).
 */
const PERIOD_PRESETS: DateRangePreset[] = [
{ key: 'dia', label: 'Hoje', range: (t: string) => ({ from: t, to: t }) },
{ key: 'ontem', label: 'Ontem', range: (t: string) => ({ from: rangeAddDays(t, -1), to: rangeAddDays(t, -1) }) },
{ key: 'semana', label: 'Esta semana', range: (t: string) => {const from = rangeAddDays(t, -((weekday(t) + 6) % 7));return { from, to: rangeAddDays(from, 6) };} },
{ key: 'mes', label: 'Este mês', range: (t: string) => ({ from: `${t.slice(0, 7)}-01`, to: monthEnd(t) }) },
{ key: 'mes-passado', label: 'Mês passado', range: (t: string) => {const from = prevMonthStart(t);return { from, to: monthEnd(from) };} },
{ key: 'ano', label: 'Este ano', range: (t: string) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }) }];

const DEFAULT_PRESET = PERIOD_PRESETS.find((p) => p.key === 'semana')!;

/**
 * Resultados (refeito em 19/10/2026 só com peças do design system ORNIPLATY v2.7; G1 subetapa 3 em 25/10/2026).
 * UM período (DateRangePicker, acima das abas) vale para as duas abas. Os números vêm dos registros VIVOS do protótipo
 * (Agenda, fechamentos, reembolsos, parcelas de pacote) e, antes de 28/09, da amostra histórica identificada
 * (`data/resultadosDemo.ts`). A aba "Gerado pela IA" conta só agendamentos marcados pela assistente no WhatsApp
 * (origem explícita), atendidos e pagos, com a lista para conferir.
 */
/**
 * L11 (meta 5): aba "A receber" (quem deve à clínica e os convênios), à vista ao abrir Resultados. As duas seções saíram
 * do fim de "Recebimentos" sem mudança. A aba fica no endereço (`?secao=recebimentos|a-receber|gerado-ia`, com `replace`).
 * L12 (17/11/2026): na aba "A receber", uma frase visível ao lado do período diz o que ele muda ali. O período continua
 * ativo porque os números de "Convênios" (A receber, Recebido no período, Atrasado) dependem dele; "A receber de clientes"
 * mostra tudo o que está em aberto hoje.
 * L18 (17/11/2026): o título foi para a linha do topo (moldura).
 * L22 (17/11/2026, remoção pedida pelo Christian): saiu "Resumo semanal no WhatsApp · Disponível em breve" da linha do
 * período. Nenhuma função existia por trás (era só a etiqueta "Disponível em breve").
 * O conteúdo da aba esmaece ao trocar de aba (`FadeMotion`, DS 5.1): o painel aqui é desenhado na tela, fora do `TabsContent`.
 * L20 (17/11/2026): a página guarda o interruptor "Comparar com o período anterior" do gráfico de faturamento (DS 5.1,
 * `ChartCard comparison`), DESLIGADO ao abrir a tela.
 */
const RESULTADOS_TABS = [resultadosTabs[0], { value: 'a-receber', label: 'A receber' }, ...resultadosTabs.slice(1)];
const TAB_VALUES = RESULTADOS_TABS.map((t) => t.value);

export function Resultados() {
  const screenInit = useScreenInit();
  const location = useLocation();
  const navigate = useNavigate();
  const fromUrl = new URLSearchParams(location.search).get('secao');
  const [tab, setTabState] = useState<string>(fromUrl && TAB_VALUES.includes(fromUrl) ? fromUrl : screenInit.resultadosTab ?? 'recebimentos');
  useEffect(() => {
    if (fromUrl && TAB_VALUES.includes(fromUrl) && fromUrl !== tab) setTabState(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);
  const setTab = (v: string) => {
    setTabState(v);
    const params = new URLSearchParams(location.search);
    params.set('secao', v);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };
  const owing = useClientReceivables();
  const [range, setRange] = useState<DateRange>(() => DEFAULT_PRESET.range(RESULTADOS_TODAY));
  // L20: comparação do gráfico de faturamento, desligada ao abrir.
  const [compare, setCompare] = useState(false);
  const live = useResultsSources();
  // G4 (F-066): sem carregamento de enfeite (antes 450 ms a cada troca de período). Os números são calculados na hora.
  const loading = false;

  const s = useMemo(() => summarize(range, live), [range, live]);
  const p = useMemo(() => summarize(previousRange(range), live), [range, live]);

  return (
    <DashboardLayout activeId="resultados" title="Resultados" subtitle="O que entrou no seu caixa e de onde veio">
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <DateRangePicker value={range} onChange={setRange} today={RESULTADOS_TODAY} presets={PERIOD_PRESETS} ariaLabel="Período" />
        {tab === 'a-receber' &&
        <p className="text-sm text-text-secondary">Nesta aba, o período vale só para Convênios: “A receber de clientes” mostra tudo o que está em aberto hoje.</p>
        }
      </div>

      <ScrollableTabs className="mt-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Tipo de resultado" className={tabListNoScroll}>
            {RESULTADOS_TABS.map((t) =>
            <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === 'a-receber' && owing.length > 0 &&
              <CountBadge count={owing.length} size="sm" ariaLabel={`${owing.length} ${owing.length === 1 ? 'cliente com valor em aberto' : 'clientes com valor em aberto'}`} className="ml-2" />
              }
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </ScrollableTabs>

      <FadeMotion playKey={tab} role="tabpanel" aria-label={RESULTADOS_TABS.find((t) => t.value === tab)?.label} className="mt-5">
        <LoadErrorGate k="resultados" what="os resultados">
          {tab === 'gerado-ia' ?
          <GeradoIaResumo s={s} p={p} loading={loading} /> :

          <RecebimentosResumo s={s} p={p} loading={loading} part={tab === 'a-receber' ? 'a-receber' : 'recebimentos'} compare={compare} onCompareChange={setCompare} />
          }
        </LoadErrorGate>
      </FadeMotion>
    </DashboardLayout>);

}