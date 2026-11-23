import { Alert } from '../Card';
import React, { useState } from 'react';
import { Card, CardTitle, CardDescription, InfoTip } from '../Card';
import { Pill } from '../Pill';
import { Button } from '../Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/**
 * Peças de formulário da IA Orniplaty, montadas só com peças do design system (Card, InfoTip, Pill, Button).
 * - `FieldLabel`: rótulo + "i" (InfoTip) com uma frase dizendo para que a assistente usa o campo.
 * - `SectionCard`: seção em cartão com título + 1 linha "A assistente usa isto para…" e prévia opcional ao lado
 *   (Lote F: a prévia fica visível enquanto a pessoa rola a seção, `lg:sticky`).
 * - `ExampleHint`: exemplo em texto suave + "Usar este exemplo". Fica ENTRE o rótulo e o campo (Lote E, E4; DS v3.14).
 * - `StickySaveBar`: rodapé fixo com "Salvar alterações" (botão de rodapé de página, 44px).
 */
export function FieldLabel({
  htmlFor,
  children,
  tip,
  optional





}: {htmlFor?: string;children: React.ReactNode;tip?: React.ReactNode;optional?: boolean;}) {
  // R2 (06/11/2026, A-41): rótulo que já termina em "?" não ganha outro na dica ("O que é …?").
  const label = typeof children === 'string' ? children.replace(/\?$/, '') : 'Ajuda';
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      {htmlFor ?
      <label htmlFor={htmlFor} className="text-sm font-semibold text-text-primary">
          {children}
          {optional && <span className="font-normal text-text-muted"> (opcional)</span>}
        </label> :

      <span className="text-sm font-semibold text-text-primary">
          {children}
          {optional && <span className="font-normal text-text-muted"> (opcional)</span>}
        </span>
      }
      {tip && <InfoTip label={label} content={tip} />}
    </div>);

}

export function SectionCard({
  id,
  title,
  purpose,
  aside,
  children






}: {id: string;title: string;purpose: string;aside?: React.ReactNode;children: React.ReactNode;}) {
  return (
    <Card as="section" padding="lg" id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-6">
      <CardTitle as="h2" id={`${id}-titulo`}>
        {title}
      </CardTitle>
      <CardDescription>{purpose}</CardDescription>
      <div className={`mt-5 grid grid-cols-1 gap-6 ${aside ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]' : ''}`}>
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
        {/* Lote F (F5.4): a prévia acompanha a rolagem da seção no computador (≥ 1024px); no celular fica abaixo dos campos. */}
        {aside && <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">{aside}</div>}
      </div>
    </Card>);

}

/**
 * Exemplo com "Usar este exemplo". G1 (F-055): com `current` preenchido e diferente, pergunta antes de substituir.
 */
export function ExampleHint({ text, onUse, useLabel = 'Usar este exemplo', current }: {text: string;onUse?: () => void;useLabel?: string;current?: string;}) {
  const [asking, setAsking] = useState(false);
  const use = () => current && current.trim() && current.trim() !== text.trim() ? setAsking(true) : onUse?.();
  return (
    <div className="mb-2 flex flex-col items-start gap-2 text-xs text-text-muted sm:flex-row sm:items-center">
      <span>Exemplo: {text}</span>
      {onUse &&
      <Pill size="sm" addable onClick={use} className="shrink-0">
          {useLabel}
        </Pill>
      }
      <ConfirmDialog
        open={asking}
        title="Substituir o texto atual pelo exemplo?"
        description="O que está escrito neste campo será trocado pelo exemplo. Você ainda pode editar antes de salvar."
        confirmLabel="Substituir"
        cancelLabel="Manter o meu texto"
        onClose={() => setAsking(false)}
        onConfirm={() => onUse?.()} />
      
    </div>);

}

/** G1 (F-055): `error` = aviso geral da validação ("Confira os campos marcados."), mostrado ao lado do botão. */
export function StickySaveBar({ onSave, error, saveError }: {onSave: () => void;error?: string; /** G4 (F-066): falha ao salvar, com "Tentar de novo". */saveError?: string;}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-6 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-4 py-3 md:-mx-8 md:-mb-7 md:px-8 md:pr-24">
      {saveError &&
      <Alert
        compact
        variant="error"
        className="w-full"
        title="Não foi possível salvar"
        actions={
        <Button size="md" onClick={onSave}>
              Tentar de novo
            </Button>
        }>
        
          {saveError}
        </Alert>
      }
      {error &&
      <p role="alert" className="text-sm font-semibold text-error">
          {error}
        </p>
      }
      <Button size="lg" onClick={onSave}>
        Salvar alterações
      </Button>
    </div>);

}