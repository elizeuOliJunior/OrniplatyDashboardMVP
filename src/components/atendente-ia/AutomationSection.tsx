import React, { useState } from 'react';
import { NOW } from '../../data/agendaStore';
import { useBusinessName } from '../../data/empresa';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import { Card, clickableHoverClass } from '../Card';
import { Toggle } from '../Toggle';
import { Button } from '../Button';
import { StatusBadge } from '../StatusBadge';
import { AutomationRule } from './AutomationRule';
import { WhatsAppPreview } from './WhatsAppPreview';
import { assistantDisplayName } from '../../data/assistantIdentity';
import type { Automation } from '../../data/automacoes';
import { useSettings } from '../../data/settingsStore';

const MESSAGE_BADGE = {
  liberada: { tone: 'success', label: 'Liberada' },
  'em-analise': { tone: 'warning', label: 'Em análise' },
  recusada: { tone: 'error', label: 'Recusada' },
  'nao-enviada': { tone: 'neutral', label: 'Não enviada' }
} as const;

type AutomationSectionProps = {
  automation: Automation;
  /** Estado vindo da página (rascunho com proteção de alterações não salvas) */
  enabled: boolean;
  values: Record<string, number>;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (id: string, value: number) => void;
  /** Campanha ligada que o modo escolhido segura (ex.: modo Pausado) */
  blocked?: boolean;
  assistantName?: string;
  /** Conteúdo extra abaixo da regra (ex.: serviços que usam o retorno). */
  extra?: React.ReactNode;
};

/**
 * Cartão de automação (mesmo padrão do Onboarding, etapa 9): nome claro, liga/desliga, "O que faz", "Quando acontece",
 * "Quem recebe", regra editável e "Ver exemplo de mensagem" com prévia no WhatsApp. O cabeçalho inteiro expande
 * (hover único dos clicáveis). Automação com `pendingApproval`: interruptor bloqueado com o motivo visível, mas o cartão abre normalmente.
 * 20/10/2026: cada automação mostra a situação da mensagem dela no WhatsApp (mesmos rótulos de Configurações › WhatsApp).
 * Lote B (20/10/2026): `extra` mostra conteúdo abaixo da regra (ex.: serviços com retorno).
 */
export function AutomationSection({ automation, enabled, values, onEnabledChange, onValueChange, blocked, assistantName, extra }: AutomationSectionProps) {
  const pending = automation.pendingApproval;
  const settings = useSettings();
  const msgStatus = automation.id === 'confirmacao' ? settings.templates.lembrete : automation.messageStatus;
  const msg = msgStatus ? MESSAGE_BADGE[msgStatus] : null;
  const [open, setOpen] = useState(Boolean(automation.defaultOpen));
  const [showExample, setShowExample] = useState(false);
  const panelId = `automacao-${automation.id}`;
  const companyName = useBusinessName();
  const exampleText = automation.example.text.replace('{assistente}', assistantDisplayName(assistantName)).replace('{empresa}', companyName);

  return (
    <Card as="section" padding="none" aria-labelledby={`${panelId}-titulo`}>
      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`group flex min-w-0 flex-1 items-start gap-3 rounded-[10px] border border-transparent px-2 py-2 text-left ${clickableHoverClass}`}>
          
          <ChevronDownIcon
            className={`mt-0.5 h-5 w-5 shrink-0 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true" />
          
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <h3 id={`${panelId}-titulo`} className="text-base font-bold text-text-primary">
                {automation.name}
              </h3>
              {!pending && enabled && blocked && <StatusBadge status="warning" label="Pausada pelo modo" />}
            </span>
            <span className="mt-1 block text-sm text-text-secondary">{automation.what}</span>
            {msg &&
            <span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted">
                Mensagem no WhatsApp
                <StatusBadge status={msg.tone} label={msg.label} />
                {msgStatus === 'nao-enviada' && <span className="font-normal">{enabled ? 'Ainda não foi enviada para o WhatsApp aprovar.' : 'Enviamos para o WhatsApp aprovar quando você ligar a campanha.'}</span>}
              </span>
            }
            {!pending && enabled && blocked &&
            <span className="mt-1 block text-xs text-text-muted">No modo Pausado nada é enviado: em Oportunidades você copia a mensagem e marca quem foi chamado.</span>
            }
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-start gap-1 pl-10 sm:items-end sm:pl-0">
          <Toggle checked={pending ? false : enabled} onCheckedChange={onEnabledChange} disabled={Boolean(pending)} aria-label={automation.name} />
          {pending && <span className="max-w-[220px] text-xs text-text-muted sm:text-right">{pending.reason}</span>}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open &&
        <motion.div
          id={panelId}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="overflow-hidden">
          
            <div className="grid grid-cols-1 gap-6 border-t border-border px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
              <div className="flex flex-col gap-4">
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
                  <dt className="font-semibold text-text-primary">O que faz</dt>
                  <dd className="text-text-secondary">{automation.what}</dd>
                  <dt className="font-semibold text-text-primary">Quando acontece</dt>
                  <dd className="text-text-secondary">{automation.when}</dd>
                  <dt className="font-semibold text-text-primary">Quem recebe</dt>
                  <dd className="text-text-secondary">{automation.who}</dd>
                </dl>
                <div>
                  <p className="mb-2 text-sm font-semibold text-text-primary">Regra</p>
                  <AutomationRule segments={automation.rule} values={values} editable={!pending} onValueChange={onValueChange} />
                </div>
                {extra}
                <div>
                  <Button type="button" variant="secondary" size="md" aria-expanded={showExample} onClick={() => setShowExample((v) => !v)}>
                    {showExample ? 'Ocultar exemplo' : 'Ver exemplo de mensagem'}
                  </Button>
                </div>
              </div>
              {showExample &&
            <WhatsAppPreview
              title="Exemplo de mensagem"
              contactName={automation.example.contact}
              assistantName={assistantName}
              messages={[{ from: 'ai', text: exampleText, time: NOW, buttons: automation.example.buttons }]}
              caption="Nome, serviço e horário mudam para cada cliente." />

            }
            </div>
          </motion.div>
        }
      </AnimatePresence>
    </Card>);

}