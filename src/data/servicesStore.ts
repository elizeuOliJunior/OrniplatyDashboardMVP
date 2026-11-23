/**
 * Catálogo VIVO de serviços e categorias (Serviços e equipe › Serviços). Protótipo: só memória, nada persiste.
 *
 * Fonte única: ao salvar, atualiza também `data/catalogo.ts` (formulários de agenda, lista de espera, fechamento,
 * pacotes, assistente). Ver `syncAll`. G1 (23/10/2026): a semente do exemplo mora em `data/servicesSeed.ts` e o prazo de
 * retorno é lido só de `followUp` (data/returns.ts usa `returnDaysOf`); `servicosEquipe.ts` não tem mais lista de serviços.
 *
 * Backend lido (origin/main API 3186399, app/modules/booking/models.py:77-137): name, description (Text; 1000 na
 * criação), duration_minutes 5–480, price_cents, recurrence_days 1–365, category (texto livre, 100), is_active,
 * N:N com profissional. A IA lê só "nome: R$ preço (duração) — descrição" (prompts.py:549-558).
 * Tudo marcado `CONTRATO NOVO` abaixo NÃO existe no backend: é proposta de contrato para o Elizeu.
 */
import { useSyncExternalStore } from 'react';
import { recordFormerServiceName, syncCatalogServices } from './catalogo';
import { setMembers } from './availability';
import type { ServiceFollowUp } from './followUpModels';
import { blankServicePayment } from './paymentRules';
import type { ServicePayment } from './paymentRules';
import { catalogEntryOf, emptyKnowledge, seedCategories, seedServices } from './servicesSeed';
import { markExamples } from './exampleRecords';
import { dayWords } from './turmaWords';
import type { DayWords, TurmaWordId } from './turmaWords';

/* ───────────── tipos ───────────── */

/** CONTRATO NOVO: tipo de atendimento (ajuda a IA a entender "consulta", "avaliação", "sessão"). */
export type ServiceKind = 'avaliacao' | 'consulta' | 'procedimento' | 'sessao' | 'retorno' | 'turma';
/** CONTRATO NOVO: modalidade. */
export type ServiceModality = 'presencial' | 'online';
/** 'fixo' existe (price_cents). CONTRATO NOVO: 'a-partir' e 'sob-consulta'. */
export type PriceMode = 'fixo' | 'a-partir' | 'sob-consulta';

/**
 * CONTRATO NOVO (aulas em grupo, 23/11/2026): atendimento em grupo. Mais de um cliente no mesmo horário (aula, turma).
 * `capacity` = vagas por horário (2 a 50). Ausente ou null = atendimento individual (todos os serviços que já existiam).
 * Turmas e inscrições: data/turmas.ts.
 * G5 (23/11/2026; CONTRATO NOVO): o serviço é em grupo SE E SÓ SE o tipo é "Turma" (`kind: 'turma'`); `group` só existe aí.
 * `word` = como o serviço chama cada dia da turma (lista fechada em data/turmaWords.ts; padrão Encontro).
 */
export type ServiceGroup = {capacity: number;word: TurmaWordId;};

export type ServiceFaq = {id: string;question: string;answer: string;};

/** O que a assistente sabe do serviço. Só `description` existe no backend; o resto é CONTRATO NOVO. */
export type ServiceKnowledge = {
  /** existe: description (máx. 1000) */
  description: string;
  /** CONTRATO NOVO */
  synonyms: string[];
  included: string;
  prepBefore: string;
  careAfter: string;
  contraindications: string;
  requiresEvaluation: boolean;
  evaluationServiceId: string | null;
  /** CONTRATO NOVO: hoje a base de conhecimento (knowledge_base) não tem service_id */
  faqs: ServiceFaq[];
  dontSay: string;
};

