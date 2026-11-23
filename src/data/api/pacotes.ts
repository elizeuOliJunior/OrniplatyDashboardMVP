/**
 * SIMULAÇÃO DO BACKEND DE PACOTES (protótipo, sem rede).
 *
 * Espelha os endpoints reais do `agenda-plus-api` (branch main):
 *   POST /api/packages · GET /api/packages?client_id · GET /api/packages/{id}
 *   PATCH /api/packages/{id} · DELETE /api/packages/{id}
 *   POST /api/packages/{id}/cancel · /freeze · /reactivate
 *   PATCH /api/financial-records/{id} (registrar pagamento)
 *
 * As respostas têm o mesmo formato de `PackageSaleResponse` / `PackageSaleDetail`.
 * As telas só LEEM `status`, `saldo`, `recebido_cents`… daqui, como fariam com a API.
 * As únicas contas abaixo reproduzem o que o servidor faz (packages/status.py e a soma do
 * razão); no produto elas não existem no frontend.
 */
import { useSyncExternalStore } from 'react';
import { TODAY_ISO, nowIso } from '../agendaStore';
import { catalogServices } from '../catalogo';
import { getTeam } from '../availability';
import { actor } from '../legado';

export type PackagePaymentPlan = 'cash' | 'card_installments' | 'clinic_installments';

export type FinancialRecord = {
  id: string;
  client_id: string;
  package_sale_id: string | null;
  appointment_id: string | null;
  /** Data de origem (vencimento da parcela ou data do atendimento) */
  origin_date: string;
  /** null = valor ainda não informado ("Aguardando valor") */
  amount_cents: number | null;
  status: 'pending' | 'received';
  method: string | null;
  received_date: string | null;
  installment_number: number | null;
  installment_total: number | null;
  package_description: string | null;
  description: string | null;
};

export type PackageLedgerEntry = {
  id: string;
  entry_type: 'grant' | 'consumption' | 'reversal' | 'adjustment';
  quantity: number;
  appointment_id: string | null;
  appointment_date: string | null;
  reverses_entry_id: string | null;
  reversed_at: string | null;
  reason: string | null;
  created_by_user_name: string | null;
  created_at: string;
};

export type PackageSaleChange = {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by_name: string | null;
  changed_at: string;
};

type SaleRow = {
  id: string;
  client_id: string;
  client_name: string;
  service_id: string | null;
  service_name_snapshot: string;
  total_sessions: number;
  total_amount_cents: number;
  sold_at: string;
  expires_at: string | null;
  payment_plan: PackagePaymentPlan;
  card_installments: number | null;
  preferred_professional_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  frozen_at: string | null;
  freeze_reason: string | null;
  notes: string | null;
  created_at: string;
  ledger: PackageLedgerEntry[];
  changes: PackageSaleChange[];
};

/** Formato de `PackageSaleResponse`. */
export type PackageSale = Omit<SaleRow, 'ledger' | 'changes' | 'client_name'> & {
  saldo: number;
  status: 'active' | 'completed' | 'expired' | 'cancelled' | 'frozen';
  recebido_cents: number;
  a_receber_cents: number;
  parcelas_pendentes: number;
  parcelas_vencidas: number;
  proximo_vencimento: string | null;
  preferred_professional_name: string | null;
  preferred_professional_disponivel: boolean;
};

/** Formato de `PackageSaleDetail`. */
export type PackageSaleDetail = PackageSale & {
  ledger: PackageLedgerEntry[];
  changes: PackageSaleChange[];
  financial_records: FinancialRecord[];
  edicao: {pode_excluir: boolean;};
  /** G3: reembolsos registrados no cancelamento (saídas, cada uma na data real). */
  refunds: PackageRefund[];
};

/**
 * Autor das movimentações da AMOSTRA (histórico fixo). G1 (23/10/2026): eventos NOVOS (venda, ajuste de sessões,
 * alteração, congelamento, reativação, cancelamento) gravam `actor()` (data/legado.ts) no momento da ação; o texto fica
 * guardado no registro e não acompanha mudanças posteriores de Perfil nem do nome do responsável.
 */
const SAMPLE_AUTHOR = 'Marina Souza';
/** Relógio único do protótipo (data/agendaStore.ts). */
const agora = () => nowIso();

