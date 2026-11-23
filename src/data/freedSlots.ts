/**
 * Vagas liberadas e ofertas de vaga. DERIVADAS da Agenda viva (G3, F-045), nunca de uma lista fixa.
 *
 * W1 (11/11/2026, decisões do Christian 16 a 20 e confirmações do mesmo dia):
 * - De onde vem a vaga: agendamento CANCELADO ou REMARCADO (o horário antigo fica livre), de hoje ou de QUALQUER data
 *   futura (sem limite de dias). Falta (`no_show`) NÃO libera vaga (decisão D1 = A). Mesmo profissional e horário contam uma vez.
 * - Vaga de outro dia só entra na LISTA quando serve para alguém da fila (quem decide é `listedSlots`, em
 *   data/waitlistOffer.ts). Sem ninguém interessado, é só um horário livre na agenda.
 * - Situação da vaga: outro agendamento ativo no horário → "Preenchida"; oferta aguardando → "Aguardando"; senão "Livre".
 * - Com a automação "Lista de espera" DESLIGADA (padrão), a EQUIPE chama o cliente e registra a resposta. Ciclo da oferta:
 *     aguardando → aceita        (quem recebeu a oferta foi marcado no horário; o pedido sai da fila sozinho)
 *     aguardando → recusada      ("Recusou")
 *     aguardando → sem-resposta  ("Sem resposta")
 *     aguardando → cancelada     ("Cancelar oferta")
 *     aguardando → encerrada     (outra pessoa ocupou o horário, ou quem recebeu a oferta foi marcado em outro horário)
 *   Em qualquer saída a vaga volta a "Livre" (ou fica "Preenchida") e quem já recebeu a oferta desta vaga não recebe de novo.
 *   Oferta fechada NUNCA volta a "Aguardando" sozinha: só uma nova oferta explícita (`simulateOffer`).
 * - Com a automação LIGADA, a oferta vence no prazo definido pela clínica (data/automacoes.ts, `prazo-hoje` e
 *   `prazo-outro-dia`). O protótipo NÃO tem cronômetro: a regra fica escrita na tela e no contrato.
 * - Nenhuma mensagem sai sozinha daqui: a mensagem da oferta é enviada pela equipe, pela conversa, ou pela assistente
 *   (data/waitlistAutoBooking.ts, com a automação ligada).
 * R3 (06/11/2026, Christian, A-16): clínica FECHADA hoje → as ofertas de vaga de HOJE ficam suspensas ("Suspensa").
 * Amostra: as vagas das 10:30 e das 15:00 (Juliana) vêm de cancelamentos de AMOSTRA em data/agendaStore.ts. W1: o
 * histórico das 10:30 passou a dizer que a EQUIPE ofereceu (a automação está desligada) e que o pedido saiu da fila.
 * I4 (12/11/2026, Christian, decisão I1-3 e opção 1-A da amostra): a vaga de sexta, 02/10, às 09:30 (Juliana) vem do
 * cancelamento de amostra `amostra-vaga-sex-0930` (criado em data/waitlistAutoBooking.ts) e nasce com a oferta para a
 * Fernanda em andamento (ela aceitou pela conversa às 08:09; falta marcar). Com a automação "Lista de espera" LIGADA,
 * quem marca é a assistente (data/waitlistAutoBooking.ts), que usa `updateOffer` para registrar no histórico da vaga o
 * que ela fez e o Desfazer.
 *
 * W9c (12/11/2026, regra do arquiteto para o J-01):
 * - Quando o pedido sai da fila porque o horário dele foi marcado, TODA outra oferta aberta do MESMO pedido fecha
 *   ("encerrada", com a linha "o pedido foi atendido em outra vaga") e essa vaga volta a "Livre"
 *   (`closeOffersOfServedRequest`; chamado aqui no aceite e pela Lista de espera nos outros jeitos de marcar).
 * - Oferta ACEITA pelo cliente e ainda sem horário marcado fica registrada em `acceptedAt`. Esse pedido não é sugerido
 *   para outra vaga (`pendingAcceptanceOf`, lido por data/waitlistOffer.ts).
 * W9c (J-02, opção b do Christian): `openedBeforeAutomation` guarda as vagas que já estavam abertas quando a automação
 * "Lista de espera" foi ligada. Essas continuam com a equipe; a assistente só oferece sozinha as que abrem depois
 * (data/waitlistAutoBooking.ts, que é avisado de cada mudança da Agenda por `onAgendaReconciled`).
 */
