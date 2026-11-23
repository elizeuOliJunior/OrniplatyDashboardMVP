/**
 * I4 (12/11/2026, Christian, decisão I1-3): com a automação "Lista de espera" LIGADA e salva, quando o cliente aceita a
 * vaga oferecida a ASSISTENTE MARCA SOZINHA, se o horário continua livre e nada impede (as mesmas conferências de
 * qualquer agendamento: serviço ativo, profissional que faz o serviço e a regra única de horário, sem encaixe).
 * Se alguma conferência falha, ela NÃO marca: a conversa fica em "Aguardando você" com o motivo.
 * Com a automação DESLIGADA nada acontece aqui: a equipe chama o cliente e marca (W1).
 *
 * O que acontece quando ela marca:
 *  - o agendamento nasce "A confirmar", com `fromWaitlist`, `source: 'whatsapp'` e `createdActorType: 'ai_whatsapp'`;
 *  - a oferta da vaga vira "aceita" e o pedido sai da fila sozinho (regra do W1: `reconcileOffers` + data/agendaLive.ts);
 *  - a conversa ganha a mensagem "Agendado: …" e volta para a assistente;
 *  - o sino avisa a equipe (data/notifications.ts lê `activeAutoBookings`);
 *  - a janela do horário, na Agenda, mostra "Marcado pela assistente" e o botão "Desfazer" (`undoAutoBooking`).
 * Desfazer (até o horário começar, enquanto ele não foi cancelado, remarcado nem fechado): o horário sai da agenda, a
 * vaga volta a "Livre", o pedido volta para o MESMO lugar da fila e a conversa fica em "Aguardando você", para a equipe
 * avisar o cliente.
 * A resposta a quem escreveu não segue os dias e horários de envio (decisão de 11/11, ponto 4): o aceite é tratado a
 * qualquer hora.
 *
 * W9c (12/11/2026, decisões do Christian na conferência final):
 *  - J-02 (opção b): com a automação ligada, a assistente oferece SOZINHA só as vagas que abrem DEPOIS de ligar
 *    (`watchSlots`). A vaga que já estava aberta continua com a equipe (`openedBeforeAutomation`, data/freedSlots.ts) e
 *    a tela diz isso. Ela oferece à pessoa sugerida pela regra única (`rankOffer`), dentro dos dias e horários das
 *    mensagens de horário marcado e com o WhatsApp funcionando; fora disso a vaga fica para a equipe (W8).
 *  - J-03 (opção a): a oferta de vaga é mensagem automática, como o lembrete. A assistente manda mesmo quando a conversa
 *    está "Com você" (`postAssistantOffer`): a mensagem aparece na conversa como enviada pela assistente e a conversa
 *    continua com quem estava (não muda de dono). Com a janela de 24 horas fechada, sai a mensagem aprovada
 *    "Vaga na lista de espera".
 *  - Decisão do Christian no chat do W9c (opção b): a assistente NÃO manda oferta para quem está em "Aguardando você"
 *    (cliente esperando resposta da equipe, `waitingForTeam`). Na vaga nova, ela passa para a próxima pessoa da fila; se
 *    ninguém mais puder, a vaga fica "Livre" para a equipe. Quando a própria equipe escolhe essa pessoa, a mensagem não
 *    sai pela assistente: quem chama é a equipe.
 *
 * PROTÓTIPO: não existe o evento "o cliente aceitou". A amostra tem um aceite já recebido (Fernanda, 08:09) e ele é
 * tratado no momento em que a automação é salva ligada. Um aceite é tratado uma vez só.
 *
 * AMOSTRA (opção 1-A do Christian, 12/11/2026): este arquivo também põe na amostra o que a conversa da Fernanda já
 * afirmava e não existia: o cancelamento que abriu a vaga de sexta, 02/10, às 09:30 (Juliana) e o pedido dela na fila
 * (`w8`, 5ª pessoa). A oferta em andamento dessa vaga está em data/freedSlots.ts. Fica aqui, e não em
 * data/agendaStore.ts e data/agenda.ts, para não reescrever dois arquivos grandes por duas linhas.
 */
