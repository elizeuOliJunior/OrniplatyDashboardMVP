/**
 * Segmento e especialidade (Lote D, 21/10/2026; decisões S1 e S1b de 20/10/2026; ampliado no G4, F-062, 27/10/2026).
 * ARQUIVO COMPARTILHADO: conteúdo idêntico no Painel e no Onboarding (alterar um = alterar o outro no mesmo ciclo).
 * Sem React e sem import: só dados e funções puras.
 * - Segmento (4) muda as PALAVRAS das telas (`businessWords`): clínica · salão · consultório · empresa, com artigo e gênero.
 *   Segmento vazio (Onboarding antes da escolha) usa a palavra neutra "empresa".
 * - Especialidade (só Clínica e Consultório) e segmento mudam as SUGESTÕES e EXEMPLOS (`segmentContent`): serviços, áreas,
 *   perguntas, instruções, exemplo de profissional, exemplo de empresa e se a pergunta de convênio se aplica.
 *   G4 (F-062): a decisão de 20/10 ("só palavras") foi ampliada pelo Christian para personalização completa dos exemplos.
 *   Os exemplos nunca substituem dados cadastrados: trocar o segmento não apaga nem troca serviços (ver `segmentChangeNote`).
 * - Valores antigos (a lista de 6 do Onboarding, a lista "só clínicas" do Painel, apelidos de salão/barbearia) são convertidos
 *   por `migrateSegment`; `segmentWasMigrated` diz quando mostrar o aviso "Confira o segmento". "Pet" não é segmento ativo
 *   (o design system proíbe exemplos com pets) e vira "Outro".
 * - `setCurrentSegment`/`wordsNow`: o segmento EM USO na sessão (o Painel liga ao cadastro da Empresa; o Onboarding, à sessão),
 *   para os arquivos compartilhados (`schedule.ts`, `ScheduleEditor.tsx`) escreverem "a clínica"/"o salão" sem depender de tela.
 * BACKEND: segmento não existe na main lida (06–07/10). Proposta de contrato (G6).
 */
export type Segment = 'clinica' | 'salao-barbearia' | 'consultorio' | 'outro';
export type Specialty = 'estetica' | 'odontologia' | 'clinica-medica' | 'fisioterapia' | 'psicologia' | 'outra';

export const SEGMENT_OPTIONS: {value: Segment;label: string;}[] = [
{ value: 'clinica', label: 'Clínica' },
{ value: 'salao-barbearia', label: 'Salão/Barbearia' },
{ value: 'consultorio', label: 'Consultório' },
{ value: 'outro', label: 'Outro' }];


export const SPECIALTY_OPTIONS: {value: Specialty;label: string;}[] = [
{ value: 'estetica', label: 'Estética' },
{ value: 'odontologia', label: 'Odontologia' },
{ value: 'clinica-medica', label: 'Clínica médica' },
{ value: 'fisioterapia', label: 'Fisioterapia' },
{ value: 'psicologia', label: 'Psicologia' },
{ value: 'outra', label: 'Outra' }];


export const DEFAULT_SEGMENT: Segment = 'clinica';

/** Só Clínica e Consultório pedem especialidade. */
export const hasSpecialty = (segment: string) => segment === 'clinica' || segment === 'consultorio';

const SEGMENTS: string[] = SEGMENT_OPTIONS.map((o) => o.value);
const SPECIALTIES: string[] = SPECIALTY_OPTIONS.map((o) => o.value);

/** "Salão/Barbearia" → "salao/barbearia"; "Clínica médica" → "clinica medica". */
const plain = (v: string) =>
v.
trim().
toLowerCase().
normalize('NFD').
replace(/[̀-ͯ]/g, '');

const SEGMENT_ALIASES: Record<string, Segment> = {
  clinica: 'clinica',
  'salao-barbearia': 'salao-barbearia',
  'salao/barbearia': 'salao-barbearia',
  'salao e barbearia': 'salao-barbearia',
  salao: 'salao-barbearia',
  barbearia: 'salao-barbearia',
  'salao de beleza': 'salao-barbearia',
  consultorio: 'consultorio',
  outro: 'outro'
};
const SPECIALTY_ALIASES: Record<string, Specialty> = {
  estetica: 'estetica',
  odontologia: 'odontologia',
  'clinica-medica': 'clinica-medica',
  'clinica medica': 'clinica-medica',
  fisioterapia: 'fisioterapia',
  psicologia: 'psicologia',
  outra: 'outra'
};

