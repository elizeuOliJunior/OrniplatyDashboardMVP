import type { FirstAccess } from './onboardingHandoff';
import { DEFAULT_BUFFER, SCHEDULE_VERSION, weekFromClinicHours } from './schedule';
import type { ProfessionalSchedule } from './schedule';

/**
 * Primeiro acesso PREENCHIDO pelo seletor de telas (decisão 3A do Christian, 21/10/2026): `#/inicio-primeiro-acesso?exemplo=preenchido`.
 * CÓPIA do cenário preenchido do Onboarding (`makeSession(true)` + `state=active` em data/onboardingState.tsx do Onboarding),
 * no formato do handoff (`handoffPayload`). Não é sincronizado sozinho: se o cenário mudar lá, atualizar aqui no mesmo ciclo.
 * Não testa a passagem real Onboarding → Painel (postMessage); para isso, seguir o caminho completo pelo Onboarding.
 *
 * W6 (11/11/2026, A6-06): a cópia perdia o texto da pergunta do Conhecimento ("Vocês têm estacionamento?") e não mandava
 * o campo "Sobre" (que no Onboarding está vazio). Sem eles, o Painel contava "Sobre a clínica" como pronto (texto de
 * exemplo) e 0 perguntas recebidas: 8 de 10 no Painel × 7 de 10 no Onboarding. Agora os dois lados contam 7 de 10.
 *
 * I1 (11/11/2026, integração, item 10): o WhatsApp da empresa é (19) 3215-4400, como no Onboarding (W7, A6-09). Antes era
 * o mesmo número da Dra. Carolina.
 *
 * I3 (11/11/2026): a chave `faltou` ("Chamar quem faltou") entra em `automations` (desligada) e em `automationKinds`
 * (campanha), como o cenário preenchido do Onboarding manda (data/differentials.ts de lá: sete automações, só
 * `confirmacao` começa ligada). O efeito na tela é o mesmo de antes (desligada); a cópia fica igual ao original.
 *
 * W9e (12/11/2026, J-09): o Onboarding passou a ter as mesmas oito automações do Painel. Entra a chave
 * `avisar-mudanca-horario` ("Avisar mudança de horário", desligada, transacional), como o cenário preenchido de lá manda.
 */
const hours = [
{ day: 'Segunda-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Terça-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Quarta-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Quinta-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Sexta-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Sábado', open: false, from: '08:00', to: '18:00' },
{ day: 'Domingo', open: false, from: '08:00', to: '18:00' }];


function carolina(): ProfessionalSchedule {
  return {
    week: weekFromClinicHours(hours).map((d) => d.working ? { ...d, breaks: [{ start: '12:00', end: '13:00' }] } : d),
    overrides: [],
    bufferMin: DEFAULT_BUFFER
  };
}

function juliana(): ProfessionalSchedule {
  return {
    week: weekFromClinicHours(hours).map((d, i) =>
    i === 2 ?
    { working: true, periods: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }], breaks: [] } :
    i === 4 ?
    { working: true, periods: [{ start: '08:00', end: '14:00' }], breaks: [{ start: '10:00', end: '10:15' }] } :
    d
    ),
    overrides: [{ id: 'ov-ju-ferias', from: '2026-10-19', to: '2026-10-23', kind: 'off', ranges: [], reason: 'Férias' }],
    bufferMin: 0
  };
}

export function firstAccessSample(): FirstAccess {
  return {
    handoffVersion: 3,
    owner: { name: 'Marina Souza' },
    clinic: { name: 'Clínica Vida Plena Estética', segment: 'clinica', specialty: 'estetica', about: '', street: '', number: '', city: '' },
    profile: {
      name: '',
      tone: 'humanizada',
      greeting: 'Olá! Sou a Assistente inteligente da Orniplaty, da Clínica Vida Plena Estética. Como posso ajudar?',
      acceptsInsurance: '',
      payments: ['Pix', 'Cartão de crédito', 'Cartão de débito'],
      cancellation: 'Cancelamento ou remarcação com até 24 horas de antecedência, sem custo.'
    },
    hours: hours.map((h) => ({ ...h })),
    clinicExceptions: [{ id: 'ce-feriado', date: '2026-10-12', kind: 'closed', reason: 'Feriado' }],
    scheduleVersion: SCHEDULE_VERSION,
    team: [
    { id: 'carolina', name: 'Dra. Carolina', phone: '(19) 99972-1251', specialty: 'Estética', color: '#0E7490', schedule: carolina() },
    { id: 'juliana', name: 'Juliana', phone: '(19) 98812-3344', specialty: 'Estética corporal', color: '#7C3AED', schedule: juliana() }],

    services: [
    { id: 'limpeza', name: 'Limpeza de pele', category: 'Facial', duration: '60', price: '180,00', returnDays: '30', professionals: [] },
    { id: 'drenagem', name: 'Drenagem linfática', category: 'Corporal', duration: '50', price: '150,00', returnDays: '7', professionals: ['juliana'] },
    { id: 'toxina', name: 'Toxina botulínica', category: 'Injetáveis', duration: '45', price: '900,00', returnDays: '120', professionals: ['carolina'] }],

    faqs: [{ question: 'Vocês têm estacionamento?', answer: 'Sim, estacionamento gratuito no subsolo do prédio.' }],
    documents: [],
    level: 'equilibrado',
    imported: 0,
    importedClients: [],
    plan: 'tier_2',
    automations: { confirmacao: true, 'lista-espera': false, 'avisar-mudanca-horario': false, reativacao: false, retorno: false, faltou: false, retomada: false, pacotes: false },
    automationKinds: { confirmacao: 'transacional', 'lista-espera': 'pedido', 'avisar-mudanca-horario': 'transacional', reativacao: 'campanha', retorno: 'campanha', faltou: 'campanha', retomada: 'campanha', pacotes: 'campanha' },
    completed: [1, 2, 3, 4, 5, 6, 7, 9],
    deferred: [8],
    whatsapp: 'connected',
    whatsappNumber: '(19) 3215-4400',
    aiOn: true
  };
}