import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { MOTIVE_AUTOMATION, automationSituation } from '../../data/automacoes';
import React, { useEffect, useState } from 'react';
import { NOW } from '../../data/agendaStore';
import { useBusinessName } from '../../data/empresa';
import { CalendarCheckIcon, CalendarXIcon, ListOrderedIcon, MessageCircleIcon, PackageIcon, RepeatIcon, UserMinusIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, InfoTip } from '../Card';
import { Toggle } from '../Toggle';
import { Button } from '../Button';
import { StatusBadge } from '../StatusBadge';
import { AutomationRule } from './AutomationRule';
import { WhatsAppPreview } from './WhatsAppPreview';
import { assistantDisplayName } from '../../data/assistantIdentity';
import type { Automation, AutomationMode } from '../../data/automacoes';
import { useSettings } from '../../data/settingsStore';

const ICONS: Record<string, LucideIcon> = {
  confirmacao: CalendarCheckIcon,
  'lista-espera': ListOrderedIcon,
  retorno: RepeatIcon,
  faltou: CalendarXIcon,
  retomada: MessageCircleIcon,
  pacotes: PackageIcon,
  reativacao: UserMinusIcon
};

/**
 * L10 (16/11/2026): primeira frase visível; o resto vai para o "i" (regra do cartão de automação, owner-config-screens).
 * Corta no primeiro ponto final seguido de letra maiúscula (as frases dos dados não têm abreviações com ponto).
 */
