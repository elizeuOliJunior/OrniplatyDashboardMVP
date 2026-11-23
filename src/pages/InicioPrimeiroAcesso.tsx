import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAssistantPower } from '../components/atendente-ia/AssistantPower';
import { useReadiness } from '../components/atendente-ia/ReadinessCard';
// G2 (F-031): os atalhos do primeiro acesso ("Ver no painel") passam pelo aviso de alterações não salvas.
import { useGuardedNavigate } from '../components/ui/UnsavedChanges';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, CardHeader, CardTitle, CardContent, ExpandMotion, HighlightCard, InfoTip, completionTone } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { SetupChecklistCard } from '../components/inicio/SetupChecklistCard';
import type { SetupItem } from '../components/inicio/SetupChecklistCard';
import { useOnboardingHandoff, editOnboarding, ONBOARDING_ORIGIN } from '../data/onboardingHandoff';
import type { AutomationKind, FirstAccess } from '../data/onboardingHandoff';
import type { ApplyResult } from '../data/receivedConfig';
import { assistantDisplayName, assistantSubject } from '../data/assistantIdentity';
import { WEEKDAY_SHORT, bufferLabel, clinicExceptionLabel, clinicPeriods, describeOverride, dmy, normalizeSchedule, rangesText, weekFromClinicHours } from '../data/schedule';
import { businessLabel, businessWords, migrateSegment } from '../data/segment';
import { TODAY_ISO, todayHeaderLabel } from '../data/agendaStore';
import { addDaysIso, firstAccessPlan } from '../data/settingsStore';
import { knowledgeStatus, useServices } from '../data/servicesStore';
import { AGENDA_WAITLIST_PATH } from '../data/inicio';
import { firstAccessList, firstAccessPreview } from '../data/inicioPrimeiroAcesso';

/**
 * L15 (17/11/2026, etapa de facilidade de uso): primeiro acesso com UM começo claro.
 * - Topo: um aviso (`Alert`) com o próximo passo e o único botão preenchido da tela. WhatsApp desconectado = conectar;
 *   conectado e assistente desligada = ligar; senão, o primeiro item que falta.
 * - "Para começar a atender": junta "Próximos passos" e "A assistente está pronta?" num cartão só, com a regra do DS
 *   para prontos e pendentes (pendentes em cartões, prontos em lista compacta). Cada item guarda a ação que já tinha.
 *   "Revisar conexão" virou a linha "WhatsApp conectado" (mesma ação).
 * - "Sua configuração": título + uma frase + "i"; as nove partes ficam atrás de "Ver o que veio do onboarding".
 *   O aviso "Cenário preenchido aplicado às telas" / "Sua configuração já está nas telas" virou a frase e o "i" deste cartão.
 * - Embaixo, os cartões do Início (`HighlightCard`, mesma grade), vazios, cada um com uma linha do que aparece ali.
 * Nada saiu da tela: o que não cabe numa frase foi para o "i" ou para o detalhe recolhido.
 * L21 (17/11/2026, V5 §B10/T1): cada número diz o que conta. A barra conta os 10 itens que a assistente precisa conhecer
 * (o mesmo número do "Faltam N de 10" do Onboarding e da IA Orniplaty) e passa a dizer isso com o nome da IA Orniplaty:
 * "Sua assistente conhece N de 10 itens importantes". Os grupos da lista contam PASSOS (ver SetupChecklistCard).
 */

