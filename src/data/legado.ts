/**
 * Capacidades do legado preservadas no Painel (D2) — SIMULAÇÃO de protótipo, só front-end. Nada aqui grava no servidor.
 *
 * Cada bloco indica o contrato de integração que ele espelha. Os nomes abaixo foram ENCONTRADOS em `origin/main` na referência local
 * (Etapa 9, sem fetch), mas schema, permissões e funcionamento NÃO foram verificados: conferir antes de conectar.
 *  - Trilha de alterações do cliente → `/clients/{id}/changes`
 *  - Exportação de dados do cliente (LGPD) → `GET /clients/{id}/export` (no legado não havia tela consumindo)
 *  - Atendimento para terceiro → `Appointment.for_third_party` (nome obrigatório; sem rota REST de escrita encontrada)
 *  - Pendente de fechamento → derivado na leitura (`booking/pending_closure.py`)
 *  - Correção de fechamento com histórico → `/fechamento` e `/historico`
 *  - Reembolso → `FinancialRefund` (só achado no cancelamento de pacote)
 */
import { useSyncExternalStore } from 'react';
import { NOW, TODAY_ISO, nowStamp } from './agendaStore';
import type { CalAppointment } from './agendaStore';
import { toMinutes } from '../utils/time';
import { getRole, roleLabel } from './exceptions';

/* Relógio ÚNICO do protótipo: data/agendaStore.ts (`TODAY_ISO`, `NOW`, `nowStamp`). G1 (F-017): `PROTOTYPE_CLOCK` saiu daqui. */

const listeners = new Set<() => void>();
let version = 0;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
export const useLegado = () => useSyncExternalStore(subscribe, () => version);

/**
 * Quem fez a ação AGORA: o Perfil escolhido no seletor de telas (Dono · Administrador · Equipe (recepção)). O protótipo
 * não tem usuário logado; este é o único dado de ator que existe, e NÃO é o nome do responsável da conta. Chame no
 * momento da ação e GRAVE o texto no registro: mudar o Perfil (ou o nome do responsável) depois não reescreve autoria antiga.
 * G1 (23/10/2026): usado nos eventos novos de pacote (data/api/pacotes.ts), sem "(demonstração)". No produto vem do usuário logado.
 */
export const actor = () => roleLabel[getRole()];
/**
 * Trilhas da ficha, correções e reembolsos: o mesmo Perfil do momento da ação (G4, F-069: sem o sufixo "(demonstração)";
 * registros antigos guardam o texto que tinham). Data e hora = relógio do protótipo (`nowStamp`).
 */
const trailActor = () => actor();

/* ─────────── trilha de alterações do cliente ─────────── */

export type ClientChange = {id: string;clientId: string;at: string;field: string;from: string;to: string;by: string;demo?: boolean;};

let changes: ClientChange[] = [
{ id: 'seed-1', clientId: 'ana-ribeiro', at: '28/09 14:05', field: 'Origem', from: 'Instagram', to: 'Indicação', by: 'Equipe (exemplo)', demo: true },
{ id: 'seed-2', clientId: 'ana-ribeiro', at: '15/09 10:40', field: 'Observações', from: 'vazio', to: 'Prefere horários pela manhã.', by: 'Dono (exemplo)', demo: true }];


export const changesOf = (clientId: string) => changes.filter((c) => c.clientId === clientId);

