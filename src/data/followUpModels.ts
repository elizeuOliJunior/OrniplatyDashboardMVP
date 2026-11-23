/**
 * Modelos de acompanhamento de cada serviço (Lote B, 20/10/2026). SIMULAÇÃO de protótipo, só front-end.
 * Base: claude/oportunidades-conceito-ia-decisoes-2026-10-20.md (D10, D11, D12) e as 4 respostas do Christian ao Lote B:
 *  1) Limpeza = Manutenção 30 dias · Toxina = Manutenção 4 meses · Drenagem = Série a cada 7 dias, depois Manutenção 30 dias ·
 *     Peeling = Retorno definido pelo profissional.
 *  3) Revisão = uma volta única, padrão 15 dias depois do procedimento, até 2 mensagens, sem repetir.
 * Arquivo SEM dependências (é lido por servicesStore, followUp, Automações e Fechar atendimento).
 * BACKEND: nada disto existe na main lida (o serviço só tem recurrence_days). É proposta de contrato.
 */

export type ModelKind = 'manutencao' | 'serie' | 'recorrente' | 'profissional' | 'revisao' | 'sem-retorno';

/** Mesmo formato do `FollowUpStep` do design system (v3.7). */
export type StepWhen = 'after-visit' | 'before-due' | 'on-due' | 'after-due';
export type Step = {id: string;when: StepWhen;days?: number;};

export type ServiceFollowUp = {
  model: ModelKind;
  /** Manutenção: prazo de retorno · Série: intervalo entre sessões · Revisão: dias depois do procedimento. Profissional: em branco (vem do fechamento). */
  dueDays: number | null;
  /** Série: número de sessões. */
  sessions?: number;
  /** Série: depois da última sessão, passa para Manutenção com este prazo (D11). Nulo = acaba na última sessão. */
  afterSeriesDays?: number | null;
  steps: Step[];
};

export const MODEL_OPTIONS: {value: ModelKind;label: string;short: string;help: string;}[] = [
{ value: 'manutencao', label: 'Manutenção · repetir de tempos em tempos', short: 'Manutenção', help: 'O cliente volta a cada prazo (ex.: limpeza de pele a cada 30 dias).' },
{ value: 'serie', label: 'Série de sessões · várias sessões seguidas', short: 'Série de sessões', help: 'Várias sessões com intervalo fixo. Ao terminar a série, pode passar para Manutenção.' },
{ value: 'recorrente', label: 'Recorrente fixo · mesmo horário toda semana', short: 'Recorrente fixo', help: 'Horário fixo toda semana na agenda. A Orniplaty só manda mensagem se uma semana ficar vazia.' },
{ value: 'profissional', label: 'Retorno definido pelo profissional', short: 'Retorno definido pelo profissional', help: 'O prazo é escolhido no Fechar atendimento, cliente a cliente. Os passos valem a partir dele.' },
{ value: 'revisao', label: 'Revisão · uma volta única depois do procedimento', short: 'Revisão', help: 'Uma volta só, alguns dias depois do procedimento (ex.: revisão 15 dias depois). Não se repete.' },
{ value: 'sem-retorno', label: 'Sem retorno · a Orniplaty não chama de volta', short: 'Sem retorno', help: 'A Orniplaty não chama de volta depois deste serviço.' }];

export const modelShort = (m: ModelKind) => MODEL_OPTIONS.find((o) => o.value === m)?.short ?? '';

/**
 * Ajustes do Lote B (21/10/2026, decisão do Christian): a TELA não mostra mais o nome técnico do modelo.
 * Vira a pergunta "Depois deste serviço, o cliente precisa voltar?" com estas respostas (ChoiceCards do design system v3.12).
 * Os dados continuam com os modelos internos (`ModelKind`).
 */