// ── amostra (dados de exemplo do protótipo) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** W5 (A4-15): cada sessão usada da amostra aponta para o atendimento concluído correspondente (agenda ou histórico do cadastro). */
const consumo = (id: string, date: string, appointmentId: string | null = null): PackageLedgerEntry => ({
  id,
  entry_type: 'consumption',
  quantity: -1,
  appointment_id: appointmentId,
  appointment_date: date,
  reverses_entry_id: null,
  reversed_at: null,
  reason: null,
  created_by_user_name: SAMPLE_AUTHOR,
  created_at: `${date}T12:00:00`
});
const grant = (id: string, n: number, date: string, by: string = SAMPLE_AUTHOR): PackageLedgerEntry => ({
  id,
  entry_type: 'grant',
  quantity: n,
  appointment_id: null,
  appointment_date: null,
  reverses_entry_id: null,
  reversed_at: null,
  reason: null,
  created_by_user_name: by,
  created_at: `${date}T09:00:00`
});
const svc = (value: string) => catalogServices.find((s) => s.value === value)!;

/** W5 (A4-15): as 10 sessões do pacote de Drenagem da Gabriela (as mesmas datas de antes), agora com atendimento no histórico. */
export const GABRIELA_DRENAGEM = Array.from({ length: 10 }, (_, i) => `2026-0${3 + Math.floor(i / 3)}-${String(2 + i % 3 * 9).padStart(2, '0')}`);

let sales: SaleRow[] = [
{
  id: 'pk3', client_id: 'ana-ribeiro', client_name: 'Ana Ribeiro', service_id: 'limpeza', service_name_snapshot: 'Limpeza de pele',
  total_sessions: 6, total_amount_cents: 108000, sold_at: '2026-05-03', expires_at: '2026-12-15', payment_plan: 'cash', card_installments: null,
  preferred_professional_id: 'carolina', cancelled_at: null, cancel_reason: null, frozen_at: null, freeze_reason: null, notes: null, created_at: '2026-05-03T09:00:00',
  ledger: [grant('l31', 6, '2026-05-03'), consumo('l32', '2026-05-03', 'h-a4'), consumo('l33', '2026-06-14', 'h-a2'), consumo('l34', '2026-07-12', 'h-a1')],
  changes: []
},
{
  id: 'pk1', client_id: 'bruno-costa', client_name: 'Bruno Costa', service_id: 'drenagem', service_name_snapshot: 'Drenagem linfática',
  total_sessions: 10, total_amount_cents: 150000, sold_at: '2026-08-04', expires_at: null, payment_plan: 'card_installments', card_installments: 3,
  preferred_professional_id: 'juliana', cancelled_at: null, cancel_reason: null, frozen_at: null, freeze_reason: null, notes: null, created_at: '2026-08-04T09:00:00',
  // W5 (A4-15): a 5ª sessão passou de 15/09 para 24/09, o atendimento de Drenagem que já existia na agenda (set-bruno).
  ledger: [grant('l11', 10, '2026-08-04'), ...([['2026-08-04', 'h-b1'], ['2026-08-18', 'h-b2'], ['2026-09-01', 'h-b3'], ['2026-09-08', 'h-b4'], ['2026-09-24', 'set-bruno'], ['2026-09-28', 's1']] as const).map(([d, a], i) => consumo(`l1${i + 2}`, d, a))],
  changes: []
},
{
  id: 'pk2', client_id: 'fernanda-lima', client_name: 'Fernanda Lima', service_id: 'limpeza', service_name_snapshot: 'Limpeza de pele',
  total_sessions: 6, total_amount_cents: 108000, sold_at: '2026-08-10', expires_at: '2026-11-10', payment_plan: 'clinic_installments', card_installments: null,
  preferred_professional_id: null, cancelled_at: null, cancel_reason: null, frozen_at: null, freeze_reason: null, notes: null, created_at: '2026-08-10T09:00:00',
  ledger: [grant('l21', 6, '2026-08-10'), consumo('l22', '2026-08-10', 'h-f1'), consumo('l23', '2026-09-30', 'q1')],
  changes: [
  { id: 'c21', field: 'expires_at', old_value: '2026-10-10', new_value: '2026-11-10', reason: 'Viagem da cliente em setembro', changed_by_name: SAMPLE_AUTHOR, changed_at: '2026-09-02T10:15:00' }]

},
{
  id: 'pk5', client_id: 'helena-duarte', client_name: 'Helena Duarte', service_id: 'peeling', service_name_snapshot: 'Peeling químico',
  total_sessions: 4, total_amount_cents: 100000, sold_at: '2026-07-15', expires_at: '2026-10-25', payment_plan: 'cash', card_installments: null,
  preferred_professional_id: 'carolina', cancelled_at: null, cancel_reason: null, frozen_at: null, freeze_reason: null, notes: null, created_at: '2026-07-15T09:00:00',
  // W5 (A4-15): a 3ª sessão passou de 15/09 para 28/09, o Peeling que já existia na agenda (s2).
  ledger: [grant('l51', 4, '2026-07-15'), consumo('l52', '2026-07-15', 'h-h1'), consumo('l53', '2026-08-15', 'h-h2'), consumo('l54', '2026-09-28', 's2')],
  changes: []
},
{
  id: 'pk4', client_id: 'gabriela-rocha', client_name: 'Gabriela Rocha', service_id: 'drenagem', service_name_snapshot: 'Drenagem linfática',
  total_sessions: 10, total_amount_cents: 150000, sold_at: '2026-03-02', expires_at: '2026-09-02', payment_plan: 'cash', card_installments: null,
  preferred_professional_id: null, cancelled_at: null, cancel_reason: null, frozen_at: null, freeze_reason: null, notes: null, created_at: '2026-03-02T09:00:00',
  ledger: [grant('l41', 10, '2026-03-02'), ...GABRIELA_DRENAGEM.map((d, i) => consumo(`l4x${i}`, d, `h-g${i}`))],
  changes: []
},
// G3 (lote G3 item F, aulas em grupo, 23/11/2026; CONTRATO NOVO): pacote de amostra de "Pilates em grupo" da Mariana
// Teixeira, fixa da turma de terça e quinta (data/turmas.ts, `insc-1` paga por ele). Vendido antes de 28/09 (amostra
// histórica). Cada presença na chamada usa uma sessão pelo mesmo `consumeSession` do fechamento.
{
  id: 'pk6', client_id: 'mariana-teixeira', client_name: 'Mariana Teixeira', service_id: 'pilates-grupo', service_name_snapshot: 'Pilates em grupo',
  total_sessions: 8, total_amount_cents: 44000, sold_at: '2026-09-14', expires_at: '2026-12-14', payment_plan: 'cash', card_installments: null,
  preferred_professional_id: 'rafael', cancelled_at: null, cancel_reason: null, frozen_at: null, freeze_reason: null, notes: null, created_at: '2026-09-14T09:00:00',
  ledger: [grant('l61', 8, '2026-09-14')],
  changes: []
}];