import { useSyncExternalStore } from 'react';
import { automacoesStore, savedSendWindows, waitlistAutomationOn } from './automacoes';
import { checkNow, getAgendaState, removeAppointment, setAppointments, setWaitlist, tryAddAppointment } from './agendaLive';
import type { AgendaWaitlistEntry } from './agenda';
import { NOW, TODAY_ISO, endFor, isPastNow, todayShort } from './agendaStore';
import type { CalAppointment } from './agendaStore';
import { markTeamSlots, offerOf, onAgendaReconciled, openedBeforeAutomation, simulateOffer, slotSources, updateOffer } from './freedSlots';
import { conversationThreads, ensureConversation, notifyConversations, patchConversation, whatsappDown, windowOf } from './conversasThreads';
import { conversations, inQueue } from './conversas';
import { agendaProfessionalOf, getTeam } from './availability';
import { getServices } from './servicesStore';
import { serviceByLabel } from './catalogo';
import { insideWindow } from './sendWindows';
import { listedSlots, rankOffer } from './waitlistOffer';
import { clientById, clientIdOfRecordedName } from './api/clientes';
import { MESSAGE_TEMPLATES, WAITLIST_TEMPLATE, fillTemplate } from './messageTemplates';
import { offerMessage, offerTemplateValues } from './waitlistPrefs';
import type { OfferText } from './waitlistPrefs';

/* ───────────── Amostra ───────────── */
const SAMPLE_ISO = '2026-10-02';
const SAMPLE_CANCELLED_ID = 'amostra-vaga-sex-0930';
const SAMPLE_ENTRY: AgendaWaitlistEntry = {
  id: 'w8',
  clientName: 'Fernanda Lima',
  service: 'Drenagem linfática',
  professional: 'Juliana',
  preference: 'qualquer dia · manhã · a partir de 01/10',
  days: [],
  periods: ['manha'],
  fromIso: '2026-10-01'
};

setAppointments((map) =>
(map[SAMPLE_ISO] ?? []).some((a) => a.id === SAMPLE_CANCELLED_ID) ?
map :
{
  ...map,
  [SAMPLE_ISO]: [
  ...(map[SAMPLE_ISO] ?? []),
  {
    id: SAMPLE_CANCELLED_ID,
    professionalId: 'juliana',
    start: '09:30',
    end: endFor('Drenagem linfática', '09:30'),
    clientName: 'Lucas Ferreira',
    service: 'Drenagem linfática',
    status: 'cancelled',
    createdIso: '2026-09-24',
    cancelReason: 'Avisou pelo WhatsApp que não pode vir',
    cancelledAt: '01/10 07:45',
    cancelledBy: 'client',
    cancelledByUser: 'Amostra'
  }]

}
);
setWaitlist((list) => list.some((e) => e.id === SAMPLE_ENTRY.id) ? list : [...list, SAMPLE_ENTRY]);

/** Aceite do cliente já recebido pelo WhatsApp, esperando a marcação. */
type Acceptance = {
  slotId: string;
  entryId: string;
  clientName: string;
  conversationId: string;
  /** Como o texto chama o profissional e o cliente (o cadastro não guarda gênero). Sem valor, usa o nome. */
  professionalText?: string;
  clientText?: string;
};
const acceptances: Acceptance[] = [
{ slotId: `vaga-${SAMPLE_CANCELLED_ID}`, entryId: SAMPLE_ENTRY.id, clientName: 'Fernanda Lima', conversationId: 'fernanda-lima', professionalText: 'a Juliana', clientText: 'a cliente' }];


/* ───────────── Marcações feitas pela assistente ───────────── */
export type AutoBooking = {
  apptId: string;
  iso: string;
  start: string;
  professionalId: string;
  professionalName: string;
  service: string;
  clientName: string;
  /** "a cliente" ou o primeiro nome. */
  clientText: string;
  slotId: string;
  conversationId: string;
  /** "01/10, às 09:20" (relógio do protótipo). */
  at: string;
  /** Pedido da lista de espera atendido e o lugar que ele ocupava na fila (para o Desfazer). */
  entry: AgendaWaitlistEntry | null;
  queueIndex: number;
  status: 'booked' | 'undone';
};

let bookings: AutoBooking[] = [];
const handled = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
export const useAutoBookings = () =>
useSyncExternalStore(
  (l) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  () => version
);

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const pad = (n: number) => String(n).padStart(2, '0');
function dayOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { chat: `${weekday}, ${d}/${m}`, screen: `${weekday}, ${pad(d)}/${pad(m)}` };
}
const firstOf = (name: string) => name.split(' ')[0];

/** Congela as mensagens da conversa (a amostra usa leitores que seguem a automação) e acrescenta as novas. */
function settleThread(conversationId: string, extra: (typeof conversationThreads)[string] = []) {
  conversationThreads[conversationId] = [...(conversationThreads[conversationId] ?? []).map((m) => ({ ...m })), ...extra];
}

/* ───────────── W9c (J-03): a mensagem da vaga mandada pela assistente ───────────── */