export function splitFirstSentence(text: string): [string, string] {
  const m = /[.!?](\s+)(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ“"])/.exec(text);
  if (!m) return [text, ''];
  const cut = m.index + 1;
  return [text.slice(0, cut), text.slice(cut).trim()];
}

function OneLine({ text, tipLabel, prefix }: {text: string;tipLabel: string;prefix?: string;}) {
  const [first, rest] = splitFirstSentence(text);
  return (
    <span className="inline">
      {prefix}
      {first}
      {rest &&
      <span className="ml-1 inline-flex align-middle">
          <InfoTip label={tipLabel} content={rest} />
        </span>
      }
    </span>);

}

type AutomationCardProps = {
  automation: Automation;
  enabled: boolean;
  values: Record<string, number>;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (id: string, value: number) => void;
  /** Modo de envio do rascunho (vale só para as campanhas). */
  mode?: AutomationMode;
  isCampaign?: boolean;
  assistantName?: string;
  /** Conteúdo do "Ajustar" além da regra (ex.: Lembrar o cliente de voltar). */
  adjust?: React.ReactNode;
  /** C2 (ajustes do Lote C, 21/10/2026): destaque temporário quando a pessoa chega por ?campanha=<id>. */
  highlighted?: boolean;
  /** G1 (F-055): erros das regras numéricas depois de tentar salvar (o "Ajustar" abre sozinho quando há erro). */
  ruleErrors?: Record<string, string>;
  /** L10: o liga/desliga mudou e ainda não foi salvo (mostra "· falta salvar" ao lado do estado). */
  unsaved?: boolean;
};

/**
 * Cartão de automação (ajustes do Lote B, B7/B8, 21/10/2026 — padrão "Cartão de automação" do design system v3.12):
 * nome simples, "Pra que serve", "Quando acontece", liga/desliga grande com o estado em texto, exemplo SEMPRE aberto
 * (ao lado no computador, abaixo no celular) e "Ajustar" para os detalhes (fechado por padrão).
 *
 * W6 (11/11/2026, A5-07, remoção aprovada pelo Christian): saíram o selo "Pausada pelo modo" e a linha separada
 * "Mensagem no WhatsApp · Liberada". No lugar, UMA situação (selo + frase, `automationSituation` em data/automacoes.ts)
 * que junta liga/desliga, modo, aprovação do WhatsApp (G17), WhatsApp da clínica (A5-03) e limite do mês (G19).
 *
 * L10 (16/11/2026): "Pra que serve", "Quando acontece" e "Situação hoje" mostram uma frase; o resto vai para o "i" de
 * cada linha. Liga/desliga mudado e não salvo: "Ligada · falta salvar" e a frase da situação começa com "Depois de salvar:".
 * L12 (17/11/2026): um estado só no cartão. Enquanto há mudança não salva no liga/desliga, o selo embaixo do título fica
 * escondido (o lugar dele continua reservado, para nada pular); o estado está ao lado do liga/desliga. Depois de salvar,
 * o selo volta com o estado salvo, como antes.
 */
export function AutomationCard({ automation, enabled, values, onEnabledChange, onValueChange, mode = 'pausado', isCampaign, assistantName, adjust, highlighted = false, ruleErrors = {}, unsaved = false }: AutomationCardProps) {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const hasError = automation.rule.some((r) => typeof r !== 'string' && !!ruleErrors[r.id]);
  useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);
  const situation = automationSituation(automation, enabled, mode, settings);
  const Icon = ICONS[automation.id] ?? MessageCircleIcon;
  const panelId = `automacao-${automation.id}-ajustes`;
  const titleId = `automacao-${automation.id}-titulo`;
  const companyName = useBusinessName();
  const exampleText = (automation.exampleFor ? automation.exampleFor(values) : automation.example.text).replace('{assistente}', assistantDisplayName(assistantName)).replace('{empresa}', companyName);
  const editable = automation.rule.some((r) => typeof r !== 'string');
  const canAdjust = editable || !!adjust;
  const when = automation.whenFor ? automation.whenFor(values) : automation.when;
  const navigate = useGuardedNavigate();
  const heldMotive = (Object.entries(MOTIVE_AUTOMATION).find(([, id]) => id === automation.id) ?? [null])[0];
  const stateText = `${enabled ? 'Ligada' : 'Desligada'}${unsaved ? ' · falta salvar' : ''}`;

  return (
    // C2: id do cartão (`automacao-<id>`) e do liga/desliga (`automacao-<id>-liga`) para o link direto de "Abrir Automações".
    // Destaque = cartão marcado do design system (v3.13, rules/stable-selection-and-deep-links.md): borda + anel de 1px + fundo #F1F5F5.
    <Card
      as="section"
      padding="lg"
      id={`automacao-${automation.id}`}
      aria-labelledby={titleId}
      className={`scroll-mt-6 transition-colors duration-500 motion-reduce:transition-none ${highlighted ? '!border-primary !bg-active-surface ring-1 ring-primary' : ''}`}>
      
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-primary-soft text-primary" aria-hidden="true">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 id={titleId} className="text-base font-extrabold text-text-primary">
                  {automation.name}
                </h3>
                {/* L12: com mudança pendente, o selo some (fica só o estado ao lado do liga/desliga); o espaço continua. */}
                <div className={`mt-1.5 ${unsaved ? 'invisible' : ''}`} aria-hidden={unsaved || undefined}>
                  <StatusBadge status={situation.tone} label={situation.label} />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <span className={`text-right text-sm font-bold ${enabled ? 'text-primary' : 'text-text-muted'}`} aria-hidden="true">
                {enabled ? 'Ligada' : 'Desligada'}
                {unsaved && <span className="block text-xs font-semibold text-text-secondary sm:inline sm:text-sm"> · falta salvar</span>}
              </span>
              <Toggle id={`automacao-${automation.id}-liga`} size="lg" checked={enabled} onCheckedChange={onEnabledChange} aria-label={`${automation.name}: ${stateText.toLowerCase()}`} />
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-y-2">
            <dt className="font-semibold text-text-primary">Pra que serve</dt>
            <dd className="mb-2 text-text-secondary sm:mb-0">
              <OneLine text={automation.what} tipLabel="o resto do que ela faz" />
            </dd>
            <dt className="font-semibold text-text-primary">Quando acontece</dt>
            <dd className="mb-2 text-text-secondary sm:mb-0">
              <OneLine text={when} tipLabel="o resto de quando ela sai" />
            </dd>
            <dt className="font-semibold text-text-primary">Situação hoje</dt>
            <dd className="text-text-secondary">
              <OneLine text={situation.text} tipLabel="o resto da situação" prefix={unsaved ? 'Depois de salvar: ' : undefined} />
            </dd>
          </dl>

          {(canAdjust || isCampaign && heldMotive && situation.toOpportunities) &&
          <div className="flex flex-wrap gap-2">
              {canAdjust &&
            <Button variant="secondary" size="md" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
                  {open ? 'Fechar ajustes' : 'Ajustar'}
                </Button>
            }
              {isCampaign && heldMotive && situation.toOpportunities &&
            <Button size="md" variant="secondary" onClick={() => navigate(`/oportunidades?aba=${heldMotive}`)}>
                  Ver clientes em Oportunidades
                </Button>
            }
            </div>
          }
        </div>

        {/* Lote E (E7): como o cliente vê. O nome da clínica fica no topo da conversa, não em cima do balão. */}
        <WhatsAppPreview
          title="Exemplo de mensagem"
          messages={[{ from: 'ai', text: exampleText, time: NOW, buttons: automation.example.buttons }]}
          caption="Nome, serviço e horário mudam para cada cliente." />
        
      </div>

      {canAdjust && open &&
      <div id={panelId} className="mt-5 flex flex-col gap-5 border-t border-border pt-5">
          {editable &&
        <div>
              <p className="mb-2 text-sm font-semibold text-text-primary">Regra</p>
              <AutomationRule segments={automation.rule} values={values} editable onValueChange={onValueChange} errors={ruleErrors} />
            </div>
        }
          {adjust}
        </div>
      }
    </Card>);

}