let records: FinancialRecord[] = [
rec('f31', 'ana-ribeiro', 'pk3', '2026-05-03', 108000, 'received', 'pix', null, null, 'Limpeza de pele · 6 sessões'),
rec('f11', 'bruno-costa', 'pk1', '2026-08-04', 150000, 'received', 'credit', null, null, 'Drenagem linfática · 10 sessões'),
rec('f21', 'fernanda-lima', 'pk2', '2026-08-10', 36000, 'received', 'pix', 1, 3, 'Limpeza de pele · 6 sessões'),
rec('f22', 'fernanda-lima', 'pk2', '2026-09-10', 36000, 'received', 'pix', 2, 3, 'Limpeza de pele · 6 sessões'),
rec('f23', 'fernanda-lima', 'pk2', '2026-10-10', 36000, 'pending', null, 3, 3, 'Limpeza de pele · 6 sessões'),
rec('f51', 'helena-duarte', 'pk5', '2026-07-15', 100000, 'received', 'pix', null, null, 'Peeling químico · 4 sessões'),
rec('f41', 'gabriela-rocha', 'pk4', '2026-03-02', 150000, 'received', 'cash', null, null, 'Drenagem linfática · 10 sessões'),
// G3 (item F): pagamento do pacote de amostra de Pilates em grupo (à vista, Pix, na venda).
rec('f61', 'mariana-teixeira', 'pk6', '2026-09-14', 44000, 'received', 'pix', null, null, 'Pilates em grupo · 8 sessões')
// W5 (G10, 11/11/2026): o dinheiro de um atendimento é o FECHAMENTO dele (data/convenios.ts). Saíram daqui:
//  - fa1 (Carla, 01/10) e fa4 (Gabriela, 30/09, "Aguardando valor"): lançamentos repetidos, remoção aprovada pelo Christian;
//  - fa2 (Igor, 28/09) e fa3 (Diego, 29/09): viraram fechamentos da amostra, ligados aos atendimentos s3 e t4.
// Lançamento avulso continua existindo para dinheiro SEM atendimento (nenhum na amostra).
];

