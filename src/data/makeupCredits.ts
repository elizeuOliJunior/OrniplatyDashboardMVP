/**
 * Créditos de reposição (G3, aulas em grupo, 23/11/2026). Mesmo jeito das sessões de pacote (data/api/pacotes.ts): um
 * RAZÃO de lançamentos, e o saldo é sempre derivado dele, nunca um contador guardado.
 *  - `grant` (ganhou): aula cancelada pela empresa ou cliente que avisou a falta no prazo, quando a regra está ligada.
 *    Leva a validade calculada NA HORA (`validityDays` das regras de data/makeupRules.ts naquele momento).
 *  - `use` (usou): a reposição paga a presença numa aula do MESMO serviço (chamada salva).
 * Crédito vencido não pode ser usado. Desfazer o aviso de falta ou o cancelamento tira o crédito que ele deu (se ainda
 * não foi usado).
 * CONTRATO NOVO (aulas em grupo, 23/11/2026): nada disto existe no backend.
 * Protótipo: só memória; recarregar volta ao vazio.
 */
import { useSyncExternalStore } from 'react';
import { TODAY_ISO } from './agendaStore';
import { addDays } from './schedule';
import { getMakeupRules } from './makeupRules';
import { getServices } from './servicesStore';
import { wordsNow } from './segment';

/** CONTRATO NOVO (aulas em grupo, 23/11/2026): por que o cliente ganhou a reposição. */
export type CreditReason = 'cancelada' | 'aviso';
/**
 * G5: "cancelada" sem serviço fica neutro; a Ficha usa a palavra do serviço ("Aula cancelada" / "Treino cancelado").
 * G5b: "Cancelada pela clínica" / "Cancelada pelo salão": a palavra do negócio em uso (`wordsNow`), lida na hora.
 */
export const CREDIT_REASON_LABEL: Record<CreditReason, string> = {
  get cancelada() {
    return `Cancelada ${wordsNow().by}`;
  },
  aviso: 'Avisou a falta no prazo'
};

/** CONTRATO NOVO (aulas em grupo, 23/11/2026) */
export type CreditGrant = {
  id: string;
  kind: 'grant';
  clientId: string;
  serviceId: string;
  reason: CreditReason;
  /** aula que deu o crédito (`turma@data original`) */
  aulaKey: string;
  /** data da aula que deu o crédito (ISO) */
  aulaIso: string;
  /** data em que ganhou (relógio do protótipo) */
  grantedIso: string;
  /** último dia em que pode ser usado (ISO) */
  expiresIso: string;
};
/** CONTRATO NOVO (aulas em grupo, 23/11/2026) */
export type CreditUse = {
  id: string;
  kind: 'use';
  grantId: string;
  clientId: string;
  serviceId: string;
  /** aula em que foi usado */
  aulaKey: string;
  aulaIso: string;
  usedIso: string;
};
export type CreditEntry = CreditGrant | CreditUse;

let ledger: CreditEntry[] = [];
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = (next: CreditEntry[]) => {
  ledger = next;
  version += 1;
  listeners.forEach((l) => l());
};
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Hook: redesenha quando o razão muda. */
export const useMakeupCreditsVersion = () => useSyncExternalStore(subscribe, () => version);

const grants = () => ledger.filter((e): e is CreditGrant => e.kind === 'grant');
const uses = () => ledger.filter((e): e is CreditUse => e.kind === 'use');
const useOfGrant = (grantId: string) => uses().find((u) => u.grantId === grantId);

/* ───────────── leituras ───────────── */

/**
 * G4 (CONTRATO NOVO, aulas em grupo, 23/11/2026): `reservado` = crédito ainda não usado, prometido a um avulso cuja aula
 * ainda não teve a chamada. Não é lançamento do razão: é derivado das inscrições em data/aulas.ts (`creditsWithReservations`),
 * então volta a "Disponível" sozinho quando o avulso sai da aula ou a aula é cancelada.
 */
export type CreditState = 'disponivel' | 'reservado' | 'usado' | 'vencido';
export const CREDIT_STATE_LABEL: Record<CreditState, string> = { disponivel: 'Disponível', reservado: 'Reservado', usado: 'Usado', vencido: 'Vencido' };
export type CreditView = CreditGrant & {state: CreditState;use?: CreditUse;serviceName: string;};