/** Onde cada etapa do Onboarding mora no Painel (índice = etapa − 1). */
const destinations = ['/atendente-ia/empresa', '/servicos-equipe?aba=funcionamento', '/servicos-equipe?aba=equipe', '/servicos-equipe?aba=servicos', '/atendente-ia/como-atender', '/atendente-ia/conhecimento', '', '/clientes', '/atendente-ia/automacoes'];
const display = (v: string) => ({ formal: 'Formal', casual: 'Casual', tecnico: 'Técnico', humanizada: 'Humanizada' } as Record<string, string>)[v] || v;
/** Lote D: "Clínica · Estética". Aceita os valores antigos do onboarding (convertidos por `migrateSegment`). */
const segmentText = (c: {segment: string;specialty?: string;}) => {
  const m = migrateSegment(c.segment, c.specialty);
  return m.segment ? businessLabel(m.segment, m.specialty) : '';
};
/** Etapas exibidas como "Disponível em breve" (O07: Nível de IA adiado). Índice base 1, igual ao onboarding. */
const COMING_SOON = [7];
/** Mesmos nomes de IA Orniplaty › Automações. W9e (12/11/2026, J-09): entra "Avisar mudança de horário", que o Onboarding passou a mandar. */
const automationNames: Record<string, string> = {
  confirmacao: 'Confirmar o horário',
  'lista-espera': 'Oferecer vaga para a lista de espera',
  'avisar-mudanca-horario': 'Avisar mudança de horário',
  reativacao: 'Chamar quem sumiu',
  retorno: 'Lembrar o cliente de voltar',
  faltou: 'Chamar quem faltou',
  retomada: 'Retomar quem pediu preço',
  pacotes: 'Lembrar sessões de pacote'
};
/** Sem a classificação no payload (versões antigas do onboarding), usa a mesma regra do onboarding atual. */
const defaultKinds: Record<string, AutomationKind> = { confirmacao: 'transacional', 'lista-espera': 'pedido', 'avisar-mudanca-horario': 'transacional', reativacao: 'campanha', retorno: 'campanha', faltou: 'campanha', retomada: 'campanha', pacotes: 'campanha' };
const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
const withPeriod = (t: string) => /[.!?]$/.test(t.trim()) ? t : `${t}.`;

/**
 * Jornada recebida de cada profissional, convertida pela MESMA função do Painel (data/schedule.ts). Payload antigo sem
 * jornada individual: o profissional seguia o horário da clínica, então a conversão parte do horário semanal recebido.
 */
function TeamSchedules({ s }: {s: FirstAccess;}) {
  const fallback = weekFromClinicHours(s.hours);
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {s.team.map((p, j) => {
        const ps = normalizeSchedule(p.schedule, fallback);
        const legacy = !p.schedule;
        return (
          <li key={j} className="rounded-button border border-border p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
              {p.name}
              <span className="text-xs font-semibold text-text-secondary">· intervalo: {bufferLabel(ps.bufferMin).toLowerCase()}</span>
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-text-secondary sm:grid-cols-2" aria-label={`Jornada de ${p.name}`}>
              {ps.week.map((d, i) =>
              <li key={i}>
                  <span className="inline-block w-8 font-semibold text-text-primary">{WEEKDAY_SHORT[i]}</span>
                  {d.working && d.periods.length ? `${rangesText(d.periods)}${d.breaks.length ? ` · pausa ${rangesText(d.breaks)}` : ''}` : 'Folga'}
                </li>
              )}
            </ul>
            {ps.overrides.length > 0 &&
            <p className="mt-2 text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">Exceções:</span> {ps.overrides.map((o) => describeOverride(ps, o)).join(' · ')}
              </p>
            }
            {legacy && <p className="mt-2 text-xs text-text-secondary">Configuração antiga sem jornada individual: convertida a partir do horário de funcionamento.</p>}
          </li>);

      })}
    </ul>);

}

/**
 * G4 (F-071): o que a configuração recebida mudou nas telas do Painel. L15: era um aviso (`Alert`) de três a cinco frases;
 * virou a frase do cartão "Sua configuração" (`title`) e o "i" ao lado dela (`full`). Os textos são os mesmos.
 */
function appliedText(r: ApplyResult, sample: boolean) {
  const parts = [
  r.services.created + r.services.updated > 0 && n(r.services.created + r.services.updated, 'serviço', 'serviços'),
  r.team.created + r.team.updated > 0 && n(r.team.created + r.team.updated, 'profissional', 'profissionais'),
  r.hours && 'o horário de funcionamento',
  r.questions.received > 0 && n(r.questions.received, 'pergunta', 'perguntas'),
  r.clients.created > 0 && n(r.clients.created, 'cliente importado', 'clientes importados'),
  r.automationsOn && 'as automações escolhidas'].
  filter(Boolean) as string[];
  const archived = [...r.team.archived, ...r.services.archived];
  const kept = [...r.team.kept, ...r.services.kept];
  const full = [
  parts.length ? `Aplicado às telas: ${parts.join(', ').replace(/, ([^,]*)$/, ' e $1')}, além dos dados da empresa e do perfil da assistente.` : 'Aplicado às telas: os dados da empresa e o perfil da assistente.',
  archived.length > 0 ? `Exemplos que não estavam na configuração foram arquivados (não apagados): ${archived.join(', ')}.` : '',
  kept.length > 0 ? `Continuam como estavam, porque já foram configurados no painel: ${kept.join(', ')}.` : '',
  'Agenda, clientes e conversas de exemplo continuam até os primeiros atendimentos.',
  r.clients.skipped > 0 ? `${n(r.clients.skipped, 'linha da importação ficou', 'linhas da importação ficaram')} de fora (telefone já cadastrado ou inválido).` : ''].

  filter(Boolean).
  join(' ');
  return { title: sample ? 'Cenário preenchido aplicado às telas' : 'Sua configuração já está nas telas', full };
}