function rec(
id: string, client_id: string, package_sale_id: string | null, date: string, amount: number | null, status: 'pending' | 'received',
method: string | null, n: number | null, total: number | null, pkg: string | null)
: FinancialRecord {
  return {
    id, client_id, package_sale_id, appointment_id: null, origin_date: date, amount_cents: amount, status, method,
    received_date: status === 'received' ? date : null, installment_number: n, installment_total: total, package_description: pkg, description: null
  };
}

// ── store ─────────────────────────────────────────────────────────────────────────────────────────────────────────

let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** Re-renderiza quando qualquer pacote ou lançamento muda (equivale a refazer a consulta). */
export function useBackendVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

// ── o que o servidor calcula (packages/status.py + soma do razão) ───────────

const saldoDe = (s: SaleRow) => s.ledger.reduce((t, l) => t + l.quantity, 0);

function statusDe(s: SaleRow, saldo: number): PackageSale['status'] {
  if (s.cancelled_at) return 'cancelled';
  if (s.frozen_at) return 'frozen';
  if (saldo <= 0) return 'completed';
  if (s.expires_at && s.expires_at < TODAY_ISO) return 'expired';
  return 'active';
}

function resposta(s: SaleRow): PackageSale {
  const { ledger: _l, changes: _c, client_name: _n, ...rest } = s;
  const saldo = saldoDe(s);
  const meus = records.filter((r) => r.package_sale_id === s.id);
  const pendentes = meus.filter((r) => r.status === 'pending');
  const pro = getTeam().members.find((m) => m.id === s.preferred_professional_id);
  return {
    ...rest,
    saldo,
    status: statusDe(s, saldo),
    recebido_cents: meus.filter((r) => r.status === 'received').reduce((t, r) => t + (r.amount_cents ?? 0), 0),
    a_receber_cents: pendentes.reduce((t, r) => t + (r.amount_cents ?? 0), 0),
    parcelas_pendentes: pendentes.length,
    parcelas_vencidas: pendentes.filter((r) => r.origin_date < TODAY_ISO).length,
    proximo_vencimento: pendentes.map((r) => r.origin_date).sort()[0] ?? null,
    preferred_professional_name: pro?.name ?? null,
    preferred_professional_disponivel: pro ? pro.active !== false && pro.services.includes(s.service_name_snapshot) : false
  };
}

const find = (id: string) => {
  const s = sales.find((x) => x.id === id);
  if (!s) throw new Error('Pacote não encontrado.');
  return s;
};
/** Linha do histórico do contrato: o autor é quem fez a ação AGORA (gravado, não recalculado). */
const change = (s: SaleRow, field: string, old_value: string | null, new_value: string | null, reason: string | null) =>
s.changes.push({ id: `c${Date.now()}${s.changes.length}`, field, old_value, new_value, reason, changed_by_name: actor(), changed_at: agora() });

// ── endpoints ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** GET /api/packages?client_id=… */
export function listPackages(params: {client_id?: string;} = {}): (PackageSale & {client_name: string;})[] {
  return sales.
  filter((s) => !params.client_id || s.client_id === params.client_id).
  sort((a, b) => a.sold_at < b.sold_at ? 1 : -1).
  map((s) => ({ ...resposta(s), client_name: s.client_name }));
}

/** GET /api/packages/{id} */
export function getPackage(id: string): PackageSaleDetail {
  const s = find(id);
  const financial_records = records.filter((r) => r.package_sale_id === id).sort((a, b) => a.origin_date < b.origin_date ? -1 : 1);
  const teveEfeito = s.ledger.some((l) => l.entry_type === 'consumption') || financial_records.some((r) => r.status === 'received');
  return { ...resposta(s), ledger: [...s.ledger], changes: [...s.changes], financial_records, edicao: { pode_excluir: !teveEfeito }, refunds: refundsOfPackage(id) };
}

