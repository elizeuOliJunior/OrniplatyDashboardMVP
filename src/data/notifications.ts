import { useSyncExternalStore } from 'react';
import { conversations, inQueue, byLongestWait, waitMinutes, waitingOf } from './conversas';
import { useConversations } from './conversasThreads';
import { agoLabel, reasonLine } from './replyWindow';
import { useFollowUp, shortDate } from './followUp';
import { pendingItems, useSettings } from './settingsStore';
import { failedReminders, useRemindersVersion } from './reminders';
import { useAgendaData } from './agendaLive';
import { agendaProfessionalOf, scheduleConflicts, useTeam } from './availability';
import { assistantStopNotice } from './assistantStopNotice';
import { agendaLink } from './deepLinks';
import { useSlotOffers } from './freedSlots';
import { listedSlots } from './waitlistOffer';
import { slotDayPhrase } from './waitlistPrefs';
import { AGENDA_NOTIFICATIONS_PATH, AGENDA_WAITLIST_PATH } from './inicio';
import { NOW, TODAY_ISO } from './agendaStore';
import { automacoesStore } from './automacoes';
import { useSavedStore } from './iaConfigStore';
import { DEFAULT_SEND_WINDOWS, insideWindow } from './sendWindows';
import { activeAutoBookings, autoBookingTexts, useAutoBookings } from './waitlistAutoBooking';
import { changeText, slotText, useConflictCases } from './conflictCases';

/**
 * T1 1k (05/11/2026, Christian): o SINO do topo junta, num lugar só, o que pede ação da equipe. Escolha do Christian:
 * 1. Conversas "Aguardando você" (mesma regra da fila: `inQueue`), da espera mais longa para a mais curta.
 * 2. Oportunidades "Precisa de você" (um cartão por cliente, como na tela).
 * 3. Lembretes que não chegaram (agendamentos de hoje em diante).
 * 4. Pendências de Configurações (as mesmas do número no menu).
 * W1 (11/11/2026, Christian, resposta 6): 5. Oferta de vaga AGUARDANDO resposta ("Vaga de hoje às 15:00: chame …"). Fica
 * logo depois das conversas e leva à Lista de espera da Agenda. Usa o ícone de conversa (`kind: 'conversa'`), porque a
 * ação é chamar o cliente no WhatsApp; some quando a resposta é registrada. Oferta suspensa (clínica fechada hoje) não entra.
 * W4 (11/11/2026, Christian): 6. Conflitos de horário de hoje em diante (um aviso só, leva à Agenda). Um assunto, um
 * aviso: o pedido de ajuda que já está em Conversas não se repete como Oportunidade; a assistente parada usa o texto único
 * (combinado 6) no lugar da pendência do mesmo assunto.
 * I4 (12/11/2026, Christian, decisão I1-3): 7. "A assistente marcou …": horário que a assistente marcou sozinha quando o
 * cliente aceitou a vaga da lista de espera (data/waitlistAutoBooking.ts). É um aviso para a equipe SABER (tom `info`),
 * com o ícone de conversa; o clique abre o dia na Agenda com o horário destacado (sem abrir a janela), e o Desfazer fica
 * na janela do horário. Some se a marcação for desfeita ou o
 * horário cancelado. No mesmo lote, a oferta aguardando (item 5) deixou de pedir "chame …" em dois casos: quando a
 * conversa da pessoa já está em "Aguardando você" (um assunto, um aviso) e quando a automação "Lista de espera" está
 * ligada e dentro dos dias e horários de envio (quem cuida da oferta é a assistente).
 * W9b (12/11/2026, J-04, decisão G1, achado A1-05): 8. "Falta avisar": a clínica mudou ou cancelou o horário e o cliente
 * ainda não sabe (data/conflictCases.ts). Um aviso só, que leva à lista da Agenda (Notificações da agenda), como o Início.
 * Tudo DERIVADO das fontes que as telas já usam: quando a pendência some na tela, some do sino.
 * "Lida" vale só nesta sessão e só para a versão atual do aviso (se a conversa voltar a esperar, o aviso volta).
 * BACKEND (main de 22/10): NÃO existe central de notificações nem "lida/não lida" por usuário. CONTRATO NOVO para o T2.
 */
