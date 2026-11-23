import React from 'react';
import { useOpenConversation } from '../conversas/useOpenConversation';
import {
  Alert,
  BarLineChart,
  Button,
  CHART_COLORS,
  Card,
  CardContent,
  CardHeader,
  ChartCard,
  EmptyState,
  FunnelChart,
  KpiStatCard,
  OrniMarkCircle,
  ProfessionalTag,
  RecordRow,
  ScrollList,
  SkeletonList,
  StatusBadge,
  formatBRL0,
  formatBRL2,
  formatRangeShort } from
'../Card';
import { ASSISTANT_ORIGINS, ORIGIN_LABEL, dayTitle, deltaPct, dm } from '../../data/resultadosDemo';
import type { Summary } from '../../data/resultadosDemo';

const ORIGIN_COLORS = [CHART_COLORS.series[0], CHART_COLORS.series[1], CHART_COLORS.series[2]];

/**
 * Aba "Gerado pela IA" (G1 subetapa 3): só agendamentos marcados pela assistente no WhatsApp (origem explícita), atendidos
 * e pagos no período, com a lista para conferir. Valor = o que foi pago, menos reembolsos (E1).
 * L20 (17/11/2026, DS 5.1):
 *  - estado vazio com a marca da Orniplaty em cinza (`OrniMarkCircle size="lg"`), no lugar do brilho (regra do DS: nenhum
 *    brilho representa a assistente);
 *  - "Agendamentos que contam para este valor": a tabela com páginas (8 por página) virou a lista do DS para listas dentro
 *    de cartão (`ScrollList` com `RecordRow`: 5 visíveis, rolagem interna a partir do 6º), escolha (b) do arquiteto sobre o
 *    `correcao-L19.md` §6.3. Mesmos dados (data, hora, cliente, serviço, profissional, origem, valor) e o mesmo "Ver conversa".
 *    A contagem fica acima da lista.
 * L22c (18/11/2026, DS 6.1): o vazio usa `EmptyState variant="dotted"` (regra: toda área vazia do Painel). Texto igual.
 */
