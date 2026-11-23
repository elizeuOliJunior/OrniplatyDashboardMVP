/**
 * Acompanhamento de clientes (Oportunidades, novo conceito de 20/10/2026). SIMULAÇÃO de protótipo, só front-end.
 * Base: claude/oportunidades-conceito-ia-decisoes-2026-10-20.md e o handoff de 20/10 (Lote A).
 *
 * - Cada cliente tem um processo POR SERVIÇO (D7): modelo, prazo, passos (mensagens), passo atual e histórico.
 * - Situação: "Precisa de você" · "A Orniplaty está cuidando" · "Resolvidos" (30 dias; depois, só na ficha).
 * - Motivo de UM caso: Faltou > Pediu preço > Retorno > Pacote > Sumiu. "Sem fechamento" não é motivo.
 * - Modo de envio (data/automationMode.ts): Automático = só exceções em "Precisa de você"; Supervisionado = cada envio
 *   dos próximos 3 dias vira "Aprovar"; Pausado = cada envio dos próximos 3 dias vira "Copiar mensagem / Marcar como chamado".
 * - Envio SEMPRE simulado. Nada chama rede. Origem do agendamento fica só aqui dentro (`origin`), nunca na tela (I4).
 *
 * G1 · subetapa 2 (25/10/2026, aprovada pelo Christian; fork 4dvp3mm8):
 * - Casos GERADOS das fontes reais do protótipo (nada de casos fixos): retornos (data/returns.ts), fechamentos com a escolha
 *   "Retorno", faltas e atendimentos sem fechamento (Agenda), "Pediu preço" (eventos de conversa, data/conversasThreads.ts),
 *   "Pacote" (VENDAS reais, data/api/pacotes.ts, com `dias-pacote` salvo em Automações) e "Sumiu" (última visita concluída,
 *   data/api/clientes.ts, com `dias` salvo em Automações). O que os antigos casos fixos afirmavam virou registro de AMOSTRA
 *   (fixtures identificadas): eventos, visitas, mensagens já enviadas (texto e data preservados), respostas e ligações.
 * - UM cartão por cliente (F-008): situação (Precisa de você > Está cuidando > Resolvidos) e depois a data (a mais antiga
 *   pendência; a próxima mensagem; o resultado mais recente). A ordem de motivos continua valendo só DENTRO de um caso.
 *   Os outros casos do cliente aparecem no painel ("Também acompanha").
 * - Desfechos por EVENTO (F-006/F-009): ligação EXPLÍCITA caso → horário (`followUpCaseId`, criada pelo "Agendar" do caso
 *   ou fixture) dá "Agendou" com a data em que o horário foi criado e, depois de atendido e PAGO, "Voltou" com a data e o
 *   valor efetivamente pagos (data/financeReaders.ts; E1/E2). Semelhança de cliente e serviço só dá "Agendou", nunca valor.
 * - Envio (F-024; W8, 12/11/2026): só nos dias e no horário que a clínica escolheu para as CAMPANHAS (IA Orniplaty ›
 *   Automações; inicial: segunda a sábado, 09:00–20:00); mensagens do mesmo cliente no mesmo dia viram UM envio (uma
 *   tentativa); uma tentativa fica sem resposta no FIM da faixa do dia de envio seguinte (E4; sábado → segunda).
 *   Duas tentativas reais seguidas sem resposta, somando os processos do cliente (E5) → "Precisa de você"; nada mais sai
 *   sozinho para esse cliente. Só uma resposta do cliente ou uma decisão explícita da clínica ("Tentar de novo") libera, e
 *   a decisão vale só para a tentativa escolhida. Programar, copiar ou aprovar NÃO é tentativa: só conta o que saiu.
 * BACKEND: nada disto existe na main lida (motor de envio, fila com tentativas, modelos, junção, origem). Ver CT-14.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { NOW, TODAY_ISO } from './agendaStore';
import type { CalAppointment } from './agendaStore';
import { getAgendaState, useAgendaData } from './agendaLive';
import { pendingClosures, useLegado } from './legado';
import { catalogProfessionals } from './catalogo';
import { clientIdOfRecordedName, clientPhone, currentClientName, isDeletedClientKey, followUpCandidates, useClientsVersion, visitSummaryOf } from './api/clientes';
import { getPackage, listPackages, useBackendVersion } from './api/pacotes';
import { clientIdFromName, contactBlockOf, kindOf, stoppedReason, stoppedTitle, useContactBlocks } from './contactPreferences';
import { textoDisponiveis } from './pacotesLib';
import { addDays, daysBetween, useReturns } from './returns';
import type { ReturnSuggestion } from './returns';
import { useSavedAutomationMode } from './automationMode';
import { MOTIVE_AUTOMATION, automacoesStore, savedSendWindows } from './automacoes';
import type { AutomationMode } from './automacoes';
import { useSavedStore } from './iaConfigStore';
import { serviceByName, useServices } from './servicesStore';
import { durationText, everyText, hasSteps, stepsFor } from './followUpModels';
import type { ModelKind, ModelLibrary, ServiceFollowUp, Step, StepWhen } from './followUpModels';
import { conversationEvents, conversationThreads, useConversations } from './conversasThreads';
import { getFinanceEntries, useFinanceEntries } from './convenios';
import { closurePayment } from './financeReaders';
import { automationsStopped, getSettings, stoppedByUsage, usageResetDm, useSettings, whatsappStopped } from './settingsStore';
import { hourText, hoursText, isWindowDay, slotAtOrAfter, windowDayFrom } from './sendWindows';
import { isClinicHoliday } from './sendHolidays';

// ─── tipos ───

export type Motive = 'faltou' | 'pediu-preco' | 'retorno' | 'pacote' | 'sumiu';
export type Situation = 'precisa' | 'cuidando' | 'resolvidos';
export type AttentionKind = 'ia-ajuda' | 'sem-resposta' | 'nao-entregue' | 'sem-fechamento' | 'aprovacao' | 'pausado';
export type OutcomeKind = 'voltou' | 'agendou' | 'encerrado' | 'nao-recebe';

export const MOTIVE_LABEL: Record<Motive, string> = {
  faltou: 'Faltou',
  'pediu-preco': 'Pediu preço',
  retorno: 'Retorno',
  pacote: 'Pacote',
  sumiu: 'Sumiu'
};
/** Ordem das pílulas e prioridade do motivo de UM caso. */
export const MOTIVES: Motive[] = ['faltou', 'pediu-preco', 'retorno', 'pacote', 'sumiu'];

export const SITUATIONS: {value: Situation;label: string;short: string;}[] = [
{ value: 'precisa', label: 'Precisa de você', short: 'Precisa' },
{ value: 'cuidando', label: 'Programados', short: 'Programados' },
{ value: 'resolvidos', label: 'Resolvidos', short: 'Resolvidos' }];


export const OUTCOME_LABEL: Record<OutcomeKind, {label: string;tone: 'success' | 'neutral' | 'warning';}> = {
  voltou: { label: 'Voltou', tone: 'success' },
  agendou: { label: 'Agendou', tone: 'success' },
  encerrado: { label: 'Encerrado', tone: 'neutral' },
  'nao-recebe': { label: stoppedTitle('retorno'), tone: 'warning' }
};

/**
 * I2 (item 13): texto do selo do desfecho.
 * L24e (19/11/2026): quem parou os avisos de retorno mostra a frase do dicionário (`stoppedTitle('retorno')`,
 * "Não recebe avisos de retorno"); o motivo vai na nota (`stoppedReason`). Saiu o selo antigo (`contactBlockLabel`).
 */
export function outcomeLabelOf(c: {clientId?: string | null;outcome?: {kind: OutcomeKind;};}): string {
  if (!c.outcome) return '';
  return OUTCOME_LABEL[c.outcome.kind].label;
}

export type MsgStatus = 'enviada' | 'programada' | 'nao-entregue' | 'parada';
export type CaseMessage = {
  n: number;
  plannedIso: string;
  status: MsgStatus;
  text?: string;
  retry?: boolean;
  when?: StepWhen;
  /** Data em que a mensagem saiu de fato (amostra = a data registrada; equipe = quando marcou como chamado). */
  sentIso?: string;
  /** Quem mandou: registro da amostra, a equipe (marcou como chamado) ou a Orniplaty (envio automático). */
  by?: 'amostra' | 'equipe' | 'orniplaty';
  /** Serviços que saem JUNTOS nesta mensagem (mesmo cliente, mesmo dia, processos diferentes). */
  group?: string[];
  /** Chaves `caso:n` das mensagens do mesmo envio agrupado (aprovar/marcar vale para todas). */
  groupKeys?: string[];
  /** P4b: data do "Marcar como chamado" que deixou esta mensagem SEM previsão (status `parada`). */
  afterCall?: string;
};
export type CaseReply = {iso: string;text: string;};
/**
 * Revisão do G1: UM fechamento pago de um horário ligado ao caso, na data em que quitou (E2) e com o valor já sem
 * reembolso (E1). "Trouxe de volta este mês" soma estes eventos um a um: o resumo do caso (`outcome`) não leva
 * pagamentos antigos para o mês do último.
 */
export type PaidEvent = {apptId: string;iso: string;value: number;refundIso?: string;};

export type BaseCase = {
  id: string;
  clientId: string;
  /**
   * Nos geradores: nome registrado (agenda, retorno, amostra). Depois de `resolve`: nome ATUAL do cadastro pelo
   * `clientId` (G1, F-001, v6); o registrado fica em `recordedName`.
   */
  clientName: string;
  /** Nome como foi registrado (texto histórico). Usado para casar com a agenda e nas mensagens já enviadas. */
  recordedName?: string;
  phone: string;
  motive: Motive | null;
  service: string;
  professionalId: string;
  /** Nome do modelo mostrado no painel. */
  model: string;
  /** Modelo do serviço (retorno). */
  modelKind?: ModelKind;
  /** Linha "Prazo" do painel. */
  deadline: string;
  /** Primeiro item do processo (o que fez a Orniplaty começar). */
  trigger: {label: string;iso: string;};
  messages: CaseMessage[];
  replies?: CaseReply[];
  /** Exceção registrada (amostra: a assistente pediu ajuda, mensagem não entregue). */
  attention?: {kind: AttentionKind;iso: string;title: string;text: string;};
  /**
   * `paidValue` (reais) = o que o cliente pagou de fato nos horários ligados ao caso (já descontado o reembolso, E1).
   * `refundIso` = data do último reembolso, quando houve. `linked` = desfecho por ligação explícita (não por semelhança).
   */
  outcome?: {kind: OutcomeKind;iso: string;apptIso?: string;paid?: boolean;paidValue?: number;refundIso?: string;linked?: boolean;note: string;payments?: PaidEvent[];};
  /** Atendimento sem fechamento (para abrir o "Fechar atendimento"). */
  appt?: {iso: string;id: string;start: string;};
  returnId?: string;
  /** Origem do agendamento, só interna (I4): nunca aparece em Conversas nem na Agenda. */
  origin: 'retorno' | 'faltou' | 'pediu-preco' | 'pacote' | 'sumiu' | 'fechamento';
};

export type FollowUpCase = BaseCase & {
  situation: Situation;
  /** Por que está em "Precisa de você" (calculado). */
  need?: {kind: AttentionKind;iso: string;title: string;text: string;};
  /** Valor do serviço no cadastro (contexto do cartão). Valor RECUPERADO é `outcome.paidValue`, nunca este. */
  value: number;
  /** Próxima mensagem (a primeira programada). */
  next?: CaseMessage;
  /**
   * B8 (ajustes do Lote B, 21/10/2026): a mensagem da campanha deste motivo ainda não foi liberada pelo WhatsApp
   * (Em análise ou Recusada). Em QUALQUER modo, nada sai sozinho: o envio vira "pronto para você mandar" (como no Pausado).
   */
  held?: boolean;
  /**
   * Nada sai sozinho (como no Pausado): a clínica desligou a assistente com as mensagens automáticas (Lote E) ou, W8
   * (12/11/2026, decisão G19), o limite do mês acabou com o uso extra desligado (`stoppedByLimit`) ou, W9a (12/11/2026,
   * J-06 e A2-22), o WhatsApp não está funcionando (`stoppedByWhatsApp`).
   */
  stopped?: boolean;
  /** W8: `stopped` por causa do limite do mês (e não porque a clínica desligou). Muda só a frase. */
  stoppedByLimit?: boolean;
  /** W9a: `stopped` porque o WhatsApp não está funcionando. Vem antes dos outros motivos enquanto durar. Muda só a frase. */
  stoppedByWhatsApp?: boolean;
  /** Cartão do cliente: os OUTROS casos dele (F-008). Só no cartão; o caso em si não tem. */
  others?: FollowUpCase[];
};

