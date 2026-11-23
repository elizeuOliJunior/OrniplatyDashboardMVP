import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  CalendarXIcon,
  CheckCircle2Icon,
  ChevronUpIcon,
  ClockIcon,
  HistoryIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SquarePenIcon,
  Undo2Icon,
  XIcon } from
'lucide-react';
import { Button } from '../Button';
import { IconButton } from '../Card';
import { Pill, PillGroup } from '../Pill';
import { StatusBadge } from '../StatusBadge';
import { Logo } from '../Logo';
import { useToast } from '../ui/Toast';
import { OrniGlowStyles, OrniMark } from '../ui/OrniMark';
import { cardButton, cardButtonNeutral, smallButton } from '../ui/styles';
import { mediumDayLabel } from '../../data/agendaStore';
import type { CalAppointment, CancelledBy } from '../../data/agendaStore';
import type { AgendamentoDefaults } from '../modals/NovoAgendamentoModal';
import { serviceByLabel } from '../../data/catalogo';
import {
  SUGGESTIONS,
  actionFromSlot,
  answer,
  answerPicked,
  dayWord,
  freeTimes,
  pickLabel,
  proColor,
  proName,
  serviceMismatch } from
'./agendaAssistantLogic';
import type { AssistantContext, AssistantReply, PendingAction, PickRequest, SlotIntent } from './agendaAssistantLogic';

type ActionState = 'pending' | 'done' | 'discarded';

type ChatMessage =
{id: string;role: 'user';text: string;} |
{id: string;role: 'assistant';reply: AssistantReply;actionState?: ActionState;doneText?: string;canUndo?: boolean;picked?: boolean;};

type SavedConversation = {id: string;title: string;messages: ChatMessage[];updatedAt: number;};

/** Conversations kept in the history button (the oldest leaves when an 11th starts). */
const HISTORY_LIMIT = 10;
/** Kept outside the component, so the history survives leaving and coming back to the Agenda in this session. */
let savedHistory: SavedConversation[] = [];
/** W3 (A1-02): ações que ainda podem ser desfeitas, por id da mensagem. Fora do componente, como o histórico. */
const undoers = new Map<string, () => void>();

type ActionResult = {ok: true;} | {ok: false;message?: string;};

type AgendaAssistantProps = {
  ctx: AssistantContext;
  /** G3 (F-048): devolve o resultado da operação; sem `ok`, nada é anunciado como feito. W3: `undo` desfaz a remarcação. */
  onReschedule: (a: Extract<PendingAction, {kind: 'remarcar';}>) => ActionResult & {undo?: () => void;};
  /** W3 (G3): quem cancelou. Devolve como desfazer. */
  onCancel: (iso: string, appt: CalAppointment, by: CancelledBy) => {undo?: () => void;} | void;
  onCreate: (a: Extract<PendingAction, {kind: 'agendar';}>) => ActionResult & {undo?: () => void;};
  /** "Ajustar": opens the matching form already filled */
  onAdjust: (a: PendingAction) => void;
  onOpenNew: (defaults: AgendamentoDefaults) => void;
  onOpenBlock: () => void;
  onShowDay: (iso: string) => void;
  onOpenAppointment: (iso: string, appt: CalAppointment) => void;
};

/** After this long without use (field not focused, panel closed), the next click starts a new interaction. */
const IDLE_RESET_MS = 3 * 60 * 1000;
/** Length of the light that runs around the field once. */
const TRACE_MS = 1700;
/**
 * Fechar suave (16/10/2026): o X afunda e volta no lugar ANTES de o painel recolher. Antes o painel recolhia na hora,
 * junto com o padding do card (p-2 → p-0), e o X escorregava para fora do quadro ainda pressionado.
 */
const CLOSE_PRESS_MS = 160;
/** O card só perde o padding/borda depois que o painel terminou de recolher (o cabeçalho não desliza). */
const PANEL_COLLAPSE_MS = 260;

const SUGGESTION_ICONS = [ClockIcon, RefreshCwIcon, CalendarXIcon, CalendarPlusIcon, CalendarDaysIcon];