export type PackageSaleCreate = {
  client_id: string;
  client_name: string;
  service_id: string;
  total_sessions: number;
  total_amount_cents: number;
  sold_at: string;
  expires_at: string | null;
  payment_plan: PackagePaymentPlan;
  payment_method: string | null;
  card_installments: number | null;
  installments?: {due_date: string;amount_cents: number;}[];
  preferred_professional_id: string | null;
};

/** POST /api/packages — venda gera o direito (grant) e o dinheiro (financial_record), no mesmo gesto. */
export function createPackage(input: PackageSaleCreate): PackageSale {
  const service = svc(input.service_id);
  const id = `pk${Date.now()}`;
  const sale: SaleRow = {
    id, client_id: input.client_id, client_name: input.client_name, service_id: input.service_id, service_name_snapshot: service.label,
    total_sessions: input.total_sessions, total_amount_cents: input.total_amount_cents, sold_at: input.sold_at, expires_at: input.expires_at,
    payment_plan: input.payment_plan, card_installments: input.card_installments, preferred_professional_id: input.preferred_professional_id,
    cancelled_at: null, cancel_reason: null, frozen_at: null, freeze_reason: null, notes: null, created_at: agora(),
    ledger: [grant(`${id}g`, input.total_sessions, input.sold_at, actor())],
    changes: []
  };
  sales = [sale, ...sales];
  const desc = `${service.label} · ${input.total_sessions} sessões`;
  if (input.total_amount_cents > 0) {
    if (input.payment_plan === 'clinic_installments') {
      const parcelas = input.installments ?? [];
      parcelas.forEach((p, i) =>
      records.push(rec(`${id}f${i}`, input.client_id, id, p.due_date, p.amount_cents, 'pending', null, i + 1, parcelas.length, desc))
      );
    } else {
      records.push(rec(`${id}f`, input.client_id, id, input.sold_at, input.total_amount_cents, 'received', input.payment_plan === 'card_installments' ? 'credit' : input.payment_method, null, null, desc));
    }
  }
  emit();
  return resposta(sale);
}

// ── G3 (F-052): uso de sessão no atendimento, estorno, reembolso e exclusão auditada ─────────────────────────

/** FinancialRefund do cancelamento de pacote (mesmo nome do legado; formato mínimo do protótipo). */
export type PackageRefund = {
  id: string;
  package_sale_id: string;
  client_id: string;
  amount_cents: number;
  method: string;
  refund_date: string;
  reason: string;
  created_by_user_name: string;
  created_at: string;
  service_name_snapshot: string;
};
/** Registro de auditoria de pacote excluído (CONTRATO: o legado só registrava a exclusão; o motivo era descartado na tela). */
export type PackageDeletion = {
  id: string;
  package_sale_id: string;
  client_id: string;
  client_name: string;
  service_name_snapshot: string;
  total_sessions: number;
  total_amount_cents: number;
  reason: string;
  deleted_by_name: string;
  deleted_at: string;
  received_cents: number;
  refunded_cents: number;
};
let refunds: PackageRefund[] = [];
let deletions: PackageDeletion[] = [];
const brlCents = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const refundsOfPackage = (id: string) => refunds.filter((r) => r.package_sale_id === id);
export const packageDeletions = () => [...deletions];
/** Recebido do pacote menos reembolsos já feitos (limite do próximo reembolso). */
export function refundableOf(id: string) {
  const recebido = records.filter((r) => r.package_sale_id === id && r.status === 'received').reduce((t, r) => t + (r.amount_cents ?? 0), 0);
  return Math.max(0, recebido - refundsOfPackage(id).reduce((t, r) => t + r.amount_cents, 0));
}
/** Nome do serviço de um pacote, inclusive excluído (para Resultados e a ficha). */
export const packageServiceName = (id: string) => sales.find((s) => s.id === id)?.service_name_snapshot ?? deletions.find((d) => d.package_sale_id === id)?.service_name_snapshot ?? 'Pacote';
/** Todos os recebimentos de pacote (inclusive de pacote excluído) e todos os reembolsos, cada um na data real. */
export const allPackageReceipts = () => records.filter((r) => r.package_sale_id && r.status === 'received' && r.received_date && (r.amount_cents ?? 0) > 0);
export const allPackageRefunds = () => [...refunds];
/** W5 (A4-01): lançamentos avulsos RECEBIDOS (dinheiro sem pacote), cada um na data real. Resultados tira os que têm fechamento. */
export const allOneOffReceipts = () => records.filter((r) => !r.package_sale_id && r.status === 'received' && r.received_date && (r.amount_cents ?? 0) > 0);