// ─── ajudantes ───

export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const firstName = (name: string) => name.split(' ')[0];
export const proName = (id: string) => catalogProfessionals.find((p) => p.value === id)?.label ?? 'a equipe';
export const proColor = (id: string) => catalogProfessionals.find((p) => p.value === id)?.color ?? '#587371';
const priceOf = (service: string) => serviceByName(service)?.price ?? 0;
const phoneOf = (clientId: string, fallback = '') => clientPhone(clientId) || fallback;

// ─── janela de envio das campanhas (F-024; funções puras, testadas sem mexer no relógio) ───

/**
 * W8 (12/11/2026): os dias e o horário das campanhas são ESCOLHA DA CLÍNICA (IA Orniplaty › Automações, salvo em
 * `automacoesStore.send.campaigns`; inicial: segunda a sábado, das 09:00 às 20:00). Não vale para respostas da assistente
 * nem para as mensagens de horário marcado, que têm a própria escolha. Feriado cadastrado em Funcionamento segura a
 * campanha quando "Enviar também em feriados" está desligado: a data programada NÃO muda, a mensagem espera o próximo dia
 * e horário de envio (`nextSendSlot`), e a tela diz que é por causa do feriado (`sendsOn`).
 */
const campaignWindow = () => savedSendWindows().campaigns;
const holidayBlocked = (iso: string) => !savedSendWindows().campaignHolidays && isClinicHoliday(iso);
export const sendStart = () => campaignWindow().start;
export const sendEnd = () => campaignWindow().end;
/** Dia da semana em que campanha pode sair (o feriado não entra aqui: ver `nextSendSlot`). */
export const isSendDay = (iso: string) => isWindowDay(campaignWindow(), iso);
/** O próprio dia, se for de envio; senão o próximo dia de envio da semana. */
export const sendDay = (iso: string) => windowDayFrom(campaignWindow(), iso);
/** Primeiro horário permitido a partir de `iso` `time`: antes do início → início; do fim em diante, dia sem envio ou feriado → próximo dia de envio, no início. */
export function nextSendSlot(iso: string, time: string): {iso: string;time: string;} {
  return slotAtOrAfter(campaignWindow(), { iso, time }, holidayBlocked);
}
/** E4: uma tentativa enviada em `sentIso` fica "sem resposta" no fim da faixa do dia de envio SEGUINTE (sábado → segunda). */
export function replyDeadline(sentIso: string): {iso: string;time: string;} {
  return { iso: windowDayFrom(campaignWindow(), addDays(sentIso, 1), holidayBlocked), time: sendEnd() };
}
const stamp = (x: {iso: string;time: string;}) => `${x.iso}T${x.time}`;
/** "Agora" do protótipo (relógio único). */
const nowStamp = () => `${TODAY_ISO}T${NOW}`;

export type Attempt = {iso: string;deadline: {iso: string;time: string;};answered: boolean;elapsed: boolean;};
/**
 * E5: tentativas do CLIENTE (somando os processos). Cada DIA com mensagem que saiu é UMA tentativa (envio agrupado).
 * Uma resposta do cliente depois da tentativa (e antes da próxima) a responde. `streak` = tentativas seguidas, no fim,
 * sem resposta e com o prazo já vencido. Puro: recebe `now` para os testes de função.
 */
export function clientAttempts(sentIsos: string[], replyIsos: string[], now: string = nowStamp()): {attempts: Attempt[];streak: number;} {
  const days = [...new Set(sentIsos)].sort();
  const replies = [...replyIsos].sort();
  const attempts = days.map((iso, i) => {
    const nextIso = days[i + 1];
    const answered = replies.some((r) => r >= iso && (!nextIso || r < nextIso));
    const deadline = replyDeadline(iso);
    return { iso, deadline, answered, elapsed: stamp(deadline) <= now };
  });
  let streak = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (a.answered) break;
    if (!a.elapsed) continue;
    streak += 1;
  }
  return { attempts, streak };
}
/** Duas tentativas reais seguidas sem resposta → "Precisa de você" (regra aprovada do G1). */
export const UNANSWERED_LIMIT = 2;

/** Janela em que um envio programado vira "Aprovar" (Supervisionado) ou "Copiar / Marcar" (Pausado). */
export const SEND_WINDOW_DAYS = 3;
/** Resolvidos ficam 30 dias na tela (CLAUDE.md, Lotes A–C). */
export const RESOLVED_DAYS = 30;

/** "a Limpeza de pele e a Drenagem linfática" (artigo pelo nome, mesma heurística do pagamento). */
const servicesSentence = (list: string[]) => {
  const named = list.map((s) => `sua ${s}`);
  return named.length <= 1 ? named.join('') : `${named.slice(0, -1).join(', ')} e ${named[named.length - 1]}`;
};

// ─── mensagens (modelos aprovados na Meta, com campos) ───

/**
 * I3 (11/11/2026, Christian): o trecho do pacote DENTRO da mensagem ao cliente vira frase natural. A linha "Prazo" do
 * painel (`deadline`: "Pacote vence em 20/10 · 3 de 6 restantes") continua igual; aqui ela é só lida, nunca copiada entre
 * parênteses. Com validade: "Você ainda tem 3 de 6 sessões de limpeza de pele no seu pacote, que vence em 20/10."
 * Sem validade ("Pacote parado desde …"): só a contagem das sessões; a data em que o pacote parou não vai para o cliente.
 * Se a linha vier em outro formato, vale a frase antiga sem números ("Você ainda tem sessões de … no seu pacote.").
 */
function packagePhrase(deadline: string, serv: string): string {
  const [head, count] = deadline.split(' · ');
  const n = /^(\d+) de (\d+) restantes?$/.exec(count ?? '');
  const due = /^Pacote vence em (\d{2}\/\d{2})$/.exec(head ?? '');
  const have = n ? `${n[1]} de ${n[2]} sessões de ${serv}` : `sessões de ${serv}`;
  return `Você ainda tem ${have} no seu pacote${due ? `, que vence em ${due[1]}` : ''}.`;
}

export function messageText(c: Pick<BaseCase, 'clientName' | 'recordedName' | 'service' | 'professionalId' | 'motive' | 'deadline' | 'modelKind'>, m: CaseMessage): string {
  if (m.text) return m.text;
  // F-024: mensagens do mesmo dia para o mesmo cliente saem juntas, citando os serviços (texto de Automações).
  if (m.group && m.group.length > 1) {
    return `Oi, ${firstName(c.clientName)}! Passando para lembrar de ${servicesSentence(m.group)}. Quer que eu veja um horário para você?`;
  }
  // Mensagem já enviada fica com o nome com que saiu; as próximas usam o nome atual.
  const nome = firstName(m.status === 'enviada' && c.recordedName ? c.recordedName : c.clientName);
  const serv = c.service.toLowerCase();
  const pro = proName(c.professionalId);
  if (m.retry) return `${nome}, tudo bem? Passando para saber se você quer agendar ${serv}. É só responder aqui.`;
  switch (c.motive) {
    case 'retorno':
      if (c.modelKind === 'serie') {
        return m.when === 'after-due' ?
        `${nome}, sua próxima sessão de ${serv} ainda não está marcada. É só responder aqui que eu vejo um horário com ${pro}.` :
        `Oi, ${nome}! Está na hora da sua próxima sessão de ${serv}. Quer que eu veja um horário com ${pro}?`;
      }
      if (c.modelKind === 'revisao') {
        return m.when === 'after-due' || m.when === 'on-due' ?
        `Oi, ${nome}! Hoje é o dia indicado para a revisão do seu ${serv}. Posso ver um horário com ${pro}?` :
        `Oi, ${nome}! Está chegando a revisão do seu ${serv} com ${pro}. Quer que eu veja um horário para você?`;
      }
      if (m.when) {
        return m.when === 'before-due' || m.when === 'after-visit' ?
        `Oi, ${nome}! Está chegando a hora do seu retorno de ${serv} com ${pro}. Quer que eu veja um horário para você?` :
        m.when === 'on-due' ?
        `Oi, ${nome}! Hoje é o dia indicado para o seu retorno de ${serv}. Posso ver um horário com ${pro}?` :
        `${nome}, ainda dá tempo de fazer o seu retorno de ${serv}. É só responder aqui que eu vejo um horário.`;
      }
      return m.n === 1 ?
      `Oi, ${nome}! Está chegando a hora do seu retorno de ${serv} com ${pro}. Quer que eu veja um horário para você?` :
      m.n === 2 ?
      `Oi, ${nome}! Hoje é o dia indicado para o seu retorno de ${serv}. Posso ver um horário com ${pro}?` :
      `${nome}, ainda dá tempo de fazer o seu retorno de ${serv}. É só responder aqui que eu vejo um horário.`;
    case 'faltou':
      return m.n === 1 ?
      `Oi, ${nome}! Sentimos sua falta no seu ${serv}. Quer remarcar? Tenho horários com ${pro} nos próximos dias.` :
      `${nome}, quer que eu veja um novo horário para o seu ${serv}?`;
    case 'pediu-preco':
      return m.n === 1 ?
      `Oi, ${nome}! Ficou alguma dúvida sobre ${serv}? Se quiser, vejo um horário para você com ${pro}.` :
      `${nome}, ainda tenho horários para ${serv} nesta semana. Quer que eu reserve um?`;
    case 'pacote':
      return m.n === 1 ?
      `Oi, ${nome}! ${packagePhrase(c.deadline, serv)} Quer agendar a próxima?` :
      `${nome}, seu pacote de ${serv} está perto de vencer. Posso ver um horário para você?`;
    default:
      return m.n === 1 ?
      `Oi, ${nome}! Faz um tempo que você não vem. ${pro} tem horários para ${serv} nas próximas semanas. Quer que eu veja um para você?` :
      `${nome}, ainda dá tempo de garantir seu horário este mês. É só responder aqui.`;
  }
}


// ─── histórico da AMOSTRA (fixtures identificadas; coerente com a Agenda de exemplo, relógio 01/10/2026) ───

/**
 * G1 subetapa 2: o que os antigos casos fixos já AFIRMAVAM, agora como registro ligado ao caso GERADO pelo id estável.
 * Mensagens já enviadas guardam o TEXTO e a DATA com que saíram (AQ-05): o texto abaixo é exatamente o que a tela mostrava
 * antes (inclusive o da Ana, que dizia "2 sessões sem usar" quando o pacote pk3 tem 3: o texto enviado não é reescrito).
 * O caso em si (motivo, serviço, prazo, situação) vem sempre das fontes reais.
 * R1b (06/11/2026, Christian, A-44): Priscila — resposta registrada e aviso iguais à conversa (data/conversasThreads.ts):
 * ela quer um sábado que não seja o 10/10; a assistente não pode abrir outro sábado e pediu ajuda.
 */
