import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircleIcon, UserIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { Button } from '../Button';
import { StatusBadge } from '../StatusBadge';
import { Textarea } from '../Textarea';
import { DateField } from '../ui/DateField';
import { useToast } from '../ui/Toast';
import { NoticeInline } from '../ui/Notice';
import { cardButtonNeutral } from '../ui/styles';
import { WhatsAppPreview } from '../atendente-ia/WhatsAppPreview';
import { agendaProfessionalOf } from '../../data/availability';
import { allClientsForSelect } from '../../data/api/clientes';
import { useBusinessName } from '../../data/empresa';
import { dataBR } from '../../data/fichaLib';
import { alwaysAnswersText, clientIdFromName, contactBlockOfName, kindOf, stoppedLine, stoppedTitle } from '../../data/contactPreferences';
import { useSavedAutomationMode } from '../../data/automationMode';
import type { AutomationMode } from '../../data/automacoes';
import {
  RETURN_GROUP_LABEL,
  RETURN_GROUP_TONE,
  RETURN_STATUS,
  addDays,
  dismissReturn,
  groupOf,
  markContacted,
  postponeReturn,
  reopenReturn,
  setReturnDate,
  setReturnMessage,
  setReturnReason,
  useReturns } from
'../../data/returns';
import type { ReturnSuggestion } from '../../data/returns';
import { RESPONSE_LABEL, approveReturnContact, contactSubtext, returnMessage, useResponses } from '../../data/returnsFlow';
import type { ClientResponse } from '../../data/returnsFlow';
import { useUndoableReturn } from './ReturnScheduleFlow';

function Row({ label, children }: {label: string;children: React.ReactNode;}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-text-primary">{children}</dd>
    </div>);

}

export const clientIdOf = (name: string) => allClientsForSelect().find((c) => c.name === name)?.id ?? null;

/**
 * Texto editável DENTRO do balão do WhatsApp (MessageBubble do design system). Cresce com o texto, sem borda nem fundo próprio,
 * com anel de foco visível. Desabilitado = mesmo texto, sem esmaecer (regra de contraste).
 */
function BubbleTextEditor({
  value,
  disabled,
  describedBy,
  autoFocus,
  onChange,
  onBlur







}: {value: string;disabled: boolean;describedBy: string;autoFocus?: boolean;onChange: (v: string) => void;onBlur: () => void;}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // "Editar mensagem" na fila abre o detalhe já com o cursor no fim do texto do balão (depois do foco inicial do modal)
  useEffect(() => {
    if (!autoFocus || disabled) return;
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollIntoView({ block: 'nearest' });
    }, 200);
    return () => window.clearTimeout(t);
  }, [autoFocus, disabled]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      aria-label="Mensagem para o cliente"
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="-mx-1 block w-[34rem] max-w-[calc(100%+0.5rem)] resize-none overflow-hidden rounded-[4px] border-0 bg-transparent px-1 py-0 text-sm leading-relaxed text-[#0B2B2A] cursor-text enabled:hover:bg-black/[0.04] focus:outline-none focus-visible:bg-white/60 focus-visible:ring-2 focus-visible:ring-[#0E7490]/60 disabled:cursor-default disabled:text-[#0B2B2A]" />);


}

/** Horário do balão: a mensagem ainda não saiu (nada é enviado de verdade); mostra a situação no lugar da hora. */
function bubbleTime(r: ReturnSuggestion, mode: AutomationMode): string {
  if (groupOf(r.status) === 'chamar') return 'Aguarda aprovação';
  if (r.status === 'contacted' && !r.simulatedSendAt) return 'Não enviada';
  return mode === 'pausado' ? 'Envio pausado' : 'Programada';
}

/**
 * Detalhe de um retorno (fila de Retornos e ficha do cliente). Aqui se edita a mensagem, a data e o motivo.
 * A mensagem aparece como balão do WhatsApp (WhatsAppPreview = MessageThread + MessageBubble do design system), com o texto
 * editável dentro do balão enquanto o retorno está em Para chamar.
 * Ação principal por estado (a mesma do cartão da fila): Para chamar → Aprovar contato · Em contato → Agendar retorno ·
 * opt-out → Agendar a pedido dele · encerrado → Reabrir. Agendar passa pelo fluxo único (`useReturnScheduleFlow`) via `onSchedule`.
 * Aprovar não envia nada; agendar só depois de registrar o aceite. Gatilho de dispensa = dangerOutline; confirmação = danger.
 * L24d (19/11/2026): aviso e selo de quem tem "Avisos de retorno" parados vêm do dicionário (`stoppedLine('retorno')`,
 * `stoppedTitle('retorno')`, `alwaysAnswersText`). Mesma peça (`NoticeInline warning`, `StatusBadge warning`).
 */