/**
 * W5 (G10, A4-02): ao fechar um atendimento, o lançamento PENDENTE do mesmo atendimento vira o próprio fechamento e sai de
 * "Lançamentos" (a pendência acaba). Mesmo atendimento = mesmo id de agendamento, ou mesmo dia + mesmo serviço do cliente.
 * Devolve quantos lançamentos foram absorvidos. BACKEND: o fechamento encerra o `financial_record` pendente do atendimento.
 */
export function absorbAppointmentRecords(clientId: string | null, appointmentId: string | null, iso: string, service: string): number {
  if (!clientId) return 0;
  const match = (r: FinancialRecord) =>
  !r.package_sale_id && r.status === 'pending' && r.client_id === clientId && (!!appointmentId && r.appointment_id === appointmentId || r.origin_date === iso && r.description === service);
  const n = records.filter(match).length;
  if (n) {
    records = records.filter((r) => !match(r));
    emit();
  }
  return n;
}

const usedBy = (s: SaleRow, appointmentId: string) => s.ledger.find((l) => l.entry_type === 'consumption' && l.appointment_id === appointmentId && !l.reversed_at);

/**
 * Pacotes que podem cobrir um atendimento: mesmo cliente e mesmo serviço, ativos (não congelados, cancelados, vencidos nem
 * concluídos), com saldo e validade até a data do atendimento. Mesma regra de status do servidor (`statusDe`).
 */
export function usablePackagesFor(clientId: string | null, serviceName: string, appointmentIso: string, ignoreAppointmentId?: string) {
  if (!clientId) return [];
  return sales.
  filter((s) => s.client_id === clientId && (s.service_name_snapshot === serviceName || svcLabel(s.service_id) === serviceName)).
  map((s) => ({ s, r: resposta(s) })).
  filter(({ s, r }) => {
    // Um atendimento que JÁ usa este pacote conta a própria sessão como disponível (correção sem estorno prévio).
    const own = ignoreAppointmentId && usedBy(s, ignoreAppointmentId) ? 1 : 0;
    const saldo = r.saldo + own;
    const status = own ? statusDe(s, saldo) : r.status;
    return status === 'active' && saldo > 0 && (!s.expires_at || s.expires_at >= appointmentIso);
  }).
  map(({ s, r }) => ({ ...r, client_name: s.client_name }));
}
const svcLabel = (serviceId: string | null) => serviceId ? catalogServices.find((x) => x.value === serviceId)?.label ?? null : null;

/** Por que um pacote NÃO pode cobrir o atendimento (texto para a tela). null = pode. */
export function packageBlockReason(id: string, clientId: string | null, serviceName: string, appointmentIso: string): string | null {
  const s = sales.find((x) => x.id === id);
  if (!s) return 'O pacote não existe mais.';
  const r = resposta(s);
  if (s.client_id !== clientId) return 'O pacote é de outro cliente.';
  if (s.service_name_snapshot !== serviceName && svcLabel(s.service_id) !== serviceName) return `O pacote é de ${s.service_name_snapshot}, não de ${serviceName}.`;
  if (r.status === 'cancelled') return 'O pacote foi cancelado.';
  if (r.status === 'frozen') return 'O pacote está congelado.';
  if (r.saldo <= 0) return 'O pacote não tem mais sessões.';
  if (r.status === 'expired' || s.expires_at && s.expires_at < appointmentIso) return 'O pacote venceu.';
  return null;
}

/** Sessão consumida (e não estornada) por um atendimento, em qualquer pacote. */
export function consumptionOf(appointmentId: string): {saleId: string;entry: PackageLedgerEntry;} | null {
  for (const s of sales) {
    const e = usedBy(s, appointmentId);
    if (e) return { saleId: s.id, entry: { ...e } };
  }
  return null;
}

/**
 * Usa UMA sessão do pacote no atendimento. IDEMPOTENTE: se o atendimento já usa este pacote, devolve o mesmo lançamento
 * (salvar de novo não consome outra sessão). Se usa OUTRO pacote, recusa (troque pela correção, que estorna antes).
 */
