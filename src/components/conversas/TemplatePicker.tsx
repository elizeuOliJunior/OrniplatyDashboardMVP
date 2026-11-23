import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, FileTextIcon, SearchIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { Button } from '../Button';
import { Input } from '../Input';
import { EmptyState, InfoTip, Modal, StatusBadge } from '../Card';
import { MESSAGE_TEMPLATES, TEMPLATE_VAR_MAX, fillTemplate } from '../../data/messageTemplates';
import type { MessageTemplate, TemplateVarSource } from '../../data/messageTemplates';
import { useClientProfile } from '../../data/api/clientes';
import { useBusinessName } from '../../data/empresa';
import { alwaysAnswersText, contactBlockOf, kindOf, stoppedLine, useContactBlocks } from '../../data/contactPreferences';
import { useConflictCases } from '../../data/conflictCases';

/**
 * T1 1c (04/11/2026, Christian): seletor de MENSAGENS APROVADAS dentro da conversa, no molde da referência Tend:
 * lista com busca à esquerda; à direita a prévia no balão do WhatsApp, com os campos destacados, e os campos editáveis
 * (nome, profissional, data…). O texto fixo não muda; só os campos. Preenchido com o próximo agendamento do cliente.
 * OPT-OUT (data/contactPreferences.ts): quem pediu para não receber mensagens não recebe mensagem que a clínica inicia.
 * Com a janela fechada, nenhuma mensagem aprovada sai; com a janela aberta, as de Marketing ficam bloqueadas.
 * Modelos e o que existe hoje no backend: data/messageTemplates.ts.
 * L5 (16/11/2026, só texto dos campos): em “remarcar_horario”, quando o cliente tem um caso “Falta avisar” em Notificações
 * da agenda, Serviço, Data e Hora vêm do horário ORIGINAL do caso. O texto aprovado do modelo não mudou.
 * L6 (16/11/2026, só visual): cada mensagem mostra o TÍTULO como nome; o nome técnico fica em texto pequeno abaixo. Com um
 * caso “Falta avisar” do cliente, abre em “remarcar_horario”; sem situação conhecida, nenhuma vem escolhida.
 * L20 (17/11/2026, ponto 7, só visual): antes abria espremido dentro da coluna da conversa (até 480 px de altura, lista de
 * 200–240 px e prévia pequena). Agora abre numa JANELA PRÓPRIA do DS (`Modal size="lg"`, por cima do painel ou da tela):
 * lista com busca à esquerda e a mensagem inteira legível à direita, com os campos destacados como antes; rodapé da janela
 * com “Cancelar” e “Enviar mensagem aprovada”; a frase que explicava o envio (ou o motivo do bloqueio) virou o
 * `footerHint` da janela. Mesmas mensagens, mesmos campos, mesmo envio (`onSend`) e mesmo resultado. Esc, X e clique fora
 * fecham (o `Modal` cuida; por cima do painel lateral, só esta janela responde ao Esc). Em largura menor que 520 px, lista
 * e prévia continuam em duas etapas (lista → prévia, com “Voltar”). Vale para Oportunidades e para Conversas (mesma peça).
 * O campo de busca passou a ser o `Input` do DS.
 * L21 (17/11/2026, V5 T3/T4/T9: ninguém avisava que enviar deixa a conversa com a equipe): quando dá para enviar, a frase
 * do rodapé passa a ser “A conversa fica com você até você devolver para a assistente.” (é o que `sendTeamTemplate` faz)
 * e a frase de antes (“Só os campos mudam…”) vai para o "i" ao lado, palavra por palavra. Bloqueado ou em análise: igual.
 * L22e (18/11/2026, DS 6.1): a busca sem resultado usa `EmptyState size="sm" variant="dotted"` com a lupa; mesmo texto.
 * L24d (19/11/2026, decisão do Christian de 18/11, 23h51): “remarcar_horario” de um cliente com caso “Falta avisar” é o
 * aviso de mudança de horário e NUNCA é bloqueado pela preferência de contato. As outras mensagens seguem a regra de antes;
 * a frase do bloqueio vem do dicionário (`stoppedLine('retorno')` + `alwaysAnswersText`).
 */
