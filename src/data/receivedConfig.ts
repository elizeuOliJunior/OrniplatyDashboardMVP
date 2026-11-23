/**
 * G4 (F-071): a configuração RECEBIDA do Onboarding passa a valer nas telas do Painel (só nesta sessão do navegador).
 *
 * G4 · fechamento (27/10/2026): tudo o que a prontidão e o resumo do primeiro acesso mostram vem do que CHEGOU, sem cair
 * nos dados de exemplo quando um campo veio vazio. O que é aplicado (uma vez por passagem, `applyReceivedConfig`):
 * - Empresa: nome, sobre, segmento/especialidade, endereço, link do Maps, formas de pagamento, convênio (sim/não) e
 *   política de cancelamento (vazio continua vazio: a prontidão aponta o que falta). Campos que o Onboarding não pergunta
 *   (regras de parcelamento/desconto/sinal, política de falta, links, público) voltam ao vazio SÓ se ainda eram os de exemplo.
 * - Como atender: nome da assistente, tom, apresentação, o que pode e não pode fazer e quando chamar uma pessoa
 *   (as pílulas do Onboarding viram as opções do Painel; texto que não tem par vai para "Outras").
 * - Conhecimento: as perguntas recebidas substituem as perguntas de exemplo; documentos recebidos aparecem como
 *   "Escolhido no onboarding" (o arquivo não atravessa a passagem). Perguntas e documentos criados no Painel ficam.
 * - Configurações › Conta: WhatsApp para avisos (`alertPhone`; inválido ou vazio = vazio).
 * - Funcionamento: horário da semana (vários períodos) e datas especiais da clínica.
 * - Equipe e Serviços: cada item recebido casa pelo NOME (atualiza; sem par, entra novo). Preço, duração, telefone e
 *   área vêm do recebido. Só EXEMPLOS SUBSTITUÍVEIS (`data/exampleRecords.ts`) que não vieram são ARQUIVADOS (nunca
 *   apagados); serviços e profissionais configurados no Painel ficam como estão, com histórico e financeiro.
 * - Clientes importados: cada linha conferida no Onboarding vira um cliente (telefone já no cadastro não duplica).
 * - WhatsApp e assistente: conectado na etapa 11 = autorização nova; não conectado = "nunca conectado"; ligada ou desligada como lá.
 *
 * W6 (11/11/2026):
 * - A6-01: AUTOMAÇÕES. O liga/desliga escolhido na etapa 9 vale em IA Orniplaty › Automações: o que veio desligado fica
 *   desligado; o que o Onboarding não pergunta (hoje "Chamar quem faltou") fica desligado (decisão 1-a do Christian). As
 *   ligadas com mensagem "Não enviada" vão sozinhas para aprovação (G17).
 * - A6-03: PLANO. `tier_2` vira "Plano 2" no menu e em Configurações (catálogo comercial em aberto, G25).
 * - A6-06: "Sobre" vazio vindo do Onboarding substitui o texto de exemplo (já era assim quando o campo vem; a cópia do
 *   cenário em data/firstAccessSample.ts passou a mandar o campo, como o Onboarding manda).
 *
 * Recarregar a página volta tudo para os exemplos: não há persistência no protótipo (no produto real, o Onboarding
 * grava no backend e o Painel lê de lá).
 */
import { blankPaymentDetails, empresaStore } from './empresa';
import type { EmpresaConfig } from './empresa';
import { migrateSegment } from './segment';
import { getTeam, saveMember, setClinicBlocks, setClinicHours, setMembers } from './availability';
import { blankProfile } from './equipeFuncionamento';
import type { TeamMember } from './equipeFuncionamento';
import { normalizeSchedule, weekFromClinicHours } from './schedule';
import type { ClinicException, ClinicHoursDay } from './schedule';
import { blankKnowledge, getServices, newServiceId, saveService, setCategories, setServiceActive } from './servicesStore';
import type { ServiceItem } from './servicesStore';
import { blankServicePayment } from './paymentRules';
import { newFollowUp, returnDaysOf } from './followUpModels';
import { allClientsWithPhones, createClient } from './api/clientes';
import { setAccountPhone } from './accountStore';
import { atendimentoStore } from './comoAtender';
import { conhecimentoStore, knowledgeDocuments, knowledgeEntries } from './conhecimento';
import type { KnowledgeDocument, KnowledgeEntry } from './conhecimento';
import { isReplaceableExample, markConfigured } from './exampleRecords';
import { connectOrRenew, setPlanFromOnboarding, setWaScenario, submitForApproval, turnAssistantOff, turnAssistantOn } from './settingsStore';
import { applyOnboardingAutomations } from './automacoes';