export type ServiceItem = {
  id: string;
  name: string;
  /** existe: category (texto livre). Aqui guardamos o id da categoria da clínica. */
  categoryId: string;
  kind: ServiceKind;
  modality: ServiceModality;
  durationMin: number;
  priceMode: PriceMode;
  /** em reais; 0 = não informado (permitido só em "sob consulta") */
  price: number;
  /** existe: recurrence_days (hoje não é lido por nenhuma parte do backend). Derivado de `followUp` (returnDaysOf). */
  returnDays: number | null;
  /** CONTRATO NOVO (Lote B, 20/10/2026): modelo de acompanhamento do serviço e os passos (data/followUpModels.ts). */
  followUp: ServiceFollowUp;
  professionalIds: string[];
  /** existe: is_active */
  active: boolean;
  knowledge: ServiceKnowledge;
  /**
   * CONTRATO NOVO (Lote F, 22/10/2026): o que este serviço tem de DIFERENTE do padrão de pagamento da empresa
   * (parcelamento, desconto à vista, sinal, convênio). 'padrao' = segue IA Orniplaty › Empresa. Regra que vale de fato:
   * `effectivePayment` (data/paymentRules.ts). Serviço novo nasce com tudo em 'padrao'.
   */
  payment: ServicePayment;
  /** CONTRATO NOVO (aulas em grupo, 23/11/2026): null ou ausente = individual. */
  group?: ServiceGroup | null;
};

/** CONTRATO NOVO: ordem das categorias (o backend guarda só o texto). */
export type Category = {id: string;name: string;};

/* ───────────── rótulos ───────────── */

export const KIND_OPTIONS: {value: ServiceKind;label: string;hint: string;}[] = [
{ value: 'avaliacao', label: 'Avaliação', hint: 'Primeira conversa para indicar o tratamento.' },
{ value: 'consulta', label: 'Consulta', hint: 'Atendimento com o profissional, com ou sem procedimento.' },
{ value: 'procedimento', label: 'Procedimento', hint: 'Execução do serviço em si, numa única vez.' },
{ value: 'sessao', label: 'Sessão', hint: 'Faz parte de uma série (ex.: drenagem, terapia).' },
{ value: 'retorno', label: 'Retorno', hint: 'Acompanhamento depois de um atendimento.' },
// CONTRATO NOVO (aulas em grupo, G5, 23/11/2026): o tipo "Turma" é o único controle que torna o serviço em grupo.
{ value: 'turma', label: 'Turma', hint: 'Mais de um cliente no mesmo horário: aula, treino, oficina, reunião ou encontro em grupo.' }];

export const kindLabel = (k: ServiceKind) => KIND_OPTIONS.find((o) => o.value === k)?.label ?? '';

/** CONTRATO NOVO (aulas em grupo, 23/11/2026): o serviço é em grupo? */
export const isGroupService = (s: Pick<ServiceItem, 'group'>) => !!s.group && s.group.capacity > 0;
/** "4 vagas" (linha de baixo do nome na lista de serviços: "Turma · Presencial · 4 vagas"). */
export const groupLabel = (s: Pick<ServiceItem, 'group'>) => isGroupService(s) ? `${s.group!.capacity} vagas` : '';
/** G5 (CONTRATO NOVO, aulas em grupo): as formas da palavra de cada dia da turma deste serviço ("esta aula" / "este treino"). */
export const dayWordsOf = (s?: Pick<ServiceItem, 'group'> | null): DayWords => dayWords(s?.group?.word);
/** G5: o mesmo, pelo id do serviço. */
export const dayWordsOfService = (serviceId: string): DayWords => dayWordsOf(getServices().services.find((x) => x.id === serviceId));
/** Há pelo menos um serviço em grupo ATIVO? (aba Turmas e "Reposição" só existem assim) */
export const hasActiveGroupService = (list: ServiceItem[]) => list.some((s) => s.active && isGroupService(s));

export const MODALITY_OPTIONS: {value: ServiceModality;label: string;}[] = [
{ value: 'presencial', label: 'Presencial' },
{ value: 'online', label: 'Online' }];


