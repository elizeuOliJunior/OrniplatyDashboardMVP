/**
 * Fechamento financeiro de atendimentos (protótipo, só front-end).
 *
 * Pagador é uma coisa; forma de pagamento é outra:
 *  - payer: 'particular' (a cliente paga) ou 'convenio' (operadora cobre parte/tudo);
 *  - convênio NÃO é forma de pagamento: fechar sob convênio não marca nada como pago;
 *  - claimStatus acompanha a cobrança à operadora (pendente → enviado → aprovado/negado → recebido);
 *  - method só existe quando houve dinheiro de fato (particular, coparticipação paga ou repasse recebido).
 * Nenhuma operadora, regra de reembolso ou recebimento é inventado: a lista nasce vazia.
 * BACKEND: o `financial_records` real não tem pagador/operadora/status de repasse (não verificado em convênio; ver relatório).
 */
import { useSyncExternalStore } from 'react';
import { TODAY_ISO } from './agendaStore';
import { parseBRLCents } from '../utils/currency';

export type Payer = 'particular' | 'convenio';
export type ClaimStatus = 'pending' | 'submitted' | 'approved' | 'denied' | 'received';

export const CLAIM_LABEL: Record<ClaimStatus, string> = {
  pending: 'Pendente de envio',
  submitted: 'Enviado',
  approved: 'Aprovado',
  denied: 'Negado',
  received: 'Recebido'
};
export const CLAIM_ORDER: ClaimStatus[] = ['pending', 'submitted', 'approved', 'denied', 'received'];

/** Como o REPASSE do convênio entrou (canal da operadora). Para o cliente, use `clientMethodOptions` (formas da empresa). */
export const METHODS = [
{ value: 'pix', label: 'Pix' },
{ value: 'cartao', label: 'Cartão' },
{ value: 'dinheiro', label: 'Dinheiro' },
{ value: 'transferencia', label: 'Transferência' }];