const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Abaixo disto, lista e prévia viram duas etapas. */
const TWO_PANE_MIN = 520;
/** L5: modelo cujo horário é o que precisa mudar (não o próximo agendamento). */
const RESCHEDULE_TEMPLATE = 'remarcar_horario';
const HINT_ID = 'mensagem-aprovada-aviso';
/** L21: a frase antes de enviar (mesma das janelas “Chamar no WhatsApp” da Agenda e da Lista de espera). */
export const KEEPS_CONVERSATION_TEXT = 'A conversa fica com você até você devolver para a assistente.';

/** L20: altura do corpo da janela (lista e prévia rolam cada uma por dentro). */
function useBodyHeight() {
  const calc = () => typeof window === 'undefined' ? 520 : Math.max(320, Math.min(560, window.innerHeight - 260));
  const [h, setH] = useState(calc);
  useEffect(() => {
    const on = () => setH(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}

export function TemplatePicker({
  clientId,
  clientName,
  windowClosed,
  onClose,
  onSend









}: {clientId: string;clientName: string;windowClosed: boolean;onClose: () => void; /** R3 (A-39): `appointment` só vem no lembrete de horário que bate com o próximo agendamento do cliente. */onSend: (msg: {name: string;title: string;text: string;buttons?: string[];appointment?: {iso: string;clientName: string;start: string;};}) => void; /** Id do botão que abre o seletor. L20: sem uso (a janela do DS cuida do clique fora); mantido para quem chama. */ignoreId?: string;}) {
  const profile = useClientProfile(clientId);
  const clinic = useBusinessName();
  useContactBlocks();
  const block = contactBlockOf(clientId);
  const panelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(9999);
  const bodyHeight = useBodyHeight();
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 9999);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = width < TWO_PANE_MIN;
  const [query, setQuery] = useState('');
  // L5: caso "Falta avisar" deste cliente (a clínica mudou o horário e ele ainda não sabe). Mesma fonte de Notificações da agenda.
  const cases = useConflictCases();
  const recordedName = profile?.client.name ?? clientName;
  const changedCase = cases.find((c) => c.state === 'avisar' && (c.client === recordedName || c.client === clientName));
  // L6: só vem escolhida a mensagem da situação que o código conhece (mudança de horário); senão, nenhuma.
  const situational = changedCase && MESSAGE_TEMPLATES.some((t) => t.name === RESCHEDULE_TEMPLATE) ? RESCHEDULE_TEMPLATE : null;
  const [selected, setSelected] = useState<string | null>(situational);
  const [step, setStep] = useState<'lista' | 'previa'>(situational ? 'previa' : 'lista');
  const [touched, setTouched] = useState(false);

  const next = profile?.proximo_agendamento;
  const defaults: Record<TemplateVarSource, string> = useMemo(
    () => ({
      nome: (profile?.client.name ?? clientName).split(' ')[0] ?? '',
      clinica: clinic,
      servico: next?.service?.name ?? profile?.ultimo_atendimento?.service?.name ?? '',
      profissional: next?.professional?.name ?? '',
      data: next ? brDate(next.date) : '',
      hora: next?.start_time ?? ''
    }),
    [profile, clientName, clinic, next]
  );
  const sourceValue = (t: MessageTemplate, src: TemplateVarSource) => {
    if (t.name === RESCHEDULE_TEMPLATE && changedCase) {
      if (src === 'servico') return changedCase.service;
      if (src === 'data') return brDate(changedCase.iso);
      if (src === 'hora') return changedCase.start;
    }
    return defaults[src];
  };
  const [values, setValues] = useState<Record<string, string[]>>({});
  const valuesOf = (t: MessageTemplate) => values[t.name] ?? t.vars.map((v) => sourceValue(t, v.source));
  const setValue = (t: MessageTemplate, i: number, v: string) => setValues((cur) => ({ ...cur, [t.name]: valuesOf(t).map((x, j) => j === i ? v.replace(/[\r\n\t]+/g, ' ').slice(0, TEMPLATE_VAR_MAX) : x) }));

  const q = query.trim().toLowerCase();
  const list = MESSAGE_TEMPLATES.filter((t) => !q || t.name.includes(q) || t.title.toLowerCase().includes(q));
  const tpl = selected ? MESSAGE_TEMPLATES.find((t) => t.name === selected) ?? null : null;
  const vals = tpl ? valuesOf(tpl) : [];
  const missing = tpl ? tpl.vars.map((_, i) => !(vals[i] ?? '').trim()) : [];
  const approved = tpl?.status === 'aprovado';
  // L24d (decisão de 18/11, 23h51): o aviso de mudança de horário nunca é bloqueado pela preferência de contato.
  const changeNoticeTpl = !!tpl && tpl.name === RESCHEDULE_TEMPLATE && !!changedCase;
  const blocked = !!tpl && !!block && !changeNoticeTpl && (windowClosed || tpl.category === 'Marketing');
  const canSend = !!tpl && approved && !blocked && !missing.some(Boolean);

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => firstRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);

  const send = () => {
    setTouched(true);
    if (!tpl || !canSend) return;
    // R3 (06/11/2026, Christian, A-39): o lembrete de horário enviado à mão conta como o lembrete do próximo agendamento,
    // desde que Data e Hora continuem as dele (se a equipe trocou a data/hora, não liga a nenhum agendamento).
    const at = (src: TemplateVarSource) => (vals[tpl.vars.findIndex((v) => v.source === src)] ?? '').trim();
    const linked = tpl.name === 'lembrete_confirmacao' && next && at('data') === brDate(next.date) && at('hora') === next.start_time;
    const recorded = (next as {cal?: {appt: {clientName: string;};} | null;} | null)?.cal?.appt.clientName ?? profile?.client.name ?? clientName;
    const appointment = linked && next ? { iso: next.date, clientName: recorded, start: next.start_time } : undefined;
    onSend({ name: tpl.name, title: tpl.title, text: fillTemplate(tpl.body, vals), buttons: tpl.buttons, appointment });
  };

  // L21: bloqueado ou em análise = o motivo, como antes. Nos outros casos, a frase de que a conversa fica com você; a frase
  // de antes (“Só os campos mudam…”) vai para o "i" quando há mensagem escolhida. L24d: o motivo vem do dicionário.
  const blockedText = !tpl ?
  '' :
  blocked ?
  `Não dá para enviar. ${stoppedLine('retorno', kindOf(clientId, 'retorno'))}. ${alwaysAnswersText()}` :
  !approved ?
  'Esta mensagem ainda está em análise na Meta e não pode ser enviada.' :
  '';
  const fieldsTip = tpl && !blockedText ? windowClosed ? 'Só os campos mudam. A conversa reabre quando o cliente responder.' : 'Só os campos mudam. A Meta pode cobrar por mensagem aprovada.' : '';
  const footerNode = blockedText ?
  <span role={blocked ? 'status' : undefined} className={blocked ? 'font-semibold text-warning-text' : undefined}>
      {blockedText}
    </span> :

  <span>
      {KEEPS_CONVERSATION_TEXT}
      {fieldsTip &&
    <span className="ml-1 inline-flex align-middle">
          <InfoTip label="o que muda na mensagem" content={fieldsTip} />
        </span>
    }
    </span>;


  const listCol =
  <div className={twMerge('flex min-h-0 flex-col', !narrow && 'border-r border-border')}>
      <div className="p-3">
        <Input
        ref={firstRef}
        aria-label="Buscar mensagem aprovada"
        placeholder="Buscar mensagem"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        prefix={<SearchIcon className="h-4 w-4 text-text-muted" />} />
      
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Mensagens aprovadas">
        {list.length === 0 &&
      <li className="px-1 py-1">
            <EmptyState size="sm" variant="dotted" icon={<SearchIcon />} title="Nenhuma mensagem com esse nome." />
          </li>
      }
        {list.map((t) => {
        const on = !!tpl && t.name === tpl.name;
        return (
          <li key={t.name}>
              <button
              type="button"
              aria-current={on ? 'true' : undefined}
              onClick={() => {
                setSelected(t.name);
                setTouched(false);
                if (narrow) setStep('previa');
              }}
              className={twMerge('mb-1 w-full rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7490]', on && !narrow ? 'border-[#0E7490] bg-[#F1F8F9]' : 'border-transparent hover:bg-[#F6F9F9]')}>
              
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{t.title}</span>
                  {t.status === 'em-analise' && <StatusBadge status="warning" label="Em análise" className="h-5 shrink-0 px-2 text-xs" />}
                </span>
                <span className="block truncate text-xs text-text-secondary">
                  {t.category} · <span className="font-mono">{t.name}</span>
                </span>
              </button>
            </li>);

      })}
      </ul>
    </div>;


  const backButton = narrow &&
  <button type="button" onClick={() => setStep('lista')} aria-label="Voltar para a lista de mensagens" className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#3F5957] hover:bg-[#F1F5F5]">
      <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
    </button>;


  const parts = tpl ? tpl.body.split(/(\{\{\d+\}\})/) : [];
  const previewCol = !tpl ?
  <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
        {backButton}
        <p className="text-sm font-semibold text-text-primary">Prévia</p>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#ECE5DD] px-6 py-8 text-center">
        <p className="text-sm text-[#3F5957]">Escolha uma mensagem na lista para ver a prévia e preencher os campos.</p>
      </div>
    </div> :

  <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
        {backButton}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">{tpl.title}</p>
          <p className="text-xs text-text-secondary">
            <span className="font-mono">{tpl.name}</span> · {tpl.category} · Português (BR) · {approved ? 'Aprovada pela Meta' : 'Em análise na Meta'}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="bg-[#ECE5DD] px-4 py-4">
          <div className="ml-auto max-w-[480px] rounded-lg bg-[#D9FDD3] px-3 pb-1.5 pt-2 shadow-sm">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#4B6866]">
              <FileTextIcon className="h-3 w-3" aria-hidden="true" />
              Mensagem aprovada
            </p>
            <p className="text-sm font-bold text-[#0B2B2A]">{tpl.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#0B2B2A]">
              {parts.map((p, i) => {
              const m = p.match(/^\{\{(\d+)\}\}$/);
              if (!m) return <React.Fragment key={i}>{p}</React.Fragment>;
              const idx = Number(m[1]) - 1;
              const v = (vals[idx] ?? '').trim();
              return (
                <mark key={i} className={twMerge('rounded px-0.5', v ? 'bg-[#CDEBF1] text-[#0B2B2A]' : 'bg-[#FEE2E2] text-[#991B1B]')}>
                    {v || tpl.vars[idx]?.label}
                  </mark>);

            })}
            </p>
            <p className="mt-1 text-xs text-[#587371]">{clinic}</p>
            {tpl.buttons && tpl.buttons.length > 0 &&
          <div className="mt-2 flex flex-col border-t border-black/5">
                {tpl.buttons.map((b) =>
            <span key={b} className="border-b border-black/5 py-1.5 text-center text-sm font-semibold text-[#0E7490] last:border-b-0">
                    {b}
                  </span>
            )}
              </div>
          }
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
          {tpl.vars.map((v, i) => {
          const id = `tpl-${tpl.name}-${i}`;
          const err = touched && missing[i];
          return (
            <div key={id} className="min-w-0">
                <label htmlFor={id} className="mb-1 block text-xs font-semibold text-[#3F5957]">
                  <span className="font-mono text-[#7A9593]">{`{{${i + 1}}}`}</span> {v.label}
                </label>
                <input
                id={id}
                value={vals[i] ?? ''}
                disabled={!approved || blocked}
                onChange={(e) => setValue(tpl, i, e.target.value)}
                aria-invalid={err || undefined}
                aria-describedby={err ? `${id}-erro` : undefined}
                maxLength={TEMPLATE_VAR_MAX}
                className={twMerge(
                  'h-9 w-full rounded-[10px] border bg-white px-3 text-sm text-[#0B2B2A] focus:outline-none focus:ring-2 disabled:bg-[#F6F9F9] disabled:text-[#7A9593]',
                  err ? 'border-[#B91C1C] focus:ring-[#B91C1C]/25' : 'border-[#C7DAD8] focus:border-[#0E7490] focus:ring-[#0E7490]/25'
                )} />
              
                {err &&
              <p id={`${id}-erro`} className="mt-1 text-xs text-[#991B1B]">
                    Preencha {v.label.toLowerCase()}.
                  </p>
              }
              </div>);

        })}
        </div>
      </div>
    </div>;


  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Mensagens aprovadas"
      footerHint={footerNode}
      footerHintId={HINT_ID}
      footer={
      <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={!tpl || !approved || blocked} aria-describedby={HINT_ID}>
            Enviar mensagem aprovada
          </Button>
        </>
      }>
      
      <div
        ref={panelRef}
        aria-label="Escolher mensagem aprovada"
        style={{ height: bodyHeight }}
        className={twMerge(
          '-mx-1 overflow-hidden rounded-2xl border border-border bg-surface',
          narrow ? 'flex flex-col' : 'grid grid-cols-[minmax(220px,280px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]'
        )}>
        
        {!narrow ?
        <>
            {listCol}
            {previewCol}
          </> :
        step === 'lista' ?
        listCol :

        previewCol
        }
      </div>
    </Modal>);

}