/**
 * A assistente pode mandar a oferta de vaga AGORA? Automação ligada e salva, dentro dos dias e horários das mensagens de
 * horário marcado (W8) e com o WhatsApp da clínica funcionando.
 */
export function assistantSendsOffersNow(): boolean {
  return waitlistAutomationOn() && insideWindow(savedSendWindows().appointments, { iso: TODAY_ISO, time: NOW }) && !whatsappDown();
}

/**
 * Decisão do Christian no chat do W9c (opção b): o cliente está em "Aguardando você" (esperando resposta da equipe)?
 * Então a assistente não manda oferta de vaga para ele.
 */
export function waitingForTeam(clientName: string): boolean {
  const id = clientIdOfRecordedName(clientName);
  const c = id ? conversations.find((x) => x.id === id) : undefined;
  return !!c && inQueue(c);
}

/**
 * J-03 (opção a do Christian): a assistente manda a mensagem da vaga na conversa do cliente, mesmo que a conversa esteja
 * "Com você". A mensagem entra como enviada pela assistente e o DONO da conversa não muda. Janela de 24 horas fechada:
 * sai a mensagem aprovada "Vaga na lista de espera". Devolve `false` quando não dá (sem cadastro, WhatsApp parado ou
 * cliente em "Aguardando você"): aí quem chama é a equipe. PROTÓTIPO: nada sai de verdade.
 */
export function postAssistantOffer(offer: OfferText): boolean {
  if (whatsappDown() || waitingForTeam(offer.clientName)) return false;
  const id = clientIdOfRecordedName(offer.clientName);
  const client = id ? clientById(id) : null;
  if (!client) return false;
  ensureConversation(client.id, client.name);
  const closed = windowOf(client.id).band === 'fechada';
  const tpl = MESSAGE_TEMPLATES.find((t) => t.name === WAITLIST_TEMPLATE);
  const useTemplate = closed && !!tpl;
  const text = useTemplate && tpl ? fillTemplate(tpl.body, offerTemplateValues(offer)) : offerMessage(offer);
  const list = conversationThreads[client.id] ?? [];
  conversationThreads[client.id] = [
  ...list,
  {
    id: `vaga-assistente-${Date.now()}-${list.length}`,
    sender: 'lia',
    timestamp: NOW,
    text,
    status: 'sent',
    ...(useTemplate && tpl ? { template: { title: tpl.title, buttons: tpl.buttons } } : {})
  }];

  const c = conversations.find((x) => x.id === client.id);
  if (c) Object.assign(c, { preview: `Assistente: ${useTemplate && tpl ? tpl.title : text}`, time: NOW });
  notifyConversations();
  return true;
}

/* ───────────── W9c (J-02): só as vagas que abrem depois de ligar ───────────── */

/** Vagas novas que a assistente já tratou (ofereceu ou deixou para a equipe por estar fora do horário de envio). */
const seenByAssistant = new Set<string>();
const proNameOf = (id: string) => agendaProfessionalOf(id)?.name ?? id;

/**
 * A cada mudança da Agenda e da automação: com a automação desligada, toda vaga existente fica registrada como "da equipe"
 * (aberta antes de ligar). Ligada, a vaga que abre depois é oferecida pela assistente, uma vez, à primeira pessoa da
 * ordem sugerida que não está esperando resposta da equipe ("Aguardando você").
 */
function watchSlots() {
  const { appointments, waitlist } = getAgendaState();
  const ids = slotSources(appointments).map((s) => s.slotId);
  if (!waitlistAutomationOn()) {
    markTeamSlots(ids);
    return;
  }
  const fresh = ids.filter((id) => !openedBeforeAutomation(id) && !seenByAssistant.has(id));
  if (fresh.length === 0) return;
  const listed = listedSlots(appointments, waitlist, proNameOf);
  for (const id of fresh) {
    seenByAssistant.add(id);
    const slot = listed.find((s) => s.id === id);
    if (!slot || slot.statusLabel !== 'Livre' || offerOf(id)) continue;
    // Fora dos dias e horários de envio (ou WhatsApp parado): a oferta não sai e a vaga fica para a equipe (W8).
    if (!assistantSendsOffersNow()) continue;
    // Quem está em "Aguardando você" é pulado: a vaga passa para a próxima pessoa da ordem sugerida.
    const top = rankOffer(slot, waitlist, appointments).candidates.find((c) => !waitingForTeam(c.entry.clientName));
    if (!top) continue;
    const name = top.entry.clientName;
    simulateOffer(id, name, top.entry.id);
    const posted = postAssistantOffer({ clientName: name, service: top.entry.service, iso: slot.iso, time: slot.time, professional: slot.professional });
    updateOffer(id, (cur) => ({
      ...cur,
      detail: `oferta para ${firstOf(name)} · a assistente cuida da oferta`,
      events: cur.events.map((ev, i) =>
      i === cur.events.length - 1 ?
      { ...ev, text: posted ? `A assistente ofereceu a vaga para ${name} e mandou a mensagem na conversa` : `A assistente ofereceu a vaga para ${name}` } :
      ev
      )
    }));
  }
}