import { useSyncExternalStore } from 'react';
import { NOW, TODAY_ISO, mediumDayLabel } from './agendaStore';
import type { CalAppointment } from './agendaStore';
import type { AgendaFreedSlot } from './agenda';
import { toMinutes } from '../utils/time';
import { clinicDay } from './availability';
import { wordsNow } from './segment';

export type OfferStatus = 'aguardando' | 'aceita' | 'encerrada' | 'cancelada' | 'recusada' | 'sem-resposta';
export type OfferOutcome = Exclude<OfferStatus, 'aguardando'>;

export type SlotOfferState = {
  offeredTo: string | null;
  /** Pedido da lista de espera que recebeu a oferta (sai da fila sozinho quando a oferta é aceita). */
  entryId?: string | null;
  status: OfferStatus;
  events: {time: string;text: string;}[];
  detail: string;
  /** Quem ocupa o horário desde a última transição (null quando a vaga está livre). */
  filledBy?: string | null;
  /** Quem já recebeu a oferta desta vaga e como terminou (não recebe a mesma vaga de novo). */
  tried: {name: string;outcome: OfferOutcome;}[];
  /** W9c (J-01): hora em que o cliente respondeu que aceita, com a oferta ainda aguardando a marcação. */
  acceptedAt?: string | null;
};

export const OUTCOME_TEXT: Record<OfferOutcome, string> = {
  aceita: 'aceitou',
  recusada: 'recusou',
  'sem-resposta': 'não respondeu',
  cancelada: 'oferta cancelada',
  encerrada: 'oferta encerrada'
};

let offers: Record<string, SlotOfferState> = {
  'vaga-amostra-vaga-1030': {
    offeredTo: 'Bruno Costa',
    entryId: null,
    status: 'aceita',
    filledBy: 'Bruno Costa',
    detail: 'oferecida a Bruno às 08:02 · aceita às 08:10',
    tried: [{ name: 'Bruno Costa', outcome: 'aceita' }],
    events: [
    { time: '08:02', text: 'A equipe ofereceu a vaga para Bruno Costa' },
    { time: '08:10', text: 'Bruno Costa aceitou e foi marcado neste horário' },
    { time: '08:10', text: 'O pedido de Bruno Costa saiu da lista de espera' }]

  },
  // I4 (opção 1-A): a vaga que a conversa da Fernanda cita. O pedido dela (`w8`) continua na fila até o horário ser marcado.
  'vaga-amostra-vaga-sex-0930': {
    offeredTo: 'Fernanda Lima',
    entryId: 'w8',
    status: 'aguardando',
    filledBy: null,
    acceptedAt: '08:09',
    detail: 'oferta para Fernanda · aceitou pela conversa, falta marcar',
    tried: [],
    events: [
    { time: '08:00', text: 'A equipe ofereceu a vaga para Fernanda Lima' },
    { time: '08:09', text: 'Fernanda Lima respondeu que aceita; falta marcar o horário' }]

  }
};

/** W1: horários que ficaram livres porque o agendamento foi REMARCADO (o agendamento em si continua existindo, em outro horário). */
type MovedSlot = {id: string;apptId: string;iso: string;professionalId: string;start: string;end: string;clientName: string;at: string;};
let moved: MovedSlot[] = [];

let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
export const useSlotOffers = () => useSyncExternalStore(subscribe, () => version);
export const offerOf = (slotId: string) => offers[slotId] ?? null;

const first = (name: string | null | undefined) => (name ?? '').split(' ')[0];
const overlaps = (a: {start: string;end: string;}, b: {start: string;end: string;}) => toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);

/** W9c: "hoje, às 10:30" ou "sexta, 02/10, às 09:30" (texto de tela e de histórico). */
export function slotWhen(iso: string, time: string) {
  if (iso === TODAY_ISO) return `hoje, às ${time}`;
  const d = mediumDayLabel(iso);
  return `${d.charAt(0).toLowerCase()}${d.slice(1)}, às ${time}`;
}

/* ───────────── W9c (J-02): vagas abertas antes de ligar a automação ───────────── */
const teamSlots = new Set<string>();
/** Registra vagas que já existiam com a automação desligada (continuam com a equipe depois de ligar). */
export function markTeamSlots(ids: string[]) {
  let added = false;
  for (const id of ids) {
    if (teamSlots.has(id)) continue;
    teamSlots.add(id);
    added = true;
  }
  if (added) bump();
}
/** A vaga já estava aberta quando a automação "Lista de espera" foi ligada? Então quem oferece é a equipe. */
export const openedBeforeAutomation = (slotId: string) => teamSlots.has(slotId);