/**
 * Converte qualquer valor (novo ou antigo) para o par segmento + especialidade. Segmento vazio continua vazio
 * (no Onboarding significa "ainda não escolhido").
 * - especialidade antiga usada como segmento ("estetica", "odontologia"…) → Clínica + essa especialidade;
 * - apelidos de salão/barbearia (inclusive com acento ou rótulo) → Salão/Barbearia;
 * - qualquer outro valor desconhecido (inclusive "pet") → Outro.
 */
export function migrateSegment(segment?: string | null, specialty?: string | null): {segment: Segment | '';specialty: Specialty | '';} {
  const raw = (segment ?? '').trim();
  if (!raw) return { segment: '', specialty: '' };
  const s = plain(raw);
  const sp = SPECIALTY_ALIASES[plain(specialty ?? '')] ?? '';
  const seg = SEGMENT_ALIASES[s];
  if (seg) return { segment: seg, specialty: hasSpecialty(seg) && sp ? sp : '' };
  const asSpecialty = SPECIALTY_ALIASES[s];
  if (asSpecialty && asSpecialty !== 'outra') return { segment: 'clinica', specialty: asSpecialty };
  return { segment: 'outro', specialty: '' };
}

/** O valor recebido precisou de conversão (aviso único "Confira o segmento"). Valor atual ou vazio: não. */
export const segmentWasMigrated = (segment?: string | null) => {
  const raw = (segment ?? '').trim();
  return !!raw && !SEGMENTS.includes(raw);
};

export const segmentLabel = (segment: string) => SEGMENT_OPTIONS.find((o) => o.value === segment)?.label ?? '';
export const specialtyLabel = (specialty: string) => SPECIALTY_OPTIONS.find((o) => o.value === specialty)?.label ?? '';

/** "Clínica · Estética", "Salão/Barbearia". */
export function businessLabel(segment: string, specialty?: string) {
  const s = segmentLabel(segment);
  const sp = hasSpecialty(segment) && specialty ? specialtyLabel(specialty) : '';
  return [s, sp].filter(Boolean).join(' · ');
}

/**
 * Chave das listas de sugestões e exemplos: a especialidade quando houver (menos "Outra"); "salao-barbearia";
 * "clinica" ou "consultorio" sem especialidade; senão "outro" (Outro ou segmento ainda não escolhido).
 */
export function suggestionKey(segment: string, specialty?: string) {
  if (hasSpecialty(segment) && specialty && specialty !== 'outra') return specialty;
  if (segment === 'salao-barbearia' || segment === 'clinica' || segment === 'consultorio') return segment;
  return 'outro';
}

/** Rótulo das sugestões: "Estética", "Salão/Barbearia", "sua clínica", "seu consultório" ou "sua empresa". */
export function suggestionLabel(segment: string, specialty?: string) {
  const key = suggestionKey(segment, specialty);
  if (key === 'salao-barbearia') return segmentLabel(key);
  if (SPECIALTIES.includes(key)) return specialtyLabel(key);
  return businessWords(segment).your;
}

/** Palavras do negócio usadas nos textos (com artigo e gênero). */
export type BusinessWords = {
  /** clínica · salão · consultório · empresa */
  noun: string;
  /** Clínica · Salão · Consultório · Empresa */
  Noun: string;
  /** a clínica · o salão */
  the: string;
  /** A clínica · O salão */
  The: string;
  /** da clínica · do salão */
  of: string;
  /** na clínica · no salão */
  in: string;
  /** à clínica · ao salão */
  to: string;
  /** pela clínica · pelo salão */
  by: string;
  /** sua clínica · seu salão */
  your: string;
  /** Sua clínica · Seu salão */
  Your: string;
  /** esta clínica · este salão */
  this: string;
  /** uma clínica · um salão */
  a: string;
  /** feminino (clínica, empresa) ou masculino (salão, consultório): para concordância ("cadastrada"/"cadastrado"). */
  fem: boolean;
  /** "a" · "o": artigo para frases como "a/o …" já escritas no texto. */
  art: string;
  /** fechada · fechado (concordância de "a clínica está fechada" / "o salão está fechado"). */
  closed: string;
};

