import { businessWords } from '../../data/segment';
import React, { useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Card, InfoTip, StatusIcon, clickableCardClass, clickableRowClass, clickableChevronClass, completionTone } from '../Card';
import { Button } from '../Button';
import { ProgressBar } from '../ProgressBar';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { useSavedStore } from '../../data/iaConfigStore';
import { empresaStore, isAddressComplete, firstMissingAddressField } from '../../data/empresa';
import { paymentReadiness } from '../../data/paymentRules';
import { useServices } from '../../data/servicesStore';
import { activeServicesOf } from '../../data/servicesStore';
import { atendimentoStore } from '../../data/comoAtender';
import { MIN_ANSWERED, answeredCount, conhecimentoStore } from '../../data/conhecimento';
import { useAccountContacts } from '../../data/accountStore';
import { isActiveMember, useTeam } from '../../data/availability';

export type ReadinessItem = {id: string;label: string;done: boolean;to: string;detail?: string; /** Observação mostrada mesmo quando pronto (G1, F-012). */note?: string;};

/**
 * Os 10 itens que a assistente precisa conhecer (conta só o que está SALVO). Usado pelo cartão de prontidão e pela
 * confirmação de "Ligar a assistente" (Lote E, E1). G1 (F-013): serviços, horário e profissionais são CALCULADOS dos stores
 * de Serviços e equipe (antes eram `done: true` fixos).
 */
export function useReadiness() {
  const empresa = useSavedStore(empresaStore);
  const team = useTeam();
  const atendimento = useSavedStore(atendimentoStore);
  const conhecimento = useSavedStore(conhecimentoStore);
  const { services } = useServices();
  // "WhatsApp para avisos" mora em Configurações › Conta (decisão 3 A, 20/10/2026): no backend é um campo só (tenant.phone)
  const { alertsPhone } = useAccountContacts();
  return computeReadiness({ empresa, team, atendimento, conhecimento, services, alertsPhone });
}

type ReadinessInput = {
  empresa: ReturnType<typeof empresaStore.get>;
  team: ReturnType<typeof useTeam>;
  atendimento: ReturnType<typeof atendimentoStore.get>;
  conhecimento: ReturnType<typeof conhecimentoStore.get>;
  services: ReturnType<typeof useServices>['services'];
  alertsPhone: string;
};

/**
 * L21 (17/11/2026, V5 T1: "Falta o nome ou a descrição" continuava depois de preencher o nome): a linha diz EXATAMENTE o que
 * falta. A regra do item não mudou (pronto = nome E descrição salvos).
 */
function aboutDetail(name: string, description: string) {
  const noName = !name.trim();
  const noDescription = !description.trim();
  if (noName && noDescription) return 'Falta o nome e a descrição';
  if (noName) return 'Falta o nome';
  if (noDescription) return 'Falta a descrição';
  return undefined;
}

