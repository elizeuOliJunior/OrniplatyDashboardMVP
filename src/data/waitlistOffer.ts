/**
 * Quem da lista de espera pode receber a oferta de uma vaga liberada. Regra ÚNICA, usada para montar a lista de quem
 * pode, de novo NA HORA do clique, e para decidir se uma vaga de outro dia entra na lista (G3, revisão v3; W1, 11/11/2026).
 *
 * Pode receber quem:
 *  - L23: não está com "Aviso de vaga" em "Não recebe" na Preferência de contato (pelo id do cadastro);
 *  - W3 (D-A3-4 = b): o pedido NÃO está "Precisa revisar" (profissional pedido arquivado ou que deixou de fazer o serviço;
 *    serviço arquivado ou fora do catálogo). Nunca troca sozinho para "qualquer profissional";
 *  - ainda não recebeu oferta desta vaga (aceitou, recusou, não respondeu, oferta cancelada ou encerrada);
 *  - W9c (12/11/2026, J-01, regra do arquiteto): NÃO aceitou outra vaga que ainda falta marcar (`pendingAcceptanceOf`);
 *  - pediu "qualquer profissional" ou o profissional da vaga;
 *  - pediu um serviço ATIVO do catálogo vivo (nome atual ou nome anterior de um serviço renomeado, `resolveService`);
 *  - pediu um serviço que o profissional da vaga FAZ (Serviços e equipe › Quem faz);
 *  - cabe no horário pela regra única (duração do serviço ativo, no DIA da vaga);
 *  - R3 (06/11/2026, Christian, A-28): NÃO tem outro agendamento no dia da vaga que se cruza com o horário da vaga;
 * e a vaga ainda não começou (relógio do protótipo).
 *
 * W1 (11/11/2026, Christian, decisões 15 e 20-B): a PREFERÊNCIA do pedido ORDENA quem pode e nunca exclui.
 * W1 (decisão 16, sem limite de dias): a vaga de OUTRO dia só entra na lista quando pelo menos um pedido pode recebê-la
 * e a data da vaga está dentro da janela de datas desse pedido (`listedSlots`). A de hoje aparece sempre, como antes.
 * W3 (A3-12): vaga que caiu FORA do horário da clínica, fora da jornada do profissional, numa ausência ou num bloqueio
 * SAI de "Vagas liberadas". Se havia oferta aguardando resposta, a vaga fica como "Suspensa", com o motivo, para a equipe
 * cancelar a oferta e avisar o cliente (mesmo padrão da clínica fechada hoje).
 */
import { checkNow, getAgendaState, scheduleIssueOf } from './agendaLive';
import { NOW, TODAY_ISO, mediumDayLabel } from './agendaStore';
import type { CalAppointment } from './agendaStore';
import type { AgendaFreedSlot, AgendaWaitlistEntry } from './agenda';
import { resolveService } from './catalogo';
import { getServices } from './servicesStore';
import { agendaProfessionalOf, getTeam, isActiveMember, newScheduleConflicts } from './availability';
import { setSuspendedOfferNote } from './conversas';
import { clientIdOfRecordedName } from './api/clientes';
import { clientIdFromName, kindOf, kindReason } from './contactPreferences';
import { OUTCOME_TEXT, freedSlots, offerOf, pendingAcceptanceOf, slotSources, slotWhen } from './freedSlots';
import type { SlotSource } from './freedSlots';
import { prefMatch } from './waitlistPrefs';
import type { PrefMatch } from './waitlistPrefs';
import { toMinutes } from '../utils/time';

/** L23: "Aviso de vaga" em "Não recebe" na Preferência de contato. */
const vagaRecordOf = (name: string) => kindOf(clientIdOfRecordedName(name) ?? clientIdFromName(name), 'vaga');

export type OfferReason = 'started' | 'blocked' | 'review' | 'already' | 'accepted-elsewhere' | 'professional' | 'service-archived' | 'service-unknown' | 'not-assigned' | 'client-busy' | 'no-fit';
export type OfferCheck = {ok: true;} | {ok: false;reason: OfferReason;};

/**
 * W3 (D-A3-4 = b): o pedido "Precisa revisar"? Devolve o motivo em texto de tela, ou null.
 * Profissional pedido pelo NOME (como o pedido grava): procura em toda a equipe, inclusive arquivados.
 */