function words(noun: string, fem: boolean): BusinessWords {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return fem ?
  { noun, Noun, the: `a ${noun}`, The: `A ${noun}`, of: `da ${noun}`, in: `na ${noun}`, to: `à ${noun}`, by: `pela ${noun}`, your: `sua ${noun}`, Your: `Sua ${noun}`, this: `esta ${noun}`, a: `uma ${noun}`, fem, art: 'a', closed: 'fechada' } :
  { noun, Noun, the: `o ${noun}`, The: `O ${noun}`, of: `do ${noun}`, in: `no ${noun}`, to: `ao ${noun}`, by: `pelo ${noun}`, your: `seu ${noun}`, Your: `Seu ${noun}`, this: `este ${noun}`, a: `um ${noun}`, fem, art: 'o', closed: 'fechado' };
}

const WORDS: Record<Segment | '', BusinessWords> = {
  clinica: words('clínica', true),
  'salao-barbearia': words('salão', false),
  consultorio: words('consultório', false),
  outro: words('empresa', true),
  '': words('empresa', true)
};

/** Palavras pelo segmento (valor atual ou antigo, convertido). Segmento vazio: "empresa" (neutro). */
export function businessWords(segment?: string | null): BusinessWords {
  return WORDS[migrateSegment(segment).segment];
}

/** "cadastrada"/"cadastrado" etc.: concorda com a palavra do negócio. */
export const agree = (w: BusinessWords, fem: string, masc: string) => w.fem ? fem : masc;

/* ───────────── exemplos e sugestões por segmento/especialidade (G4, F-062) ───────────── */

export type SuggestedService = {name: string;category: string;duration: string;price: string;returnDays: string;};

export type SegmentContent = {
  key: string;
  /** Exemplo de profissional (nome + área, sem gênero na função). */
  teamExample: {name: string;role: string;};
  /** Áreas de atuação sugeridas para a equipe (neutras: área, não cargo no feminino/masculino). */
  roleOptions: string[];
  /** Serviços sugeridos (preço vazio = a empresa preenche o real). */
  services: SuggestedService[];
  /** Áreas (categorias) sugeridas. */
  categories: string[];
  /** Perguntas comuns que NÃO têm cadastro próprio (horário, pagamento, convênio, endereço, preço e duração já vêm do cadastro). */
  questions: string[];
  /** Instruções sugeridas para "Como atender". */
  instructions: string[];
  /** Exemplo de empresa (nome + "sobre"). */
  demo: {name: string;about: string;};
  /** Serviço usado em textos de exemplo quando ainda não há serviço cadastrado. */
  exampleService: string;
  /** A pergunta "atende convênio?" se aplica a este segmento. */
  insurance: boolean;
  /** Sugestões de tags de cliente. */
  tags: string[];
  /** Exemplos dos campos "o que a assistente explica" do serviço (placeholders "Ex.: …"). */
  knowledge: {synonyms: string;included: string;prepBefore: string;careAfter: string;contraindications: string;};
};

const consultGeneric: SuggestedService[] = [
{ name: 'Consulta', category: 'Consulta', duration: '30', price: '', returnDays: '' },
{ name: 'Avaliação inicial', category: 'Avaliação', duration: '60', price: '', returnDays: '' },
{ name: 'Retorno de consulta', category: 'Retorno', duration: '30', price: '', returnDays: '' }];

const commonQuestions = ['Vocês têm estacionamento?', 'Emitem nota fiscal?', 'Tem acessibilidade para cadeira de rodas?'];