/** G3 (F-041): formas do cliente = as formas salvas em IA Orniplaty › Empresa (P6). "Cartão" fica só para registros antigos. */
const CLIENT_METHOD_LABEL: Record<string, string> = { pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro' };
export const clientMethodOptions = (payments: string[]) =>
['pix', 'credito', 'debito', 'dinheiro'].filter((m) => payments.includes(m)).map((value) => ({ value, label: CLIENT_METHOD_LABEL[value] }));
export const methodLabel = (m?: string | null) => CLIENT_METHOD_LABEL[m ?? ''] ?? METHODS.find((x) => x.value === m)?.label ?? m ?? '';
/** "Crédito em 3x" quando houve parcelamento. */
export const methodWithInstallments = (m?: string | null, n?: number | null) => `${methodLabel(m)}${m === 'credito' && n && n > 1 ? ` em ${n}x` : ''}`;

export type FinanceEntry = {
  id: string;
  clientName: string;
  iso: string;
  time: string;
  service: string;
  payer: Payer;
  insurer: string;
  plan: string;
  totalCents: number;
  /** parte coberta pela operadora (0 se particular) */
  coveredCents: number;
  /** parte da cliente (total - coberto) */
  copayCents: number;
  copayPaid: boolean;
  copayMethod: string | null;
  claimStatus: ClaimStatus;
  /** valor efetivamente recebido da operadora */
  receivedCents: number;
  claimMethod: string | null;
  /** particular: forma de pagamento */
  method: string | null;
  /** G1 subetapa 3: id do agendamento fechado (identidade estável do evento; a chave antiga dia|hora|nome continua no `id`). */
  appointmentId?: string | null;
  /** G1 subetapa 3: id do cadastro no momento do fechamento (a ficha e Resultados leem por ele, não pelo nome). */
  clientId?: string | null;
  /** G1 subetapa 3: data em que o fechamento foi registrado = data do pagamento particular e da coparticipação paga no ato. */
  closedIso?: string;
  /** G1 subetapa 3: data em que o repasse do convênio foi registrado como recebido (P1: o fechamento quita nessa data). */
  claimReceivedIso?: string | null;
  /** Registro de AMOSTRA (fixture identificada), não criado na sessão. */
  fixture?: boolean;
  /**
   * G3 (F-041): valor do serviço ANTES do desconto aplicado (bruto). `totalCents` continua sendo o valor cobrado
   * (bruto − desconto). Registros antigos não têm: bruto = total.
   */
  grossCents?: number;
  /** G3: desconto à vista aplicado EXPLICITAMENTE no fechamento (0 = nenhum). */
  discountCents?: number;
  /** G3: parcelas no crédito (1 = à vista). */
  installments?: number | null;
  /** G3: sinais já recebidos (data e forma próprias, `DepositReceipt`) descontados UMA vez neste fechamento. */
  depositIds?: string[];
  depositCents?: number;
  /** G3 (F-043): observação do fechamento. */
  note?: string;
  /** G3 (F-052): sessão de pacote usada neste atendimento (cobrança R$ 0, sem recebível novo). */
  packageSaleId?: string | null;
  /** Id do lançamento de consumo no razão do pacote (para estornar na correção). */
  packageEntryId?: string | null;
  /** G3: particular com valor a receber ainda em aberto (ex.: pacote tirado na correção). Ausente = pago no ato. */
  particularOpen?: boolean;
  /** G3: data em que o valor em aberto foi recebido. */
  paidIso?: string | null;
};

/* ─────────── sinal recebido (G3, F-041) ─────────── */

/**
 * Sinal RECEBIDO de um agendamento: dinheiro de verdade, com data, valor e forma próprios. Um sinal configurado no
 * serviço NÃO é pagamento; só este registro é. Recebimentos lê cada sinal na data real; o fechamento desconta o sinal uma
 * vez (`depositIds`) e o valor pago do fechamento = sinal + restante, no período em que o restante foi pago (P1).
 * CONTRATO NOVO (G6): não existe registro de sinal no backend lido.
 */
export type DepositReceipt = {
  id: string;
  appointmentId: string;
  clientId: string | null;
  clientName: string;
  service: string;
  /** Data real do recebimento. */
  iso: string;
  cents: number;
  method: string;
  by: string;
  at: string;
  fixture?: boolean;
};

let deposits: DepositReceipt[] = [];
const depositListeners = new Set<() => void>();
const subscribeDeposits = (l: () => void) => {
  depositListeners.add(l);
  return () => depositListeners.delete(l);
};
const emitDeposits = (next: DepositReceipt[]) => {
  deposits = next;
  depositListeners.forEach((l) => l());
};
export const getDeposits = () => deposits;
export const useDeposits = () => useSyncExternalStore(subscribeDeposits, () => deposits);
export const depositsOfAppointment = (appointmentId: string | null | undefined) => appointmentId ? deposits.filter((d) => d.appointmentId === appointmentId) : [];
export function addDeposit(input: Omit<DepositReceipt, 'id'>): DepositReceipt {
  const d = { ...input, id: `sinal-${Date.now()}${Math.floor(Math.random() * 1000)}` };
  emitDeposits([...deposits, d]);
  return d;
}
/** Só para a fixture identificada do seletor de telas (liga/desliga). */
export function setDepositFixtures(list: DepositReceipt[]) {
  emitDeposits([...deposits.filter((d) => !d.fixture), ...list]);
}
/** Sinais já usados por algum fechamento (não podem ser descontados de novo). */
export const appliedDepositIds = () => new Set(entries.flatMap((e) => e.depositIds ?? []));

/**
 * FIXTURE DA AMOSTRA (decisão E3 do Christian, 25/10/2026): o caso fixo da Carla já dizia "Atendida e paga em 01/10".
 * Este é o fechamento pago que sustenta essa afirmação (Limpeza de pele, R$ 180,00 no Pix, horário j1 de 01/10, 08:00).
 * Nenhum outro pagamento de amostra foi criado; o atendimento de 30/09 continua sem fechamento de propósito.
 */
function sampleClosure(clientId: string, clientName: string, appointmentId: string, iso: string, time: string, service: string, cents: number, method: string): FinanceEntry {
  return {
    id: `${iso}|${time}|${clientName}`, clientName, iso, time, service, payer: 'particular', insurer: '', plan: '', totalCents: cents, coveredCents: 0, copayCents: 0,
    copayPaid: true, copayMethod: null, claimStatus: 'received', receivedCents: cents, claimMethod: null, method, appointmentId, clientId, closedIso: iso,
    claimReceivedIso: null, fixture: true
  };
}
const SAMPLE_ENTRIES: FinanceEntry[] = [
{
  id: '2026-10-01|08:00|Carla Mendes',
  clientName: 'Carla Mendes',
  iso: '2026-10-01',
  time: '08:00',
  service: 'Limpeza de pele',
  payer: 'particular',
  insurer: '',
  plan: '',
  totalCents: 18000,
  coveredCents: 0,
  copayCents: 0,
  copayPaid: true,
  copayMethod: null,
  claimStatus: 'received',
  receivedCents: 18000,
  claimMethod: null,
  method: 'pix',
  appointmentId: 'j1',
  clientId: 'carla-mendes',
  closedIso: '2026-10-01',
  claimReceivedIso: null,
  fixture: true
},
// W5 (G10, 11/11/2026): Igor (28/09) e Diego (29/09) tinham o dinheiro só num lançamento avulso, que Resultados não lia
// (A4-01). O dinheiro de um atendimento é o fechamento dele: viraram fechamentos, mesmos valores, formas e datas.
sampleClosure('igor-matos', 'Igor Matos', 's3', '2026-09-28', '15:00', 'Limpeza de pele', 18000, 'debito'),
sampleClosure('diego-alves', 'Diego Alves', 't4', '2026-09-29', '15:30', 'Drenagem linfática', 15000, 'pix')];


let entries: FinanceEntry[] = SAMPLE_ENTRIES;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = (next: FinanceEntry[]) => {
  entries = next;
  listeners.forEach((l) => l());
};

export const getFinanceEntries = () => entries;
export const useFinanceEntries = () => useSyncExternalStore(subscribe, () => entries);

/** Fecha (ou refecha) o financeiro de um atendimento. Chave: dia + horário + cliente. */
export function closeFinance(input: Omit<FinanceEntry, 'id'>) {
  const id = `${input.iso}|${input.time}|${input.clientName}`;
  const prev = entries.find((e) => e.id === id);
  // G1: fechar de novo/corrigir mantém a data do fechamento original; repasse recebido no ato quita na mesma data.
  const closedIso = input.closedIso ?? prev?.closedIso ?? TODAY_ISO;
  const claimReceivedIso =
  input.payer === 'convenio' && input.claimStatus === 'received' ? input.claimReceivedIso ?? prev?.claimReceivedIso ?? closedIso : input.claimReceivedIso ?? null;
  emit([{ ...input, id, closedIso, claimReceivedIso }, ...entries.filter((e) => e.id !== id)]);
  return id;
}

export function updateClaim(id: string, patch: Partial<Pick<FinanceEntry, 'claimStatus' | 'receivedCents' | 'claimMethod'>>) {
  // G1 (P1): a data em que o repasse passa a "Recebido" fica gravada; sair de "Recebido" apaga a data.
  emit(
    entries.map((e) => {
      if (e.id !== id) return e;
      const next = { ...e, ...patch };
      if (patch.claimStatus === 'received' && e.claimStatus !== 'received') next.claimReceivedIso = TODAY_ISO;
      if (patch.claimStatus && patch.claimStatus !== 'received') next.claimReceivedIso = null;
      return next;
    })
  );
}

/** G3: registra o recebimento de um valor particular que estava em aberto (data = relógio do protótipo). */
export function registerOpenPayment(id: string, method: string) {
  emit(entries.map((e) => e.id === id && e.particularOpen ? { ...e, particularOpen: false, method, paidIso: TODAY_ISO, receivedCents: e.totalCents } : e));
}

/** Valor que a clínica de fato recebeu deste fechamento (antes de reembolsos), por parte. */
export function receivedParts(e: FinanceEntry): {component: 'particular' | 'sinal' | 'coparticipacao' | 'repasse';label: string;cents: number;}[] {
  const out: {component: 'particular' | 'sinal' | 'coparticipacao' | 'repasse';label: string;cents: number;}[] = [];
  const dep = e.depositCents ?? 0;
  if (dep > 0) out.push({ component: 'sinal', label: 'Sinal recebido do cliente', cents: dep });
  if (e.packageSaleId) return out;
  if (e.payer === 'particular') {
    const rest = e.totalCents - dep;
    if (!e.particularOpen && rest > 0) out.push({ component: 'particular', label: 'Recebido do cliente', cents: rest });
  } else {
    if (e.copayCents > 0 && e.copayPaid) out.push({ component: 'coparticipacao', label: 'Coparticipação recebida do cliente', cents: e.copayCents });
    if (e.claimStatus === 'received' && e.receivedCents > 0) out.push({ component: 'repasse', label: `Repasse recebido do convênio${e.insurer ? ` ${e.insurer}` : ''}`, cents: e.receivedCents });
  }
  return out;
}

export const insurersUsed = () => Array.from(new Set(entries.filter((e) => e.payer === 'convenio' && e.insurer).map((e) => e.insurer)));

/** "180,00" → 18000 */
export function parseMoney(s: string): number {
  // G1 (F-055): conversor único; "12.50" não vira mais R$ 1.250,00.
  return parseBRLCents(s);
}
export const moneyInput = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Quanto ainda falta receber da operadora (não conta negado nem recebido). */
export const awaitingFromInsurers = (list: FinanceEntry[]) =>
list.filter((e) => e.payer === 'convenio' && ['pending', 'submitted', 'approved'].includes(e.claimStatus)).reduce((t, e) => t + e.coveredCents, 0);
/** Coparticipação da cliente ainda em aberto. */
export const copayOpen = (list: FinanceEntry[]) => list.filter((e) => e.payer === 'convenio' && !e.copayPaid).reduce((t, e) => t + e.copayCents, 0);
/** G3: valor particular ainda em aberto (restante depois do sinal). */
export const particularOpenCents = (list: FinanceEntry[]) => list.filter((e) => e.payer === 'particular' && e.particularOpen).reduce((t, e) => t + Math.max(0, e.totalCents - (e.depositCents ?? 0)), 0);