export function ReturnDetailModal({
  id,
  onClose,
  onSchedule,
  focusMessage = false






}: {id: string | null;onClose: () => void;onSchedule: (r: ReturnSuggestion) => void; /** Abre com o cursor no texto do balão (botão "Editar mensagem"). */focusMessage?: boolean;}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { items } = useReturns();
  const responses = useResponses();
  const mode = useSavedAutomationMode();
  const undoable = useUndoableReturn();
  const helpId = useId();
  const r = items.find((x) => x.id === id) ?? null;
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  useEffect(() => {
    setReason(r?.reason ?? '');
    setMessage(r ? returnMessage(r) : '');
    setConfirmDismiss(false);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pro = r ? agendaProfessionalOf(r.professionalId) : undefined;
  const companyName = useBusinessName();
  const clientId = r ? clientIdOf(r.clientName) : null;
  const block = r ? contactBlockOfName(r.clientName) : null;
  const group = r ? groupOf(r.status) : 'encerrados';
  const final = group === 'agendados' || group === 'encerrados';
  const resp: ClientResponse = r ? responses[r.id] ?? 'none' : 'none';

  // Texto padrão (sem edição). "Voltar ao texto padrão" aparece assim que o texto do balão difere dele e some quando volta a ser igual.
  const defaultMessage = r ? returnMessage({ ...r, customMessage: null }) : '';
  const edited = message !== defaultMessage;
  const saveMessage = () => {
    if (!r) return;
    if (!edited) {
      if (r.customMessage) setReturnMessage(r.id, null);
      return;
    }
    if (message !== returnMessage(r)) setReturnMessage(r.id, message);
  };
  // Os campos aplicam na hora (ao sair do campo). Fechar por X, Esc, clique fora ou "Fechar" também guarda o que foi digitado,
  // por isso o modal não usa o aviso de alterações não salvas (unsavedGuard={false}, regra do CLAUDE.md).
  const close = () => {
    if (r && !confirmDismiss) {
      if (groupOf(r.status) === 'chamar') saveMessage();
      if (reason !== (r.reason ?? '')) setReturnReason(r.id, reason);
    }
    onClose();
  };
  const go = (to: string) => {
    close();
    navigate(to);
  };
  const schedule = (x: ReturnSuggestion) => {
    close();
    onSchedule(x);
  };

  const primary = !r ? null : group === 'encerrados' ?
  <Button onClick={() => undoable(r, () => reopenReturn(r.id), { title: `Retorno de ${r.clientName.split(' ')[0]} reaberto`, description: 'Voltou para a fila.' })}>Reabrir retorno</Button> :
  group === 'agendados' ? null : block ?
  <Button onClick={() => schedule(r)}>Agendar a pedido dele</Button> :
  group === 'chamar' ?
  <Button
    onClick={() => {
      saveMessage();
      undoable(r, () => approveReturnContact(r, mode), {
        title: `Contato de ${r.clientName.split(' ')[0]} aprovado`,
        description: mode === 'pausado' ? 'O envio está pausado em Automações.' : 'A mensagem sai entre 09:00 e 20:00.'
      });
    }}>
    
      Aprovar contato
    </Button> :

  <Button onClick={() => schedule(r)}>Agendar retorno</Button>;


  return (
    <AppModal
      open={!!r}
      onClose={close}
      unsavedGuard={false}
      size="md"
      tone={confirmDismiss ? 'danger' : 'default'}
      title={confirmDismiss ? `Dispensar o retorno de ${r?.clientName ?? ''}?` : r?.clientName ?? ''}
      description={confirmDismiss || !r ? undefined : `Retorno de ${r.serviceLabel.toLowerCase()}`}
      footer={
      r && (
      confirmDismiss ?
      <ModalActions equal={2}>
            <Button variant="neutral" onClick={() => setConfirmDismiss(false)}>
              Voltar
            </Button>
            <Button
          variant="danger"
          onClick={() => {
            dismissReturn(r.id);
            toast({ title: 'Retorno dispensado', description: 'Ele sai da fila. Você pode reabri-lo em Ver encerrados.', tone: 'info' });
            setConfirmDismiss(false);
            onClose();
          }}>
          
              Dispensar retorno
            </Button>
          </ModalActions> :

      <ModalActions>
            <Button variant="neutral" onClick={close}>
              Fechar
            </Button>
            {!final &&
        <Button variant="dangerOutline" onClick={() => setConfirmDismiss(true)}>
                Dispensar
              </Button>
        }
            {primary}
          </ModalActions>)

      }>
      
      {r && confirmDismiss &&
      <p className="text-sm text-text-secondary">
          O cliente não será chamado para este retorno e ele sai da fila. Nenhum agendamento é apagado. Você pode reabrir o retorno quando quiser.
        </p>
      }
      {r && !confirmDismiss &&
      <div className="flex flex-col gap-5">
          {block &&
        <NoticeInline tone="warning" title={stoppedLine('retorno', kindOf(clientIdFromName(r.clientName), 'retorno'))}>
              Este retorno não pode ser aprovado. {alwaysAnswersText()}
            </NoticeInline>
        }
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Row label="Atendimento de origem">
              <span className="tabular-nums">{dataBR(r.sourceIso)} · {r.sourceStart}</span>
              <span className="block font-normal text-text-secondary">{r.serviceLabel}</span>
            </Row>
            <Row label="Profissional">
              <span className="inline-flex items-center gap-1.5">
                {pro && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pro.color }} aria-hidden="true" />}
                {pro?.name ?? '—'}
              </span>
            </Row>
            <Row label="Intervalo do serviço">{r.intervalDays} dias após o atendimento</Row>
            <Row label="Situação">
              {block ?
            <StatusBadge status="warning" label={stoppedTitle('retorno')} /> :
            group === 'encerrados' ?
            <StatusBadge status="muted" label={RETURN_STATUS[r.status].label} /> :

            <StatusBadge status={RETURN_GROUP_TONE[group]} label={RETURN_GROUP_LABEL[group]} />
            }
              {group === 'contato' && !block && <span className="mt-1 block text-xs font-normal text-text-secondary">{contactSubtext(r, mode)}</span>}
            </Row>
          </dl>

          {group === 'agendados' ?
        <NoticeInline tone="success" role="status" title={`Agendado para ${r.scheduledIso ? dataBR(r.scheduledIso) : ''}`}>
              Este agendamento já está na Agenda.
            </NoticeInline> :

        group !== 'encerrados' &&
        <div className="flex flex-col gap-3">
                <DateField label="Retorno ideal" value={r.recommendedIso} onChange={(v) => v && setReturnDate(r.id, v)} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-text-muted">Adiar:</span>
                  {[7, 30, 90].map((n) =>
            <button key={n} type="button" className={cardButtonNeutral} onClick={() => undoable(r, () => postponeReturn(r.id, addDays(r.recommendedIso, n)), { title: `Retorno de ${r.clientName.split(' ')[0]} adiado ${n} dias`, description: `Nova data: ${dataBR(addDays(r.recommendedIso, n))}.` })}>
                      +{n} dias
                    </button>
            )}
                </div>
              </div>

        }

          {!block && !final &&
        <div className="flex flex-col gap-2">
              <WhatsAppPreview
            title="Mensagem para o cliente"
            contactName={r.clientName}
            contactSubtitle="Prévia no WhatsApp"
            messages={[
            {
              from: 'team',
              senderName: companyName,
              text: message,
              time: bubbleTime(r, mode),
              content:
              <BubbleTextEditor value={message} disabled={group !== 'chamar'} describedBy={helpId} autoFocus={focusMessage} onChange={setMessage} onBlur={saveMessage} />

            }]
            }
            caption={
            <span id={helpId}>
                    {group === 'chamar' ?
              'Clique no texto do balão para editar. Sai depois que você aprovar o contato, entre 09:00 e 20:00.' :
              'O contato já foi aprovado; a mensagem não pode mais ser editada.'}
                  </span>
            } />
          
              {group === 'chamar' && edited &&
          <div>
                  <button type="button" className={cardButtonNeutral} onClick={() => {setReturnMessage(r.id, null);setMessage(defaultMessage);}}>
                    Voltar ao texto padrão
                  </button>
                </div>
          }
            </div>
        }

          <Textarea
          label="Motivo e instruções (interno)"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => reason !== r.reason && setReturnReason(r.id, reason)} />
        

          {group === 'contato' && !block &&
        <p className="text-sm text-text-secondary">
              Resposta do cliente: <strong className="text-text-primary">{RESPONSE_LABEL[resp]}</strong>
            </p>
        }

          <div className="flex flex-wrap gap-2">
            {group === 'chamar' && !block &&
          <button type="button" className={cardButtonNeutral} onClick={() => undoable(r, () => markContacted(r.id), { title: `${r.clientName.split(' ')[0]} avisado por telefone`, description: 'Foi para Em contato.' })}>
                Já avisei por telefone
              </button>
          }
            {clientId &&
          <button type="button" className={cardButtonNeutral} onClick={() => go(`/clientes/${clientId}`)}>
                <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Abrir ficha do cliente
              </button>
          }
            <button type="button" className={cardButtonNeutral} onClick={() => go('/conversas')}>
              <MessageCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Abrir conversa
            </button>
          </div>

          <section aria-label="Histórico do retorno">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Histórico</h3>
            <ol className="flex flex-col gap-1.5 border-l-2 border-border pl-3">
              {r.log.slice(-4).map((l, i) =>
            <li key={i} className="text-xs text-text-secondary">{l.text}</li>
            )}
            </ol>
          </section>
        </div>
      }
    </AppModal>);

}