export function reviewReasonOf(e: AgendaWaitlistEntry): string | null {
  const r = resolveService(e.service);
  if (r.status === 'archived') return `o serviço pedido (${e.service}) foi arquivado`;
  if (r.status !== 'active') return `o serviço pedido (${e.service}) não está mais no catálogo`;
  if (/^qualquer/i.test(e.professional.trim())) return null;
  const member = getTeam().members.find((m) => m.name === e.professional);
  if (!member) return `${e.professional} não está mais na equipe`;
  if (!isActiveMember(member)) return `${member.name} foi arquivado(a) em Serviços e equipe`;
  const svc = getServices().services.find((x) => x.id === r.service.value);
  if (svc && !svc.professionalIds.includes(member.id)) return `${member.name} não faz mais ${r.service.label}`;
  return null;
}

/** Horário liberado (cancelamento ou remarcação) que originou a vaga. */
export const slotSourceOf = (slot: AgendaFreedSlot, appointments: Record<string, CalAppointment[]>): SlotSource | undefined =>
slotSources(appointments).find((s) => s.slotId === slot.id);

/**
 * R3 (06/11/2026, Christian, A-28): agendamento do MESMO cliente do pedido, no dia da vaga, que se cruza com ela (qualquer
 * profissional). Cliente comparado pelo id do cadastro do nome gravado (`clientIdOfRecordedName`, cobre nome antigo);
 * sem cadastro, pelo nome gravado. Cancelado e falta não ocupam. Sem serviço ativo não há duração: devolve undefined.
 */
export function clientClashOf(slot: AgendaFreedSlot, e: AgendaWaitlistEntry, appointments: Record<string, CalAppointment[]>): CalAppointment | undefined {
  const src = slotSourceOf(slot, appointments);
  const r = resolveService(e.service);
  if (!src || r.status !== 'active') return undefined;
  const start = toMinutes(src.start);
  const end = start + r.service.minutes;
  const id = clientIdOfRecordedName(e.clientName);
  const same = (name: string) => id ? clientIdOfRecordedName(name) === id : name === e.clientName;
  return (appointments[src.iso] ?? []).find(
    (a) => (src.kind === 'remarcacao' || a.id !== src.apptId) && a.status !== 'cancelled' && a.status !== 'no_show' && same(a.clientName) && toMinutes(a.start) < end && toMinutes(a.end) > start
  );
}

export function offerCheck(slot: AgendaFreedSlot, e: AgendaWaitlistEntry, appointments: Record<string, CalAppointment[]>): OfferCheck {
  const src = slotSourceOf(slot, appointments);
  if (!src || src.iso === TODAY_ISO && toMinutes(src.start) <= toMinutes(NOW)) return { ok: false, reason: 'started' };
  if (vagaRecordOf(e.clientName).status === 'nao-recebe') return { ok: false, reason: 'blocked' };
  // W3 (D-A3-4 = b): pedido a revisar não recebe oferta nenhuma até alguém revisar.
  if (reviewReasonOf(e)) return { ok: false, reason: 'review' };
  const offer = offerOf(slot.id);
  if (e.clientName === slot.offeredTo || offer?.tried.some((t) => t.name === e.clientName)) return { ok: false, reason: 'already' };
  // W9c (J-01): quem já aceitou outra vaga e espera a marcação não é sugerido para esta.
  if (pendingAcceptanceOf(e.id, e.clientName, slot.id)) return { ok: false, reason: 'accepted-elsewhere' };
  const wanted = /^qualquer/i.test(e.professional.trim()) ? undefined : getTeam().members.find((m) => m.name === e.professional)?.id;
  if (wanted && wanted !== src.professionalId) return { ok: false, reason: 'professional' };
  const r = resolveService(e.service);
  if (r.status === 'archived') return { ok: false, reason: 'service-archived' };
  if (r.status !== 'active') return { ok: false, reason: 'service-unknown' };
  const svc = getServices().services.find((x) => x.id === r.service.value);
  if (!svc || !svc.active) return { ok: false, reason: 'service-archived' };
  if (!svc.professionalIds.includes(src.professionalId)) return { ok: false, reason: 'not-assigned' };
  // R3 (06/11/2026, Christian, A-28): pula quem já tem horário que se cruza; o motivo aparece em "Não podem receber".
  if (clientClashOf(slot, e, appointments)) return { ok: false, reason: 'client-busy' };
  return checkNow({ professionalId: src.professionalId, iso: src.iso, start: src.start, durationMin: r.service.minutes }).ok ? { ok: true } : { ok: false, reason: 'no-fit' };
}

