/**
 * Leitor financeiro dos fechamentos de atendimento (G1 subetapas 2 e 3, 25/10/2026). SÓ LÊ: não é um store novo.
 * Fontes: `data/convenios.ts` (fechamento, coparticipação, repasse; correção substitui o registro) e `data/legado.ts`
 * (reembolsos). Parcelas de pacote ficam em `data/api/pacotes.ts` e são lidas por Resultados diretamente.
 *
 * Decisões do Christian (25/10/2026):
 *  - E1 = R1: um reembolso posterior REDUZ o valor do fechamento nos indicadores por fechamento (ticket médio, receita da
 *    assistente, "Trouxe de volta"), no período em que o fechamento quitou, com a data do reembolso indicada. Reembolso
 *    total tira o fechamento desses indicadores (o atendimento, o histórico e as mensagens continuam). Recebimentos registra
 *    o reembolso como saída na data REAL do reembolso.
 *  - E2 = P1: fechamento pago em partes (convênio) só conta como pago quando tudo foi recebido, no período do ÚLTIMO
 *    recebimento, pelo valor total recebido. Recebimentos registra cada pagamento na data real.
 *  - Fechamento com R$ 0 não é fechamento pago. Sessão de pacote não tem ligação com o pacote no protótipo (limitação do G3).
 * BACKEND: `financial_records` real não tem pagador/operadora/status de repasse; reembolso real = `FinancialRefund`
 * (só achado no cancelamento de pacote, não verificado). Ver docs/ia-orniplaty.md (CT-18).
 */
import type { FinanceEntry } from './convenios';
import { awaitingFromInsurers, copayOpen, getDeposits, particularOpenCents } from './convenios';
import { refundsOf } from './legado';
import { allClientsWithPhones, clientById, clientIdOfRecordedName, currentClientName } from './api/clientes';
import { financialRecordsOf } from './api/pacotes';
import type { FinancialRecord } from './api/pacotes';

export type Receipt = {
  /** Identidade estável do evento financeiro. */
  id: string;
  iso: string;
  /** Positivo = entrada; negativo = reembolso (saída). */
  cents: number;
  kind: 'particular' | 'sinal' | 'coparticipacao' | 'repasse' | 'reembolso';
  method: string | null;
  entryId: string;
};

export type ClosurePayment = {
  entry: FinanceEntry;
  /** Valor que ficou com a clínica: recebido − reembolsado. */
  paidCents: number;
  /** Data em que o fechamento ficou totalmente pago (P1). `null` = ainda não quitou (ou nada pago). */
  settledIso: string | null;
  /** Pago e não totalmente reembolsado. */
  qualifies: boolean;
  refundedCents: number;
  /** Data do último reembolso (para a nota "valor atualizado por reembolso em dd/mm"). */
  lastRefundIso: string | null;
  receipts: Receipt[];
};

const closedOf = (e: FinanceEntry) => e.closedIso ?? e.iso;

/**
 * W5 (G15, 11/11/2026): forma do pagamento ORIGINAL de uma parte do fechamento (de onde o reembolso sai por padrão).
 * Repasse do convênio volta para a operadora: conta como 'convenio' em Formas de pagamento.
 */
export function originalMethodOf(e: FinanceEntry, component?: string | null): string | null {
  switch (component ?? 'particular') {
    case 'sinal':{
        const d = (e.depositIds ?? []).map((id) => getDeposits().find((x) => x.id === id)).find(Boolean);
        return d?.method ?? e.method;
      }
    case 'coparticipacao':
      return e.copayMethod;
    case 'repasse':
      return 'convenio';
    default:
      return e.method;
  }
}

