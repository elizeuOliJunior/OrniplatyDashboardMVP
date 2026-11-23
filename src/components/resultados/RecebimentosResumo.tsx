import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon } from 'lucide-react';
import {
  BarLineChart,
  Button,
  CHART_COLORS,
  Card,
  CardContent,
  CardHeader,
  ChartCard,
  DonutChart,
  HBarChart,
  InfoTip,
  KpiStatCard,
  MiniBarChart,
  ProfessionalTag,
  READABLE_BAR_PROPS,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
  chooseGrouping,
  clickableChevronClass,
  fillMissingDays,
  formatBRL0,
  formatBRL2,
  formatChartPercent,
  formatRangeShort,
  groupBarData,
  shortBarTooltip } from
'../Card';
import type { DailyPoint } from '../Card';
import { AppModal } from '../ui/AppModal';
import { RESULTADOS_TODAY, addDays, dayTitle, daysBetween, deltaPct, dm, dmy, revenueInsight } from '../../data/resultadosDemo';
import { resolveService } from '../../data/catalogo';
import { serviceLink } from '../../data/deepLinks';
import { useFinanceEntries } from '../../data/convenios';
import { useClientsVersion } from '../../data/api/clientes';
import { useBackendVersion } from '../../data/api/pacotes';
import { clientReceivables } from '../../data/financeReaders';
import type { InsurerRow, ProKey, Summary } from '../../data/resultadosDemo';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/**
 * L20: palavra para atendimentos no balão do gráfico. O dicionário do segmento (`data/segment.ts`, `businessWords`) só tem
 * a palavra do NEGÓCIO; para atendimentos a tela já usa "Atendimentos" (neutra, serve para os quatro segmentos; nunca
 * "paciente"/"consulta").
 */
const VISITS_LABEL = 'Atendimentos';

/**
 * L11 (meta 5): quem deve à clínica AGORA (mesma conta da seção "A receber de clientes"). Lido também pela aba "A receber"
 * de Resultados, para o número ao lado do nome da aba.
 */
export function useClientReceivables() {
  const financeEntries = useFinanceEntries();
  const clientsVersion = useClientsVersion();
  const backendVersion = useBackendVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => clientReceivables(financeEntries), [financeEntries, clientsVersion, backendVersion]);
}

/**
 * Aba "Recebimentos": todos os blocos leem o MESMO resumo do período (s) e o do período anterior (p).
 * L11 (meta 5): `part="a-receber"` mostra só "A receber de clientes" e "Convênios" (nesta ordem), que saíram do fim da aba
 * Recebimentos para a aba "A receber". As seções são as mesmas, sem mudança.
 * L12 (17/11/2026): a coluna "Pendência mais antiga" virou "Vencimento ou atendimento", com "i". A data é a mais antiga
 * entre as pendências do cliente (`oldestIso` de data/financeReaders.ts): o vencimento da parcela ou do lançamento, ou o
 * dia do atendimento não pago. Parcela que ainda vai vencer dá uma data futura. Mesma data, só o nome mudou.
 * L20 (17/11/2026, ponto 8, DS 5.1):
 *  - "Faturamento no período": o período escolhido manda na escala; "Comparar com o período anterior" (`ChartCard comparison`)
 *    vem DESLIGADO ao abrir (estado da página, o mesmo valor em `showPrevious` e na legenda); `READABLE_BAR_PROPS` (valor em
 *    cada barra, coluna destacada, balão ao lado, zero no chão); balão curto `shortBarTooltip` (data, recebido, atendimentos;
 *    o anterior só com a comparação ligada; "Ainda não aconteceu." em dia/semana/mês futuro); dias montados com
 *    `fillMissingDays` e agrupados com `groupBarData` (por semana acima de 31 dias, por mês acima de 92); `key` = período para
 *    as barras crescerem uma vez a cada período. Mesmos números: recebimentos do período (`s.cash`) por dia; o anterior é o
 *    dia de mesma posição do período anterior (`p`). A frase de baixo (`revenueInsight`) não mudou.
 *  - "Faltas e cancelamentos": mini gráfico com o balão ao lado (`tooltipPlacement="side"`), uma linha que diz o que cada
 *    barra conta, rótulos "Sem dd/mm" (semana) e, acima de 92 dias, uma barra por mês ("set/26"), contada pela data de cada
 *    falta ou cancelamento (`s.visits`, a mesma fonte de `s.lossWeeks`). Mesmos números.
 */