type SampleHistory = {messages: CaseMessage[];replies?: CaseReply[];attention?: BaseCase['attention'];};
const sent = (n: number, iso: string, text: string, extra: Partial<CaseMessage> = {}): CaseMessage => ({ n, plannedIso: iso, status: 'enviada', sentIso: iso, by: 'amostra', text, ...extra });
const SAMPLE_HISTORY: Record<string, SampleHistory> = {
  'fu-preco-amostra-conv-priscila-0915': {
    messages: [
    sent(1, '2026-09-16', 'Oi, Priscila! Ficou alguma dúvida sobre a Limpeza de pele? Se quiser, vejo um horário pra você com a Juliana.'),
    sent(2, '2026-09-18', 'Priscila, ainda tenho horários para limpeza de pele nesta semana. Quer que eu reserve um?')],

    replies: [{ iso: '2026-09-30', text: 'Nesse dia não consigo. Não tem outro sábado?' }],
    attention: {
      kind: 'ia-ajuda',
      iso: '2026-09-30',
      title: 'A assistente pediu ajuda na conversa',
      text: 'Ela quer um sábado de manhã que não seja 10/10 (o único sábado com atendimento). A assistente não pode abrir outro sábado e pediu a sua ajuda.'
    }
  },
  'fu-preco-amostra-conv-rodrigo-0929': {
    messages: [
    { n: 1, plannedIso: '2026-09-30', status: 'nao-entregue', by: 'amostra', text: 'Oi, Rodrigo! Ficou alguma dúvida sobre drenagem linfática? Se quiser, vejo um horário para você com Juliana.' },
    { n: 2, plannedIso: '2026-10-02', status: 'parada' }],

    attention: {
      kind: 'nao-entregue',
      iso: '2026-09-30',
      title: 'Mensagem não entregue',
      text: 'O WhatsApp não entregou a mensagem de 30/09. O número pode estar errado ou sem WhatsApp.'
    }
  },
  // W4 (11/11/2026, A2-01): a equipe mandou a 1ª mensagem do pacote em 30/09 (envios pausados) e a Helena respondeu no mesmo
  // dia. Mesmo texto e mesmas datas da conversa (data/conversasThreads.ts). Nada mais sai sozinho: a conversa segue com ela.
  'fu-pacote-pk5': {
    messages: [sent(1, '2026-09-30', 'Oi, Helena! Você ainda tem sessões de peeling químico no seu pacote. Quer agendar a próxima? A Dra. Carolina tem horários nesta semana.', { by: 'equipe' })],
    replies: [{ iso: '2026-09-30', text: 'Oi! Quero sim. Tem horário na semana que vem, de manhã?' }]
  },
  'fu-sumiu-larissa-campos-2026-07-15': {
    messages: [
    sent(1, '2026-09-14', 'Oi, Larissa! Faz um tempo que você não vem. Dra. Carolina tem horários para limpeza de pele nas próximas semanas. Quer que eu veja um para você?'),
    sent(2, '2026-09-21', 'Larissa, ainda dá tempo de garantir seu horário este mês. É só responder aqui.')]

  },
  'fu-pacote-pk3': {
    messages: [
    sent(1, '2026-08-11', 'Oi, Ana! Você ainda tem sessões de limpeza de pele no seu pacote (pacote parado desde 12/07 · 2 sessões sem usar). Quer agendar a próxima?'),
    sent(2, '2026-08-18', 'Ana, seu pacote de limpeza de pele está perto de vencer. Posso ver um horário para você?'),
    sent(3, '2026-09-24', 'Ana, tudo bem? Passando para saber se você quer agendar limpeza de pele. É só responder aqui.', { retry: true })],

    replies: [{ iso: '2026-09-25', text: 'Quero sim! Pode ser dia 1º às 9h?' }]
  },
  'fu-ret-amostra-carla-0831': {
    messages: [sent(1, '2026-09-25', 'Oi, Carla! Está chegando a hora do seu retorno de limpeza de pele com Juliana. Quer que eu veja um horário para você?')],
    replies: [{ iso: '2026-09-25', text: 'Pode ser quinta às 8h?' }]
  }
};

// ─── ações da clínica (memória da sessão) ───

type Overlay = {
  /** Vou ligar / Encerrar (com motivo) / Parar → Resolvidos. */
  closed: Record<string, {iso: string;note: string;}>;
  /** Tentar de novo em X dias → UMA nova tentativa autorizada pela clínica. */
  retries: Record<string, string>;
  /** Supervisionado: mensagens aprovadas (`caseId:n`). Aprovar NÃO é enviar. */
  approved: Record<string, true>;
  /** Pausado/segurado: mensagens que a equipe mandou por fora e marcou como chamadas (`caseId:n` → data). Conta como tentativa. */
  called: Record<string, string>;
  /** Lote A (21/10/2026): a clínica respondeu na conversa um caso "a assistente pediu ajuda" (data). */
  answered: Record<string, string>;
};
type OverlayField = keyof Overlay;
let overlay: Overlay = { closed: {}, retries: {}, approved: {}, called: {}, answered: {} };
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function setOverlay(next: Overlay) {
  overlay = next;
  version += 1;
  listeners.forEach((l) => l());
}
/**
 * F-025: "Desfazer" de UMA ação. Restaura só as chaves que a ação mudou (não o estado inteiro): desfazer um aviso antigo
 * não apaga ações feitas depois dele.
 */
function change(entries: {field: OverlayField;key: string;value: unknown;}[]): () => void {
  const prev = entries.map((e) => ({ ...e, had: e.key in overlay[e.field], old: (overlay[e.field] as Record<string, unknown>)[e.key] }));
  const next = { ...overlay } as Record<OverlayField, Record<string, unknown>>;
  entries.forEach((e) => next[e.field] = { ...next[e.field], [e.key]: e.value });
  setOverlay(next as Overlay);
  return () => {
    const back = { ...overlay } as Record<OverlayField, Record<string, unknown>>;
    prev.forEach((p) => {
      const copy = { ...back[p.field] };
      if (p.had) copy[p.key] = p.old;else
      delete copy[p.key];
      back[p.field] = copy;
    });
    setOverlay(back as Overlay);
  };
}
const msgKey = (caseId: string, n: number) => `${caseId}:${n}`;
/** Chaves de todas as mensagens do mesmo envio agrupado (aprovar/marcar uma = o envio inteiro). */
const keysOf = (c: FollowUpCase, m: CaseMessage) => m.groupKeys ?? [msgKey(c.id, m.n)];

export function closeCase(c: FollowUpCase, note: string) {
  return change([{ field: 'closed', key: c.id, value: { iso: TODAY_ISO, note } }]);
}
export function retryCase(c: FollowUpCase, days: number) {
  const iso = sendDay(addDays(TODAY_ISO, days));
  return { undo: change([{ field: 'retries', key: c.id, value: iso }]), iso };
}
export function approveMessages(list: FollowUpCase[]) {
  return change(list.flatMap((c) => c.next ? keysOf(c, c.next).map((key) => ({ field: 'approved' as const, key, value: true })) : []));
}
/**
 * Lote A (21/10/2026, decisão do Christian): depois que a clínica responde na conversa, o caso "a assistente pediu ajuda"
 * sai de "Precisa de você" e vai para "A Orniplaty está cuidando". F-025: o caso NÃO fica preso ali: o cartão e o painel
 * oferecem "Agendar" (caminho da Agenda) e "Encerrar" com motivo.
 */
export function markAnswered(c: FollowUpCase) {
  return change([{ field: 'answered', key: c.id, value: TODAY_ISO }]);
}
export const answeredOn = (caseId: string) => overlay.answered[caseId];
/**
 * W4 (11/11/2026, A2-05): um pedido de ajuda é UM assunto só. Responder na tela Conversas (não só no painel de
 * Oportunidades) também tira o caso de “Precisa de você”: vale a primeira mensagem da equipe na conversa do cliente no dia
 * do pedido ou depois. Derivado da conversa (fonte única), nada é gravado.
 */
function teamAnsweredOn(clientId: string, sinceIso: string): string | undefined {
  const m = (conversationThreads[clientId] ?? []).find((x) => x.sender === 'team' && (x.day ?? TODAY_ISO) >= sinceIso);
  return m ? m.day ?? TODAY_ISO : undefined;
}
/** Data em que a equipe respondeu um caso “a assistente pediu ajuda” (no painel ou em Conversas). */
export function answeredIsoOf(c: Pick<BaseCase, 'id' | 'clientId' | 'attention'>): string | undefined {
  if (overlay.answered[c.id]) return overlay.answered[c.id];
  return c.attention?.kind === 'ia-ajuda' ? teamAnsweredOn(c.clientId, c.attention.iso) : undefined;
}

/**
 * "Marcar como chamado": a equipe mandou por fora. Conta como tentativa enviada hoje (vale para o envio agrupado inteiro).
 * P4b (decisão do Christian, 28/10/2026): o caso sai de "Precisa de você" (vai para "Está cuidando", aguardando a resposta)
 * e a mensagem automática seguinte NÃO fica prevista (`withActions`). Sem resposta até o prazo, volta para "Precisa de você".
 */
export function markCalled(c: FollowUpCase) {
  if (!c.next) return () => {};
  return change(keysOf(c, c.next).map((key) => ({ field: 'called' as const, key, value: TODAY_ISO })));
}

// ─── Fechar atendimento › Retorno (Lote B) ───

export type ReturnChoice = 'ja-marcado' | 'nao-marcado' | 'nao-precisa';
export type Closure = {
  key: string;
  /** Nome escrito no agendamento fechado (texto histórico; casa com a agenda). */
  clientName: string;
  /** G1 (F-001, v7): id do cadastro no momento do fechamento; a ficha procura o fechamento por ele. */
  clientId: string | null;
  iso: string;
  time: string;
  /** Procedimento REALIZADO (vale ele, não o agendado). */
  service: string;
  choice: ReturnChoice;
  /** Prazo só para este cliente (nulo = padrão do serviço). */
  dueDays: number | null;
};
let closures: Record<string, Closure> = {};
export const closureKey = (iso: string, time: string, clientName: string) => `${iso}|${time}|${clientName}`;
/** Registra a escolha "Retorno" do Fechar atendimento (memória da sessão). */
export function registerClosure(c: Omit<Closure, 'key' | 'clientId'>) {
  const key = closureKey(c.iso, c.time, c.clientName);
  closures = { ...closures, [key]: { ...c, key, clientId: clientIdOfRecordedName(c.clientName) } };
  version += 1;
  listeners.forEach((l) => l());
}
/** Fechamentos com a escolha "Retorno" de um cliente, pelo id do cadastro (Ficha › Acompanhamento). Use junto com `useFollowUp` para atualizar. */
export const closuresOf = (clientId: string) => Object.values(closures).filter((c) => c.clientId === clientId);

/**
 * G1 (F-001, v7): id do caso gerado da agenda, dos retornos ou dos fechamentos = o cliente do cadastro que tem (ou já
 * teve) o nome escrito no agendamento, inclusive clientes criados na tela (`cli-…`). Só quando o cliente não está mais no
 * cadastro (excluído) fica a chave antiga pelo nome, a mesma de antes, para o caso continuar ligado à conversa e ao pedido
 * de saída já registrados; nenhum cliente é criado com ela.
 */
const caseClientId = (recordedName: string) => clientIdOfRecordedName(recordedName) ?? clientIdFromName(recordedName);

// ─── montagem ───

type Appts = Record<string, CalAppointment[]>;
const allAppts = (a: Appts) => Object.entries(a).flatMap(([iso, list]) => list.map((x) => ({ iso, a: x })));
const isOpen = (a: CalAppointment) => a.status !== 'cancelled' && a.status !== 'no_show' && a.status !== 'completed';

/**
 * Próximo horário aberto do mesmo cliente e serviço depois de uma data (SEMELHANÇA: só serve para "Agendou").
 * Ignora horários ligados explicitamente a OUTRO caso (um horário nunca é creditado a dois casos).
 */
export function nextBooking(appointments: Appts, clientName: string, service: string, afterIso: string, caseId?: string) {
  return allAppts(appointments).
  filter(
    (y) =>
    y.a.clientName === clientName &&
    y.a.service.toLowerCase() === service.toLowerCase() &&
    isOpen(y.a) &&
    y.iso > afterIso && (
    !y.a.followUpCaseId || y.a.followUpCaseId === caseId)
  ).
  sort((p, q) => (p.iso + p.a.start).localeCompare(q.iso + q.a.start))[0];
}

/** Quantas sessões do serviço o cliente já concluiu até a data (Série de sessões). */
function sessionsDone(appointments: Appts, clientName: string, service: string, uptoIso: string) {
  return allAppts(appointments).filter((y) => y.a.clientName === clientName && y.a.service.toLowerCase() === service.toLowerCase() && y.a.status === 'completed' && y.iso <= uptoIso).length;
}

function stepIso(step: Step, sourceIso: string, dueIso: string) {
  if (step.when === 'after-visit') return addDays(sourceIso, 1);
  if (step.when === 'before-due') return addDays(dueIso, -(step.days ?? 0));
  if (step.when === 'after-due') return addDays(dueIso, step.days ?? 0);
  return dueIso;
}

export type ReturnPlan = {modelKind: ModelKind;model: string;deadline: string;dueIso: string;dueDays: number;messages: CaseMessage[];};

/**
 * Processo de retorno de UM atendimento pelo modelo do serviço. Nulo = não há o que acompanhar (Sem retorno, Recorrente fixo,
 * prazo do profissional em branco, série sem Manutenção depois).
 * Passos: na ordem das datas; nunca no mesmo dia do atendimento nem antes de `notBefore` (fechamento); domingo vai para
 * segunda; respeita o máximo do modelo.
 */
