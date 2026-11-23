/**
 * G4 (F-057): o que arquivar um serviço afeta, mostrado ANTES de confirmar. Arquivar não cancela nada:
 * - horários futuros com o serviço continuam na Agenda (remarcar exige escolher um serviço ativo);
 * - pacotes ativos do serviço continuam valendo e as sessões podem ser usadas no fechamento;
 * - pedidos da lista de espera com o serviço deixam de receber oferta;
 * - regras de pagamento próprias e as explicações da assistente ficam guardadas e voltam se reativar.
 */
import { NOW, TODAY_ISO } from './agendaStore';
import { getAgendaState } from './agendaLive';
import { resolveService } from './catalogo';
import { listPackages } from './api/pacotes';
import type { ServiceItem } from './servicesStore';
import { getTeam } from './availability';
import type { CalAppointment } from './agendaStore';
import type { ServiceConflictKind, ServiceConflictRecord } from './serviceConflicts';
import { toMinutes } from '../utils/time';
import { enrollmentsOf, turmaWhen, turmasOfService } from './turmas';
import { dayWords } from './turmaWords';
import type { TurmaWordId } from './turmaWords';

/**
 * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): `turmas` = turmas ATIVAS do serviço em grupo, com quantos clientes cada uma tem.
 * G4 (C): clientes DISTINTOS — `fixos` (em todas as aulas) e `avulsos` (só em aulas de datas futuras, sem contar quem já é
 * fixo). Antes era o número de inscrições que ocupam vaga, lido como se todos estivessem na mesma aula ("5 clientes" numa
 * turma de 4 vagas).
 */
export type ServiceArchiveImpact = {future: number;activePackages: number;waitlist: number;paymentRules: number;knowledgeFields: number;turmas?: {when: string;professional: string;fixos: number;avulsos: number;clients: number;}[]; /** G5 (CONTRATO NOVO): palavra de cada dia da turma do serviço. */turmaWord?: TurmaWordId;};

/** G4 (C; CONTRATO NOVO, aulas em grupo): clientes distintos da turma, fixos e avulsos de datas futuras. */
function turmaClients(turmaId: string) {
  const list = enrollmentsOf(turmaId);
  const fixos = new Set(list.filter((e) => e.kind === 'fixo').map((e) => e.clientId));
  const avulsos = new Set(list.filter((e) => e.kind === 'avulso' && (e.date ?? '') >= TODAY_ISO && !fixos.has(e.clientId)).map((e) => e.clientId));
  return { fixos: fixos.size, avulsos: avulsos.size, clients: fixos.size + avulsos.size };
}

const ofService = (name: string, id: string) => {
  const r = resolveService(name);
  return (r.status === 'active' || r.status === 'archived') && r.service.value === id;
};

/** Agendamento ainda por acontecer (hoje depois do relógio, ou dias seguintes) e não cancelado/fechado. */
const upcoming = (iso: string, a: CalAppointment) => a.status !== 'cancelled' && a.status !== 'completed' && a.status !== 'no_show' && (iso > TODAY_ISO || iso === TODAY_ISO && a.start > NOW);

/** Agendamentos futuros do serviço (W2, A3-14 e A3-02: o aviso mostra os NOMES, não só o número). */
export function futureAppointmentsOf(serviceId: string): {iso: string;appt: CalAppointment;}[] {
  const { appointments } = getAgendaState();
  return Object.entries(appointments).
  flatMap(([iso, list]) => list.filter((a) => upcoming(iso, a) && ofService(a.service, serviceId)).map((appt) => ({ iso, appt }))).
  sort((x, y) => (x.iso + x.appt.start).localeCompare(y.iso + y.appt.start));
}

export function serviceArchiveImpact(s: ServiceItem): ServiceArchiveImpact {
  const { waitlist } = getAgendaState();
  const future = futureAppointmentsOf(s.id).length;
  const pay = s.payment;
  const paymentRules = pay ? (['installments', 'discount', 'deposit', 'insurance'] as const).filter((k) => pay[k] !== 'padrao').length : 0;
  const k = (s.knowledge ?? {}) as Record<string, unknown>;
  const knowledgeFields = Object.values(k).filter((v) => Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : !!v).length;
  return {
    future,
    activePackages: listPackages().filter((p) => p.service_id === s.id && p.status === 'active').length,
    waitlist: waitlist.filter((e) => ofService(e.service, s.id)).length,
    paymentRules,
    knowledgeFields,
    turmaWord: s.group?.word,
    turmas: turmasOfService(s.id).map((t) => ({ when: turmaWhen(t), professional: getTeam().members.find((m) => m.id === t.professionalId)?.name ?? '', ...turmaClients(t.id) }))
  };
}

const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

