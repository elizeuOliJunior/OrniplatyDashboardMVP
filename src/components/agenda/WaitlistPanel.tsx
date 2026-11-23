import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, MessageCircleIcon, PlusIcon, XIcon } from 'lucide-react';
import * as DesignSystem from '../Card';
import { Card, EmptyState, IconButton, InfoTip } from '../Card';
import { CountBadge } from '../CountBadge';
import { Button } from '../Button';
import { useToast } from '../ui/Toast';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ScrollList } from '../ui/ListMore';
import { StatusPill } from '../ui/StatusPill';
import type { PillTone } from '../ui/StatusPill';
import { ListaEsperaModal } from '../modals/ListaEsperaModal';
import type { AgendamentoDefaults } from '../modals/NovoAgendamentoModal';
import { FreedSlotModal, WaitlistEntryModal, useAssistantOffers } from './WaitlistDetailsModals';
import { WaitlistConversationPanel } from './WaitlistConversationPanel';
import type { WaitlistChatTarget } from './WaitlistConversationPanel';
import { useOpenConversation } from '../conversas/useOpenConversation';
import { cancelOffer, closeOfferBookedElsewhere, closeOffersOfServedRequest, declineOffer, noteOfferContact, offerOf, openedBeforeAutomation, simulateOffer, updateOffer, useSlotOffers } from '../../data/freedSlots';
import { canReceiveOffer, listedSlots, rankOffer, reviewReasonOf, slotSourceOf } from '../../data/waitlistOffer';
import { postAssistantOffer, waitingForTeam } from '../../data/waitlistAutoBooking';
import { preferenceLabel, slotDayPhrase, slotDayTitle } from '../../data/waitlistPrefs';
import { agendaProfessionalOf, clinicDay, useTeam } from '../../data/availability';
import { restoreExpired, setWaitlist, useAgendaData } from '../../data/agendaLive';
import { NOW, TODAY_ISO } from '../../data/agendaStore';
import { useServices } from '../../data/servicesStore';
import { automacoesStore } from '../../data/automacoes';
import { useSavedStore } from '../../data/iaConfigStore';
import { ensureConversation, useConversations } from '../../data/conversasThreads';
import { toMinutes } from '../../utils/time';
import type { AgendaFreedSlot, AgendaWaitlistEntry } from '../../data/agenda';
import { activeServiceOf, professionalByLabel } from '../../data/catalogo';
import { clientById, clientIdOfRecordedName } from '../../data/api/clientes';
import { clientIdFromName, kindOf, kindReason, stoppedLine, useContactBlocks } from '../../data/contactPreferences';
import type { KindRecord } from '../../data/contactPreferences';

type WaitlistPanelProps = {
  /** Opens the new-appointment form; `onDone` runs after the appointment is saved */
  onSchedule?: (defaults: AgendamentoDefaults, onDone: () => void) => void;
};

/**
 * Linha ÚNICA das duas listas do painel (decisão do Christian, 16/10/2026): cartão branco com borda, mesmo espaçamento
 * e mesmo hover. Lista de espera e Vagas liberadas entregam dados parecidos e não podem ter visuais diferentes.
 */
const rowItem = 'flex items-center gap-1 rounded-xl border border-border bg-surface px-3.5 py-3 transition-colors duration-150 hover:border-primary hover:bg-hover-surface active:bg-active-surface';
const rowButton =
'flex min-w-0 flex-1 items-start gap-2 rounded-button text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

/** Status da vaga → tom da etiqueta única (`StatusPill`). Preenchida = success, Aguardando = warning, Livre = neutral. */
const slotTone = (status: string): PillTone =>
status === 'success' ? 'success' : status === 'warning' ? 'warning' : status === 'error' || status === 'danger' ? 'error' : status === 'info' ? 'info' : 'neutral';

/**
 * L4 (16/11/2026, decisão 10 do piloto; design system v4.8): vaga que o cliente ACEITOU e ninguém marcou ainda = etiqueta
 * oficial "Falta marcar" (`STATUS_LABELS['Aceitou, falta marcar']`, tom `warning`). "Aguardando" fica só para a oferta
 * sem resposta. Só o nome na tela: o estado gravado (`statusLabel`, oferta com `acceptedAt`) não muda. Sem o mapa do
 * design system (Painel numa versão anterior à 4.8), fica o nome de antes.
 */