const CONTENT: Record<string, Omit<SegmentContent, 'key'>> = {
  estetica: {
    teamExample: { name: 'Dra. Carolina', role: 'Estética facial' },
    roleOptions: ['Estética facial', 'Estética corporal', 'Injetáveis', 'Avaliação', 'Recepção'],
    services: [
    { name: 'Limpeza de pele', category: 'Facial', duration: '60', price: '180,00', returnDays: '30' },
    { name: 'Drenagem linfática', category: 'Corporal', duration: '50', price: '150,00', returnDays: '7' },
    { name: 'Peeling químico', category: 'Facial', duration: '40', price: '250,00', returnDays: '' },
    { name: 'Toxina botulínica', category: 'Injetáveis', duration: '45', price: '900,00', returnDays: '120' }],

    categories: ['Avaliação', 'Facial', 'Corporal', 'Injetáveis', 'Tecnologias/Laser', 'Capilar'],
    questions: ['Vocês têm estacionamento?', 'Emitem nota fiscal?', 'Posso levar acompanhante?', 'Vocês vendem os produtos usados no atendimento?'],
    instructions: [
    'Pergunte se é a primeira vez na clínica.',
    'Para toxina botulínica e peeling químico, avise que é preciso uma avaliação antes.',
    'Não ofereça horários aos domingos.',
    'Se pedirem desconto, explique que os valores são fixos.'],

    demo: { name: 'Clínica Vida Plena Estética', about: 'Atendemos estética facial e corporal com horário marcado. Nossa equipe explica cada serviço antes do agendamento.' },
    exampleService: 'Limpeza de pele',
    insurance: true,
    tags: ['Pele sensível', 'Pós-procedimento', 'Gestante', 'Alergia a produtos'],
    knowledge: { synonyms: 'consulta, avaliação, limpeza facial', included: 'higienização, esfoliação, extração, máscara e protetor solar.', prepBefore: 'vir sem maquiagem; evitar ácidos 3 dias antes.', careAfter: 'protetor solar e nada de sol direto por 24 horas.', contraindications: 'gestantes, acne inflamada ativa, pele com queimadura de sol.' }
  },
  odontologia: {
    teamExample: { name: 'Dra. Carolina', role: 'Odontologia' },
    roleOptions: ['Odontologia', 'Ortodontia', 'Implantes', 'Higiene bucal', 'Recepção'],
    services: [
    { name: 'Avaliação odontológica', category: 'Avaliação', duration: '30', price: '', returnDays: '' },
    { name: 'Limpeza dental', category: 'Prevenção', duration: '45', price: '', returnDays: '180' },
    { name: 'Clareamento', category: 'Estética dental', duration: '60', price: '', returnDays: '' },
    { name: 'Restauração', category: 'Tratamento', duration: '60', price: '', returnDays: '' }],

    categories: ['Avaliação', 'Prevenção', 'Tratamento', 'Estética dental', 'Ortodontia', 'Cirurgia'],
    questions: ['Atendem urgência?', 'Vocês têm estacionamento?', 'Emitem nota fiscal?', 'Tem acessibilidade para cadeira de rodas?'],
    instructions: [
    'Pergunte se tem dor ou urgência e chame uma pessoa se tiver.',
    'Lembre de trazer exames de imagem recentes.',
    'Pergunte se é a primeira consulta aqui.'],

    demo: { name: 'Clínica Sorriso Pleno', about: 'Atendimento odontológico com hora marcada. Explicamos cada tratamento antes de agendar.' },
    exampleService: 'Limpeza dental',
    insurance: true,
    tags: ['Ortodontia em andamento', 'Sensibilidade nos dentes', 'Gestante', 'Alergia a medicamentos'],
    knowledge: { synonyms: 'limpeza, profilaxia, tártaro', included: 'raspagem, polimento e aplicação de flúor.', prepBefore: 'escovar os dentes antes de vir.', careAfter: 'evitar alimentos com corante por 24 horas.', contraindications: 'quem está com dor forte precisa de avaliação antes.' }
  },
  'clinica-medica': {
    teamExample: { name: 'Dra. Carolina', role: 'Clínica geral' },
    roleOptions: ['Clínica geral', 'Cardiologia', 'Dermatologia', 'Nutrição', 'Recepção'],
    services: [
    { name: 'Consulta', category: 'Consulta', duration: '30', price: '', returnDays: '' },
    { name: 'Retorno de consulta', category: 'Retorno', duration: '20', price: '', returnDays: '' },
    { name: 'Check-up', category: 'Avaliação', duration: '40', price: '', returnDays: '365' }],

    categories: ['Consulta', 'Retorno', 'Avaliação', 'Exames'],
    questions: ['O que levar à consulta?', 'Fazem retorno sem custo?', 'Vocês têm estacionamento?', 'Emitem nota fiscal?'],
    instructions: ['Pergunte se é consulta ou retorno.', 'Peça para chegar 15 minutos antes.', 'Lembre de trazer documento com foto e exames anteriores.'],
    demo: { name: 'Clínica Vida Plena', about: 'Consultas com hora marcada. Explicamos cada atendimento antes do agendamento.' },
    exampleService: 'Consulta',
    insurance: true,
    tags: ['Doença crônica', 'Gestante', 'Alergia a medicamentos', 'Exames pendentes'],
    knowledge: { synonyms: 'consulta, check-up, clínico', included: 'conversa, exame físico e pedido de exames, se preciso.', prepBefore: 'trazer exames anteriores e a lista de remédios.', careAfter: 'seguir a orientação entregue na consulta.', contraindications: 'casos de urgência devem ir ao pronto-socorro.' }
  },
  fisioterapia: {
    teamExample: { name: 'Carolina Mendes', role: 'Fisioterapia' },
    roleOptions: ['Fisioterapia', 'Pilates', 'RPG', 'Avaliação', 'Recepção'],
    services: [
    { name: 'Avaliação fisioterapêutica', category: 'Avaliação', duration: '60', price: '', returnDays: '' },
    { name: 'Sessão de fisioterapia', category: 'Sessão', duration: '50', price: '', returnDays: '7' },
    { name: 'Pilates', category: 'Sessão', duration: '50', price: '', returnDays: '7' },
    { name: 'RPG', category: 'Sessão', duration: '50', price: '', returnDays: '7' }],

    categories: ['Avaliação', 'Sessão', 'Pilates', 'Reabilitação'],
    questions: ['Precisa de pedido médico?', 'Que roupa devo usar na sessão?', 'Vocês têm estacionamento?', 'Emitem nota fiscal?'],
    instructions: ['Pergunte se tem pedido médico.', 'Peça para vir com roupa confortável.', 'Pergunte se é avaliação inicial ou sessão de continuidade.'],
    demo: { name: 'Clínica Movimento', about: 'Fisioterapia e pilates com hora marcada. Começamos sempre com uma avaliação.' },
    exampleService: 'Sessão de fisioterapia',
    insurance: true,
    tags: ['Pós-cirúrgico', 'Atleta', 'Gestante', 'Dor crônica'],
    knowledge: { synonyms: 'fisio, reabilitação, sessão', included: 'avaliação da queixa e exercícios orientados.', prepBefore: 'vir com roupa confortável.', careAfter: 'fazer em casa os exercícios passados na sessão.', contraindications: 'dor aguda sem avaliação médica.' }
  },
  psicologia: {
    teamExample: { name: 'Carolina Mendes', role: 'Psicologia' },
    roleOptions: ['Psicologia', 'Psicoterapia infantil', 'Terapia de casal', 'Neuropsicologia', 'Recepção'],
    services: [
    { name: 'Primeira sessão', category: 'Avaliação', duration: '50', price: '', returnDays: '' },
    { name: 'Sessão de psicoterapia', category: 'Psicoterapia', duration: '50', price: '', returnDays: '7' },
    { name: 'Sessão online', category: 'Psicoterapia', duration: '50', price: '', returnDays: '7' },
    { name: 'Terapia de casal', category: 'Psicoterapia', duration: '80', price: '', returnDays: '' }],

    categories: ['Avaliação', 'Psicoterapia', 'Online', 'Grupos'],
    questions: ['Qual a frequência das sessões?', 'O que é conversado fica em sigilo?', 'Emitem recibo para reembolso do plano?', 'Atendem adolescentes?'],
    instructions: [
    'Pergunte se o atendimento é presencial ou online.',
    'Se a pessoa relatar crise, chame uma pessoa da equipe imediatamente.',
    'Não pergunte o motivo da sessão por mensagem.'],

    demo: { name: 'Consultório Bem Estar', about: 'Psicoterapia individual, presencial ou online, com hora marcada.' },
    exampleService: 'Sessão de psicoterapia',
    insurance: true,
    tags: ['Atendimento online', 'Adolescente', 'Casal', 'Primeira terapia'],
    knowledge: { synonyms: 'terapia, psicoterapia, sessão', included: 'sessão de 50 minutos, presencial ou online.', prepBefore: 'para sessão online, estar em um lugar reservado.', careAfter: 'nada de especial; a próxima sessão é combinada no fim.', contraindications: 'situação de crise deve procurar atendimento de urgência.' }
  },
  clinica: {
    teamExample: { name: 'Dra. Carolina', role: 'Atendimento' },
    roleOptions: ['Atendimento', 'Avaliação', 'Recepção'],
    services: consultGeneric,
    categories: ['Consulta', 'Avaliação', 'Retorno'],
    questions: commonQuestions,
    instructions: ['Pergunte se é a primeira vez na clínica.', 'Confirme sempre o serviço, o profissional e o horário antes de marcar.'],
    demo: { name: 'Clínica Vida Plena', about: 'Atendemos com hora marcada e apresentamos cada consulta antes do agendamento.' },
    exampleService: 'Consulta',
    insurance: true,
    tags: ['Gestante', 'Alergia a medicamentos', 'Exames pendentes', 'Prefere manhã'],
    knowledge: { synonyms: 'consulta, avaliação, retorno', included: 'conversa e orientação sobre o que foi feito.', prepBefore: 'trazer documento com foto.', careAfter: 'seguir a orientação entregue no atendimento.', contraindications: 'casos de urgência devem procurar o pronto-socorro.' }
  },
  consultorio: {
    teamExample: { name: 'Carolina Mendes', role: 'Atendimento' },
    roleOptions: ['Atendimento', 'Avaliação', 'Recepção'],
    services: consultGeneric,
    categories: ['Consulta', 'Avaliação', 'Retorno'],
    questions: commonQuestions,
    instructions: ['Pergunte se é a primeira vez no consultório.', 'Confirme sempre o serviço e o horário antes de marcar.'],
    demo: { name: 'Consultório Bem Estar', about: 'Atendimento individual com hora marcada. Explicamos cada consulta antes do agendamento.' },
    exampleService: 'Consulta',
    insurance: true,
    tags: ['Gestante', 'Alergia a medicamentos', 'Exames pendentes', 'Prefere manhã'],
    knowledge: { synonyms: 'consulta, avaliação, retorno', included: 'conversa e orientação sobre o que foi feito.', prepBefore: 'trazer documento com foto.', careAfter: 'seguir a orientação entregue no atendimento.', contraindications: 'casos de urgência devem procurar o pronto-socorro.' }
  },
  'salao-barbearia': {
    teamExample: { name: 'Rafael', role: 'Cabelo e barba' },
    roleOptions: ['Cabelo', 'Barba', 'Coloração', 'Manicure', 'Recepção'],
    services: [
    { name: 'Corte de cabelo', category: 'Cabelo', duration: '45', price: '', returnDays: '30' },
    { name: 'Barba', category: 'Barba', duration: '30', price: '', returnDays: '15' },
    { name: 'Escova', category: 'Cabelo', duration: '40', price: '', returnDays: '' },
    { name: 'Coloração', category: 'Cabelo', duration: '120', price: '', returnDays: '' }],

    categories: ['Cabelo', 'Barba', 'Tratamento', 'Unhas'],
    questions: ['Vocês têm estacionamento?', 'Posso levar o meu produto?', 'Emitem nota fiscal?', 'Atendem por ordem de chegada?'],
    instructions: [
    'Pergunte se é a primeira vez no salão.',
    'Pergunte com qual profissional a pessoa prefere ser atendida.',
    'Para coloração, avise que o tempo pode variar com o comprimento do cabelo.'],

    demo: { name: 'Salão Aurora', about: 'Cortes, barba e cuidados com o cabelo, com horário marcado.' },
    exampleService: 'Corte de cabelo',
    insurance: false,
    tags: ['Cabelo cacheado', 'Coloração', 'Barba', 'Prefere manhã'],
    knowledge: { synonyms: 'corte, cabelo, degradê', included: 'lavagem, corte e finalização.', prepBefore: 'vir com o cabelo sem produtos pesados.', careAfter: 'lavar só no dia seguinte, se tiver química.', contraindications: 'química recente no cabelo pode pedir avaliação antes.' }
  },
  outro: {
    teamExample: { name: 'Alex Silva', role: 'Atendimento' },
    roleOptions: ['Atendimento', 'Avaliação', 'Recepção'],
    services: [
    { name: 'Atendimento inicial', category: 'Geral', duration: '60', price: '', returnDays: '' },
    { name: 'Retorno', category: 'Geral', duration: '30', price: '', returnDays: '' },
    { name: 'Avaliação', category: 'Geral', duration: '45', price: '', returnDays: '' },
    { name: 'Sessão individual', category: 'Geral', duration: '60', price: '', returnDays: '' }],

    categories: ['Geral', 'Avaliação', 'Acompanhamento'],
    questions: commonQuestions,
    instructions: ['Pergunte se é a primeira vez com a gente.', 'Confirme sempre o serviço, o profissional e o horário antes de marcar.'],
    demo: { name: 'Espaço Horizonte', about: 'Atendemos com horário marcado e explicamos os serviços antes da reserva.' },
    exampleService: 'Atendimento inicial',
    insurance: false,
    tags: ['Cliente novo', 'Prefere manhã', 'Atendimento online', 'Indicação'],
    knowledge: { synonyms: 'atendimento, sessão, horário', included: 'o que acontece no atendimento, na ordem.', prepBefore: 'o que levar ou como chegar preparado.', careAfter: 'o que fazer depois do atendimento.', contraindications: 'quando é melhor não fazer.' }
  }
};