const WHO_CANCELLED = [
{ value: 'client', label: 'O cliente' },
{ value: 'clinic', label: 'A clínica' }];


const FIELD_CSS = `
@keyframes orni-trace-head { 0% { stroke-dashoffset: 0; opacity: 0; } 8% { opacity: 1; } 82% { opacity: 1; } 100% { stroke-dashoffset: -100; opacity: 0; } }
@keyframes orni-trace-ring { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
@keyframes orni-dot { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
.orni-trace-head { stroke-dasharray: 16 84; animation: orni-trace-head ${TRACE_MS}ms cubic-bezier(.45,.1,.3,1) 1 both; }
.orni-trace-ring { stroke-dasharray: 100 100; animation: orni-trace-ring ${TRACE_MS}ms cubic-bezier(.45,.1,.3,1) 1 both; }
.orni-dot { animation: orni-dot 1.1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .orni-trace-head { animation: none; opacity: 0; } .orni-trace-ring { animation: none; stroke-dasharray: none; } .orni-dot { animation: none; opacity: .6; } }
`;

/**
 * Thin multicolor outline of the field: draws itself once (with a bright head), then stays as a soft glow.
 * Alinhamento (16/10/2026): o SVG cobre a caixa da BORDA do campo (1px para fora do padding box) e a linha fina fica
 * centrada em 0,5px, exatamente em cima da borda de 1px e com o mesmo raio (16px por fora, `rounded-2xl`). Antes ficava 1px para dentro.
 */
