import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../Button';
import { MAX_QUICK_REPLIES, QUICK_LABEL_MAX, QUICK_TEXT_MAX } from '../../data/quickReplies';
import type { QuickReply } from '../Card';

/**
 * T1 1c (04/11, Christian): formulário curto do "+" das respostas rápidas. Botão (como aparece) + resposta (o texto que
 * entra no campo). Só atalho da equipe: não entra no Conhecimento da assistente. Sugestões do cadastro que saíram da lista
 * podem voltar com um clique. T1 1d: limite de 10.
 * R5 (06/11/2026, A-38): no limite, o "+" continua na linha e, ao clicar, explica o limite em texto visível (padrão do DS:
 * motivo em texto perto do botão, ui-patterns.md › Botões; como o "Adicionar passo" do FollowUpEditor) com "Fechar"
 * (`Button neutral sm`). Antes o "+" sumia sem explicação. O "+" desativado com o motivo ao lado exige mudar o `Composer`
 * (v3.19) e ficou para a revisão do DS.
 */
export function QuickReplyForm({ onAdd, onAddSuggestion, suggestions, onClose, full = false }: {onAdd: (label: string, text: string) => void;onAddSuggestion: (id: string) => void;suggestions: QuickReply[];onClose: () => void;full?: boolean;}) {
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ;(first.current ?? closeRef.current)?.focus();
  }, []);
  const okLabel = label.trim().length > 0;
  const okText = text.trim().length > 0;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!okLabel || !okText) return;
    onAdd(label, text);
    onClose();
  };
  const field = 'w-full rounded-[10px] border bg-white px-3 text-sm text-[#0B2B2A] placeholder:text-[#7A9593] focus:outline-none focus:ring-2';
  const tone = (ok: boolean) => tried && !ok ? 'border-[#B91C1C] focus:ring-[#B91C1C]/25' : 'border-[#C7DAD8] focus:border-[#0E7490] focus:ring-[#0E7490]/25';
  if (full)
  return (
    <div role="status" onKeyDown={(e) => e.key === 'Escape' && onClose()} className="flex flex-wrap items-center gap-2 rounded-inner border border-border bg-hover-surface p-3">
        <p className="min-w-0 flex-1 basis-56 text-sm text-text-secondary">
          Limite de {MAX_QUICK_REPLIES} respostas rápidas. Para criar outra, remova uma no × ao lado do nome.
        </p>
        <Button ref={closeRef} size="sm" variant="neutral" type="button" onClick={onClose}>
          Fechar
        </Button>
      </div>);

  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Nova resposta rápida" className="rounded-xl border border-[#D7E7E5] bg-[#F8FAFA] p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(140px,200px)_1fr]">
        <div>
          <label htmlFor="qr-label" className="mb-1 block text-xs font-semibold text-[#3F5957]">
            Nome do botão
          </label>
          <input ref={first} id="qr-label" value={label} maxLength={QUICK_LABEL_MAX} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: O que levar" aria-invalid={tried && !okLabel || undefined} className={`${field} h-9 ${tone(okLabel)}`} />
        </div>
        <div>
          <label htmlFor="qr-text" className="mb-1 block text-xs font-semibold text-[#3F5957]">
            Resposta
          </label>
          <input id="qr-text" value={text} maxLength={QUICK_TEXT_MAX} onChange={(e) => setText(e.target.value)} placeholder="O texto que entra no campo para você revisar" aria-invalid={tried && !okText || undefined} className={`${field} h-9 ${tone(okText)}`} />
        </div>
      </div>
      {tried && (!okLabel || !okText) && <p className="mt-1.5 text-xs text-[#991B1B]">Preencha o nome do botão e a resposta.</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {suggestions.length > 0 &&
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-[#587371]">
            Do cadastro:
            {suggestions.map((s) =>
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onAddSuggestion(s.id);
              onClose();
            }}
            className="rounded-full border border-[#C7DAD8] bg-white px-2.5 py-0.5 font-semibold text-[#0B2B2A] hover:border-[#0E7490] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7490]">
            
                {s.label}
              </button>
          )}
          </span>
        }
        <span className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="neutral" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" type="submit">
            Adicionar
          </Button>
        </span>
      </div>
      <p className="mt-2 text-xs text-[#587371]">Até {MAX_QUICK_REPLIES} respostas rápidas. Valem só para a equipe; a assistente não usa.</p>
    </form>);

}