/** W2 (A3-17): o exemplo do preço fala do serviço que está aberto (sem artigo, para servir a qualquer nome). */
export function priceModeExample(mode: PriceMode, name: string, price: number) {
  const n = name.trim() || 'Este serviço';
  const v = brlValue(price > 0 ? price : 180);
  if (mode === 'fixo') return `A assistente informa o valor exato: “${n} custa ${v}.”`;
  if (mode === 'a-partir') return `A assistente diz o valor mínimo e explica que o final é definido no atendimento: “${n} começa em ${v}; o valor final é confirmado no atendimento.”`;
  return 'A assistente não fala valor e oferece agendar uma avaliação ou chamar a equipe.';
}
const brlValue = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const PRICE_MODE_OPTIONS: {value: PriceMode;label: string;says: string;}[] = [
{ value: 'fixo', label: 'Preço fixo', says: 'A assistente informa o valor exato: “A limpeza de pele custa R$ 180,00.”' },
{ value: 'a-partir', label: 'A partir de', says: 'A assistente diz o valor mínimo e explica que o final é definido no atendimento: “A partir de R$ 180,00; o valor final é confirmado no atendimento.”' },
{ value: 'sob-consulta', label: 'Sob consulta', says: 'A assistente não fala valor e oferece agendar uma avaliação ou chamar a equipe.' }];


export const DESCRIPTION_MAX = 1000;

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function priceLabel(s: Pick<ServiceItem, 'priceMode' | 'price'>) {
  if (s.priceMode === 'sob-consulta') return 'Sob consulta';
  if (s.priceMode === 'a-partir') return `A partir de ${brl(s.price)}`;
  return brl(s.price);
}

/* ───────────── modelos de descrição ("Usar modelo") ───────────── */

export { GOOD_EXAMPLE } from './servicesSeed';
export const BAD_EXAMPLE = 'Higienização profunda e extração.';

/** Rascunho editável por tipo. `{nome}` e `{duracao}` são trocados pelo que está no formulário. */
export const DESCRIPTION_TEMPLATES: Record<ServiceKind, string> = {
  avaliacao:
  '{nome} de cerca de {duracao} min: conversa sobre o que o cliente quer melhorar, análise e indicação do tratamento mais adequado, com valores. [Diga se a avaliação é cobrada ou abatida no tratamento.] Não inclui procedimento no mesmo dia, a menos que a profissional indique.',
  consulta:
  '{nome} de cerca de {duracao} min: [o que acontece na consulta]. Indicada para [para quem é]. [O que o cliente deve trazer, ex.: exames ou lista de medicamentos.] [Se a consulta pode virar procedimento no mesmo dia, diga aqui.]',
  procedimento:
  '{nome} de cerca de {duracao} min: [etapas do procedimento, na ordem]. Indicado para [para quem é]. Não é indicado [quando não fazer] — nesses casos é preciso avaliar antes. Depois do procedimento [o que é normal sentir e por quanto tempo].',
  sessao:
  'Sessão de {nome} de cerca de {duracao} min: [o que acontece na sessão]. Costuma ser feita em [número] sessões, com intervalo de [dias] entre elas. [Resultado esperado, sem prometer.]',
  retorno:
  'Retorno de {nome} de cerca de {duracao} min: quem atende confere o resultado do atendimento anterior e ajusta o que for preciso. [Diga se o retorno é cobrado e até quantos dias depois ele vale.]',
  // CONTRATO NOVO (aulas em grupo, G5, 23/11/2026)
  turma:
  '{nome} em turma de cerca de {duracao} min: [o que acontece em cada encontro]. Indicado para [para quem é]. [Quantas pessoas por turma, o que vestir e o que trazer.]'
};

export function fillTemplate(kind: ServiceKind, name: string, durationMin: number) {
  return DESCRIPTION_TEMPLATES[kind].replace('{nome}', name.trim() || 'Atendimento').replace('{duracao}', String(durationMin || 60));
}

/* ───────────── sugestões de categoria por segmento ───────────── */

/** Compatibilidade. G4 (F-062): a tela de categorias usa as áreas do segmento salvo (`segmentContent().categories`). */
export const CATEGORY_SUGGESTIONS: {segment: string;names: string[];}[] = [
{ segment: 'Estética', names: ['Avaliação', 'Facial', 'Corporal', 'Injetáveis', 'Tecnologias/Laser', 'Capilar'] },
{ segment: 'Saúde mental', names: ['Avaliação', 'Psicoterapia', 'Psiquiatria', 'Grupos'] },
{ segment: 'Odontologia', names: ['Avaliação', 'Prevenção', 'Estética dental', 'Ortodontia', 'Cirurgia'] }];

export const OTHER_CATEGORY = 'Outros';

/* ───────────── status do conhecimento ───────────── */

