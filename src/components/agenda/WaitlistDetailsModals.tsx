import { wordsNow } from '../../data/segment';
import React, { useEffect, useRef, useState } from 'react';
import { CalendarCheckIcon, CalendarClockIcon, ClockIcon, ListOrderedIcon, MessageCircleIcon, SparklesIcon, UserIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { Button } from '../Button';
import { StatusBadge } from '../StatusBadge';
import * as DesignSystem from '../Card';
import { ChoiceCards, Dropdown, InfoTip, labelValueIconClass, labelValueItemClass } from '../Card';
import { NoticeInline } from '../ui/Notice';
import { serviceByLabel, serviceUseIssue } from '../../data/catalogo';
import type { AgendaFreedSlot, AgendaWaitlistEntry } from '../../data/agenda';
import { NOW, TODAY_ISO } from '../../data/agendaStore';
import { automacoesStore } from '../../data/automacoes';
import { useSavedStore } from '../../data/iaConfigStore';
import { offerOf } from '../../data/freedSlots';
import { offerDeadlineLabel, preferenceLabel, slotDayPhrase, slotDayTitle } from '../../data/waitlistPrefs';
import { DEFAULT_SEND_WINDOWS, addInsideWindow, insideWindow, momentStamp, windowText } from '../../data/sendWindows';
import type { OfferCandidate, OfferExcluded } from '../../data/waitlistOffer';
import { stoppedTitle } from '../../data/contactPreferences';

/**
 * One label/value line used inside the details dialogs.
 * RV13 (20/11/2026): receita de rótulo e valor do DS 6.5 (`labelValueItemClass`/`labelValueIconClass`); o item sem ícone
 * ("Situação") usa só a classe do item e fica alinhado com os outros.
 */
function DetailRow({ icon, label, children }: {icon: React.ReactNode;label: string;children: React.ReactNode;}) {
  return (
    <div className={labelValueItemClass()}>
      <span className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true">
        {icon}
      </span>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="break-words text-sm font-semibold text-text-primary">{children}</dd>
    </div>);

}

const icon = 'h-4 w-4';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstOf = (name?: string | null) => (name ?? '').split(' ')[0];

/**
 * L5 (16/11/2026): etiqueta "Falta marcar" do design system (v4.8, `STATUS_LABELS['Aceitou, falta marcar']`), a mesma da
 * lista "Vagas liberadas". Lida pelo pacote inteiro para não quebrar se o Painel estiver numa versão anterior do DS.
 */
const FALTA_MARCAR: string = (DesignSystem as unknown as {STATUS_LABELS?: Record<string, string>;}).STATUS_LABELS?.['Aceitou, falta marcar'] ?? 'Falta marcar';

/** L3: primeira frase visível; o resto vai para o "i" (nada é apagado). */
function splitFirstSentence(text: string): [string, string] {
  const i = text.search(/\.\s/);
  if (i < 0) return [text, ''];
  return [text.slice(0, i + 1), text.slice(i + 2).trim()];
}

/** Como terminou a última oferta de uma vaga que voltou a ficar livre (linha "Última oferta"). */
const LAST_OFFER: Record<string, string> = {
  recusada: 'recusou',
  'sem-resposta': 'não respondeu',
  cancelada: 'oferta cancelada',
  encerrada: 'oferta encerrada',
  aceita: 'aceitou; depois o horário ficou livre de novo'
};

/**
 * Texto fixo (FD2): a lista é pedido do próprio cliente; a oferta automática fica desligada até as regras de autorização
 * serem validadas. W1 (11/11/2026, decisão 17-A): com ela desligada, é a EQUIPE que chama o cliente.
 */
export const WAITLIST_SIMULATION_NOTE =
'A oferta automática de vagas é a automação “Lista de espera”, que está desligada. Enquanto ela estiver desligada, a equipe oferece a vaga por aqui e chama o cliente no WhatsApp.';

/**
 * W9c (12/11/2026, J-02 opção b e J-08, decisão I1-3): o que passa a acontecer com a automação "Lista de espera" ligada.
 * Mesma frase na Lista de espera (Vagas liberadas) e na janela do pedido.
 */
export const WAITLIST_AUTOMATION_ON_NOTE =
'A automação “Lista de espera” está ligada: a assistente oferece sozinha as vagas que abrem depois que ela foi ligada. Se o cliente aceitar e o horário continuar livre, a assistente marca sozinha e avisa a equipe no sino. As vagas que já estavam abertas continuam com a equipe.';

/**
 * W1 (decisão 18): quem age e qual é o prazo, lido de IA Orniplaty › Automações › "Oferecer vaga para a lista de espera".
 * O prazo escolhido lá é o que aparece aqui (vaga de hoje em minutos; de outro dia em horas). Sem cronômetro no protótipo.
 * W8 (12/11/2026, passo 4): o prazo só conta nos dias e horários que a clínica salvou para as mensagens de horário marcado
 * (`send.appointments`, data/sendWindows.ts). A nota diz até quando vale uma oferta feita agora (`addInsideWindow`, nunca
 * depois do início da vaga). Fora desses dias e horários a oferta não sai: a nota diz que a equipe chama o cliente.
 * I4 (12/11/2026, Christian, opção b da seção 9 do W8): quando o prazo é cortado pelo começo da vaga, a nota diz "vale
 * até o início da vaga, às HH:MM" (antes dizia o dia e a hora, o que parecia passar do fim da faixa de envio).
 */
function useWaitlistAutomationNote(slot: AgendaFreedSlot | null) {
  const auto = useSavedStore(automacoesStore);
  const iso = slot?.iso ?? TODAY_ISO;
  const deadline = offerDeadlineLabel(iso, auto.values);
  if (!auto.enabled['lista-espera']) return `${WAITLIST_SIMULATION_NOTE} Se você ligar a automação, cada oferta desta vaga passa a valer por ${deadline} (prazo definido em IA Orniplaty › Automações).`;
  const w = (auto.send ?? DEFAULT_SEND_WINDOWS).appointments;
  const now = { iso: TODAY_ISO, time: NOW };
  if (!insideWindow(w, now))
  return `A automação “Lista de espera” está ligada, mas agora está fora dos dias e horários das mensagens de horário marcado (${windowText(w)}): a oferta desta vaga não sai sozinha e a equipe chama o cliente. Dentro desses dias e horários, cada oferta vale por ${deadline}. O prazo e os horários são definidos em IA Orniplaty › Automações.`;
  const minutes = iso === TODAY_ISO ? auto.values['prazo-hoje'] ?? 30 : (auto.values['prazo-outro-dia'] ?? 2) * 60;
  let end = addInsideWindow(w, now, minutes);
  const slotStart = slot ? { iso: slot.iso, time: slot.time } : null;
  const cut = !!slotStart && momentStamp(end) > momentStamp(slotStart);
  if (cut && slotStart) end = slotStart;
  const day = slotDayPhrase(end.iso);
  const dayText = day === 'hoje' || day === 'amanhã' ? day : slotDayTitle(end.iso).toLowerCase();
  // Vaga que já começou: não há oferta nova para datar.
  const until = slotStart && momentStamp(slotStart) <= momentStamp(now) ? '' : cut ? ` Uma oferta feita agora vale até o início da vaga, às ${end.time}.` : ` Uma oferta feita agora vale até ${dayText} às ${end.time}.`;
  return `A automação “Lista de espera” está ligada: cada oferta desta vaga vale por ${deadline}, contados só ${windowText(w)}, e nunca passa do início da vaga.${until} Sem resposta nesse prazo, a vaga passa para a próxima pessoa. O prazo é definido em IA Orniplaty › Automações.`;
}

/**
 * I4 (12/11/2026, Christian, decisão I1-3): quem cuida de uma oferta em andamento. Com a automação "Lista de espera"
 * ligada e dentro dos dias e horários das mensagens de horário marcado, é a ASSISTENTE: a mensagem sai por ela e, se o
 * cliente aceitar, ela marca sozinha (data/waitlistAutoBooking.ts). Desligada, ou fora desses dias e horários, é a equipe.
 */
export function useAssistantOffers() {
  const auto = useSavedStore(automacoesStore);
  return !!auto.enabled['lista-espera'] && insideWindow((auto.send ?? DEFAULT_SEND_WINDOWS).appointments, { iso: TODAY_ISO, time: NOW });
}

type WaitlistEntryModalProps = {
  entry: AgendaWaitlistEntry | null;
  /** Position in the queue, starting at 1 */
  position: number;
  /** Quando o cliente pediu para não receber mensagens: explica por que ele não recebe ofertas */
  contactNote?: string;
  onClose: () => void;
  onSchedule: (entry: AgendaWaitlistEntry) => void;
  onConversation: (entry: AgendaWaitlistEntry) => void;
  onRemove: (entry: AgendaWaitlistEntry) => void;
};

/**
 * Details of one person on the waiting list and what can be done with the request.
 * L3 (16/11/2026, facilidade de uso): o aviso do pedido mostra uma frase; o resto (preferência e automação) foi para o "i".
 * L24a (18/11/2026): o aviso de contato tem o título do dicionário ("Não recebe aviso de vaga").
 */
export function WaitlistEntryModal({ entry, position, contactNote, onClose, onSchedule, onConversation, onRemove }: WaitlistEntryModalProps) {
  const service = entry ? serviceByLabel(entry.service) : undefined;
  // Revisão v3: serviço do pedido arquivado ou fora do catálogo não recebe oferta; agendar exige escolher um serviço ativo.
  const serviceIssue = entry ? serviceUseIssue(entry.service) : null;
  const auto = useSavedStore(automacoesStore);
  return (
    <AppModal
      open={!!entry}
      onClose={onClose}
      title={entry?.clientName ?? ''}
      description="Pedido na lista de espera"
      footer={
      entry &&
      <ModalActions equal={3}>
            <Button variant="dangerSoft" onClick={() => onRemove(entry)}>
              Remover da lista
            </Button>
            <Button variant="secondary" leftIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={() => onConversation(entry)}>
              Ver conversa
            </Button>
            <Button leftIcon={<CalendarClockIcon className="h-4 w-4" />} onClick={() => onSchedule(entry)}>
              Agendar agora
            </Button>
          </ModalActions>

      }>
      
      {entry &&
      <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailRow icon={<SparklesIcon className={icon} />} label="Serviço">
              {entry.service}
              {service && <span className="block text-sm font-normal text-text-secondary">{service.minutes} min · R$ {service.price.toLocaleString('pt-BR')},00</span>}
            </DetailRow>
            <DetailRow icon={<UserIcon className={icon} />} label="Profissional">
              {cap(entry.professional)}
            </DetailRow>
            <DetailRow icon={<ClockIcon className={icon} />} label="Quando prefere">
              {cap(preferenceLabel(entry))}
              {entry.note && <span className="block text-sm font-normal text-text-secondary">Observação: {entry.note}</span>}
            </DetailRow>
            <DetailRow icon={<ListOrderedIcon className={icon} />} label="Posição na fila">
              {position}º de quem está esperando
            </DetailRow>
          </dl>
          <NoticeInline tone="info">
            Pedido do próprio cliente, que quer ser avisado quando surgir uma vaga.{' '}
            <InfoTip
            label="este aviso"
            content={`Quando a vaga combina com a preferência, este pedido passa na frente; ninguém fica de fora por causa da preferência. ${auto.enabled['lista-espera'] ? WAITLIST_AUTOMATION_ON_NOTE : WAITLIST_SIMULATION_NOTE}`} />
          
          </NoticeInline>
          {serviceIssue &&
        <NoticeInline tone="warning" title="Não recebe ofertas de vaga">
              {serviceIssue} Em "Agendar agora", escolha o serviço que a pessoa quer agora.
            </NoticeInline>
        }
          {contactNote &&
        <NoticeInline tone="warning" title={stoppedTitle('vaga')}>
              {cap(contactNote)}. Se ele pedir um horário, {wordsNow().the} ainda pode agendar normalmente.
            </NoticeInline>
        }
        </div>
      }
    </AppModal>);

}

type FreedSlotModalProps = {
  slot: AgendaFreedSlot | null;
  /** W1 (decisão 20-B): quem pode receber a vaga, já ordenado (o primeiro é o sugerido). Só para vaga Livre. */
  candidates?: OfferCandidate[];
  /** Quem não pode receber esta vaga, com o motivo. */
  excluded?: OfferExcluded[];
  /** Situação da última oferta desta vaga (data/freedSlots.ts). */
  offerStatus?: string | null;
  /** O horário da vaga já começou (não dá mais para oferecer). */
  slotStarted?: boolean;
  /** R3 (06/11/2026, Christian, A-16): a clínica está fechada hoje; as ofertas de vaga de hoje ficam suspensas. */
  closedToday?: boolean;
  /** W9c (J-02): com a automação ligada, esta vaga já estava aberta antes de ligar: quem oferece é a equipe. */
  openedBefore?: boolean;
  /**
   * W9c (decisão do Christian, opção b): quem recebeu a oferta está em "Aguardando você" (esperando resposta da
   * equipe). A assistente não manda a oferta para ele: quem chama é a equipe, mesmo com a automação ligada.
   */
  teamCalls?: boolean;
  onClose: () => void;
  /** Oferecer a vaga à pessoa escolhida. */
  onOffer: (slot: AgendaFreedSlot, entry: AgendaWaitlistEntry) => void;
  onCancelOffer: (slot: AgendaFreedSlot) => void;
  /** "Ver conversa" de quem recebeu a oferta (vaga já resolvida). */
  onConversation: (slot: AgendaFreedSlot) => void;
  /** W1 (decisão 17-A): abre a conversa ao lado, com a mensagem da oferta pronta. */
  onCall: (slot: AgendaFreedSlot) => void;
  /** W1: o cliente aceitou → abre o Novo agendamento já preenchido. */
  onAccepted: (slot: AgendaFreedSlot) => void;
  /** W1 (decisão 18): a equipe registra "Recusou" ou "Sem resposta". */
  onDecline: (slot: AgendaFreedSlot, kind: 'recusou' | 'sem-resposta') => void;
};

/** L3: tempo em que o botão "Agendar …" não aceita clique logo depois de "Oferecer" (ele nasce no mesmo lugar). */
const JUST_OFFERED_MS = 800;
/**
 * L5 (16/11/2026): hora do último clique em "Oferecer a vaga a …", guardada FORA do componente e gravada no próprio
 * clique (antes de qualquer nova renderização). Um clique em "Agendar …" ou outro "Oferecer" que chega até
 * 0,8 s depois é ignorado no próprio tratador do clique. Vale mesmo se a janela for montada de novo entre os dois cliques.
 */
let lastOfferClickAt = 0;
const tooSoonAfterOffer = () => Date.now() - lastOfferClickAt < JUST_OFFERED_MS;

/**
 * A vaga liberada, do começo ao fim (W1, 11/11/2026): para quem oferecer (sugestão + escolha), quem chama o cliente, como
 * registrar a resposta e o que aconteceu. Aplica na hora: não é formulário (`unsavedGuard={false}`).
 * L3 (16/11/2026, facilidade de uso, só visual):
 *  - Logo depois de "Oferecer a vaga a …", o botão de agendar (que aparece no mesmo lugar) fica 0,8 s sem aceitar
 *    clique (`aria-disabled`), para o segundo clique sem querer não marcar. O fluxo não mudou.
 *  - Quando quem chama é a equipe, o próximo passo é chamar: "Chamar no WhatsApp" vira o botão cheio e o de agendar
 *    fica de contorno. Quando a assistente cuida da oferta, continua como antes.
 *  - Cada aviso com uma frase; o resto no "i".
 * L5 (16/11/2026, só visual):
 *  - Oferta que o cliente já ACEITOU e ainda falta marcar (`acceptedAt` em data/freedSlots.ts): a janela mostra a etiqueta
 *    "Falta marcar" (a mesma da lista), uma frase dizendo que o cliente aceitou e falta marcar, e o botão de agendar como
 *    o único botão cheio. O estado gravado e as ações não mudam.
 *  - O bloqueio do segundo clique também é feito no tratador do clique (`tooSoonAfterOffer`), não só pelo atributo.
 *  - Sugestão da janela de oferta: uma frase; o resto no "i".
 * L24g (19/11/2026, decisão (a) do arquiteto, correcao-L24b §6; só layout):
 *  - Janela na largura `lg` do DS.
 *  - Rodapé da oferta em andamento numa linha, à direita, principal por último:
 *    `[Registrar resposta ▾] [Chamar no WhatsApp] [Agendar {primeiro nome}]` (antes "Registrar resposta" ficava à
 *    esquerda, em `start`, e o principal dizia "{nome} aceitou: agendar"). Ações e regras sem mudança.
 */
export function FreedSlotModal({ slot, candidates = [], excluded = [], offerStatus, slotStarted = false, closedToday = false, openedBefore = false, teamCalls = false, onClose, onOffer, onCancelOffer, onConversation, onCall, onAccepted, onDecline }: FreedSlotModalProps) {
  const note = useWaitlistAutomationNote(slot);
  const [noteHead, noteRest] = splitFirstSentence(note);
  const assistantOffers = useAssistantOffers();
  // W9c: com o cliente em "Aguardando você", a assistente não cuida da oferta (quem chama é a equipe).
  const assistantCares = assistantOffers && !teamCalls;
  const filled = slot?.statusLabel === 'Preenchida';
  const suspended = slot?.statusLabel === 'Suspensa';
  // Oferta em andamento (também quando está suspensa pela clínica fechada: a resposta ainda pode ser registrada).
  const waiting = slot?.statusLabel === 'Aguardando' || suspended && slot?.status === 'warning';
  const free = slot?.statusLabel === 'Livre';
  const today = slot?.iso === TODAY_ISO;
  const offered = firstOf(slot?.offeredTo);
  // Vaga que voltou a ficar livre: a linha mostra a ÚLTIMA oferta e como terminou (não parece oferta em andamento).
  const lastOffer = !!slot?.offeredTo && !waiting && !filled;
  // L5: o cliente já respondeu que aceita e falta marcar (mesma fonte da etiqueta "Falta marcar" da lista).
  const acceptedAt = slot && waiting ? offerOf(slot.id)?.acceptedAt ?? null : null;
  const accepted = !!acceptedAt && !suspended;
  // L5: com o aceite, o próximo passo é marcar; com a assistente cuidando, também.
  const bookIsNext = accepted || assistantCares;

  /** L3: a oferta acabou de ser feita com a janela aberta → trava curta no botão que nasce no lugar do clique. */
  const [justOffered, setJustOffered] = useState(false);
  const lastSeen = useRef<{id?: string;waiting: boolean;}>({ waiting: false });
  useEffect(() => {
    const prev = lastSeen.current;
    lastSeen.current = { id: slot?.id, waiting: !!waiting };
    if (slot && waiting && prev.id === slot.id && !prev.waiting) {
      setJustOffered(true);
      const t = window.setTimeout(() => setJustOffered(false), JUST_OFFERED_MS);
      return () => {
        window.clearTimeout(t);
        setJustOffered(false);
      };
    }
    setJustOffered(false);
    return undefined;
  }, [slot?.id, waiting]);

  // Sugestão = o primeiro da lista ordenada; a equipe pode escolher outra pessoa que também pode (decisão 20-B).
  const ids = candidates.map((c) => c.entry.id).join('|');
  const [chosenId, setChosenId] = useState<string | null>(null);
  useEffect(() => {
    setChosenId(candidates[0]?.entry.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.id, ids]);
  const chosen = candidates.find((c) => c.entry.id === chosenId) ?? candidates[0];
  const top = candidates[0];
  // L5: uma frase visível; o resto da sugestão vai para o "i" (nada é apagado).
  const [suggestionHead, suggestionMore] = top ?
  top.match.full ?
  [`Sugestão: ${firstOf(top.entry.clientName)}, a primeira pessoa da fila que pediu um horário como este.`, 'Você pode escolher outra pessoa.'] :
  [`Sugestão: ${firstOf(top.entry.clientName)}, pela ordem da fila.`, 'Ninguém da fila pediu exatamente este dia e período, então vale a ordem da fila. Você pode escolher outra pessoa.'] :
  ['', ''];
  const suggestion = suggestionHead ?
  <>
      {suggestionHead} <InfoTip label="a sugestão" content={suggestionMore} />
    </> :
  undefined;
  const canPick = free && !slotStarted && candidates.length > 0;
  const tried = excluded.some((x) => x.reason === 'already');
  const noOneReason = !free || canPick ? null : slotStarted ? 'O horário desta vaga já começou.' : tried ? 'Não há outra pessoa na fila para esta vaga.' : 'Ninguém da lista de espera pode receber esta vaga agora.';

  return (
    <AppModal
      open={!!slot}
      onClose={onClose}
      unsavedGuard={false}
      size="lg"
      title={slot ? today ? `Vaga das ${slot.time} · ${slot.professional}` : `Vaga de ${slotDayTitle(slot.iso).toLowerCase()}, ${slot.time} · ${slot.professional}` : ''}
      description={slot?.source === 'remarcacao' ? 'Horário liberado por uma remarcação' : 'Horário liberado por um cancelamento'}
      footer={
      slot && waiting ?
      <ModalActions>
            <Dropdown
          triggerVariant="secondary"
          triggerSize="lg"
          trigger="Registrar resposta"
          align="start"
          items={[
          { id: 'recusou', label: 'Recusou', description: 'A vaga volta a ficar livre e a próxima pessoa é sugerida', onSelect: () => onDecline(slot, 'recusou') },
          { id: 'sem-resposta', label: 'Sem resposta', description: 'Fecha a oferta; a vaga volta a ficar livre', onSelect: () => onDecline(slot, 'sem-resposta') },
          { id: 'sep', type: 'separator' },
          { id: 'cancelar', label: 'Cancelar oferta', description: 'Você desistiu de oferecer a esta pessoa', variant: 'danger', onSelect: () => onCancelOffer(slot) }]
          } />
        
            <Button variant={bookIsNext ? 'secondary' : 'primary'} leftIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={() => onCall(slot)}>
              Chamar no WhatsApp
            </Button>
            <Button
          variant={bookIsNext ? 'primary' : 'secondary'}
          leftIcon={<CalendarCheckIcon className="h-4 w-4" />}
          aria-disabled={justOffered || undefined}
          onClick={() => {
            // L5: o segundo clique de um clique duplo em "Oferecer" cai aqui; é barrado no próprio clique.
            if (justOffered || tooSoonAfterOffer()) return;
            onAccepted(slot);
          }}>
          
              Agendar {offered}
            </Button>
          </ModalActions> :
      slot && canPick && chosen ?
      <ModalActions>
            <Button
          onClick={() => {
            // L5: um segundo "Oferecer" colado no primeiro não registra outra oferta.
            if (tooSoonAfterOffer()) return;
            lastOfferClickAt = Date.now();
            onOffer(slot, chosen.entry);
          }}>
          
              Oferecer a vaga a {firstOf(chosen.entry.clientName)}
            </Button>
          </ModalActions> :
      slot && slot.offeredTo ?
      <ModalActions>
            <Button variant="secondary" leftIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={() => onConversation(slot)}>
              Ver conversa
            </Button>
          </ModalActions> :
      undefined
      }>
      
      {slot &&
      <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailRow icon={<ClockIcon className={icon} />} label="Horário">
              <span className="tabular-nums">
                {slotDayTitle(slot.iso)}, {slot.time}
              </span>
            </DetailRow>
            <DetailRow icon={<UserIcon className={icon} />} label="Profissional">
              {slot.professional}
            </DetailRow>
            <DetailRow icon={<ListOrderedIcon className={icon} />} label={lastOffer ? 'Última oferta' : 'Oferecida a'}>
              {slot.offeredTo ? lastOffer && offerStatus && LAST_OFFER[offerStatus] ? `${slot.offeredTo} (${LAST_OFFER[offerStatus]})` : slot.offeredTo : '—'}
            </DetailRow>
            <div className={labelValueItemClass()}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Situação</dt>
              <dd className="mt-1">
                {/* L5: aceita e ainda não marcada = "Falta marcar", como na lista. "Aguardando" fica só para oferta sem resposta. */}
                <StatusBadge status={accepted ? 'warning' : slot.status} label={accepted ? FALTA_MARCAR : slot.statusLabel} size="sm" />
              </dd>
            </div>
          </dl>

          {/* L5: o cliente já aceitou → a janela diz isso e manda marcar (nada de oferecer de novo). */}
          {waiting && accepted &&
        <NoticeInline tone="warning" role="status" title={`${offered} aceitou a vaga`}>
              {offered} respondeu que aceita às {acceptedAt} e falta marcar o horário na agenda.{' '}
              <InfoTip
            label="este aviso"
            content={`“Agendar ${offered}” abre o agendamento já preenchido. Se ${offered} mudou de ideia, use “Registrar resposta”.`} />
          
            </NoticeInline>
        }
          {/* I4: com a automação ligada (e dentro dos dias e horários de envio), quem cuida da oferta é a assistente. */}
          {waiting && !suspended && !accepted && assistantCares &&
        <NoticeInline tone="info" role="status" title={`Aguardando a resposta de ${offered}. A assistente cuida desta oferta.`}>
              A mensagem da vaga sai pela assistente e aparece na conversa de {offered}.{' '}
              <InfoTip
            label="este aviso"
            content={`Se a conversa está com a equipe, continua com a equipe. Se ${offered} aceitar e o horário continuar livre, a assistente marca sozinha e avisa no sino. Se não der para marcar, a conversa vai para “Aguardando você”. Você também pode chamar ${offered} ou registrar a resposta por aqui.`} />
          
            </NoticeInline>
        }
          {waiting && !suspended && !accepted && !assistantCares &&
        <NoticeInline tone="warning" role="status" title={`Aguardando a resposta de ${offered}. Quem chama é a equipe.`}>
              Chame {offered} no WhatsApp e ofereça este horário: o botão abre a conversa com a mensagem pronta.{' '}
              <InfoTip
            label="este aviso"
            content={`${assistantOffers && teamCalls ? `${offered} está esperando resposta da equipe na conversa, então a assistente não manda a oferta. ` : ''}Depois registre aqui o que ${offered} respondeu: aceitou, recusou ou ficou sem resposta.`} />
          
            </NoticeInline>
        }
          {/* W9c (J-02, opção b): vaga aberta antes de ligar a automação continua com a equipe. */}
          {free && openedBefore && !slotStarted &&
        <NoticeInline tone="info" role="status" title="Aberta antes de ligar a automação: ofereça por aqui">
              Esta já estava aberta, então quem escolhe para quem oferecer é a equipe.{' '}
              <InfoTip
            label="este aviso"
            content={`A assistente só oferece sozinha as vagas que abrem depois que a automação “Lista de espera” foi ligada.${assistantOffers ? ' Depois que você oferecer, a mensagem da vaga sai pela assistente.' : ''}`} />
          
            </NoticeInline>
        }
          {suspended &&
        <NoticeInline tone="warning" role="status" title="Ofertas de vaga suspensas hoje">
              {wordsNow().The} está {wordsNow().closed} hoje.{waiting ? ` A oferta para ${offered} fica parada; se ${offered} já respondeu, registre a resposta.` : ' Nenhuma oferta nova desta vaga pode ser feita hoje.'}
            </NoticeInline>
        }
          {filled && offerStatus === 'aceita' &&
        <NoticeInline tone="success" role="status" title={`${slot.offeredTo} aceitou e está na agenda neste horário`}>
              A vaga foi preenchida e o pedido saiu da lista de espera. O registro fica no histórico abaixo.
            </NoticeInline>
        }
          {filled && offerStatus === 'encerrada' &&
        <NoticeInline tone="info" role="status" title={`A oferta para ${slot.offeredTo} foi encerrada`}>
              Outra pessoa foi marcada neste horário antes da resposta. O pedido de {offered} continua na lista de espera.
            </NoticeInline>
        }

          {canPick &&
        <ChoiceCards
          label="Para quem oferecer esta vaga?"
          helperText={suggestion}
          columns={1}
          value={chosen?.entry.id ?? ''}
          onChange={(v: string) => setChosenId(v)}
          options={candidates.map((c, i) => ({
            value: c.entry.id,
            title: `${c.position}º da fila · ${c.entry.clientName}`,
            badge: i === 0 ? 'Sugerido' : undefined,
            description: `Pediu ${c.entry.service} · ${c.entry.professional} · ${preferenceLabel(c.entry)}. ${c.match.text}${c.entry.note ? ` Observação: ${c.entry.note}.` : ''}`
          }))} />

        }
          {noOneReason &&
        <p role="status" className="text-sm text-text-secondary">
              {noOneReason}
            </p>
        }

          {!filled && excluded.length > 0 &&
        <section aria-label="Quem não pode receber esta vaga">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Não podem receber esta vaga</h3>
              <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                {excluded.map((x) =>
            <li key={x.entry.id}>
                    <span className="font-semibold text-text-primary">{x.entry.clientName}</span>: {x.text}.
                  </li>
            )}
              </ul>
            </section>
        }

          <section aria-label="Histórico da vaga">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Histórico</h3>
            <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
              {slot.events.map((ev, i) =>
            <li key={i} className="relative">
                  <span className="absolute -left-6 ml-0.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary" aria-hidden="true" />
                  <p className="text-sm text-text-primary">
                    <span className="font-bold tabular-nums">{ev.time}</span> · {ev.text}
                  </p>
                </li>
            )}
            </ol>
          </section>

          {!filled &&
        <NoticeInline tone="info">
              {noteHead}
              {noteRest ?
          <>
                  {' '}
                  <InfoTip label="este aviso" content={noteRest} />
                </> :
          null}
            </NoticeInline>
        }
        </div>
      }
    </AppModal>);

}