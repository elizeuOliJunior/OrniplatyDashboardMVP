/**
 * SEMENTE ÚNICA de serviços e categorias do exemplo (G1, F-016). Era duplicada em três arquivos (servicesStore,
 * servicosEquipe e catalogo); agora o catálogo vivo (data/servicesStore.ts) nasce daqui e as listas dos formulários
 * (data/catalogo.ts) são derivadas pela MESMA função (`catalogEntryOf`). Nenhuma outra lista de serviços deve existir.
 * Mesmos serviços, preços e profissionais do design system.
 */
import { stepsFor } from './followUpModels';
import { blankServicePayment } from './paymentRules';
import type { Category, ServiceItem, ServiceKnowledge } from './servicesStore';

export const GOOD_EXAMPLE =
'Limpeza de pele profunda de cerca de 60 min: higienização, esfoliação, extração de cravos, máscara calmante e protetor solar. Indicada para pele oleosa ou com cravos. Não é indicada com acne inflamada ativa ou pele com queimadura de sol — nesses casos a profissional avalia antes. Depois do procedimento a pele pode ficar avermelhada por algumas horas.';

export const emptyKnowledge = (description: string): ServiceKnowledge => ({
  description,
  synonyms: [],
  included: '',
  prepBefore: '',
  careAfter: '',
  contraindications: '',
  requiresEvaluation: false,
  evaluationServiceId: null,
  faqs: [],
  dontSay: ''
});

export const seedCategories: Category[] = [
{ id: 'facial', name: 'Facial' },
{ id: 'corporal', name: 'Corporal' },
{ id: 'injetaveis', name: 'Injetáveis' },
// CONTRATO NOVO (aulas em grupo, 23/11/2026): categoria da amostra do G1.
{ id: 'aulas', name: 'Aulas' }];


export const seedServices: ServiceItem[] = [
{
  id: 'limpeza',
  name: 'Limpeza de pele',
  categoryId: 'facial',
  kind: 'procedimento',
  modality: 'presencial',
  durationMin: 60,
  priceMode: 'fixo',
  price: 180,
  returnDays: 30,
  followUp: { model: 'manutencao', dueDays: 30, steps: stepsFor('manutencao', 30) },
  professionalIds: ['carolina', 'juliana'],
  active: true,
  // Lote F (exemplo aprovado): sem desconto à vista nesta limpeza; o resto segue o padrão.
  payment: { ...blankServicePayment(), discount: { discount: 'nao', discountPercent: '', discountMethods: ['pix'] } },
  knowledge: {
    description: GOOD_EXAMPLE,
    synonyms: ['limpeza facial', 'limpeza', 'extração de cravos'],
    included: 'Higienização, esfoliação, extração de cravos, máscara calmante e protetor solar.',
    prepBefore: 'Vir sem maquiagem, se possível. Evitar ácidos e esfoliantes nos 3 dias anteriores.',
    careAfter: 'Usar protetor solar e evitar sol direto e maquiagem por 24 horas. A vermelhidão some em algumas horas.',
    contraindications: 'Não é indicada com acne inflamada ativa, pele com queimadura de sol ou ferida no rosto.',
    requiresEvaluation: false,
    evaluationServiceId: null,
    faqs: [{ id: 'faq-limpeza-1', question: 'De quanto em quanto tempo devo fazer limpeza de pele?', answer: 'Em geral, a cada 30 dias. A profissional ajusta conforme a sua pele.' }],
    dontSay: 'Não prometer que a pele fica sem cravos para sempre.'
  }
},
{
  id: 'peeling',
  name: 'Peeling químico',
  categoryId: 'facial',
  kind: 'procedimento',
  modality: 'presencial',
  durationMin: 40,
  priceMode: 'fixo',
  price: 250,
  returnDays: null,
  followUp: { model: 'profissional', dueDays: null, steps: stepsFor('profissional', null) },
  // Antes: a aba Serviços dizia só Dra. Carolina e a aba Equipe dizia Carolina, Juliana e Rafael. Unificado (19/10/2026).
  professionalIds: ['carolina', 'juliana', 'rafael'],
  active: true,
  payment: blankServicePayment(),
  knowledge: { ...emptyKnowledge('Renovação da pele com ácidos'), requiresEvaluation: true, synonyms: ['peeling'] }
},
{
  id: 'drenagem',
  name: 'Drenagem linfática',
  categoryId: 'corporal',
  kind: 'sessao',
  modality: 'presencial',
  durationMin: 50,
  priceMode: 'fixo',
  price: 150,
  returnDays: 7,
  // Série de 10 sessões a cada 7 dias; ao terminar, Manutenção de 30 dias (resposta 1 do Lote B). O número de sessões é exemplo.
  followUp: { model: 'serie', dueDays: 7, sessions: 10, afterSeriesDays: 30, steps: stepsFor('serie', 7) },
  // Antes: Serviços dizia só Juliana; Equipe dizia Juliana e Rafael. Unificado (19/10/2026).
  professionalIds: ['juliana', 'rafael'],
  active: true,
  payment: blankServicePayment(),
  knowledge: emptyKnowledge('Massagem para reduzir inchaço')
},
{
  id: 'toxina',
  name: 'Toxina botulínica',
  categoryId: 'injetaveis',
  kind: 'procedimento',
  modality: 'presencial',
  durationMin: 45,
  priceMode: 'fixo',
  price: 900,
  returnDays: 120,
  followUp: { model: 'manutencao', dueDays: 120, steps: stepsFor('manutencao', 120) },
  professionalIds: ['carolina'],
  active: true,
  // Lote F (exemplo aprovado): em até 10x, sem juros até 3x, e sinal fixo de R$ 200,00.
  payment: {
    ...blankServicePayment(),
    installments: { installments: 'sim', maxInstallments: '10', interestFreeUpTo: '3' },
    deposit: { deposit: 'sim', depositKind: 'fixo', depositValue: '200' }
  },
  knowledge: { ...emptyKnowledge('Aplicação com avaliação prévia'), requiresEvaluation: true, synonyms: ['botox'], dontSay: 'Não prometer resultado nem duração exata do efeito.' }
},
// CONTRATO NOVO (aulas em grupo, 23/11/2026): amostra do G1. Serviço em grupo com 4 vagas; turmas em data/turmas.ts.
{
  id: 'pilates-grupo',
  name: 'Pilates em grupo',
  categoryId: 'aulas',
  kind: 'aula',
  modality: 'presencial',
  durationMin: 60,
  priceMode: 'fixo',
  price: 60,
  returnDays: null,
  followUp: { model: 'recorrente', dueDays: null, steps: [] },
  professionalIds: ['juliana', 'rafael'],
  active: true,
  payment: blankServicePayment(),
  group: { capacity: 4 },
  knowledge: {
    ...emptyKnowledge(
      'Aula de pilates em grupo de cerca de 60 min, com até 4 pessoas e a mesma profissional toda semana: exercícios de alongamento, força e postura no aparelho e no solo. Indicada para quem quer melhorar a postura e o condicionamento. Venha com roupa confortável e meia antiderrapante.'
    ),
    synonyms: ['pilates', 'aula de pilates']
  }
}];


/** Entrada do catálogo dos formulários (data/catalogo.ts) para um serviço: a MESMA conversão em todo lugar. */
export const catalogEntryOf = (x: ServiceItem) => ({ value: x.id, label: x.name, minutes: x.durationMin, price: x.priceMode === 'sob-consulta' ? 0 : x.price, active: x.active });