/** G4 · fechamento: o cálculo puro (mesmos valores dos stores), usado pelo hook e pelos testes de função. */
export function computeReadiness({ empresa, team, atendimento, conhecimento, services, alertsPhone }: ReadinessInput) {
  // Lote F: "Formas de pagamento" conta também as exceções de pagamento dos serviços (campo obrigatório vazio = pendente).
  const pay = paymentReadiness(empresa, services);
  const hasHandoff = atendimento.handoff.length > 0 || Boolean(atendimento.handoffOther.trim());
  const answered = answeredCount(conhecimento.items);
  const activeServices = activeServicesOf(services);
  const servicesWithoutPrice = activeServices.filter((s) => s.priceMode !== 'sob-consulta' && !(s.price > 0));
  const openDays = team.hours.filter((d) => d.open).length;
  const activeMembers = team.members.filter(isActiveMember).length;
  const items: ReadinessItem[] = [
  { id: 'sobre', label: `Sobre ${businessWords(empresa.segment).the}`, done: Boolean(empresa.name.trim() && empresa.description.trim()), to: '/atendente-ia/empresa?campo=sobre', detail: aboutDetail(empresa.name, empresa.description) },
  { id: 'endereco', label: 'Endereço', done: isAddressComplete(empresa), to: `/atendente-ia/empresa?campo=${firstMissingAddressField(empresa)}`, detail: 'Falta rua e número' },
  {
    id: 'pagamento',
    label: 'Formas de pagamento',
    done: pay.done,
    to: pay.to,
    detail: pay.detail
  },
  // G1 subetapa 4 (F-012): a mesma linha lê a política de FALTA salva (opcional; sem ela, a assistente passa para a equipe).
  {
    id: 'cancelamento',
    label: 'Regras de cancelamento e falta',
    done: Boolean(empresa.cancellationPolicy.trim()),
    to: empresa.cancellationPolicy.trim() && !empresa.noShowPolicy.trim() ? '/atendente-ia/empresa?campo=politica-falta' : '/atendente-ia/empresa?campo=politica-cancelamento',
    detail: empresa.noShowPolicy.trim() ? 'Falta escrever a regra de cancelamento' : 'Falta escrever a regra de cancelamento (e, se quiser, a de falta)',
    note: empresa.noShowPolicy.trim() ? undefined : 'Sem política de falta: quando o cliente faltar, a assistente passa para a equipe.'
  },
  {
    id: 'limites',
    label: 'Limites da assistente',
    done: atendimento.canDo.length > 0 && atendimento.cannotDo.length > 0,
    to: '/atendente-ia/como-atender?campo=limites',
    detail: 'Falta marcar o que ela pode e não pode fazer'
  },
  {
    id: 'quando-chamar',
    label: 'Quando chamar uma pessoa',
    done: hasHandoff && Boolean(alertsPhone.trim()),
    to: hasHandoff ? '/configuracoes?secao=conta' : '/atendente-ia/como-atender?campo=quando-chamar',
    detail: hasHandoff ? 'Falta o WhatsApp para avisos (em Configurações › Conta)' : 'Falta marcar quando chamar uma pessoa'
  },
  {
    id: 'perguntas',
    label: `Perguntas e respostas (pelo menos ${MIN_ANSWERED})`,
    done: answered >= MIN_ANSWERED,
    to: '/atendente-ia/conhecimento?campo=perguntas',
    detail: `${answered} de ${MIN_ANSWERED} respondidas`
  },
  {
    id: 'servicos',
    label: 'Serviços com preço',
    // Pelo menos um serviço ativo, e todo serviço ativo com preço informado ou marcado como "sob consulta".
    done: activeServices.length > 0 && servicesWithoutPrice.length === 0,
    to: '/servicos-equipe?aba=servicos',
    detail: activeServices.length === 0 ? 'Nenhum serviço ativo' : `${servicesWithoutPrice.length} ${servicesWithoutPrice.length === 1 ? 'serviço sem preço' : 'serviços sem preço'}`
  },
  { id: 'horario', label: 'Horário de funcionamento', done: openDays > 0, to: '/servicos-equipe?aba=funcionamento', detail: 'Nenhum dia de atendimento marcado' },
  { id: 'profissionais', label: 'Profissionais', done: activeMembers > 0, to: '/servicos-equipe?aba=equipe', detail: 'Nenhum profissional ativo' }];

  const missing = items.filter((i) => !i.done);
  const ready = items.filter((i) => i.done);
  const pct = Math.round(ready.length / items.length * 100);
  return { items, missing, ready, done: ready.length, total: items.length, pct };
}

/**
 * Lista em dois grupos (DS v3.14, owner-config-screens): o que falta em cartões com borda; o que está pronto em linhas com divisória.
 * L21: `missingTitle`/`readyTitle` opcionais (o primeiro acesso conta PASSOS, não os 10 itens). Sem eles, os títulos de sempre.
 */
export function ReadinessList({
  missing,
  ready,
  onOpen,
  id,
  missingTitle = (n: number) => `Falta completar (${n})`,
  readyTitle = (n: number) => `Já está pronto (${n})`







}: {missing: ReadinessItem[];ready: ReadinessItem[];onOpen: (to: string) => void;id?: string;missingTitle?: (n: number) => string;readyTitle?: (n: number) => string;}) {
  return (
    <div id={id} className="flex flex-col gap-5">
      {missing.length > 0 &&
      <section aria-labelledby={`${id ?? 'prontidao'}-falta`}>
          <h3 id={`${id ?? 'prontidao'}-falta`} className="text-sm font-bold text-text-primary">
            {missingTitle(missing.length)}
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {missing.map((item) =>
          <li key={item.id}>
                <button type="button" className={clickableCardClass} onClick={() => onOpen(item.to)}>
                  <StatusIcon tone="warning" size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">{item.label}</span>
                    {item.detail && <span className="block text-sm text-text-secondary">{item.detail}</span>}
                  </span>
                  <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                </button>
              </li>
          )}
          </ul>
        </section>
      }
      {ready.length > 0 &&
      <section aria-labelledby={`${id ?? 'prontidao'}-pronto`}>
          <h3 id={`${id ?? 'prontidao'}-pronto`} className="text-sm font-bold text-text-primary">
            {readyTitle(ready.length)}
          </h3>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {ready.map((item) =>
          <li key={item.id}>
                <button type="button" className={clickableRowClass} onClick={() => onOpen(item.to)}>
                  <StatusIcon tone="success" size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">{item.label}</span>
                    {item.note && <span className="block text-sm text-text-secondary">{item.note}</span>}
                  </span>
                  <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                </button>
              </li>
          )}
          </ul>
        </section>
      }
    </div>);

}