function FieldTrace({ traceKey, visible }: {traceKey: number;visible: boolean;}) {
  const rect = { x: 0.5, y: 0.5, rx: 15.5, pathLength: 100, fill: 'none' as const, style: { width: 'calc(100% - 1px)', height: 'calc(100% - 1px)' } };
  return (
    <svg
      key={traceKey}
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible transition-opacity duration-500 ease-out"
      style={{ top: -1, left: -1, width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', opacity: visible ? 1 : 0 }}>
      
      <defs>
        <linearGradient id={`orni-trace-${traceKey}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="35%" stopColor="#34D399" />
          <stop offset="65%" stopColor="#0E7490" />
          <stop offset="100%" stopColor="#A7F3D0" />
        </linearGradient>
      </defs>
      {/* soft glow under the outline */}
      <rect {...rect} className="orni-trace-ring" stroke={`url(#orni-trace-${traceKey})`} strokeWidth={3} opacity={0.35} style={{ ...rect.style, filter: 'blur(3px)' }} />
      {/* thin outline that remains: same 1px line as the field border */}
      <rect {...rect} className="orni-trace-ring" stroke={`url(#orni-trace-${traceKey})`} strokeWidth={1} opacity={0.8} />
      {/* bright head that runs around once */}
      <rect {...rect} className="orni-trace-head" stroke={`url(#orni-trace-${traceKey})`} strokeWidth={2} strokeLinecap="round" style={{ ...rect.style, filter: 'drop-shadow(0 0 4px rgba(52,211,153,.9))' }} />
    </svg>);

}

function proLine(iso: string, time: string, professionalId: string) {
  return `${mediumDayLabel(iso)} · ${time} · ${proName(professionalId)}`;
}

export function AgendaAssistant({ ctx, onReschedule, onCancel, onCreate, onAdjust, onOpenNew, onOpenBlock, onShowDay, onOpenAppointment }: AgendaAssistantProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const traceTimer = useRef<ReturnType<typeof setTimeout>>();
  const replyTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  /** One interaction lasts from the first click until "Fechar" (or until it is left unused). */
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [traceKey, setTraceKey] = useState(0);
  const [tracing, setTracing] = useState(false);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [focused, setFocused] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedConversation[]>(savedHistory);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [closingPress, setClosingPress] = useState(false);

  useEffect(
    () => () => {
      clearTimeout(idleTimer.current);
      clearTimeout(traceTimer.current);
      clearTimeout(replyTimer.current);
      clearTimeout(closeTimer.current);
    },
    []
  );

  // Keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thinking, open, view]);

  // Every conversation is saved on its own: messages never mix between sessions.
  useEffect(() => {
    if (!convId || messages.length === 0) return;
    setHistory((list) => {
      const first = messages.find((m) => m.role === 'user');
      const title = first && first.role === 'user' ? first.text : 'Conversa';
      const prev = list.find((c) => c.id === convId);
      const changed = !prev || prev.messages !== messages;
      const entry = { id: convId, title, messages, updatedAt: changed ? Date.now() : prev.updatedAt };
      const next = [entry, ...list.filter((c) => c.id !== convId)].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, HISTORY_LIMIT);
      savedHistory = next;
      return next;
    });
  }, [messages, convId]);

  const reset = () => {
    clearTimeout(replyTimer.current);
    clearTimeout(traceTimer.current);
    setActive(false);
    setOpen(false);
    setArmed(false);
    setTracing(false);
    setThinking(false);
    setDraft('');
    setMessages([]);
    setConvId(null);
    setView('chat');
  };

  // An interaction left alone (not focused, panel closed) ends by itself, so the next click is a fresh start.
  useEffect(() => {
    clearTimeout(idleTimer.current);
    if (active && !focused && !open) idleTimer.current = setTimeout(reset, IDLE_RESET_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, focused, open]);

  /** The light around the field and the empty-field glow: only when a new interaction starts. */
  const replayTrace = () => {
    setArmed(!draft);
    setTraceKey((k) => k + 1);
    setTracing(true);
    clearTimeout(traceTimer.current);
    traceTimer.current = setTimeout(() => setTracing(false), TRACE_MS);
  };

  const start = () => {
    if (!active) {
      setActive(true);
      replayTrace();
    }
    setOpen(true);
  };

  const close = () => {
    reset();
    inputRef.current?.blur();
  };

  /** X: afunda suavemente, volta e só então fecha (um clique repetido durante o movimento é ignorado). */
  const pressClose = () => {
    if (closingPress) return;
    setClosingPress(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setClosingPress(false);
      close();
    }, CLOSE_PRESS_MS);
  };

  const collapse = () => setOpen(false);

  /** Clean chat; the previous one stays in the history. */
  const newConversation = () => {
    clearTimeout(replyTimer.current);
    setThinking(false);
    setMessages([]);
    setConvId(null);
    setView('chat');
    setDraft('');
    replayTrace();
    inputRef.current?.focus();
  };

  const openConversation = (c: SavedConversation) => {
    clearTimeout(replyTimer.current);
    setThinking(false);
    setConvId(c.id);
    setMessages(c.messages);
    setView('chat');
    setArmed(false);
    inputRef.current?.focus();
  };

  const pushReply = (reply: AssistantReply) => {
    setThinking(true);
    clearTimeout(replyTimer.current);
    replyTimer.current = setTimeout(() => {
      setThinking(false);
      setMessages((list) => [...list, { id: `a${Date.now()}`, role: 'assistant', reply, actionState: reply.action ? 'pending' : undefined }]);
      if (reply.openBlock) onOpenBlock();
    }, 550);
  };

  const send = (text: string) => {
    const value = text.trim();
    if (!value || thinking) return;
    start();
    setArmed(false);
    setDraft('');
    setView('chat');
    if (!convId) setConvId(`c${Date.now()}`);
    setMessages((list) => [...list, { id: `u${Date.now()}`, role: 'user', text: value }]);
    pushReply(answer(value, ctx));
    inputRef.current?.focus();
  };

  const settle = (id: string, actionState: ActionState, doneText?: string, canUndo?: boolean) =>
  setMessages((list) => list.map((m) => m.id === id && m.role === 'assistant' ? { ...m, actionState, doneText, canUndo } : m));

  /** W3 (A1-02): registra o Desfazer de uma ação feita (botão no cartão + aviso rápido com Desfazer). */
  const armUndo = (id: string, undo: (() => void) | undefined, what: string, title: string, description: string) => {
    if (!undo) {
      toast({ title, description });
      return;
    }
    const run = () => {
      if (!undoers.has(id)) return;
      undoers.delete(id);
      undo();
      settle(id, 'discarded', `Desfeito: ${what} A agenda voltou como estava.`, false);
      toast({ title: 'Ação desfeita', description: 'A agenda voltou como estava.', tone: 'info' });
    };
    undoers.set(id, run);
    toast({ title, description, action: { label: 'Desfazer', onClick: run } });
  };

  /** Runs a confirmed action, checking first that the time is still free. */
  const confirm = (id: string, action: PendingAction, by?: CancelledBy) => {
    if (action.kind === 'cancelar') {
      if (!by) return;
      const r = onCancel(action.iso, action.appt, by);
      settle(id, 'done', `Cancelado (${by === 'client' ? 'o cliente pediu' : 'pela clínica'}).`, !!r?.undo);
      armUndo(id, r?.undo, 'o cancelamento.', 'Agendamento cancelado', `${action.appt.clientName} · ${mediumDayLabel(action.iso)} · ${action.appt.start}${by === 'clinic' ? ' · falta avisar o cliente (Notificações da agenda)' : ''}`);
      return;
    }
    // G3 (F-048, correção da revisão): na execução, confere de novo que o profissional FAZ o serviço (Quem faz pode ter mudado).
    const mismatch = serviceMismatch(action.professionalId, action.kind === 'remarcar' ? action.appt.service : action.service);
    if (mismatch) {
      settle(id, 'discarded', `Não consegui ${action.kind === 'remarcar' ? 'remarcar' : 'agendar'}: ${mismatch} Nada mudou na agenda.`);
      return;
    }
    const minutes = serviceByLabel(action.kind === 'remarcar' ? action.appt.service : action.service)?.minutes ?? 60;
    const ignore = action.kind === 'remarcar' ? action.appt.id : undefined;
    const iso = action.kind === 'remarcar' ? action.toIso : action.iso;
    if (!freeTimes(iso, action.professionalId, minutes, ctx, ignore).includes(action.time)) {
      settle(id, 'discarded', 'Esse horário acabou de ser ocupado. Nada mudou na agenda.');
      pushReply(answer(action.kind === 'remarcar' ? `remarcar ${action.appt.clientName} ${mediumDayLabel(iso).split(', ')[1]}` : `agendar ${action.client} ${mediumDayLabel(iso).split(', ')[1]}`, ctx));
      return;
    }
    if (action.kind === 'remarcar') {
      const r = onReschedule(action);
      if (!r.ok) {
        settle(id, 'discarded', `Não consegui remarcar: ${r.message ?? 'o horário não está disponível'}. Nada mudou na agenda.`);
        return;
      }
      settle(id, 'done', `Remarcado para ${dayWord(action.toIso)} às ${action.time}. Fica “A confirmar” até o cliente confirmar.`, !!r.undo);
      armUndo(id, r.undo, 'a remarcação.', 'Horário remarcado', `${action.appt.clientName} · de ${proLine(action.fromIso, action.appt.start, action.appt.professionalId)} para ${proLine(action.toIso, action.time, action.professionalId)}`);
    } else {
      const r = onCreate(action);
      if (!r.ok) {
        settle(id, 'discarded', `Não consegui agendar: ${r.message ?? 'o horário não está disponível'}. Nada mudou na agenda.`);
        return;
      }
      settle(id, 'done', `Agendado ${dayWord(action.iso)} às ${action.time}. Fica “A confirmar” até o cliente confirmar.`, !!r.undo);
      armUndo(id, r.undo, 'o agendamento.', 'Agendamento criado', `${action.client} · ${proLine(action.iso, action.time, action.professionalId)}`);
    }
  };

  const pickSlot = (intent: SlotIntent, iso: string, time: string, professionalId: string) => {
    const action = actionFromSlot(intent, iso, time, professionalId);
    if (!action) {
      onOpenNew({ date: iso, time, professional: professionalId, service: serviceByLabel(intent.kind === 'abrir' ? intent.service ?? '' : '')?.value });
      return;
    }
    setMessages((list) => [...list, { id: `u${Date.now()}`, role: 'user', text: `${mediumDayLabel(iso)} às ${time} com ${proName(professionalId)}` }]);
    pushReply({ text: 'Confira e confirme:', action });
  };

  /** W3 (A1-02): a pessoa escolheu qual horário. */
  const pickAppointment = (msgId: string, req: PickRequest, item: {iso: string;appt: CalAppointment;}) => {
    setMessages((list) => [...list.map((m) => m.id === msgId && m.role === 'assistant' ? { ...m, picked: true } : m), { id: `u${Date.now()}`, role: 'user', text: pickLabel(item.iso, item.appt) }]);
    pushReply(answerPicked(req, item, ctx));
  };

  const hasConversation = messages.length > 0;
  const showRing = armed && !draft;

  return (
    // Chat order: header and messages on top, the field fixed at the bottom of the card
    <section
      aria-label="Assistente Orniplaty"
      className={`flex flex-col rounded-2xl border transition-[padding,background-color,border-color,box-shadow] duration-300 ${
      open ? 'border-border bg-white p-2 shadow-sm' : 'border-transparent p-0'}`
      }
      style={{ transitionDelay: open ? '0ms' : `${PANEL_COLLAPSE_MS}ms` }}>
      
      <OrniGlowStyles />
      <style>{FIELD_CSS}</style>

      <AnimatePresence initial={false}>
        {open &&
        <motion.div
          id="assistente-agenda-painel"
          key="painel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: { height: { duration: PANEL_COLLAPSE_MS / 1000, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.12 } } }}
          transition={{ height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2 } }}
          className="overflow-hidden">
          
            <div className="flex items-center justify-between gap-2 pb-1.5 pl-2.5">
              <p className="min-w-0 truncate text-xs text-text-muted">
                <span className="font-bold text-text-primary">{view === 'history' ? 'Conversas anteriores' : 'Assistente Orniplaty'}</span>
                {view === 'chat' && <span className="hidden sm:inline"> · nada muda na agenda sem a sua confirmação</span>}
              </p>
              <div className="flex shrink-0 items-center gap-0.5">
                {hasConversation && view === 'chat' &&
              <IconButton size="sm" onClick={newConversation} aria-label="Nova conversa" title="Nova conversa" icon={<SquarePenIcon className="h-4 w-4" aria-hidden="true" />} />
              }
                <IconButton
                size="sm"
                onClick={() => setView((v) => v === 'history' ? 'chat' : 'history')}
                aria-label="Histórico de conversas"
                aria-pressed={view === 'history'}
                title="Histórico"
                className={view === 'history' ? 'bg-primary-soft text-primary' : undefined}
                icon={<HistoryIcon className="h-4 w-4" aria-hidden="true" />} />
              
                <IconButton size="sm" onClick={collapse} aria-label="Recolher conversa" title="Recolher" icon={<ChevronUpIcon className="h-4 w-4 rotate-180" aria-hidden="true" />} />
                <IconButton
                size="sm"
                onClick={pressClose}
                aria-label="Fechar e encerrar conversa"
                title="Fechar"
                className={closingPress ? 'scale-90 bg-surface-muted text-text-primary' : undefined}
                icon={<XIcon className="h-4 w-4" aria-hidden="true" />} />
              
              </div>
            </div>

            {view === 'history' ?
          <div className="max-h-[min(400px,55vh)] overflow-y-auto overscroll-contain border-t border-surface-muted px-1 py-2">
                {history.length === 0 ?
            <p className="px-2 py-6 text-center text-sm text-text-muted">Nenhuma conversa ainda. As últimas {HISTORY_LIMIT} ficam guardadas aqui.</p> :

            <ul className="flex flex-col">
                    {history.map((c) => {
                const current = c.id === convId;
                return (
                  <li key={c.id}>
                          <button
                      type="button"
                      onClick={() => openConversation(c)}
                      className="flex w-full items-center gap-3 rounded-button px-2.5 py-2 text-left transition-colors hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      
                            <MessageSquareIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-text-primary">{c.title}</span>
                              <span className="block text-xs text-text-muted">
                                {c.messages.length} {c.messages.length === 1 ? 'mensagem' : 'mensagens'}
                              </span>
                            </span>
                            {current && <span className="shrink-0"><StatusBadge status="info" label="Atual" /></span>}
                          </button>
                        </li>);

              })}
                  </ul>
            }
                <div className="px-2 pt-2">
                  <button type="button" onClick={newConversation} className={cardButton}>
                    <SquarePenIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    Nova conversa
                  </button>
                </div>
              </div> :
          !hasConversation && !thinking ?
          <div className="border-t border-surface-muted px-2.5 py-3">
              <p className="mb-2.5 text-xs font-semibold text-text-secondary">Sugestões</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => {
                const Icon = SUGGESTION_ICONS[i];
                return (
                  <Pill key={s} size="sm" addable={false} aria-pressed={undefined} onClick={() => send(s)} className="gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      {s}
                    </Pill>);

              })}
              </div>
              </div> :

          <div
            ref={listRef}
            className="flex max-h-[min(400px,55vh)] flex-col gap-3 overflow-y-auto overscroll-contain border-t border-surface-muted px-2.5 py-3"
            aria-live="polite">
            
                {messages.map((m) =>
            m.role === 'user' ?
            <div key={m.id} className="flex justify-end">
                      <p className="max-w-[85%] rounded-2xl rounded-br bg-primary px-3.5 py-2 text-sm text-white">{m.text}</p>
                    </div> :

            <AssistantBubble
              key={m.id}
              message={m}
              onConfirm={(a, by) => confirm(m.id, a, by)}
              onUndo={() => undoers.get(m.id)?.()}
              onAdjust={(a) => {
                settle(m.id, 'discarded', 'Aberto no formulário para você ajustar.');
                onAdjust(a);
              }}
              onDiscard={() => settle(m.id, 'discarded', 'Descartado. Nada mudou na agenda.')}
              onPickSlot={pickSlot}
              onPickAppointment={(req, item) => pickAppointment(m.id, req, item)}
              onShowDay={onShowDay}
              onOpenAppointment={onOpenAppointment} />


            )}
                {thinking &&
            <div className="flex items-center gap-2" role="status" aria-label="Assistente pensando">
                    <AssistantAvatar />
                    <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl bg-background px-3.5 py-3">
                      {[0, 1, 2].map((i) =>
                <span key={i} className="orni-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
                )}
                    </span>
                  </div>
            }
              </div>
          }
          </motion.div>
        }
      </AnimatePresence>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className={`relative flex h-12 items-center gap-2.5 rounded-2xl border bg-white pl-2.5 pr-1.5 shadow-sm transition-[border-color,box-shadow] duration-300 ${
        showRing ? 'border-transparent' : focused ? 'border-primary ring-4 ring-primary-soft' : 'border-border hover:border-border-strong'}`
        }>
        
        {traceKey > 0 && <FieldTrace traceKey={traceKey} visible={showRing || tracing} />}
        <OrniMark height={21} boost={tracing || thinking} className="ml-0.5" />
        <input
          ref={inputRef}
          aria-label="Assistente da agenda"
          aria-expanded={open}
          aria-controls="assistente-agenda-painel"
          placeholder="Peça algo: remarque a Ana para amanhã às 15h"
          value={draft}
          onFocus={() => {
            setFocused(true);
            start();
          }}
          onClick={start}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value) setArmed(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              collapse();
            }
          }}
          className="relative h-full min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none" />
        
        {hasConversation && !open &&
        <button type="button" onClick={() => setOpen(true)} className={`${cardButtonNeutral} relative hidden sm:inline-flex`}>
            Ver conversa
          </button>
        }
        <Button type="submit" size="md" aria-label="Enviar pedido" disabled={!draft.trim() || thinking} className="relative w-9 shrink-0 !px-0">
          <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </section>);

}