export function consumeSession(saleId: string, appointmentId: string, appointmentIso: string, clientId: string | null, serviceName: string): PackageLedgerEntry {
  const s = find(saleId);
  const same = usedBy(s, appointmentId);
  if (same) return { ...same };
  const other = consumptionOf(appointmentId);
  if (other) throw new Error('Este atendimento já usa uma sessão de outro pacote.');
  const why = packageBlockReason(saleId, clientId, serviceName, appointmentIso);
  if (why) throw new Error(why);
  const entry: PackageLedgerEntry = {
    id: `${saleId}u${Date.now()}${Math.floor(Math.random() * 1000)}`, entry_type: 'consumption', quantity: -1, appointment_id: appointmentId,
    appointment_date: appointmentIso, reverses_entry_id: null, reversed_at: null, reason: null, created_by_user_name: actor(), created_at: agora()
  };
  s.ledger.push(entry);
  emit();
  return { ...entry };
}

/** Estorna o uso de uma sessão (correção): devolve +1 com o motivo. IDEMPOTENTE: estornar de novo não devolve outra sessão. */
export function reverseConsumption(saleId: string, entryId: string, reason: string): PackageLedgerEntry | null {
  const s = sales.find((x) => x.id === saleId);
  if (!s) return null;
  const original = s.ledger.find((l) => l.id === entryId && l.entry_type === 'consumption');
  if (!original || original.reversed_at) return null;
  original.reversed_at = agora();
  const entry: PackageLedgerEntry = {
    id: `${saleId}e${Date.now()}${Math.floor(Math.random() * 1000)}`, entry_type: 'reversal', quantity: 1, appointment_id: original.appointment_id,
    appointment_date: original.appointment_date, reverses_entry_id: original.id, reversed_at: null, reason, created_by_user_name: actor(), created_at: agora()
  };
  s.ledger.push(entry);
  emit();
  return { ...entry };
}

/** PATCH /api/packages/{id} — validade, sessões (vira linha de ajuste), observação e preferência. */
export function updatePackage(
id: string,
data: {expires_at?: string | null;total_sessions?: number;notes?: string | null;preferred_professional_id?: string | null;reason?: string;})
{
  const s = find(id);
  if (s.cancelled_at) throw new Error('Pacote cancelado não pode ser editado.');
  if (data.expires_at !== undefined && data.expires_at !== s.expires_at) {
    change(s, 'expires_at', s.expires_at, data.expires_at, data.reason ?? null);
    s.expires_at = data.expires_at;
  }
  if (data.total_sessions !== undefined && data.total_sessions !== s.total_sessions) {
    const diff = data.total_sessions - s.total_sessions;
    if (saldoDe(s) + diff < 0) throw new Error('A nova quantidade é menor do que as sessões já usadas.');
    if (!data.reason?.trim()) throw new Error('Mudar a quantidade de sessões exige um motivo.');
    s.ledger.push({ ...grant(`a${Date.now()}`, diff, TODAY_ISO, actor()), entry_type: 'adjustment', reason: data.reason, created_at: agora() });
    s.total_sessions = data.total_sessions;
  }
  if (data.notes !== undefined && (data.notes || null) !== s.notes) {
    change(s, 'notes', s.notes, data.notes || null, data.reason ?? null);
    s.notes = data.notes || null;
  }
  if (data.preferred_professional_id !== undefined && data.preferred_professional_id !== s.preferred_professional_id) {
    const nome = (pid: string | null) => getTeam().members.find((m) => m.id === pid)?.name ?? null;
    change(s, 'preferred_professional_id', nome(s.preferred_professional_id), nome(data.preferred_professional_id), data.reason ?? null);
    s.preferred_professional_id = data.preferred_professional_id;
  }
  emit();
}

/**
 * POST /api/packages/{id}/cancel — definitivo. G3 (F-052): com a decisão financeira do legado: MANTER o que foi recebido
 * ou REGISTRAR REEMBOLSO (valor real, forma, data do relógio). O reembolso nunca passa do recebido menos reembolsos
 * anteriores e não apaga nenhum pagamento: vira uma saída em Recebimentos na data do reembolso.
 */