/** W4 (11/11/2026): `agenda` = conflitos de horário (um aviso só, leva à Agenda). */
export type NotificationKind = 'conversa' | 'oportunidade' | 'lembrete' | 'configuracao' | 'agenda';
export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail?: string;
  when?: string;
  to: string;
  tone: 'warning' | 'error' | 'info';
};

let read = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const useRead = () =>
useSyncExternalStore(
  (l) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  () => read
);
export function markNotificationRead(id: string) {
  if (read.has(id)) return;
  read = new Set(read).add(id);
  emit();
}
export function markAllNotificationsRead(ids: string[]) {
  read = new Set([...read, ...ids]);
  emit();
}

export function useNotifications() {
  useConversations();
  useRemindersVersion();
  const settings = useSettings();
  const followUp = useFollowUp();
  const readIds = useRead();
  // W1: ofertas de vaga aguardando resposta (mesma fonte da Agenda › Lista de espera).
  const agenda = useAgendaData();
  useSlotOffers();
  useTeam();
  // I4: marcações da assistente e a automação "Lista de espera" salva.
  useAutoBookings();
  const auto = useSavedStore(automacoesStore);
  // W9b (J-04): casos "Falta avisar" da Agenda (mesma fonte da lista Notificações da agenda).
  const cases = useConflictCases();
  const assistantOffers = !!auto.enabled['lista-espera'] && insideWindow((auto.send ?? DEFAULT_SEND_WINDOWS).appointments, { iso: TODAY_ISO, time: NOW });
  const items: AppNotification[] = [];

  for (const c of conversations.filter(inQueue).sort(byLongestWait)) {
    // R3 (06/11/2026, Christian, A-12): com a assistente desligada, as conversas que estavam com ela entram aqui (espera derivada, `waitingOf`).
    const w = waitingOf(c);
    items.push({
      id: `conversa:${c.id}:${w?.since ?? ''}`,
      kind: 'conversa',
      title: w?.kind === 'ia' && !w.aiOff ? `${c.name}: a assistente pediu ajuda` : `${c.name} está aguardando você`,
      detail: reasonLine(w?.reason, w?.kind ?? 'equipe'),
      when: agoLabel(waitMinutes(c)),
      to: `/conversas?cliente=${c.id}`,
      tone: 'warning'
    });
  }
  for (const slot of listedSlots(agenda.appointments, agenda.waitlist, (id) => agendaProfessionalOf(id)?.name ?? id)) {
    if (slot.statusLabel !== 'Aguardando' || !slot.offeredTo) continue;
    // I4: a assistente cuida da oferta, ou a conversa da pessoa já está na fila (um assunto, um aviso).
    if (assistantOffers || conversations.some((c) => c.name === slot.offeredTo && inQueue(c))) continue;
    items.push({
      id: `vaga:${slot.id}:${slot.offeredTo}`,
      kind: 'conversa',
      title: `Vaga de ${slotDayPhrase(slot.iso).replace(/^n[ao] /, '')} às ${slot.time}: chame ${slot.offeredTo}`,
      detail: `Oferta da lista de espera aguardando resposta · ${slot.professional}. Depois registre se aceitou, recusou ou ficou sem resposta.`,
      to: AGENDA_WAITLIST_PATH,
      tone: 'warning'
    });
  }
  // I4 (decisão I1-3): a assistente marcou sozinha. O clique abre o horário na Agenda (lá fica o Desfazer).
  for (const b of activeAutoBookings(agenda.appointments)) {
    const texts = autoBookingTexts(b);
    items.push({
      id: `marcou:${b.apptId}`,
      kind: 'conversa',
      title: texts.bellTitle,
      detail: texts.bellDetail,
      to: agendaLink({ date: b.iso, appointmentId: b.apptId }),
      tone: 'info'
    });
  }
  // W4 (A3-11, A3-24, A1-05): conflitos de hoje em diante, UM aviso só (some quando não há mais conflito).
  const conflicts = scheduleConflicts({ appointments: agenda.appointments, blocks: agenda.blocks });
  if (conflicts.length > 0) {
    const first = conflicts[0];
    items.push({
      id: `agenda:conflitos:${conflicts.map((c) => c.appt.id).join(',')}`,
      kind: 'agenda',
      title: `${conflicts.length} ${conflicts.length === 1 ? 'agendamento em conflito' : 'agendamentos em conflito'}`,
      detail: `O primeiro: ${first.appt.clientName}, ${first.iso.slice(8, 10)}/${first.iso.slice(5, 7)} às ${first.appt.start}. Nada foi cancelado nem movido.`,
      to: agendaLink({ date: first.iso }),
      tone: 'error'
    });
  }
  // W9b (J-04, G1): "Falta avisar", UM aviso só, que leva à lista da Agenda (some quando todos foram avisados).
  const toNotify = cases.filter((c) => c.state === 'avisar');
  if (toNotify.length > 0) {
    const first = toNotify[0];
    items.push({
      id: `agenda:avisar:${toNotify.map((c) => `${c.id}-${c.attempts.length}`).join(',')}`,
      kind: 'agenda',
      title: toNotify.length === 1 ? `Falta avisar ${first.client} da mudança de horário` : `Falta avisar ${toNotify.length} clientes da mudança de horário`,
      detail: `${toNotify.length === 1 ? '' : 'O primeiro: '}${first.client} · ${changeText(first)} (era ${slotText(first.iso, first.start, first.professionalId)}). Chame no WhatsApp com a mensagem pronta e marque “Avisado” na Agenda.`,
      to: AGENDA_NOTIFICATIONS_PATH,
      tone: 'warning'
    });
  }
  // W4 (A2-05): um assunto, um aviso. O pedido de ajuda que já aparece como conversa “Aguardando você” não se repete.
  const queuedClients = new Set(conversations.filter(inQueue).map((c) => c.id));
  for (const c of followUp.by.precisa) {
    if (c.need?.kind === 'ia-ajuda' && queuedClients.has(c.clientId)) continue;
    items.push({
      id: `oportunidade:${c.id}:${c.need?.kind ?? ''}:${c.need?.iso ?? ''}`,
      kind: 'oportunidade',
      title: `${c.clientName}: ${c.need?.title ?? 'precisa de você'}`,
      detail: c.service,
      // W4 (A2-15): “desde 22/09” em vez de uma data solta.
      when: c.need?.iso ? `desde ${shortDate(c.need.iso)}` : undefined,
      to: `/oportunidades?caso=${c.id}`,
      tone: 'warning'
    });
  }
  for (const f of failedReminders()) {
    items.push({
      id: `lembrete:${f.key}:${f.at}`,
      kind: 'lembrete',
      title: `Lembrete não chegou para ${f.clientName}`,
      detail: `${f.reason} · agendamento ${f.iso.slice(8, 10)}/${f.iso.slice(5, 7)} às ${f.start}`,
      to: `/agenda?data=${f.iso}`,
      tone: 'error'
    });
  }
  // W4 (combinado 6): assistente parada → um aviso com os textos únicos, no lugar da pendência do mesmo assunto.
  const stop = assistantStopNotice(settings);
  if (stop)
  items.push({
    id: `configuracao:parada:${stop.title}`,
    kind: 'configuracao',
    title: stop.title,
    detail: stop.text,
    to: stop.action?.to ?? '/configuracoes',
    tone: 'error'
  });
  for (const p of pendingItems(settings)) {
    if (stop && p.id === stop.subject) continue;
    items.push({
      id: `configuracao:${p.id}:${p.notice.title}`,
      kind: 'configuracao',
      title: p.notice.title,
      detail: p.notice.text,
      to: p.section === 'geral' ? '/configuracoes' : `/configuracoes?secao=${p.section}`,
      tone: p.notice.tone === 'error' ? 'error' : p.notice.tone === 'warning' ? 'warning' : 'info'
    });
  }
  const unread = items.filter((n) => !readIds.has(n.id));
  return { items, isRead: (id: string) => readIds.has(id), unreadCount: unread.length, unreadIds: unread.map((n) => n.id) };
}