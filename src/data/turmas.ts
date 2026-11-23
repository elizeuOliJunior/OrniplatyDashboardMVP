/**
 * Turmas e inscrições (G1, aulas em grupo, 23/11/2026). Mesmo estilo de data/bookingRules.ts: store em memória.
 *
 * Modelo (claude/aulas-em-grupo/00-base.md):
 *  - Serviço em grupo = serviço comum com `group: { capacity }` (data/servicesStore.ts).
 *  - Turma = quando o serviço em grupo acontece: dias da semana, horário de início e UM profissional. O fim vem da
 *    duração do serviço.
 *  - Aula = cada data de uma turma (derivada, nunca digitada).
 *  - Inscrição = um cliente numa turma: `fixo` (todas as aulas) ou `avulso` (uma data). O fixo diz como paga: pacote que
 *    já tem (`packageId`) ou por aula. Cada presença na chamada (lote G2) usa uma sessão do pacote.
 * Lote G2 traz as aulas para a Agenda (cartão com ocupação, chamada, cancelar/mover avisando todos, lista de espera da
 * turma). Lote G3 traz Ficha do cliente, pacotes, Início, Conversas e automações.
 * CONTRATO NOVO (aulas em grupo, 23/11/2026): nada disto existe no backend.
 * Protótipo: só memória; recarregar volta à amostra.
 */
import { useSyncExternalStore } from 'react';
import { TODAY_ISO } from './agendaStore';
import { addDays, weekdayOf } from './schedule';
import { getServices } from './servicesStore';

/** 0 = segunda … 6 = domingo (mesma contagem de data/schedule.ts). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** CONTRATO NOVO (aulas em grupo, 23/11/2026) */
export type Turma = {
  id: string;
  serviceId: string;
  professionalId: string;
  weekdays: Weekday[];
  /** HH:MM */
  startTime: string;
  /** false = arquivada (sai da lista principal; as inscrições ficam guardadas) */
  active: boolean;
  /**
   * CONTRATO NOVO (aulas em grupo, G2, 23/11/2026): primeira data em que a turma tem aula (ISO). Turma nova: o dia em que
   * foi criada. Ausente = hoje. As aulas (data/aulas.ts) nascem desta data em diante.
   */
  since?: string;
};

/** CONTRATO NOVO (aulas em grupo, 23/11/2026) */
export type EnrollmentKind = 'fixo' | 'avulso';
/** CONTRATO NOVO (aulas em grupo, 23/11/2026) */
export type EnrollmentPayment = 'pacote' | 'por-aula';

/** CONTRATO NOVO (aulas em grupo, 23/11/2026) */
export type Enrollment = {
  id: string;
  turmaId: string;
  clientId: string;
  kind: EnrollmentKind;
  /** só no avulso: a data da aula (ISO) */
  date?: string;
  payment: EnrollmentPayment;
  /** só com `payment: 'pacote'` */
  packageId?: string | null;
};

/* ───────────── textos ───────────── */

const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Ordem de segunda a domingo. */
export const WEEKDAY_OPTIONS: {value: Weekday;label: string;}[] = DAY_NAMES.map((n, i) => ({ value: i as Weekday, label: cap(n) }));