const ACCEPTED_LABEL = (DesignSystem as unknown as {STATUS_LABELS?: Record<string, string>;}).STATUS_LABELS?.['Aceitou, falta marcar'];
const slotLabel = (slot: AgendaFreedSlot) => ACCEPTED_LABEL && slot.statusLabel === 'Aguardando' && offerOf(slot.id)?.acceptedAt ? ACCEPTED_LABEL : slot.statusLabel;

/**
 * L23 (18/11/2026): quem está com "Aviso de vaga" em "Não recebe" (Preferência de contato da Ficha) não recebe a oferta.
 * Devolve a situação gravada ou null. G1 (F-001, v8): lido pelo id do cadastro; o nome pode ser o antigo.
 * L24a: a frase da linha vem do dicionário (`stoppedLine`, motivo com minúscula depois dos dois-pontos).
 */
const blockedOf = (name: string): KindRecord | null => {
  const r = kindOf(clientIdOfRecordedName(name) ?? clientIdFromName(name), 'vaga');
  return r.status === 'nao-recebe' ? r : null;
};
const firstOf = (name?: string | null) => (name ?? '').split(' ')[0];
const nameOf = (id: string) => agendaProfessionalOf(id)?.name ?? id;
const dm = (iso?: string) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';

/**
 * Lista de espera e vagas liberadas (W1, 11/11/2026, decisões do Christian 15 a 20).
 * - A fila mostra a preferência de cada pedido em uma linha (dias · período · datas).
 * - As vagas vêm de cancelamentos e remarcações, de hoje e de qualquer data futura, agrupadas por dia. A de outro dia só
 *   aparece quando serve para alguém da fila (`listedSlots`).
 * - A vaga é oferecida a quem a equipe escolher (a tela sugere o primeiro); a equipe chama o cliente pela conversa e
 *   registra a resposta: aceitou (agenda e o pedido sai da fila), recusou ou sem resposta (a vaga volta a "Livre").
 * W3 (11/11/2026, Christian):
 *  - D-A3-4 = b: pedido cujo profissional deixou de fazer o serviço (ou foi arquivado), ou cujo serviço foi arquivado, fica
 *    "Precisa revisar", com o motivo, e não recebe ofertas. "Revisar" abre o próprio pedido (mesmo lugar na fila).
 *  - Todo pedido tem "Editar" (antes só dava para remover e adicionar de novo).
 *  - Pedido vencido (decisão B): linha recolhida "Pedidos vencidos" abaixo da fila, com "Voltar para a fila" (datas novas,
 *    fim da fila) e "Ver conversa".
 *  - Aceite de vaga: UM aviso só ("Vaga preenchida"); o Novo agendamento não mostra o dele (Agenda passa `silentToast`).
 * I4 (12/11/2026, Christian, decisão I1-3): com a automação "Lista de espera" ligada e dentro dos dias e horários de
 * envio (`useAssistantOffers`), quem cuida da oferta é a assistente: o aviso depois de "Oferecer" e o histórico da vaga
 * dizem isso, no lugar de "chame no WhatsApp". Os botões continuam os mesmos (a equipe também pode chamar e registrar).
 * W9c (12/11/2026):
 *  - J-01: quando o pedido sai da fila porque o horário foi marcado ("Agendar agora" ou aceite em outro horário), as
 *    outras ofertas abertas dele fecham (`closeOffersOfServedRequest`).
 *  - J-02 (opção b): com a automação ligada, a vaga que já estava aberta antes de ligar diz "aberta antes de ligar a
 *    automação: ofereça por aqui" e continua perguntando para quem oferecer.
 *  - J-03 (opção a): com a assistente cuidando da oferta, a mensagem da vaga entra na conversa como enviada por ela
 *    (`postAssistantOffer`); a conversa não muda de dono.
 *  - Decisão do Christian (opção b): cliente em "Aguardando você" não recebe a oferta pela assistente; quando a equipe
 *    escolhe essa pessoa, quem chama é a equipe e a janela diz o porquê (`waitingForTeam`).
 * P2 (13/11/2026, facilidade de uso): o painel virou o conteúdo da aba "Lista de espera" da Agenda (antes ficava abaixo
 *  do calendário). No computador, fila e "Vagas liberadas" ficam lado a lado, para as etiquetas Livre / Aguardando /
 *  Preenchida aparecerem sem rolar. O cartão de quem tem oferta aberta mostra a etiqueta da vaga (mesmo texto e cor da
 *  vaga) e uma linha com o dia e a hora. Nada mudou no que cada botão faz.
 * L22e (18/11/2026, DS 6.1): os dois vazios (fila e vagas) usam `EmptyState size="sm" variant="dotted"` no lugar da caixa
 *  tracejada; mesmos textos (primeira frase = título, o resto = descrição).
 */
