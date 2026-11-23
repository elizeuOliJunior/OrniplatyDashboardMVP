/** Threads and short client summaries for every sample conversation (prototype data). */
import React, { useSyncExternalStore } from 'react';
import { NOW, TODAY_ISO, sessionElapsedMs } from './agendaStore';
import { anaSummary, anaThread, assistantAnswering, conversations, inQueue, registerLastSender, waitMinutes, waitlistOfferAuto } from './conversas';
import type { Conversation, ThreadMessage } from './conversas';
import { getConversasScenario, replyWindow } from './replyWindow';
import { getSettings, whatsappStopped } from './settingsStore';

/*
 * FONTE ÚNICA das conversas (Lote A, 21/10/2026): a tela Conversas e o painel do cliente de Oportunidades leem e
 * escrevem AQUI (`conversations`, `conversationThreads`). Quem muda chama `notifyConversations()`; quem mostra usa
 * `useConversations()` para redesenhar. SIMULAÇÃO: nada é enviado de verdade.
 */
let convVersion = 0;
const convListeners = new Set<() => void>();
export function notifyConversations() {
  convVersion += 1;
  convListeners.forEach((l) => l());
}
export function useConversations() {
  return useSyncExternalStore(
    (l) => {
      convListeners.add(l);
      return () => {
        convListeners.delete(l);
      };
    },
    () => convVersion
  );
}
export function patchConversation(id: string, change: Partial<Conversation>) {
  const c = conversations.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, change);
  notifyConversations();
}
/** G1 (F-001, v6): o cliente foi renomeado no cadastro. O texto das mensagens já trocadas não muda. */
export function setConversationIdentity(id: string, name: string) {
  const c = conversations.find((x) => x.id === id);
  if (c) c.name = name;
  if (conversationSummaries[id]) conversationSummaries[id] = { ...conversationSummaries[id], name };
  notifyConversations();
}
export const hasConversation = (id: string) => (conversationThreads[id]?.length ?? 0) > 0;

/** T1 (O-01): janela de 24 h desta conversa (fonte única: data/replyWindow.ts). */
export function windowOf(id: string) {
  const c = conversations.find((x) => x.id === id);
  return replyWindow(c?.lastInboundAt, c?.windowClosed);
}

/* ───────────── T1 1b: "Espera por você" (mediana de hoje) ─────────────
 * Tempo entre o pedido de ajuda (entrada na fila) e a PRIMEIRA resposta da equipe. FIXTURE DA AMOSTRA: três pedidos já
 * respondidos hoje antes das 09:20 (8, 12 e 25 min). Cada resposta da equipe a uma conversa da fila, nesta sessão, entra
 * aqui com a espera de verdade (relógio do protótipo). No produto: `escalated_at` + 1ª mensagem da equipe (agregado novo,
 * classe C, contrato T2).
 */
const teamReplyWaits: {iso: string;min: number;}[] = [
{ iso: TODAY_ISO, min: 8 },
{ iso: TODAY_ISO, min: 12 },
{ iso: TODAY_ISO, min: 25 }];

export function medianTeamWaitToday(): number | null {
  const v = teamReplyWaits.filter((w) => w.iso === TODAY_ISO).map((w) => w.min).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}
/** Conversas com pelo menos uma mensagem hoje. */
export function conversationsTodayCount() {
  return conversations.filter((c) => (conversationThreads[c.id] ?? []).some((m) => (m.day ?? TODAY_ISO) === TODAY_ISO)).length;
}

/** W4 (A5-02): `whatsapp` = o WhatsApp da clínica não está funcionando; nada sai pelo painel. */
export type SendResult = {ok: true;} | {ok: false;reason: 'janela-fechada' | 'fechou-durante' | 'whatsapp';};
/** W4 (A5-02): o WhatsApp da clínica está sem funcionar (desconectado, vencido, cancelado, nunca conectado)? */
export const whatsappDown = () => whatsappStopped(getSettings());