export const canReceiveOffer = (slot: AgendaFreedSlot, e: AgendaWaitlistEntry, appointments: Record<string, CalAppointment[]>) => offerCheck(slot, e, appointments).ok;

export type OfferCandidate = {entry: AgendaWaitlistEntry;position: number;match: PrefMatch;};
export type OfferExcluded = {entry: AgendaWaitlistEntry;position: number;reason: OfferReason;text: string;};

/** Motivo, em texto de tela, de um pedido não poder receber esta vaga. */
function reasonText(reason: OfferReason, slot: AgendaFreedSlot, e: AgendaWaitlistEntry, appointments: Record<string, CalAppointment[]>): string {
  if (reason === 'blocked') {
    const why = kindReason('vaga', vagaRecordOf(e.clientName));
    return `não recebe aviso de vaga${why ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ''}`;
  }
  if (reason === 'review') return `o pedido precisa ser revisado: ${reviewReasonOf(e) ?? 'confira o serviço e o profissional'}`;
  if (reason === 'already') {
    const t = offerOf(slot.id)?.tried.find((x) => x.name === e.clientName);
    return t ? `já recebeu a oferta desta vaga (${OUTCOME_TEXT[t.outcome]})` : 'está com a oferta desta vaga';
  }
  if (reason === 'accepted-elsewhere') {
    const id = pendingAcceptanceOf(e.id, e.clientName, slot.id);
    const src = id ? slotSources(appointments).find((s) => s.slotId === id) : undefined;
    return src ? `já aceitou a vaga de ${slotWhen(src.iso, src.start)}: falta marcar` : 'já aceitou outra vaga: falta marcar';
  }
  if (reason === 'professional') return `pediu ${e.professional}`;
  if (reason === 'service-archived') return `o serviço pedido (${e.service}) está arquivado`;
  if (reason === 'service-unknown') return `o serviço pedido (${e.service}) não está mais no catálogo`;
  if (reason === 'not-assigned') return `${slot.professional} não faz ${e.service}`;
  if (reason === 'client-busy') {
    const clash = clientClashOf(slot, e, appointments);
    return clash ? `já tem horário às ${clash.start} ${slot.iso === TODAY_ISO ? 'hoje' : 'nesse dia'}` : 'já tem horário que se cruza com a vaga';
  }
  if (reason === 'no-fit') return `${e.service} não cabe neste horário`;
  return 'o horário da vaga já começou';
}

/**
 * W1 (decisões 15 e 20-B): quem pode receber a vaga, JÁ ORDENADO (primeiro quem pediu um horário como este; no empate, a
 * ordem da fila), e quem não pode, com o motivo. O primeiro de `candidates` é o sugerido.
 */
export function rankOffer(slot: AgendaFreedSlot, entries: AgendaWaitlistEntry[], appointments: Record<string, CalAppointment[]>): {candidates: OfferCandidate[];excluded: OfferExcluded[];} {
  const candidates: OfferCandidate[] = [];
  const excluded: OfferExcluded[] = [];
  entries.forEach((entry, i) => {
    const c = offerCheck(slot, entry, appointments);
    if (c.ok) candidates.push({ entry, position: i + 1, match: prefMatch(entry, slot.iso, slot.time) });else
    if (c.reason !== 'started') excluded.push({ entry, position: i + 1, reason: c.reason, text: reasonText(c.reason, slot, entry, appointments) });
  });
  candidates.sort((a, b) => Number(b.match.full) - Number(a.match.full) || a.position - b.position);
  return { candidates, excluded };
}

/** W3 (A3-12): o horário da vaga não pode mais ser usado pela configuração (clínica, jornada, ausência, bloqueio)? */
export function slotIssueOf(slot: AgendaFreedSlot): string | null {
  return scheduleIssueOf(slot.professionalId, slot.iso, slot.time, slot.end);
}