/** W9c: quem precisa saber de cada mudança da Agenda (a assistente da lista de espera). Roda depois da mudança gravada. */
const agendaWatchers = new Set<() => void>();
export function onAgendaReconciled(fn: () => void) {
  agendaWatchers.add(fn);
}

/** Chamado por data/agendaLive.ts quando um agendamento muda de dia, hora ou profissional: o horário antigo vira vaga. */
export function noteRescheduled(x: {apptId: string;iso: string;professionalId: string;start: string;end: string;clientName: string;at: string;to: {iso: string;professionalId: string;start: string;end: string;};}) {
  // Mudou só alguns minutos e continua em cima do horário antigo: não há vaga.
  if (x.iso === x.to.iso && x.professionalId === x.to.professionalId && overlaps(x, x.to)) return;
  moved = [...moved, { id: `vaga-r${moved.length + 1}-${x.apptId}`, apptId: x.apptId, iso: x.iso, professionalId: x.professionalId, start: x.start, end: x.end, clientName: x.clientName, at: x.at }];
  bump();
}

export type SlotSource = {
  slotId: string;
  apptId: string;
  iso: string;
  professionalId: string;
  start: string;
  end: string;
  clientName: string;
  kind: 'cancelamento' | 'remarcacao';
  /** Hora do cancelamento ou da remarcação (HH:MM), quando conhecida. */
  at: string;
  reason?: string;
};

const stillAhead = (iso: string, end: string) => iso > TODAY_ISO || iso === TODAY_ISO && toMinutes(end) > toMinutes(NOW);

