import { ofName, wordsNow } from '../data/segment';
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { twMerge } from 'tailwind-merge';
import { ChevronRightIcon } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { StatusBadge } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { Card, CardHeader, CardTitle, CardContent, HighlightCard } from '../components/Card';
import { LIST_LIMITS, ScrollList } from '../components/ui/ListMore';
import { AppointmentStatusChip } from '../components/ui/StatusChip';
import { NoticeBanner, groupActionHoverClass, interactiveChevronClass, interactiveRowClass } from '../components/ui/Notice';
import { actionClass } from '../components/ui/actionStyles';
import { useToast } from '../components/ui/Toast';
import { ClosureRow } from '../components/agenda/AttentionRows';
import { AppointmentDetailsModal } from '../components/modals/AppointmentDetailsModal';
import { ConectarWhatsAppModal } from '../components/modals/ConectarWhatsAppModal';
import { detailsFromCalendar } from '../components/modals/appointmentDetailsFromCalendar';
import { AGENDA_NOTIFICATIONS_PATH, AGENDA_WAITLIST_PATH } from '../data/inicio';
import type { InicioHighlight } from '../data/inicio';
import { conversations, waitingCount } from '../data/conversas';
import { assistantStopNotice, oneSentence } from '../data/assistantStopNotice';
import { useConversations } from '../data/conversasThreads';
import { cardButton } from '../components/ui/styles';
import { moveAppointment, setAppointmentStatus, useAgendaData } from '../data/agendaLive';
import { TODAY_ISO, greeting, todayHeaderLabel } from '../data/agendaStore';
import { clinicDay, scheduleConflicts, useAgendaProfessionals, useTeam } from '../data/availability';
import { useBusinessName } from '../data/empresa';
import { pendingClosures } from '../data/legado';
import { cardsOf, useFollowUp, useFollowUpTotals } from '../data/followUp';
import { accountSummary, addDaysIso, dm, pendingItems, useSettings, waKey } from '../data/settingsStore';
import { agendaLink } from '../data/deepLinks';
import { changeText, slotText, useConflictCases } from '../data/conflictCases';
import { facebookButtonClass } from '../components/configuracoes/SettingsParts';
import { freedSlots, offerOf, useSlotOffers } from '../data/freedSlots';

/**
 * P1 (13/11/2026, facilidade de uso): aviso compacto = título + UMA frase + um botão. O texto completo continua na tela
 * de destino (Configurações › WhatsApp ou › Plano mostram o mesmo aviso inteiro, da mesma fonte: data/settingsStore.ts).
 * L4 (16/11/2026): `oneSentence` passou para data/assistantStopNotice.ts (a mesma frase curta em todas as telas).
 * L5 (16/11/2026, L4-3): um nome para o mesmo lugar. O aviso de conflitos usa "Ver quem falta resolver" (antes "Ver na
 * Agenda") e abre a Agenda do dia do primeiro conflito com "Notificações da agenda" à vista (`secao=notificacoes`).
 * L8 (17/11/2026): a linha de apoio do cartão "Lista de espera" acrescenta " · N falta marcar" quando há vaga liberada
 * que o cliente aceitou e ainda não foi marcada. Mesma fonte da etiqueta "Falta marcar" da Lista de espera
 * (data/freedSlots.ts: oferta "Aguardando" com `acceptedAt`). Só texto; nada novo no cartão.
 * L13 (17/11/2026, DS 4.9): os cinco cartões (quatro destaques + Retornos) são o `HighlightCard` do design system no
 * lugar da cópia local (components/inicio/HighlightCard.tsx). O número de Oportunidades ("Precisam de você",
 * `useFollowUpTotals`) que a cópia lia sozinha agora é calculado aqui e passado em `value` e `support`.
 */

/**
 * L4 (16/11/2026, decisão 2 do piloto): no aviso da autorização do Facebook que vai vencer, a frase visível é a que diz o
 * que acontece se vencer. Lida do texto único de data/settingsStore.ts (não é cópia); o texto inteiro continua em
 * Configurações › WhatsApp.
 */
const ifExpiresSentence = (text?: string) => text?.match(/Se vencer[^.!?]*[.!?]/)?.[0] ?? oneSentence(text);