/**
 * Efeitos comuns de uma resposta da equipe (texto ou mensagem aprovada): sai da fila, reabre resolvida e, W4 (G7), a
 * conversa fica COM A EQUIPE (`voce`) até “Devolver”; o prazo de 2 h sem ação da equipe começa de novo.
 */
function afterTeamReply(c: Conversation | undefined, preview: string, time: string) {
  if (!c) return;
  Object.assign(c, { preview: `Você: ${preview}`, time, handler: 'voce', waiting: undefined, unread: 0, resolved: false, resolvedAt: undefined, returnedAt: undefined });
  startHold(c.id, time);
}

/**
 * Resposta da clínica pelo painel: entra no histórico como mensagem da equipe e a conversa fica com a equipe até
 * “Devolver” (W4, G7). W4 (A5-02): com o WhatsApp sem funcionar, nada sai. T1 (O-01): com a janela fechada, nada sai. Cenário "Envio recusado": a janela fecha
 * durante o envio, a mensagem fica como "Não enviada". T1 (O-02): a resposta da equipe tira a conversa da fila.
 * T1 1b: a espera até essa primeira resposta entra na mediana de hoje; responder uma conversa resolvida a reabre.
 */
export function sendTeamMessage(id: string, name: string, text: string, time = NOW): SendResult {
  ensureConversation(id, name);
  if (whatsappDown()) return { ok: false, reason: 'whatsapp' };
  if (windowOf(id).band === 'fechada') return { ok: false, reason: 'janela-fechada' };
  const c = conversations.find((x) => x.id === id);
  if (getConversasScenario() === 'envio-recusado') {
    conversationThreads[id] = [...conversationThreads[id], { id: `t${Date.now()}-${conversationThreads[id].length}`, sender: 'team', via: 'painel', timestamp: time, text, status: 'failed' }];
    if (c) c.windowClosed = true;
    notifyConversations();
    return { ok: false, reason: 'fechou-durante' };
  }
  if (c && inQueue(c)) teamReplyWaits.push({ iso: TODAY_ISO, min: waitMinutes(c) });
  conversationThreads[id] = [...conversationThreads[id], { id: `t${Date.now()}-${conversationThreads[id].length}`, sender: 'team', via: 'painel', timestamp: time, text, status: 'sent' }];
  afterTeamReply(c, text, time);
  notifyConversations();
  return { ok: true };
}

/**
 * T1 1c (O-13, adendo T2): MENSAGEM APROVADA enviada pela equipe (data/messageTemplates.ts). Sai com a janela aberta OU
 * fechada (é o único caminho com a janela fechada) e NÃO reabre a janela: ela só abre quando o cliente responder.
 * No produto: envio de modelo pela equipe (`template_name` + campos), contrato novo; hoje o envio manual só aceita texto.
 */
export function sendTeamTemplate(id: string, name: string, msg: {title: string;text: string;buttons?: string[];}, time = NOW): SendResult {
  ensureConversation(id, name);
  if (whatsappDown()) return { ok: false, reason: 'whatsapp' };
  const c = conversations.find((x) => x.id === id);
  if (c && inQueue(c)) teamReplyWaits.push({ iso: TODAY_ISO, min: waitMinutes(c) });
  conversationThreads[id] = [
  ...conversationThreads[id],
  { id: `tpl${Date.now()}-${conversationThreads[id].length}`, sender: 'team', via: 'painel', timestamp: time, text: msg.text, template: { title: msg.title, buttons: msg.buttons }, status: 'sent' }];

  afterTeamReply(c, msg.title, time);
  notifyConversations();
  return { ok: true };
}

/**
 * T1 1b: "Resolver" — a conversa sai da fila sem voltar para a assistente (backend `POST /conversations/{id}/resolve`).
 * No backend real, a próxima mensagem do cliente abre uma conversa nova, que a assistente atende.
 */
export function resolveConversation(id: string) {
  const c = conversations.find((x) => x.id === id);
  if (!c) return;
  clearPause(id);
  Object.assign(c, { resolved: true, resolvedAt: `${TODAY_ISO}T${NOW}`, waiting: undefined, unread: 0, handler: 'ia' });
  notifyConversations();
}