export const RETURN_QUESTION = 'Depois deste serviço, o cliente precisa voltar?';
export const MODEL_PLAIN: Record<ModelKind, {title: string;description: string;example?: string;}> = {
  manutencao: { title: 'Sim, de tempos em tempos', description: 'O cliente volta sempre depois do mesmo prazo.', example: 'limpeza de pele a cada 30 dias' },
  serie: { title: 'Sim, é uma série de sessões', description: 'Várias sessões seguidas, com o mesmo intervalo.', example: '10 sessões de drenagem, uma por semana' },
  revisao: { title: 'Sim, uma revisão depois', description: 'Uma volta só, para conferir o resultado.', example: 'voltar 15 dias depois para conferir' },
  profissional: { title: 'Sim, mas o profissional decide quando', description: 'O prazo é escolhido ao fechar o atendimento, cliente a cliente.' },
  recorrente: { title: 'Sim, toda semana no mesmo horário', description: 'O horário fica marcado toda semana. A Orniplaty só chama se uma semana ficar vazia.' },
  'sem-retorno': { title: 'Não precisa voltar', description: 'Nenhuma mensagem é enviada depois deste serviço.' }
};
/** Ordem das respostas na tela (a mais comum primeiro). */
export const MODEL_PLAIN_ORDER: ModelKind[] = ['manutencao', 'serie', 'revisao', 'profissional', 'recorrente', 'sem-retorno'];
/** Nome do tipo de volta em Automações › Lembrar o cliente de voltar (sem "Sim,"). */
export const MODEL_KIND_NAME: Record<ModelKind, string> = {
  manutencao: 'Volta de tempos em tempos',
  serie: 'Série de sessões',
  revisao: 'Revisão depois',
  profissional: 'O profissional decide quando',
  recorrente: 'Toda semana no mesmo horário',
  'sem-retorno': 'Não precisa voltar'
};

/** "uma por semana", "uma a cada 10 dias". */
export const everyText = (days: number) => days === 7 ? 'uma por semana' : days === 14 ? 'uma a cada 2 semanas' : `uma a cada ${durationText(days)}`;

/** Texto curto da coluna de retorno da lista de serviços (computador e celular). */
export function returnPlainText(f: ServiceFollowUp): string {
  switch (f.model) {
    case 'manutencao':
      return f.dueDays ? `Volta a cada ${durationText(f.dueDays)}` : 'Volta de tempos em tempos';
    case 'serie':{
        const base = `${f.sessions ?? '?'} sessões, ${(f.dueDays ?? 7) === 7 ? '1 por semana' : `1 a cada ${durationText(f.dueDays ?? 7)}`}`;
        return f.afterSeriesDays ? `${base}; depois volta a cada ${durationText(f.afterSeriesDays)}` : base;
      }
    case 'revisao':
      return `Revisão ${durationText(f.dueDays ?? 15)} depois`;
    case 'profissional':
      return 'Profissional decide';
    case 'recorrente':
      return 'Toda semana, mesmo horário';
    default:
      return 'Não volta';
  }
}

/** "Limpeza de pele costuma voltar a cada 30 dias." (Fechar atendimento › sugestão do serviço). */
export function serviceReturnSentence(name: string, f: ServiceFollowUp): string {
  switch (f.model) {
    case 'manutencao':
      return f.dueDays ? `${name} costuma voltar a cada ${durationText(f.dueDays)}.` : `${name} costuma voltar de tempos em tempos.`;
    case 'serie':
      return `${name} é uma série de ${f.sessions ?? '?'} sessões, ${everyText(f.dueDays ?? 7)}.${f.afterSeriesDays ? ` Depois, volta a cada ${durationText(f.afterSeriesDays)}.` : ''}`;
    case 'revisao':
      return `${name} tem uma revisão ${durationText(f.dueDays ?? 15)} depois.`;
    case 'profissional':
      return `Em ${name}, o profissional decide quando o cliente volta.`;
    case 'recorrente':
      return `${name} tem horário fixo toda semana.`;
    default:
      return `${name} não precisa de retorno.`;
  }
}

/** Modelos que têm passos (mensagens). Recorrente fixo e Sem retorno não têm. */
export const MODELS_WITH_STEPS: ModelKind[] = ['manutencao', 'serie', 'profissional', 'revisao'];
export const hasSteps = (m: ModelKind) => MODELS_WITH_STEPS.includes(m);

/** Padrão de cada modelo (biblioteca em IA Orniplaty › Automações). */
export type ModelLibrary = Record<ModelKind, {maxSteps: number;steps: Step[];}>;

export const DEFAULT_MODEL_LIBRARY: ModelLibrary = {
  manutencao: {
    maxSteps: 3,
    steps: [
    { id: 'man-1', when: 'before-due', days: 5 },
    { id: 'man-2', when: 'on-due' },
    { id: 'man-3', when: 'after-due', days: 7 }]

  },
  serie: {
    maxSteps: 2,
    steps: [
    { id: 'ser-1', when: 'on-due' },
    { id: 'ser-2', when: 'after-due', days: 3 }]

  },
  profissional: {
    maxSteps: 3,
    steps: [
    { id: 'pro-1', when: 'before-due', days: 5 },
    { id: 'pro-2', when: 'on-due' },
    { id: 'pro-3', when: 'after-due', days: 7 }]

  },
  revisao: {
    maxSteps: 2,
    steps: [
    { id: 'rev-1', when: 'before-due', days: 3 },
    { id: 'rev-2', when: 'on-due' }]

  },
  recorrente: { maxSteps: 0, steps: [] },
  'sem-retorno': { maxSteps: 0, steps: [] }
};