/** Pagamentos e reembolsos de UM fechamento, cada um na data real. */
export function closurePayment(e: FinanceEntry): ClosurePayment {
  const receipts: Receipt[] = [];
  const closed = closedOf(e);
  let gross = 0;
  let settledIso: string | null = null;
  if (e.packageSaleId) {

    // G3 (F-052): sessão coberta por pacote = R$ 0, sem recebível novo. O dinheiro do pacote está nas parcelas do pacote.
  } else if (e.payer === 'particular') {// G3 (F-041): sinal recebido antes entra na data REAL dele; o restante na data em que foi pago. O fechamento quita no
    // último recebimento (P1) pelo total pago, uma vez. Sinal configurado e não recebido não é dinheiro.
    const sinais = (e.depositIds ?? []).map((id) => getDeposits().find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
    sinais.forEach((d) => {
      receipts.push({ id: `sinal:${d.id}`, iso: d.iso, cents: d.cents, kind: 'sinal', method: d.method, entryId: e.id });
      gross += d.cents;
    });
    const deposit = sinais.reduce((t, d) => t + d.cents, 0);
    const rest = e.totalCents - deposit;
    const paidOn = e.paidIso ?? closed;
    if (!e.particularOpen && rest > 0) {
      receipts.push({ id: `fech:${e.id}`, iso: paidOn, cents: rest, kind: 'particular', method: e.method, entryId: e.id });
      gross += rest;
    }
    if (!e.particularOpen && gross > 0) settledIso = [paidOn, ...sinais.map((d) => d.iso)].sort().slice(-1)[0];
  } else {
    const copayDue = e.copayCents > 0;
    if (copayDue && e.copayPaid) {
      receipts.push({ id: `copart:${e.id}`, iso: closed, cents: e.copayCents, kind: 'coparticipacao', method: e.copayMethod, entryId: e.id });
      gross += e.copayCents;
    }
    const claimIso = e.claimStatus === 'received' ? e.claimReceivedIso ?? closed : null;
    if (claimIso && e.receivedCents > 0) {
      receipts.push({ id: `repasse:${e.id}`, iso: claimIso, cents: e.receivedCents, kind: 'repasse', method: e.claimMethod, entryId: e.id });
      gross += e.receivedCents;
    }
    // P1: quita quando a coparticipação (se houver) foi paga E o repasse foi recebido; data = o último recebimento.
    // O repasse nunca é registrado antes do fechamento, então o último recebimento é o próprio repasse.
    if (claimIso && (!copayDue || e.copayPaid) && gross > 0) settledIso = claimIso > closed ? claimIso : closed;
  }
  const refunds = refundsOf(e.id);
  // W5 (G15): o reembolso sai pela forma gravada nele; registro antigo usa a forma do pagamento original da parte devolvida.
  refunds.forEach((r) => receipts.push({ id: `reemb:${r.id}`, iso: r.iso, cents: -r.cents, kind: 'reembolso', method: r.method ?? originalMethodOf(e, r.component), entryId: e.id }));
  const refundedCents = refunds.reduce((t, r) => t + r.cents, 0);
  const paidCents = Math.max(0, gross - refundedCents);
  const lastRefundIso = refunds.length ? refunds.map((r) => r.iso).sort().slice(-1)[0] : null;
  return { entry: e, paidCents, settledIso, qualifies: !!settledIso && paidCents > 0, refundedCents, lastRefundIso, receipts };
}

// ── valor em aberto do cliente ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * W9f (12/11/2026): o valor em aberto de UM cliente, numa função só. A Ficha ("Em aberto" do cartão de números,
 * `components/client/ClientProfile.tsx`) e Resultados ("A receber de clientes") leem daqui.
 * Partes, cada uma pela função que já existia:
 *  - `recordsCents`: lançamentos pendentes (parcela de pacote e lançamento avulso; `status === 'pending'`, mesma regra de
 *    `em_aberto_cents` em `data/api/clientes.ts`); `pendingNoValue` = pendentes sem valor informado;
 *  - `appointmentCents`: atendimento particular fechado como "Ainda não pagou" (`particularOpenCents`);
 *  - `copayCents`: coparticipação de convênio em aberto (`copayOpen`);
 *  - `insurerCents`: o que o CONVÊNIO ainda deve à clínica (`awaitingFromInsurers`).
 * `fichaCents` = as quatro partes (o número da Ficha). `clientCents` = sem o convênio: só o que o CLIENTE deve (decisão do
 * Christian de 12/11/2026, opção b; o convênio já está na seção Convênios de Resultados).
 */
export type OpenAmount = {
  recordsCents: number;
  pendingNoValue: number;
  appointmentCents: number;
  copayCents: number;
  insurerCents: number;
  fichaCents: number;
  clientCents: number;
  /** Quantas pendências do cliente: lançamentos pendentes (com ou sem valor), atendimentos não pagos e coparticipações. */
  items: number;
  /** Data mais antiga entre as pendências do cliente (vencimento do lançamento ou data do atendimento). */
  oldestIso: string | null;
};