export function InicioPrimeiroAcesso() {
  const { data: s, status, attempted, source, result } = useOnboardingHandoff();
  const navigate = useGuardedNavigate();
  const [notice, setNotice] = useState('');
  useEffect(() => setNotice(''), [s]);
  const [aiOnHere, setAiOnHere] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const power = useAssistantPower();
  const readiness = useReadiness();
  const { services: panelServices } = useServices();
  const w = businessWords(s?.clinic.segment);
  // I3 (11/11/2026, decisão I1-4c do Christian): o último bloco chama "Automações" (era "Diferenciais"), o nome da etapa 9 e da tela do Painel.
  // W9e (12/11/2026, A6-16): o quinto bloco chama "Como atender" (era "Perfil da atendente"), o nome da etapa 5 e da tela do Painel.
  const labels = [w.Your, 'Funcionamento', 'Equipe', 'Serviços', 'Como atender', 'Conhecimento', 'Nível de IA', 'Base de clientes', 'Automações'];
  // Lote E (E1, decisão do Christian de 22/10/2026): "Ligar a assistente" usa a MESMA confirmação do Painel (com os itens que faltam).
  // "Conectar WhatsApp" continua indo à etapa 11 do Onboarding.
  const connected = s?.whatsapp === 'connected';
  const active = connected && (s?.aiOn || aiOnHere);
  const turnOn = () => power.openOn(() => setAiOnHere(true));
  const name = assistantDisplayName(s?.profile.name);
  const who = assistantSubject(s?.profile.name, true);
  const EMPTY = 'Ainda não preenchido';
  const kindOf = (id: string) => s?.automationKinds?.[id] || defaultKinds[id] || 'campanha';
  const edit = (step: number) => {
    if (!editOnboarding(step))
    setNotice(
      source === 'exemplo' ?
      'Este é o cenário preenchido do seletor de telas: “Revisar” só abre a etapa quando o Painel foi aberto pelo onboarding.' :
      'A janela do onboarding não está mais aberta. Abra o onboarding de novo e siga até a última etapa.'
    );else
    setNotice('A etapa foi aberta na janela do onboarding. Depois de revisar, volte à etapa 11 e abra o painel de novo para atualizar este resumo.');
  };
  // W6 (A6-05, decisão 3-a da auditoria): serviços ativos sem tudo de "O que a assistente explica" (mesma conta de Serviços).
  const toExplain = panelServices.filter((x) => x.active && !knowledgeStatus(x).complete).length;
  // Etapas do onboarding a partir da 5 que ficaram para depois (mesma regra de antes).
  const stepsLater = s ? labels.map((label, i) => ({ label, step: i + 1 })).filter((x) => x.step >= 5 && !COMING_SOON.includes(x.step) && (!s.completed.includes(x.step) || s.deferred.includes(x.step))) : [];

  // L15: o que falta, em ordem. Primeiro o que trava (WhatsApp, assistente), depois o que ela precisa saber (a mesma
  // prontidão da IA Orniplaty, ao vivo: ao resolver e voltar, o item passa para "Já está pronto"), depois o resto.
  // Cada item mantém a ação que já tinha na tela (etapa do onboarding, confirmação de ligar ou tela do Painel).
  const pending: SetupItem[] = s ?
  [
  ...(!connected ? [{ id: 'whatsapp', label: 'Conectar o WhatsApp', detail: 'Próximo passo para atender.', onOpen: () => edit(11) }] : []),
  ...(!active ? [{ id: 'assistente', label: 'Ligar a assistente', detail: connected ? 'Próximo passo para atender.' : 'Conecte o número primeiro.', onOpen: () => connected ? turnOn() : edit(11) }] : []),
  ...readiness.missing.map((m) => ({ id: `item-${m.id}`, label: m.label, detail: m.detail, onOpen: () => navigate(m.to) })),
  ...(toExplain > 0 ?
  [{ id: 'explica', label: `Completar o que a assistente explica (${n(toExplain, 'serviço', 'serviços')})`, detail: 'Abra cada serviço e complete a aba “O que a assistente explica”.', onOpen: () => navigate('/servicos-equipe?aba=servicos') }] :
  []),
  ...stepsLater.map((x) => ({ id: `etapa-${x.step}`, label: x.label, detail: 'Você pode fazer quando quiser.', onOpen: () => edit(x.step) }))] :

  [];
  const done: SetupItem[] = s ?
  [
  // "Revisar conexão" (botão do aviso antigo) = clicar nestas duas linhas: abre a etapa 11 do onboarding, como antes.
  ...(connected ? [{ id: 'whatsapp-ok', label: 'WhatsApp conectado', note: s.whatsappNumber || undefined, onOpen: () => edit(11) }] : []),
  ...(active ? [{ id: 'assistente-ok', label: 'Assistente ligada', note: `${who} está ligada, com ${n(s.services.length, 'serviço', 'serviços')} e ${n(s.team.length, 'profissional configurado', 'profissionais configurados')}.`, onOpen: () => edit(11) }] : []),
  ...readiness.ready.map((m) => ({ id: `item-${m.id}`, label: m.label, note: m.note, onOpen: () => navigate(m.to) }))] :

  [];
  const first = pending[0];
  const start = !s ?
  null :
  !first ?
  { variant: 'success' as const, title: 'Configuração concluída', text: 'Tudo revisado. Você pode ajustar suas escolhas a qualquer momento.', button: '' } :
  first.id === 'whatsapp' ?
  { variant: 'warning' as const, title: 'Comece por aqui: conectar o WhatsApp', text: `${w.Your} está ${w.fem ? 'configurada' : 'configurado'}; conecte o WhatsApp quando estiver pronto para começar.`, button: 'Conectar WhatsApp' } :
  first.id === 'assistente' ?
  { variant: 'warning' as const, title: 'Comece por aqui: ligar a assistente', text: `WhatsApp ${s.whatsappNumber} conectado; ${who} só começa a atender quando você ligar.`, button: 'Ligar a assistente' } :
  { variant: 'info' as const, title: `Comece por aqui: ${first.label}`, text: withPeriod(first.detail ?? ''), button: 'Fazer agora' };

  const onIds = s ? Object.entries(s.automations).filter(([, v]) => v).map(([k]) => k) : [];
  const transactionalOn = onIds.filter((k) => kindOf(k) !== 'campanha').map((k) => automationNames[k] || k);
  const campaignsOn = onIds.filter((k) => kindOf(k) === 'campanha').map((k) => automationNames[k] || k);
  const insurance = s?.profile.acceptsInsurance === 'sim' ? ' · atende convênio' : s?.profile.acceptsInsurance === 'nao' ? ' · não atende convênio' : '';
  const clinicEx = s?.clinicExceptions ?? [];
  const received = s ? s.faqs.filter((f) => (f.question ?? '').trim()).length : 0;
  const answered = s ? s.faqs.filter((f) => (f.question ?? '').trim() && f.answer.trim()).length : 0;
  const imported = s ? s.importedClients ? s.importedClients.length : s.imported : 0;
  const hoursText = s ?
  [
  s.hours.filter((x) => x.open).map((x) => `${x.day}: ${rangesText(clinicPeriods(x))}`).join(' · ') || 'Nenhum dia de funcionamento definido',
  clinicEx.length ? `Datas especiais: ${[...clinicEx].sort((a, b) => a.date.localeCompare(b.date)).map((b) => `${dmy(b.date)} ${clinicExceptionLabel(b)}`).join(' · ')}` : ''].

  filter(Boolean).
  join(' — ') :
  '';
  const details = s ?
  [
  [s.clinic.name, segmentText(s.clinic)].filter(Boolean).join(' · ') || EMPTY,
  hoursText,
  s.team.map((x) => x.name).join(', ') || 'Nenhum profissional cadastrado',
  s.services.map((x) => `${x.name} · ${x.price ? `R$ ${x.price}` : 'preço a definir'}${Number(x.returnDays) > 0 ? ` · retorno em ${x.returnDays} dias` : ''}`).join('; ') || 'Nenhum serviço cadastrado',
  `${[name, display(s.profile.tone)].filter(Boolean).join(' · ')}${insurance}`,
  // G4 · fechamento: é a contagem do que VEIO (perguntas recebidas e quantas têm resposta); a prontidão ao lado mede outra coisa (mínimo de respondidas).
  `${n(received, 'pergunta recebida', 'perguntas recebidas')}, ${n(answered, 'com resposta', 'com resposta')} · ${n(s.documents.length, 'documento escolhido', 'documentos escolhidos')}${s.documents.length ? ' (o arquivo não vem na passagem: envie de novo em Conhecimento)' : ''}`,
  'Disponível em breve · nada a escolher agora',
  imported ? n(imported, 'cliente importado', 'clientes importados') : 'Nenhum cliente importado',
  [transactionalOn.length ? transactionalOn.join(', ') : '', campaignsOn.length ? `Campanhas marcadas (só saem com consentimento do cliente): ${campaignsOn.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Nenhuma preferência marcada'] :

  [];
  const notReceived = !s && attempted && status !== 'waiting';
  const readyText = `${readiness.done} de ${readiness.total}`;
  const applied = result ? appliedText(result, source === 'exemplo') : null;
  const p = firstAccessPreview;
  const preview = [
  { id: 'conversas', label: p.conversas.label, support: p.conversas.support, actionLabel: p.conversas.actionLabel, to: '/conversas' },
  {
    id: 'oportunidades',
    label: p.oportunidades.label,
    support: imported ? `${n(imported, 'cliente importado', 'clientes importados')} · ${p.oportunidades.supportImported}` : p.oportunidades.supportEmpty,
    actionLabel: p.oportunidades.actionLabel,
    to: '/oportunidades'
  },
  { id: 'amanha', label: p.amanha.label, support: p.amanha.support, actionLabel: p.amanha.actionLabel, to: `/agenda?data=${addDaysIso(TODAY_ISO, 1)}&filtro=a-confirmar` },
  { id: 'lista-espera', label: p.listaEspera.label, support: p.listaEspera.support, actionLabel: p.listaEspera.actionLabel, to: AGENDA_WAITLIST_PATH }];

  const emptyCard = (c: {label: string;support: string;actionLabel: string;to: string;}) =>
  <HighlightCard label={c.label} value="—" support={c.support} actionLabel={c.actionLabel} as={Link} linkProps={{ to: c.to }} ariaLabel={`${c.label}: ${c.support}. ${c.actionLabel}`} />;


  return (
    <DashboardLayout
      activeId="inicio"
      title={s && s.owner.name.trim() ? `Boas-vindas, ${s.owner.name.trim().split(' ')[0]}` : 'Boas-vindas à Orniplaty'}
      subtitle={`${s?.clinic.name?.trim() || 'Primeiro acesso'} · ${todayHeaderLabel()}`}
      firstAccessUsage={firstAccessPlan()}
      firstAccess
      // Rodada de 11/11/2026 (Christian): a etiqueta saiu da direita do título (lugar da faixa do topo) e fica abaixo da data, como no Início.
      belowSubtitle={<StatusBadge status={active ? 'success' : connected ? 'info' : 'neutral'} label={active ? 'Assistente ligada' : connected ? 'Conectado · assistente desligada' : 'WhatsApp ainda não conectado'} />}>
      
      {power.modals}
      <div className="mt-6 flex flex-col gap-6">
        {notice && <Alert variant="info">{notice}</Alert>}
        {!s ?
        <Card padding="lg">
            <h2 className="text-lg font-bold">{status === 'waiting' ? 'Recebendo sua configuração…' : notReceived ? 'Configuração não recebida' : 'Vamos trazer sua configuração'}</h2>
            {notReceived ?
          <div className="mt-2 space-y-2 text-sm leading-6 text-text-secondary">
                <p>
                  Esta janela foi aberta pelo onboarding, mas nenhuma configuração chegou. <strong className="text-text-primary">Nada foi importado nem confirmado.</strong>
                </p>
                <p>Isso acontece quando o painel abre na mesma aba (como no navegador do app) ou quando o pop-up é bloqueado. Abra o onboarding em uma nova janela do Chrome, Edge ou Safari, permita pop-ups para este site e use “Ir para o painel” na última etapa.</p>
              </div> :

          <p className="mt-2 text-sm text-text-secondary">{status === 'waiting' ? 'Mantenha a janela do onboarding aberta.' : 'Abra o painel pela última etapa do onboarding para ver aqui o que você configurou.'}</p>
          }
            <Button size="md" className="mt-4" onClick={() => window.open(`${ONBOARDING_ORIGIN}/#/email`, 'orniplaty-onboarding')}>
              Abrir onboarding
            </Button>
          </Card> :

        <>
            {/* L15: o começo. Um aviso, uma frase, o único botão preenchido da tela, e ele é o próximo passo. */}
            {start &&
          <Alert
            variant={start.variant}
            title={start.title}
            actions={
            start.button && first ?
            <Button size="md" variant="primary" onClick={first.onOpen}>
                      {start.button}
                    </Button> :
            undefined
            }>
            
                {start.text}
              </Alert>
          }
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
              <SetupChecklistCard
              title={firstAccessList.title}
              sentence={firstAccessList.sentence}
              info={firstAccessList.info}
              progress={<ProgressBar size="md" value={readiness.pct} tone={completionTone(readiness.pct)} label={`Sua assistente conhece ${readyText} itens importantes`} valueLabel={`${readiness.pct}%`} />}
              pending={pending}
              done={done} />
            
              <Card as="section" padding="lg" aria-label="Sua configuração">
                <CardHeader>
                  <CardTitle as="h2">Sua configuração</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-secondary">
                    {applied ? `${applied.title}.` : 'O que você escolheu no onboarding.'}
                    {applied &&
                  <span className="ml-1 inline-flex align-middle">
                        <InfoTip label="o que foi aplicado" ariaLabel="O que foi aplicado às telas?" content={applied.full} />
                      </span>
                  }
                  </p>
                  <Button variant="secondary" size="md" className="mt-3" aria-expanded={configOpen} aria-controls="primeiro-acesso-config" onClick={() => setConfigOpen((v) => !v)}>
                    {configOpen ? 'Ocultar o que veio do onboarding' : 'Ver o que veio do onboarding'}
                  </Button>
                  {configOpen &&
                <div className="overflow-hidden">
                      <ExpandMotion id="primeiro-acesso-config">
                        <div className="mt-2 divide-y divide-border">
                          {labels.map((label, i) => {
                        const soon = COMING_SOON.includes(i + 1);
                        const teamChips = i === 2 && s.team.length > 0;
                        return (
                          <div key={label} className="flex flex-col gap-2 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
                                    {label}
                                    {soon && <StatusBadge status="neutral" label="Em breve" size="sm" showDot={false} />}
                                  </h3>
                                  {teamChips && <TeamSchedules s={s} />}
                                  {i === 4 && s.profile.greeting && <p className="mt-2 rounded-lg bg-surface-muted p-3 text-sm">“{s.profile.greeting}”</p>}
                                  {!teamChips && <p className="mt-1 break-words text-sm leading-6 text-text-secondary">{details[i]}</p>}
                                  {i === 0 && s.clinic.street &&
                              <p className="text-sm text-text-secondary">
                                      {s.clinic.street}, {s.clinic.number} · {s.clinic.city}
                                    </p>
                              }
                                </div>
                                {!soon &&
                            <div className="flex shrink-0 flex-wrap gap-2 self-start">
                                    <Button size="sm" variant="neutral" onClick={() => edit(i + 1)} aria-label={`Revisar ${label.toLowerCase()} no onboarding`}>
                                      Revisar
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => navigate(destinations[i])} aria-label={`Ver ${label.toLowerCase()} no painel`}>
                                      Ver no painel
                                    </Button>
                                  </div>
                            }
                              </div>);

                      })}
                        </div>
                      </ExpandMotion>
                    </div>
                }
                </CardContent>
              </Card>
            </div>
          </>
        }
        {/* L15: os cartões do Início (mesma grade e mesma peça), vazios, com uma linha do que aparece ali. */}
        <section aria-labelledby="primeiro-acesso-previa" className="flex flex-col gap-4">
          <h2 id="primeiro-acesso-previa" className="text-base font-bold text-text-primary">
            {p.heading}
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {preview.map((c) =>
            <React.Fragment key={c.id}>{emptyCard(c)}</React.Fragment>
            )}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card as="section" padding="lg" aria-label={p.hoje.title}>
              <CardHeader>
                <CardTitle as="h3">{p.hoje.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary">{p.hoje.body}</p>
              </CardContent>
            </Card>
            <div className="flex flex-col gap-6">{emptyCard({ label: p.resultado.label, support: p.resultado.support, actionLabel: p.resultado.actionLabel, to: '/resultados' })}</div>
          </div>
        </section>
      </div>
    </DashboardLayout>);

}