/**
 * Cartão de prontidão (topo de todas as abas da IA Orniplaty). Lote E (E2, 22/10/2026):
 * - barra com a porcentagem e `completionTone` (vermelho → âmbar → verde);
 * - em 10 de 10 o cartão continua (✓ antes do título, lista fechada, "Ver lista");
 * - lista em dois grupos (falta completar / já está pronto).
 * W6 (11/11/2026): a barra se chama "O que ela sabe" (A5-07: "Pronta para atender" contradizia "A assistente está
 * atendendo" logo acima) e a frase de baixo diz QUAIS itens faltam (A5-21).
 * L10 (16/11/2026): `compact` = uma linha só (título, barra, o mesmo botão), usada em Como atender e Automações. A frase
 * do que falta vai para o "i" ao lado do título; a lista abre embaixo, igual.
 * L12 (17/11/2026): no celular o `compact` continua compacto: título numa linha e, na de baixo, barra + % + o botão no
 * tamanho dele (antes eram três linhas, com o botão na largura toda).
 */
export function ReadinessCard({ compact = false }: {compact?: boolean;}) {
  const navigate = useGuardedNavigate();
  const { missing, ready, done, total, pct } = useReadiness();
  const [open, setOpen] = useState(false);
  const complete = done === total;
  const missingNames = missing.map((m) => m.label).join(', ');
  const title = complete ? `Sua assistente conhece os ${total} itens importantes` : `Sua assistente conhece ${done} de ${total} itens importantes`;
  const helper = complete ?
  'Ela tem tudo o que precisa para atender bem.' :
  `${missing.length === 1 ? 'Falta' : 'Faltam'}: ${missingNames}. Sem ${missing.length === 1 ? 'isso' : 'esses itens'}, a assistente passa essas perguntas para a sua equipe.`;
  const toggleLabel = open ? 'Ocultar lista' : complete ? 'Ver lista' : 'Ver o que falta';
  const toggle =
  <Button variant="secondary" size="md" aria-expanded={open} aria-controls="prontidao-lista" onClick={() => setOpen((v) => !v)} className="w-full shrink-0 sm:w-auto">
      {toggleLabel}
    </Button>;


  if (compact)
  return (
    <Card as="section" padding="sm" aria-labelledby="prontidao-titulo">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-nowrap md:gap-5">
          <h2 id="prontidao-titulo" className="flex w-full items-center gap-2 text-sm font-bold text-text-primary md:w-auto md:shrink-0">
            {complete && <StatusIcon tone="success" size={20} />}
            {title}
            <InfoTip label="o que falta" content={helper} />
          </h2>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 flex-1">
              <ProgressBar size="sm" value={pct} tone={completionTone(pct)} ariaLabel={`O que ela sabe: ${pct}%`} />
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-text-secondary">{pct}%</span>
          </div>
          <Button variant="secondary" size="md" aria-expanded={open} aria-controls="prontidao-lista" onClick={() => setOpen((v) => !v)} className="shrink-0">
            {toggleLabel}
          </Button>
        </div>
        {open &&
      <div className="mt-4">
            <ReadinessList id="prontidao-lista" missing={missing} ready={ready} onOpen={navigate} />
          </div>
      }
      </Card>);


  return (
    <Card as="section" padding="lg" aria-labelledby="prontidao-titulo">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="prontidao-titulo" className="flex items-center gap-2.5 text-base font-bold text-text-primary">
          {complete && <StatusIcon tone="success" />}
          {title}
        </h2>
        {toggle}
      </div>
      <div className="mt-4">
        <ProgressBar size="md" value={pct} tone={completionTone(pct)} label="O que ela sabe" valueLabel={`${pct}%`} ariaLabel={`O que ela sabe: ${pct}%`} helperText={helper} />
      </div>
      {open &&
      <div className="mt-5">
          <ReadinessList id="prontidao-lista" missing={missing} ready={ready} onOpen={navigate} />
        </div>
      }
    </Card>);

}