export function logChange(clientId: string, field: string, from: string, to: string) {
  changes = [{ id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`, clientId, at: nowStamp(), field, from: from || 'vazio', to: to || 'vazio', by: trailActor() }, ...changes];
  bump();
}

/* ─────────── atendimento para terceiro ─────────── */
/* Contrato: o nome do terceiro é OBRIGATÓRIO. O rascunho (checkbox marcado, nome ainda vazio) vive só no modal de detalhes e é
 * descartado ao fechar; calendário, histórico e rótulos só enxergam terceiro com nome preenchido (`thirdPartyOf`). */

export type ThirdParty = {name: string;};
let thirdParty: Record<string, ThirdParty> = {};
/** Terceiro VÁLIDO (nome preenchido). Use este em listas, calendários e histórico. */
export const thirdPartyOf = (apptId?: string | null): ThirdParty | null => {
  const t = apptId ? thirdParty[apptId] : undefined;
  return t && t.name.trim() ? t : null;
};
/** Inclui rascunho com nome vazio — só para o formulário do modal. */
export const thirdPartyDraftOf = (apptId?: string | null): ThirdParty | null => apptId ? thirdParty[apptId] ?? null : null;
export function setThirdParty(apptId: string, value: ThirdParty | null) {
  const { [apptId]: _old, ...rest } = thirdParty;
  thirdParty = value ? { ...rest, [apptId]: value } : rest;
  bump();
}
/** Descarta rascunho sem nome (o contrato não aceita terceiro sem nome). */
export function discardInvalidThirdParty(apptId?: string | null) {
  if (apptId && thirdParty[apptId] && !thirdParty[apptId].name.trim()) setThirdParty(apptId, null);
}
export const thirdPartyLabel = (t: ThirdParty) => `Terceiro: ${t.name.trim()}`;

/* ─────────── pendente de fechamento (derivado, nunca presumido) ─────────── */

/** Passou do horário e ninguém registrou comparecimento nem falta. */
export function isPendingClosure(iso: string, a: Pick<CalAppointment, 'end' | 'status'>): boolean {
  if (a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show') return false;
  if (iso < TODAY_ISO) return true;
  return iso === TODAY_ISO && toMinutes(a.end) <= toMinutes(NOW);
}

export function pendingClosures(appointments: Record<string, CalAppointment[]>): {iso: string;appt: CalAppointment;}[] {
  const out: {iso: string;appt: CalAppointment;}[] = [];
  Object.entries(appointments).forEach(([iso, list]) => list.forEach((appt) => isPendingClosure(iso, appt) && out.push({ iso, appt })));
  return out.sort((x, y) => (x.iso + x.appt.start).localeCompare(y.iso + y.appt.start));
}

/* ─────────── correção de fechamento com histórico e reembolso ─────────── */

export type Correction = {id: string;at: string;by: string;reason: string;before: string;after: string;};
/** G1 subetapa 3 (E1): `iso` = data do reembolso (relógio do protótipo), lida por Resultados e Oportunidades. */
export type Refund = {
  id: string;
  at: string;
  iso: string;
  by: string;
  cents: number;
  reason: string;
  /**
   * G3 (F-054): de qual dinheiro RECEBIDO saiu o reembolso (proveniência). Ausente = registro antigo de particular.
   * O limite de cada parte = recebido nela − reembolsos anteriores dela; nunca se reembolsa valor não recebido.
   */
  component?: RefundComponent;
  /** Para quem o dinheiro volta (cliente ou operadora), gravado no momento. */
  to?: string;
  /**
   * W5 (G15, 11/11/2026): forma pela qual o dinheiro foi devolvido. Começa na forma do pagamento original e pode ser trocada.
   * Ausente = registro antigo (Resultados usa a forma do pagamento original).
   */
  method?: string | null;
};
export type RefundComponent = 'particular' | 'sinal' | 'coparticipacao' | 'repasse';

let corrections: Record<string, Correction[]> = {};
let refunds: Record<string, Refund[]> = {};

export const correctionsOf = (entryId: string) => corrections[entryId] ?? [];
export const refundsOf = (entryId: string) => refunds[entryId] ?? [];
export const refundedCents = (entryId: string) => refundsOf(entryId).reduce((t, r) => t + r.cents, 0);

/** Reembolsado de UMA parte do fechamento (registros antigos sem parte contam como 'particular'). */
export const refundedOf = (entryId: string, component: RefundComponent) => refundsOf(entryId).filter((r) => (r.component ?? 'particular') === component).reduce((t, r) => t + r.cents, 0);

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
export function addCorrection(entryId: string, reason: string, before: string, after: string) {
  corrections = { ...corrections, [entryId]: [{ id: `k${uid()}`, at: nowStamp(), by: trailActor(), reason, before, after }, ...correctionsOf(entryId)] };
  bump();
}
export function addRefund(entryId: string, cents: number, reason: string, component?: RefundComponent, to?: string, method?: string | null) {
  refunds = { ...refunds, [entryId]: [{ id: `r${uid()}`, at: nowStamp(), iso: TODAY_ISO, by: trailActor(), cents, reason, component, to, method: method ?? null }, ...refundsOf(entryId)] };
  bump();
}

export const MIN_REASON = 5;

/** G1 subetapa 3: reembolsos de todos os fechamentos (Resultados lê a data e o valor de cada um). */
export const allRefunds = () => Object.entries(refunds).flatMap(([entryId, list]) => list.map((r) => ({ ...r, entryId })));
/** Versão do legado (correções/reembolsos) para leitores fora do React. */
export const legadoVersion = () => version;