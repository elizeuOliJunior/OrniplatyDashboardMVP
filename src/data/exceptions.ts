/**
 * Encaixe excepcional (O03/O06, aprovados em 11/10/2026) — SIMULAÇÃO do protótipo, só front-end.
 *
 * Regras:
 * - Só dono/administrador autoriza. A assistente de IA, a lista de espera e a fila de retornos NUNCA criam encaixes:
 *   essas rotas não passam pela autorização abaixo e continuam presas à regra única (data/availability.ts).
 * - A exceção dispensa APENAS (a) o expediente da clínica/jornada do profissional e (b) o intervalo mínimo entre atendimentos.
 *   Nunca dispensa: clínica fechada (feriado/dia fechado), profissional que não atende no dia, pausa/almoço,
 *   bloqueio manual nem outro agendamento (sem dupla reserva).
 * - Exige motivo (mínimo 5 caracteres) e confirmação, e deixa um registro de demonstração.
 * - R3 (06/11/2026, Christian, A-20): horário de HOJE que já passou (antes de `NOW`) também só entra como encaixe
 *   excepcional, pelo modal "Novo agendamento". Fica registrado com o tipo 'past' (data/agendaLive.ts › logException).
 *
 * Integração futura: o papel vem do usuário autenticado e o registro é gravado no servidor (item B: autorização por papel).
 */
import { useSyncExternalStore } from 'react';

export type Role = 'dono' | 'admin' | 'equipe';
export const roleLabel: Record<Role, string> = { dono: 'Dono', admin: 'Administrador', equipe: 'Equipe (recepção)' };
export const canAuthorizeException = (r: Role) => r === 'dono' || r === 'admin';

export type ExceptionKind = 'outside' | 'buffer' | 'past';
export const exceptionKindLabel: Record<ExceptionKind, string> = { outside: 'fora do expediente', buffer: 'sem o intervalo entre atendimentos', past: 'horário que já passou' };

export const MIN_REASON = 5;

function makeStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    }
  };
}

/* ───────────── papel de demonstração ───────────── */
const roleStore = makeStore<Role>('dono');
export const getRole = () => roleStore.get();
export const setRole = (r: Role) => roleStore.set(r);
export const useRole = () => useSyncExternalStore(roleStore.subscribe, roleStore.get);

/* ───────────── registro de demonstração ───────────── */
export type ExceptionEntry = {
  id: string;
  /** horário do relógio do protótipo */
  at: string;
  by: Role;
  apptId: string;
  client: string;
  professional: string;
  iso: string;
  start: string;
  end: string;
  kinds: ExceptionKind[];
  reason: string;
};

const logStore = makeStore<ExceptionEntry[]>([]);
export const useExceptionLog = () => useSyncExternalStore(logStore.subscribe, logStore.get);
export const isExceptionalAppt = (apptId: string) => logStore.get().some((e) => e.apptId === apptId);
export const exceptionOf = (apptId: string) => logStore.get().find((e) => e.apptId === apptId);
export function addException(e: Omit<ExceptionEntry, 'id'>) {
  logStore.set([{ ...e, id: `ex${Date.now()}${Math.floor(Math.random() * 1000)}` }, ...logStore.get()]);
}
export function removeExceptionFor(apptId: string) {
  if (isExceptionalAppt(apptId)) logStore.set(logStore.get().filter((e) => e.apptId !== apptId));
}

/* ───────────── autorização (escopo de uma chamada síncrona) ───────────── */
export type ExceptionGrant = {reason: string;by: Role;};
let grant: ExceptionGrant | null = null;

/** Só o modal "Novo agendamento" chama isto, depois de motivo + confirmação. Nada mais concede exceção. */
export function runWithException<T>(g: ExceptionGrant, fn: () => T): T {
  const prev = grant;
  grant = g;
  try {
    return fn();
  } finally {
    grant = prev;
  }
}

/** Autorização válida agora (papel permitido e motivo preenchido), ou null. */
export function currentGrant(): ExceptionGrant | null {
  return grant && canAuthorizeException(grant.by) && grant.reason.trim().length >= MIN_REASON ? grant : null;
}