export function planReturn(f: ServiceFollowUp, sourceIso: string, dueOverride: number | null, lib: ModelLibrary, done = 1, notBefore?: string): ReturnPlan | null {
  if (!hasSteps(f.model)) return null;
  let kind: ModelKind = f.model;
  let due = dueOverride ?? f.dueDays;
  let steps = f.steps;
  let model = '';
  if (f.model === 'serie') {
    const total = f.sessions ?? 1;
    if (done >= total) {
      if (!f.afterSeriesDays) return null;
      kind = 'manutencao';
      due = dueOverride ?? f.afterSeriesDays;
      steps = stepsFor('manutencao', due, lib);
      model = `Série terminou: volta a cada ${durationText(due)}`;
    } else {
      model = `Sessão ${done} de ${total}, ${everyText(due ?? 7)}`;
    }
  }
  if (!due || due <= 0) return null;
  const dueIso = addDays(sourceIso, due);
  // Ajustes do Lote B (21/10/2026): linguagem simples, sem o nome técnico do modelo.
  if (!model) model = kind === 'revisao' ? `Revisão ${durationText(due)} depois` : kind === 'profissional' ? `Volta em ${durationText(due)} (o profissional decidiu)` : `Volta a cada ${durationText(due)}`;
  const max = lib[kind].maxSteps;
  // Fechamento feito com atraso: nenhum passo fica no passado (nada foi enviado antes do fechamento).
  const afterVisit = addDays(sourceIso, 1);
  const earliest = notBefore && notBefore > afterVisit ? notBefore : afterVisit;
  const seen = new Set<string>();
  const planned = steps.
  slice(0, max).
  map((st) => {
    const raw = stepIso(st, sourceIso, dueIso);
    return { iso: sendDay(raw < earliest ? earliest : raw), when: st.when };
  }).
  sort((a, b) => a.iso.localeCompare(b.iso)).
  filter((x) => seen.has(x.iso) ? false : (seen.add(x.iso), true));
  // G1 (F-024): planejar NÃO é enviar. Só vira 'enviada' o que saiu de fato (registro da amostra ou marcado pela equipe).
  const messages = planned.map((x, i) => ({ n: i + 1, plannedIso: x.iso, when: x.when, status: 'programada' as MsgStatus }));
  const deadline = kind === 'serie' ? `Próxima sessão em ${shortDate(dueIso)}` : kind === 'revisao' ? `Revisão em ${shortDate(dueIso)}` : `Retorno em ${shortDate(dueIso)}`;
  return { modelKind: kind, model, deadline, dueIso, dueDays: due, messages };
}

/** Prévia do Fechar atendimento: o que a Orniplaty vai fazer com este cliente. */
export function previewReturn(serviceLabel: string, clientName: string, sourceIso: string, dueOverride: number | null) {
  const svc = serviceByName(serviceLabel);
  if (!svc) return null;
  const { appointments } = getAgendaState();
  // O atendimento que está sendo fechado conta como sessão concluída.
  const done = sessionsDone(appointments, clientName, serviceLabel, addDays(sourceIso, -1)) + 1;
  return planReturn(svc.followUp, sourceIso, dueOverride, automacoesStore.get().models, done, TODAY_ISO);
}


/**
 * Sessão de pacote segue só a regra do Pacote (D9). G1 (F-001/F-002): lê as VENDAS de data/api/pacotes.ts — pacote ativo
 * com saldo para o mesmo serviço. Vender, congelar ou cancelar um pacote muda Oportunidades na hora.
 */
function hasActivePackage(clientId: string, service: string) {
  const svc = serviceByName(service);
  return listPackages({ client_id: clientId }).some((p) => p.status === 'active' && p.saldo > 0 && (svc ? p.service_id === svc.id : p.service_name_snapshot.toLowerCase() === service.toLowerCase()));
}

/** Casos com histórico registrado (amostra ou ação da clínica) não somem quando a regra muda: o que foi enviado fica. */
const hasRecordedHistory = (caseId: string) => !!SAMPLE_HISTORY[caseId] || Object.keys(overlay.called).some((k) => k.startsWith(`${caseId}:`));

/**
 * R3 (06/11/2026, Christian, A-03/D4): "sai e recomeça", SÓ para o MESMO serviço. Atendimento CONCLUÍDO do mesmo cliente e
 * serviço depois do atendimento de origem e no dia ou depois da 1ª mensagem prevista. O processo novo já nasce desse
 * atendimento (retorno novo em data/returns.ts ou fechamento); aqui só o processo antigo é encerrado (nada é apagado).
 */
function sameServiceVisitAfter(appointments: Appts, clientName: string, service: string, sourceIso: string, sourceTime: string, firstPlannedIso?: string) {
  if (!firstPlannedIso) return undefined;
  return allAppts(appointments).find(
    (y) => y.a.clientName === clientName && y.a.service.toLowerCase() === service.toLowerCase() && y.a.status === 'completed' && y.iso + y.a.start > sourceIso + sourceTime && y.iso >= firstPlannedIso
  );
}
/** R3 (06/11/2026, Christian, A-03/D4): desfecho do processo antigo (texto visível em Resolvidos e no processo). */
const restartedOutcome = (service: string, iso: string) => ({ kind: 'encerrado' as const, iso, note: `voltou para ${service.toLowerCase()} em ${shortDate(iso)}; o retorno recomeçou desse atendimento` });

function fromReturns(items: ReturnSuggestion[], appointments: Appts, lib: ModelLibrary): BaseCase[] {
  // Um processo por cliente e serviço (D7): fica o atendimento mais recente. Os mais antigos só continuam quando têm
  // histórico registrado ou horário ligado a eles (é o desfecho deles, ex.: a Carla de 31/08 que voltou em 01/10).
  const latest = new Map<string, ReturnSuggestion>();
  items.forEach((r) => {
    const k = `${r.clientName}|${r.serviceLabel}`;
    const cur = latest.get(k);
    if (!cur || r.sourceIso > cur.sourceIso) latest.set(k, r);
  });
  const linkedIds = new Set(allAppts(appointments).map((x) => x.a.followUpCaseId).filter(Boolean) as string[]);
  const keep = items.filter((r) => latest.get(`${r.clientName}|${r.serviceLabel}`) === r || hasRecordedHistory(`fu-${r.id}`) || linkedIds.has(`fu-${r.id}`));
  return keep.flatMap((r) => {
    // O que foi fechado com a escolha "Retorno" segue `fromClosures`.
    if (closures[closureKey(r.sourceIso, r.sourceStart, r.clientName)]) return [];
    const clientId = caseClientId(r.clientName);
    if (hasActivePackage(clientId, r.serviceLabel)) return [];
    const svc = serviceByName(r.serviceLabel);
    if (!svc) return [];
    // Data mudada à mão em Clientes › Retornos continua valendo.
    const override = r.manualEdit ? daysBetween(r.sourceIso, r.recommendedIso) : null;
    const plan = planReturn(svc.followUp, r.sourceIso, override, lib, sessionsDone(appointments, r.clientName, r.serviceLabel, r.sourceIso));
    if (!plan) return [];
    const base: BaseCase = {
      id: `fu-${r.id}`,
      clientId,
      clientName: r.clientName,
      phone: '',
      motive: 'retorno',
      service: r.serviceLabel,
      professionalId: r.professionalId,
      model: plan.model,
      modelKind: plan.modelKind,
      deadline: plan.deadline,
      trigger: { label: 'Atendimento', iso: r.sourceIso },
      messages: plan.messages,
      returnId: r.id,
      origin: 'retorno'
    };
    if (r.status === 'scheduled' && r.scheduledIso) {
      const hit = allAppts(appointments).find((x) => x.a.id === r.scheduledApptId);
      return [{ ...base, outcome: { kind: 'agendou' as const, iso: hit?.a.createdIso ?? r.scheduledIso, apptIso: r.scheduledIso, note: `${r.serviceLabel} em ${shortDate(r.scheduledIso)}` } }];
    }
    if (r.status === 'dismissed' || r.status === 'handled') return [{ ...base, outcome: { kind: 'encerrado' as const, iso: TODAY_ISO, note: 'encerrado por você' } }];
    // R3 (06/11/2026, Christian, A-03/D4): sem histórico, o processo antigo já sai pelo "fica o mais recente" acima. Com
    // histórico registrado (ex.: "Marcar como chamado"), ele ficava ativo: agora encerra. Ligação explícita (linkOutcome) prevalece.
    const back = sameServiceVisitAfter(appointments, r.clientName, r.serviceLabel, r.sourceIso, r.sourceStart, plan.messages[0]?.plannedIso);
    if (back) return [{ ...base, outcome: restartedOutcome(r.serviceLabel, back.iso) }];
    return [base];
  });
}

/** Atendimentos fechados com a escolha "Retorno" (Lote B). */
function fromClosures(appointments: Appts, lib: ModelLibrary): BaseCase[] {
  const all = allAppts(appointments);
  return Object.values(closures).flatMap((cl) => {
    if (cl.choice === 'nao-precisa') return [];
    const src = all.find((x) => x.iso === cl.iso && x.a.start === cl.time && x.a.clientName === cl.clientName);
    // Fechamento desfeito ou atendimento reaberto: nada a acompanhar.
    if (src && src.a.status !== 'completed') return [];
    const clientId = cl.clientId ?? caseClientId(cl.clientName);
    if (hasActivePackage(clientId, cl.service)) return [];
    const svc = serviceByName(cl.service);
    if (!svc) return [];
    const id = `fu-fechamento-${cl.key}`;
    const later = nextBooking(appointments, cl.clientName, cl.service, cl.iso, id);
    // "Já marcado" com horário de verdade: não entra em Oportunidades. Sem horário (agendamento cancelado ou não feito): vira "Não marcado".
    if (cl.choice === 'ja-marcado' && later) return [];
    const plan = planReturn(svc.followUp, cl.iso, cl.dueDays, lib, sessionsDone(appointments, cl.clientName, cl.service, cl.iso), TODAY_ISO);
    if (!plan) return [];
    const base: BaseCase = {
      id,
      clientId,
      clientName: cl.clientName,
      phone: '',
      motive: 'retorno',
      service: cl.service,
      professionalId: src?.a.professionalId ?? '',
      model: plan.model,
      modelKind: plan.modelKind,
      deadline: plan.deadline,
      trigger: { label: 'Atendimento fechado', iso: cl.iso },
      messages: plan.messages,
      origin: 'retorno'
    };
    // R3 (06/11/2026, Christian, A-03/D4): voltou para o mesmo serviço depois da 1ª mensagem prevista → encerra; o novo fechamento recomeça.
    const back = later ? undefined : sameServiceVisitAfter(appointments, cl.clientName, cl.service, cl.iso, cl.time, plan.messages[0]?.plannedIso);
    if (back) return [{ ...base, outcome: restartedOutcome(cl.service, back.iso) }];
    return [later ? { ...base, outcome: { kind: 'agendou' as const, iso: later.a.createdIso ?? later.iso, apptIso: later.iso, note: `${cl.service} em ${shortDate(later.iso)}` } } : base];
  });
}

function fromAgenda(appointments: Appts): BaseCase[] {
  const all = allAppts(appointments);
  const out: BaseCase[] = [];
  // Faltou (últimos 14 dias): no mesmo dia, depois +1 dia.
  all.
  filter((x) => x.a.status === 'no_show' && x.iso >= addDays(TODAY_ISO, -14) && x.iso <= TODAY_ISO).
  forEach(({ iso, a }) => {
    const clientId = caseClientId(a.clientName);
    const id = `fu-falta-${a.id}`;
    const plan = [sendDay(iso), sendDay(addDays(iso, 1))];
    const later = nextBooking(appointments, a.clientName, a.service, iso, id);
    out.push({
      id,
      clientId,
      clientName: a.clientName,
      phone: '',
      motive: 'faltou',
      service: a.service,
      professionalId: a.professionalId,
      model: '2 mensagens para remarcar',
      deadline: `Faltou em ${shortDate(iso)}, às ${a.start}`,
      trigger: { label: 'Faltou ao atendimento', iso },
      messages: [...new Set(plan)].map((p, i) => ({ n: i + 1, plannedIso: p, status: 'programada' as MsgStatus })),
      outcome: later ? { kind: 'agendou', iso: later.a.createdIso ?? later.iso, apptIso: later.iso, note: `${a.service} em ${shortDate(later.iso)}` } : undefined,
      origin: 'faltou'
    });
  });
  // Atendimento sem fechamento há mais de 1 dia.
  pendingClosures(appointments).
  filter((p) => p.iso <= addDays(TODAY_ISO, -1)).
  forEach(({ iso, appt }) => {
    out.push({
      id: `fu-fech-${appt.id}`,
      clientId: caseClientId(appt.clientName),
      clientName: appt.clientName,
      phone: '',
      motive: null,
      service: appt.service,
      professionalId: appt.professionalId,
      model: 'Depende do fechamento',
      deadline: `Atendimento em ${shortDate(iso)}, às ${appt.start}`,
      trigger: { label: 'Atendimento marcado', iso },
      messages: [],
      attention: {
        kind: 'sem-fechamento',
        iso,
        // R2 (06/11/2026, A-04): texto pelo dia real ("desde ontem" / "desde 28/09"), não "há mais de 1 dia".
        title: `Atendimento sem fechamento desde ${iso === addDays(TODAY_ISO, -1) ? 'ontem' : shortDate(iso)}`,
        text: `O ${appt.service.toLowerCase()} de ${shortDate(iso)}, às ${appt.start}, ainda não foi fechado. Sem o fechamento, a Orniplaty não sabe se precisa chamar para o retorno.`
      },
      appt: { iso, id: appt.id, start: appt.start },
      origin: 'fechamento'
    });
  });
  return out;
}

