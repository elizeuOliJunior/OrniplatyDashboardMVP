import { useGuardedNavigate } from '../components/ui/UnsavedChanges';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AtendenteIaLayout } from '../components/dashboard/AtendenteIaLayout';
import { Card, CardTitle, CardDescription, ChoiceCards, FollowUpEditor, InfoTip, PillLink, PillLinkRow, SectionNav } from '../components/Card';
import { PillGroup } from '../components/Pill';
import { AutomationCard, splitFirstSentence } from '../components/atendente-ia/AutomationCard';
import { SendWindowsCard } from '../components/atendente-ia/SendWindowsCard';
import { ReturnPlanTimeline } from '../components/client/ReturnPlanTimeline';
import { StickySaveBar } from '../components/atendente-ia/FormParts';
import { StateRow } from '../components/configuracoes/SettingsParts';
import { ruleErrors } from '../data/automacoes';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { useDraft } from '../components/ui/useDraft';
import { useSavedStore } from '../data/iaConfigStore';
import { atendimentoStore } from '../data/comoAtender';
import {
  MOTIVE_AUTOMATION,
  SITUATION_GROUP_TITLE,
  automacoesStore,
  automationAutomaticConsent,
  automationGroups,
  automationMergeText,
  automationModes,
  automationSituation,
  automations } from
'../data/automacoes';
import type { Automation, AutomationMode, AutomationsForm, SituationGroup } from '../data/automacoes';
import { sendWindowsValid, windowText } from '../data/sendWindows';
import { useServices } from '../data/servicesStore';
import { MAX_STEPS_OPTIONS, MODEL_KIND_NAME, MODEL_PLAIN_ORDER, MODELS_WITH_STEPS, newFollowUp } from '../data/followUpModels';
import type { ModelKind, ModelLibrary, Step } from '../data/followUpModels';
import { planReturn } from '../data/followUp';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { useAssistantPower } from '../components/atendente-ia/AssistantPower';
import { automationsStopped, submitForApproval, useAccountSummary, useSettings } from '../data/settingsStore';
import type { SettingsState } from '../data/settingsStore';
import { TODAY_ISO } from '../data/agendaStore';
import { shortDate } from '../data/catalogo';

/*
 * Tailwind deste projeto precisa gerar `lg:flex`: o SectionNav do design system usa "hidden lg:flex" (mesma nota de
 * pages/Configuracoes.tsx).
 */
const TAILWIND_KEEP = 'lg:flex';
void TAILWIND_KEEP;

/** Ordem dos tipos de volta no "Ajustar" de "Lembrar o cliente de voltar" (os mesmos nomes simples de Serviços e equipe). */
const KINDS_WITH_STEPS = MODEL_PLAIN_ORDER.filter((m) => MODELS_WITH_STEPS.includes(m));

const SAMPLE_TEXT: Partial<Record<ModelKind, string>> = {
  manutencao: 'um serviço que volta a cada 30 dias',
  serie: 'a 1ª de 5 sessões, uma por semana',
  revisao: 'um serviço com revisão 15 dias depois',
  profissional: 'um serviço e o profissional escolher 30 dias'
};