const serviceNameOf = (id: string) => getServices().services.find((s) => s.id === id)?.name ?? 'Serviço removido';

/** Todos os créditos do cliente (mais novo primeiro), com a situação de hoje. */
export function creditsOf(clientId: string): CreditView[] {
  return grants().
  filter((g) => g.clientId === clientId).
  map((g) => {
    const use = useOfGrant(g.id);
    const state: CreditState = use ? 'usado' : g.expiresIso < TODAY_ISO ? 'vencido' : 'disponivel';
    return { ...g, state, use, serviceName: serviceNameOf(g.serviceId) };
  }).
  sort((a, b) => b.grantedIso.localeCompare(a.grantedIso) || b.aulaIso.localeCompare(a.aulaIso));
}

/**
 * Créditos que ainda podem pagar uma aula deste serviço na data `iso` (não usados e não vencidos até ela nem hoje),
 * do que vence antes para o que vence depois. Os já prometidos a um avulso ainda sem chamada são descontados em
 * data/aulas.ts (`freeCreditsFor`).
 */
export function validCreditsFor(clientId: string, serviceId: string, iso: string): CreditView[] {
  return creditsOf(clientId).
  filter((c) => c.state === 'disponivel' && c.serviceId === serviceId && c.expiresIso >= iso).
  sort((a, b) => a.expiresIso.localeCompare(b.expiresIso));
}

/** Crédito usado por este cliente nesta aula (ou undefined). */
export const creditUseOf = (aulaKey: string, clientId: string) => uses().find((u) => u.aulaKey === aulaKey && u.clientId === clientId);

/* ───────────── ganhar (sincronizado com a aula) ───────────── */

/**
 * Deixa os créditos que ESTA aula deu iguais a `desired` (um por cliente e motivo). Cria o que falta, com a validade da
 * regra de agora, e tira o que deixou de valer (Desfazer), desde que ainda não tenha sido usado.
 */
export function syncAulaGrants(aulaKey: string, serviceId: string, aulaIso: string, desired: {clientId: string;reason: CreditReason;}[]) {
  const mine = grants().filter((g) => g.aulaKey === aulaKey);
  const want = new Set(desired.map((d) => `${d.clientId}|${d.reason}`));
  const keep = mine.filter((g) => want.has(`${g.clientId}|${g.reason}`) || !!useOfGrant(g.id));
  const removed = mine.filter((g) => !keep.includes(g));
  const have = new Set(mine.map((g) => `${g.clientId}|${g.reason}`));
  const validity = getMakeupRules().validityDays;
  const added: CreditGrant[] = desired.
  filter((d) => !have.has(`${d.clientId}|${d.reason}`)).
  map((d) => ({ id: newId('rep'), kind: 'grant', clientId: d.clientId, serviceId, reason: d.reason, aulaKey, aulaIso, grantedIso: TODAY_ISO, expiresIso: addDays(TODAY_ISO, validity) }));
  if (!removed.length && !added.length) return;
  emit([...ledger.filter((e) => !removed.some((r) => r.id === e.id)), ...added]);
}

/* ───────────── usar (pela chamada) ───────────── */

/**
 * Usa UM crédito válido deste serviço para a presença nesta aula. Idempotente por aula + cliente.
 * G4: `grantId` = o crédito reservado para esta aula (data/aulas.ts); sem ele, o que vence antes.
 */
export function spendCredit(aulaKey: string, aulaIso: string, clientId: string, serviceId: string, grantId?: string): CreditUse {
  const same = creditUseOf(aulaKey, clientId);
  if (same) return same;
  const valid = validCreditsFor(clientId, serviceId, aulaIso);
  const g = valid.find((c) => c.id === grantId) ?? valid[0];
  if (!g) throw new Error('Não há reposição válida deste serviço (vencida ou já usada).');
  const u: CreditUse = { id: newId('uso'), kind: 'use', grantId: g.id, clientId, serviceId, aulaKey, aulaIso, usedIso: TODAY_ISO };
  emit([...ledger, u]);
  return u;
}

/** Devolve o crédito usado nesta aula (chamada corrigida ou desfeita). */
export function releaseCredit(aulaKey: string, clientId: string) {
  const u = creditUseOf(aulaKey, clientId);
  if (u) emit(ledger.filter((e) => e.id !== u.id));
}