/** F-009 "Pediu preço": eventos de conversa (pediu preço ou horário e não marcou). 1 dia depois e, sem resposta, 2 dias depois. */
function fromConversationEvents(appointments: Appts): BaseCase[] {
  return conversationEvents.flatMap((ev) => {
    const name = currentClientName(ev.clientId, ev.clientId);
    const id = `fu-preco-${ev.id}`;
    const first = sendDay(addDays(ev.iso, 1));
    const second = sendDay(addDays(first, 2));
    const later = nextBooking(appointments, name, ev.service, ev.iso, id);
    const preco = ev.kind === 'pediu-preco';
    return [
    {
      id,
      clientId: ev.clientId,
      clientName: name,
      phone: '',
      motive: 'pediu-preco' as const,
      service: ev.service,
      professionalId: ev.professionalId,
      model: '2 mensagens depois do pedido',
      deadline: `${preco ? 'Pediu o preço' : 'Pediu horário'} em ${shortDate(ev.iso)}`,
      trigger: { label: preco ? 'Pediu preço no WhatsApp' : 'Pediu horário no WhatsApp', iso: ev.iso },
      messages: [first, second].map((p, i) => ({ n: i + 1, plannedIso: p, status: 'programada' as MsgStatus })),
      outcome: later ? { kind: 'agendou' as const, iso: later.a.createdIso ?? later.iso, apptIso: later.iso, note: `${ev.service} em ${shortDate(later.iso)}` } : undefined,
      origin: 'pediu-preco' as const
    }];

  });
}

/**
 * F-002/F-009 "Pacote": VENDAS reais (listPackages) ativas e com saldo. A 1ª mensagem sai `dias-pacote` dias (Automações) depois
 * da última sessão usada (ou da venda); a 2ª, 7 dias depois. Nenhuma mensagem depois do vencimento. Não oferece compra nem preço.
 */
function fromPackages(appointments: Appts, values: Record<string, number>): BaseCase[] {
  const dias = values['dias-pacote'] ?? 30;
  return listPackages().flatMap((p) => {
    if (p.status !== 'active' || p.saldo <= 0) return [];
    const ledger = getPackage(p.id).ledger;
    const used = ledger.filter((l) => l.entry_type === 'consumption' && !l.reversed_at && l.appointment_date).map((l) => l.appointment_date as string).sort();
    const last = used[used.length - 1] ?? p.sold_at;
    const id = `fu-pacote-${p.id}`;
    const first = sendDay(addDays(last, dias));
    const dates = [first, sendDay(addDays(first, 7))].filter((d) => !p.expires_at || d <= p.expires_at);
    if (dates.length === 0 && !hasRecordedHistory(id)) return [];
    const name = currentClientName(p.client_id, p.client_name);
    const later = nextBooking(appointments, name, p.service_name_snapshot, last, id);
    // I2 (item 13): sessões contadas como no resto do Painel, "N de M restantes" (`textoDisponiveis`, W5 A4-11).
    const sessions = textoDisponiveis(p);
    return [
    {
      id,
      clientId: p.client_id,
      clientName: name,
      phone: '',
      motive: 'pacote' as const,
      service: p.service_name_snapshot,
      professionalId: p.preferred_professional_id ?? '',
      model: '2 mensagens sobre o pacote',
      deadline: p.expires_at ? `Pacote vence em ${shortDate(p.expires_at)} · ${sessions}` : `Pacote parado desde ${shortDate(last)} · ${sessions}`,
      trigger: { label: used.length ? 'Última sessão do pacote' : 'Venda do pacote', iso: last },
      messages: dates.map((d, i) => ({ n: i + 1, plannedIso: d, status: 'programada' as MsgStatus })),
      outcome: later ? { kind: 'agendou' as const, iso: later.a.createdIso ?? later.iso, apptIso: later.iso, note: `${p.service_name_snapshot} em ${shortDate(later.iso)}` } : undefined,
      origin: 'pacote' as const
    }];

  });
}

/**
 * F-009 "Sumiu": cliente do cadastro cuja última visita CONCLUÍDA tem `dias` dias ou mais (Automações), sem horário futuro.
 * Quem nunca teve atendimento concluído registrado não entra (não há visita para medir). 1ª mensagem no dia em que completa
 * `dias`; a 2ª, 7 dias depois.
 */
function fromInactive(appointments: Appts, values: Record<string, number>): BaseCase[] {
  const dias = values.dias ?? 60;
  return followUpCandidates().flatMap((cl) => {
    const { last, hasFuture } = visitSummaryOf(cl.id, appointments);
    if (!last) return [];
    // W4 (11/11/2026, G3 / combinado 1): cancelamento feito pela CLÍNICA nunca vira “Sumiu”. `cancelledBy` é escrito pela
    // faixa W3 ('client' | 'clinic'); pode faltar (amostra antiga), então só 'clinic' explícito conta.
    const clinicCancelled = allAppts(appointments).some(
      (x) => x.iso > last.iso && x.a.status === 'cancelled' && (x.a as {cancelledBy?: string;}).cancelledBy === 'clinic' && caseClientId(x.a.clientName) === cl.id
    );
    if (clinicCancelled) return [];
    const id = `fu-sumiu-${cl.id}-${last.iso}`;
    const qualifies = daysBetween(last.iso, TODAY_ISO) >= dias && !hasFuture;
    if (!qualifies && !hasRecordedHistory(id)) return [];
    const first = sendDay(addDays(last.iso, dias));
    return [
    {
      id,
      clientId: cl.id,
      clientName: cl.name,
      phone: '',
      motive: 'sumiu' as const,
      service: last.service,
      professionalId: last.professionalId,
      model: `Sem visita há mais de ${dias} dias`,
      deadline: `Sem visita desde ${shortDate(last.iso)}`,
      trigger: { label: 'Último atendimento', iso: last.iso },
      messages: [first, sendDay(addDays(first, 7))].map((d, i) => ({ n: i + 1, plannedIso: d, status: 'programada' as MsgStatus })),
      origin: 'sumiu' as const
    }];

  });
}

/** Histórico da amostra no lugar do plano (mensagens enviadas, respostas e exceção registradas). */
function withHistory(b: BaseCase): BaseCase {
  const h = SAMPLE_HISTORY[b.id];
  if (!h) return b;
  return { ...b, messages: h.messages, replies: h.replies ?? b.replies, attention: h.attention ?? b.attention };
}

/**
 * F-006: desfecho pela ligação EXPLÍCITA caso → horário (`followUpCaseId`). Horário atendido e PAGO → "Voltou", com a data
 * em que o fechamento quitou e o valor pago (reembolso descontado, E1; convênio só quando quitado, E2). Horário aberto ou
 * atendido sem pagamento registrado → "Agendou". Falta ou cancelamento: a ligação não conta e o caso segue.
 */
export function linkOutcome(b: BaseCase, appointments: Appts): BaseCase {
  const linked = allAppts(appointments).filter((x) => x.a.followUpCaseId === b.id && x.a.status !== 'cancelled' && x.a.status !== 'no_show');
  if (linked.length === 0) return b;
  const entries = getFinanceEntries();
  const paid = linked.
  filter((x) => x.a.status === 'completed').
  map((x) => {
    const e = entries.find((f) => f.appointmentId ? f.appointmentId === x.a.id : f.iso === x.iso && f.time === x.a.start && f.clientName === x.a.clientName);
    return e ? { x, p: closurePayment(e) } : null;
  }).
  filter((v): v is {x: {iso: string;a: CalAppointment;};p: ReturnType<typeof closurePayment>;} => !!v && v.p.qualifies);
  if (paid.length > 0) {
    const cents = paid.reduce((t, v) => t + v.p.paidCents, 0);
    const iso = paid.map((v) => v.p.settledIso as string).sort().slice(-1)[0];
    const refundIso = paid.map((v) => v.p.lastRefundIso).filter(Boolean).sort().slice(-1)[0] ?? undefined;
    const first = paid[0].x;
    const payments: PaidEvent[] = paid.map((v) => ({ apptId: v.x.a.id, iso: v.p.settledIso as string, value: v.p.paidCents / 100, refundIso: v.p.lastRefundIso ?? undefined }));
    return {
      ...b,
      outcome: {
        kind: 'voltou',
        iso,
        apptIso: first.iso,
        paid: true,
        paidValue: cents / 100,
        refundIso,
        linked: true,
        payments,
        note: `Atendido e pago em ${shortDate(iso)}${refundIso ? ` · valor atualizado por reembolso em ${shortDate(refundIso)}` : ''}`
      }
    };
  }
  const x = linked.sort((p, q) => (p.iso + p.a.start).localeCompare(q.iso + q.a.start))[0];
  const done = x.a.status === 'completed';
  return {
    ...b,
    outcome: {
      kind: 'agendou',
      iso: x.a.createdIso ?? x.iso,
      apptIso: x.iso,
      linked: true,
      note: done ? `${x.a.service} atendido em ${shortDate(x.iso)} · pagamento ainda não registrado` : `${x.a.service} em ${shortDate(x.iso)}, às ${x.a.start}`
    }
  };
}

/** B8: a mensagem desta campanha está Em análise ou Recusada no WhatsApp (estado do protótipo; não pode sair). */
const HELD_STATUSES = ['em-analise', 'recusada'];
function isHeld(base: BaseCase) {
  if (!base.motive) return false;
  const st = (getSettings().campaignTemplates as Record<string, string>)[MOTIVE_AUTOMATION[base.motive]];
  return !!st && HELD_STATUSES.includes(st);
}
/** Frase do caso segurado (B8). */
export const HELD_TEXT = 'A mensagem desta campanha ainda está em análise no WhatsApp: ela está pronta, mas só sai quando você mandar (copie e mande pelo seu WhatsApp, ou ligue).';
/** Assistente desligada com as mensagens automáticas (Lote E). */
export const STOPPED_TEXT = 'A assistente está desligada com as mensagens automáticas: a mensagem está pronta, mas só sai quando você mandar ou ligar a assistente de novo.';
/** W8 (G19; frase aprovada pelo Christian em 12/11/2026): limite do mês atingido com o uso extra desligado. */
export const limitStoppedText = () =>
`O limite do mês acabou: a mensagem está pronta, mas só sai quando você mandar. As campanhas voltam a sair em ${usageResetDm(getSettings())}, ou antes se você ligar “Continuar depois do limite”.`;
/** W9a (J-06, A2-22): WhatsApp parado (desconectado, autorização vencida ou cancelada, nunca conectado). Nada sai pelo painel. */
export const WHATSAPP_STOPPED_TEXT = 'O WhatsApp não está conectado: nada sai pelo painel até reconectar. A mensagem está pronta: copie e mande pelo seu celular, ou espere reconectar.';
/** Motivo curto, entre parênteses, de a mensagem não sair sozinha (cartão, linha do tempo e painel). */
const stopWhy = (c: Pick<FollowUpCase, 'stoppedByLimit' | 'stoppedByWhatsApp'>) => c.stoppedByWhatsApp ? 'o WhatsApp não está conectado' : c.stoppedByLimit ? 'o limite do mês acabou' : 'mensagens automáticas desligadas';
/** Modo que vale para o caso: segurado (B8) ou mensagens automáticas desligadas = como Pausado. */
export const caseMode = (c: Pick<FollowUpCase, 'held' | 'stopped'>, mode: AutomationMode): AutomationMode => c.held || c.stopped ? 'pausado' : mode;

/** Mensagens com as ações da clínica: nova tentativa autorizada e envio marcado pela equipe. */
function withActions(base: BaseCase): CaseMessage[] {
  let messages = base.messages;
  const calledOf = (m: CaseMessage) => m.status === 'programada' ? overlay.called[msgKey(base.id, m.n)] : undefined;
  const retryIso = overlay.retries[base.id];
  if (retryIso) {
    // Nova tentativa substitui o que estava programado ou parado (decisão explícita da clínica, vale só para ela).
    // P4b: a mensagem marcada como chamada continua no histórico (é uma tentativa que saiu).
    messages = [...messages.filter((m) => (m.status !== 'programada' || !!calledOf(m)) && m.status !== 'parada'), { n: messages.length + 1, plannedIso: retryIso, status: 'programada', retry: true }];
  }
  // P4b: depois de "Marcar como chamado", as mensagens automáticas seguintes deste caso ficam sem previsão.
  const lastCall = messages.filter((m) => !!calledOf(m)).sort((a, b) => b.n - a.n)[0];
  const lastCallIso = lastCall ? calledOf(lastCall) : undefined;
  return messages.map((m) => {
    const calledOn = calledOf(m);
    if (calledOn) return { ...m, status: 'enviada' as MsgStatus, sentIso: calledOn, by: 'equipe' as const };
    if (lastCall && lastCallIso && m.status === 'programada' && !m.retry && m.n > lastCall.n) return { ...m, status: 'parada' as MsgStatus, afterCall: lastCallIso };
    return m;
  });
}