export type KnowledgeStatus = {
  /** Compatibilidade: 1 item conta para "Completo" (a descrição). */
  filled: number;
  total: number;
  /** O que impede "Completo" (só a descrição, D-A3-3). */
  missing: string[];
  complete: boolean;
  /** A descrição ainda tem trechos entre colchetes do modelo (A3-06). */
  brackets: boolean;
  /** Itens opcionais em branco: aparecem como "pode melhorar" e não impedem "Completo". */
  improve: string[];
};

/** Trecho de modelo ainda não trocado, ex.: "[para quem é]". */
export const hasBrackets = (t: string) => /\[[^\]]*\]/.test(t);
export const DESCRIPTION_MIN = 80;

/**
 * W2 (11/11/2026, D-A3-3 decidida pelo arquiteto, sem objeção do Christian): "Completo" exige SÓ a descrição para o
 * cliente, com pelo menos 80 caracteres e sem nada entre colchetes (A3-06: um rascunho do "Usar modelo" não conta).
 * O resto vira "pode melhorar". "Exige avaliação" não entra em nenhuma das duas listas: ligado ou desligado é uma
 * resposta (A3-05); ligado sem serviço de Avaliação ativo tem aviso próprio na aba (`evaluationMissing`).
 */
export function knowledgeStatus(s: ServiceItem): KnowledgeStatus {
  const k = s.knowledge;
  const desc = k.description.trim();
  const brackets = hasBrackets(desc);
  const descOk = desc.length >= DESCRIPTION_MIN && !brackets;
  const optional: [string, boolean][] = [
  ['Como o cliente chama', k.synonyms.length > 0],
  ['O que está incluído', !!k.included.trim()],
  ['Preparo antes', !!k.prepBefore.trim()],
  ['Cuidados depois', !!k.careAfter.trim()],
  ['Quando não é indicado', !!k.contraindications.trim()],
  ['Perguntas frequentes', k.faqs.some((f) => f.question.trim() && f.answer.trim())],
  ['O que não dizer', !!k.dontSay.trim()]];

  return {
    filled: descOk ? 1 : 0,
    total: 1,
    missing: descOk ? [] : ['Descrição para o cliente'],
    complete: descOk,
    brackets,
    improve: optional.filter(([, ok]) => !ok).map(([label]) => label)
  };
}

/** Texto curto do selo (lista de serviços e aba do serviço). */
export const knowledgeBadgeLabel = (st: KnowledgeStatus) => st.complete ? 'Completo' : 'Falta a descrição';

/** "Exige avaliação antes" ligado sem nenhum serviço do tipo Avaliação ativo para escolher. */
export const evaluationMissing = (s: ServiceItem, all: ServiceItem[] = state.services) =>
s.knowledge.requiresEvaluation && !all.some((x) => x.kind === 'avaliacao' && x.active && x.id !== s.id);

/* ───────────── "Testar como paciente" (simulação local) ───────────── */

const norm = (t: string) =>
t.
toLowerCase().
normalize('NFD').
replace(/[̀-ͯ]/g, '').
replace(/[^a-z0-9 ]/g, ' ');
/** Palavras que aparecem em quase toda pergunta e não identificam o assunto (ex.: "quanto" em "quanto custa" × "de quanto em quanto tempo"). */
const STOPWORDS = new Set(['quanto', 'quanta', 'quantos', 'quantas', 'como', 'que', 'qual', 'quais', 'para', 'por', 'com', 'sem', 'uma', 'umas', 'uns', 'devo', 'posso', 'pode', 'fazer', 'faz', 'tem', 'tenho', 'voces', 'voce', 'sua', 'seu', 'meu', 'minha', 'esse', 'essa', 'isso', 'esta', 'este', 'mais', 'muito', 'depois', 'antes', 'quando', 'onde', 'ser', 'sao']);
/** Palavras distintas e relevantes de um texto (sem repetição, sem palavras genéricas). */
const words = (t: string) => [...new Set(norm(t).split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)))];

/**
 * SUBSTITUÍDA no G1 (subetapa 4, F-011) por `answerQuestion` em data/assistantAnswer.ts (intenção + fonte declarada).
 * Mantida só por compatibilidade; nenhuma tela usa.
 * Resposta SIMULADA, montada só com o que foi preenchido no formulário. Não é a IA de verdade: serve para o dono
 * ver o que está faltando. Sem informação, a resposta admite que não sabe e oferece chamar a equipe.
 */
