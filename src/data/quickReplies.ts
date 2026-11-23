import { useSyncExternalStore } from 'react';
import { useServices } from './servicesStore';
import { useSavedStore } from './iaConfigStore';
import { empresaStore } from './empresa';
import { conhecimentoStore } from './conhecimento';
import { answerQuestion, norm, registryTopicOf } from './assistantAnswer';
import type { QuickReply } from '../components/Card';

/*
 * T1 1b (O-09, decisão do Christian, 04/11/2026): RESPOSTAS RÁPIDAS do compositor de Conversas.
 * Sugestões automáticas (só leitura):
 *  1. Cadastro: Endereço, Horário de funcionamento e Formas de pagamento, com o MESMO texto que a assistente usaria
 *     (`answerQuestion`, data/assistantAnswer.ts). Sem cadastro completo (a resposta passaria para a equipe), não entra.
 *  2. Conhecimento: perguntas COM resposta cujo assunto não tem cadastro próprio (`registryTopicOf` = null).
 * T1 1c (04/11, Christian): limite total, editáveis. As automáticas ocupam as primeiras vagas; a equipe remove qualquer
 * uma (×) e adiciona as suas (+). SÓ ATALHO da equipe: não entram no Conhecimento e não mudam o que a assistente
 * responde. Valem para a clínica toda (todas as conversas). T1 1d (05/11, Christian): limite 4 → 10.
 * PROTÓTIPO: fica na sessão. No produto: lista de respostas rápidas da clínica (contrato novo, adendo T2).
 * A resposta entra no campo para a pessoa revisar; nunca sai sozinha.
 */
export const MAX_QUICK_REPLIES = 10;
export const QUICK_LABEL_MAX = 30;
export const QUICK_TEXT_MAX = 1000;

const FROM_REGISTRY: {id: string;label: string;question: string;}[] = [
{ id: 'endereco', label: 'Endereço', question: 'Onde fica o endereço?' },
{ id: 'horario', label: 'Horário de funcionamento', question: 'Qual o horário de funcionamento?' },
{ id: 'pagamento', label: 'Formas de pagamento', question: 'Quais formas de pagamento vocês aceitam?' }];


/** "Vocês têm estacionamento?" → "Estacionamento". Sem padrão conhecido, a pergunta sem o "?". */
export function shortLabelOf(question: string) {
  const q = question.trim().replace(/[?.!]+$/, '');
  const m = q.match(/^(?:vocês|voces|vcs)?\s*(?:têm|tem|fazem|aceitam|emitem|vendem)\s+(?:o|a|os|as)?\s*(.+)$/i);
  const core = (m?.[1] ?? q).trim();
  return core.charAt(0).toUpperCase() + core.slice(1);
}

type Slot = {kind: 'auto';id: string;} | {kind: 'equipe';id: string;label: string;text: string;};
let slots: Slot[] | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
let seq = 0;

function useAutoReplies(): QuickReply[] {
  const { services } = useServices();
  const empresa = useSavedStore(empresaStore);
  const { items } = useSavedStore(conhecimentoStore);
  const ctx = { empresa, services, knowledge: items, cannotDo: [] as string[] };
  const out: QuickReply[] = [];
  for (const r of FROM_REGISTRY) {
    const a = answerQuestion(r.question, ctx);
    if (a.text && !a.handoff) out.push({ id: r.id, label: r.label, text: a.text });
  }
  const seen = new Set(out.map((o) => norm(o.label)));
  for (const k of items) {
    if (!k.question.trim() || !k.answer.trim() || registryTopicOf(k.question)) continue;
    const label = shortLabelOf(k.question);
    if (seen.has(norm(label))) continue;
    seen.add(norm(label));
    out.push({ id: `kb-${k.id}`, label, text: k.answer.trim() });
  }
  return out;
}

export type QuickRepliesApi = {
  replies: QuickReply[];
  /** Sugestões do cadastro/Conhecimento que não estão na lista (para voltar com o +). */
  suggestions: QuickReply[];
  canAdd: boolean;
  add: (label: string, text: string) => void;
  addSuggestion: (id: string) => void;
  remove: (id: string) => void;
};

export function useQuickReplies(): QuickRepliesApi {
  useSyncExternalStore(subscribe, () => version);
  const autos = useAutoReplies();
  if (slots === null) slots = autos.slice(0, MAX_QUICK_REPLIES).map((a) => ({ kind: 'auto' as const, id: a.id }));
  const replies: QuickReply[] = [];
  for (const s of slots) {
    if (s.kind === 'equipe') replies.push({ id: s.id, label: s.label, text: s.text });else
    {
      const a = autos.find((x) => x.id === s.id);
      if (a) replies.push(a);
    }
  }
  const taken = new Set(slots.map((s) => s.id));
  const canAdd = replies.length < MAX_QUICK_REPLIES;
  return {
    replies,
    suggestions: autos.filter((a) => !taken.has(a.id)),
    canAdd,
    add: (label, text) => {
      if (!slots || !canAdd) return;
      seq += 1;
      slots = [...slots, { kind: 'equipe', id: `eq-${Date.now().toString(36)}-${seq}`, label: label.trim().slice(0, QUICK_LABEL_MAX), text: text.trim().slice(0, QUICK_TEXT_MAX) }];
      emit();
    },
    addSuggestion: (id) => {
      if (!slots || !canAdd || taken.has(id)) return;
      slots = [...slots, { kind: 'auto', id }];
      emit();
    },
    remove: (id) => {
      if (!slots) return;
      slots = slots.filter((s) => s.id !== id);
      emit();
    }
  };
}