/** Todos os horários liberados de hoje em diante (cancelamentos e remarcações), do mais próximo para o mais distante. */
export function slotSources(appointments: Record<string, CalAppointment[]>): SlotSource[] {
  const out: SlotSource[] = [];
  for (const [iso, list] of Object.entries(appointments)) {
    if (iso < TODAY_ISO) continue;
    for (const a of list) {
      if (a.status !== 'cancelled' || !stillAhead(iso, a.end)) continue;
      out.push({ slotId: `vaga-${a.id}`, apptId: a.id, iso, professionalId: a.professionalId, start: a.start, end: a.end, clientName: a.clientName, kind: 'cancelamento', at: a.cancelledAt?.split(' ')[1] ?? '—', reason: a.cancelReason });
    }
  }
  for (const m of moved) {
    if (!stillAhead(m.iso, m.end)) continue;
    out.push({ slotId: m.id, apptId: m.apptId, iso: m.iso, professionalId: m.professionalId, start: m.start, end: m.end, clientName: m.clientName, kind: 'remarcacao', at: m.at.split(' ')[1] ?? '—' });
  }
  const seen = new Set<string>();
  return out.
  sort((x, y) => `${x.iso} ${x.start}`.localeCompare(`${y.iso} ${y.start}`)).
  filter((s) => {
    const k = `${s.iso}|${s.professionalId}|${s.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Agendamento ATIVO que ocupa o horário liberado (mesmo profissional, horários que se cruzam). */
function occupantOf(day: CalAppointment[], s: SlotSource) {
  return day.find((b) => (s.kind === 'remarcacao' || b.id !== s.apptId) && b.professionalId === s.professionalId && b.status !== 'cancelled' && overlaps(s, b));
}

const put = (slotId: string, next: SlotOfferState) => {
  offers = { ...offers, [slotId]: next };
  bump();
};

/**
 * I4 (12/11/2026): ajuste direto de uma oferta, para quem age fora desta tela (a assistente que marca sozinha e o
 * Desfazer dessa marcação, em data/waitlistAutoBooking.ts). Sem oferta registrada para a vaga, não faz nada.
 */
export function updateOffer(slotId: string, change: (cur: SlotOfferState) => SlotOfferState) {
  const cur = offers[slotId];
  if (cur) put(slotId, change(cur));
}

/** A equipe ofereceu a vaga a uma pessoa da fila. Nenhuma mensagem sai sozinha: a equipe chama o cliente pela conversa. */
export function simulateOffer(slotId: string, to: string, entryId?: string | null) {
  const cur = offers[slotId];
  const replaced = cur?.offeredTo && cur.status === 'aguardando' ? cur.offeredTo : null;
  put(slotId, {
    offeredTo: to,
    entryId: entryId ?? null,
    status: 'aguardando',
    filledBy: null,
    acceptedAt: null,
    detail: `oferta para ${first(to)} · chame no WhatsApp e registre a resposta`,
    tried: [...(cur?.tried ?? []), ...(replaced ? [{ name: replaced, outcome: 'encerrada' as OfferOutcome }] : [])],
    events: [...(cur?.events ?? []), ...(replaced ? [{ time: 'agora', text: `Oferta para ${replaced} encerrada` }] : []), { time: 'agora', text: `Oferta registrada para ${to}. A equipe chama pelo WhatsApp` }]
  });
}

/** A equipe enviou a mensagem da oferta pela conversa (texto livre ou mensagem aprovada). Só registra no histórico da vaga. */
export function noteOfferContact(slotId: string, how: 'mensagem' | 'aprovada') {
  const cur = offers[slotId];
  if (!cur || cur.status !== 'aguardando') return;
  put(slotId, { ...cur, events: [...cur.events, { time: 'agora', text: how === 'aprovada' ? `Mensagem aprovada da oferta enviada para ${cur.offeredTo}` : `Mensagem da oferta enviada para ${cur.offeredTo}` }] });
}

function closeWaiting(slotId: string, outcome: OfferOutcome, detail: string, event: string) {
  const cur = offers[slotId];
  if (!cur || cur.status !== 'aguardando') return;
  put(slotId, { ...cur, status: outcome, acceptedAt: null, detail, tried: [...cur.tried, { name: cur.offeredTo ?? '', outcome }], events: [...cur.events, { time: 'agora', text: event }] });
}

/** "Cancelar oferta": quem recebeu não pode mais aceitar; a vaga fica livre. Não cancela nenhum agendamento. */
export function cancelOffer(slotId: string) {
  const to = offers[slotId]?.offeredTo ?? 'a pessoa da fila';
  closeWaiting(slotId, 'cancelada', 'oferta cancelada · horário livre na agenda', `Oferta para ${to} cancelada por você · horário livre na agenda`);
}

/** W1 (decisão 18): a equipe registra "Recusou" ou "Sem resposta". A vaga volta a "Livre" e o pedido continua na fila. */
export function declineOffer(slotId: string, kind: 'recusou' | 'sem-resposta') {
  const to = offers[slotId]?.offeredTo ?? 'A pessoa da fila';
  if (kind === 'recusou') closeWaiting(slotId, 'recusada', `${first(to)} recusou · horário livre de novo`, `${to} recusou a vaga · o pedido continua na lista de espera`);else
  closeWaiting(slotId, 'sem-resposta', `${first(to)} não respondeu · horário livre de novo`, `${to} não respondeu · oferta encerrada como “Sem resposta”; o pedido continua na lista de espera`);
}

/** Quem recebeu a oferta foi agendado, mas em OUTRO horário: a oferta desta vaga é encerrada e a vaga volta a "Livre". */
export function closeOfferBookedElsewhere(slotId: string) {
  const to = offers[slotId]?.offeredTo ?? 'A pessoa da fila';
  closeWaiting(slotId, 'encerrada', `${first(to)} foi agendado em outro horário · vaga livre`, `${to} foi agendado em outro horário; a oferta desta vaga foi encerrada`);
}

/** W9c: a oferta é do mesmo pedido? Pelo id do pedido gravado na oferta; oferta antiga sem id, pelo nome. */
const sameRequest = (o: SlotOfferState, entryId: string | null | undefined, clientName: string) => o.entryId ? o.entryId === entryId : o.offeredTo === clientName;

/**
 * W9c (J-01): vaga que este pedido já ACEITOU e que ainda falta marcar (outra vaga que não `exceptSlotId`), ou null.
 * Quem está assim não é sugerido para outra vaga: aparece em "Não podem receber esta vaga", com o motivo.
 */
export function pendingAcceptanceOf(entryId: string | null | undefined, clientName: string, exceptSlotId?: string): string | null {
  for (const [slotId, o] of Object.entries(offers)) {
    if (slotId === exceptSlotId || o.status !== 'aguardando' || !o.acceptedAt) continue;
    if (sameRequest(o, entryId, clientName)) return slotId;
  }
  return null;
}

/** Fecha (sem avisar a tela) as outras ofertas abertas do pedido atendido. Devolve se mudou algo. */
function closeServed(entryId: string | null | undefined, clientName: string, served: string | undefined, exceptSlotId?: string): boolean {
  let changed = false;
  for (const [slotId, o] of Object.entries(offers)) {
    if (slotId === exceptSlotId || o.status !== 'aguardando' || !sameRequest(o, entryId, clientName)) continue;
    const who = o.offeredTo ?? clientName;
    offers = {
      ...offers,
      [slotId]: {
        ...o,
        status: 'encerrada',
        acceptedAt: null,
        detail: `o pedido de ${first(who)} foi atendido em outro horário · horário livre de novo`,
        tried: [...o.tried, { name: who, outcome: 'encerrada' }],
        events: [
        ...o.events,
        {
          time: 'agora',
          text: served ?
          `O pedido de ${who} foi atendido em outra vaga (${served}); a oferta desta vaga foi encerrada e a vaga ficou livre` :
          `O pedido de ${who} foi atendido: o horário foi marcado e o pedido saiu da lista de espera. A oferta desta vaga foi encerrada e a vaga ficou livre`
        }]

      }
    };
    changed = true;
  }
  return changed;
}

/**
 * W9c (J-01): o pedido saiu da fila porque o horário dele foi marcado (aceite de vaga, "Agendar agora" do pedido ou
 * agendamento feito a partir da oferta em outro horário). Toda outra oferta aberta do mesmo pedido fecha e a vaga volta a
 * "Livre". `served` = "hoje, às 10:30" quando se sabe onde ele foi marcado.
 */
export function closeOffersOfServedRequest(entryId: string | null | undefined, clientName: string, served?: string, exceptSlotId?: string) {
  if (closeServed(entryId, clientName, served, exceptSlotId)) bump();
}

/**
 * Grava as transições da oferta a partir da Agenda (chamado por data/agendaLive.ts a cada mudança de agendamentos).
 * - aguardando + horário ocupado por quem recebeu a oferta → aceita (devolve o id do pedido, que sai da fila);
 * - aguardando + ocupado por outra pessoa → encerrada (a oferta não volta mais);
 * - aceita/encerrada e o ocupante cancelou → continua como está, com o registro "a vaga ficou livre de novo".
 * W9c (J-01): no aceite, as outras ofertas abertas do mesmo pedido fecham.
 * Devolve os ids dos pedidos da lista de espera atendidos nesta passada.
 */
export function reconcileOffers(appointments: Record<string, CalAppointment[]>): string[] {
  const sources = slotSources(appointments);
  const accepted: string[] = [];
  const served: {entryId: string | null | undefined;name: string;when: string;slotId: string;}[] = [];
  let changed = false;
  const next = { ...offers };
  for (const [slotId, cur] of Object.entries(offers)) {
    const source = sources.find((s) => s.slotId === slotId);
    if (!source) continue;
    const occ = occupantOf(appointments[source.iso] ?? [], source);
    const occName = occ?.clientName ?? null;
    if (cur.status === 'aguardando' && occ) {
      const ok = occName === cur.offeredTo;
      next[slotId] = {
        ...cur,
        status: ok ? 'aceita' : 'encerrada',
        acceptedAt: null,
        filledBy: occName,
        detail: ok ? `oferecida a ${first(cur.offeredTo)} · aceita` : `oferta para ${first(cur.offeredTo)} encerrada · preenchida por ${first(occName)}`,
        tried: [...cur.tried, { name: cur.offeredTo ?? '', outcome: ok ? 'aceita' : 'encerrada' }],
        events: [
        ...cur.events,
        ok ? { time: 'agora', text: `${occName} aceitou e foi marcado neste horário` } : { time: 'agora', text: `${occName} foi marcado neste horário; a oferta para ${cur.offeredTo} foi encerrada` },
        ...(ok && cur.entryId ? [{ time: 'agora', text: `O pedido de ${occName} saiu da lista de espera` }] : [])]

      };
      if (ok && cur.entryId) accepted.push(cur.entryId);
      if (ok) served.push({ entryId: cur.entryId, name: cur.offeredTo ?? '', when: slotWhen(source.iso, source.start), slotId });
      changed = true;
    } else if (cur.status !== 'aguardando' && (cur.filledBy ?? null) !== occName) {
      next[slotId] = {
        ...cur,
        filledBy: occName,
        events: [...cur.events, occName ? { time: 'agora', text: `${occName} foi marcado neste horário` } : { time: 'agora', text: `${cur.filledBy} cancelou; a vaga ficou livre de novo (nenhuma oferta em andamento)` }]
      };
      changed = true;
    }
  }
  if (changed) offers = next;
  // W9c (J-01): o pedido foi atendido nesta vaga; as outras ofertas abertas dele fecham.
  for (const s of served) if (closeServed(s.entryId, s.name, s.when, s.slotId)) changed = true;
  if (changed) bump();
  if (agendaWatchers.size > 0) queueMicrotask(() => agendaWatchers.forEach((fn) => fn()));
  return accepted;
}

/**
 * TODAS as vagas de hoje em diante, a partir dos agendamentos vivos. `nameOf` dá o nome do profissional pelo id.
 * Quem mostra a lista usa `listedSlots` (data/waitlistOffer.ts), que esconde a vaga futura que não serve para ninguém da fila.
 */
export function freedSlots(appointments: Record<string, CalAppointment[]>, nameOf: (proId: string) => string): AgendaFreedSlot[] {
  // R3 (06/11/2026, Christian, A-16): clínica fechada hoje suspende as ofertas de vaga de hoje.
  const closedToday = !clinicDay(TODAY_ISO).open;
  const w = wordsNow();
  const out: AgendaFreedSlot[] = [];
  for (const s of slotSources(appointments)) {
    const id = s.slotId;
    const offer = offers[id];
    const occupant = occupantOf(appointments[s.iso] ?? [], s);
    // Remarcação cujo horário antigo já está ocupado e nunca foi oferecido: não é vaga.
    if (s.kind === 'remarcacao' && occupant && !offer) continue;
    const professional = nameOf(s.professionalId);
    // W1: deixa claro que foi o CLIENTE (e não o profissional de mesmo nome) quem cancelou ou remarcou.
    const sourceEvent =
    s.kind === 'cancelamento' ?
    { time: s.at, text: `Cliente ${s.clientName} cancelou${s.reason ? ` · motivo: ${s.reason}` : ''}` } :
    { time: s.at, text: `Cliente ${s.clientName} remarcou para outro horário` };
    const events = [sourceEvent, ...(offer?.events ?? [])];
    const base = { id, iso: s.iso, time: s.start, end: s.end, professional, professionalId: s.professionalId, source: s.kind, sourceClient: s.clientName, offeredTo: offer?.offeredTo ?? undefined };
    if (occupant) {
      // Com oferta, o histórico GRAVADO (reconcileOffers) já diz quem ocupou e se a oferta foi aceita ou encerrada.
      out.push({
        ...base,
        detail: offer?.offeredTo === occupant.clientName ? offer.detail : `preenchida por ${first(occupant.clientName)}${occupant.fromWaitlist ? ' (lista de espera)' : ''}`,
        status: 'success',
        statusLabel: 'Preenchida',
        events: offer ? events : [...events, { time: '—', text: `${occupant.clientName} foi marcado neste horário` }]
      });
      continue;
    }
    const waitingOffer = offer?.status === 'aguardando';
    if (closedToday && s.iso === TODAY_ISO) {
      out.push({ ...base, detail: `${waitingOffer ? `oferta para ${first(offer?.offeredTo)} suspensa` : 'ofertas suspensas'} · ${w.the} está ${w.closed} hoje`, status: waitingOffer ? 'warning' : 'neutral', statusLabel: 'Suspensa', events });
      continue;
    }
    if (waitingOffer) {
      out.push({ ...base, detail: offer.detail, status: 'warning', statusLabel: 'Aguardando', events });
      continue;
    }
    // Livre: sem oferta, ou oferta já fechada (nunca revive sozinha; nova oferta = `simulateOffer`).
    const reopened = offer && (offer.status === 'aceita' || offer.status === 'encerrada') && !offer.filledBy;
    out.push({
      ...base,
      detail: !offer ? `cliente ${s.clientName} ${s.kind === 'cancelamento' ? 'cancelou' : 'remarcou'} · horário livre na agenda` : reopened ? 'livre de novo · nenhuma oferta em andamento' : offer.detail,
      status: 'neutral',
      statusLabel: 'Livre',
      events
    });
  }
  return out;
}

/** Só as vagas de HOJE (Início: "N vagas oferecidas hoje"). */
export function freedSlotsToday(appointments: Record<string, CalAppointment[]>, nameOf: (proId: string) => string): AgendaFreedSlot[] {
  return freedSlots(appointments, nameOf).filter((v) => v.iso === TODAY_ISO);
}

/** Só para testes de função (versão do store). */
export const slotOffersVersion = () => version;