// As vagas que já existem quando o painel abre são "de antes" (mesmo que a automação já venha ligada).
markTeamSlots(slotSources(getAgendaState().appointments).map((s) => s.slotId));
onAgendaReconciled(watchSlots);

/** Trata os aceites pendentes. Só age com a automação ligada; cada aceite é tratado uma vez. */
function run() {
  if (!waitlistAutomationOn()) return;
  for (const acc of acceptances) {
    if (handled.has(acc.slotId)) continue;
    const offer = offerOf(acc.slotId);
    // A equipe já resolveu esta oferta (marcou, recusou, cancelou): não há o que a assistente fazer.
    if (!offer || offer.status !== 'aguardando' || offer.offeredTo !== acc.clientName) continue;
    handled.add(acc.slotId);
    const { appointments, waitlist } = getAgendaState();
    const src = slotSources(appointments).find((s) => s.slotId === acc.slotId);
    const queueIndex = waitlist.findIndex((e) => e.id === acc.entryId);
    const entry = queueIndex >= 0 ? waitlist[queueIndex] : null;
    const svc = entry ? serviceByLabel(entry.service) : undefined;
    const professionalName = src ? getTeam().members.find((m) => m.id === src.professionalId)?.name ?? src.professionalId : '';
    const clientText = acc.clientText ?? firstOf(acc.clientName);

    // Com a automação ligada, quem ofereceu a vaga foi a assistente.
    updateOffer(acc.slotId, (cur) => ({ ...cur, events: cur.events.map((e) => ({ ...e, text: e.text.replace(/^A equipe ofereceu/, 'A assistente ofereceu') })) }));

    let problem: string | null = null;
    let created: CalAppointment | null = null;
    if (!src) problem = 'A vaga não existe mais.';else
    if (isPastNow(src.iso, src.start)) problem = 'O horário já passou.';else
    if (!entry || !svc) problem = 'O pedido não está mais na lista de espera.';else
    {
      const live = getServices().services.find((x) => x.id === svc.value);
      if (live && !live.professionalIds.includes(src.professionalId)) problem = `${professionalName} não faz ${entry.service}.`;else
      {
        // Regra única, SEM encaixe: oferta automática nunca dispensa expediente nem intervalo.
        const free = checkNow({ professionalId: src.professionalId, iso: src.iso, start: src.start, durationMin: svc.minutes });
        if (!free.ok) problem = free.message;else
        {
          const r = tryAddAppointment(
            { client: acc.clientName, service: svc.value, professional: src.professionalId, date: src.iso, time: src.start },
            { fromWaitlist: true, source: 'whatsapp', createdActorType: 'ai_whatsapp' }
          );
          if (r.ok) created = r.appt;else
          problem = r.message;
        }
      }
    }

    const day = src ? dayOf(src.iso) : null;
    if (created && src && entry && day) {
      bookings = [
      ...bookings,
      {
        apptId: created.id,
        iso: src.iso,
        start: src.start,
        professionalId: src.professionalId,
        professionalName,
        service: created.service,
        clientName: acc.clientName,
        clientText,
        slotId: acc.slotId,
        conversationId: acc.conversationId,
        at: `${todayShort()}, às ${NOW}`,
        entry,
        queueIndex,
        status: 'booked'
      }];

      updateOffer(acc.slotId, (cur) => ({ ...cur, events: [...cur.events, { time: 'agora', text: 'A assistente marcou o horário sozinha e avisou a equipe no sino' }] }));
      const text = `Agendado: ${day.chat}, às ${src.start}, ${created.service} com ${acc.professionalText ?? professionalName}.`;
      settleThread(acc.conversationId, [{ id: `auto-${created.id}`, sender: 'lia', timestamp: NOW, text }]);
      patchConversation(acc.conversationId, { handler: 'ia', waiting: undefined, unread: 0, preview: text, time: NOW });
    } else {
      const when = day && src ? `${day.chat}, às ${src.start}` : 'a vaga';
      settleThread(acc.conversationId);
      patchConversation(acc.conversationId, {
        handler: 'voce',
        waiting: {
          kind: 'ia',
          since: `${TODAY_ISO}T${NOW}`,
          reason: `Cliente aceitou ${when} (lista de espera), mas a assistente não conseguiu marcar: ${(problem ?? '').replace(/\.$/, '')}. Marque outro horário com ${clientText}.`
        }
      });
    }
    bump();
  }
}