const blockIso = (since?: string) => since && /^\d{2}\/\d{2}$/.test(since) ? `${TODAY_ISO.slice(0, 4)}-${since.slice(3, 5)}-${since.slice(0, 2)}` : TODAY_ISO;

type ClientAttemptInfo = {streak: number;blockedIso: string | null;};

function resolve(base: BaseCase, mode: AutomationMode, attempts: Map<string, ClientAttemptInfo>): FollowUpCase {
  const value = priceOf(base.service);
  const phone = base.phone || phoneOf(base.clientId);
  const messages = base.messages;
  const retryIso = overlay.retries[base.id];
  const held = isHeld(base);
  // W8 (G19): limite do mês atingido com o uso extra desligado = nada sai sozinho, como no Pausado.
  // W9a (J-06, A2-22): o WhatsApp parado também, e esse motivo vem antes dos outros enquanto durar.
  const switchedOff = automationsStopped(getSettings());
  const stoppedByWhatsApp = whatsappStopped(getSettings());
  const stoppedByLimit = !stoppedByWhatsApp && !switchedOff && stoppedByUsage(getSettings());
  const stopped = stoppedByWhatsApp || switchedOff || stoppedByLimit;
  // G1 (F-001, v6): quem aparece é o cliente do cadastro pelo id; o nome registrado continua para a agenda.
  const clientName = currentClientName(base.clientId, base.clientName);
  const c: FollowUpCase = { ...base, clientName, recordedName: base.clientName, phone, messages, situation: 'cuidando', value, held, stopped, stoppedByLimit, stoppedByWhatsApp };
  c.next = messages.find((m) => m.status === 'programada');
  if (held || stopped) mode = 'pausado';

  const block = contactBlockOf(base.clientId);
  const closed = overlay.closed[base.id];
  if (closed) return { ...c, next: undefined, situation: 'resolvidos', outcome: { kind: 'encerrado', iso: closed.iso, note: closed.note } };
  if (base.outcome) return { ...c, next: undefined, situation: 'resolvidos' };
  // L24e: a nota é o motivo do dicionário ("tocou em \"Parar avisos de retorno\" em 10/11"), sem "pedido de saída".
  if (block) return { ...c, next: undefined, situation: 'resolvidos', outcome: { kind: 'nao-recebe', iso: blockIso(block.since), note: stoppedReason('retorno', kindOf(base.clientId, 'retorno')) ?? 'parou os avisos de retorno' } };

  // Exceções (valem em todos os modos). "A assistente pediu ajuda" respondido pela clínica sai daqui (Lote A, 21/10).
  const answered = base.attention?.kind === 'ia-ajuda' && !!answeredIsoOf(base);
  if (base.attention && !answered && !(retryIso && (base.attention.kind === 'nao-entregue' || base.attention.kind === 'sem-resposta'))) {
    return { ...c, situation: 'precisa', need: base.attention };
  }

  // E5: duas tentativas reais seguidas sem resposta, somando os processos do cliente → nada mais sai sozinho.
  const info = attempts.get(base.clientId);
  const authorizedRetry = !!c.next?.retry;
  if (info && info.streak >= UNANSWERED_LIMIT && !authorizedRetry && !answered) {
    const stoppedMsgs = messages.map((m) => m.status === 'programada' ? { ...m, status: 'parada' as MsgStatus } : m);
    return {
      ...c,
      messages: stoppedMsgs,
      next: undefined,
      situation: 'precisa',
      need: {
        kind: 'sem-resposta',
        iso: info.blockedIso ?? TODAY_ISO,
        title: 'Duas tentativas sem resposta',
        text: `${firstName(clientName)} não respondeu às duas últimas mensagens. Nada mais sai sozinho para ${firstName(clientName)}: decida o próximo passo.`
      }
    };
  }

  // Sequência terminou (ex.: modelo de 1 mensagem): a última tentativa ficou sem resposta e não há próxima.
  const sentMsgs = messages.filter((m) => m.status === 'enviada');
  if (!c.next && sentMsgs.length > 0 && !answered) {
    const last = sentMsgs[sentMsgs.length - 1].sentIso ?? sentMsgs[sentMsgs.length - 1].plannedIso;
    const dl = replyDeadline(last);
    if (stamp(dl) <= nowStamp() && !(base.replies ?? []).some((r) => r.iso >= last)) {
      // P4b: depois de "Marcar como chamado" a frase fala do contato da equipe (as seguintes ficaram sem previsão).
      const afterCall = sentMsgs[sentMsgs.length - 1].by === 'equipe' && messages.some((m) => !!m.afterCall);
      return {
        ...c,
        situation: 'precisa',
        need: {
          kind: 'sem-resposta',
          iso: dl.iso,
          title: afterCall ? 'Sem resposta depois do seu contato' : 'As mensagens do acompanhamento terminaram sem resposta',
          text: afterCall ?
          `Você chamou ${firstName(clientName)} em ${shortDate(last)} e não houve resposta. Decida o próximo passo.` :
          `A Orniplaty mandou ${sentMsgs.length === 1 ? 'a única mensagem prevista' : `as ${sentMsgs.length} mensagens previstas`} e ${firstName(clientName)} não respondeu. Decida o próximo passo.`
        }
      };
    }
  }
  // Envio dos próximos dias: aprovação (Supervisionado) ou envio pela equipe (Pausado).
  const next = c.next;
  if (next && mode !== 'automatico' && next.plannedIso <= addDays(TODAY_ISO, SEND_WINDOW_DAYS)) {
    if (mode === 'supervisionado' && !overlay.approved[msgKey(base.id, next.n)]) {
      const opened = addDays(next.plannedIso, -SEND_WINDOW_DAYS);
      const since = opened < TODAY_ISO ? opened : TODAY_ISO;
      const waiting = Math.max(0, daysBetween(since, TODAY_ISO));
      return {
        ...c,
        situation: 'precisa',
        need: {
          kind: 'aprovacao',
          iso: since,
          title: 'Mensagem esperando a sua aprovação',
          // W4 (A2-13): diz desde quando conta (a mensagem entra para aprovação 3 dias antes da data programada).
          text: `${next.n}ª mensagem de ${base.service.toLowerCase()}, programada para ${shortDate(next.plannedIso)}. ${waiting === 0 ? 'Esperando a sua aprovação desde hoje.' : `Esperando a sua aprovação desde ${shortDate(since)} (${waiting} ${waiting === 1 ? 'dia' : 'dias'}).`}${next.plannedIso < TODAY_ISO ? ` Se aprovar agora, sai hoje, até as ${hourText(sendEnd())}.` : ''}`
        }
      };
    }
    if (mode === 'pausado') {
      return {
        ...c,
        situation: 'precisa',
        need: {
          kind: 'pausado',
          iso: next.plannedIso,
          title: 'Hora de chamar',
          text: stoppedByWhatsApp ?
          `${next.n}ª mensagem de ${base.service.toLowerCase()}, prevista para ${shortDate(next.plannedIso)}. ${WHATSAPP_STOPPED_TEXT}` :
          held ?
          `${next.n}ª mensagem de ${base.service.toLowerCase()}, prevista para ${shortDate(next.plannedIso)}. ${HELD_TEXT}` :
          stopped ?
          `${next.n}ª mensagem de ${base.service.toLowerCase()}, prevista para ${shortDate(next.plannedIso)}. ${stoppedByLimit ? limitStoppedText() : STOPPED_TEXT}` :
          `${next.n}ª mensagem de ${base.service.toLowerCase()}, prevista para ${shortDate(next.plannedIso)}. Envios pausados por você: a mensagem está pronta, mas só sai quando você enviar (copie e mande pelo seu WhatsApp, ou ligue) ou ligar os envios.`
        }
      };
    }
  }
  return c;
}

/**
 * F-024: mensagens PROGRAMADAS do mesmo cliente no mesmo dia, em processos diferentes, viram UM envio: cada caso mostra os
 * serviços juntos e aprovar/marcar uma vale para o envio inteiro.
 */
export function groupSameDay(list: BaseCase[]): BaseCase[] {
  const byKey = new Map<string, {caseId: string;n: number;service: string;}[]>();
  // Só processos que ainda podem enviar (sem desfecho, sem encerramento e sem pedido de saída).
  const active = (b: BaseCase) => !b.outcome && !overlay.closed[b.id] && !contactBlockOf(b.clientId);
  list.filter(active).forEach((b) =>
  b.messages.forEach((m) => {
    if (m.status !== 'programada') return;
    const k = `${b.clientId}|${m.plannedIso}`;
    byKey.set(k, [...(byKey.get(k) ?? []), { caseId: b.id, n: m.n, service: b.service }]);
  })
  );
  return list.map((b) => ({
    ...b,
    messages: b.messages.map((m) => {
      const g = m.status === 'programada' && active(b) ? byKey.get(`${b.clientId}|${m.plannedIso}`) : undefined;
      if (!g || g.length < 2) return m;
      return { ...m, group: [...new Set(g.map((x) => x.service))], groupKeys: g.map((x) => msgKey(x.caseId, x.n)) };
    })
  }));
}

/** E5: tentativas de cada cliente, somando os processos (envios agrupados contam uma vez: um dia = uma tentativa). */
export function attemptsByClient(list: BaseCase[]): Map<string, ClientAttemptInfo> {
  const sentBy = new Map<string, string[]>();
  const repliesBy = new Map<string, string[]>();
  list.forEach((b) => {
    b.messages.forEach((m) => m.status === 'enviada' && sentBy.set(b.clientId, [...(sentBy.get(b.clientId) ?? []), m.sentIso ?? m.plannedIso]));
    (b.replies ?? []).forEach((r) => repliesBy.set(b.clientId, [...(repliesBy.get(b.clientId) ?? []), r.iso]));
  });
  const out = new Map<string, ClientAttemptInfo>();
  sentBy.forEach((isos, clientId) => {
    const { attempts, streak } = clientAttempts(isos, repliesBy.get(clientId) ?? []);
    // Data em que o cliente passou a precisar de você = o prazo da 2ª tentativa sem resposta da sequência.
    const unanswered = attempts.filter((a) => !a.answered && a.elapsed);
    const second = streak >= UNANSWERED_LIMIT ? unanswered[unanswered.length - streak + UNANSWERED_LIMIT - 1] : undefined;
    out.set(clientId, { streak, blockedIso: second?.deadline.iso ?? null });
  });
  return out;
}

// ─── um cartão por cliente (F-008) ───

const SITUATION_RANK: Record<Situation, number> = { precisa: 0, cuidando: 1, resolvidos: 2 };
/** Data que ordena dentro da situação: a pendência mais antiga; a próxima mensagem; o resultado mais recente. */
const dateKey = (c: FollowUpCase) => c.situation === 'precisa' ? c.need?.iso ?? '9999' : c.next?.plannedIso ?? '9999';
const urgency = (a: FollowUpCase, b: FollowUpCase) =>
SITUATION_RANK[a.situation] - SITUATION_RANK[b.situation] || (
a.situation === 'resolvidos' ? (b.outcome?.iso ?? '').localeCompare(a.outcome?.iso ?? '') : dateKey(a).localeCompare(dateKey(b))) ||
a.id.localeCompare(b.id);

/**
 * F-008: um cartão por cliente com o caso mais urgente (situação, depois data). Os outros casos ficam em `others`
 * (painel: "Também acompanha"). Use com a lista já filtrada (motivo, profissional, busca): o cartão é o caso mais urgente
 * DENTRO do filtro.
 */
export function cardsOf(cases: FollowUpCase[]): FollowUpCase[] {
  const byClient = new Map<string, FollowUpCase[]>();
  cases.forEach((c) => byClient.set(c.clientId, [...(byClient.get(c.clientId) ?? []), c]));
  return [...byClient.values()].map((list) => {
    const sorted = [...list].sort(urgency);
    return { ...sorted[0], others: sorted.slice(1) };
  });
}

// ─── processo do cliente (ClientProcess) ───

export type ProcessItemData = {id: string;label: string;date?: string;note?: string;status: 'done' | 'current' | 'upcoming' | 'attention' | 'end';};