/** Exemplos e sugestões do segmento/especialidade (valor atual ou antigo, convertido). */
export function segmentContent(segment?: string | null, specialty?: string | null): SegmentContent {
  const m = migrateSegment(segment, specialty);
  const key = suggestionKey(m.segment, m.specialty);
  return { key, ...(CONTENT[key] ?? CONTENT.outro) };
}

/** Conteúdo pela chave de `suggestionKey` (ex.: listas indexadas por chave). Chave desconhecida = "outro". */
export const contentOfKey = (key: string): SegmentContent => ({ key: CONTENT[key] ? key : 'outro', ...(CONTENT[key] ?? CONTENT.outro) });

/** Todas as chaves com conteúdo (para conferência programática). */
export const SEGMENT_CONTENT_KEYS = Object.keys(CONTENT);

/** A pergunta de convênio aparece: o segmento atende convênio OU já existe convênio salvo (nunca some com dado salvo). */
export const insuranceApplies = (segment?: string | null, specialty?: string | null, hasSavedInsurance = false) =>
hasSavedInsurance || segmentContent(segment, specialty).insurance;

/**
 * Aviso ao trocar o segmento com serviços já cadastrados (G4, F-062/F-074): os serviços continuam e cada um mantém a área
 * original como opção. Nada é apagado nem trocado.
 */