let seq = 0;
const sid = () => `passo-auto-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** "Ligada · não sai: …" → "Não sai: …" (no resumo, o selo e o nome já dizem que está ligada). */
const summaryText = (text: string) => {
  const t = text.replace(/^Ligada · /, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ───────────── L10 (16/11/2026): seções da aba (SectionNav, como Configurações) ───────────── */

type AutoSection = 'resumo' | 'horarios' | 'lembretes' | 'chamar';

const groupTitle = (id: 'lembretes' | 'chamar') => automationGroups.find((g) => g.id === id)?.title ?? '';

const SECTIONS: {value: AutoSection;label: string;}[] = [
{ value: 'resumo', label: 'O que acontece hoje' },
{ value: 'horarios', label: 'Dias e horários de envio' },
{ value: 'lembretes', label: groupTitle('lembretes') },
{ value: 'chamar', label: groupTitle('chamar') }];


/** Seção onde mora o cartão da automação (campanhas em "Chamar clientes de volta"; o resto em "Lembretes…"). */
const sectionOf = (id: string): AutoSection => automations.find((a) => a.id === id)?.kind === 'campanha' ? 'chamar' : 'lembretes';

/** `?secao=<seção>` ou `?campanha=<id>` (link direto para uma automação: abre a seção dela). */
function sectionFromSearch(search: string): AutoSection | null {
  const p = new URLSearchParams(search);
  const s = p.get('secao');
  if (s && SECTIONS.some((x) => x.value === s)) return s as AutoSection;
  const c = p.get('campanha');
  if (c && automations.some((a) => a.id === c)) return sectionOf(c);
  return null;
}

const pathFor = (s: AutoSection) => s === 'resumo' ? '/atendente-ia/automacoes' : `/atendente-ia/automacoes?secao=${s}`;

/** Onde a pessoa vê a automação funcionando depois de ligar (botão do aviso de salvo; só navega). */
function seeItWorking(a: Automation): {label: string;to: string;} {
  if (a.id === 'lista-espera') return { label: 'Ver lista de espera', to: '/agenda?secao=lista-espera' };
  if (a.id === 'avisar-mudanca-horario') return { label: 'Ver quem falta avisar', to: '/agenda?secao=notificacoes' };
  if (a.kind === 'campanha') {
    const motive = (Object.entries(MOTIVE_AUTOMATION).find(([, id]) => id === a.id) ?? [null])[0];
    return { label: 'Ver clientes em Oportunidades', to: motive ? `/oportunidades?aba=${motive}` : '/oportunidades' };
  }
  return { label: 'Ver Agenda', to: '/agenda' };
}

/** Uma frase: o que acontece agora com a automação que acabou de ser ligada. */
function nowText(a: Automation, mode: AutomationMode, sent: boolean, s: SettingsState): string {
  const campaign = a.kind === 'campanha';
  if (sent) return campaign ? 'Mandamos a mensagem para o WhatsApp aprovar; até lá, os clientes aparecem em Oportunidades com a mensagem pronta.' : 'Mandamos a mensagem para o WhatsApp aprovar; até lá, a equipe continua avisando pela Agenda.';
  const sit = automationSituation(a, true, mode, s);
  if (sit.group === 'sai' || sit.group === 'espera') {
    if (a.id === 'lista-espera') return 'As vagas que abrirem a partir de agora são oferecidas a quem está na lista de espera.';
    if (a.id === 'confirmacao') return 'Os clientes com horário marcado passam a receber o pedido de confirmação.';
    if (campaign && mode === 'pausado') return 'A mensagem fica pronta em Oportunidades para você mandar.';
    if (campaign && mode === 'supervisionado') return 'Os envios esperam a sua aprovação em Oportunidades.';
    return campaign ? 'Ela sai sozinha, nos dias e horários de envio.' : 'Ela sai sozinha a partir de agora.';
  }
  return summaryText(splitFirstSentence(sit.text)[0]);
}

/**
 * B9: um tipo de volta dentro de "Lembrar o cliente de voltar" › Ajustar.
 * Número máximo de mensagens em PillGroup (1·2·3·4·5), exemplo com datas (ClientProcess dateFirst) e os dias de cada mensagem.
 * Aumentar o número acrescenta uma mensagem 7 dias depois da anterior (para o exemplo mostrar o efeito na hora).
 */
function ReturnKindBlock({ kind, lib, usedIn, mode, onChange }: {kind: ModelKind;lib: ModelLibrary;usedIn: string[];mode: AutomationMode;onChange: (patch: {maxSteps: number;steps: Step[];}) => void;}) {
  const entry = lib[kind];
  // Exemplo com o padrão do tipo (30 dias; série de 5 sessões semanais; revisão 15 dias depois; profissional escolhe 30 dias).
  const sample = { ...newFollowUp(kind, lib), steps: entry.steps };
  const plan = planReturn(sample, TODAY_ISO, kind === 'profissional' ? 30 : null, lib, 1, TODAY_ISO);
  const setMax = (n: number) => {
    let steps = entry.steps.slice(0, n);
    while (steps.length < n) {
      const last = steps[steps.length - 1];
      const days = last?.when === 'after-due' ? (last.days ?? 0) + 7 : 7;
      steps = [...steps, { id: sid(), when: 'after-due', days }];
    }
    onChange({ maxSteps: n, steps });
  };
  return (
    <section aria-labelledby={`tipo-${kind}`} className="flex flex-col gap-4 border-t border-border pt-5">
      <div>
        <h4 id={`tipo-${kind}`} className="text-base font-bold text-text-primary">
          {MODEL_KIND_NAME[kind]}
        </h4>
        <p className="mt-0.5 text-sm text-text-secondary">{usedIn.length ? `Serviços: ${usedIn.join(', ')}.` : 'Nenhum serviço usa este tipo de volta ainda.'}</p>
      </div>
      <PillGroup
        label="Quantas mensagens, no máximo?"
        size="sm"
        options={MAX_STEPS_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
        value={String(entry.maxSteps)}
        onChange={(v) => typeof v === 'string' && setMax(Number(v))} />
      
      {plan &&
      <div>
          <p className="mb-2 text-sm text-text-secondary">
            Exemplo: se um cliente fizer hoje ({shortDate(TODAY_ISO)}) {SAMPLE_TEXT[kind]}, a Orniplaty:
          </p>
          <ReturnPlanTimeline plan={plan} mode={mode} voice="exemplo" />
        </div>
      }
      <FollowUpEditor
        wording="simples"
        title="Quando sai cada mensagem"
        subtitle="Padrão para os serviços novos deste tipo."
        steps={entry.steps}
        maxSteps={entry.maxSteps}
        limitText={`No máximo ${entry.maxSteps} ${entry.maxSteps === 1 ? 'mensagem' : 'mensagens'}. Para mudar, escolha outro número acima.`}
        onChange={(steps) => onChange({ maxSteps: entry.maxSteps, steps })} />
      
      <p className="text-sm text-text-secondary">O número de mensagens vale para todos os serviços desse tipo. Cada serviço pode mudar os dias em Serviços e equipe.</p>
    </section>);

}

/**
 * W6 (11/11/2026, A5-07): resumo no topo de Automações, no padrão "Precisa de você / Em dia" de Configurações › Visão geral:
 * o que espera você e o que está parado em cartões; o que sai sozinho em linhas; as desligadas numa frase. Conta o que está
 * SALVO (rascunho não vale). Clicar numa linha leva ao cartão da automação.
 * L10: as desligadas viraram `PillLink` (mesmo nome, agora levam ao cartão, como as linhas).
 * L12 (17/11/2026): a linha "Desligadas" sobe para o topo do resumo (logo abaixo da frase), para ficar à vista sem rolar.
 */
function AutomationsSummary({ saved, onOpen }: {saved: AutomationsForm;onOpen: (id: string) => void;}) {
  const settings = useSettings();
  const items = automations.map((a) => ({ a, sit: automationSituation(a, saved.enabled[a.id] ?? false, saved.mode, settings) }));
  const of = (g: SituationGroup) => items.filter((x) => x.sit.group === g);
  const off = of('desligada');
  const row = (x: (typeof items)[number], card: boolean) =>
  <li key={x.a.id}>
      <StateRow card={card} label={x.a.name} badge={{ tone: x.sit.tone, label: x.sit.label }} summary={summaryText(x.sit.text)} onClick={() => onOpen(x.a.id)} ariaLabel={`${x.a.name}: ${x.sit.label}. Ir para a automação`} />
    </li>;

  return (
    <Card as="section" padding="lg" aria-labelledby="resumo-automacoes-titulo">
      <CardTitle as="h2" id="resumo-automacoes-titulo" className="flex items-center gap-1.5">
        O que acontece hoje
        <InfoTip label="este resumo" content="Conta o que está salvo." />
      </CardTitle>
      <CardDescription>O que a Orniplaty manda sozinha, o que espera você e o que está parado.</CardDescription>
      {off.length > 0 &&
      <div className="mt-4">
          <PillLinkRow label={`${SITUATION_GROUP_TITLE.desligada}:`}>
            {off.map((x) =>
          <PillLink key={x.a.id} onClick={() => onOpen(x.a.id)}>
                {x.a.name}
              </PillLink>
          )}
          </PillLinkRow>
        </div>
      }
      {(['espera', 'parado'] as SituationGroup[]).map((g) =>
      of(g).length ?
      <section key={g} aria-labelledby={`resumo-${g}`} className="mt-5">
            <h3 id={`resumo-${g}`} className="text-sm font-bold text-text-primary">
              {SITUATION_GROUP_TITLE[g]} ({of(g).length})
            </h3>
            <ul className="mt-2 flex flex-col gap-2">{of(g).map((x) => row(x, true))}</ul>
          </section> :
      null
      )}
      {of('sai').length > 0 &&
      <section aria-labelledby="resumo-sai" className="mt-5">
          <h3 id="resumo-sai" className="text-sm font-bold text-text-primary">
            {SITUATION_GROUP_TITLE.sai} ({of('sai').length})
          </h3>
          <ul className="mt-2 divide-y divide-border border-y border-border">{of('sai').map((x) => row(x, false))}</ul>
        </section>
      }
    </Card>);

}

/** Cabeçalho de uma seção: título + uma frase; o resto da descrição no "i". */
function SectionHeading({ id, title, text }: {id: string;title: string;text: string;}) {
  const [first, rest] = splitFirstSentence(text);
  return (
    <div>
      <h2 id={id} className="flex items-center gap-1.5 text-lg font-extrabold text-text-primary">
        {title}
        {rest && <InfoTip label={title} content={rest} />}
      </h2>
      <p className="mt-0.5 max-w-3xl text-sm text-text-secondary">{first}</p>
    </div>);

}

/**
 * IA Orniplaty › Automações.
 * Lote B (20/10/2026): campanha "Chamar quem faltou", campanhas ligadas por padrão e a biblioteca de modelos.
 * Ajustes do Lote B (21/10/2026, decisões do Christian):
 *  - B7: um cartão por automação (AutomationCard), em 2 grupos: "Lembretes de horário marcado" e "Chamar clientes de volta";
 *    modo de envio no topo em ChoiceCards (design system v3.12), com o efeito em Oportunidades.
 *  - B6: "Quando a Orniplaty chama seus clientes". W6 (G18): a confirmação também só sai das 9h às 20h.
 *  - B8: Pacotes "Em análise" sem trava; enquanto isso, os clientes aparecem em Oportunidades com a mensagem pronta.
 *  - B9: a biblioteca de modelos virou "Ajustar" de "Lembrar o cliente de voltar" (um bloco por tipo de volta).
 * W6 (11/11/2026): resumo "O que acontece hoje" no topo (A5-07); ao salvar, mensagem "Não enviada" de automação ligada
 * vai sozinha para o WhatsApp aprovar (G17).
 * W8 (12/11/2026): o cartão do B6 virou "Dias e horários em que a Orniplaty manda mensagens" (`SendWindowsCard`), com os
 * campos das duas escolhas (`draft.send`). Salva na mesma barra; horário inválido ou fora do teto das campanhas não salva.
 * L10 (16/11/2026): a aba virou quatro seções com `SectionNav` (O que acontece hoje · Dias e horários de envio · Lembretes de
 * horário marcado · Chamar clientes de volta), com a seção no endereço (`?secao=`, `replace`). `?campanha=<id>` abre a seção
 * da automação. Todas as seções ficam montadas (só escondidas): o rascunho é um só e salva na mesma barra, que só aparece
 * com alteração pendente. Ao salvar, o aviso diz o que acontece agora e, se uma automação foi ligada, tem o botão para onde
 * ela aparece funcionando (só navega).
 * L12 (17/11/2026):
 *  - ir até um cartão (pílula de "Desligadas", linha do resumo, `?campanha=`) pula SEM animação: o liga/desliga já está no
 *    lugar quando a pessoa clica (o destaque de 2,5 s continua);
 *  - quando a barra de salvar aparece, a página ganha folga embaixo do tamanho da barra (`scroll-padding-bottom`) e, se o
 *    campo que a pessoa acabou de mexer está na metade de baixo da tela, a página sobe a altura da barra na hora, para a
 *    barra não cobrir os campos seguintes.
 * Histórico: a guarda de alterações (data/dirtyGuard.ts) tira a sua entrada extra com `history.back()` depois de salvar; essa
 * volta (POP) NÃO muda a seção aberta: o endereço é regravado com a seção da tela.
 */
export function AtendenteIaAutomacoes() {
  const toast = useToast();
  const location = useLocation();
  const navType = useNavigationType();
  const rawNavigate = useNavigate();
  const atendimento = useSavedStore(atendimentoStore);
  const saved = useSavedStore(automacoesStore);
  const settings = useSettings();
  const [askAutomatic, setAskAutomatic] = useState(false);
  // Lote E (E1): com "respostas e mensagens automáticas" desligadas, aviso no topo da aba.
  const stopped = automationsStopped(settings);
  // G4 (F-067): com o WhatsApp sem funcionar, nada sai (mesmo resumo único de Início, IA, Conversas e Configurações).
  const account = useAccountSummary();
  const waDown = account.assistant.reason === 'whatsapp' || !account.automationsOut && !stopped;
  const navigate = useGuardedNavigate();
  const power = useAssistantPower();

  /* ── seção aberta ── */
  const [section, setSection] = useState<AutoSection>(() => sectionFromSearch(location.search) ?? 'resumo');
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const openSection = (s: AutoSection, keepScroll = false) => {
    sectionRef.current = s;
    setSection(s);
    rawNavigate(pathFor(s), { replace: true, state: { automacoesSecao: true } });
    if (!keepScroll) window.scrollTo({ top: 0 });
  };
  const firstLocation = useRef(true);
  useEffect(() => {
    const first = firstLocation.current;
    firstLocation.current = false;
    if (first) return; // a seção inicial já veio do endereço (carregamento direto, recarregar ou link de outra tela)
    const own = (location.state as {automacoesSecao?: boolean;} | null)?.automacoesSecao === true;
    const fromUrl = sectionFromSearch(location.search);
    // Endereço escrito por esta tela, ou volta do histórico (POP, ex.: a guarda tirando a entrada extra depois de salvar):
    // a seção aberta fica; só o endereço é acertado.
    if (own || navType === 'POP') {
      if ((fromUrl ?? 'resumo') !== sectionRef.current) rawNavigate(pathFor(sectionRef.current), { replace: true, state: { automacoesSecao: true } });
      return;
    }
    // Link de outra tela com a aba já aberta (PUSH/REPLACE): abre a seção pedida.
    if (fromUrl && fromUrl !== sectionRef.current) setSection(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  /* ── ir até o cartão de uma automação: pula (sem animação), destaca 2,5 s e põe o foco no liga/desliga (rules/stable-selection-and-deep-links) ── */
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const offTimer = useRef(0);
  const focusCard = (id: string) => {
    const card = document.getElementById(`automacao-${id}`);
    if (!card) return;
    // L12: sem rolagem suave. Com animação, o clique no liga/desliga durante a rolagem caía em lugar vazio (V4).
    card.scrollIntoView({ behavior: 'auto', block: 'center' });
    document.getElementById(`automacao-${id}-liga`)?.focus({ preventScroll: true });
    setHighlighted(id);
    window.clearTimeout(offTimer.current);
    offTimer.current = window.setTimeout(() => setHighlighted(null), 2500);
  };
  const goToCard = (id: string) => {
    openSection(sectionOf(id), true);
    window.setTimeout(() => focusCard(id), 60);
  };
  // C2: `?campanha=<id>` (ex.: "Abrir Automações" de uma campanha desligada) — a seção já abre certa; aqui rola até o cartão.
  // Vale no carregamento direto; uma volta do histórico (POP) depois disso não rola de novo.
  const campanha = new URLSearchParams(location.search).get('campanha');
  const target = campanha && automations.some((a) => a.id === campanha) ? campanha : null;
  const firstCampaign = useRef(true);
  useEffect(() => {
    const first = firstCampaign.current;
    firstCampaign.current = false;
    if (!target || navType === 'POP' && !first) return;
    const t = window.setTimeout(() => focusCard(target), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, location.search]);
  useEffect(() => () => window.clearTimeout(offTimer.current), []);

  const form = useDraft<AutomationsForm>(
    'ia-automacoes',
    automacoesStore.get(),
    {
      reload: () => automacoesStore.get(),
      // G1 (F-055): zero (ou vazio) é recusado nas regras numéricas; a mensagem aparece no campo e na barra de salvar.
      // W8: dias e horários de envio inválidos (sem dia, fim antes do início, campanha fora das 7h às 23h) também não salvam.
      validate: (d) => ({
        ...(Object.keys(ruleErrors(d.values)).length > 0 ? { values: 'Confira os campos marcados.' } : {}),
        ...(sendWindowsValid(d.send) ? {} : { send: 'Confira os dias e horários de envio.' })
      }),
      onSaved: (next) => {
        const prev = automacoesStore.get();
        // G1 (F-014): um store só — o modo salvo (`mode`) vale para Oportunidades e Retornos; rascunho não salvo não vale.
        automacoesStore.set(next);
        // G17 (W6): automação ligada com a mensagem nunca enviada para aprovação → a Orniplaty manda sozinha.
        const sent = submitForApproval(automations.filter((a) => next.enabled[a.id]).map((a) => a.id));
        const sentNames = automations.filter((a) => sent.includes(a.id)).map((a) => `“${a.name}”`);
        // L10: uma frase do que acontece agora; com automação ligada, botão para onde ela aparece funcionando (só navega).
        const turnedOn = automations.filter((a) => next.enabled[a.id] && !prev.enabled[a.id]);
        const turnedOff = automations.filter((a) => !next.enabled[a.id] && prev.enabled[a.id]);
        if (turnedOn.length) {
          const a = turnedOn[0];
          const go = seeItWorking(a);
          toast({
            title: turnedOn.length === 1 ? `“${a.name}” ligada` : `${turnedOn.length} automações ligadas`,
            description: nowText(a, next.mode, sent.includes(a.id), settings),
            tone: 'success',
            action: { label: go.label, onClick: () => navigate(go.to) }
          });
          return;
        }
        if (sentNames.length) {
          toast({ title: 'Alterações salvas', description: `Mandamos para o WhatsApp aprovar a mensagem de ${sentNames.join(', ')} (costuma levar minutos, às vezes até 24 horas); até lá, ela não sai.`, tone: 'success' });
          return;
        }
        if (turnedOff.length) {
          toast({ title: turnedOff.length === 1 ? `“${turnedOff[0].name}” desligada` : `${turnedOff.length} automações desligadas`, description: 'A partir de agora, nenhuma mensagem dela sai.', tone: 'success' });
          return;
        }
        if (next.mode !== prev.mode) {
          const m = automationModes.find((x) => x.id === next.mode);
          const first = m ? splitFirstSentence(m.description)[0] : '';
          toast({ title: 'Alterações salvas', description: `Chamar clientes de volta no modo ${m?.label ?? ''}: ${first.charAt(0).toLowerCase()}${first.slice(1)}`, tone: 'success' });
          return;
        }
        if (JSON.stringify(next.send) !== JSON.stringify(prev.send)) {
          toast({ title: 'Alterações salvas', description: `Os lembretes saem ${windowText(next.send.appointments)}; as mensagens para chamar clientes de volta, ${windowText(next.send.campaigns)}.`, tone: 'success' });
          return;
        }
        toast({ title: 'Alterações salvas', description: 'As regras novas valem a partir de agora.', tone: 'success' });
      }
    }
  );
  const { draft, set } = form;
  const { services } = useServices();
  const usedIn = (m: ModelKind) => services.filter((x) => x.active && x.followUp.model === m).map((x) => x.name);
  const setModel = (m: ModelKind, patch: Partial<ModelLibrary[ModelKind]>) => set('models', { ...draft.models, [m]: { ...draft.models[m], ...patch } });

  // L10: se não salvar por um campo de outra seção, abre a seção do campo (a barra já diz "Confira …").
  const save = () => {
    if (form.save()) return;
    if (!sendWindowsValid(draft.send)) return openSection('horarios');
    const bad = Object.keys(ruleErrors(draft.values));
    const a = automations.find((x) => x.rule.some((r) => typeof r !== 'string' && bad.includes(r.id)));
    if (a && sectionOf(a.id) !== section) openSection(sectionOf(a.id));
  };
  const showSaveBar = form.dirty || !!form.saveError || !!form.errors.values || !!form.errors.send;

  /* ── L12: a barra de salvar não cobre o que a pessoa está mexendo ── */
  const barWrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!showSaveBar) return;
    const bar = barWrap.current?.firstElementChild as HTMLElement | null;
    if (!bar) return;
    const h = Math.ceil(bar.getBoundingClientRect().height);
    const root = document.documentElement;
    const before = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = `${h + 16}px`;
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body && !bar.contains(el)) {
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight / 2) window.scrollBy({ top: h, behavior: 'auto' });
    }
    return () => {
      root.style.scrollPaddingBottom = before;
    };
  }, [showSaveBar]);

  const changeMode = (mode: AutomationMode) => {
    if (mode === draft.mode) return;
    // P01: Automático só depois de confirmação explícita da clínica
    if (mode === 'automatico') setAskAutomatic(true);else
    set('mode', mode);
  };

  const returnAdjust =
  <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-bold text-text-primary">Mensagens de cada tipo de volta</p>
        <p className="mt-0.5 max-w-3xl text-sm text-text-secondary">
          Cada serviço tem um tipo de volta (em Serviços e equipe). Aqui fica o padrão de cada tipo. {automationMergeText}
        </p>
      </div>
      {KINDS_WITH_STEPS.map((k) =>
    <ReturnKindBlock key={k} kind={k} lib={draft.models} usedIn={usedIn(k)} mode={draft.mode} onChange={(patch) => setModel(k, patch)} />
    )}
      <ul className="flex flex-col gap-1.5 text-sm text-text-secondary">
        <li>
          <span className="font-semibold text-text-primary">{MODEL_KIND_NAME.recorrente}:</span> a Orniplaty só chama se uma semana ficar vazia.
          {usedIn('recorrente').length ? ` Serviços: ${usedIn('recorrente').join(', ')}.` : ''}
        </li>
        <li>
          <span className="font-semibold text-text-primary">{MODEL_KIND_NAME['sem-retorno']}:</span> nenhuma mensagem é enviada.
          {usedIn('sem-retorno').length ? ` Serviços: ${usedIn('sem-retorno').join(', ')}.` : ''}
        </li>
      </ul>
    </div>;


  const cards = (groupId: 'lembretes' | 'chamar') => {
    const group = automationGroups.find((g) => g.id === groupId);
    if (!group) return null;
    return automations.
    filter((a) => group.kinds.includes(a.kind)).
    map((automation) =>
    <AutomationCard
      key={automation.id}
      automation={automation}
      enabled={draft.enabled[automation.id] ?? false}
      unsaved={(draft.enabled[automation.id] ?? false) !== (saved.enabled[automation.id] ?? false)}
      values={draft.values}
      mode={draft.mode}
      isCampaign={automation.kind === 'campanha'}
      assistantName={atendimento.name}
      onEnabledChange={(value) => set('enabled', { ...draft.enabled, [automation.id]: value })}
      onValueChange={(id, value) => set('values', { ...draft.values, [id]: value })}
      adjust={automation.id === 'retorno' ? returnAdjust : undefined}
      highlighted={highlighted === automation.id}
      ruleErrors={form.errors.values ? ruleErrors(draft.values) : undefined} />

    );
  };
  const groupText = (id: 'lembretes' | 'chamar') => automationGroups.find((g) => g.id === id)?.description ?? '';
  // Modo de envio: título nas palavras de quem usa; uma frase por opção; o resto (e o "Na prática" de cada um) no "i".
  const modeTip =
  <span className="flex flex-col gap-1.5">
      {automationModes.map((m) => {
      const rest = splitFirstSentence(m.description)[1];
      return (
        <span key={m.id} className="block">
            <span className="font-semibold">{m.label}:</span> {rest ? `${rest} ` : ''}
            {m.practice}
          </span>);

    })}
    </span>;


  return (
    <AtendenteIaLayout activeTab="automacoes">
      <div className="flex flex-col gap-6">
        {stopped &&
        <Alert
          variant="warning"
          title="As mensagens automáticas estão paradas porque você desligou a assistente."
          actions={
          <Button size="md" className="w-full sm:w-auto" onClick={() => power.openOn()}>
                Ligar a assistente
              </Button>
          } />

        }
        {!stopped && waDown &&
        <Alert
          variant="error"
          title="Nenhum lembrete ou campanha sai enquanto o WhatsApp não estiver funcionando."
          actions={
          <Button size="md" className="w-full sm:w-auto" onClick={() => navigate('/configuracoes?secao=whatsapp')}>
                Ver o WhatsApp
              </Button>
          } />

        }
        {power.modals}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <SectionNav ariaLabel="Seções de Automações" value={section} onValueChange={(v: string) => v !== section && openSection(v as AutoSection)} items={SECTIONS} />
          <div className="min-w-0 flex-1">
            <div hidden={section !== 'resumo'}>
              <AutomationsSummary saved={saved} onOpen={goToCard} />
            </div>

            <div hidden={section !== 'horarios'}>
              <SendWindowsCard value={draft.send} onChange={(next) => set('send', next)} />
            </div>

            <section hidden={section !== 'lembretes'} aria-labelledby="grupo-lembretes">
              <div className="flex flex-col gap-3">
                <SectionHeading id="grupo-lembretes" title={groupTitle('lembretes')} text={groupText('lembretes')} />
                {cards('lembretes')}
              </div>
            </section>

            <section hidden={section !== 'chamar'} aria-labelledby="grupo-chamar">
              <div className="flex flex-col gap-3">
                <SectionHeading id="grupo-chamar" title={groupTitle('chamar')} text={groupText('chamar')} />
                <Card padding="lg" as="section" aria-label="Como saem as mensagens para chamar clientes de volta">
                  <ChoiceCards
                    label="Como saem as mensagens para chamar clientes de volta"
                    helperText={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        Os lembretes de horário marcado não dependem desta escolha.
                        <InfoTip label="cada modo" content={modeTip} maxWidth={320} />
                      </span>
                    }
                    columns={3}
                    value={draft.mode}
                    onChange={(v) => changeMode(v as AutomationMode)}
                    options={automationModes.map((m) => ({ value: m.id, title: m.label, description: splitFirstSentence(m.description)[0] }))} />
                  
                </Card>
                {cards('chamar')}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* L12: `contents` não cria caixa, então a barra continua grudada embaixo (sticky) como antes; o ref só serve para medir. */}
      {showSaveBar &&
      <div ref={barWrap} className="contents">
          <StickySaveBar onSave={save} error={form.errors.values ?? form.errors.send} saveError={form.saveError} />
        </div>
      }

      <ConfirmDialog
        open={askAutomatic}
        title="Ativar o modo Automático?"
        description={automationAutomaticConsent}
        confirmLabel="Autorizo e ativar"
        cancelLabel="Manter o modo atual"
        onClose={() => setAskAutomatic(false)}
        onConfirm={() => set('mode', 'automatico')} />
      
    </AtendenteIaLayout>);

}