/** Opções do "Até N mensagens" da biblioteca. */
export const MAX_STEPS_OPTIONS = [1, 2, 3, 4, 5];

/** Aviso antes do prazo sugerido pela Orniplaty: ~15% do prazo, mínimo 3 e máximo 30 dias (D10; igual a `suggestLeadDays` do design system). */
export const leadDays = (dueInDays: number) => Math.min(30, Math.max(3, Math.round(dueInDays * 0.15)));

/** Prazo inicial de cada modelo ao trocar de modelo no cadastro do serviço. */
export function defaultDueFor(model: ModelKind): number | null {
  if (model === 'manutencao') return 30;
  if (model === 'serie') return 7;
  if (model === 'revisao') return 15;
  return null;
}

let seq = 0;
const sid = () => `passo-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Passos de um serviço a partir do padrão do modelo. Manutenção: o aviso antes do prazo começa com a sugestão (~15%). */
export function stepsFor(model: ModelKind, dueDays: number | null, library: ModelLibrary = DEFAULT_MODEL_LIBRARY): Step[] {
  const lib = library[model];
  return lib.steps.slice(0, lib.maxSteps).map((s, i) => ({
    ...s,
    id: sid(),
    days: model === 'manutencao' && i === 0 && s.when === 'before-due' && dueDays ? leadDays(dueDays) : s.days
  }));
}

export function newFollowUp(model: ModelKind, library: ModelLibrary = DEFAULT_MODEL_LIBRARY): ServiceFollowUp {
  const dueDays = defaultDueFor(model);
  return {
    model,
    dueDays,
    sessions: model === 'serie' ? 5 : undefined,
    afterSeriesDays: model === 'serie' ? null : undefined,
    steps: stepsFor(model, dueDays, library)
  };
}

/** "30 dias", "4 meses" (múltiplos de 30 a partir de 60 dias). */
export function durationText(days: number): string {
  if (days >= 60 && days % 30 === 0) return `${days / 30} meses`;
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** Frase curta do modelo do serviço (lista de serviços, Fechar atendimento, Automações). */
export function describeFollowUp(f: ServiceFollowUp): string {
  switch (f.model) {
    case 'manutencao':
      return f.dueDays ? `Manutenção · a cada ${durationText(f.dueDays)}` : 'Manutenção';
    case 'serie':{
        const base = `Série · ${f.sessions ?? '?'} sessões a cada ${durationText(f.dueDays ?? 7)}`;
        return f.afterSeriesDays ? `${base}, depois Manutenção de ${durationText(f.afterSeriesDays)}` : base;
      }
    case 'revisao':
      return `Revisão · ${durationText(f.dueDays ?? 15)} depois`;
    case 'profissional':
      return 'Retorno definido pelo profissional';
    case 'recorrente':
      return 'Recorrente fixo · toda semana';
    default:
      return 'Sem retorno';
  }
}

/** Valor do campo antigo `returnDays` (recurrence_days), usado por Clientes › Retornos até o Lote C. */
export function returnDaysOf(f: ServiceFollowUp): number | null {
  if (f.model === 'manutencao' || f.model === 'serie' || f.model === 'revisao') return f.dueDays && f.dueDays > 0 ? f.dueDays : null;
  return null;
}

const norm = (t: string) =>
t.
toLowerCase().
normalize('NFD').
replace(/[̀-ͯ]/g, '');

/**
 * Sugestão de modelo pelo nome e pela categoria do serviço (texto visível no cadastro; a clínica decide).
 * Regras simples de protótipo: palavras do nome primeiro, depois o tipo de atendimento e a categoria.
 */
export function suggestModel(name: string, categoryName: string, kind?: string): ModelKind {
  const n = norm(name);
  const c = norm(categoryName);
  if (/revisao/.test(n)) return 'revisao';
  if (/avaliacao|primeira consulta|orcamento/.test(n) || kind === 'avaliacao' || kind === 'retorno') return 'sem-retorno';
  if (/aula|pilates|personal|acompanhamento semanal|terapia semanal/.test(n)) return 'recorrente';
  if (/drenagem|fisioterapia|laser|depilacao|massagem modeladora|radiofrequencia|criolipolise|acupuntura/.test(n) || kind === 'sessao') return 'serie';
  if (/toxina|botox|preenchimento|bioestimulador|limpeza|manutencao|corte|barba|unha|manicure|pedicure|escova|coloracao|luzes|sobrancelha/.test(n)) return 'manutencao';
  if (/peeling|microagulhamento|cirurgia|implante/.test(n)) return 'profissional';
  if (/corporal/.test(c)) return 'serie';
  return 'manutencao';
}