/** "Terça e quinta" · "Segunda, quarta e sexta" */
export function weekdaysText(days: Weekday[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
  if (!names.length) return '';
  const text = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return cap(text);
}
/** "Terça e quinta, 17:00" */
export const turmaWhen = (t: Pick<Turma, 'weekdays' | 'startTime'>) => `${weekdaysText(t.weekdays)}, ${t.startTime}`;

/* ───────────── amostra ───────────── */

/**
 * Amostra do G1 (serviço "Pilates em grupo", 4 vagas, data/servicesSeed.ts). Horários ajustados pelo Christian em
 * 23/11/2026 para caber no horário da clínica e da equipe da amostra (o lote pedia terça/quinta 18:00 e sábado 09:00,
 * que caem fora): turma 1 terça e quinta 17:00 com Rafael; turma 2 sexta com Juliana (lotada, com um avulso).
 * G2b (23/11/2026): a turma de sexta passou de 09:00 para 08:00. Às 09:00 ela ocupava a vaga das 09:30 de sexta (02/10,
 * cancelamento do Lucas) que mostra a marcação sozinha da Fernanda pela lista de espera. Às 08:00 ela não toca em
 * agendamento, vaga liberada, pedido da lista de espera ou bloqueio da amostra.
 * Só clientes que já existem. Todos pagam por aula: um pacote de amostra novo mudaria Oportunidades e Pacotes.
 */
const seedTurmas: Turma[] = [
// G2: `since` = segunda da semana de amostra (28/09), para a semana de amostra já mostrar as aulas na Agenda.
{ id: 'turma-pilates-terqui', serviceId: 'pilates-grupo', professionalId: 'rafael', weekdays: [1, 3], startTime: '17:00', active: true, since: '2026-09-28' },
{ id: 'turma-pilates-sex', serviceId: 'pilates-grupo', professionalId: 'juliana', weekdays: [4], startTime: '08:00', active: true, since: '2026-09-28' }];

const seedEnrollments: Enrollment[] = [
{ id: 'insc-1', turmaId: 'turma-pilates-terqui', clientId: 'mariana-teixeira', kind: 'fixo', payment: 'por-aula' },
{ id: 'insc-2', turmaId: 'turma-pilates-terqui', clientId: 'larissa-campos', kind: 'fixo', payment: 'por-aula' },
{ id: 'insc-3', turmaId: 'turma-pilates-terqui', clientId: 'helena-duarte', kind: 'fixo', payment: 'por-aula' },
{ id: 'insc-4', turmaId: 'turma-pilates-sex', clientId: 'carla-mendes', kind: 'fixo', payment: 'por-aula' },
{ id: 'insc-5', turmaId: 'turma-pilates-sex', clientId: 'igor-matos', kind: 'fixo', payment: 'por-aula' },
{ id: 'insc-6', turmaId: 'turma-pilates-sex', clientId: 'priscila-duarte', kind: 'fixo', payment: 'por-aula' },
{ id: 'insc-7', turmaId: 'turma-pilates-sex', clientId: 'juliana-prado', kind: 'avulso', date: '2026-10-02', payment: 'por-aula' }];


/* ───────────── store ───────────── */

type State = {turmas: Turma[];enrollments: Enrollment[];};
let state: State = { turmas: seedTurmas, enrollments: seedEnrollments };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

export const getTurmas = () => state;
export const useTurmas = () => useSyncExternalStore(subscribe, () => state);

/** Grava a turma e TODAS as inscrições dela (a janela da turma salva tudo de uma vez). */
export function saveTurma(t0: Turma, enrollments: Enrollment[]) {
  // G2: a data de início da turma nunca se perde ao editar (a janela da turma não conhece o campo).
  const prev = state.turmas.find((x) => x.id === t0.id);
  const t: Turma = { ...t0, since: t0.since ?? prev?.since ?? TODAY_ISO };
  const turmas = prev ? state.turmas.map((x) => x.id === t.id ? t : x) : [...state.turmas, t];
  emit({ turmas, enrollments: [...state.enrollments.filter((e) => e.turmaId !== t.id), ...enrollments.map((e) => ({ ...e, turmaId: t.id }))] });
}
export function setTurmaActive(id: string, active: boolean) {
  emit({ ...state, turmas: state.turmas.map((x) => x.id === id ? { ...x, active } : x) });
}

/**
 * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): avulso de UMA aula, adicionado pela janela da aula ou pelo Novo
 * agendamento. Paga por aula (o avulso não pergunta a forma de pagar, decisão do G1).
 */
export function addAvulso(turmaId: string, clientId: string, date: string): Enrollment {
  const e: Enrollment = { id: newEnrollmentId(), turmaId, clientId, kind: 'avulso', date, payment: 'por-aula', packageId: null };
  emit({ ...state, enrollments: [...state.enrollments, e] });
  return e;
}
/** G2: tira uma inscrição (avulso desta aula). Devolve a inscrição tirada, para o Desfazer. */
export function removeEnrollment(id: string): Enrollment | undefined {
  const e = state.enrollments.find((x) => x.id === id);
  if (e) emit({ ...state, enrollments: state.enrollments.filter((x) => x.id !== id) });
  return e;
}
/** G2: Desfazer de `removeEnrollment`. */
export function restoreEnrollment(e: Enrollment) {
  if (!state.enrollments.some((x) => x.id === e.id)) emit({ ...state, enrollments: [...state.enrollments, e] });
}

export const newTurmaId = () => `turma-${Date.now().toString(36)}`;
export const newEnrollmentId = () => `insc-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/* ───────────── leituras ───────────── */

export const enrollmentsOf = (turmaId: string, s: State = state) => s.enrollments.filter((e) => e.turmaId === turmaId);

/** Inscrições que ocupam vaga hoje: todo fixo + avulso de hoje em diante. */
export const occupyingOf = (list: Enrollment[]) => list.filter((e) => e.kind === 'fixo' || (e.date ?? '') >= TODAY_ISO);
/** Ocupação da turma (quantas vagas estão tomadas). */
export const occupancyOf = (turmaId: string, s: State = state) => occupyingOf(enrollmentsOf(turmaId, s)).length;
/** Vagas do serviço da turma (0 = o serviço não é mais em grupo). */
export const capacityOfService = (serviceId: string) => getServices().services.find((x) => x.id === serviceId)?.group?.capacity ?? 0;
/** A turma está lotada? */
export const isFull = (turmaId: string, s: State = state) => {
  const t = s.turmas.find((x) => x.id === turmaId);
  if (!t) return false;
  const c = capacityOfService(t.serviceId);
  return c > 0 && occupancyOf(turmaId, s) >= c;
};
/** Turmas de um serviço (`onlyActive` = sem as arquivadas). */
export const turmasOfService = (serviceId: string, onlyActive = true, s: State = state) => s.turmas.filter((t) => t.serviceId === serviceId && (!onlyActive || t.active));

/** Próximas `n` datas de aula (de hoje em diante) nos dias da turma. */
export function nextClassDates(weekdays: Weekday[], n = 8, from: string = TODAY_ISO): string[] {
  if (!weekdays.length) return [];
  const out: string[] = [];
  for (let i = 0; out.length < n && i < 120; i++) {
    const iso = addDays(from, i);
    if (weekdays.includes(weekdayOf(iso) as Weekday)) out.push(iso);
  }
  return out;
}