export function RecebimentosResumo({
  s,
  p,
  loading,
  part = 'recebimentos',
  compare = false,
  onCompareChange








}: {s: Summary;p: Summary;loading: boolean;part?: 'recebimentos' | 'a-receber'; /** L20: interruptor "Comparar com o período anterior" (guardado pela página, desligado ao abrir). */compare?: boolean;onCompareChange?: (on: boolean) => void;}) {
  const navigate = useNavigate();
  const [openInsurer, setOpenInsurer] = useState<InsurerRow | null>(null);
  const [localCompare, setLocalCompare] = useState(false);
  const comparar = onCompareChange ? compare : localCompare;
  const setComparar = onCompareChange ?? setLocalCompare;

  // L20: dias do período (recebido, atendimentos e o mesmo dia do período anterior), agrupados pelo tamanho do período.
  const days = daysBetween(s.range.from, s.range.to);
  const grouping = chooseGrouping(days);
  const periodKey = `${s.range.from}_${s.range.to}`;
  const barData = useMemo(() => {
    const sumBy = (list: {iso: string;amount: number;}[]) => {
      const m = new Map<string, number>();
      list.forEach((r) => m.set(r.iso, (m.get(r.iso) ?? 0) + r.amount));
      return m;
    };
    const cur = sumBy(s.cash);
    const prev = sumBy(p.cash);
    const visits = new Map<string, number>();
    s.visits.forEach((v) => {
      if (v.status === 'realizado') visits.set(v.iso, (visits.get(v.iso) ?? 0) + 1);
    });
    const points: DailyPoint[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(s.range.from, i);
      const pd = addDays(p.range.from, i);
      points.push({ date: d, value: cur.get(d) ?? 0, previous: prev.get(pd) ?? 0, visits: visits.get(d) ?? 0 });
    }
    return groupBarData(fillMissingDays(points, s.range.from, s.range.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, p]);
  const isFuture = (key: string) => (key.length === 7 ? `${key}-01` : key) > RESULTADOS_TODAY;
  const unitWord = grouping === 'month' ? 'por mês' : grouping === 'week' ? 'por semana' : 'por dia';

  // L20: faltas e cancelamentos por semana (por mês acima de 92 dias), com rótulos que dizem o que é cada barra.
  const lossByMonth = days > 92;
  const lossBars = useMemo(() => {
    if (!lossByMonth)
    return s.lossWeeks.map((w) => ({
      key: w.key,
      label: w.from === w.to ? dm(w.from) : `Sem ${dm(w.from)}`,
      title: w.from === w.to ? dayTitle(w.from) : `Semana de ${dm(w.from)} a ${dm(w.to)}`,
      noShows: w.noShows,
      cancelled: w.cancelled,
      lost: w.lost
    }));
    // Por mês: cada falta ou cancelamento conta no mês da sua data (uma semana que vira o mês não muda de mês).
    const m = new Map<string, {key: string;label: string;title: string;noShows: number;cancelled: number;lost: number;}>();
    for (let d = `${s.range.from.slice(0, 7)}-01`; d <= s.range.to;) {
      const key = d.slice(0, 7);
      const y = Number(key.slice(0, 4));
      const mo = Number(key.slice(5, 7));
      m.set(key, { key, label: `${MONTHS_SHORT[mo - 1]}/${key.slice(2, 4)}`, title: `${MONTHS[mo - 1]} de ${y}`, noShows: 0, cancelled: 0, lost: 0 });
      d = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    }
    s.visits.forEach((v) => {
      if (v.status !== 'faltou' && v.status !== 'cancelado') return;
      const b = m.get(v.iso.slice(0, 7));
      if (!b) return;
      if (v.status === 'faltou') b.noShows += 1;else
      b.cancelled += 1;
      b.lost += v.price;
    });
    return Array.from(m.values());
  }, [s, lossByMonth]);
  const lossCaption = days === 1 ? 'Faltas e cancelamentos neste dia' : lossByMonth ? 'Faltas e cancelamentos somados, por mês' : 'Faltas e cancelamentos somados, por semana';

  const insurerRows = s.insurers.filter((i) => i.count > 0);

  // W9d (N-06) e W9f (12/11/2026, opção b do Christian): o que cada cliente deve AGORA, de qualquer data. Mesma conta do
  // "Em aberto" da Ficha (`clientOpenAmount`), sem o que o convênio deve. Relê quando muda um fechamento, um lançamento
  // (parcela paga na ficha) ou o cadastro.
  const owing = useClientReceivables();
  const owingCents = owing.reduce((t, r) => t + r.openCents, 0);
  const owingItems = owing.reduce((t, r) => t + r.items, 0);

  const convenios =
  <>
      {/* e) Convênios */}
      <Card as="section" padding="lg" aria-labelledby="convenios-resultados">
        <CardHeader>
          <h2 id="convenios-resultados" className="inline-flex items-center gap-1 text-base font-semibold leading-6 text-text-primary">
            Convênios
            <InfoTip label="Convênios" content="Atendimento fechado como Convênio entra aqui como pendente e só conta como recebido quando o convênio paga." />
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiStatCard size="sm" loading={loading} label="A receber" value={s.convToReceive} decimals={0} info="Atendimentos de convênio deste período que o convênio ainda não pagou (inclui os atrasados)." />
            <KpiStatCard size="sm" loading={loading} label="Recebido no período" value={s.convReceivedInPeriod} decimals={0} info="Repasses de convênio que entraram no caixa neste período, inclusive de atendimentos anteriores. Já estão no Faturamento realizado." />
            <KpiStatCard size="sm" loading={loading} label="Atrasado" value={s.convOverdue} decimals={0} info="Parte do valor a receber que já passou do prazo do contrato com o convênio." />
          </div>
          <Table containerClassName="relative bg-surface" aria-busy={loading || undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>Convênio</TableHead>
                <TableHead align="right">Atendimentos</TableHead>
                <TableHead align="right">Valor faturado</TableHead>
                <TableHead align="right">Recebido</TableHead>
                <TableHead align="right">Pendente</TableHead>
                <TableHead align="right">Prazo médio de pagamento</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ?
            <TableLoading colSpan={8} rows={2} /> :
            insurerRows.length === 0 ?
            <TableEmpty colSpan={8} title="Nenhum atendimento de convênio neste período" description="Quando um atendimento for fechado como Convênio, ele aparece aqui como pendente." /> :

            insurerRows.map((row) =>
            <TableRow key={row.key} className="group cursor-pointer" onClick={() => setOpenInsurer(row)}>
                    <TableCell className="font-semibold text-text-primary">
                      <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenInsurer(row);
                  }}
                  aria-label={`Ver atendimentos de ${row.name}`}
                  className="rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  
                        {row.name}
                      </button>
                    </TableCell>
                    <TableCell numeric>{row.count}</TableCell>
                    <TableCell numeric className="text-text-primary">{formatBRL0(row.billed)}</TableCell>
                    <TableCell numeric className="text-text-primary">{formatBRL0(row.received)}</TableCell>
                    <TableCell numeric className="font-semibold text-text-primary">{formatBRL0(row.pending)}</TableCell>
                    <TableCell numeric>{row.avgDays === null ? '—' : plural(row.avgDays, 'dia', 'dias')}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.late ? 'warning' : 'success'} label={row.late ? 'Atrasado' : 'Em dia'} minWidth="md" />
                    </TableCell>
                    <TableCell align="right">
                      <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                    </TableCell>
                  </TableRow>
            )
            }
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>;


  const clientes =
  <>
      {/* f) A receber de clientes (W9d, N-06; W9f, opção b do Christian em 12/11/2026): mesmo padrão da seção Convênios.
         Tudo o que o CLIENTE deve (atendimento não pago, parcela de pacote, avulso, coparticipação), o mesmo valor do "Em
         aberto" da Ficha sem o que o convênio deve. NÃO entra no Faturamento realizado; a linha leva à ficha. */}
      <Card as="section" padding="lg" aria-labelledby="a-receber-clientes-resultados">
        <CardHeader>
          <h2 id="a-receber-clientes-resultados" className="inline-flex items-center gap-1 text-base font-semibold leading-6 text-text-primary">
            A receber de clientes
            <InfoTip
            label="o valor a receber de clientes"
            content="O que cada cliente ainda deve: atendimento fechado como “Ainda não pagou”, parcela de pacote, lançamento avulso e coparticipação de convênio. É o “Em aberto” da ficha sem o que o convênio deve à clínica, que fica em Convênios. Sai daqui quando o pagamento é registrado na ficha do cliente. Mostra tudo o que está em aberto hoje, de qualquer data: não muda com o período escolhido. Não conta no Faturamento realizado." />
          
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiStatCard size="sm" loading={loading} label="Em aberto" value={owingCents / 100} decimals={0} info="Soma do que os clientes ainda devem. Só conta como recebido quando o pagamento é registrado na ficha." />
            <KpiStatCard size="sm" loading={loading} label="Clientes" value={owing.length} format="number" info="Quantos clientes têm valor em aberto hoje." />
            <KpiStatCard size="sm" loading={loading} label="Pendências" value={owingItems} format="number" info="Quantos itens estão em aberto: atendimentos não pagos, parcelas de pacote, lançamentos avulsos e coparticipações." />
          </div>
          <Table containerClassName="relative bg-surface" aria-busy={loading || undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead align="right">Pendências</TableHead>
                <TableHead align="right">Valor em aberto</TableHead>
                {/* L12: a data é vencimento (parcela, lançamento) ou dia do atendimento não pago; o nome diz isso. */}
                <TableHead align="right">
                  <span className="inline-flex items-center gap-1">
                    Vencimento ou atendimento
                    <InfoTip
                    label="esta data"
                    content="A data mais antiga entre as pendências do cliente: o vencimento da parcela ou do lançamento, ou o dia do atendimento não pago. Parcela que ainda vai vencer mostra uma data futura." />
                  
                  </span>
                </TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>
                  <span className="sr-only">Abrir a ficha</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ?
            <TableLoading colSpan={6} rows={2} /> :
            owing.length === 0 ?
            <TableEmpty
              colSpan={6}
              title="Nenhum cliente com valor em aberto"
              description="Quando um cliente ficar devendo um atendimento, uma parcela de pacote, um lançamento avulso ou uma coparticipação, ele aparece aqui até o pagamento ser registrado na ficha." /> :


            owing.map((row) => {
              const openFicha = row.clientId ? () => navigate(`/clientes/${row.clientId}`) : undefined;
              return (
                <TableRow key={row.key} className={openFicha ? 'group cursor-pointer' : undefined} onClick={openFicha}>
                      <TableCell className="font-semibold text-text-primary">
                        {openFicha ?
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFicha();
                      }}
                      aria-label={`Abrir a ficha de ${row.name}`}
                      className="rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      
                            {row.name}
                          </button> :

                    row.name
                    }
                      </TableCell>
                      <TableCell numeric>{row.items}</TableCell>
                      <TableCell numeric className="font-semibold text-text-primary">{formatBRL2(row.openCents / 100)}</TableCell>
                      <TableCell numeric>{row.oldestIso ? dmy(row.oldestIso) : '—'}</TableCell>
                      <TableCell>
                        <StatusBadge status="warning" label="Em aberto" minWidth="md" />
                      </TableCell>
                      <TableCell align="right">{openFicha && <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />}</TableCell>
                    </TableRow>);

            })
            }
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>;


  return (
    <div className="flex flex-col gap-6">
      {part === 'a-receber' ?
      <>
          {clientes}
          {convenios}
        </> :

      <>
          {/* a) Indicadores */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiStatCard
            className="min-w-0"
            loading={loading}
            label="Faturamento realizado"
            value={s.received}
            decimals={0}
            delta={deltaPct(s.received, p.received)}
            info={`Valor que entrou no caixa no período, pela data de cada pagamento: clientes, sinais, coparticipação, repasses de convênio e parcelas de pacote.${s.refundedInPeriod > 0 ? ` Já descontados ${formatBRL0(s.refundedInPeriod)} de reembolsos feitos no período (atendimentos e pacotes).` : ''}`} />
          
            <KpiStatCard
            className="min-w-0"
            loading={loading}
            label="Valor agendado"
            value={s.scheduled}
            decimals={0}
            delta={deltaPct(s.scheduled, p.scheduled)}
            info="Soma do preço dos atendimentos marcados no período, com ou sem comparecimento. Cancelados não entram." />
          
            <KpiStatCard
            className="min-w-0"
            loading={loading}
            label="Taxa de presença"
            value={s.presence}
            format="percent"
            decimals={0}
            delta={deltaPct(Math.round(s.presence), Math.round(p.presence))}
            info={`Atendidos ÷ (atendidos + faltas). Neste período: ${s.attended} atendidos e ${plural(s.noShowCount, 'falta', 'faltas')}.`} />
          
            <KpiStatCard
            className="min-w-0"
            loading={loading}
            label="Ticket médio"
            value={s.ticket}
            decimals={0}
            delta={deltaPct(Math.round(s.ticket), Math.round(p.ticket))}
            info={`Valor pago ÷ fechamentos pagos no período (${s.paidClosures} ${s.paidClosures === 1 ? 'fechamento' : 'fechamentos'}). Convênio entra quando o repasse é recebido; reembolso desconta do fechamento. Parcelas de pacote não entram.`} />
          
          </div>

          {/* b) Gráfico principal (L20: legível, DS 5.1) */}
          <ChartCard
          title="Faturamento no período"
          info={
          grouping === 'month' ?
          'Períodos com mais de 92 dias aparecem por mês.' :
          grouping === 'week' ?
          'Períodos com mais de 31 dias aparecem por semana (segunda a domingo).' :
          'Valor recebido em cada dia. Ligue “Comparar com o período anterior” para ver o mesmo dia do período anterior em linha tracejada.'
          }
          comparison={{ on: comparar, onChange: setComparar }}
          legend={
          comparar ?
          [
          { label: 'Este período', color: CHART_COLORS.current, mark: 'bar' },
          { label: 'Período anterior', color: CHART_COLORS.previous, mark: 'dashed' }] :

          [{ label: 'Este período', color: CHART_COLORS.current, mark: 'bar' }]
          }
          loading={loading}
          insight={revenueInsight(s)}>
          
            <BarLineChart
            {...READABLE_BAR_PROPS}
            key={periodKey}
            data={barData}
            showPrevious={comparar}
            ariaLabel={`Gráfico de barras com o valor recebido ${unitWord} de ${formatRangeShort(s.range)}${comparar ? ', comparado ao período anterior' : ''}`}
            tooltip={(d) => {
              const t = shortBarTooltip(d, { visitsLabel: VISITS_LABEL, withPrevious: comparar });
              return isFuture(d.key) ? { ...t, footer: 'Ainda não aconteceu.' } : t;
            }} />
          
          </ChartCard>

          {/* RV10 (20/11/2026, arranjo D3 aprovado pelo Christian): uma grade só, com duas colunas independentes alinhadas pelo
             topo. Esquerda: Receita por serviço, Receita por profissional e Formas de pagamento empilhados (24 px entre eles);
             direita: Faltas e cancelamentos. Os cartões têm altura automática (`h-auto` sobre o `h-full` do ChartCard), então
             nenhum cartão estica. A ordem no código não muda; abaixo de 1024 px empilham nessa ordem, a 24 px, como antes. */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
          {/* c) Serviço e profissional */}
            <ChartCard className="h-auto" title="Receita por serviço" info="Quanto cada serviço trouxe de recebimentos no período. Clique para ver o serviço." loading={loading} skeleton="hbars">
              {s.byService.length ?
              <HBarChart
                items={s.byService.map((x) => ({ key: x.key, name: x.name, label: x.name, value: x.value, detail: plural(x.count, 'atendimento', 'atendimentos') }))}
                // G2 (F-035): abre O serviço da barra clicada (id pelo catálogo vivo, nome atual ou anterior); serviço que não
                // está mais no catálogo leva à lista, com o aviso de Serviços e equipe.
                onItemClick={(it?: {key?: string;name?: string;}) => {
                  const name = it?.key ?? it?.name ?? '';
                  const r = resolveService(name);
                  navigate(r.status === 'active' || r.status === 'archived' ? serviceLink(r.service.value) : '/servicos-equipe?aba=servicos');
                }}
                openLabel={(name) => `Ver o serviço ${name}`}
                tooltip={(it, share) => ({
                  title: it.name,
                  rows: [
                  { label: 'Recebido', value: formatBRL0(it.value), strong: true },
                  { label: 'Atendimentos', value: String(s.byService.find((x) => x.key === it.key)?.count ?? 0) },
                  { label: 'Parte do total', value: formatChartPercent(share) }]

                })} /> :


              <p className="text-sm text-text-secondary">Nenhum recebimento neste período.</p>
              }
            </ChartCard>

            <ChartCard className="h-auto" title="Receita por profissional" info="Recebimentos dos atendimentos de cada profissional, na cor dela ou dele na Agenda." loading={loading} skeleton="hbars">
              {s.byPro.length ?
              <HBarChart
                items={s.byPro.map((x) => ({
                  key: x.key,
                  name: x.name,
                  label: x.key in CHART_COLORS.professional ? <ProfessionalTag professional={x.key as ProKey} /> : x.name,
                  value: x.value,
                  detail: plural(x.count, 'atendimento', 'atendimentos'),
                  color: CHART_COLORS.professional[x.key]
                }))}
                tooltip={(it, share) => ({
                  title: it.name,
                  rows: [
                  { label: 'Recebido', value: formatBRL0(it.value), color: it.color, strong: true },
                  { label: 'Atendimentos', value: String(s.byPro.find((x) => x.key === it.key)?.count ?? 0) },
                  { label: 'Parte do total', value: formatChartPercent(share) }]

                })} /> :


              <p className="text-sm text-text-secondary">Nenhum recebimento neste período.</p>
              }
            </ChartCard>

          {/* d) Pagamento e perdas */}
            <ChartCard className="h-auto" title="Formas de pagamento" info="Como o valor recebido no período entrou no caixa." loading={loading} skeleton="donut">
              <DonutChart
                ariaLabel={`Rosca com as formas de pagamento de ${formatRangeShort(s.range)}`}
                centerLabel="Recebido"
                items={s.byMethod.map((m, i) => ({ key: m.key, label: m.label, value: m.value, color: CHART_COLORS.series[i] }))} />
              
            </ChartCard>
          </div>

            <ChartCard
            className="h-auto"
            title="Faltas e cancelamentos"
            info="Atendimentos que estavam marcados no período e não aconteceram. O valor é o preço desses atendimentos."
            loading={loading}
            skeleton="mini"
            skeletonHeight={200}>
            
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <KpiStatCard size="sm" label="Faltas" value={s.noShowCount} format="number" delta={deltaPct(s.noShowCount, p.noShowCount)} invertDelta />
                  <KpiStatCard size="sm" label="Cancelamentos" value={s.cancelledCount} format="number" delta={deltaPct(s.cancelledCount, p.cancelledCount)} invertDelta />
                  <KpiStatCard className="col-span-2" size="sm" label="R$ que deixaram de entrar" value={s.lost} decimals={0} delta={deltaPct(s.lost, p.lost)} invertDelta />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-text-secondary">{lossCaption}</p>
                  <MiniBarChart
                  ariaLabel={lossCaption}
                  tooltipPlacement="side"
                  data={lossBars.map((w) => ({ key: w.key, label: w.label, value: w.noShows + w.cancelled }))}
                  tooltip={(d) => {
                    const w = lossBars.find((x) => x.key === d.key)!;
                    return {
                      title: w.title,
                      rows: [
                      { label: 'Faltas', value: String(w.noShows) },
                      { label: 'Cancelamentos', value: String(w.cancelled) },
                      { label: 'Deixaram de entrar', value: formatBRL0(w.lost), strong: true }]

                    };
                  }} />
                
                </div>
                <div>
                  <Button size="md" variant="secondary" onClick={() => navigate('/oportunidades?aba=faltou')}>
                    Ver clientes que faltaram
                  </Button>
                </div>
              </div>
            </ChartCard>
          </div>
        </>
      }

      <AppModal
        open={!!openInsurer}
        onClose={() => setOpenInsurer(null)}
        size="lg"
        unsavedGuard={false}
        title={openInsurer ? `Atendimentos · ${openInsurer.name}` : ''}
        description={openInsurer ? `${formatRangeShort(s.range)} · prazo do contrato: ${openInsurer.termDays ? `${openInsurer.termDays} dias` : 'não informado'}` : undefined}
        footer={
        <Button variant="secondary" onClick={() => setOpenInsurer(null)}>
            Fechar
          </Button>
        }>
        
        {openInsurer &&
        <Table containerClassName="relative bg-surface">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead align="right">Valor</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openInsurer.appts.map((a) => {
              const late = !a.convPaidOn && !!a.convDue && a.convDue < RESULTADOS_TODAY;
              return (
                <TableRow key={a.id}>
                    <TableCell className="tabular-nums">{dm(a.iso)}</TableCell>
                    <TableCell className="font-semibold text-text-primary">{a.client}</TableCell>
                    <TableCell>{a.service}</TableCell>
                    <TableCell numeric className="text-text-primary">{formatBRL2(a.price)}</TableCell>
                    <TableCell>
                      <StatusBadge
                      status={a.convPaidOn ? 'success' : late ? 'warning' : 'neutral'}
                      label={a.convPaidOn ? 'Recebido' : late ? 'Atrasado' : 'A receber'}
                      minWidth="md"
                      title={a.convPaidOn ? `Recebido em ${dm(a.convPaidOn)}` : a.convDue ? `Vence em ${dm(a.convDue)}` : 'Sem prazo informado'} />
                    
                    </TableCell>
                  </TableRow>);

            })}
            </TableBody>
          </Table>
        }
      </AppModal>
    </div>);

}