export function simulateAnswer(s: ServiceItem, question: string, all: ServiceItem[]): string {
  const q = norm(question);
  const k = s.knowledge;
  const name = s.name.trim() || 'este serviço';
  const unknown = `Não tenho essa informação sobre ${name.toLowerCase()}. Posso pedir para alguém da equipe te responder?`;
  if (!q.trim()) return '';

  const faq = k.faqs.
  filter((f) => f.question.trim() && f.answer.trim()).
  map((f) => ({ f, score: words(f.question).filter((w) => q.includes(w)).length })).
  sort((a, b) => b.score - a.score)[0];
  if (faq && faq.score >= 2) return faq.f.answer.trim();

  if (/(quanto|preco|valor|custa|pagar)/.test(q)) {
    if (s.priceMode === 'sob-consulta') return `O valor de ${name.toLowerCase()} é definido depois da avaliação. Quer que eu veja um horário para você?`;
    if (!(s.price > 0)) return unknown;
    return s.priceMode === 'a-partir' ?
    `${name} começa em ${brl(s.price)}. O valor final a profissional confirma no atendimento.` :
    `${name} custa ${brl(s.price)}.`;
  }
  if (/(quanto tempo|demora|dura|duracao|tempo)/.test(q)) return `${name} dura cerca de ${s.durationMin} minutos.`;
  if (/(antes|preparo|preparar|levar|jejum)/.test(q)) return k.prepBefore.trim() || unknown;
  if (/(depois|cuidado|pos |pos-|vermelh|sol|maquiagem)/.test(q)) return k.careAfter.trim() || unknown;
  if (/(gravida|gestante|amament|contra|posso fazer|pode fazer|indicad|acne|alerg)/.test(q)) {
    if (!k.contraindications.trim()) return unknown;
    // Gravidez/amamentação não citadas no texto: não deduzir que pode; admitir que não sabe.
    if (/(gravida|gestante|amament)/.test(q) && !/(gravid|gestant|amament)/.test(norm(k.contraindications))) return unknown;
    return `${k.contraindications.trim()}${k.requiresEvaluation ? ' Por isso, antes fazemos uma avaliação.' : ''}`;
  }
  if (/(avaliacao|avaliar|precisa de consulta|primeira vez)/.test(q)) {
    if (!k.requiresEvaluation) return `Não precisa de avaliação antes: dá para agendar ${name.toLowerCase()} direto.`;
    const ev = all.find((x) => x.id === k.evaluationServiceId);
    return ev ? `Antes de ${name.toLowerCase()} fazemos ${ev.name.toLowerCase()} (${ev.durationMin} min). Quer agendar?` : `Antes de ${name.toLowerCase()} é preciso uma avaliação com a profissional. Quer que eu veja um horário?`;
  }
  if (/(online|video|remot|distancia)/.test(q)) return s.modality === 'online' ? `${name} é feito online, por vídeo.` : `${name} é presencial, na clínica.`;
  if (/(inclui|incluso|o que e|como e|como funciona|o que acontece|consulta|faz o que)/.test(q) || k.synonyms.some((syn) => q.includes(norm(syn).trim()))) {
    const parts = [k.description.trim(), k.included.trim() ? `Inclui: ${k.included.trim()}` : ''].filter(Boolean);
    return parts.length ? parts.join(' ') : unknown;
  }
  return k.description.trim() || unknown;
}

/* ───────────── dados de exemplo: data/servicesSeed.ts (semente única, G1) ───────────── */

/* ───────────── store ───────────── */

type State = {services: ServiceItem[];categories: Category[];};
let state: State = { services: seedServices, categories: seedCategories };
// G4 · fechamento: a amostra inicial é exemplo substituível (data/exampleRecords.ts).
markExamples('servico', seedServices.map((s) => s.id));
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Mantém as listas dos formulários (data/catalogo.ts) iguais ao catálogo vivo. G1: `servicosEquipe.ts` deixou de ter lista própria. */
function syncAll(s: State) {
  syncCatalogServices(s.services.map(catalogEntryOf));
}
syncAll(state);