export function processItems(c: FollowUpCase, mode: AutomationMode): ProcessItemData[] {
  mode = caseMode(c, mode);
  const items: ProcessItemData[] = [{ id: 'trigger', label: c.trigger.label, date: shortDate(c.trigger.iso), status: 'done' }];
  const replies = c.replies ?? [];
  let currentSet = false;
  c.messages.forEach((m) => {
    const label = m.retry ? 'Nova tentativa' : `${m.n}ª mensagem`;
    const sentOn = m.sentIso ?? m.plannedIso;
    const replied = replies.some((r) => r.iso >= sentOn && !c.messages.some((x) => x.n > m.n && x.status === 'enviada' && (x.sentIso ?? x.plannedIso) <= r.iso));
    if (m.status === 'enviada')
    items.push({ id: `msg${m.n}`, label, date: shortDate(sentOn), note: `${m.by === 'equipe' ? 'enviada pela equipe · ' : ''}${replied ? 'respondeu' : 'sem resposta'}`, status: 'done' });
    // W9a (N-04): em caso resolvido (pedido de saída, encerrado, agendou…) a mensagem não entregue é só histórico e a parada
    // não espera decisão: as duas dizem que não serão enviadas, como as programadas.
    else if (m.status === 'nao-entregue' && c.situation === 'resolvidos') items.push({ id: `msg${m.n}`, label, date: shortDate(m.plannedIso), note: 'não entregue · não será enviada de novo', status: 'upcoming' });else
    if (m.status === 'nao-entregue') items.push({ id: `msg${m.n}`, label: `${label} não entregue`, date: shortDate(m.plannedIso), status: 'attention' });else
    if (m.status === 'parada') items.push({ id: `msg${m.n}`, label, note: c.situation === 'resolvidos' ? 'não será enviada' : m.afterCall ? 'sem previsão: você chamou por fora' : 'parada até você decidir', status: 'upcoming' });else
    {
      const note =
      c.situation === 'resolvidos' ?
      'não será enviada' :
      mode === 'pausado' ?
      // R2 (06/11/2026, A-10): data que já passou e a mensagem não saiu (envios pausados) → diz que está atrasada.
      m.plannedIso < TODAY_ISO ?
      'atrasada: ainda não enviada, pronta para você enviar' :
      'pronta para você enviar' :
      mode === 'supervisionado' ?
      overlay.approved[msgKey(c.id, m.n)] ?
      'aprovada' :
      'aguarda sua aprovação' :
      'programada';
      items.push({ id: `msg${m.n}`, label, date: shortDate(m.plannedIso), note: m.group ? `${note} · junto com ${m.group.filter((s) => s !== c.service).join(', ')}` : note, status: !currentSet && c.situation !== 'resolvidos' ? 'current' : 'upcoming' });
      currentSet = true;
    }
  });
  replies.forEach((r, i) => items.push({ id: `reply${i}`, label: 'Respondeu', date: shortDate(r.iso), status: 'done' }));
  const answeredIso = answeredIsoOf(c);
  if (answeredIso) items.push({ id: 'answered', label: 'Você respondeu na conversa', date: shortDate(answeredIso), status: 'done' });
  // Ordem cronológica (o gatilho fica sempre primeiro).
  const [first, ...rest] = items;
  const iso = (it: ProcessItemData) => {
    const d = it.date;
    if (!d) return '9999';
    const m = [...c.messages.map((x) => x.sentIso ?? x.plannedIso), ...replies.map((x) => x.iso), ...(answeredIso ? [answeredIso] : [])].find((x) => shortDate(x) === d);
    return m ?? '9999';
  };
  const sorted = [first, ...rest.sort((a, b) => iso(a).localeCompare(iso(b)))];

  if (c.situation === 'precisa' && c.need && c.need.kind !== 'aprovacao' && c.need.kind !== 'pausado' && c.need.kind !== 'nao-entregue') {
    const label =
    c.need.kind === 'ia-ajuda' ? 'A assistente pediu ajuda' : c.need.kind === 'sem-fechamento' ? 'Ainda sem fechamento' : c.need.title;
    sorted.push({ id: 'need', label, date: shortDate(c.need.iso), status: 'attention' });
  }
  if (c.situation === 'resolvidos' && c.outcome) {
    const o = c.outcome;
    const label = o.kind === 'agendou' ? `Agendou: ${o.note}` : o.kind === 'voltou' ? o.note : o.kind === 'nao-recebe' ? `${outcomeLabelOf(c)}: ${o.note}` : `Encerrado: ${o.note}`;
    // F-009: o desfecho mostra a data REAL do evento (horário criado, pagamento, encerramento, pedido de saída).
    // W9a (N-03): a data aparece UMA vez. Se o texto já traz a data do evento (“desde 20/09”, “Atendido e pago em 01/10”), o item não repete.
    sorted.push({ id: 'outcome', label, date: label.includes(shortDate(o.iso)) ? undefined : shortDate(o.iso), status: o.kind === 'encerrado' || o.kind === 'nao-recebe' ? 'end' : 'done' });
  }
  if (c.situation !== 'resolvidos') {
    // W4 (A2-20): não é “se não responder” (o leitor de tela lia esse rótulo do status `end`): é o passo seguinte.
    if (c.need?.kind === 'sem-fechamento') sorted.push({ id: 'end', label: 'Depois do fechamento: a Orniplaty chama na data de volta do serviço', status: 'upcoming' });else
    if (!c.next && !answeredIso && (c.replies ?? []).some((r) => r.iso >= (c.messages.filter((m) => m.status === 'enviada').slice(-1)[0]?.sentIso ?? '9999'))) sorted.push({ id: 'end', label: 'A conversa segue em Conversas: agende ou encerre', status: 'upcoming' });else
    if (answeredIso && !c.next) sorted.push({ id: 'end', label: 'A conversa segue com você: agende ou encerre', status: 'end' });else
    if (!c.next && c.messages.some((m) => !!m.afterCall)) sorted.push({ id: 'end', label: 'Sem resposta até o prazo: Precisa de você', status: 'end' });else
    if (c.situation === 'cuidando' || c.need?.kind === 'aprovacao' || c.need?.kind === 'pausado') sorted.push({ id: 'end', label: 'Duas mensagens seguidas sem resposta: Precisa de você', status: 'end' });
  }
  return sorted;
}

// ─── cartões de "A Orniplaty está cuidando" e painel do cliente (Lote A, 21/10/2026) ───

/** Passo do processo: "Mensagem {step} de {total}" (step = a próxima a sair) e quantas já saíram. */
export function stepInfo(c: FollowUpCase) {
  const total = c.messages.length;
  const sentN = c.messages.filter((m) => m.status === 'enviada').length;
  const idx = c.next ? c.messages.indexOf(c.next) : -1;
  const step = idx >= 0 ? idx + 1 : Math.min(total, sentN);
  return { step, total, sent: sentN };
}

/** Modelo em linguagem simples (ex.: "volta a cada 30 dias", "pacote vence em 10/11"). */
export function plainModel(c: FollowUpCase) {
  // Ajustes do Lote B: o `model` já vem em linguagem simples ("Volta a cada 30 dias", "Sessão 1 de 10, uma por semana").
  if (c.motive === 'retorno' && c.model) return c.model.charAt(0).toLowerCase() + c.model.slice(1);
  const d = c.deadline.split(' · ')[0];
  return d.charAt(0).toLowerCase() + d.slice(1);
}

/** Quando a próxima mensagem sai de fato: a data prevista, ou o próximo horário permitido se a data já passou. */
function sendsOn(m: CaseMessage) {
  const w = campaignWindow();
  const fromIso = m.plannedIso >= TODAY_ISO ? m.plannedIso : TODAY_ISO;
  const slot = m.plannedIso >= TODAY_ISO ? nextSendSlot(m.plannedIso, sendStart()) : nextSendSlot(TODAY_ISO, NOW);
  if (slot.iso === TODAY_ISO) return `hoje, até as ${hourText(w.end)}`;
  // W8: a data caiu num feriado (com "Enviar também em feriados" desligado) → espera o próximo dia de envio.
  let holiday = '';
  for (let d = fromIso; d < slot.iso && !holiday; d = addDays(d, 1)) if (isSendDay(d) && holidayBlocked(d)) holiday = d;
  return `${shortDate(slot.iso)}, ${hoursText(w)}${holiday ? ` (${shortDate(holiday)} é feriado: espera o próximo dia de envio)` : ''}`;
}
/** Dia em que a mensagem ainda não aprovada sairia (pula feriado e dia sem envio; data que já passou continua como está). */
const outDate = (m: CaseMessage) => shortDate(m.plannedIso >= TODAY_ISO ? nextSendSlot(m.plannedIso, sendStart()).iso : m.plannedIso);

/** A próxima mensagem, em destaque no cartão (texto visível, conforme o modo de envio). */
export function nextLine(c: FollowUpCase, mode: AutomationMode) {
  const savedMode = mode;
  const held = !!c.held && !c.stopped;
  mode = caseMode(c, mode);
  const answeredIso = answeredIsoOf(c);
  if (!c.next) {
    if (answeredIso) return `Você respondeu em ${shortDate(answeredIso)}. A conversa segue com você: agende ou encerre.`;
    // W4 (A2-01): o cliente respondeu depois da última mensagem → a conversa segue em Conversas.
    const lastOut = c.messages.filter((m) => m.status === 'enviada').slice(-1)[0];
    const reply = lastOut && (c.replies ?? []).find((r) => r.iso >= (lastOut.sentIso ?? lastOut.plannedIso));
    if (reply) return `Respondeu em ${shortDate(reply.iso)}. A conversa segue em Conversas: agende ou encerre.`;
    const lastSent = c.messages.filter((m) => m.status === 'enviada').slice(-1)[0];
    if (lastSent) {
      const dl = replyDeadline(lastSent.sentIso ?? lastSent.plannedIso);
      return `Aguardando resposta até ${shortDate(dl.iso)}, às ${hourText(dl.time)}.`;
    }
    return 'Aguardando resposta.';
  }
  const d = shortDate(c.next.plannedIso);
  // W4 (A2-08): mensagem em análise no WhatsApp segue o modo de envio salvo (`savedMode`), não vira “Pausado” no texto.
  if (held && savedMode === 'supervisionado') return `Prevista para ${d} · aguarda o WhatsApp liberar a mensagem e a sua aprovação`;
  if (held && savedMode === 'automatico') return `Prevista para ${d} · sai sozinha quando o WhatsApp liberar a mensagem`;
  // W9a (J-06, A2-22): com o WhatsApp parado, esse motivo vem antes dos outros.
  if (c.stoppedByWhatsApp) return `Pronta para você enviar em ${d} (${stopWhy(c)})`;
  if (c.held) return `Pronta para você enviar em ${d} (mensagem em análise no WhatsApp)`;
  if (c.stopped) return `Pronta para você enviar em ${d} (${stopWhy(c)})`;
  // R2 (06/11/2026, A-10): prevista para um dia que já passou → "atrasada".
  if (mode === 'pausado') return c.next.plannedIso < TODAY_ISO ? `Atrasada: prevista para ${d}, ainda não enviada. Pronta para você enviar` : `Pronta para você enviar em ${d}`;
  if (mode === 'supervisionado') return overlay.approved[msgKey(c.id, c.next.n)] ? `Aprovada · sai ${sendsOn(c.next)}` : `Aguarda sua aprovação · sai em ${outDate(c.next)}`;
  return `Próxima mensagem: ${sendsOn(c.next)}`;
}

/**
 * W4 (11/11/2026, G8): “quem age” no cartão de “Programados”, pelo modo de envio salvo (Automações).
 * Pausado (ou mensagem em análise, ou mensagens automáticas desligadas): você manda. Supervisionado: a Orniplaty manda
 * depois da sua aprovação. Automático: a Orniplaty manda.
 */
export function whoActs(c: FollowUpCase, mode: AutomationMode): string {
  if (!c.next) {
    // Mesma ordem de `nextLine`: a equipe respondeu → a conversa está com você; o cliente respondeu → segue em Conversas.
    if (answeredIsoOf(c)) return 'Quem age agora: você, na conversa';
    const lastOut = c.messages.filter((m) => m.status === 'enviada').slice(-1)[0];
    if (lastOut && (c.replies ?? []).some((r) => r.iso >= (lastOut.sentIso ?? lastOut.plannedIso))) return 'Quem age agora: quem está com a conversa, em Conversas';
    return 'Quem age agora: o cliente (aguardando resposta)';
  }
  // W9a (J-06, A2-22): com o WhatsApp parado nada sai pelo painel; quem manda é a equipe, pelo celular.
  if (c.stoppedByWhatsApp) return 'Quem envia: você, pelo seu celular (nada sai pelo painel até reconectar o WhatsApp)';
  if (c.stopped || c.held && mode === 'pausado' || mode === 'pausado') return 'Quem envia: você';
  if (mode === 'supervisionado') return 'Quem envia: a Orniplaty, depois da sua aprovação';
  return c.held ? 'Quem envia: a Orniplaty, quando o WhatsApp liberar a mensagem' : 'Quem envia: a Orniplaty';
}