export function WaitlistPanel({ onSchedule }: WaitlistPanelProps) {
  const toast = useToast();
  const openConversation = useOpenConversation();
  // Reage ao pedido de saída registrado na Ficha (mesma fonte de Clientes, Retornos e Oportunidades)
  useContactBlocks();
  // W9c: quem está em "Aguardando você" muda o que a janela da vaga diz; redesenha quando as conversas mudam.
  useConversations();
  // Revisão v3: arquivar, renomear ou mudar "Quem faz" em Serviços e equipe recalcula quem pode receber oferta na hora.
  useServices();
  // Shared with Conversas (the client summary shows the same list)
  const { waitlist: entries, appointments, expired } = useAgendaData();
  const setEntries = setWaitlist;
  useSlotOffers();
  // R3 (06/11/2026, Christian, A-16): redesenha quando o Funcionamento muda; fechada hoje = ofertas de vaga de hoje suspensas.
  const team = useTeam();
  const closedToday = !clinicDay(TODAY_ISO, { hours: team.hours, blocks: team.blocks }).open;
  const automationOn = !!useSavedStore(automacoesStore).enabled['lista-espera'];
  const assistantOffers = useAssistantOffers();
  const slots: AgendaFreedSlot[] = listedSlots(appointments, entries, nameOf);
  const [adding, setAdding] = useState(false);
  /** W3: pedido aberto no formulário para editar (mesmo lugar) ou renovar (vencido → fim da fila). */
  const [editing, setEditing] = useState<{entry: AgendaWaitlistEntry;mode: 'editar' | 'renovar';} | null>(null);
  const [expiredOpen, setExpiredOpen] = useState(false);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AgendaWaitlistEntry | null>(null);
  const [cancellingSlot, setCancellingSlot] = useState<AgendaFreedSlot | null>(null);
  const [chat, setChat] = useState<(WaitlistChatTarget & {slotId: string;}) | null>(null);

  const openEntry = entries.find((e) => e.id === openEntryId) ?? null;
  const openSlot = slots.find((s) => s.id === openSlotId) ?? null;
  // Regra única (data/waitlistOffer.ts): quem pode, já ordenado pela preferência, e quem não pode, com o motivo.
  const ranked = openSlot ? rankOffer(openSlot, entries, appointments) : { candidates: [], excluded: [] };
  const slotStarted = openSlot ?
  (() => {
    const src = slotSourceOf(openSlot, appointments);
    return !src || src.iso === TODAY_ISO && toMinutes(src.start) <= toMinutes(NOW);
  })() :
  false;
  const openEntryBlock = openEntry ? blockedOf(openEntry.clientName) : null;
  /** W9c (J-02): com a automação ligada, vaga livre que já estava aberta antes de ligar continua com a equipe. */
  const teamSlot = (slot: AgendaFreedSlot) => automationOn && slot.statusLabel === 'Livre' && openedBeforeAutomation(slot.id);

  /** Pedido que recebeu a oferta desta vaga (pelo id gravado na oferta; senão, pelo nome). */
  const entryOfOffer = (slot: AgendaFreedSlot) => {
    const offer = offerOf(slot.id);
    return entries.find((e) => e.id === offer?.entryId) ?? entries.find((e) => e.clientName === slot.offeredTo);
  };

  /** P2: vaga com oferta ABERTA (aguardando) para este pedido, se houver. Lê o que já está gravado; nada é inventado. */
  const openOfferSlotOf = (entry: AgendaWaitlistEntry) =>
  slots.find((s) => {
    const o = offerOf(s.id);
    if (!o || o.status !== 'aguardando') return false;
    return o.entryId ? o.entryId === entry.id : o.offeredTo === entry.clientName;
  }) ?? null;

  const remove = (entry: AgendaWaitlistEntry) => {
    // Oferta em andamento para este pedido deixa de valer junto com ele.
    slots.filter((s) => s.statusLabel === 'Aguardando' && offerOf(s.id)?.entryId === entry.id).forEach((s) => cancelOffer(s.id));
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    toast({ title: 'Removido da lista de espera', description: entry.clientName, tone: 'info' });
  };

  const renderEntry = (entry: AgendaWaitlistEntry, i: number) => {
    const block = blockedOf(entry.clientName);
    const review = reviewReasonOf(entry);
    const offerSlot = openOfferSlotOf(entry);
    const accepted = !!(offerSlot && offerOf(offerSlot.id)?.acceptedAt);
    return (
      <li key={entry.id} className={rowItem}>
        <button type="button" onClick={() => setOpenEntryId(entry.id)} aria-label={`Ver detalhes do pedido de ${entry.clientName}`} className={rowButton}>
          <span className="mt-0.5 w-5 shrink-0 text-xs font-bold tabular-nums text-text-muted">{i + 1}º</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-text-primary">{entry.clientName}</span>
              {review && <StatusPill tone="warning" label="Precisa revisar" />}
              {offerSlot && <StatusPill tone={slotTone(String(offerSlot.status))} label={slotLabel(offerSlot)} />}
            </span>
            {offerSlot &&
            <span className="mt-0.5 block text-sm font-semibold text-text-primary">
                Vaga {slotDayPhrase(offerSlot.iso)}, às {offerSlot.time} · {accepted ? 'aceitou, falta marcar' : 'aguardando a resposta'}
              </span>
            }
            <span className="mt-0.5 block text-sm text-text-secondary">
              {entry.service} · {entry.professional}
            </span>
            <span className="mt-0.5 block text-sm text-text-secondary">Prefere: {preferenceLabel(entry)}</span>
            {review && <span className="mt-0.5 block text-xs font-semibold text-warning">Não recebe ofertas de vaga até alguém revisar: {review}.</span>}
            {block && <span className="mt-0.5 block text-xs font-semibold text-warning">{stoppedLine('vaga', block)}</span>}
          </span>
          <ChevronRightIcon className="h-4 w-4 shrink-0 self-center text-text-muted" aria-hidden="true" />
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {/* W3: Editar todo pedido; "Revisar" (mesmo formulário) quando o pedido precisa de revisão. Mantém o lugar na fila. */}
          <Button size="sm" variant={review ? 'secondary' : 'neutral'} onClick={() => setEditing({ entry, mode: 'editar' })} aria-label={`${review ? 'Revisar' : 'Editar'} o pedido de ${entry.clientName}`}>
            {review ? 'Revisar' : 'Editar'}
          </Button>
          <IconButton
            size="sm"
            tone="danger"
            aria-label={`Remover ${entry.clientName} da lista`}
            onClick={() => setRemoving(entry)}
            icon={<XIcon className="h-4 w-4" aria-hidden="true" />} />
          
        </div>
      </li>);

  };

  const renderSlot = (slot: AgendaFreedSlot) =>
  <li key={slot.id} className={rowItem}>
      <button type="button" onClick={() => setOpenSlotId(slot.id)} aria-label={`Ver detalhes da vaga de ${slotDayPhrase(slot.iso).replace(/^n[ao] /, '')}, às ${slot.time}, com ${slot.professional}`} className={rowButton}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold tabular-nums text-text-primary">
            {slot.time} · {slot.professional}
          </span>
          <span className="mt-0.5 block text-sm text-text-secondary">{teamSlot(slot) ? `${slot.detail} · aberta antes de ligar a automação: ofereça por aqui` : slot.detail}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 self-center">
          <StatusPill tone={slotTone(String(slot.status))} label={slotLabel(slot)} />
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        </span>
      </button>
    </li>;


  return (
    <Card as="section" padding="lg" aria-labelledby="lista-espera-titulo" className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="lista-espera-titulo" className="text-base font-bold text-text-primary">
            Lista de espera
          </h2>
          <CountBadge count={entries.length} label="aguardando" />
        </div>

        {entries.length === 0 ?
        <EmptyState size="sm" variant="dotted" title="Ninguém na lista de espera." description="Quem pedir para ser avisado de uma vaga aparece aqui, na ordem do pedido." /> :

        <ScrollList ariaLabel="Pessoas na lista de espera" className="flex flex-col gap-2.5">
            {entries.map((entry, i) => renderEntry(entry, i))}
          </ScrollList>
        }

        {/* Adicionar fica junto da LISTA DE ESPERA: vaga liberada não se cria à mão (decisão do Christian, 16/10/2026) */}
        <Button variant="secondary" size="md" fullWidth leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setAdding(true)} className="mt-0.5">
          Adicionar à lista
        </Button>

        {/* W3 (pedido vencido, decisão B): fora da fila, recolhido, com como trazer de volta. */}
        {expired.length > 0 &&
        <div className="flex flex-col gap-2">
            <Button
            size="sm"
            variant="neutral"
            aria-expanded={expiredOpen}
            onClick={() => setExpiredOpen((v) => !v)}
            className="self-start"
            leftIcon={<ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${expiredOpen ? 'rotate-180' : ''}`} />}>
            
              Pedidos vencidos · {expired.length}
            </Button>
            {expiredOpen &&
          <>
                <p className="text-xs text-text-secondary">A data “Até” passou e o pedido saiu da fila sozinho. Não recebe ofertas de vaga. Para valer de novo, use “Voltar para a fila” e escolha as datas novas.</p>
                <ul className="flex flex-col gap-2">
                  {expired.map((e) =>
              <li key={e.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-text-primary">{e.clientName}</span>
                        <StatusPill tone="neutral" label="Vencido" />
                      </span>
                      <span className="text-sm text-text-secondary">
                        {e.service} · {e.professional} · pedia até {dm(e.untilIso)} · venceu em {dm(e.expiredOn)}
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing({ entry: e, mode: 'renovar' })}>
                          Voltar para a fila
                        </Button>
                        <Button size="sm" variant="neutral" leftIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={() => openConversation({ name: e.clientName })}>
                          Ver conversa
                        </Button>
                      </span>
                    </li>
              )}
                </ul>
              </>
          }
          </div>
        }
      </div>

      {/* P2: ao lado da fila no computador (borda à esquerda); embaixo dela no celular (borda em cima). */}
      <section aria-labelledby="vagas-liberadas-titulo" className="flex min-w-0 flex-col gap-2.5 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <div className="flex items-center gap-1.5">
          <h3 id="vagas-liberadas-titulo" className="text-base font-bold text-text-primary">
            Vagas liberadas
          </h3>
          {/* P2 (regra de uma frase): o resto da explicação no "i". L4 (decisão 9 do piloto): a frase da automação saiu do
               "i"; ela já está na janela de cada vaga (quem chama o cliente: a equipe ou a assistente). */}
          <InfoTip
            label="vaga liberada"
            content="Vaga de outro dia só aparece quando serve para alguém da lista. Vaga que caiu numa folga, num bloqueio ou fora do horário sai da lista." />
          
        </div>
        <p className="-mt-1 text-xs text-text-secondary">Horários que ficaram livres por cancelamento ou remarcação, de hoje em diante.</p>
        {slots.length === 0 ?
        <EmptyState size="sm" variant="dotted" title="Nenhuma vaga liberada agora." /> :

        <ScrollList ariaLabel="Vagas liberadas" className="flex flex-col gap-2.5">
            {slots.flatMap((slot, i) => [
          ...(i === 0 || slots[i - 1].iso !== slot.iso ?
          [
          <li key={`dia-${slot.iso}`} className="pt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {slotDayTitle(slot.iso)}
                    </li>] :

          []),
          renderSlot(slot)]
          )}
          </ScrollList>
        }
      </section>

      <ListaEsperaModal open={adding} onClose={() => setAdding(false)} onSaved={(entry) => setEntries((list) => [...list, { id: `w${Date.now()}`, ...entry }])} />

      {/* W3: o mesmo formulário para editar (mesmo lugar na fila) e para trazer de volta um pedido vencido (fim da fila). */}
      <ListaEsperaModal
        open={!!editing}
        mode={editing?.mode}
        editing={editing?.entry ?? null}
        onClose={() => setEditing(null)}
        onSaved={(data) => {
          if (!editing) return;
          if (editing.mode === 'renovar') restoreExpired(editing.entry.id, { ...editing.entry, ...data, id: editing.entry.id });else
          setEntries((list) => list.map((e) => e.id === editing.entry.id ? { ...e, ...data, id: e.id } : e));
        }} />
      

      <WaitlistEntryModal
        entry={openEntry}
        position={openEntry ? entries.indexOf(openEntry) + 1 : 0}
        contactNote={openEntryBlock ? kindReason('vaga', openEntryBlock) ?? undefined : undefined}
        onClose={() => setOpenEntryId(null)}
        onConversation={(entry) => {
          setOpenEntryId(null);
          openConversation({ name: entry.clientName });
        }}
        onRemove={(entry) => {
          setOpenEntryId(null);
          setRemoving(entry);
        }}
        onSchedule={(entry) => {
          setOpenEntryId(null);
          onSchedule?.(
            {
              client: entry.clientName,
              // Revisão v3: só serviço ATIVO vem preenchido (o renomeado vem pelo nome atual); senão a pessoa escolhe.
              service: activeServiceOf(entry.service)?.value,
              professional: professionalByLabel(entry.professional)?.value
            },
            () => {
              // W9c (J-01): o pedido foi atendido; as ofertas de vaga abertas dele fecham e as vagas voltam a "Livre".
              closeOffersOfServedRequest(entry.id, entry.clientName);
              setEntries((list) => list.filter((e) => e.id !== entry.id));
              toast({ title: 'Agendamento criado', description: `${entry.clientName} já tem horário marcado e saiu da lista de espera.` });
            }
          );
        }} />
      

      <FreedSlotModal
        slot={openSlot}
        candidates={openSlot?.statusLabel === 'Livre' ? ranked.candidates : []}
        excluded={ranked.excluded.filter((x) => x.entry.clientName !== openSlot?.offeredTo || openSlot?.statusLabel === 'Livre')}
        offerStatus={openSlot ? offerOf(openSlot.id)?.status ?? null : null}
        slotStarted={slotStarted}
        closedToday={closedToday}
        openedBefore={!!openSlot && teamSlot(openSlot)}
        teamCalls={!!openSlot?.offeredTo && waitingForTeam(openSlot.offeredTo)}
        onClose={() => setOpenSlotId(null)}
        onConversation={(slot) => {
          setOpenSlotId(null);
          // Conversa de quem recebeu a oferta desta vaga (o botão só aparece quando há alguém).
          if (slot.offeredTo) openConversation({ name: slot.offeredTo });
        }}
        onOffer={(slot, entry) => {
          // Revisão v3: confere de novo NA HORA do clique (serviço arquivado/renomeado ou Quem faz mudou depois de abrir).
          if (!entries.some((e) => e.id === entry.id) || !canReceiveOffer(slot, entry, appointments)) {
            toast({ title: 'Oferta não registrada', description: 'O pedido deixou de servir para esta vaga (serviço, profissional ou horário mudou). Nada foi enviado.', tone: 'warning' });
            return;
          }
          // Nova oferta = transição EXPLÍCITA. Com a automação desligada nada é enviado sozinho: a equipe chama o cliente (17-A).
          simulateOffer(slot.id, entry.clientName, entry.id);
          // I4 + W9c (J-03): com a automação ligada, a mensagem da vaga sai pela assistente e entra na conversa, que não muda de dono.
          const first = firstOf(entry.clientName);
          if (assistantOffers && postAssistantOffer({ clientName: entry.clientName, service: entry.service, iso: slot.iso, time: slot.time, professional: slot.professional })) {
            updateOffer(slot.id, (cur) => ({
              ...cur,
              detail: `oferta para ${first} · a assistente cuida da oferta`,
              events: cur.events.map((ev, i) => i === cur.events.length - 1 ? { ...ev, text: `Oferta registrada para ${entry.clientName}. A assistente mandou a mensagem da vaga na conversa` } : ev)
            }));
            toast({ title: `Oferta registrada para ${first}`, description: `A assistente mandou a mensagem da vaga na conversa de ${first}. Se ${first} aceitar e o horário continuar livre, ela marca sozinha e avisa no sino.` });
            return;
          }
          // W9c (decisão do Christian, opção b): cliente esperando resposta da equipe não recebe a oferta pela assistente.
          const why = assistantOffers && waitingForTeam(entry.clientName) ? `${first} está esperando resposta da equipe na conversa, então a assistente não manda a oferta. ` : '';
          toast({ title: `Oferta registrada para ${first}`, description: `${why}Agora chame ${first} no WhatsApp. A vaga fica “Aguardando” até você registrar a resposta.` });
        }}
        onCall={(slot) => {
          if (!slot.offeredTo) return;
          const id = clientIdOfRecordedName(slot.offeredTo);
          const client = id ? clientById(id) : null;
          if (!client) {
            toast({ title: 'Cliente não encontrado', description: `${slot.offeredTo} não está no cadastro de clientes.`, tone: 'warning' });
            return;
          }
          ensureConversation(client.id, client.name);
          setOpenSlotId(null);
          setChat({ slotId: slot.id, clientId: client.id, offer: { clientName: client.name, service: entryOfOffer(slot)?.service ?? 'o serviço que você pediu', iso: slot.iso, time: slot.time, professional: slot.professional } });
        }}
        onAccepted={(slot) => {
          const entry = entryOfOffer(slot);
          const who = slot.offeredTo ?? '';
          setOpenSlotId(null);
          // O cliente aceitou: Novo agendamento já preenchido com o horário da vaga (mesmo padrão do "Agendar agora" do pedido).
          onSchedule?.(
            {
              client: who,
              service: entry ? activeServiceOf(entry.service)?.value : undefined,
              professional: slot.professionalId,
              date: slot.iso,
              time: slot.time
            },
            () => {
              // Marcado no horário da vaga → a Agenda já gravou "aceita" e tirou o pedido da fila (data/agendaLive.ts).
              // W3: este é o ÚNICO aviso do aceite (o Novo agendamento não mostra "Agendamento criado").
              if (offerOf(slot.id)?.status === 'aceita') {
                toast({ title: 'Vaga preenchida', description: `${who} marcado(a) ${slotDayPhrase(slot.iso)} às ${slot.time} com ${slot.professional}. O pedido saiu da lista de espera.` });
                return;
              }
              // Marcado em OUTRO horário: a oferta desta vaga é encerrada e o pedido sai da fila do mesmo jeito.
              closeOfferBookedElsewhere(slot.id);
              // W9c (J-01): as outras ofertas abertas do mesmo pedido também fecham.
              closeOffersOfServedRequest(entry?.id ?? offerOf(slot.id)?.entryId ?? null, who);
              if (entry) setEntries((list) => list.filter((e) => e.id !== entry.id));
              toast({ title: 'Agendamento criado em outro horário', description: `O pedido de ${who} saiu da lista de espera e a vaga das ${slot.time} voltou a ficar livre.`, tone: 'info' });
            }
          );
        }}
        onDecline={(slot, kind) => {
          const who = firstOf(slot.offeredTo);
          declineOffer(slot.id, kind);
          toast({
            title: kind === 'recusou' ? `Resposta registrada: ${who} recusou` : `Registrado: ${who} não respondeu`,
            description: 'A vaga voltou a ficar livre e o pedido continua na lista de espera. Veja abaixo a próxima pessoa sugerida.',
            tone: 'info'
          });
        }}
        onCancelOffer={(slot) => {
          setOpenSlotId(null);
          setCancellingSlot(slot);
        }} />
      

      <WaitlistConversationPanel
        target={chat}
        onClose={() => {
          // Fechar a conversa volta para a vaga, onde a resposta é registrada.
          if (chat) setOpenSlotId(chat.slotId);
          setChat(null);
        }}
        onSent={(how) => chat && noteOfferContact(chat.slotId, how)} />
      

      <ConfirmDialog
        open={!!removing}
        danger
        title="Remover da lista de espera?"
        description={removing ? `${removing.clientName} sai da lista e deixa de ser considerado nas ofertas de vaga para ${removing.service.toLowerCase()}.` : undefined}
        confirmLabel="Remover da lista"
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)} />
      

      <ConfirmDialog
        open={!!cancellingSlot}
        title="Cancelar a oferta desta vaga?"
        description={
        cancellingSlot ?
        `${cancellingSlot.offeredTo ?? 'Quem recebeu a oferta'} não poderá mais aceitar o horário das ${cancellingSlot.time}. A vaga fica livre na agenda e o pedido continua na lista de espera.` :
        undefined
        }
        confirmLabel="Cancelar oferta"
        onClose={() => setCancellingSlot(null)}
        onConfirm={() => {
          if (!cancellingSlot) return;
          // G3 (F-045): muda SÓ a oferta; o agendamento cancelado e a Agenda continuam como estão.
          cancelOffer(cancellingSlot.id);
          toast({ title: 'Oferta cancelada', description: `O horário das ${cancellingSlot.time} ficou livre na agenda.`, tone: 'info' });
        }} />
      
    </Card>);

}