const emit = (next: State) => {
  state = next;
  syncAll(next);
  // O cadastro da equipe guarda os NOMES dos serviços de cada profissional: mantém igual ao vínculo N:N daqui
  setMembers((list) => list.map((m) => ({ ...m, services: next.services.filter((x) => x.active && x.professionalIds.includes(m.id)).map((x) => x.name) })));
  listeners.forEach((l) => l());
};

/** G1 (F-055): a contagem ÚNICA de serviços ativos fica em data/activeServices.ts (sem dependências). */
export { activeServicesOf } from './activeServices';

export const getServices = () => state;
export const useServices = () => useSyncExternalStore(subscribe, () => state);

export function saveService(s: ServiceItem) {
  // G3 (revisão v3): renomear guarda o nome anterior para o texto já gravado (agenda, lista de espera) continuar ligado ao
  // MESMO serviço (`resolveService` em data/catalogo.ts). O texto gravado não é reescrito.
  const prev = state.services.find((x) => x.id === s.id);
  if (prev && prev.name.trim() && prev.name.trim() !== s.name.trim()) recordFormerServiceName(prev.name, s.id);
  emit({ ...state, services: state.services.some((x) => x.id === s.id) ? state.services.map((x) => x.id === s.id ? s : x) : [...state.services, s] });
}
export function setServiceActive(id: string, active: boolean) {
  emit({ ...state, services: state.services.map((x) => x.id === id ? { ...x, active } : x) });
}
export function setCategories(categories: Category[]) {
  emit({ ...state, categories });
}
/** Renomear uma categoria muda o nome nos serviços dela (o vínculo é pelo id). */
export const categoryName = (id: string, list: Category[] = state.categories) => list.find((c) => c.id === id)?.name ?? OTHER_CATEGORY;

/** Nomes dos serviços que um profissional faz (o cadastro de equipe guarda nomes). */
export const servicesOf = (proId: string, list: ServiceItem[] = state.services) => list.filter((s) => s.active && s.professionalIds.includes(proId));

/** Ao mudar "Serviços que faz" no perfil do profissional, o vínculo N:N é atualizado nos serviços. */
/** G5 parte 2 (pendência do G4): devolve os ids dos serviços cujo vínculo MUDOU nesta ação (quem chama marca como configurado). */
export function setProfessionalServices(proId: string, serviceIds: string[]): string[] {
  const changed: string[] = [];
  emit({
    ...state,
    services: state.services.map((s) => {
      const has = s.professionalIds.includes(proId);
      const want = serviceIds.includes(s.id);
      if (has === want) return s;
      changed.push(s.id);
      return { ...s, professionalIds: want ? [...s.professionalIds, proId] : s.professionalIds.filter((p) => p !== proId) };
    })
  });
  return changed;
}

/** G5 parte 2 (espelho): profissionais incluídos ou retirados de "Quem faz" ao salvar `s`, comparado ao serviço guardado. */
export function professionalLinkChanges(s: ServiceItem): string[] {
  const before = state.services.find((x) => x.id === s.id)?.professionalIds ?? [];
  const after = s.professionalIds;
  return [...after.filter((p) => !before.includes(p)), ...before.filter((p) => !after.includes(p))];
}

/** Serviço pelo nome mostrado na agenda (procedimento realizado). */
export const serviceByName = (label: string, list: ServiceItem[] = state.services) => list.find((s) => s.name.toLowerCase() === label.toLowerCase());

/** Lote F: troca as exceções de pagamento de todos os serviços (seletor de telas: "Pagamento salvo"). */
export function setServicePayments(fn: (s: ServiceItem) => ServicePayment) {
  emit({ ...state, services: state.services.map((s) => ({ ...s, payment: fn(s) })) });
}
/** Exceções de pagamento do exemplo (Lote F). */
export const samplePaymentOf = (id: string): ServicePayment => {
  const seed = seedServices.find((s) => s.id === id);
  return seed ? JSON.parse(JSON.stringify(seed.payment)) : blankServicePayment();
};

export const newServiceId = () => `s-${Date.now().toString(36)}`;
export const blankKnowledge = () => emptyKnowledge('');