export type ReceivedPro = {id?: string;name: string;color: string;phone?: string;specialty?: string;schedule?: unknown;};
export type ReceivedService = {id?: string;name: string;category?: string;duration?: string;price: string;returnDays: string;professionals?: string[];};
export type ReceivedClient = {name: string;phone: string;email?: string;};

export type ApplyResult = {
  services: {updated: number;created: number;archived: string[];kept: string[];};
  team: {updated: number;created: number;archived: string[];kept: string[];};
  clients: {created: number;skipped: number;};
  questions: {received: number;answered: number;};
  documents: number;
  hours: boolean;
  /** W6 (A6-01): ids das automações ligadas depois da passagem; `null` = payload sem automações (nada mudou). */
  automationsOn: string[] | null;
};

export type ReceivedPayload = {
  clinic: {name: string;segment: string;specialty?: string;about?: string;street?: string;number?: string;complement?: string;district?: string;city?: string;uf?: string;zip?: string;mapsUrl?: string;};
  profile: {name?: string;tone?: string;greeting?: string;canDo?: string;cannotDo?: string;handoff?: string;payments?: string[];acceptsInsurance?: '' | 'sim' | 'nao';cancellation?: string;};
  hours: ClinicHoursDay[];
  clinicExceptions?: ClinicException[];
  team: ReceivedPro[];
  services: ReceivedService[];
  faqs?: {id?: string;question?: string;answer: string;}[];
  documents?: unknown[];
  importedClients?: ReceivedClient[];
  alertPhone?: string;
  /** Estado do WhatsApp e da assistente na etapa 11 do Onboarding. */
  whatsapp?: string;
  aiOn?: boolean;
  /** W6 (A6-01): liga/desliga da etapa 9 (ids iguais aos de IA Orniplaty › Automações). */
  automations?: Record<string, boolean>;
  /** W6 (A6-03): plano contratado (`tier_1`..`tier_3`). */
  plan?: string;
};

const key = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const digits = (s: string) => s.replace(/\D/g, '');
/** "19970001111" → "(19) 97000-1111" (mesmo formato dos clientes do cadastro). */
const phoneText = (s: string) => {
  const d = digits(s);
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : s;
};
const PAYMENT_KEYS: Record<string, string> = { pix: 'pix', 'cartao de credito': 'credito', credito: 'credito', 'cartao de debito': 'debito', debito: 'debito', dinheiro: 'dinheiro' };
/** Pílulas do Onboarding (etapa 5) → opções do Painel (Como atender). */
const CAN_DO: Record<string, string> = { 'consultar horarios cadastrados': 'horarios', 'informar servicos e precos confirmados': 'precos', 'preparar agendamento para confirmacao': 'agendar', 'encaminhar duvidas a equipe': 'encaminhar' };
const CANNOT_DO: Record<string, string> = { 'nao dar diagnostico': 'diagnostico', 'nao prometer resultado': 'resultado', 'nao inventar preco ou disponibilidade': 'inventar', 'nao conceder desconto sem autorizacao': 'desconto' };
const HANDOFF: Record<string, string> = { 'cliente pede uma pessoa': 'pede-pessoa', 'reclamacao ou situacao sensivel': 'reclamacao', 'falta informacao confiavel': 'sem-resposta' };

