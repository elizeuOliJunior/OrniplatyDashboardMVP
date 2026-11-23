import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArchiveIcon, ArchiveRestoreIcon, MessageCircleQuestionIcon, PlusIcon, SparklesIcon, Trash2Icon, XIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ConflictNotice, NoticeInline } from '../ui/Notice';
import { ScrollableTabs } from '../ui/ScrollableTabs';
import { Button } from '../Button';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Select } from '../Select';
import { Pill, PillGroup } from '../Pill';
import { Toggle } from '../Toggle';
import { Alert, Card, ChoiceCards, ConflictNotice as DsConflictNotice, FollowUpEditor, InfoTip, ProfessionalTag, StatusBadge } from '../Card';
import { WhatsAppPreview } from '../atendente-ia/WhatsAppPreview';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../Tabs';
import { tabListNoScroll } from '../ui/styles';
import { parseBRL } from '../../utils/currency';
import {
  BAD_EXAMPLE,
  DESCRIPTION_MAX,
  GOOD_EXAMPLE,
  KIND_OPTIONS,
  MODALITY_OPTIONS,
  PRICE_MODE_OPTIONS,
  blankKnowledge,
  evaluationMissing,
  fillTemplate,
  knowledgeBadgeLabel,
  knowledgeStatus,
  newServiceId,
  priceModeExample } from
'../../data/servicesStore';
import { serviceArchiveImpact, serviceArchiveLines, serviceChangeConflicts, waitlistAffectedBy } from '../../data/serviceArchiveImpact';
import type { ServiceConflictRecord } from '../../data/serviceConflicts';
import { useFollowUp, shortDate as caseDate } from '../../data/followUp';
import { mediumDayLabel } from '../../data/agendaStore';
import type { Category, PriceMode, ServiceItem, ServiceKind, ServiceModality } from '../../data/servicesStore';
import { MODEL_PLAIN, MODEL_PLAIN_ORDER, RETURN_QUESTION, defaultDueFor, durationText, hasSteps, leadDays, returnDaysOf, stepsFor, suggestModel } from '../../data/followUpModels';
import type { ModelKind, ServiceFollowUp, Step } from '../../data/followUpModels';
import { automacoesStore } from '../../data/automacoes';
import { useSavedStore } from '../../data/iaConfigStore';
import { messageText, planReturn } from '../../data/followUp';
import { ReturnPlanTimeline } from '../client/ReturnPlanTimeline';
import { useSavedAutomationMode } from '../../data/automationMode';
import { TODAY_ISO, NOW } from '../../data/agendaStore';
import { shortDate } from '../../data/catalogo';
import type { TeamMember } from '../../data/equipeFuncionamento';
import { empresaStore } from '../../data/empresa';
import { blankServicePayment, servicePaymentErrors } from '../../data/paymentRules';
import { answerQuestion } from '../../data/assistantAnswer';
import { conhecimentoStore } from '../../data/conhecimento';
import { atendimentoStore } from '../../data/comoAtender';
import type { ServicePayment } from '../../data/paymentRules';
import { ServicePaymentTab } from './ServicePaymentTab';
import { ArchiveConfirm } from './ArchiveConfirm';
import { requestLeave } from '../ui/UnsavedChanges';
import { askToDiscard } from '../../data/dirtyGuard';
import { occupancyOf, turmaWhen, turmasOfService, useTurmas } from '../../data/turmas';

type Props = {
  open: boolean;
  onClose: () => void;
  editing: ServiceItem | null;
  categories: Category[];
  services: ServiceItem[];
  members: TeamMember[];
  /** Serviço já tem atendimentos no histórico? Então não pode ser apagado, só arquivado. */
  hasHistory: (id: string) => boolean;
  /** W2: `conflicts` = agendamentos que a mudança deixou fora da regra (vão para "Falta resolver", nas Notificações da agenda). */
  onSave: (s: ServiceItem, conflicts: ServiceConflictRecord[]) => void;
  onArchive: (id: string, active: boolean, conflicts?: ServiceConflictRecord[]) => void;
  /** W2 (A3-05): "Cadastrar serviço de Avaliação" a partir do aviso da aba "O que a assistente explica". */
  onNewEvaluation?: () => void;
  /** Serviço novo que já abre com este tipo de atendimento. */
  initialKind?: ServiceKind;
  onManageCategories: () => void;
  /** aba que abre primeiro (ex.: vindo de IA Orniplaty › Conhecimento) */
  initialTab?: string;
  /**
   * Ajustes do Lote F: janela aberta POR CIMA de IA Orniplaty › Empresa. "Mudar o padrão" e os atalhos dos bloqueios
   * fecham a janela (com o aviso se houver alteração) e chamam isto, em vez de trocar de tela.
   */
  onGoDefault?: (campo: string) => void;
};

type Form = {
  name: string;
  categoryId: string;
  kind: ServiceKind;
  modality: ServiceModality;
  minutes: string;
  priceMode: PriceMode;
  price: string;
  /** Agenda e retorno (Lote B): modelo de acompanhamento e passos. */
  model: ModelKind;
  /** Manutenção: prazo · Série: intervalo · Revisão: dias depois */
  due: string;
  sessions: string;
  after: string;
  steps: Step[];
  pros: string[];
  k: ServiceItem['knowledge'];
  /** Lote F: exceções de pagamento deste serviço ('padrao' = segue IA Orniplaty › Empresa). */
  pay: ServicePayment;
  /** CONTRATO NOVO (aulas em grupo, 23/11/2026): "Atendimento em grupo" e "Vagas por horário" (2 a 50). */
  group: boolean;
  capacity: string;
};

