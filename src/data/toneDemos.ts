/**
 * Catálogo de tons do Painel. Rótulos e descrições continuam IGUAIS aos do onboarding (P05).
 * 16/10/2026 (decisão do Christian): conversas de exemplo reescritas (cliente Marina S., sem emoji, lembrete na véspera).
 * 19/10/2026: o exemplo marca Limpeza de pele ("avaliação" não existe no catálogo) e nenhum tom fala em emoji
 * (as mensagens fixas de encaminhamento do backend ainda têm emoji: pendência do Elizeu).
 * G4 (F-070/F-073): o Onboarding passou a usar os mesmos textos (cópia própria, mesmo `toneDemosFor`), sem emoji.
 */
import { ofName } from './segment';

export type ToneValue = 'formal' | 'casual' | 'tecnico' | 'humanizada';

/** Tom padrão para clínicas novas (Q3). Clínicas existentes mantêm o que já escolheram, sem migração automática. */
export const DEFAULT_TONE: ToneValue = 'humanizada';

/** Frase curta por tom. Saiu dos cartões do Painel em 16/10/2026; mantida para paridade com o onboarding. */
export const TONE_MINI: Record<ToneValue, string> = {
  formal: 'Com prazer. Posso verificar os horários disponíveis. Qual período prefere?',
  casual: 'Claro! Quer que eu veja os horários pra você?',
  tecnico: 'Posso consultar a disponibilidade. Informe o período desejado.',
  humanizada: 'Posso olhar os horários pra você. Prefere manhã ou tarde?'
};

export const TONE_OPTIONS: {value: ToneValue;label: string;desc: string;}[] = [
{ value: 'formal', label: 'Formal', desc: 'Linguagem profissional e polida' },
{ value: 'casual', label: 'Casual', desc: 'Tom amigável e descontraído' },
{ value: 'tecnico', label: 'Técnico', desc: 'Termos técnicos e direto ao ponto' },
{ value: 'humanizada', label: 'Humanizada', desc: 'Responde como uma pessoa real, curto e natural' }];


/** Nome do cliente no cabeçalho do exemplo de WhatsApp. */
export const TONE_DEMO_CLIENT = 'Marina S.';

/** Nota abaixo de toda demo: a conversa real usa os dados da agenda. */
export const TONE_DEMO_DISCLAIMER =
'Exemplo ilustrativo. Na conversa real, a assistente usa os serviços, profissionais e horários da sua agenda.';

type DemoMessage = {from: 'patient' | 'ai';text: string;time: string;};

/**
 * G4 (F-062/F-073): o exemplo usa o serviço e o profissional do cadastro (ou o exemplo do segmento quando ainda não há) e o
 * lembrete segue a antecedência SALVA da confirmação ("na véspera" só com 24 horas; sem confirmação ligada, sem lembrete).
 * `service` = nome do serviço; `professional` = nome de exibição; `hoursBefore` = antecedência (null = confirmação desligada).
 */
export type ToneDemoContext = {service: string;professional: string;hoursBefore: number | null;};

/** "na véspera" (24 h) · "12 horas antes" · "2 dias antes" (48 h). */
export const reminderWhen = (hours: number) => hours === 24 ? 'na véspera' : hours % 24 === 0 ? `${hours / 24} dias antes` : `${hours} horas antes`;

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const femFirst = (name: string) => /(a|ção|são|gem|dade|ite)$/.test(name.trim().split(/\s+/)[0]?.toLowerCase() ?? '');

/** Mensagens do cliente iguais nos quatro tons: muda só a voz da assistente. Sem emoji. */
function demo(ctx: ToneDemoContext, ai1: string, ai2: string, ai3: string): DemoMessage[] {
  const svc = lowerFirst(ctx.service);
  return [
  { from: 'patient', text: `Oi, queria marcar ${femFirst(ctx.service) ? 'uma' : 'um'} ${svc}`, time: '09:12' },
  { from: 'ai', text: ai1, time: '09:12' },
  { from: 'patient', text: 'Quinta às 10h', time: '09:13' },
  { from: 'ai', text: ai2, time: '09:13' },
  { from: 'patient', text: 'Pode sim', time: '09:13' },
  { from: 'ai', text: ai3, time: '09:14' }];

}