function AssistantAvatar() {
  return (
    <span className="mt-0.5 shrink-0 self-start" aria-hidden="true">
      <Logo variant="mark" withTile height={16} />
    </span>);

}

type BubbleProps = {
  message: Extract<ChatMessage, {role: 'assistant';}>;
  onConfirm: (a: PendingAction, by?: CancelledBy) => void;
  onUndo: () => void;
  onAdjust: (a: PendingAction) => void;
  onDiscard: () => void;
  onPickSlot: (intent: SlotIntent, iso: string, time: string, professionalId: string) => void;
  onPickAppointment: (req: PickRequest, item: {iso: string;appt: CalAppointment;}) => void;
  onShowDay: (iso: string) => void;
  onOpenAppointment: (iso: string, appt: CalAppointment) => void;
};

function AssistantBubble({ message, onConfirm, onUndo, onAdjust, onDiscard, onPickSlot, onPickAppointment, onShowDay, onOpenAppointment }: BubbleProps) {
  const { reply, actionState, doneText, canUndo, picked } = message;
  return (
    <div className="flex items-start gap-2">
      <AssistantAvatar />
      <div className="flex min-w-0 max-w-[92%] flex-col gap-2 sm:max-w-[85%]">
        <p className="w-fit rounded-2xl rounded-bl bg-background px-3.5 py-2 text-sm text-text-primary">{reply.text}</p>

        {/* W3 (A1-02): escolher qual horário (mesmo botão pequeno dos horários livres). */}
        {reply.pick &&
        <div className="flex w-fit max-w-full flex-col gap-1.5 rounded-xl border border-surface-muted p-3">
            {reply.pick.items.map((it) =>
          <button
            key={it.appt.id}
            type="button"
            disabled={picked}
            onClick={() => reply.pick && onPickAppointment(reply.pick, it)}
            className={`${smallButton} justify-start text-left disabled:cursor-default disabled:opacity-60`}>
            
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: proColor(it.appt.professionalId) }} aria-hidden="true" />
                {pickLabel(it.iso, it.appt)}
              </button>
          )}
          </div>
        }

        {reply.slots &&
        <div className="flex w-fit max-w-full flex-col gap-2.5 rounded-xl border border-surface-muted p-3">
            {reply.slots.groups.map((g) =>
          <div key={g.professionalId + g.iso}>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: proColor(g.professionalId) }} aria-hidden="true" />
                  {proName(g.professionalId)} · {mediumDayLabel(g.iso)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.times.map((time) =>
              <button
                key={time}
                type="button"
                onClick={() => reply.slots && onPickSlot(reply.slots.intent, g.iso, time, g.professionalId)}
                aria-label={`${time} com ${proName(g.professionalId)}`}
                className={`${smallButton} tabular-nums`}>
                
                      {time}
                    </button>
              )}
                </div>
              </div>
          )}
          </div>
        }

        {reply.day &&
        <div className="rounded-xl border border-surface-muted p-1.5">
            {reply.day.items.length > 0 &&
          <ul className="flex flex-col">
                {reply.day.items.map((a) => {
              const off = a.status === 'cancelled' || a.status === 'no_show';
              return (
                <li key={a.id}>
                      <button
                    type="button"
                    onClick={() => reply.day && onOpenAppointment(reply.day.iso, a)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    
                        <span className="w-11 shrink-0 font-bold tabular-nums text-text-primary">{a.start}</span>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: proColor(a.professionalId) }} aria-hidden="true" />
                        <span className={`min-w-0 flex-1 truncate ${off ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                          {a.clientName}
                          <span className="text-text-muted"> · {a.service}</span>
                        </span>
                      </button>
                    </li>);

            })}
              </ul>
          }
            <div className="px-2 pb-1 pt-1.5">
              <button type="button" onClick={() => reply.day && onShowDay(reply.day.iso)} className={cardButton}>
                Abrir {dayWord(reply.day.iso)} na agenda
                <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        }

        {reply.action && <ActionCard action={reply.action} state={actionState ?? 'pending'} doneText={doneText} canUndo={!!canUndo} onConfirm={onConfirm} onUndo={onUndo} onAdjust={onAdjust} onDiscard={onDiscard} />}
        {!reply.action && doneText && <p className="text-xs text-text-muted">{doneText}</p>}
      </div>
    </div>);

}

function ActionCard({
  action,
  state,
  doneText,
  canUndo,
  onConfirm,
  onUndo,
  onAdjust,
  onDiscard









}: {action: PendingAction;state: ActionState;doneText?: string;canUndo: boolean;onConfirm: (a: PendingAction, by?: CancelledBy) => void;onUndo: () => void;onAdjust: (a: PendingAction) => void;onDiscard: () => void;}) {
  const [by, setBy] = useState('');
  const [tried, setTried] = useState(false);
  const title = action.kind === 'remarcar' ? 'Remarcar horário' : action.kind === 'cancelar' ? 'Cancelar horário' : 'Novo agendamento';
  const client = action.kind === 'agendar' ? action.client : action.appt.clientName;
  const service = action.kind === 'agendar' ? action.service : action.appt.service;
  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${state === 'pending' ? 'border-border-strong bg-white' : 'border-surface-muted bg-hover-surface'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <p className="mt-1 text-sm font-bold text-text-primary">
        {client} <span className="font-normal text-text-secondary">· {service}</span>
      </p>
      <div className="mt-1.5 flex flex-col gap-0.5 text-sm tabular-nums">
        {action.kind === 'remarcar' &&
        <>
            <span className="text-text-muted line-through decoration-border-strong">{proLine(action.fromIso, action.appt.start, action.appt.professionalId)}</span>
            <span className="text-text-primary">{proLine(action.toIso, action.time, action.professionalId)}</span>
          </>
        }
        {action.kind === 'cancelar' && <span className="text-text-primary">{proLine(action.iso, action.appt.start, action.appt.professionalId)}</span>}
        {action.kind === 'agendar' && <span className="text-text-primary">{proLine(action.iso, action.time, action.professionalId)}</span>}
      </div>

      {state === 'pending' && action.kind === 'cancelar' &&
      <div className="mt-3">
          {/* W3 (G3): quem cancelou, obrigatório, começa vazio. */}
          <PillGroup label="Quem cancelou?" size="sm" options={WHO_CANCELLED} value={by} onChange={(v) => typeof v === 'string' && setBy(v)} />
          {tried && !by &&
        <p role="alert" className="mt-1 text-sm text-error">
              Escolha quem cancelou.
            </p>
        }
        </div>
      }

      {state === 'pending' ?
      <div className="mt-3 flex flex-wrap gap-2">
          <Button
          size="md"
          variant={action.kind === 'cancelar' ? 'danger' : 'primary'}
          onClick={() => {
            if (action.kind === 'cancelar') {
              setTried(true);
              if (!by) return;
              onConfirm(action, by as CancelledBy);
              return;
            }
            onConfirm(action);
          }}>
          
            {action.kind === 'cancelar' ? 'Cancelar horário' : 'Confirmar'}
          </Button>
          <Button size="md" variant="secondary" onClick={() => onAdjust(action)}>
            {action.kind === 'cancelar' ? 'Ver detalhes' : 'Ajustar'}
          </Button>
          <Button size="md" variant="neutral" onClick={onDiscard}>
            Descartar
          </Button>
        </div> :

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className={`flex items-center gap-1.5 text-sm ${state === 'done' ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>
            {state === 'done' && <CheckCircle2Icon className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
            {doneText}
          </p>
          {/* W3 (A1-02): Desfazer no próprio cartão do resultado. */}
          {state === 'done' && canUndo &&
        <Button size="md" variant="neutral" leftIcon={<Undo2Icon className="h-4 w-4" />} onClick={onUndo}>
              Desfazer
            </Button>
        }
        </div>
      }
    </div>);

}