export type CancelDecision = {kind: 'manter';} | {kind: 'reembolso';amount_cents: number;method: string;};
export function cancelPackage(id: string, reason: string, decision: CancelDecision = { kind: 'manter' }) {
  const s = find(id);
  if (s.cancelled_at) throw new Error('Este pacote já está cancelado.');
  if (decision.kind === 'reembolso') {
    const limite = refundableOf(id);
    if (!(decision.amount_cents > 0) || decision.amount_cents > limite) throw new Error(`O reembolso precisa ser entre R$ 0,01 e ${brlCents(limite)} (valor recebido menos reembolsos anteriores).`);
    refunds.push({
      id: `${id}r${Date.now()}`, package_sale_id: id, client_id: s.client_id, amount_cents: decision.amount_cents, method: decision.method,
      refund_date: TODAY_ISO, reason, created_by_user_name: actor(), created_at: agora(), service_name_snapshot: s.service_name_snapshot
    });
  }
  s.cancelled_at = agora();
  s.cancel_reason = reason;
  const efeito = decision.kind === 'reembolso' ? `Reembolso de ${brlCents(decision.amount_cents)} registrado` : 'Valores recebidos mantidos';
  change(s, 'cancelamento', null, `Pacote cancelado · ${efeito}`, reason);
  emit();
}

/** POST /api/packages/{id}/freeze */
export function freezePackage(id: string, reason: string) {
  const s = find(id);
  if (s.cancelled_at) throw new Error('Pacote cancelado não pode ser congelado.');
  s.frozen_at = agora();
  s.freeze_reason = reason;
  change(s, 'congelamento', null, 'Pacote congelado', reason);
  emit();
}

/** POST /api/packages/{id}/reactivate — tira o congelamento (cancelado é definitivo). */
export function reactivatePackage(id: string, reason: string) {
  const s = find(id);
  if (s.cancelled_at) throw new Error('Pacote cancelado é definitivo e não pode ser reativado.');
  const quando = s.frozen_at ? new Date(s.frozen_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  change(s, 'congelamento', `Congelado em ${quando} — ${s.freeze_reason ?? ''}`, 'Congelamento revertido', reason);
  s.frozen_at = null;
  s.freeze_reason = null;
  emit();
}

/**
 * DELETE /api/packages/{id} — só quando cancelado ou sem efeito (sem sessão usada e sem dinheiro recebido).
 * G3 (decisão do Christian, 26/10/2026): o motivo é OBRIGATÓRIO e fica num registro de auditoria; os recebimentos e
 * reembolsos do pacote NÃO são apagados (Resultados continua lendo cada um no seu período). Some só da lista operacional.
 */
export function deletePackage(id: string, reason: string) {
  const d = getPackage(id);
  if (d.status !== 'cancelled' && !d.edicao.pode_excluir) throw new Error('Este pacote já produziu efeito e não pode ser excluído.');
  if (!reason.trim()) throw new Error('Informe o motivo da exclusão.');
  const s = find(id);
  deletions.push({
    id: `del-${id}`, package_sale_id: id, client_id: s.client_id, client_name: s.client_name, service_name_snapshot: s.service_name_snapshot,
    total_sessions: s.total_sessions, total_amount_cents: s.total_amount_cents, reason: reason.trim(), deleted_by_name: actor(), deleted_at: agora(),
    received_cents: d.recebido_cents, refunded_cents: refundsOfPackage(id).reduce((t, r) => t + r.amount_cents, 0)
  });
  sales = sales.filter((x) => x.id !== id);
  // Parcelas ainda pendentes (sem dinheiro) deixam de existir junto com o contrato; o que foi RECEBIDO fica.
  records = records.filter((r) => r.package_sale_id !== id || r.status === 'received');
  emit();
}

/** PATCH /api/financial-records/{id} — registrar o pagamento de uma parcela. */
export function registerPayment(recordId: string, data: {amount_cents: number;received_date: string;method: string;}) {
  records = records.map((r) => r.id === recordId ? { ...r, status: 'received', amount_cents: data.amount_cents, received_date: data.received_date, method: data.method } : r);
  emit();
}

/** Lançamentos financeiros do cliente (o bloco Financeiro da ficha lê daqui). */
export function financialRecordsOf(clientId: string) {
  return records.filter((r) => r.client_id === clientId).sort((a, b) => a.origin_date < b.origin_date ? 1 : -1);
}