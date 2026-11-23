import { wordsNow } from '../../data/segment';
import React, { useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { MessageBubble, MessageThread } from '../MessageBubble';
import { ClientChatHeader, ClientViewTitle } from './WhatsAppPreview';
import {
  DEFAULT_TONE,
  TONE_DEMO_COMMON_RULE,
  TONE_DEMO_DISCLAIMER,
  TONE_HIGHLIGHTS,
  TONE_OPTIONS,
  isToneValue,
  withIntro } from
'../../data/toneDemos';
import type { ToneValue } from '../../data/toneDemos';
import { assistantDisplayName } from '../../data/assistantIdentity';
import { useSavedStore } from '../../data/iaConfigStore';
import { empresaStore } from '../../data/empresa';
import { useToneDemos } from '../../data/toneDemoContext';

type VoiceTonePickerProps = {
  /** Uncontrolled initial value */
  defaultValue?: string;
  /** Controlled value (use with onChange) */
  value?: string;
  onChange?: (id: string) => void;
  /** Nome atual da assistente: aparece em cada balão dela */
  assistantName?: string;
  /** Oculta o título "Tom de voz" quando a seção já tem título */
  hideLegend?: boolean;
};

/** Cartão selecionado: contorno extra por anel (fora do fluxo), para o cartão não mudar de tamanho ao ser escolhido. */
const selectedCardClass = 'border border-primary ring-1 ring-primary bg-primary-soft/40';
const idleCardClass = 'border border-border hover:border-border-strong';

/**
 * Os 4 tons aprovados (P05) + exemplo de conversa SEMPRE visível (16/10/2026, decisão do Christian).
 * Altura FIXA ao trocar de tom (16/10/2026): as quatro conversas e as quatro listas ficam empilhadas
 * na mesma célula da grade; só a do tom escolhido aparece, e o bloco sempre tem a altura da maior.
 */
export function VoiceTonePicker({ defaultValue = '', value: controlled, onChange, assistantName, hideLegend }: VoiceTonePickerProps) {
  const [inner, setInner] = useState(defaultValue);
  const demos = useToneDemos();
  const value = controlled ?? inner;
  const choose = (id: string) => {
    setInner(id);
    onChange?.(id);
  };
  const demoTone: ToneValue = isToneValue(value) ? value : DEFAULT_TONE;
  const demoLabel = TONE_OPTIONS.find((t) => t.value === demoTone)?.label ?? '';
  const layer = (tone: ToneValue) => `col-start-1 row-start-1 ${tone === demoTone ? '' : 'invisible'}`;
  const senderName = assistantDisplayName(assistantName);
  const clinicName = useSavedStore(empresaStore).name.trim() || wordsNow().Your;

  return (
    <fieldset>
      <legend className={hideLegend ? 'sr-only' : 'text-sm font-bold text-text-primary'}>Tom de voz</legend>
      <div role="radiogroup" aria-label="Tom de voz" className={`${hideLegend ? '' : 'mt-2'} grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        {TONE_OPTIONS.map((tone) => {
          const selected = tone.value === value;
          return (
            <button
              key={tone.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(tone.value)}
              className={`relative flex flex-col items-start gap-1.5 rounded-xl bg-surface p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              selected ? selectedCardClass : idleCardClass}`
              }>
              
              <span className="flex w-full items-center justify-between gap-2">
                <span className={`text-sm font-bold ${selected ? 'text-primary' : 'text-text-primary'}`}>{tone.label}</span>
                {/* Espaço do check sempre reservado: o título não muda ao selecionar. */}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-primary text-primary-foreground' : ''}`}
                  aria-hidden="true">
                  
                  {selected && <CheckIcon className="h-3 w-3" />}
                </span>
              </span>
              <span className="text-xs font-semibold text-text-muted">{tone.desc}</span>
            </button>);

        })}
      </div>

      <section
        aria-label={`Exemplo de conversa no tom ${demoLabel}`}
        className="mt-3 flex flex-col gap-5 rounded-xl bg-background p-4 md:flex-row md:items-start md:gap-6 md:p-5">
        
        {/* Texto explicativo, alinhado ao topo. L19 (17/11/2026, Christian): textos à esquerda e celular à direita, como os
             outros blocos de Como atender (`SectionCard aside`); no celular, os textos vêm antes. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 text-sm text-text-secondary">
          <p className="font-bold text-text-primary">O que muda neste tom</p>
          <div className="grid">
            {TONE_OPTIONS.map(({ value: tone }) =>
            <ul key={tone} className={`flex flex-col gap-2 ${layer(tone)}`} aria-hidden={tone !== demoTone}>
                {TONE_HIGHLIGHTS[tone].map((h) =>
              <li key={h} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{h}</span>
                  </li>
              )}
              </ul>
            )}
          </div>
          <p>{TONE_DEMO_COMMON_RULE}</p>
          <p className="text-xs text-text-muted">{TONE_DEMO_DISCLAIMER}</p>
        </div>

        {/* Card do WhatsApp com largura de celular, como o CLIENTE vê (Lote E, E7): topo com a clínica, sem nome em cima dos balões */}
        <div className="flex w-full max-w-[370px] shrink-0 flex-col gap-2">
          <ClientViewTitle />
          <div className="w-full overflow-hidden rounded-xl shadow-sm">
          <ClientChatHeader clinicName={clinicName} />
          <div className="grid bg-whatsapp-background">
            {TONE_OPTIONS.map(({ value: tone }) =>
              <div key={tone} className={layer(tone)} aria-hidden={tone !== demoTone}>
                <MessageThread perspective="client" className="h-full rounded-none p-3 pb-4">
                  {demos[tone].map((m, i) =>
                  m.from === 'ai' ?
                  <MessageBubble key={i} sender="lia" timestamp={m.time}>
                        {i === 1 ? withIntro(tone, m.text, senderName, clinicName) : m.text}
                      </MessageBubble> :

                  <MessageBubble key={i} sender="client" timestamp={m.time}>
                        {m.text}
                      </MessageBubble>

                  )}
                </MessageThread>
              </div>
              )}
          </div>
          </div>
        </div>
      </section>
    </fieldset>);

}