export function toneDemosFor(ctx: ToneDemoContext): Record<ToneValue, DemoMessage[]> {
  const svc = lowerFirst(ctx.service);
  const Svc = ctx.service;
  const pro = ctx.professional;
  const when = ctx.hoursBefore === null ? null : reminderWhen(ctx.hoursBefore);
  return {
    formal: demo(
      ctx,
      'Olá, Marina. A senhora prefere quinta às 10h ou sexta às 14h?',
      `${Svc} na quinta às 10h com ${pro}. Posso confirmar o agendamento?`,
      when ? `Agendamento confirmado. Enviaremos um lembrete ${when}.` : 'Agendamento confirmado.'
    ),
    casual: demo(
      ctx,
      'Oi, Marina! Tenho quinta às 10h ou sexta às 14h, qual fica melhor pra você?',
      `Fechado: ${svc} quinta às 10h com ${pro}. Posso confirmar?`,
      when ? `Prontinho, tá marcado! Te lembro ${when}.` : 'Prontinho, tá marcado!'
    ),
    tecnico: demo(
      ctx,
      'Marina, disponibilidade: quinta 10h ou sexta 14h. Informe o horário desejado.',
      `${Svc}, quinta 10h, ${pro}. Confirma o agendamento?`,
      when ? `Agendamento confirmado. Lembrete será enviado ${when}.` : 'Agendamento confirmado.'
    ),
    humanizada: demo(
      ctx,
      'Oi! Tenho quinta às 10h ou sexta às 14h. Qual prefere?',
      `${Svc} quinta 10h com ${pro}. Posso confirmar?`,
      when ? `Confirmado. Te aviso ${when}.` : 'Confirmado.'
    )
  };
}

/** Exemplo padrão (amostra de clínica estética, lembrete 24 horas antes). Telas usam `toneDemosFor` com o cadastro. */
export const TONE_DEMOS: Record<ToneValue, DemoMessage[]> = toneDemosFor({ service: 'Limpeza de pele', professional: 'Dra. Carolina', hoursBefore: 24 });

/** O que muda em cada tom, em linguagem de dono de clínica. */
export const TONE_HIGHLIGHTS: Record<ToneValue, string[]> = {
  formal: ['Linguagem cortês e profissional, sem gírias', 'Trata o cliente por “senhor(a)” e pelo nome', 'Frases completas, sem abreviações'],
  casual: ['Linguagem do dia a dia, amigável e acolhedora', 'Chama o cliente pelo nome', 'Usa expressões como “prontinho” e “fechado”'],
  tecnico: ['Objetivo e direto ao ponto', 'Usa termos específicos da área', 'Chama o cliente pelo nome'],
  humanizada: ['Uma ou duas frases, como uma pessoa digita', 'Sem fórmula de call center', 'Não cumprimenta de novo no meio da conversa']
};

/** Vale para os quatro tons: o resumo antes de confirmar é regra de agendamento, não estilo. */
export const TONE_DEMO_COMMON_RULE =
'Em todos os tons, a assistente confirma serviço, profissional e horário e pede o “sim” antes de marcar. Ela é orientada a não usar emoji.';

/**
 * Lote E (E7, D3): na visão do cliente a assistente diz o nome dela NO TEXTO (não existe nome em cima do balão).
 * A apresentação entra antes da 1ª resposta de cada tom. `assistant` = nome de exibição (ex.: "Marina" ou o padrão).
 */
export function toneIntro(tone: ToneValue, assistant: string, clinic: string) {
  const who = `a ${assistant}, ${ofName(clinic)}`;
  switch (tone) {
    case 'formal':
      return { prefix: `Olá, Marina. Sou ${who}.`, strip: /^Olá, Marina\.\s*/ };
    case 'casual':
      return { prefix: `Oi, Marina! Aqui é ${who}.`, strip: /^Oi, Marina!\s*/ };
    case 'tecnico':
      return { prefix: `Marina, aqui é ${who}.`, strip: /^Marina,\s*/ };
    case 'humanizada':
      return { prefix: `Oi! Sou ${who}.`, strip: /^Oi!\s*/ };
  }
}

/** Primeira resposta do tom já com a apresentação (ex.: "Oi, Marina! Aqui é a Marina, da Clínica… Tenho quinta…"). */
export function withIntro(tone: ToneValue, text: string, assistant: string, clinic: string) {
  const { prefix, strip } = toneIntro(tone, assistant, clinic);
  const rest = text.replace(strip, '');
  return `${prefix} ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

export function isToneValue(value: string): value is ToneValue {
  return Object.prototype.hasOwnProperty.call(TONE_DEMOS, value);
}