export const SEGMENT_CHANGE_TITLE = 'Seus serviços continuam; quer revisar as áreas?';
export const segmentChangeNote = (count: number) =>
`${count === 1 ? 'O serviço cadastrado continua com' : `Os ${count} serviços cadastrados continuam com`} a área de antes, que segue disponível na lista. Nada foi apagado nem trocado.`;

/** Áreas oferecidas para um serviço: as do segmento + as que já estão em uso (área original nunca some). */
export function areasWithCurrent(segmentAreas: string[], inUse: string[]) {
  const out = [...segmentAreas];
  for (const a of inUse) if (a && a !== 'Outra' && !out.includes(a)) out.push(a);
  return out;
}

/**
 * "da Clínica Vida Plena" · "do Salão Aurora" · "da Ana Estética": preposição + artigo pelo início do NOME da empresa
 * (nome próprio cadastrado; nunca é reescrito). Primeira palavra masculina conhecida → "do"; nome vazio → "da sua empresa".
 */
const MASC_FIRST = ['salao', 'consultorio', 'espaco', 'estudio', 'studio', 'centro', 'instituto', 'atelie', 'barbeiro', 'nucleo', 'grupo', 'escritorio', 'laboratorio', 'hospital', 'ambulatorio', 'complexo', 'clube'];
export function ofName(name: string) {
  const n = name.trim();
  if (!n) return 'da sua empresa';
  const first = plain(n.split(/\s+/)[0]);
  return MASC_FIRST.includes(first) ? `do ${n}` : `da ${n}`;
}

/* ───────────── segmento em uso na sessão (arquivos compartilhados) ───────────── */
let currentSegment = '';
/** O projeto informa o segmento em uso (Painel: cadastro da Empresa; Onboarding: sessão). */
export const setCurrentSegment = (segment: string) => {
  currentSegment = segment ?? '';
};
/** Palavras do segmento em uso (vazio = "empresa"). */
export const wordsNow = () => businessWords(currentSegment);