export function GeradoIaResumo({ s, p, loading }: {s: Summary;p: Summary;loading: boolean;}) {
  const openConversation = useOpenConversation();
  const rows = s.assistant.counted;
  const byDay = s.unit === 'dia';
  const f = s.assistant.funnel;
  const empty = !loading && rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="info">
        Contamos só agendamentos que a assistente marcou pelo WhatsApp e que foram atendidos e pagos no período. Você pode conferir cada um na lista abaixo.
      </Alert>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiStatCard
          className="min-w-0"
          loading={loading}
          label="A assistente gerou no período"
          value={s.assistant.revenue}
          decimals={0}
          delta={deltaPct(s.assistant.revenue, p.assistant.revenue)}
          info="Soma do valor pago dos agendamentos da lista abaixo (reembolsos descontados)." />
        
        <KpiStatCard
          className="min-w-0"
          loading={loading}
          label="Agendamentos feitos pela assistente"
          value={s.assistant.paidCount}
          format="number"
          delta={deltaPct(s.assistant.paidCount, p.assistant.paidCount)}
          info="Horários que a assistente marcou pelo WhatsApp e que foram atendidos e pagos no período (os mesmos da lista abaixo). Futuros, faltas e cancelados não entram." />
        
        <KpiStatCard
          className="min-w-0"
          loading={loading}
          label="% do seu faturamento"
          value={s.assistant.share}
          format="percent"
          decimals={0}
          delta={deltaPct(Math.round(s.assistant.share), Math.round(p.assistant.share))}
          info="Quanto do valor pago em atendimentos no período veio dos agendamentos da assistente." />
        
        <KpiStatCard
          className="min-w-0"
          loading={loading}
          label="Clientes recuperados"
          value={s.assistant.recovered}
          format="number"
          delta={deltaPct(s.assistant.recovered, p.assistant.recovered)}
          info="Clientes diferentes que voltaram por uma conversa da assistente: reativação de quem estava sumido ou remarcação de uma falta. Só conta se foi atendido e pagou. É uma conta diferente do “Trouxe de volta” de Oportunidades, que soma no mês quem voltou e pagou depois de um acompanhamento da Orniplaty, mesmo com o horário marcado pela equipe." />
        
      </div>

      {empty ?
      <EmptyState
        variant="dotted"
        icon={<OrniMarkCircle size="lg" />}
        title="Nenhum agendamento da assistente neste período"
        description="Quando a assistente marcar um horário pelo WhatsApp e o cliente for atendido e pagar, ele aparece aqui com o valor, a origem e a conversa para você conferir." /> :


      <>
          <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-5">
            <ChartCard
            title="Receita da assistente ao longo do período"
            info={`Valor pago dos agendamentos da assistente ${byDay ? 'em cada dia' : 'em cada semana'}, separado pela origem da conversa.`}
            legend={ASSISTANT_ORIGINS.map((o, i) => ({ label: ORIGIN_LABEL[o], color: ORIGIN_COLORS[i], mark: 'bar' as const }))}
            loading={loading}
            className="xl:col-span-3">
            
              <BarLineChart
              showPrevious={false}
              stackColors={ORIGIN_COLORS}
              ariaLabel={`Barras empilhadas com a receita da assistente por origem, ${formatRangeShort(s.range)}`}
              data={s.assistant.series.map((b) => ({ key: b.key, label: b.label, value: b.parts.reduce((a, x) => a + x, 0), parts: b.parts }))}
              tooltip={(d, i) => {
                const b = s.assistant.series[i];
                const n = b.counts.reduce((a, x) => a + x, 0);
                return {
                  title: byDay ? dayTitle(b.from) : `Semana de ${dm(b.from)} a ${dm(b.to)}`,
                  rows: [
                  ...ASSISTANT_ORIGINS.map((o, k) => ({ label: `${ORIGIN_LABEL[o]} (${b.counts[k]})`, value: formatBRL0(b.parts[k]), color: ORIGIN_COLORS[k] })),
                  { label: `Total (${n})`, value: formatBRL0(d.value), strong: true }]

                };
              }} />
            
            </ChartCard>

            <ChartCard
            title="Do WhatsApp ao caixa"
            info="Cada etapa mostra quantos chegaram até ali e a porcentagem em relação à primeira etapa."
            loading={loading}
            skeleton="funnel"
            className="xl:col-span-2">
            
              {/* G1 (F-007): "Conversas atendidas" só conta onde há registro de conversa com data; antes disso, fica indisponível. */}
              {f.conversationsCoverage === 'indisponivel' ?
            <p className="mb-3 text-sm text-text-secondary">Conversas atendidas pela assistente: sem registro de conversa por data neste período. A contagem começa em {dm(f.conversationsFrom)}.</p> :
            f.conversationsCoverage === 'parcial' ?
            <p className="mb-3 text-sm text-text-secondary">As conversas só têm registro por data a partir de {dm(f.conversationsFrom)}; antes disso não entram na primeira etapa.</p> :
            null}
              <FunnelChart
              steps={[
              ...(f.conversationsCoverage === 'indisponivel' ?
              [] :
              [{ key: 'conversas', label: 'Conversas atendidas pela assistente', value: f.conversations, hint: 'Conversas em que a assistente respondeu pelo WhatsApp.' }]),
              { key: 'marcados', label: 'Agendamentos marcados', value: f.booked, hint: 'Horários que a assistente marcou na Agenda pelo WhatsApp.' },
              { key: 'realizados', label: 'Realizados', value: f.realized, hint: 'O cliente veio e foi atendido.' },
              { key: 'pagos', label: 'Pagos', value: f.paid, hint: 'Atendimento fechado e pago. É o que entra no valor da assistente.' }]
              } />
            
            </ChartCard>
          </div>

          <Card as="section" padding="lg" aria-labelledby="assistente-agendamentos">
            <CardHeader>
              <h2 id="assistente-agendamentos" className="text-base font-semibold leading-6 text-text-primary">
                Agendamentos que contam para este valor
              </h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {loading ?
            <SkeletonList rows={4} /> :

            <>
                  <p className="text-sm text-text-secondary">
                    <strong className="font-semibold text-text-primary">{rows.length}</strong> {rows.length === 1 ? 'agendamento' : 'agendamentos'}
                  </p>
                  <ScrollList ariaLabel="Agendamentos que contam para este valor" className="flex flex-col gap-2">
                    {rows.map((a) =>
                <li key={a.id}>
                        <RecordRow
                    date={dm(a.iso)}
                    dateDetail={a.time}
                    title={a.client}
                    subtitle={
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span>{a.service}</span>
                              <span aria-hidden="true">·</span>
                              {a.pro === 'carolina' || a.pro === 'juliana' || a.pro === 'rafael' ? <ProfessionalTag professional={a.pro} /> : <span>{a.pro || '—'}</span>}
                            </span>
                    }
                    aside={
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                              <StatusBadge status="info" label={ORIGIN_LABEL[a.origin as keyof typeof ORIGIN_LABEL]} />
                              <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-text-primary">{formatBRL2(a.amount)}</span>
                            </span>
                    }>
                    
                          <Button size="sm" variant="secondary" onClick={() => openConversation({ clientId: a.clientId, name: a.client })} aria-label={`Ver conversa com ${a.client}`}>
                            Ver conversa
                          </Button>
                        </RecordRow>
                      </li>
                )}
                  </ScrollList>
                </>
            }
            </CardContent>
          </Card>
        </>
      }
    </div>);

}