/* ───────────── W4 (11/11/2026, Christian, G7): a conversa fica com a equipe até “Devolver” ─────────────
 * Quando alguém da equipe responde ou assume, a conversa fica com a equipe (`handler 'voce'`). Depois de 2 horas sem ação da
 * equipe, e sem mensagem do cliente esperando resposta, ela volta sozinha para a assistente, com aviso (toast em Conversas e
 * faixa na conversa). Com a assistente desligada ou parada, nada volta; volta quando ela voltar a atender.
 * Conversa com mensagem do cliente sem resposta fica em “Aguardando você” até alguém responder (não volta sozinha).
 * O relógio do protótipo está parado; o prazo usa o tempo real da sessão (`sessionElapsedMs`). Recarregar zera.
 * Substitui a antiga pausa de ~10 min (G4, F-068). Os nomes antigos continuam exportados para quem ainda os importa.
 */
export const TEAM_HOLD_MS = 2 * 60 * 60 * 1000;
/** @deprecated W4: a pausa de 10 min saiu (G7). Mantido para compatibilidade. */
export const MANUAL_PAUSE_MS = TEAM_HOLD_MS;
const holds: Record<string, {start: number;clock: string;}> = {};
type Returned = {id: string;name: string;at: string;};
let returned: Returned[] = [];
const toMin = (hhmm: string) => /^\d{2}:\d{2}$/.test(hhmm) ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null;
const plusMinutes = (hhmm: string, add: number) => {
  const m = (toMin(hhmm) ?? 0) + add;
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Conversas da amostra que já estão com a equipe por uma resposta de HOJE (ex.: Carla, pelo celular às 09:14). */
function seedHolds() {
  for (const c of conversations) {
    if (c.handler === 'ia' || c.waiting || c.resolved || holds[c.id]) continue;
    const lastTeam = [...(conversationThreads[c.id] ?? [])].reverse().find((m) => m.sender === 'team' && (m.day ?? TODAY_ISO) === TODAY_ISO);
    const at = lastTeam ? toMin(lastTeam.timestamp) : null;
    const now = toMin(NOW);
    if (at === null || now === null || !lastTeam) continue;
    holds[c.id] = { start: sessionElapsedMs() - Math.max(0, now - at) * 60000, clock: lastTeam.timestamp };
  }
}

let ticker: ReturnType<typeof setInterval> | null = null;
function ensureTicker() {
  if (ticker || typeof window === 'undefined') return;
  ticker = setInterval(checkHolds, 5000);
}

/** Confere os prazos de 2 h vencidos: a conversa volta para a assistente (registro em `returned` para a tela avisar). */
export function checkHolds() {
  seedHolds();
  ensureTicker();
  if (!assistantAnswering()) return;
  let changed = false;
  for (const [id, h] of Object.entries(holds)) {
    if (sessionElapsedMs() - h.start < TEAM_HOLD_MS) continue;
    const c = conversations.find((x) => x.id === id);
    if (!c || c.handler === 'ia' || c.resolved) {
      delete holds[id];
      continue;
    }
    if (c.waiting) continue;
    delete holds[id];
    const at = plusMinutes(h.clock, 120);
    Object.assign(c, { handler: 'ia', returnedAt: at });
    returned = [...returned, { id, name: c.name, at }];
    changed = true;
  }
  if (changed) notifyConversations();
}
export function startHold(id: string, clock = NOW) {
  holds[id] = { start: sessionElapsedMs(), clock };
  ensureTicker();
}
export function clearHold(id: string) {
  delete holds[id];
}
/** Quanto falta para a conversa voltar sozinha para a assistente (null = não está correndo). */
export function holdRemainingMs(id: string): number | null {
  seedHolds();
  ensureTicker();
  const h = holds[id];
  if (!h) return null;
  return Math.max(0, TEAM_HOLD_MS - (sessionElapsedMs() - h.start));
}
export function takeReturned(): Returned[] {
  const out = returned;
  returned = [];
  return out;
}
/** @deprecated W4: nomes antigos (pausa de 10 min). */
export const checkPauses = checkHolds;
export const startPause = (id: string) => startHold(id);
export const clearPause = clearHold;
export const pauseRemainingMs = holdRemainingMs;
export const takeResumed = takeReturned;

/** W4 (G7): “Assumir conversa”: fica com a equipe; se a última mensagem é do cliente, entra em “Aguardando você”. */
export function takeOver(id: string) {
  const c = conversations.find((x) => x.id === id);
  if (!c) return;
  const last = (conversationThreads[id] ?? []).at(-1);
  const waiting = last?.sender === 'client' && c.lastInboundAt ? { kind: 'equipe' as const, since: c.lastInboundAt } : undefined;
  Object.assign(c, { handler: 'voce', waiting, resolved: false, resolvedAt: undefined, returnedAt: undefined });
  startHold(id);
  notifyConversations();
}

/** W4 (G6): texto SIMULADO da resposta imediata da assistente ao receber a conversa de volta. */
export const handBackReply = (name: string) => `Oi, ${name.split(' ')[0]}! Desculpe a demora. Já vi sua mensagem e sigo com você por aqui.`;

/**
 * W4 (11/11/2026, Christian, G6): “Devolver para a assistente”. Se a última mensagem é do cliente, a assistente responde
 * na hora (SIMULADO: entra a mensagem `handBackReply`). Senão, ela responde a partir da próxima mensagem do cliente.
 */
export function handBack(id: string) {
  const c = conversations.find((x) => x.id === id);
  if (!c) return { answered: false };
  clearHold(id);
  const last = (conversationThreads[id] ?? []).at(-1);
  const answerNow = last?.sender === 'client';
  Object.assign(c, { handler: 'ia', waiting: undefined, resolved: false, resolvedAt: undefined, returnedAt: undefined });
  if (answerNow) {
    const text = handBackReply(c.name);
    conversationThreads[id] = [...(conversationThreads[id] ?? []), { id: `devolver-${Date.now()}`, sender: 'lia', timestamp: NOW, text, status: 'sent' }];
    Object.assign(c, { preview: `Assistente: ${text}`, time: NOW });
  }
  notifyConversations();
  return { answered: answerNow };
}

/* ───────────── W4 (11/11/2026, Christian, A2-09): confirmação PRONTA depois de agendar pela conversa ─────────────
 * Mesmo mecanismo da oferta de vaga do W1 (mensagem fixa no topo da conversa com o botão de enviar). Texto aprovado pelo
 * Christian em 11/11. Sai pelo mesmo envio da equipe (com a janela de 24 h fechada, como mensagem aprovada).
 */
export type ReadyMessage = {title: string;text: string;sendLabel: string;};
const ready: Record<string, ReadyMessage> = {};
export const readyMessageOf = (id: string) => ready[id];
export function setReadyMessage(id: string, msg: ReadyMessage) {
  ready[id] = msg;
  notifyConversations();
}
export function clearReadyMessage(id: string) {
  delete ready[id];
  notifyConversations();
}
const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** "Oi, Carla! Seu horário está marcado: Drenagem linfática com Juliana, quinta, 01/10, às 14:30. Pode confirmar?" */
export function bookingConfirmationText(clientName: string, service: string, professional: string, iso: string, time: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `Oi, ${clientName.split(' ')[0]}! Seu horário está marcado: ${service} com ${professional}, ${wd}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}, às ${time}. Pode confirmar?`;
}

/** G1 subetapas 2 e 3 — DATA dos registros de conversa (FIXTURE DA AMOSTRA). */
export const CONVERSATION_RECORDS_FROM = '2026-10-01';

export type ConversationEvent = {id: string;clientId: string;iso: string;kind: 'pediu-preco' | 'pediu-horario';service: string;professionalId: string;};
export const conversationEvents: ConversationEvent[] = [
{ id: 'amostra-conv-priscila-0915', clientId: 'priscila-duarte', iso: '2026-09-15', kind: 'pediu-preco', service: 'Limpeza de pele', professionalId: 'juliana' },
{ id: 'amostra-conv-rodrigo-0929', clientId: 'rodrigo-pires', iso: '2026-09-29', kind: 'pediu-preco', service: 'Drenagem linfática', professionalId: 'juliana' }];


export type ConversationSummary = {
  name: string;
  phone: string;
  fields: {label: string;value: string;}[];
  recordPath: string;
};

/**
 * T1 (FIXTURE DA AMOSTRA). T1 1b: `day` nas mensagens que não são de hoje (separadores de dia) e o lembrete da Gabriela
 * como MENSAGEM APROVADA, com os botões que ela viu. T1 1c: o texto do lembrete é o corpo REAL de `lembrete_confirmacao`
 * (backend `notifications/templates.py`), preenchido com o agendamento dela.
 * R1b (06/11/2026, Christian, A-40/A-44): a conversa da Priscila segue o caso de Oportunidades (1ª mensagem 16/09,
 * 2ª 18/09) e o pedido de ajuda passa a ser crível: a assistente ofereceu o único sábado com atendimento (10/10,
 * igual ao Conhecimento), a cliente pediu outro sábado e a assistente chamou a equipe.
 */
export const conversationThreads: Record<string, ThreadMessage[]> = {
  'ana-ribeiro': anaThread,
  'bruno-costa': [
  { id: 'b1', sender: 'client', timestamp: '08:58', text: 'Bom dia! Queria fazer mais uma drenagem fora do pacote.' },
  { id: 'b2', sender: 'lia', timestamp: '08:59', text: 'Bom dia, Bruno! Posso agendar sim. A sessão avulsa de Drenagem linfática custa R$ 150,00.' },
  { id: 'b3', sender: 'client', timestamp: '09:00', text: 'Consigo pagar a drenagem no cartão em duas vezes?' },
  { id: 'b4', sender: 'lia', timestamp: '09:00', text: 'Vou confirmar isso com a equipe da clínica e já te respondo por aqui.' }],

  'carla-mendes': [
  { id: 'c1', sender: 'lia', timestamp: '08:38', text: 'Oi, Carla! Obrigada por vir hoje. Qualquer dúvida sobre os cuidados depois da limpeza, é só me chamar.' },
  { id: 'c2', sender: 'client', timestamp: '08:40', text: 'A pele ficou ótima!' },
  // W4 (A2-16): a assistente só promete o lembrete quando o modo de envio é Automático.
  { id: 'c3', sender: 'lia', timestamp: '08:41', text: 'Que bom! Qualquer dúvida sobre os cuidados, é só me chamar por aqui.', textFor: (mode) => mode === 'automatico' ? 'Que bom! Daqui a 30 dias eu te lembro do próximo retorno.' : 'Que bom! Qualquer dúvida sobre os cuidados, é só me chamar por aqui.' },
  { id: 'c4', sender: 'client', timestamp: '08:41', text: 'Obrigada! Até a próxima.' },
  { id: 'c5', sender: 'team', via: 'celular', timestamp: '09:14', text: 'Que bom, Carla! Qualquer coisa, estamos por aqui.' }],

  'fernanda-lima': [
  // W4 (A5-08): quem ofereceu a vaga segue a automação da lista de espera (desligada na amostra = a equipe, pelo painel).
  {
    id: 'f1',
    get sender(): ThreadMessage['sender'] {
      return waitlistOfferAuto() ? 'lia' : 'team';
    },
    get via(): ThreadMessage['via'] {
      return waitlistOfferAuto() ? undefined : 'painel';
    },
    timestamp: '08:00',
    text: 'Oi, Fernanda! Abriu um horário de Drenagem linfática com a Juliana na sexta, 2/10, às 09:30. Quer ficar com ele?'
  },
  { id: 'f2', sender: 'client', timestamp: '08:09', text: 'Sexta de manhã fica ótimo, pode confirmar.' }],

  'gabriela-rocha': [
  { id: 'g1', sender: 'lia', day: '2026-09-30', timestamp: '17:02', template: { title: 'Lembrete de horário', buttons: ['Confirmar', 'Remarcar', 'Cancelar'] }, text: 'Olá Gabriela! Passando para lembrar do seu horário: Peeling químico com Rafael em 01/10/2026 às 15:30. Podemos confirmar sua presença?' },
  { id: 'g2', sender: 'client', day: '2026-09-30', timestamp: '17:20', text: 'Pode sim!' },
  { id: 'g3', sender: 'client', day: '2026-09-30', timestamp: '17:21', text: 'Quanto tempo depois do peeling posso tomar sol?' },
  { id: 'g4', sender: 'client', timestamp: '09:14', audio: { duration: '0:21' } },
  { id: 'g5', sender: 'lia', timestamp: '09:15', text: 'Recebi seu áudio, mas por aqui não consigo ouvir. Já chamei a equipe para te responder.' }],

  'helena-duarte': [
  // W4 (A2-01): mandada pela EQUIPE (envios pausados), com o texto da 1ª mensagem do caso do pacote (fu-pacote-pk5).
  { id: 'hd1', sender: 'team', via: 'painel', day: '2026-09-30', timestamp: '10:00', text: 'Oi, Helena! Você ainda tem sessões de peeling químico no seu pacote. Quer agendar a próxima? A Dra. Carolina tem horários nesta semana.' },
  { id: 'hd2', sender: 'client', day: '2026-09-30', timestamp: '18:12', text: 'Oi! Quero sim. Tem horário na semana que vem, de manhã?' }],

  'priscila-duarte': [
  { id: 'pd1', sender: 'client', day: '2026-09-15', timestamp: '14:20', text: 'Oi, quanto custa a limpeza de pele?' },
  { id: 'pd2', sender: 'lia', day: '2026-09-15', timestamp: '14:21', text: 'Oi, Priscila! A Limpeza de pele custa R$ 180,00 e dura 60 minutos. Quer que eu veja um horário?' },
  { id: 'pd3', sender: 'lia', day: '2026-09-16', timestamp: '09:30', text: 'Oi, Priscila! Ficou alguma dúvida sobre a Limpeza de pele? Se quiser, vejo um horário pra você com a Juliana.' },
  { id: 'pd3b', sender: 'lia', day: '2026-09-18', timestamp: '09:30', text: 'Priscila, ainda tenho horários para limpeza de pele nesta semana. Quer que eu reserve um?' },
  { id: 'pd4', sender: 'client', day: '2026-09-30', timestamp: '10:58', text: 'Pode ser num sábado de manhã?' },
  { id: 'pd5', sender: 'lia', day: '2026-09-30', timestamp: '10:59', text: 'Aos sábados a clínica normalmente não abre. O próximo sábado com atendimento é 10/10, das 08:00 às 12:00, com a Juliana. Quer que eu veja um horário nesse dia?' },
  { id: 'pd6', sender: 'client', day: '2026-09-30', timestamp: '11:00', text: 'Nesse dia não consigo. Não tem outro sábado?' },
  { id: 'pd7', sender: 'lia', day: '2026-09-30', timestamp: '11:01', text: 'Vou ver com a equipe da clínica e já te respondo por aqui.' }],

  // W4 (A4-13): pediu o preço em 29/09; a 1ª mensagem do acompanhamento (30/09) não foi entregue.
  'rodrigo-pires': [
  { id: 'r1', sender: 'client', day: '2026-09-29', timestamp: '14:05', text: 'Oi! Quanto custa a drenagem linfática?' },
  { id: 'r2', sender: 'lia', day: '2026-09-29', timestamp: '14:06', text: 'Oi, Rodrigo! A sessão avulsa de Drenagem linfática custa R$ 150,00 e dura 50 minutos. Quer que eu veja um horário com a Juliana?' },
  { id: 'r3', sender: 'lia', day: '2026-09-30', timestamp: '09:30', text: 'Oi, Rodrigo! Ficou alguma dúvida sobre drenagem linfática? Se quiser, vejo um horário para você com Juliana.', status: 'failed', failedText: 'Não entregue · o WhatsApp não entregou esta mensagem' }],

  'diego-alves': [
  { id: 'd1', sender: 'client', day: '2026-09-29', timestamp: '15:10', text: 'Oi, queria saber se tem horário para toxina essa semana.' },
  { id: 'd2', sender: 'team', day: '2026-09-29', timestamp: '15:30', text: 'Oi, Diego! Aqui é a Marina. Tenho terça às 14:00 ou quarta às 10:00 com a Dra. Carolina.' },
  { id: 'd3', sender: 'client', day: '2026-09-29', timestamp: '15:42', text: 'Vou ver minha agenda e te aviso.' },
  { id: 'd4', sender: 'team', via: 'painel', day: '2026-09-29', timestamp: '15:50', text: 'Combinado, Diego! Fico no aguardo.' }]

};

export const conversationSummaries: Record<string, ConversationSummary> = {
  'ana-ribeiro': { ...anaSummary, recordPath: '/clientes/ana-ribeiro' },
  'bruno-costa': { name: 'Bruno Costa', phone: '(19) 99812-5530', recordPath: '/clientes', fields: [] },
  'carla-mendes': { name: 'Carla Mendes', phone: '(19) 99723-0914', recordPath: '/clientes', fields: [] },
  'fernanda-lima': { name: 'Fernanda Lima', phone: '(19) 99134-6602', recordPath: '/clientes', fields: [] },
  'gabriela-rocha': { name: 'Gabriela Rocha', phone: '(19) 99287-4415', recordPath: '/clientes', fields: [] },
  'diego-alves': { name: 'Diego Alves', phone: '(19) 99905-2271', recordPath: '/clientes', fields: [] },
  'helena-duarte': { name: 'Helena Duarte', phone: '(19) 99356-1180', recordPath: '/clientes/helena-duarte', fields: [] },
  'priscila-duarte': { name: 'Priscila Duarte', phone: '(19) 99561-2047', recordPath: '/clientes', fields: [] },
  'rodrigo-pires': { name: 'Rodrigo Pires', phone: '', recordPath: '/clientes/rodrigo-pires', fields: [] }
};

/** Garante que existe uma conversa de exemplo para um cliente ("Abrir em Conversas"). SIMULAÇÃO: nada é enviado. */
export function ensureConversation(id: string, name: string, firstMessage?: string) {
  if (!conversations.some((c) => c.id === id)) {
    conversations.push({ id, name, preview: firstMessage ? `Assistente: ${firstMessage}` : 'Sem mensagens ainda.', time: 'Hoje', unread: 0, handler: 'ia', fromAiOutreach: !!firstMessage });
  }
  if (!conversationThreads[id]) conversationThreads[id] = [];
  if (!conversationSummaries[id]) conversationSummaries[id] = { name, phone: '', recordPath: '/clientes', fields: [] };
}

/** Registra no histórico de exemplo a mensagem do envio simulado. */
export function appendSimulatedMessage(id: string, name: string, text: string) {
  ensureConversation(id, name, text);
  conversationThreads[id] = [...conversationThreads[id], { id: `sim-${Date.now()}-${conversationThreads[id].length}`, sender: 'lia', timestamp: NOW, text }];
  const c = conversations.find((x) => x.id === id);
  if (c) Object.assign(c, { preview: `Assistente: ${text}`, time: NOW });
  notifyConversations();
}

/** G4 (F-068): as mensagens de exemplo que já apareciam como lidas guardam essa situação como registro. */
for (const list of Object.values(conversationThreads)) for (const m of list) if (m.sender !== 'client' && !m.status) m.status = 'read';

/** W4: quem mandou a última mensagem de cada conversa (lido pela regra de dono em data/conversas.ts). */
registerLastSender((id) => conversationThreads[id]?.at(-1)?.sender);

/** Redesenha a cada `ms` (contagem "volta em N min"). */
export function useTick(ms = 15000) {
  const [, setN] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}