/** Fechamentos de um cliente: pelo id do cadastro gravado no fechamento; sem id, pelo nome registrado. */
export const entriesOfClient = (clientId: string, entries: FinanceEntry[]) =>
entries.filter((e) => e.clientId ? e.clientId === clientId : clientIdOfRecordedName(e.clientName) === clientId);

function openAmountOf(records: FinancialRecord[], entries: FinanceEntry[]): OpenAmount {
  const pending = records.filter((r) => r.status === 'pending');
  const recordsCents = pending.reduce((t, r) => t + (r.amount_cents ?? 0), 0);
  const pendingNoValue = pending.filter((r) => r.amount_cents === null).length;
  const appointmentCents = particularOpenCents(entries);
  const copayCents = copayOpen(entries);
  const insurerCents = awaitingFromInsurers(entries);
  const openAppointments = entries.filter((e) => e.payer === 'particular' && e.particularOpen && e.totalCents - (e.depositCents ?? 0) > 0);
  const openCopays = entries.filter((e) => e.payer === 'convenio' && !e.copayPaid && e.copayCents > 0);
  const dates = [...pending.map((r) => r.origin_date), ...openAppointments.map((e) => e.iso), ...openCopays.map((e) => e.iso)].sort();
  return {
    recordsCents,
    pendingNoValue,
    appointmentCents,
    copayCents,
    insurerCents,
    fichaCents: recordsCents + insurerCents + copayCents + appointmentCents,
    clientCents: recordsCents + copayCents + appointmentCents,
    items: pending.length + openAppointments.length + openCopays.length,
    oldestIso: dates[0] ?? null
  };
}

/** Valor em aberto de um cliente do cadastro (lançamentos dele + fechamentos dele). */
export const clientOpenAmount = (clientId: string, entries: FinanceEntry[]): OpenAmount => openAmountOf(financialRecordsOf(clientId), entriesOfClient(clientId, entries));

/**
 * W9d (N-06) e W9f (12/11/2026, opção b do Christian): o que os CLIENTES ainda devem, para a seção "A receber de clientes"
 * de Resultados. Uma linha por cliente com `clientCents` de `clientOpenAmount` (o mesmo valor do "Em aberto" da Ficha, sem o
 * que o convênio deve). Da pendência mais antiga para a mais nova. Mostra o que está em aberto AGORA, de qualquer data.
 * Não entra no Faturamento realizado (`closurePayment` só gera recebimento quando o valor é pago).
 * Cliente excluído do cadastro: só os fechamentos dele (os lançamentos saem junto com o cadastro), pelo nome registrado,
 * com `clientId` `null` (a linha fica, sem levar à ficha).
 */
export type ClientReceivable = {key: string;clientId: string | null;name: string;items: number;openCents: number;oldestIso: string;};

export function clientReceivables(entries: FinanceEntry[]): ClientReceivable[] {
  const rows: ClientReceivable[] = [];
  const push = (key: string, clientId: string | null, name: string, o: OpenAmount) => {
    if (o.items === 0 || o.clientCents <= 0 && o.pendingNoValue === 0) return;
    rows.push({ key, clientId, name, items: o.items, openCents: o.clientCents, oldestIso: o.oldestIso ?? '' });
  };
  allClientsWithPhones().forEach((c) => push(c.id, c.id, currentClientName(c.id, c.name), clientOpenAmount(c.id, entries)));
  // Fechamentos de quem não está mais no cadastro, agrupados pelo nome registrado.
  const orphans = new Map<string, FinanceEntry[]>();
  entries.forEach((e) => {
    const id = e.clientId ?? clientIdOfRecordedName(e.clientName);
    if (id && clientById(id)) return;
    orphans.set(e.clientName, [...(orphans.get(e.clientName) ?? []), e]);
  });
  orphans.forEach((list, name) => push(`nome:${name}`, null, name, openAmountOf([], list)));
  return rows.sort((a, b) => a.oldestIso.localeCompare(b.oldestIso) || a.name.localeCompare(b.name, 'pt-BR'));
}