export type MessageState = {tone: 'neutral' | 'info' | 'warning' | 'error';tag: string;text: string;};

/** Situação de cada mensagem, abaixo do balão no painel do cliente (etiqueta + frase de tamanho normal). */
export function messageState(c: FollowUpCase, m: CaseMessage, mode: AutomationMode): MessageState {
  const savedMode = mode;
  mode = caseMode(c, mode);
  const d = shortDate(m.plannedIso);
  if (m.status === 'enviada') {
    const sentOn = m.sentIso ?? m.plannedIso;
    const later = c.messages.find((x) => x.n > m.n && x.status === 'enviada');
    const replied = (c.replies ?? []).some((r) => r.iso >= sentOn && (!later || r.iso < (later.sentIso ?? later.plannedIso)));
    return { tone: 'neutral', tag: 'Enviada', text: `${m.by === 'equipe' ? 'Enviada pela equipe' : 'Enviada'} em ${shortDate(sentOn)} · ${replied ? 'respondeu' : 'sem resposta'}` };
  }
  if (m.status === 'nao-entregue') return { tone: 'error', tag: 'Não entregue', text: `O WhatsApp não entregou em ${d}` };
  // W9a (N-04): em caso resolvido, a mensagem parada não espera decisão: não será enviada.
  if (m.status === 'parada' && c.situation === 'resolvidos') return { tone: 'neutral', tag: 'Parada', text: 'Não será enviada' };
  if (m.status === 'parada' && m.afterCall) return { tone: 'neutral', tag: 'Sem previsão', text: `Não sai sozinha: você chamou em ${shortDate(m.afterCall)}` };
  if (m.status === 'parada') return { tone: 'neutral', tag: 'Parada', text: 'Parada até você decidir' };
  if (c.situation === 'resolvidos') return { tone: 'neutral', tag: 'Parada', text: 'Não será enviada' };
  if (c.held && !c.stopped && savedMode === 'supervisionado') return { tone: 'warning', tag: 'A aprovar', text: `Prevista para ${d}: aguarda o WhatsApp liberar a mensagem e a sua aprovação` };
  if (c.held && !c.stopped && savedMode === 'automatico') return { tone: 'info', tag: 'Programada', text: `Prevista para ${d}: sai sozinha quando o WhatsApp liberar a mensagem` };
  if (c.stoppedByWhatsApp) return { tone: 'info', tag: 'Pronta', text: `Pronta para enviar em ${d}: copie e mande pelo seu celular (${stopWhy(c)})` };
  if (c.held) return { tone: 'info', tag: 'Pronta', text: `Pronta para enviar em ${d}: copie e mande (a mensagem ainda está em análise no WhatsApp)` };
  if (c.stopped) return { tone: 'info', tag: 'Pronta', text: `Pronta para enviar em ${d}: copie e mande (${stopWhy(c)})` };
  // R2 (06/11/2026, A-10): prevista para um dia que já passou → "ainda não enviada".
  if (mode === 'pausado') return { tone: 'info', tag: 'Pronta', text: m.plannedIso < TODAY_ISO ? `Prevista para ${d}, ainda não enviada: copie e mande, ou ligue os envios` : `Pronta para enviar em ${d}: copie e mande, ou ligue os envios` };
  if (mode === 'supervisionado') {
    return overlay.approved[msgKey(c.id, m.n)] ?
    { tone: 'info', tag: 'Aprovada', text: `Será enviada ${sendsOn(m)}` } :
    { tone: 'warning', tag: 'A aprovar', text: `Aguarda sua aprovação · sai em ${outDate(m)}` };
  }
  return { tone: 'info', tag: 'Programada', text: `Será enviada ${sendsOn(m)}` };
}

// ─── hooks ───

export function useFollowUp() {
  const { items } = useReturns();
  const { appointments } = useAgendaData();
  // F-025 (e a defasagem registrada na Ficha): a versão do pedido de saída ENTRA na dependência.
  const blocksVersion = useContactBlocks();
  const mode = useSavedAutomationMode();
  const saved = useSavedStore(automacoesStore);
  const { services } = useServices();
  // G1: cadastro de clientes, pacotes, fechamentos, reembolsos e estado do WhatsApp entram na dependência.
  const cv = useClientsVersion();
  const pv = useBackendVersion();
  const fin = useFinanceEntries();
  const lv = useLegado();
  const settings = useSettings();
  // W4 (A2-05): a resposta da equipe em Conversas tira o caso “pediu ajuda” de “Precisa de você”.
  const conv = useConversations();
  const v = useSyncExternalStore(subscribe, () => version);
  return useMemo(() => {
    const lib = saved.models;
    const generated = [
    ...fromReturns(items, appointments, lib),
    ...fromClosures(appointments, lib),
    ...fromAgenda(appointments),
    ...fromConversationEvents(appointments),
    ...fromPackages(appointments, saved.values),
    ...fromInactive(appointments, saved.values)];

    const withMsgs = groupSameDay(generated.map(withHistory).map((b) => linkOutcome(b, appointments)).map((b) => ({ ...b, messages: withActions(b) })));
    const attempts = attemptsByClient(withMsgs);
    // Campanha desligada em Automações: o motivo sai de "Precisa de você" e "Está cuidando" (Resolvidos ficam como histórico).
    const off = (b: BaseCase) => !!b.motive && saved.enabled[MOTIVE_AUTOMATION[b.motive]] === false;
    const everything = withMsgs.
    map((b) => resolve(b, mode, attempts)).
    filter((c) => !(off(c) && c.situation !== 'resolvidos')).
    filter((c) => c.situation !== 'resolvidos' || !c.outcome || c.outcome.iso >= addDays(TODAY_ISO, -RESOLVED_DAYS));
    // G4 (F-069): cliente excluído do cadastro sai das telas de operação; o que ele pagou continua em "Trouxe de volta".
    const all = everything.filter((c) => !isDeletedClientKey(c.clientId));
    const cards = cardsOf(all);
    // W4 (A2-12): Resolvidos mostra um cartão por cliente ENTRE os casos resolvidos (antes, um cliente com outro caso em
    // aberto sumia de Resolvidos e o “Trouxe de volta” contava alguém que a lista não mostrava).
    const by: Record<Situation, FollowUpCase[]> = {
      precisa: cards.filter((c) => c.situation === 'precisa').sort(urgency),
      cuidando: cards.filter((c) => c.situation === 'cuidando').sort(urgency),
      resolvidos: cardsOf(all.filter((c) => c.situation === 'resolvidos')).sort(urgency)
    };
    // "Trouxe de volta este mês" (mês do relógio do protótipo): CLIENTES distintos e o que eles PAGARAM (F-006, E1).
    // Lê todos os casos (não só os cartões): o cliente continua contado se outro horário ligado e pago ainda existir.
    const month = TODAY_ISO.slice(0, 7);
    const back = monthPaidEvents(everything, month);
    const booked = everything.filter((c) => c.outcome?.kind === 'agendou' && (c.outcome.apptIso ?? '').startsWith(month));
    const uniq = (l: FollowUpCase[]) => new Set(l.map((c) => c.clientId)).size;
    // A7 (Lote A, 21/10/2026): quem já tem mensagem programada DEPOIS da janela de 3 dias (Pausado e Supervisionado).
    const windowEnd = addDays(TODAY_ISO, SEND_WINDOW_DAYS);
    const laterScheduled = by.cuidando.filter((c) => !!c.next && c.next.plannedIso > windowEnd).length;
    // F-025: "Com mensagens programadas" só quando existem.
    const withScheduled = by.cuidando.filter((c) => !!c.next).length;
    return {
      mode,
      all,
      by,
      laterScheduled,
      withScheduled,
      broughtBack: {
        clients: new Set(back.map((x) => x.clientId)).size,
        paid: back.reduce((s, x) => s + x.value, 0),
        bookedClients: uniq(booked),
        booked: booked.reduce((s, c) => s + c.value, 0)
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, appointments, mode, v, saved, services, cv, pv, blocksVersion, fin, lv, settings, conv]);
}

/**
 * Revisão do G1: pagamentos de casos "Voltou" que quitaram no mês (`yyyy-mm`), um por fechamento. Cliente distinto =
 * tem ao menos um pagamento ligado e qualificado no mês. Puro (testado por função).
 */
export function monthPaidEvents(cases: Pick<BaseCase, 'clientId' | 'outcome'>[], month: string): (PaidEvent & {clientId: string;})[] {
  return cases.flatMap((c) =>
  c.outcome?.kind === 'voltou' && c.outcome.paid ? (c.outcome.payments ?? []).filter((p) => p.iso.startsWith(month)).map((p) => ({ ...p, clientId: c.clientId })) : []
  );
}

/** Número do menu e do Início: clientes em "Precisam de você" (mesma fonte da tela). */
export function useFollowUpTotals() {
  const { by, broughtBack } = useFollowUp();
  return { precisa: by.precisa.length, cuidando: by.cuidando.length, broughtBack };
}

// ─── plano de retorno em linguagem simples (ajustes do Lote B, 21/10/2026) ───

/**
 * Itens do `ClientProcess dateFirst` para um plano de retorno: o que a Orniplaty VAI fazer, com datas.
 * - `voice: 'plano'` (Fechar atendimento): frases completas ("A Orniplaty manda a 1ª mensagem lembrando do retorno").
 * - `voice: 'exemplo'` (Serviço › exemplo, Automações): continua a frase "Se um cliente fizer X hoje (01/10), a Orniplaty:".
 * O texto muda com o modo de envio SALVO (Pausado: "fica pronta para você mandar"; Supervisionado: "para você aprovar").
 * G1 (F-024): da 3ª mensagem em diante, só sai se o cliente tiver respondido (duas seguidas sem resposta = Precisa de você).
 */
export function planTimelineItems(plan: Pick<ReturnPlan, 'messages' | 'modelKind'>, mode: AutomationMode, voice: 'plano' | 'exemplo' = 'plano'): ProcessItemData[] {
  const total = plan.messages.length;
  const what = plan.modelKind === 'serie' ? 'lembrando da próxima sessão' : plan.modelKind === 'revisao' ? 'lembrando da revisão' : voice === 'exemplo' ? 'lembrando de voltar' : 'lembrando do retorno';
  const ex = voice === 'exemplo';
  const items: ProcessItemData[] = plan.messages.map((m, i) => {
    const kind = i === 0 ? 'first' : i === total - 1 ? 'last' : 'middle';
    let label: string;
    if (i >= UNANSWERED_LIMIT) {
      const act = mode === 'pausado' ? 'deixa outra pronta para você mandar' : mode === 'supervisionado' ? 'prepara outra para você aprovar' : 'manda outra';
      label = `${ex ? 'se ele tiver respondido e ainda não marcou' : 'Se ele tiver respondido e ainda não marcou'}, ${act}`;
    } else if (mode === 'pausado') {
      label =
      kind === 'first' ?
      `${ex ? 'deixa' : 'A Orniplaty deixa'} a 1ª mensagem pronta para você mandar, ${what}` :
      kind === 'last' ?
      `${ex ? 'se não responder, deixa' : 'Se não responder, deixa'} a última pronta para você mandar` :
      `${ex ? 'se não responder, deixa' : 'Se não responder, deixa'} outra pronta para você mandar`;
    } else if (mode === 'supervisionado') {
      label =
      kind === 'first' ?
      `${ex ? 'prepara' : 'A Orniplaty prepara'} a 1ª mensagem, ${what}, para você aprovar` :
      kind === 'last' ?
      `${ex ? 'se não responder, prepara' : 'Se não responder, prepara'} a última para você aprovar` :
      `${ex ? 'se não responder, prepara' : 'Se não responder, prepara'} outra para você aprovar`;
    } else if (ex) {
      label = kind === 'first' ? `manda a 1ª mensagem ${what}` : kind === 'last' ? total === 2 ? 'manda outra se não responder (última tentativa)' : 'faz a última tentativa' : 'manda outra se não responder';
    } else {
      label = kind === 'first' ? `A Orniplaty manda a 1ª mensagem ${what}` : kind === 'last' ? total === 2 ? 'Se não responder, manda a última' : 'Última tentativa' : 'Se não responder, manda outra';
    }
    return { id: `msg${m.n}`, label, date: shortDate(m.plannedIso), status: i === 0 ? 'current' as const : 'upcoming' as const };
  });
  const endText = ex ?
  total > 1 ?
  'com duas mensagens seguidas sem resposta, avisa você em Oportunidades' :
  'sem resposta, avisa você em Oportunidades' :
  total > 1 ?
  'Duas mensagens seguidas sem resposta: o cliente aparece para você em Oportunidades' :
  'Se não responder, o cliente aparece para você em Oportunidades';
  items.push({ id: 'end', label: endText, status: 'end' });
  return items;
}