/** Frases do resumo (vazio = nada além do próprio serviço). */
export function serviceArchiveLines(i: ServiceArchiveImpact): string[] {
  // G2 (aulas em grupo; CONTRATO NOVO): cada turma ativa, com quantos clientes tem, e o que acontece com as aulas.
  const turmas = i.turmas ?? [];
  // G5 (CONTRATO NOVO): a palavra do serviço ("as aulas" / "os treinos").
  const w = dayWords(i.turmaWord);
  const turmaLines = turmas.length ?
  [
  ...turmas.map((t) => {
    // G4 (C): fixos e avulsos separados, para não parecer que todos estão na mesma aula.
    const parts = [t.fixos > 0 && n(t.fixos, 'cliente fixo', 'clientes fixos'), t.avulsos > 0 && (t.avulsos === 1 ? `1 avulso marcado para ${w.pick('uma próxima', 'um próximo')} ${w.one}` : `${t.avulsos} avulsos marcados para ${w.pick('próximas', 'próximos')} ${w.many}`)].filter(Boolean);
    return `Turma ${t.when.charAt(0).toLowerCase()}${t.when.slice(1)}${t.professional ? `, com ${t.professional}` : ''}: ${parts.length ? parts.join(' e ') : 'nenhum cliente'}.`;
  }),
  `${w.pick('As', 'Os')} ${w.many} ${turmas.length === 1 ? 'desta turma deixam' : 'destas turmas deixam'} de ser ${w.pick('oferecidas', 'oferecidos')} e saem da Agenda. Nada é apagado: as turmas e os clientes voltam se você reativar o serviço.`] :

  [];
  return [
  ...turmaLines,
  i.future > 0 && `${n(i.future, 'horário futuro continua', 'horários futuros continuam')} na Agenda; para remarcar, será preciso escolher um serviço ativo.`,
  i.activePackages > 0 && `${n(i.activePackages, 'pacote ativo continua', 'pacotes ativos continuam')} valendo: as sessões podem ser usadas no fechamento.`,
  i.waitlist > 0 && `${n(i.waitlist, 'pedido da lista de espera deixa', 'pedidos da lista de espera deixam')} de receber oferta de vaga.`,
  i.paymentRules > 0 && `${n(i.paymentRules, 'regra de pagamento própria fica guardada', 'regras de pagamento próprias ficam guardadas')} e volta se você reativar.`,
  i.knowledgeFields > 0 && 'O que a assistente explica sobre o serviço fica guardado e volta se você reativar.'].
  filter(Boolean) as string[];
}

/* ───────────── W2 (11/11/2026, D-A3-1): o que uma mudança no serviço deixa fora da regra ───────────── */

const proNameOf = (id: string) => getTeam().members.find((m) => m.id === id)?.name ?? 'O profissional';

/**
 * Agendamentos futuros que a mudança de `before` para `after` deixaria fora da regra do serviço. Nada é cancelado nem
 * movido: o resultado vai para o aviso antes de salvar e, depois de salvar, para data/serviceConflicts.ts.
 *  - arquivado: todos os futuros do serviço;
 *  - quem faz: os futuros com um profissional que saiu de "Quem faz";
 *  - duração: os futuros cuja duração marcada é diferente da nova (só quando a duração mudou).
 */
export function serviceChangeConflicts(before: ServiceItem, after: ServiceItem): ServiceConflictRecord[] {
  const archived = before.active && !after.active;
  const removedPros = before.professionalIds.filter((p) => !after.professionalIds.includes(p));
  const durationChanged = before.durationMin !== after.durationMin;
  if (!archived && !removedPros.length && !durationChanged) return [];
  const name = after.name.trim() || before.name;
  return futureAppointmentsOf(before.id).flatMap(({ iso, appt }) => {
    let kind: ServiceConflictKind | null = null;
    let message = '';
    const marked = toMinutes(appt.end) - toMinutes(appt.start);
    if (archived) {
      kind = 'archived';
      message = `${name} foi arquivado e não é mais oferecido.`;
    } else if (removedPros.includes(appt.professionalId)) {
      kind = 'professional';
      message = `${proNameOf(appt.professionalId)} não faz mais ${name}.`;
    } else if (durationChanged && marked !== after.durationMin) {
      kind = 'duration';
      message = `${name} passou a durar ${after.durationMin} min; este horário foi marcado com ${marked} min.`;
    }
    return kind ? [{ apptId: appt.id, iso, start: appt.start, end: appt.end, professionalId: appt.professionalId, clientName: appt.clientName, service: appt.service, serviceId: before.id, kind, message }] : [];
  });
}

/** O conflito registrado continua valendo com o serviço como está agora? (desfazer a mudança tira da lista) */
export function serviceConflictStillValid(r: ServiceConflictRecord, s: ServiceItem | undefined): boolean {
  if (!s || r.serviceId !== s.id) return true;
  if (r.kind === 'archived') return !s.active;
  if (!s.active) return true;
  if (r.kind === 'professional') return !s.professionalIds.includes(r.professionalId);
  return toMinutes(r.end) - toMinutes(r.start) !== s.durationMin;
}

/** Pedidos da lista de espera que pedem o serviço (arquivado) ou um profissional que saiu de "Quem faz". */
export function waitlistAffectedBy(before: ServiceItem, after: ServiceItem): number {
  const { waitlist } = getAgendaState();
  const removed = before.professionalIds.filter((p) => !after.professionalIds.includes(p)).map(proNameOf);
  return waitlist.filter((e) => ofService(e.service, before.id) && (before.active && !after.active || removed.includes(e.professional))).length;
}