/**
 * Vagas que a tela mostra. Hoje: todas, como antes. Outro dia (decisão 16, sem limite de dias): só a vaga que alguém da
 * fila pode receber E cuja data está dentro da janela de datas desse pedido; ou a que já teve oferta (o histórico fica).
 * W3 (A3-12): vaga fora do horário, da jornada, numa ausência ou num bloqueio sai da lista; com oferta aguardando,
 * fica como "Suspensa", com o motivo.
 */
export function listedSlots(appointments: Record<string, CalAppointment[]>, waitlist: AgendaWaitlistEntry[], nameOf: (proId: string) => string): AgendaFreedSlot[] {
  return freedSlots(appointments, nameOf).flatMap((slot) => {
    const issue = slotIssueOf(slot);
    if (issue) {
      if (slot.statusLabel !== 'Aguardando') return [];
      const first = (slot.offeredTo ?? 'o cliente').split(' ')[0];
      return [{ ...slot, status: 'warning' as const, statusLabel: 'Suspensa', detail: `Suspensa: ${issue} A oferta para ${first} continua aberta: cancele a oferta e avise ${first}.` }];
    }
    const keep = slot.iso === TODAY_ISO || !!offerOf(slot.id) || waitlist.some((e) => prefMatch(e, slot.iso, slot.time).window && canReceiveOffer(slot, e, appointments));
    return keep ? [slot] : [];
  });
}

const proNameOf = (id: string) => agendaProfessionalOf(id)?.name ?? id;
/** "sexta, 02/10" */
const dayText = (iso: string) => {
  const d = mediumDayLabel(iso);
  return `${d.charAt(0).toLowerCase()}${d.slice(1)}`;
};

/** W9b (A3-24): vaga da lista de espera com oferta em andamento (ou já aceita, faltando marcar) que uma mudança atinge. */
export type OfferHit = {key: string;name: string;when: string;};

/**
 * W9b (12/11/2026, A3-24): antes de salvar uma configuração hipotética (por exemplo, fechar um dia em Funcionamento ›
 * Feriados e datas especiais), quais vagas COM OFERTA EM ANDAMENTO passariam a cair fora do expediente. Mesma regra dos
 * agendamentos (`newScheduleConflicts`): a vaga entra como um horário daquele profissional. Nada é cancelado.
 */
export function offersHitBy(opts: Parameters<typeof newScheduleConflicts>[1]): OfferHit[] {
  const st = getAgendaState();
  return listedSlots(st.appointments, st.waitlist, proNameOf).
  filter((s) => s.statusLabel === 'Aguardando' && !!s.offeredTo).
  filter((s) => {
    const asAppt = { id: `vaga-oferta:${s.id}`, professionalId: s.professionalId, start: s.time, end: s.end, status: 'confirmed', clientName: s.offeredTo ?? '', service: '' } as unknown as CalAppointment;
    return newScheduleConflicts({ appointments: { [s.iso]: [asAppt] }, blocks: st.blocks }, opts).length > 0;
  }).
  map((s) => ({ key: `vaga-${s.id}`, name: s.offeredTo ?? '', when: `${mediumDayLabel(s.iso)} ${s.time} · vaga da lista de espera com ${s.professional}, oferta em andamento` }));
}

/**
 * W9b (A3-24): texto de espera da conversa de quem aceitou (ou recebeu) uma vaga que ficou "Suspensa" (o dia fechou, a
 * jornada mudou, ausência ou bloqueio). Em vez de mandar marcar o horário, diz o motivo e o que fazer, como a própria vaga
 * diz na Lista de espera. Registrado em data/conversas.ts para não importar a agenda de lá.
 */
export function suspendedOfferNote(clientName: string): string | null {
  const st = getAgendaState();
  const s = listedSlots(st.appointments, st.waitlist, proNameOf).find((x) => x.statusLabel === 'Suspensa' && x.offeredTo === clientName);
  if (!s) return null;
  const first = clientName.split(' ')[0];
  const issue = slotIssueOf(s) ?? 'O horário não está mais disponível.';
  return `${first} aceitou a vaga de ${dayText(s.iso)}, às ${s.time}, mas não dá mais para marcar esse horário: ${issue} Não marque: cancele a oferta em Agenda › Lista de espera e avise ${first}.`;
}
setSuspendedOfferNote(suspendedOfferNote);