const priceOf = (v: string) => {
  const t = (v ?? '').trim();
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
/** "a; b; c" → opções conhecidas + o que sobrou (texto livre). */
function mapRules(text: string, table: Record<string, string>) {
  const ids: string[] = [];
  const extra: string[] = [];
  text.
  split(';').
  map((t) => t.trim()).
  filter(Boolean).
  forEach((t) => {
    const id = table[key(t)];
    if (id) ids.push(id);else
    extra.push(t);
  });
  return { ids: [...new Set(ids)], extra: extra.join('; ') };
}

// Valores de EXEMPLO (no carregamento): só eles são trocados quando o Onboarding não manda o campo.
const EMPRESA_SAMPLE = JSON.stringify(empresaStore.get());
const sampleField = (e: EmpresaConfig, k: keyof EmpresaConfig) => JSON.stringify(e[k]) === JSON.stringify((JSON.parse(EMPRESA_SAMPLE) as EmpresaConfig)[k]);
const SAMPLE_QUESTIONS = new Map(knowledgeEntries.map((x) => [x.id, JSON.stringify(x)]));
const SAMPLE_DOCS = new Map(knowledgeDocuments.map((x) => [x.id, JSON.stringify(x)]));
const isSampleQuestion = (x: KnowledgeEntry) => SAMPLE_QUESTIONS.get(x.id) === JSON.stringify(x);
const isSampleDoc = (x: KnowledgeDocument) => SAMPLE_DOCS.get(x.id) === JSON.stringify(x);
const docType = (name: string): KnowledgeDocument['type'] => /\.docx$/i.test(name) ? 'docx' : /\.txt$/i.test(name) ? 'txt' : 'pdf';

let lastApplied = '';
let lastResult: ApplyResult | null = null;
/** O resultado da última aplicação (o resumo do primeiro acesso mostra o que entrou, o que foi arquivado e o que ficou). */
export const lastApplyResult = () => lastResult;

export function applyReceivedConfig(token: string, p: ReceivedPayload): ApplyResult {
  if (token && token === lastApplied && lastResult) return lastResult;
  lastApplied = token;

  // Empresa: o que veio vale, inclusive vazio (versão antiga do Onboarding sem o campo = mantém o atual).
  const e = empresaStore.get();
  const m = migrateSegment(p.clinic.segment, p.clinic.specialty);
  const payments = (p.profile.payments ?? []).map((x) => PAYMENT_KEYS[key(x)]).filter((x): x is string => !!x);
  const c = p.clinic;
  const ins = p.profile.acceptsInsurance;
  empresaStore.set({
    ...e,
    name: c.name.trim(),
    segment: m.segment,
    specialty: m.specialty,
    description: c.about !== undefined ? c.about.trim() : e.description,
    cep: c.zip ?? e.cep,
    street: c.street ?? e.street,
    number: c.number ?? e.number,
    complement: c.complement ?? e.complement,
    district: c.district ?? e.district,
    city: c.city ?? e.city,
    uf: c.uf ?? e.uf,
    mapsLink: c.mapsUrl ?? e.mapsLink,
    payments: p.profile.payments !== undefined ? [...new Set(payments)] : e.payments,
    acceptsInsurance: ins === 'sim' ? 'sim' : ins === 'nao' ? 'nao' : sampleField(e, 'acceptsInsurance') ? 'nao' : e.acceptsInsurance,
    cancellationPolicy: p.profile.cancellation !== undefined ? p.profile.cancellation.trim() : e.cancellationPolicy,
    // Não perguntados no Onboarding: saem só se ainda eram os de exemplo.
    payment: sampleField(e, 'payment') ? blankPaymentDetails() : e.payment,
    noShowPolicy: sampleField(e, 'noShowPolicy') ? '' : e.noShowPolicy,
    links: sampleField(e, 'links') ? { instagram: '', facebook: '', site: '', custom: [] } : e.links,
    audience: sampleField(e, 'audience') ? '' : e.audience
  });

  // Como atender (etapa 5 do Onboarding).
  const a = atendimentoStore.get();
  const pr = p.profile;
  const can = pr.canDo !== undefined ? mapRules(pr.canDo, CAN_DO) : null;
  const cannot = pr.cannotDo !== undefined ? mapRules(pr.cannotDo, CANNOT_DO) : null;
  const hand = pr.handoff !== undefined ? mapRules(pr.handoff, HANDOFF) : null;
  atendimentoStore.set({
    ...a,
    name: pr.name !== undefined ? pr.name.trim() : a.name,
    tone: pr.tone || a.tone,
    greeting: pr.greeting?.trim() ? pr.greeting.trim() : a.greeting,
    greetingEdited: pr.greeting !== undefined ? Boolean(pr.greeting.trim()) : a.greetingEdited,
    ...(can ? { canDo: can.ids, canExtra: can.extra } : {}),
    ...(cannot ? { cannotDo: cannot.ids, cannotExtra: cannot.extra } : {}),
    ...(hand ? { handoff: hand.ids, handoffOther: hand.extra } : {})
  });

  // Conhecimento (etapa 6): perguntas recebidas no lugar das de exemplo; o que foi criado no Painel fica.
  const k = conhecimentoStore.get();
  const tag = (token || 'x').slice(0, 8);
  const receivedQ: KnowledgeEntry[] = (p.faqs ?? []).filter((f) => (f.question ?? '').trim()).map((f, i) => ({ id: `faq-rec-${tag}-${i}`, question: (f.question ?? '').trim(), answer: f.answer.trim() }));
  const receivedDocs: KnowledgeDocument[] = ((p.documents ?? []) as {name?: string;size?: string;}[]).
  filter((d) => d && typeof d.name === 'string' && d.name.trim()).
  map((d, i) => ({ id: `doc-rec-${tag}-${i}`, name: d.name!.trim(), size: d.size ?? '', type: docType(d.name!), status: 'recebido' }));
  if (p.faqs !== undefined || p.documents !== undefined)
  conhecimentoStore.set({
    ...k,
    items: p.faqs !== undefined ? [...k.items.filter((x) => !isSampleQuestion(x) && !receivedQ.some((r) => key(r.question) === key(x.question))), ...receivedQ] : k.items,
    docs: p.documents !== undefined ? [...k.docs.filter((x) => !isSampleDoc(x) && !receivedDocs.some((r) => r.name === x.name)), ...receivedDocs] : k.docs
  });

  // WhatsApp para avisos internos (pedido uma vez no Onboarding, etapa 5): no painel mora em Configurações › Conta.
  if (p.alertPhone !== undefined) setAccountPhone([10, 11].includes(digits(p.alertPhone).length) ? p.alertPhone : '');

  // WhatsApp e assistente (etapa 11): o painel mostra o mesmo estado que o Onboarding deixou (conectado ou não; ligada ou não).
  if (p.whatsapp !== undefined) {
    if (p.whatsapp === 'connected') connectOrRenew();else
    setWaScenario('nunca');
  }
  if (p.aiOn !== undefined) {
    if (p.aiOn) turnAssistantOn();else
    turnAssistantOff('respostas');
  }

  // W6 (A6-01, G17): automações da etapa 9. As ligadas com mensagem "Não enviada" vão sozinhas para aprovação.
  let automationsOn: string[] | null = null;
  if (p.automations !== undefined) {
    automationsOn = applyOnboardingAutomations(p.automations);
    submitForApproval(automationsOn);
  }
  // W6 (A6-03): plano contratado.
  if (p.plan !== undefined) setPlanFromOnboarding(p.plan);

  // Funcionamento
  const hours = p.hours.length === 7 ? p.hours.map((h) => ({ ...h })) : null;
  if (hours) setClinicHours(hours);
  setClinicBlocks((p.clinicExceptions ?? []).map((x) => ({ ...x })));
  const clinicHours = hours ?? getTeam().hours;

  // Equipe: casa pelo nome; novos entram; só exemplos substituíveis que não vieram são arquivados.
  const current = getTeam().members;
  const proIdOf: Record<string, string> = {};
  let proUpdated = 0;
  let proCreated = 0;
  const seen = new Set<string>();
  p.team.forEach((r, i) => {
    const match = current.find((x) => key(x.name) === key(r.name));
    const sched = normalizeSchedule(r.schedule, weekFromClinicHours(clinicHours));
    const profile = {
      ...blankProfile(),
      ...(match?.profile ?? {}),
      phone: r.phone !== undefined ? digits(r.phone) : match?.profile?.phone || '',
      role: r.specialty !== undefined ? r.specialty.trim() : match?.profile?.role || ''
    };
    const member: TeamMember = match ?
    { ...match, ...sched, color: r.color || match.color, profile, active: true } :
    { id: `pro-rec-${Date.now().toString(36)}-${i}`, name: r.name.trim(), color: r.color || '#0E7490', services: [], ...sched, profile, active: true };
    saveMember(member);
    markConfigured('profissional', member.id);
    seen.add(member.id);
    if (r.id) proIdOf[r.id] = member.id;
    if (match) proUpdated += 1;else
    proCreated += 1;
  });
  const absentPros = current.filter((x) => !seen.has(x.id) && x.active !== false);
  const proArchived = absentPros.filter((x) => isReplaceableExample('profissional', x.id));
  const proKept = absentPros.filter((x) => !isReplaceableExample('profissional', x.id)).map((x) => x.name);
  if (proArchived.length) {
    const ids = new Set(proArchived.map((x) => x.id));
    setMembers((list) => list.map((x) => ids.has(x.id) ? { ...x, active: false } : x));
  }

  // Serviços
  const st = getServices();
  const cats = [...st.categories];
  const catId = (name?: string) => {
    const n = (name ?? '').trim();
    if (!n) return cats[0]?.id ?? '';
    const found = cats.find((x) => key(x.name) === key(n));
    if (found) return found.id;
    const id = `cat-rec-${cats.length}-${Date.now().toString(36)}`;
    cats.push({ id, name: n });
    return id;
  };
  const activePros = [...seen];
  let svcUpdated = 0;
  let svcCreated = 0;
  const svcSeen = new Set<string>();
  p.services.forEach((r) => {
    const match = st.services.find((x) => key(x.name) === key(r.name));
    // Casou com um exemplo substituível: pagamento e explicações de exemplo não passam para o serviço recebido.
    const fromExample = match ? isReplaceableExample('servico', match.id) : false;
    const due = Number(r.returnDays);
    const followUp = due > 0 ? { ...newFollowUp('manutencao'), dueDays: due } : newFollowUp('sem-retorno');
    const pros = (r.professionals ?? []).map((id) => proIdOf[id]).filter(Boolean);
    const price = priceOf(r.price);
    const base: ServiceItem = match ?? {
      id: newServiceId() + svcCreated,
      name: r.name.trim(),
      categoryId: '',
      kind: 'procedimento',
      modality: 'presencial',
      durationMin: 30,
      priceMode: 'fixo',
      price: 0,
      returnDays: null,
      followUp,
      professionalIds: [],
      active: true,
      knowledge: blankKnowledge(),
      payment: blankServicePayment()
    };
    const next: ServiceItem = {
      ...base,
      name: r.name.trim(),
      categoryId: catId(r.category),
      durationMin: Number(r.duration) > 0 ? Number(r.duration) : base.durationMin,
      // O preço é o recebido: sem preço, fica sem preço (a prontidão mostra), nunca o do exemplo.
      price,
      priceMode: price && base.priceMode === 'a-partir' && !fromExample ? 'a-partir' : 'fixo',
      followUp,
      returnDays: returnDaysOf(followUp),
      // Onboarding sem "quem faz" = todos os profissionais recebidos fazem.
      professionalIds: pros.length ? pros : activePros,
      active: true,
      ...(fromExample ? { knowledge: blankKnowledge(), payment: blankServicePayment() } : {})
    };
    saveService(next);
    markConfigured('servico', next.id);
    svcSeen.add(next.id);
    if (match) svcUpdated += 1;else
    svcCreated += 1;
  });
  setCategories(cats);
  const absentSvc = getServices().services.filter((x) => !svcSeen.has(x.id) && x.active);
  const svcArchived = absentSvc.filter((x) => isReplaceableExample('servico', x.id));
  const svcKept = absentSvc.filter((x) => !isReplaceableExample('servico', x.id)).map((x) => x.name);
  for (const s of svcArchived) setServiceActive(s.id, false);

  // Clientes importados
  const phones = new Set(allClientsWithPhones().map((x) => digits(x.phone)));
  let created = 0;
  let skipped = 0;
  for (const r of p.importedClients ?? []) {
    const d = digits(r.phone);
    if (!r.name.trim() || ![10, 11].includes(d.length) || phones.has(d)) {
      skipped += 1;
      continue;
    }
    phones.add(d);
    createClient({ name: r.name.trim(), phone: phoneText(r.phone), ...(r.email ? { email: r.email } : {}) });
    created += 1;
  }

  lastResult = {
    services: { updated: svcUpdated, created: svcCreated, archived: svcArchived.map((x) => x.name), kept: svcKept },
    team: { updated: proUpdated, created: proCreated, archived: proArchived.map((x) => x.name), kept: proKept },
    clients: { created, skipped },
    questions: { received: receivedQ.length, answered: receivedQ.filter((q) => q.answer).length },
    documents: receivedDocs.length,
    hours: !!hours,
    automationsOn
  };
  return lastResult;
}