/** L13 (17/11/2026, DS 4.9): props do `HighlightCard` do design system a partir do destaque (o cartão inteiro é o `Link`). */
const highlightProps = (h: InicioHighlight) => ({
  label: h.label,
  value: h.value,
  support: h.support,
  actionLabel: h.actionLabel,
  accent: h.accent,
  as: Link,
  linkProps: { to: h.path }
});

export function Inicio() {
  const { appointments: store, blocks, waitlist } = useAgendaData();
  // R3 (06/11/2026, Christian, A-16): clínica fechada hoje (mesma regra da faixa do topo e da Agenda). N = agendamentos
  // de hoje em conflito pela regra única (`scheduleConflicts`, a mesma contagem da Agenda). Nada é cancelado nem movido.
  const team = useTeam();
  const closedToday = !clinicDay(TODAY_ISO, { hours: team.hours, blocks: team.blocks }).open;
  const conflictsToday = useMemo(
    () => closedToday ? scheduleConflicts({ appointments: store, blocks }).filter((c) => c.iso === TODAY_ISO).length : 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closedToday, store, blocks, team]
  );
  const w = wordsNow();
  const toast = useToast();
  // G1 (F-005): destaques calculados das fontes únicas (conversas, lista de espera), nunca escritos à mão.
  // T1 (O-02): conversas aguardando = `waitingCount` (mesma regra do filtro e do menu).
  useConversations();
  useSlotOffers();
  const waiting = waitingCount(conversations);
  const { all: followUps } = useFollowUp();
  const settings = useSettings();
  // G1 (F-004/F-017): nome da empresa salvo em Empresa e relógio único do protótipo.
  const companyName = useBusinessName();
  // W4 (11/11/2026, combinado 6): assistente parada = aviso com os textos únicos (limite ou WhatsApp desconectado). Ele
  // SUBSTITUI a pendência do mesmo assunto (“uso” ou “whatsapp”): um aviso por assunto.
  const stopNotice = assistantStopNotice(settings);
  const top = pendingItems(settings).filter((p) => !stopNotice || p.id !== stopNotice.subject)[0];
  // P1: a autorização do Facebook vencendo abre aqui MESMO a janela "Renovar a autorização do Facebook" de
  // Configurações › WhatsApp (ConectarWhatsAppModal, modo renew). Nenhuma regra nova: a janela grava a renovação sozinha.
  const renewHere = top?.id === 'whatsapp' && ['vence-em-breve', 'vencida'].includes(waKey(settings));
  const [renewOpen, setRenewOpen] = useState(false);
  // W4 (A5-05): o WhatsApp recusou a mensagem de confirmação de horário → os clientes “A confirmar” não recebem o lembrete.
  // Só aparece aqui se Configurações ainda não tratar isso como pendência própria (faixa W6).
  const knownPending = ['whatsapp', 'assinatura', 'uso'];
  const reminderRefused = settings.templates.lembrete === 'recusada' && !pendingItems(settings).some((p) => !knownPending.includes(p.id));
  // W4 (A3-11, A3-24, A1-05): conflitos de hoje em diante (ausência, data especial, horário da clínica), mesma regra da Agenda.
  const conflicts = useMemo(
    () => scheduleConflicts({ appointments: store, blocks }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, blocks, team]
  );
  const conflictIds = new Set(conflicts.map((c) => c.appt.id));
  // Clínica fechada hoje já tem o aviso próprio (abaixo): este conta os outros conflitos.
  const otherConflicts = closedToday ? conflicts.filter((c) => c.iso !== TODAY_ISO) : conflicts;
  // W4 (G4): confirmações de amanhã.
  // W9b (NF-2): o horário de amanhã em conflito não entra em "confirmados" nem em "sem resposta"; aparece à parte.
  const tomorrow = addDaysIso(TODAY_ISO, 1);
  const tomorrowAppts = (store[tomorrow] ?? []).filter((a) => a.status !== 'cancelled');
  const tomorrowConflicts = tomorrowAppts.filter((a) => conflictIds.has(a.id)).length;
  const tomorrowConfirmed = tomorrowAppts.filter((a) => a.status === 'confirmed' && !conflictIds.has(a.id)).length;
  const tomorrowPending = tomorrowAppts.filter((a) => a.status === 'pending_confirmation' && !conflictIds.has(a.id)).length;
  // W9b (J-04, decisão G1, achado A1-05): "Falta avisar" (a clínica mudou ou cancelou o horário e o cliente ainda não sabe).
  // Mesma fonte da lista Notificações da agenda (data/conflictCases.ts); o aviso leva a essa lista.
  const toNotify = useConflictCases().filter((c) => c.state === 'avisar');
  // G4 (F-067): o selo do topo vem do resumo único (mesmo estado da IA Orniplaty, Conversas, Configurações e Automações).
  const summary = accountSummary(settings);
  const [selectedRef, setSelectedRef] = useState<{iso: string;id: string;} | null>(null);

  // Mesma agenda das outras telas: o que muda aqui muda na Agenda e vice-versa
  const appointments = useMemo(
    () => (store[TODAY_ISO] ?? []).filter((a) => a.status !== 'cancelled').slice().sort((a, b) => a.start.localeCompare(b.start)),
    [store]
  );
  // Fechamentos pendentes: MESMA fonte da Agenda (derivado da agenda, nunca presumido)
  const closures = useMemo(() => pendingClosures(store), [store]);
  const selected = selectedRef ? (store[selectedRef.iso] ?? []).find((a) => a.id === selectedRef.id) ?? null : null;
  // G1 (F-003): nome e cor do profissional vêm da equipe viva (inclusive arquivado, para o histórico do dia).
  const { byId: proOf } = useAgendaProfessionals();
  // L8: vagas que o cliente aceitou e ainda falta marcar (a mesma condição da etiqueta "Falta marcar" da Lista de espera).
  const toBook = freedSlots(store, (id) => proOf(id)?.name ?? '').filter((v) => v.statusLabel === 'Aguardando' && !!offerOf(v.id)?.acceptedAt).length;

  // Retornos (Lote C): mesma fonte de Oportunidades (motivo Retorno). C1 (21/10/2026): o cartão leva a Oportunidades › Retorno.
  // P4 (28/10/2026): conta CARTÕES (um por cliente, `cardsOf`), como Oportunidades › Retorno; antes contava casos.
  const retornos = cardsOf(followUps.filter((c) => c.motive === 'retorno'));
  const needYou = retornos.filter((c) => c.situation === 'precisa').length;

  // P1 (13/11/2026): rótulo + número + UMA linha que diz o que o número conta + botão. O que saiu das linhas de apoio
  // aparece na tela de destino (ver data/inicio.ts).
  const followUpTotals = useFollowUpTotals();
  const waitlistSupport = closedToday ? 'na lista · ofertas suspensas hoje' : waitlist.length === 1 ? 'pessoa aguardando vaga' : 'pessoas aguardando vaga';
  const highlights: InicioHighlight[] = [
  {
    id: 'conversas',
    label: 'Conversas',
    value: String(waiting),
    support: 'aguardando você',
    path: '/conversas',
    actionLabel: 'Abrir conversas'
  },
  // Lote C: mesma fonte da tela e do menu; o número é "Precisam de você". L13: a conta saiu do cartão e fica aqui.
  {
    id: 'oportunidades',
    label: 'Oportunidades',
    value: String(followUpTotals.precisa),
    support: followUpTotals.precisa === 1 ? 'cliente precisa de você' : 'clientes precisam de você',
    path: '/oportunidades',
    actionLabel: 'Ver oportunidades'
  },
  // W4 (G4): leva à Agenda de amanhã com o filtro “A confirmar” (filtro da faixa W3).
  {
    id: 'amanha',
    label: 'Amanhã',
    value: String(tomorrowConfirmed),
    support:
    tomorrowAppts.length === 0 ?
    'nenhum horário marcado' :
    `${tomorrowConfirmed === 1 ? 'confirmado' : 'confirmados'} · ${tomorrowPending} a confirmar${tomorrowConflicts > 0 ? ` · ${tomorrowConflicts} em conflito` : ''}`,
    path: `/agenda?data=${tomorrow}&filtro=a-confirmar`,
    actionLabel: 'Ver confirmações'
  },
  {
    id: 'lista-espera',
    label: 'Lista de espera',
    value: String(waitlist.length),
    // R3 (06/11/2026, Christian, A-16): fechada hoje, as ofertas de vaga de hoje ficam suspensas (data/freedSlots.ts).
    // L8: " · N falta marcar" quando há vaga aceita esperando a marcação.
    support: toBook > 0 ? `${waitlistSupport} · ${toBook} ${toBook === 1 ? 'falta marcar' : 'faltam marcar'}` : waitlistSupport,
    path: AGENDA_WAITLIST_PATH,
    actionLabel: 'Ver lista de espera'
  }];


  // P1: Retornos usa o MESMO cartão dos destaques. "Envios pausados" e "Programados" já aparecem em Oportunidades.
  const retornosCard: InicioHighlight = {
    id: 'retornos',
    label: 'Retornos',
    value: String(needYou),
    support: needYou === 0 ? 'nenhum retorno precisa de você agora' : needYou === 1 ? 'retorno precisa de você' : 'retornos precisam de você',
    path: '/oportunidades?aba=retorno',
    actionLabel: 'Ver retornos'
  };

  const renderClosure = (c: (typeof closures)[number]) =>
  <li key={c.appt.id}>
      <ClosureRow iso={c.iso} appt={c.appt} onOpen={() => setSelectedRef({ iso: c.iso, id: c.appt.id })} />
    </li>;


  const todayCount = `${appointments.length} ${appointments.length === 1 ? 'atendimento' : 'atendimentos'}`;

  return (
    <DashboardLayout
      activeId="inicio"
      title={`${greeting()}, equipe ${ofName(companyName)}`}
      subtitle={todayHeaderLabel()}
      // Lote E (E1): mesmo estado da IA Orniplaty (data/settingsStore.ts `ai`). Desligar de propósito = âmbar, não erro.
      // Rodada de 11/11/2026 (Christian): a etiqueta saiu da direita do título (lugar da faixa do topo) e fica abaixo da data.
      belowSubtitle={<StatusBadge status={summary.assistant.badge.tone} label={summary.assistant.badge.label} />}>
      
      <div className="mt-6 flex flex-col gap-6">
        {/* R3 (06/11/2026, Christian, A-16): clínica fechada hoje → aviso de página com link para a Agenda de hoje. Sem conflito, só "fechada hoje". */}
        {closedToday &&
        <NoticeBanner
          tone="warning"
          title={`${w.The} está ${w.closed} hoje${conflictsToday > 0 ? ` · ${conflictsToday} ${conflictsToday === 1 ? 'agendamento em conflito' : 'agendamentos em conflito'}` : ''}`}
          // L4: uma frase. "Resolva cada um na Agenda de hoje" virou o botão; "ofertas de vaga suspensas hoje" continua
          // no cartão "Lista de espera" desta mesma tela ("na lista · ofertas suspensas hoje").
          description={conflictsToday > 0 ? 'Nada foi cancelado nem movido.' : 'Nenhum agendamento em conflito.'}
          to={agendaLink({ date: TODAY_ISO })}
          ariaLabel={`${w.The} está ${w.closed} hoje. Abrir a Agenda de hoje`}
          role={conflictsToday > 0 ? 'alert' : 'status'}
          action={<span className={twMerge(actionClass('primary', 'md'), 'pointer-events-none', groupActionHoverClass)}>Ver agenda de hoje</span>} />

        }
        {/* P1: aviso compacto (título + uma frase). O texto inteiro está na tela de destino (Configurações). */}
        {stopNotice &&
        <NoticeBanner
          tone="error"
          title={stopNotice.title}
          description={stopNotice.short}
          to={stopNotice.action?.to ?? '/configuracoes'}
          ariaLabel={`${stopNotice.title}. ${stopNotice.action?.label ?? 'Abrir Configurações'}`}
          role="alert"
          action={stopNotice.action ? <span className={twMerge(actionClass('primary', 'md'), 'pointer-events-none', groupActionHoverClass)}>{stopNotice.action.label}</span> : undefined} />

        }
        {/* W4 (A3-11, A3-24, A1-05): um aviso para os conflitos de hoje em diante, que leva à Agenda do primeiro dia com conflito.
             L5 (L4-3): mesmo nome do lugar em todas as telas ("Ver quem falta resolver") e abre com as notificações à vista. */}
        {otherConflicts.length > 0 &&
        <NoticeBanner
          tone="warning"
          title={`${otherConflicts.length} ${otherConflicts.length === 1 ? 'agendamento em conflito' : 'agendamentos em conflito'}`}
          // L4: uma frase (a de segurança). Quem está em conflito aparece na Agenda do dia, em "Falta resolver".
          description="Nada foi cancelado nem movido."
          to={`/agenda?data=${otherConflicts[0].iso}&secao=notificacoes`}
          ariaLabel={`${otherConflicts.length} ${otherConflicts.length === 1 ? 'agendamento em conflito' : 'agendamentos em conflito'}. Ver quem falta resolver`}
          role="alert"
          action={<span className={twMerge(actionClass('primary', 'md'), 'pointer-events-none', groupActionHoverClass)}>Ver quem falta resolver</span>} />

        }
        {/* W9b (J-04, G1): cliente que ainda não sabe que a clínica mudou ou cancelou o horário. Leva à lista da Agenda. */}
        {toNotify.length > 0 &&
        <NoticeBanner
          tone="warning"
          title={toNotify.length === 1 ? `Falta avisar ${toNotify[0].client} da mudança de horário` : `Falta avisar ${toNotify.length} clientes da mudança de horário`}
          // L4: uma frase. "Quem avisa é a equipe…" é a frase de "Falta avisar" em Notificações da agenda (destino do botão).
          description={`${toNotify.length === 1 ? '' : 'O primeiro: '}${toNotify[0].client} · ${changeText(toNotify[0])} (era ${slotText(toNotify[0].iso, toNotify[0].start, toNotify[0].professionalId)}).`}
          to={AGENDA_NOTIFICATIONS_PATH}
          ariaLabel={`Falta avisar ${toNotify.length === 1 ? toNotify[0].client : `${toNotify.length} clientes`} da mudança de horário. Ver na Agenda`}
          role="alert"
          action={<span className={twMerge(actionClass('primary', 'md'), 'pointer-events-none', groupActionHoverClass)}>Ver quem falta avisar</span>} />

        }
        {reminderRefused &&
        <NoticeBanner
          tone="warning"
          title="O WhatsApp recusou a mensagem de confirmação de horário"
          // L4: uma frase; "Veja o motivo e corrija em Configurações › WhatsApp" é o botão "Ver motivo".
          description="Enquanto ela não for corrigida, os clientes “A confirmar” não recebem o lembrete."
          to="/configuracoes?secao=whatsapp"
          ariaLabel="O WhatsApp recusou a mensagem de confirmação de horário. Ver motivo em Configurações"
          role="alert"
          action={<span className={twMerge(actionClass('primary', 'md'), 'pointer-events-none', groupActionHoverClass)}>Ver motivo</span>} />

        }
        {/* Um aviso só: a pendência mais grave de data/settingsStore.ts (mesmos títulos de Configurações). P1: uma frase só. */}
        {top && renewHere &&
        <NoticeBanner
          tone={top.notice.tone}
          title={top.notice.title}
          description={waKey(settings) === 'vence-em-breve' ? ifExpiresSentence(top.notice.text) : oneSentence(top.notice.text)}
          role={top.notice.tone === 'error' || top.notice.tone === 'warning' ? 'alert' : 'status'}
          action={
          <Button size="md" className="w-full sm:w-auto" onClick={() => setRenewOpen(true)}>
                {top.notice.action?.label ?? 'Renovar pelo Facebook'}
              </Button>
          } />

        }
        {top && !renewHere &&
        <NoticeBanner
          tone={top.notice.tone}
          title={top.notice.title}
          description={oneSentence(top.notice.text)}
          to={`/configuracoes?secao=${top.section}`}
          ariaLabel={`${top.notice.title}. Abrir Configurações para resolver`}
          role={top.notice.tone === 'error' || top.notice.tone === 'warning' ? 'alert' : 'status'}
          action={
          top.notice.action ?
          <span className={twMerge(actionClass('primary', 'md'), 'pointer-events-none', groupActionHoverClass, top.notice.action.kind === 'facebook' && `${facebookButtonClass} group-hover:bg-facebook group-hover:brightness-95`)}>
                  {top.notice.action.label}
                </span> :
          undefined
          } />

        }

        {/* P1: 4 destaques com a MESMA grade dos blocos de baixo (gap 24px; os blocos ocupam 2 + 2 colunas). L13: `HighlightCard` do DS. */}
        <section aria-label="Destaques" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {highlights.map((highlight) =>
          <HighlightCard key={highlight.id} {...highlightProps(highlight)} />
          )}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card as="section" padding="lg">
            <CardHeader>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <CardTitle as="h2">Atendimentos de hoje</CardTitle>
                <span className="text-sm font-semibold text-text-secondary">· {todayCount}</span>
              </div>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 && <p className="text-sm text-text-secondary">Nenhum atendimento hoje.</p>}
              <ul className="divide-y divide-border">
                {appointments.slice(0, LIST_LIMITS.todayAppointments).map((appt) => {
                  const pro = proOf(appt.professionalId);
                  return (
                    <li key={appt.id}>
                      <button type="button" onClick={() => setSelectedRef({ iso: TODAY_ISO, id: appt.id })} className={interactiveRowClass}>
                        <span className="w-12 shrink-0 text-sm font-bold tabular-nums text-text-primary">{appt.start}</span>
                        <span className="min-w-0 flex-1 basis-40">
                          <span className="block break-words text-sm font-bold text-text-primary">{appt.clientName}</span>
                          <span className="flex min-w-0 items-start gap-1.5 text-sm text-text-secondary">
                            {pro && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pro.color }} aria-hidden="true" />}
                            <span className="min-w-0 break-words">
                              {appt.service} · {pro?.name}
                              {appt.fromWaitlist ? ' · lista de espera' : ''}
                            </span>
                          </span>
                        </span>
                        {/* W4 (A3-11): mesma marca de conflito da Agenda. */}
                        {conflictIds.has(appt.id) && <StatusBadge status="error" label="Conflito" />}
                        <AppointmentStatusChip status={appt.status} />
                        <ChevronRightIcon className={interactiveChevronClass} aria-hidden="true" />
                      </button>
                    </li>);

                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                {appointments.length > LIST_LIMITS.todayAppointments &&
                <p className="text-sm text-text-secondary">{`Mostrando ${LIST_LIMITS.todayAppointments} de ${appointments.length} atendimentos de hoje`}</p>
                }
                <Link to={agendaLink({ date: TODAY_ISO })} className={`${cardButton} ml-auto`}>
                  Ver agenda completa
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card as="section" padding="lg">
              <CardHeader>
                <CardTitle as="h2">Fechamentos pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-text-secondary">O horário passou sem registro de comparecimento ou falta. Nada foi presumido.</p>
                {closures.length === 0 && <p className="mt-2 text-sm text-text-secondary">Tudo fechado. Nenhum atendimento pendente.</p>}
                {/* Todos os fechamentos, até 5 visíveis + rolagem interna (decisão do Christian, 16/10/2026; sem "Ver todos") */}
                {closures.length > 0 &&
                <div className="mt-1">
                    <ScrollList ariaLabel="Fechamentos pendentes" className="divide-y divide-border">
                      {closures.map(renderClosure)}
                    </ScrollList>
                  </div>
                }
              </CardContent>
            </Card>

            <HighlightCard {...highlightProps(retornosCard)} />
          </div>
        </div>
      </div>

      <AppointmentDetailsModal
        appointment={selected && selectedRef ? detailsFromCalendar(selectedRef.iso, selected) : null}
        onClose={() => setSelectedRef(null)}
        onStatusChange={(status) => selected && selectedRef && setAppointmentStatus(selectedRef.iso, selected.id, status)}
        onRescheduled={(data) =>
        selected && selectedRef ? moveAppointment(selectedRef.iso, selected.id, data) : { ok: false as const, message: 'Agendamento não encontrado.' }
        } />
      

      {/* P1: mesma janela e mesmo aviso de sucesso de Configurações › WhatsApp (components/configuracoes/WhatsAppSection.tsx). */}
      <ConectarWhatsAppModal
        open={renewOpen}
        mode="renew"
        onClose={() => setRenewOpen(false)}
        onConnected={(expiresOn) => toast({ title: `Autorização renovada · válida até ${dm(expiresOn)}` })} />
      
    </DashboardLayout>);

}