automacoesStore.subscribe(run);
automacoesStore.subscribe(watchSlots);
run();

const liveOf = (b: AutoBooking, appointments: Record<string, CalAppointment[]>) => (appointments[b.iso] ?? []).find((a) => a.id === b.apptId);

/** A marcação da assistente que criou este agendamento (enquanto não foi desfeita). */
export const autoBookingOf = (apptId: string) => bookings.find((b) => b.apptId === apptId && b.status === 'booked');

/** Marcações da assistente que continuam na agenda (sino). */
export function activeAutoBookings(appointments: Record<string, CalAppointment[]>): AutoBooking[] {
  return bookings.filter((b) => {
    const a = liveOf(b, appointments);
    return b.status === 'booked' && !!a && a.status !== 'cancelled';
  });
}

/** Dá para desfazer? Até o horário começar, com o agendamento como a assistente deixou (sem cancelar, remarcar ou fechar). */
export function canUndoAutoBooking(apptId: string): boolean {
  const b = autoBookingOf(apptId);
  if (!b) return false;
  const a = liveOf(b, getAgendaState().appointments);
  return !!a && a.start === b.start && a.professionalId === b.professionalId && (a.status === 'pending_confirmation' || a.status === 'confirmed') && !isPastNow(b.iso, b.start);
}

/** Textos da janela do horário, do sino e do aviso rápido (um lugar só). */
export function autoBookingTexts(b: AutoBooking) {
  const day = dayOf(b.iso);
  return {
    noticeTitle: 'Marcado pela assistente',
    noticeText: `${firstOf(b.clientName)} aceitou pelo WhatsApp a vaga da lista de espera, e a assistente marcou este horário sozinha em ${b.at}.`,
    undoHelp: `Desfazer tira o horário da agenda, devolve o pedido para a lista de espera e deixa a conversa aguardando você, para avisar ${b.clientText}.`,
    undoLocked: 'O Desfazer vale até o horário começar, enquanto ele não foi cancelado, remarcado nem fechado.',
    bellTitle: `A assistente marcou ${b.clientName}: ${day.screen}, às ${b.start}`,
    bellDetail: `${b.service} com ${b.professionalName}, pela lista de espera. Abra para ver o horário ou desfazer.`,
    undoneTitle: 'Marcação desfeita',
    undoneText: `${b.clientName} · ${day.screen}, às ${b.start}. ${b.entry ? 'O pedido voltou para a lista de espera. ' : ''}Avise ${b.clientText} pela conversa.`
  };
}

/** Desfaz a marcação da assistente. Devolve `false` quando já não dá (o horário começou ou foi alterado). */
export function undoAutoBooking(apptId: string): boolean {
  const b = autoBookingOf(apptId);
  if (!b || !canUndoAutoBooking(apptId)) return false;
  const day = dayOf(b.iso);
  // Antes de tirar o agendamento: a vaga volta a "Livre" com o registro certo (não foi o cliente que cancelou).
  updateOffer(b.slotId, (cur) => ({
    ...cur,
    status: 'encerrada',
    filledBy: null,
    detail: 'marcação desfeita pela equipe · horário livre de novo',
    events: [...cur.events, { time: 'agora', text: `A equipe desfez a marcação de ${b.clientName}${b.entry ? '; o pedido voltou para a lista de espera' : ''}` }]
  }));
  removeAppointment(b.iso, b.apptId);
  const entry = b.entry;
  if (entry) setWaitlist((list) => list.some((e) => e.id === entry.id) ? list : [...list.slice(0, b.queueIndex), entry, ...list.slice(b.queueIndex)]);
  patchConversation(b.conversationId, {
    handler: 'voce',
    waiting: {
      kind: 'ia',
      aiOff: true,
      since: `${TODAY_ISO}T${NOW}`,
      reason: `A equipe desfez o horário de ${day.chat}, às ${b.start}, que a assistente tinha marcado. Avise ${b.clientText} e combine outro horário.`
    }
  });
  bookings = bookings.map((x) => x === b ? { ...x, status: 'undone' as const } : x);
  bump();
  return true;
}