/** G1 (F-055): mesmo conversor do produto inteiro ("12,50" e "12.50" = R$ 12,50). */
const toNumber = (v: string) => parseBRL(v);
const priceText = (n: number) => n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const fid = () => `faq-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Lote E (E3): o exemplo de pedido muda com o tipo de atendimento. */
function kindExample(kind: ServiceKind, name: string) {
  switch (kind) {
    case 'avaliacao':
      return 'quero fazer uma avaliação';
    case 'consulta':
      return 'quero marcar uma consulta';
    case 'procedimento':
      // W2 (A3-17): sem artigo, para servir a qualquer nome ("quero fazer peeling químico").
      return `quero fazer ${name.trim() ? name.trim().toLowerCase() : 'limpeza de pele'}`;
    case 'sessao':
      return 'quero marcar a próxima sessão';
    case 'retorno':
      return 'preciso voltar para o retorno';
    case 'aula':
      return 'quero marcar uma aula';
  }
}

const SECTION_TITLE = 'text-sm font-bold text-text-primary';
const SECTION_HELP = 'mt-0.5 text-xs text-text-secondary';

/**
 * W2 (11/11/2026): clientes em acompanhamento de retorno deste serviço (A3-22, decisão 5 = b do Christian). Só monta
 * quando a regra de retorno mudou, para não calcular Oportunidades a cada abertura da janela.
 */
function FollowUpImpact({ serviceName, ack, onAck, onCount, show = true, className = 'mt-4' }: {serviceName: string;ack: boolean;onAck: (v: boolean) => void;onCount: (n: number) => void;show?: boolean;className?: string;}) {
  const { all } = useFollowUp();
  const list = useMemo(() => {
    const seen = new Set<string>();
    return all.
    filter((c) => c.motive === 'retorno' && c.service === serviceName && c.situation !== 'resolvidos').
    sort((a, b) => Number(b.situation === 'precisa') - Number(a.situation === 'precisa')).
    filter((c) => seen.has(c.clientId) ? false : (seen.add(c.clientId), true));
  }, [all, serviceName]);
  useEffect(() => onCount(list.length), [list.length, onCount]);
  // L11: a instância de contagem fica montada fora das abas (show=false); a que aparece fica na aba "Agenda e retorno".
  if (!list.length || !show) return null;
  // Mesmo aviso do DS, com o texto do "Entendi" certo para clientes (não são agendamentos). O repasse de ui/Notice não expõe `ackLabel`.
  return (
    <DsConflictNotice
      className={className}
      title={`${list.length} ${list.length === 1 ? 'cliente já está' : 'clientes já estão'} em acompanhamento de retorno deste serviço`}
      items={list.map((c) => ({
        key: c.id,
        name: c.clientName,
        when: c.situation === 'precisa' ? 'Em “Precisam de você”' : c.next ? `Próxima mensagem em ${caseDate(c.next.plannedIso)}` : 'Em acompanhamento',
        detail: c.situation === 'precisa' ? 'Com a nova regra, pode sair dessa lista sem ninguém decidir. Confira em Oportunidades depois de salvar.' : undefined
      }))}
      footnote="A nova regra vale também para eles: as datas das próximas mensagens de retorno mudam (as já enviadas, não)."
      ack={ack}
      onAck={onAck}
      ackLabel="Entendi: salvar com a nova regra para esses clientes" />);


}

/**
 * Cadastro do serviço em 5 abas. W2 (11/11/2026, A3-18): Básico · Quem faz · Agenda e retorno · Pagamento · O que a assistente explica.
 * É aqui que a assistente aprende o que o serviço inclui, para responder "quero marcar uma consulta" sem inventar.
 * Itens marcados como "novo" no comentário do store (servicesStore.ts) dependem de contrato novo no backend.
 * Lote B (20/10/2026): "Agenda e retorno" ganhou o modelo de acompanhamento (sugestão pelo nome e pela categoria),
 * os campos de cada modelo e o FollowUpEditor do serviço. Saiu o aviso "O lembrete de retorno depende da integração".
 * L11 (16/11/2026): os avisos de quem a mudança afeta ficam logo abaixo do campo que os causou; o motivo do "Salvar"
 * desativado fica no rodapé, à vista; "Falta resolver" no lugar de "Conflitos a resolver"; abas `sm`.
 */
export function ServicoModal({ open, onClose, editing, categories, services, members, hasHistory, onSave, onArchive, onManageCategories, initialTab, onGoDefault, onNewEvaluation, initialKind }: Props) {
  const navigate = useNavigate();
  const library = useSavedStore(automacoesStore).models;
  /** Lote F: o padrão de pagamento vem da Empresa SALVA. */
  const empresa = useSavedStore(empresaStore);
  const sendMode = useSavedAutomationMode();
  /** Ajustes do Lote B (B5): "Ajustar as mensagens" fica fechado por padrão. */
  const [showSteps, setShowSteps] = useState(false);
  const blank = (): Form => ({ name: '', categoryId: categories[0]?.id ?? '', kind: initialKind ?? 'procedimento', modality: 'presencial', minutes: '', priceMode: 'fixo', price: '', model: 'manutencao', due: '30', sessions: '', after: '', steps: stepsFor('manutencao', 30, library), pros: [], k: blankKnowledge(), pay: blankServicePayment(), group: false, capacity: '' });
  const [form, setForm] = useState<Form>(blank);
  /** Serviço novo: até a pessoa escolher, o modelo segue a sugestão da Orniplaty. */
  const [modelTouched, setModelTouched] = useState(false);
  const [previewStep, setPreviewStep] = useState<number | null>(null);
  const [tab, setTab] = useState('basico');
  const [submitted, setSubmitted] = useState(false);
  const [synonymDraft, setSynonymDraft] = useState('');
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  /** W2: "Entendi" dos avisos de conflito (A3-02) e de acompanhamento (A3-22). */
  const [ackChange, setAckChange] = useState(false);
  const [ackFollow, setAckFollow] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  /** CONTRATO NOVO (aulas em grupo, 23/11/2026): "Entendi" do aviso de vagas abaixo do número de inscritos. */
  const [ackCapacity, setAckCapacity] = useState(false);

  /** Formulário como abriu (para saber se houve alteração ao sair por "Mudar o padrão" sem trocar de tela). */
  const baselineRef = useRef('');
  useEffect(() => {
    if (!open) return;
    const s = editing;
    const loaded: Form =
    s ?
    {
      name: s.name,
      categoryId: s.categoryId,
      kind: s.kind,
      modality: s.modality,
      minutes: String(s.durationMin),
      priceMode: s.priceMode,
      price: priceText(s.price),
      model: s.followUp.model,
      due: s.followUp.dueDays ? String(s.followUp.dueDays) : '',
      sessions: s.followUp.sessions ? String(s.followUp.sessions) : '',
      after: s.followUp.afterSeriesDays ? String(s.followUp.afterSeriesDays) : '',
      steps: s.followUp.steps.map((x) => ({ ...x })),
      pros: [...s.professionalIds],
      k: { ...s.knowledge, synonyms: [...s.knowledge.synonyms], faqs: s.knowledge.faqs.map((f) => ({ ...f })) },
      pay: JSON.parse(JSON.stringify(s.payment ?? blankServicePayment())) as ServicePayment,
      group: !!s.group,
      capacity: s.group ? String(s.group.capacity) : ''
    } :
    blank();
    setForm(loaded);
    baselineRef.current = JSON.stringify(loaded);
    setTab(initialTab ?? 'basico');
    setModelTouched(!!s);
    setPreviewStep(null);
    setShowSteps(false);
    setSubmitted(false);
    setSynonymDraft('');
    setQuestion('');
    setAsked('');
    setAckChange(false);
    setAckFollow(false);
    setFollowCount(0);
    setAckCapacity(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Form,>(key: K, v: Form[K]) => setForm((f) => ({ ...f, [key]: v }));
  const setK = <K extends keyof Form['k'],>(key: K, v: Form['k'][K]) => setForm((f) => ({ ...f, k: { ...f.k, [key]: v } }));

  const minutes = Number(form.minutes);
  const price = toNumber(form.price);
  const due = Number(form.due);
  const sessions = Number(form.sessions);
  const after = Number(form.after);
  const capacity = Number(form.capacity);
  const needsDue = form.model === 'manutencao' || form.model === 'serie' || form.model === 'revisao';
  const errors = {
    name: !form.name.trim() ? 'Informe o nome do serviço.' : undefined,
    minutes: !(minutes >= 5 && minutes <= 480) ? 'Informe a duração entre 5 e 480 minutos.' : undefined,
    price: form.priceMode !== 'sob-consulta' && !(price > 0) ? 'Informe o preço.' : undefined,
    description: form.k.description.length > DESCRIPTION_MAX ? `Use no máximo ${DESCRIPTION_MAX} caracteres.` : undefined,
    due: needsDue && !(due >= 1 && due <= 365) ? 'Use de 1 a 365 dias.' : undefined,
    sessions: form.model === 'serie' && !(sessions >= 2 && sessions <= 50) ? 'Use de 2 a 50 sessões.' : undefined,
    after: form.model === 'serie' && form.after && !(after >= 1 && after <= 365) ? 'Use de 1 a 365 dias, ou deixe em branco.' : undefined,
    pros: form.pros.length === 0 ? 'Escolha ao menos um profissional.' : undefined,
    // CONTRATO NOVO (aulas em grupo, 23/11/2026)
    capacity: form.group && !(Number.isInteger(capacity) && capacity >= 2 && capacity <= 50) ? 'Use de 2 a 50 vagas.' : undefined,
    pagamento: Object.keys(servicePaymentErrors(form.pay, { priceMode: form.priceMode }, empresa)).length ? 'Confira a aba Pagamento.' : undefined
  };
  const payErrors = servicePaymentErrors(form.pay, { priceMode: form.priceMode }, empresa);
  const tabOfError: [keyof typeof errors, string][] = [
  ['name', 'basico'],
  ['minutes', 'basico'],
  ['capacity', 'basico'],
  ['price', 'basico'],
  ['pagamento', 'pagamento'],
  ['description', 'assistente'],
  ['due', 'agenda'],
  ['sessions', 'agenda'],
  ['after', 'agenda'],
  ['pros', 'quem-faz']];


  const categoryLabel = categories.find((c) => c.id === form.categoryId)?.name ?? '';
  const suggested = suggestModel(form.name, categoryLabel, form.kind);
  const followUp: ServiceFollowUp = useMemo(
    () => ({
      model: form.model,
      dueDays: needsDue && due > 0 ? due : null,
      sessions: form.model === 'serie' && sessions > 0 ? sessions : undefined,
      afterSeriesDays: form.model === 'serie' ? after > 0 ? after : null : undefined,
      steps: hasSteps(form.model) ? form.steps : []
    }),
    [form.model, form.steps, needsDue, due, sessions, after]
  );

  /** B5: exemplo vivo com datas (cliente que fizesse o serviço hoje; "profissional decide" usa 30 dias como exemplo). */
  const exampleName = form.name.trim() || 'este serviço';
  const examplePlan = useMemo(
    () => hasSteps(followUp.model) ? planReturn(followUp, TODAY_ISO, followUp.model === 'profissional' ? 30 : null, library, 1, TODAY_ISO) : null,
    [followUp, library]
  );

  /** Troca de modelo: prazo e passos voltam ao padrão do modelo (biblioteca de Automações). */
  const chooseModel = (m: ModelKind) => {
    const d = defaultDueFor(m);
    setForm((f) => ({ ...f, model: m, due: d ? String(d) : '', sessions: m === 'serie' ? '5' : '', after: '', steps: stepsFor(m, d, library) }));
    setModelTouched(true);
  };
  const openTab = (t: string) => {
    if (t === 'agenda' && !editing && !modelTouched && suggested !== form.model) {
      const d = defaultDueFor(suggested);
      setForm((f) => ({ ...f, model: suggested, due: d ? String(d) : '', sessions: suggested === 'serie' ? '5' : '', after: '', steps: stepsFor(suggested, d, library) }));
      // A pessoa viu o modelo sugerido: daqui em diante vale o que está na tela.
      setModelTouched(true);
    }
    setTab(t);
  };

  const candidate: ServiceItem = useMemo(
    () => ({
      id: editing?.id ?? 'novo-servico',
      name: form.name.trim(),
      categoryId: form.categoryId,
      kind: form.kind,
      modality: form.modality,
      durationMin: minutes || 0,
      priceMode: form.priceMode,
      price: form.priceMode === 'sob-consulta' ? 0 : price || 0,
      returnDays: returnDaysOf(followUp),
      followUp,
      professionalIds: form.pros,
      active: editing?.active ?? true,
      knowledge: { ...form.k, description: form.k.description.trim(), faqs: form.k.faqs.filter((f) => f.question.trim() || f.answer.trim()) },
      payment: form.pay,
      group: form.group ? { capacity: capacity || 0 } : null
    }),
    [editing, form, minutes, price, followUp, capacity]
  );
  const status = knowledgeStatus(candidate);
  const noEvaluationService = evaluationMissing(candidate, services);
  /** W2 (A3-02, D-A3-1): agendamentos futuros que a mudança deixaria fora da regra do serviço. Nada muda sozinho. */
  const changeHits = useMemo(() => open && editing ? serviceChangeConflicts(editing, candidate) : [], [open, editing, candidate]);
  const changeWaitlist = useMemo(() => open && editing ? waitlistAffectedBy(editing, candidate) : 0, [open, editing, candidate]);
  const changeKey = changeHits.map((c) => c.apptId + c.kind).join(',');
  useEffect(() => setAckChange(false), [changeKey]);
  /** W2 (A3-22): a regra de retorno mudou? Então quem já está em acompanhamento muda junto (decisão 5 = b). */
  const followChanged = !!editing && JSON.stringify(editing.followUp) !== JSON.stringify(candidate.followUp);
  useEffect(() => setAckFollow(false), [followChanged]);
  const countFollow = React.useCallback((n: number) => setFollowCount(n), []);
  const blockedByChange = changeHits.length > 0 && !ackChange;
  const blockedByFollow = followChanged && followCount > 0 && !ackFollow;
  /**
   * L11 (meta 1): o aviso fica logo abaixo do campo que o causou — Duração (aba Básico) ou a lista de "Quem faz" — e o de
   * acompanhamento fica na aba "Agenda e retorno". Ao aparecer, entra na área visível da janela. Mesma regra: nada muda
   * sozinho e "Salvar" só libera com "Entendi" (D-A3-1).
   */
  const changeTab = changeHits.some((c) => c.kind === 'duration') ? 'basico' : 'quem-faz';
  const changeTabLabel = changeTab === 'basico' ? 'Básico' : 'Quem faz';
  const changeNoticeRef = useRef<HTMLDivElement>(null);
  const followNoticeRef = useRef<HTMLDivElement>(null);
  const hadChange = useRef(false);
  useEffect(() => {
    const has = changeHits.length > 0;
    if (has && !hadChange.current) window.setTimeout(() => changeNoticeRef.current?.scrollIntoView({ block: 'nearest' }), 0);
    hadChange.current = has;
  }, [changeHits.length]);
  const hadFollow = useRef(false);
  useEffect(() => {
    const has = followChanged && followCount > 0;
    if (has && !hadFollow.current) window.setTimeout(() => followNoticeRef.current?.scrollIntoView({ block: 'nearest' }), 0);
    hadFollow.current = has;
  }, [followChanged, followCount]);
  /**
   * CONTRATO NOVO (aulas em grupo, 23/11/2026). Desligar o atendimento em grupo com turmas ativas não salva (aviso logo
   * abaixo da chave). Baixar as vagas abaixo dos inscritos de uma turma pode, com o aviso que nomeia as turmas e "Entendi";
   * ninguém sai da turma sozinho (mesma regra de 11/11 para duração e arquivar).
   */
  const turmasState = useTurmas();
  const activeTurmas = editing ? turmasOfService(editing.id, true, turmasState) : [];
  const blockedByGroupOff = !!editing && !form.group && activeTurmas.length > 0;
  const capacityHits =
  form.group && !errors.capacity ? activeTurmas.map((t) => ({ t, n: occupancyOf(t.id, turmasState) })).filter((x) => x.n > capacity) : [];
  const capacityKey = capacityHits.map((x) => `${x.t.id}:${x.n}`).join(',') + `|${capacity}`;
  useEffect(() => setAckCapacity(false), [capacityKey]);
  const blockedByCapacity = capacityHits.length > 0 && !ackCapacity;
  /** Motivo do "Salvar" desativado, em texto visível ao lado dos botões. */
  const blockedReason = blockedByGroupOff ?
  tab === 'basico' ?
  'Para salvar, ligue de novo o “Atendimento em grupo” ou arquive as turmas.' :
  'Para salvar, veja o aviso do “Atendimento em grupo” na aba Básico.' :
  blockedByCapacity ?
  tab === 'basico' ?
  'Para salvar, marque “Entendi” no aviso abaixo de “Vagas por horário”.' :
  'Para salvar, marque “Entendi” no aviso da aba Básico.' :
  blockedByChange ?
  tab === changeTab ?
  `Para salvar, marque “Entendi” no aviso abaixo de ${changeTab === 'basico' ? '“Duração”' : '“Quem faz este serviço”'}.` :
  `Para salvar, marque “Entendi” no aviso da aba ${changeTabLabel}.` :
  blockedByFollow ?
  tab === 'agenda' ?
  'Para salvar, marque “Entendi” no aviso dos clientes em acompanhamento.' :
  'Para salvar, marque “Entendi” no aviso da aba Agenda e retorno.' :
  '';
  /** Arquivar: impacto e nomes, ANTES de confirmar (A3-02 e G4 F-057). */
  const archiveHits = useMemo(() => confirmArchive && editing ? serviceChangeConflicts(editing, { ...editing, active: false }) : [], [confirmArchive, editing]);
  const archiveLines = useMemo(() => confirmArchive && editing ? serviceArchiveLines(serviceArchiveImpact(editing)).filter((l) => !/horários? futuros?/.test(l)) : [], [confirmArchive, editing]);
  const evaluationOptions = services.filter((s) => s.kind === 'avaliacao' && s.active && s.id !== editing?.id);
  const noScheduleMembers = members.filter((m) => form.pros.includes(m.id) && !m.week.some((d) => d.working && d.periods.length > 0));

  const save = () => {
    setSubmitted(true);
    const first = tabOfError.find(([key]) => errors[key]);
    if (first) {
      setTab(first[1]);
      return;
    }
    if (blockedByChange || blockedByFollow || blockedByGroupOff || blockedByCapacity) return;
    // Serviço novo sem abrir "Agenda e retorno": fica com o modelo sugerido pela Orniplaty.
    let item = candidate;
    if (!editing && !modelTouched && suggested !== form.model) {
      const d = defaultDueFor(suggested);
      const f: ServiceFollowUp = { model: suggested, dueDays: d, sessions: suggested === 'serie' ? 5 : undefined, afterSeriesDays: suggested === 'serie' ? null : undefined, steps: stepsFor(suggested, d, library) };
      item = { ...candidate, followUp: f, returnDays: returnDaysOf(f) };
    }
    onSave(item.id === 'novo-servico' ? { ...item, id: newServiceId() } : item, changeHits);
    onClose();
  };

  const addSynonym = () => {
    const t = synonymDraft.trim();
    if (!t || form.k.synonyms.some((x) => x.toLowerCase() === t.toLowerCase())) return setSynonymDraft('');
    setK('synonyms', [...form.k.synonyms, t]);
    setSynonymDraft('');
  };

  const err = (key: keyof typeof errors) => submitted ? errors[key] : undefined;
  /** Sair da janela para outra tela (ex.: "Mudar o padrão"): com alterações, passa pelo aviso de alterações não salvas. */
  const leaveTo = (to: string) =>
  requestLeave(() => {
    onClose();
    navigate(to);
  });
  /**
   * "Testar como cliente" (G1 subetapa 4, F-011): resposta por INTENÇÃO com a fonte declarada (data/assistantAnswer.ts).
   * Vale o rascunho deste serviço; os outros cadastros vêm salvos (Empresa, Conhecimento, Como atender, Funcionamento).
   */
  const testAnswer = (q: string) =>
  answerQuestion(q, {
    empresa,
    services: [candidate, ...services.filter((x) => x.id !== candidate.id)],
    knowledge: conhecimentoStore.get().items,
    cannotDo: atendimentoStore.get().cannotDo,
    focusService: candidate
  });
  const canDelete = editing && !hasHistory(editing.id);
  /** W2 (A3-02, D-A3-1): mesmo aviso do Horário da clínica. L11: um nome só, "Falta resolver" (Notificações da agenda). */
  const changeNotice =
  changeHits.length > 0 ?
  <div ref={changeNoticeRef} className="scroll-mt-4 scroll-mb-4">
        <ConflictNotice
      title={`${changeHits.length} ${changeHits.length === 1 ? 'agendamento ficaria fora da regra do serviço' : 'agendamentos ficariam fora da regra do serviço'}`}
      items={changeHits.map((c) => ({ key: c.apptId, name: c.clientName, when: `${mediumDayLabel(c.iso)} ${c.start}–${c.end}`, detail: c.message }))}
      footnote={`Nada será cancelado nem movido: eles continuam na agenda, em “Falta resolver”, até você remarcar.${changeWaitlist > 0 ? ` ${changeWaitlist === 1 ? '1 pedido da lista de espera pede' : `${changeWaitlist} pedidos da lista de espera pedem`} este serviço${changeHits.some((c) => c.kind === 'professional') ? ' com quem saiu de “Quem faz”' : ''}.` : ''}`}
      ack={ackChange}
      onAck={setAckChange} />
    
      </div> :
  null;
  const [askTemplate, setAskTemplate] = useState(false);

  return (
    <>
      <AppModal
        open={open}
        onClose={onClose}
        dirtyValue={form}
        size="lg"
        title={editing ? `Editar ${editing.name}` : 'Novo serviço'}
        description="A assistente só oferece o que está cadastrado aqui e explica o serviço com o que você escrever na aba “O que a assistente explica”."
        footer={
        <div className="flex w-full flex-col gap-3">
            {blockedReason &&
          <p id="sv-confirmar-aviso" className="text-sm font-semibold text-text-primary sm:text-right" aria-live="polite">
                {blockedReason}
              </p>
          }
            <ModalActions
            start={
            editing ?
            <Button variant={editing.active ? 'dangerOutline' : 'neutral'} leftIcon={editing.active ? <ArchiveIcon className="h-4 w-4" /> : <ArchiveRestoreIcon className="h-4 w-4" />} onClick={() => editing.active ? setConfirmArchive(true) : (onArchive(editing.id, true), onClose())}>
                    {editing.active ? 'Arquivar serviço' : 'Reativar serviço'}
                  </Button> :
            undefined
            }>
            
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={blockedByChange || blockedByFollow || blockedByGroupOff || blockedByCapacity} aria-describedby={blockedReason ? 'sv-confirmar-aviso' : undefined}>
                {editing ? 'Salvar' : 'Adicionar serviço'}
              </Button>
            </ModalActions>
          </div>
        }>
        
        {/* L11 (meta 3): abas em tamanho `sm` do DS para as cinco caberem na janela; no celular, `ScrollableTabs` rola. */}
        <Tabs value={tab} onValueChange={openTab} size="sm">
          <ScrollableTabs>
            <TabsList aria-label="Seções do serviço" className={`min-w-max ${tabListNoScroll}`}>
              <TabsTrigger value="basico">Básico</TabsTrigger>
              <TabsTrigger value="quem-faz">Quem faz</TabsTrigger>
              <TabsTrigger value="agenda">Agenda e retorno</TabsTrigger>
              <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
              <TabsTrigger value="assistente">O que a assistente explica</TabsTrigger>
            </TabsList>
          </ScrollableTabs>

          {/* ───────── A) Básico ───────── */}
          <TabsContent value="basico" className="mt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Nome do serviço" required value={form.name} maxLength={200} onChange={(e) => set('name', e.target.value)} error={err('name')} />
              <div>
                <Select label="Categoria" options={categories.map((c) => ({ value: c.id, label: c.name }))} value={form.categoryId} onChange={(v) => set('categoryId', v)} />
                <div className="mt-2">
                  <Button size="sm" variant="neutral" onClick={onManageCategories}>
                    Gerenciar categorias
                  </Button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <PillGroup label="Tipo de atendimento" size="sm" options={KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={form.kind} onChange={(v) => typeof v === 'string' && set('kind', v as ServiceKind)} />
                <p className={SECTION_HELP}>{KIND_OPTIONS.find((o) => o.value === form.kind)?.hint} A assistente usa isso para entender pedidos como “{kindExample(form.kind, form.name)}”.</p>
              </div>
              <div className="sm:col-span-2">
                <PillGroup label="Modalidade" size="sm" options={MODALITY_OPTIONS} value={form.modality} onChange={(v) => typeof v === 'string' && set('modality', v as ServiceModality)} />
                {form.modality === 'online' && <p className={SECTION_HELP}>Online: o envio do link da chamada ainda não existe no sistema; combine o link com o cliente por enquanto.</p>}
              </div>
              <Input label="Duração (minutos)" required inputMode="numeric" value={form.minutes} onChange={(e) => set('minutes', e.target.value.replace(/\D/g, '').slice(0, 3))} error={err('minutes')} helperText="De 5 a 480 minutos. É o tempo que a agenda reserva." />
              <div />
              {changeTab === 'basico' && changeNotice && <div className="sm:col-span-2">{changeNotice}</div>}
              {/* CONTRATO NOVO (aulas em grupo, 23/11/2026): atendimento em grupo e vagas por horário. */}
              <div className="flex flex-col gap-4 sm:col-span-2">
                <Toggle
                  checked={form.group}
                  onCheckedChange={(v: boolean) => set('group', v)}
                  labelPosition="right"
                  label={<span className="text-sm font-semibold text-text-primary">Atendimento em grupo</span>}
                  description="Mais de um cliente no mesmo horário, como uma aula ou turma." />
                
                {blockedByGroupOff &&
                <NoticeInline tone="warning" role="alert" title={activeTurmas.length === 1 ? 'Este serviço tem 1 turma.' : `Este serviço tem ${activeTurmas.length} turmas.`}>
                    Arquive as turmas antes de desligar o atendimento em grupo.
                  </NoticeInline>
                }
                {form.group &&
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-text-primary">
                        <label htmlFor="sv-vagas">
                          Vagas por horário
                          <span className="ml-0.5 text-[#B91C1C]" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <InfoTip label="Vagas por horário" content="Quantos clientes cabem em cada horário desta turma." />
                      </p>
                      <Input
                      id="sv-vagas"
                      required
                      inputMode="numeric"
                      value={form.capacity}
                      onChange={(e) => set('capacity', e.target.value.replace(/\D/g, '').slice(0, 2))}
                      error={err('capacity')}
                      helperText="De 2 a 50." />
                    
                    </div>
                  </div>
                }
                {capacityHits.length > 0 &&
                <DsConflictNotice
                  title={capacityHits.length === 1 ? '1 turma fica com mais clientes do que vagas' : `${capacityHits.length} turmas ficam com mais clientes do que vagas`}
                  items={capacityHits.map(({ t, n }) => ({ key: t.id, name: turmaWhen(t), when: `${n} clientes para ${capacity} vagas` }))}
                  footnote="Ninguém sai da turma: os clientes continuam inscritos. Novos clientes só entram quando houver vaga."
                  ack={ackCapacity}
                  onAck={setAckCapacity}
                  ackLabel="Entendi: salvar com menos vagas" />

                }
              </div>
              <div className="sm:col-span-2">
                <PillGroup label="Como mostrar o preço" size="sm" options={PRICE_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={form.priceMode} onChange={(v) => typeof v === 'string' && set('priceMode', v as PriceMode)} />
                <p className={SECTION_HELP}>{priceModeExample(form.priceMode, form.name, price)}</p>
              </div>
              {form.priceMode !== 'sob-consulta' &&
              <Input label={form.priceMode === 'a-partir' ? 'Preço mínimo' : 'Preço'} required prefix="R$" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value.replace(/[^\d.,]/g, ''))} error={err('price')} />
              }
            </div>
          </TabsContent>

          {/* ───────── Pagamento (Lote F, F2): padrão da empresa + diferente neste serviço ───────── */}
          <TabsContent value="pagamento" className="mt-5">
            <ServicePaymentTab
              value={form.pay}
              onChange={(v) => set('pay', v)}
              service={candidate}
              empresa={empresa}
              errors={submitted || initialTab === 'pagamento' ? payErrors : {}}
              arrival={initialTab === 'pagamento'}
              onGoEmpresa={(campo) => {
                if (!onGoDefault) return leaveTo(`/atendente-ia/empresa?campo=${campo}`);
                const go = () => {
                  onClose();
                  onGoDefault(campo);
                };
                if (JSON.stringify(form) !== baselineRef.current) askToDiscard(go);else
                go();
              }} />
            
          </TabsContent>

          {/* ───────── B) O que a assistente explica ───────── */}
          <TabsContent value="assistente" className="mt-5">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={status.complete ? 'success' : 'warning'} label={knowledgeBadgeLabel(status)} />
                <p className="inline-flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
                  {status.complete ?
                  'A assistente tem o que precisa para explicar este serviço.' :
                  status.brackets ?
                  'Troque o que está entre colchetes na descrição.' :
                  'Falta a descrição para o cliente (pelo menos 80 caracteres).'}
                  {!status.complete && <InfoTip label="Enquanto falta" content="Enquanto isso, a assistente passa as dúvidas sobre este serviço para a equipe." />}
                </p>
              </div>
              {status.improve.length > 0 &&
              <p className="-mt-3 text-sm text-text-secondary">
                  <span className="font-semibold text-text-primary">Pode melhorar:</span> {status.improve.join(', ').toLowerCase()}.{' '}
                  <InfoTip label="Pode melhorar" content="Não é obrigatório: com isso a assistente responde mais perguntas sem chamar a equipe." />
                </p>
              }

              <section aria-labelledby="sv-desc">
                <h3 id="sv-desc" className={SECTION_TITLE}>
                  Descrição para o cliente
                </h3>
                <p className={SECTION_HELP}>É o que a assistente usa para explicar o atendimento no WhatsApp. Escreva como se estivesse explicando para um cliente que nunca fez.</p>
                {/* Lote E (E4): modelo e exemplos Boa/Fraca ficam ENTRE o título e a caixa de texto (DS v3.14). */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="md"
                    variant="neutral"
                    leftIcon={<SparklesIcon className="h-4 w-4" />}
                    onClick={() => {
                      // G1 (F-055): com descrição já escrita, pergunta antes de trocar pelo modelo.
                      const next = fillTemplate(form.kind, form.name, minutes);
                      if (form.k.description.trim() && form.k.description.trim() !== next.trim()) setAskTemplate(true);else
                      setK('description', next);
                    }}>
                    
                    Usar modelo
                  </Button>
                  <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                    Preenche um rascunho para o tipo “{KIND_OPTIONS.find((o) => o.value === form.kind)?.label}”.
                    <InfoTip label="Usar modelo" content="Troque o que estiver entre colchetes." />
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[12px] border border-border bg-surface p-3">
                    <dt className="flex items-center gap-2">
                      <StatusBadge status="success" label="Boa" />
                      <span className="text-xs font-semibold text-text-secondary">Exemplo (Limpeza de pele)</span>
                    </dt>
                    <dd className="mt-2 text-sm text-text-primary">{GOOD_EXAMPLE}</dd>
                  </div>
                  <div className="rounded-[12px] border border-border bg-surface p-3">
                    <dt className="flex items-center gap-2">
                      <StatusBadge status="error" label="Fraca" />
                      <span className="text-xs font-semibold text-text-secondary">Sem contexto</span>
                    </dt>
                    <dd className="mt-2 text-sm text-text-primary">“{BAD_EXAMPLE}”</dd>
                    <dd className="mt-1 text-xs text-text-secondary">Com isso a assistente não sabe dizer o que inclui, para quem é, nem quando não fazer.</dd>
                  </div>
                </dl>
                <Textarea
                  containerClassName="mt-3"
                  aria-label="Descrição para o cliente"
                  rows={5}
                  showCount
                  maxLength={DESCRIPTION_MAX}
                  value={form.k.description}
                  onChange={(e) => setK('description', e.target.value)}
                  error={err('description')}
                  placeholder="O que acontece no atendimento, para quem é, quando não é indicado e o que é normal sentir depois." />
                
              </section>

              <section aria-labelledby="sv-syn">
                <h3 id="sv-syn" className={`${SECTION_TITLE} inline-flex items-center gap-1.5`}>
                  Como o cliente costuma chamar este serviço
                  <InfoTip label="Como o cliente chama" content="Se o cliente escrever “quero marcar uma consulta” ou “limpeza facial”, a assistente entende que é este serviço." />
                </h3>
                <p className={SECTION_HELP}>Outros nomes e palavras que o cliente usa. Ex.: consulta, avaliação, limpeza facial.</p>
                {form.k.synonyms.length > 0 &&
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Outros nomes">
                    {form.k.synonyms.map((syn) =>
                  <li key={syn}>
                        <Pill size="sm" selected aria-label={`Remover ${syn}`} onClick={() => setK('synonyms', form.k.synonyms.filter((x) => x !== syn))}>
                          {syn}
                          <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </Pill>
                      </li>
                  )}
                  </ul>
                }
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <Input
                    aria-label="Novo nome"
                    placeholder="Digite e aperte Enter"
                    value={synonymDraft}
                    maxLength={40}
                    onChange={(e) => setSynonymDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSynonym();
                      }
                    }} />
                  
                  <Button size="md" variant="secondary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={addSynonym} disabled={!synonymDraft.trim()} className="sm:mt-1">
                    Adicionar
                  </Button>
                </div>
              </section>

              <section aria-labelledby="sv-details" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <h3 id="sv-details" className={`${SECTION_TITLE} sm:col-span-2`}>
                  Detalhes que a assistente pode explicar <span className="font-normal text-text-muted">(opcionais)</span>
                </h3>
                <Textarea label="O que está incluído" rows={3} value={form.k.included} onChange={(e) => setK('included', e.target.value)} placeholder="Ex.: higienização, esfoliação, extração, máscara e protetor solar." />
                <Textarea label="Preparo antes" rows={3} value={form.k.prepBefore} onChange={(e) => setK('prepBefore', e.target.value)} placeholder="Ex.: vir sem maquiagem; evitar ácidos 3 dias antes." />
                <Textarea label="Cuidados depois" rows={3} value={form.k.careAfter} onChange={(e) => setK('careAfter', e.target.value)} placeholder="Ex.: protetor solar e nada de sol direto por 24 horas." />
                <Textarea label="Quando não é indicado" rows={3} value={form.k.contraindications} onChange={(e) => setK('contraindications', e.target.value)} placeholder="Ex.: gestantes, acne inflamada ativa, pele com queimadura de sol." />
              </section>

              <section aria-labelledby="sv-eval">
                <h3 id="sv-eval" className={SECTION_TITLE}>
                  Avaliação antes
                </h3>
                <div className="mt-2">
                  <Toggle checked={form.k.requiresEvaluation} onCheckedChange={(v: boolean) => setK('requiresEvaluation', v)} labelPosition="right" label={<span className="text-sm font-semibold text-text-primary">Exige avaliação antes</span>} description="A assistente oferece primeiro a avaliação, e não este serviço direto." />
                </div>
                {form.k.requiresEvaluation && evaluationOptions.length > 0 &&
                <div className="mt-3 max-w-sm">
                    <Select label="Qual avaliação" placeholder="Escolha o serviço de avaliação" options={evaluationOptions.map((s) => ({ value: s.id, label: s.name, description: `${s.durationMin} min` }))} value={form.k.evaluationServiceId ?? undefined} onChange={(v) => setK('evaluationServiceId', v)} />
                  </div>
                }
                {/* W2 (A3-05): aviso próprio, fora da conta de "Completo". Mesmo padrão do aviso "Regras gerais…" desta aba. */}
                {noEvaluationService &&
                <Alert
                  compact
                  className="mt-3"
                  variant="warning"
                  title="Ainda não há serviço do tipo “Avaliação”"
                  actions={
                  onNewEvaluation ?
                  <Button size="md" variant="secondary" onClick={() => requestLeave(() => {onClose();onNewEvaluation();})}>
                          Cadastrar serviço de Avaliação
                        </Button> :
                  undefined
                  }>
                  
                    Até você cadastrar, a assistente diz ao cliente que é preciso uma avaliação antes e oferece chamar a equipe.
                  </Alert>
                }
              </section>

              <section aria-labelledby="sv-faq">
                <h3 id="sv-faq" className={SECTION_TITLE}>
                  Perguntas frequentes deste serviço
                </h3>
                <p className={SECTION_HELP}>Perguntas que os clientes fazem sobre este serviço, com a resposta que a clínica quer dar.</p>
                <ul className="mt-2 flex flex-col gap-3">
                  {form.k.faqs.map((f, i) =>
                  <li key={f.id} className="rounded-[12px] border border-border p-3">
                      <div className="flex items-start gap-2">
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3">
                          <Input label={`Pergunta ${i + 1}`} value={f.question} maxLength={2000} onChange={(e) => setK('faqs', form.k.faqs.map((x) => x.id === f.id ? { ...x, question: e.target.value } : x))} />
                          <Textarea label="Resposta" rows={2} maxLength={5000} value={f.answer} onChange={(e) => setK('faqs', form.k.faqs.map((x) => x.id === f.id ? { ...x, answer: e.target.value } : x))} />
                        </div>
                        <Button size="sm" variant="dangerOutline" aria-label={`Remover pergunta ${i + 1}`} onClick={() => setK('faqs', form.k.faqs.filter((x) => x.id !== f.id))} className="mt-7 !px-2">
                          <Trash2Icon className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  )}
                </ul>
                <div className="mt-2">
                  <Button size="md" variant="secondary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setK('faqs', [...form.k.faqs, { id: fid(), question: '', answer: '' }])}>
                    Adicionar pergunta
                  </Button>
                </div>
              </section>

              <section aria-labelledby="sv-dont">
                <h3 id="sv-dont" className={SECTION_TITLE}>
                  O que a assistente NÃO deve dizer sobre este serviço
                </h3>
                <Textarea containerClassName="mt-2" aria-label="O que a assistente não deve dizer" rows={2} value={form.k.dontSay} onChange={(e) => setK('dontSay', e.target.value)} placeholder="Ex.: não prometer resultado; não falar de desconto." />
                <Alert
                  compact
                  className="mt-3"
                  variant="info"
                  title="Regras gerais ficam em IA Orniplaty › Como atender"
                  actions={
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => {
                      onClose();
                      navigate('/atendente-ia/como-atender?campo=limites');
                    }}>
                    
                      Abrir Como atender
                    </Button>
                  }>
                  
                  O que vale para todos os serviços (ex.: não dar diagnóstico, não negociar desconto) você escreve uma vez só, lá.
                </Alert>
              </section>

              {/* data-guard-ignore: perguntar no teste não é alteração do serviço (não dispara o aviso de não salvo) */}
              <section aria-labelledby="sv-test" data-guard-ignore="" className="rounded-[12px] border border-border bg-surface-muted p-4">
                <h3 id="sv-test" className={`${SECTION_TITLE} inline-flex items-center gap-2`}>
                  <MessageCircleQuestionIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                  Testar como cliente
                </h3>
                <p className={SECTION_HELP}>A resposta usa só o que está preenchido nesta janela e nos outros cadastros.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <Input
                    aria-label="Pergunta do cliente"
                    placeholder="Ex.: Quanto custa? Posso fazer grávida? O que inclui?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setAsked(question);
                      }
                    }} />
                  
                  <Button size="md" onClick={() => setAsked(question)} disabled={!question.trim()} className="sm:mt-1">
                    Perguntar
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['Quanto custa?', 'Quanto tempo dura?', 'O que inclui?', 'Precisa de preparo?', 'Posso fazer grávida?', 'Quem faz?', 'Dá para parcelar?', 'Garante resultado?'].map((q) =>
                  <Pill
                    key={q}
                    size="sm"
                    addable
                    onClick={() => {
                      setQuestion(q);
                      setAsked(q);
                    }}>
                    
                      {q}
                    </Pill>
                  )}
                </div>
                {asked.trim() &&
                // Lote E (E7): como o cliente vê (DS v3.14 MessageThread perspective="client"), sem balão feito à mão.
                <div className="mt-3 max-w-md" aria-live="polite">
                    <WhatsAppPreview
                    messages={[
                    { from: 'client', text: asked, time: NOW },
                    { from: 'ai', text: testAnswer(asked).text, time: NOW }]
                    } />
                  
                    <p className="mt-2 text-sm text-text-secondary">
                      Ela responde com base em: <strong className="font-semibold text-text-primary">{testAnswer(asked).source}</strong>
                    </p>
                  </div>
                }
              </section>
            </div>
          </TabsContent>

          {/* ───────── C) Agenda e retorno (Lote B, 20/10/2026; ajustes B4/B5 de 21/10/2026) ───────── */}
          <TabsContent value="agenda" className="mt-5">
            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-3">
                <ChoiceCards
                  label={RETURN_QUESTION}
                  helperText={
                  <span className="inline-flex items-center gap-1.5">
                      A Orniplaty usa a resposta para chamar o cliente na hora certa.
                      <InfoTip label="Prazo de um cliente" content="Dá para mudar o prazo de um cliente ao fechar o atendimento." />
                    </span>
                  }
                  options={MODEL_PLAIN_ORDER.map((m) => ({ value: m, ...MODEL_PLAIN[m], badge: m === suggested ? 'Sugerido' : undefined }))}
                  value={form.model}
                  onChange={(v) => chooseModel(v as ModelKind)} />
                
                {suggested !== form.model &&
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="text-sm text-text-secondary">
                      Sugerido para este serviço: <span className="font-semibold text-text-primary">{MODEL_PLAIN[suggested].title}</span>.
                    </p>
                    <Button size="sm" variant="neutral" onClick={() => chooseModel(suggested)}>
                      Usar a sugestão
                    </Button>
                  </div>
                }
              </section>

              {needsDue &&
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                  label={form.model === 'serie' ? 'Quantos dias entre uma sessão e outra?' : form.model === 'revisao' ? 'Quantos dias depois o cliente volta para a revisão?' : 'De quantos em quantos dias o cliente volta?'}
                  required
                  inputMode="numeric"
                  suffix="dias"
                  value={form.due}
                  onChange={(e) => set('due', e.target.value.replace(/\D/g, '').slice(0, 3))}
                  error={err('due')}
                  helperText={due >= 60 && due % 30 === 0 ? `De 1 a 365 dias (${durationText(due)}).` : 'De 1 a 365 dias.'} />
                
                  {form.model === 'serie' &&
                <Input label="Quantas sessões?" required inputMode="numeric" value={form.sessions} onChange={(e) => set('sessions', e.target.value.replace(/\D/g, '').slice(0, 2))} error={err('sessions')} helperText="De 2 a 50 sessões." />
                }
                  {form.model === 'serie' &&
                <Input
                  label="Depois da última sessão, volta a cada (opcional)"
                  inputMode="numeric"
                  suffix="dias"
                  value={form.after}
                  onChange={(e) => set('after', e.target.value.replace(/\D/g, '').slice(0, 3))}
                  error={err('after')}
                  helperText="Em branco: a Orniplaty para de chamar depois da última sessão." />

                }
                </div>
              }

              {open && followChanged &&
              <div ref={followNoticeRef}>
                  <FollowUpImpact serviceName={editing!.name} ack={ackFollow} onAck={setAckFollow} onCount={countFollow} className="" />
                </div>
              }

              {/* B5: exemplo vivo, com datas, que muda com os campos. */}
              <Card padding="md" as="section" aria-labelledby="sv-exemplo">
                <p id="sv-exemplo" className="text-sm font-bold text-text-primary">
                  Exemplo
                </p>
                {examplePlan ?
                <>
                    <p className="mb-3 mt-0.5 text-sm text-text-secondary">
                      Se um cliente fizer {exampleName} hoje ({shortDate(TODAY_ISO)}){form.model === 'profissional' ? ' e o profissional escolher 30 dias' : ''}, a Orniplaty:
                    </p>
                    <ReturnPlanTimeline plan={examplePlan} mode={sendMode} voice="exemplo" />
                  </> :

                <p className="mt-0.5 text-sm text-text-secondary">
                    {form.model === 'recorrente' ?
                  'O horário fica marcado toda semana. A Orniplaty só manda mensagem se uma semana ficar vazia.' :
                  form.model === 'sem-retorno' ?
                  `Depois de ${exampleName}, nenhuma mensagem é enviada.` :
                  'Preencha os dias acima para ver o exemplo.'}
                  </p>
                }
              </Card>

              {hasSteps(form.model) &&
              <div className="flex flex-col gap-3">
                  <div>
                    <Button variant="secondary" size="md" aria-expanded={showSteps} aria-controls="sv-mensagens" onClick={() => setShowSteps((v) => !v)}>
                      {showSteps ? 'Fechar o ajuste das mensagens' : 'Ajustar as mensagens'}
                    </Button>
                  </div>
                  {showSteps &&
                <div id="sv-mensagens">
                      <FollowUpEditor
                    wording="simples"
                    title="Quando sai cada mensagem"
                    subtitle={form.model === 'profissional' ? 'A data de volta é a que o profissional escolhe ao fechar o atendimento.' : 'Conta a partir da data de volta do cliente.'}
                    suggestion={form.model === 'manutencao' && due > 0 ? `Sugestão da Orniplaty: a 1ª mensagem ${leadDays(due)} dias antes da data de volta.` : undefined}
                    steps={form.steps}
                    onChange={(steps) => set('steps', steps)}
                    maxSteps={library[form.model].maxSteps}
                    limitText={`No máximo ${library[form.model].maxSteps} ${library[form.model].maxSteps === 1 ? 'mensagem' : 'mensagens'} para este tipo de volta. O número muda em IA Orniplaty › Automações, em “Lembrar o cliente de voltar”.`}
                    onPreviewMessage={(i) => setPreviewStep(i)} />
                  
                    </div>
                }
                </div>
              }

              <p className="text-sm text-text-secondary">A agenda reserva {minutes || '—'} min para este serviço. O intervalo entre atendimentos é de cada profissional, na aba Equipe.</p>
            </div>
          </TabsContent>

          {/* ───────── D) Quem faz ───────── */}
          <TabsContent value="quem-faz" className="mt-5">
            <fieldset>
              <legend className={SECTION_TITLE}>Quem faz este serviço</legend>
              <p className={SECTION_HELP}>A assistente só oferece horários dos profissionais marcados.</p>
              <ul className="mt-3 flex flex-col gap-2">
                {members.
                filter((m) => m.active !== false || form.pros.includes(m.id)).
                map((m) => {
                  const on = form.pros.includes(m.id);
                  const hasWeek = m.week.some((d) => d.working && d.periods.length > 0);
                  return (
                    <li key={m.id}>
                        <label className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3 ${on ? 'border-primary bg-[#F1F5F5]' : 'border-border bg-surface'}`}>
                          <input type="checkbox" className="h-5 w-5 accent-[#0E7490]" checked={on} onChange={(e) => set('pros', e.target.checked ? [...form.pros, m.id] : form.pros.filter((x) => x !== m.id))} />
                          <span className="min-w-0 flex-1">
                            <ProfessionalTag name={m.name} color={m.color} />
                            <span className="mt-0.5 block text-xs text-text-secondary">{m.profile?.role || 'Função não informada'}</span>
                          </span>
                          {!hasWeek && <StatusBadge status="warning" label="Sem jornada" />}
                          {m.active === false && <StatusBadge status="muted" label="Arquivado" />}
                        </label>
                      </li>);

                })}
              </ul>
              {err('pros') && <p className="mt-2 text-sm text-[#B91C1C]">{err('pros')}</p>}
              {changeTab === 'quem-faz' && changeNotice && <div className="mt-3">{changeNotice}</div>}
              {noScheduleMembers.length > 0 &&
              <NoticeInline className="mt-3" tone="warning" title={`${noScheduleMembers.map((m) => m.name).join(' e ')} ainda não ${noScheduleMembers.length === 1 ? 'tem' : 'têm'} jornada`}>
                  Sem jornada, a assistente não oferece horário com {noScheduleMembers.length === 1 ? 'esse profissional' : 'esses profissionais'}. Configure em Equipe › Jornada.
                </NoticeInline>
              }
            </fieldset>
          </TabsContent>
        </Tabs>

        {/* L11: os avisos ficam na aba do campo que os causou (acima). Esta instância só conta os clientes, em qualquer aba. */}
        {open && followChanged && <FollowUpImpact serviceName={editing!.name} ack={ackFollow} onAck={setAckFollow} onCount={countFollow} show={false} />}
      </AppModal>

      <ConfirmDialog
        open={askTemplate}
        title="Trocar a descrição pelo modelo?"
        description="O que está escrito na descrição será substituído pelo modelo. Você ainda pode editar antes de salvar."
        confirmLabel="Usar o modelo"
        cancelLabel="Manter a minha descrição"
        onClose={() => setAskTemplate(false)}
        onConfirm={() => setK('description', fillTemplate(form.kind, form.name, minutes))} />
      

      <ArchiveConfirm
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={`Arquivar ${editing?.name ?? 'serviço'}?`}
        description={
        canDelete ?
        'A assistente deixa de oferecer o serviço e ele sai das listas de agendamento. Você pode reativar depois.' :
        'Este serviço já tem atendimentos no histórico, por isso não pode ser apagado: ele é arquivado. A assistente deixa de oferecer e ele sai das listas de agendamento; o histórico continua igual. Você pode reativar depois.'
        }
        onConfirm={() => {
          if (editing) onArchive(editing.id, false, archiveHits);
          onClose();
        }}>
        
        {(archiveHits.length > 0 || archiveLines.length > 0) &&
        <>
            {/* W2 (A3-02): os nomes de quem já está marcado, antes de confirmar (mesmo aviso do Horário da clínica). */}
            <ConflictNotice
            title={`${archiveHits.length} ${archiveHits.length === 1 ? 'agendamento futuro continua' : 'agendamentos futuros continuam'} na agenda`}
            items={archiveHits.map((c) => ({ key: c.apptId, name: c.clientName, when: `${mediumDayLabel(c.iso)} ${c.start}–${c.end}` }))}
            footnote="Nada será cancelado nem movido: eles continuam na agenda, em “Falta resolver”, até você remarcar com um serviço ativo." />
          
            {archiveLines.length > 0 &&
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm text-text-secondary">
                {archiveLines.map((l) =>
            <li key={l}>{l}</li>
            )}
              </ul>
          }
          </>
        }
      </ArchiveConfirm>

      <AppModal
        open={previewStep !== null}
        onClose={() => setPreviewStep(null)}
        size="sm"
        title={previewStep !== null ? `${previewStep + 1}ª mensagem` : 'Mensagem'}
        description="Exemplo com uma cliente. Nome, serviço e profissional mudam para cada cliente."
        footer={
        <ModalActions>
            <Button variant="secondary" onClick={() => setPreviewStep(null)}>
              Fechar
            </Button>
          </ModalActions>
        }>
        
        {previewStep !== null && form.steps[previewStep] &&
        <WhatsAppPreview
          messages={[
          {
            from: 'team',
            time: NOW,
            text: messageText(
              { clientName: 'Ana Ribeiro', service: form.name.trim() || 'serviço', professionalId: form.pros[0] ?? '', motive: 'retorno', deadline: '', modelKind: form.model },
              { n: previewStep + 1, plannedIso: '', status: 'programada', when: form.steps[previewStep].when }
            )
          }]
          } />

        }
      </AppModal>
    </>);

}