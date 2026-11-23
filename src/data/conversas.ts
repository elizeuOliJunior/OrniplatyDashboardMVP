import { absMin, nowAbsMin } from './replyWindow';
import { accountSummary, getSettings, waKey } from './settingsStore';
import { NOW, TODAY_ISO } from './agendaStore';
import { waitlistAutomationOn } from './automacoes';

export type ConversationBadgeTone = 'info' | 'warning';

/**
 * T1 1b (04/11/2026): abas da lista. 'acionamentos' e 'resolvidas' ficam só por compatibilidade.
 * W4 (11/11/2026, Christian, G7): aba nova "Com você" (`comvoce`) = conversas que estão com a equipe e não têm mensagem
 * do cliente esperando resposta. Ordem: Todas · Aguardando você · Com você · Com a assistente.
 */
export type ConversationFilter = 'todas' | 'aguardando' | 'comvoce' | 'ia' | 'resolvidas' | 'acionamentos';

export type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  badge?: {label: string;tone: ConversationBadgeTone;};
  /**
   * Com quem está a conversa.
   * W4 (11/11/2026, Christian, G7): REGRA ÚNICA. `voce` = alguém da equipe respondeu ou assumiu; a conversa fica com a
   * equipe até “Devolver”. Depois de 2 horas sem ação da equipe (e sem mensagem do cliente esperando), volta sozinha
   * para a assistente, com aviso (data/conversasThreads.ts `checkHolds`). `pausa` (a antiga pausa de ~10 min) NÃO é mais
   * gravada; se aparecer, vale como `voce`.
   */
  handler: 'voce' | 'ia' | 'pausa';
  /** True when the conversation started from an automatic AI outreach (reativação, lista de espera, retorno…) */
  fromAiOutreach?: boolean;
  /** T1 (O-01): última mensagem RECEBIDA do cliente ("AAAA-MM-DDTHH:mm"). A janela de 24 h conta daqui. */
  lastInboundAt?: string;
  /** T1 (O-01, cenário "Envio recusado"): o envio falhou porque a janela fechou enquanto a equipe escrevia. */
  windowClosed?: boolean;
  /**
   * T1 (O-02): na fila "Aguardando você" desde `since` (`ia` = a assistente pediu ajuda; `equipe` = a conversa está com a
   * equipe e há mensagem do cliente sem resposta). `aiOff` = espera DERIVADA (assistente desligada ou parada, ou sem
   * resposta dela em 15 min), nunca gravada.
   */
  waiting?: {kind: 'ia' | 'equipe';since: string;reason?: string;aiOff?: boolean;};
  /** W4 (G7): a conversa voltou sozinha para a assistente depois de 2 h sem ação da equipe ("HH:MM" do relógio do protótipo). */
  returnedAt?: string;
  /** T1 1b / 1l: conversa encerrada pelo sistema (sem botão no Painel). */
  resolved?: boolean;
  resolvedAt?: string;
};

export type ThreadMessage = {
  id: string;
  sender: 'lia' | 'client' | 'team';
  timestamp: string;
  /** T1 1b: dia da mensagem ("AAAA-MM-DD"). Sem valor = hoje (relógio do protótipo). Usado nos separadores de dia. */
  day?: string;
  text?: string;
  audio?: {duration: string;transcript?: string;};
  /** T1 1b: mensagem PRONTA (modelo aprovado no WhatsApp), com o título e os botões que o cliente viu. */
  template?: {title: string;buttons?: string[];};
  /** Team messages: where it was sent from. `celular` = another device using the same WhatsApp number. */
  via?: 'painel' | 'celular';
  /** G4 (F-068): situação REGISTRADA (enviada · entregue · lida). T1 (O-01): `failed` = não saiu. */
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  /** W4 (A4-13): texto do "não saiu" quando não é a janela de 24 h (ex.: número sem WhatsApp). */
  failedText?: string;
  /** W4 (A2-16): texto que depende do modo de envio salvo (a assistente só promete lembrete no Automático). */
  textFor?: (mode: 'automatico' | 'supervisionado' | 'pausado') => string;
};

/** Abas (T1 1b; 1l sem "Resolvidas"; W4 com "Com você"). O número de cada aba é calculado na tela, nunca escrito aqui. */
export const conversationFilters: {value: ConversationFilter;label: string;}[] = [
{ value: 'todas', label: 'Todas' },
{ value: 'aguardando', label: 'Aguardando você' },
{ value: 'comvoce', label: 'Com você' },
{ value: 'ia', label: 'Com a assistente' }];


/* ───────────── W4 (11/11/2026): quem está com a conversa ─────────────
 * Regra única (decisões G5, G7, A2-17, A5-01, A5-14 de 11/11/2026):
 *  - "Com a assistente": `handler 'ia'`, a assistente está ATENDENDO (ligada, sem limite, WhatsApp funcionando) e a última
 *    mensagem do cliente não está sem resposta há 15 min ou mais.
 *  - "Aguardando você": a última mensagem é do cliente e ninguém está respondendo. Entra quando a assistente pede ajuda
 *    (gravado em `waiting`), quando ela não responde em 15 min (G5, derivado) ou quando ela está DESLIGADA ou PARADA
 *    (limite do mês, cartão, WhatsApp; derivado, mesma regra e mesmo texto).
 *  - "Com você": `handler 'voce'` sem mensagem esperando, ou conversa da assistente parada/desligada em que o cliente não
 *    está esperando resposta (derivado).
 * Desligar ou parar NÃO grava nada na conversa: ao voltar, a assistente retoma só o que era dela.
 */

/** Prazo para a assistente responder antes de a conversa ir para "Aguardando você" (G5). */
export const AI_REPLY_MIN = 15;

/** Quem mandou a última mensagem (registrado por data/conversasThreads.ts, que guarda as mensagens). */
let lastSenderOf: (id: string) => ThreadMessage['sender'] | undefined = () => undefined;
export function registerLastSender(fn: (id: string) => ThreadMessage['sender'] | undefined) {
  lastSenderOf = fn;
}
export const lastFromClient = (id: string) => lastSenderOf(id) === 'client';

/** A assistente está respondendo clientes agora (nem desligada, nem parada). */
export const assistantAnswering = () => accountSummary(getSettings()).assistant.answering;
/** Desligada por você (os dois escopos). */
export const assistantOff = () => !getSettings().ai.enabled;

export const AI_OFF_REASON = 'A assistente foi desligada e esta conversa estava com ela. Responda você ou ligue a assistente de novo.';
export const AI_NO_REPLY_REASON = 'A assistente não respondeu a última mensagem do cliente em 15 minutos. Responda você.';
/** Motivo da espera quando a assistente parou sozinha (mesmo padrão do desligamento manual). */
function stoppedReason() {
  const reason = accountSummary(getSettings()).assistant.reason;
  if (reason === 'whatsapp')
  return waKey(getSettings()) === 'desconectado' ?
  'A assistente parou (o WhatsApp está desconectado) e esta conversa estava com ela. Responda pelo celular até reconectar.' :
  'A assistente parou (o WhatsApp não está funcionando) e esta conversa estava com ela. Responda pelo celular até resolver.';
  if (reason === 'cartao') return 'A assistente parou (o cartão recusou o uso extra) e esta conversa estava com ela. Responda você.';
  return 'A assistente parou (o limite do mês acabou) e esta conversa estava com ela. Responda você.';
}

type Owned = Pick<Conversation, 'id' | 'handler' | 'waiting' | 'resolved' | 'lastInboundAt'>;
const withAi = (c: Owned) => c.handler === 'ia' && !c.resolved;
/** Conversa da assistente com ela desligada ou parada. */
const heldByStop = (c: Owned) => withAi(c) && !assistantAnswering();
/** G5: a assistente está atendendo, a última mensagem é do cliente e passou o prazo sem resposta. */
const aiNoReply = (c: Owned) =>
withAi(c) && assistantAnswering() && lastFromClient(c.id) && !!c.lastInboundAt && nowAbsMin() - absMin(c.lastInboundAt) >= AI_REPLY_MIN;

/** "01/10, 09:20" → "2026-10-01T09:20" (ano do relógio do protótipo). */
function aiOffSince() {
  const m = /^(\d{2})\/(\d{2}), (\d{2}:\d{2})$/.exec(getSettings().ai.disabledAt ?? '');
  return m ? `${TODAY_ISO.slice(0, 4)}-${m[2]}-${m[1]}T${m[3]}` : `${TODAY_ISO}T${NOW}`;
}

/** A espera que vale (a gravada ou a derivada). Use no lugar de `conv.waiting`. */
export function waitingOf(conv: Owned): Conversation['waiting'] {
  if (conv.waiting) return conv.waiting;
  if (heldByStop(conv) && lastFromClient(conv.id)) {
    const off = assistantOff();
    // Espera desde a mensagem do cliente ou desde o desligamento (o que veio por último).
    const since = off ? [aiOffSince(), conv.lastInboundAt ?? ''].sort().slice(-1)[0] : conv.lastInboundAt ?? `${TODAY_ISO}T${NOW}`;
    return { kind: 'ia', since, reason: off ? AI_OFF_REASON : stoppedReason(), aiOff: true };
  }
  if (aiNoReply(conv)) return { kind: 'ia', since: conv.lastInboundAt!, reason: AI_NO_REPLY_REASON, aiOff: true };
  return undefined;
}

/** Está na fila "Aguardando você"? Fonte ÚNICA da fila, do filtro, do contador do menu, do Início e do sino. */
export const inQueue = (conv: Owned) => conv.handler !== 'ia' && !!conv.waiting && !conv.resolved || !conv.waiting && !!waitingOf(conv);
export const waitingCount = (list: Conversation[]) => list.filter(inQueue).length;
/** Com a assistente agora: ela atende e ninguém espera. Com ela desligada ou parada, nenhuma. */
export const withAssistant = (conv: Owned) => withAi(conv) && assistantAnswering() && !inQueue(conv);
/** W4 (G7): "Com você" — está com a equipe e nada espera resposta. */
export const withTeam = (conv: Owned) => !conv.resolved && !inQueue(conv) && (conv.handler !== 'ia' || heldByStop(conv));
export const teamCount = (list: Conversation[]) => list.filter(withTeam).length;
export const waitMinutes = (conv: Owned) => {
  const w = waitingOf(conv);
  return w ? Math.max(0, nowAbsMin() - absMin(w.since)) : 0;
};
export const byLongestWait = (a: Conversation, b: Conversation) => waitMinutes(b) - waitMinutes(a);

/** G4 (F-068) / T1: "Aguardando você" só para quem está na fila. Mantido para telas antigas. */
export function handlerBadge(conv: Owned): {label: string;tone: ConversationBadgeTone;} | null {
  if (inQueue(conv)) return { label: 'Aguardando você', tone: 'warning' };
  return null;
}
export const originBadge = (conv: Conversation) => conv.badge && conv.badge.label !== 'Aguardando você' ? conv.badge : null;

/** Filtro das abas + "Iniciadas pela Orniplaty" (menu Filtrar). */
export function matchesFilter(conv: Conversation, filter: ConversationFilter, orniOnly = false) {
  if (orniOnly && !conv.fromAiOutreach) return false;
  if (filter === 'aguardando') return inQueue(conv);
  if (filter === 'comvoce') return withTeam(conv);
  if (filter === 'ia') return withAssistant(conv);
  if (filter === 'resolvidas') return !!conv.resolved;
  if (filter === 'acionamentos') return Boolean(conv.fromAiOutreach);
  return true;
}

/**
 * W4 (11/11/2026, A5-08, nota do arquiteto depois do W1): a conversa da Fernanda segue a automação "Oferecer vaga para a
 * lista de espera" SALVA em IA Orniplaty › Automações. Desligada (como vem na amostra): quem ofereceu a vaga foi a equipe
 * (W1: "Desligada, é a equipe que chama o cliente") e a conversa espera você. Ligada: a assistente ofereceu a vaga e pediu
 * ajuda para marcar.
 * I1 (11/11/2026, integração, item 15): o leitor é o da faixa W6, `waitlistAutomationOn()` (data/automacoes.ts). O nome
 * antigo `waitlistOfferAuto` continua exportado, apontando para ele, para quem já importava daqui.
 */
export const waitlistOfferAuto = waitlistAutomationOn;

/**
 * W9b (12/11/2026, A3-24): quando a vaga aceita pela lista de espera deixa de existir (o dia fechou em Funcionamento,
 * ausência, bloqueio), o texto de espera da conversa e o aviso do sino não mandam mais marcar o horário: dizem o motivo e
 * o que fazer (cancelar a oferta e avisar). Quem calcula é data/waitlistOffer.ts (`suspendedOfferNote`), que se registra
 * aqui ao carregar; assim este arquivo não importa a agenda.
 */
// `var` sem valor inicial: pode ser registrado antes deste arquivo terminar de carregar (ordem de importação).
// eslint-disable-next-line no-var
var suspendedOfferNoteOf: ((clientName: string) => string | null) | undefined;
export function setSuspendedOfferNote(fn: (clientName: string) => string | null) {
  suspendedOfferNoteOf = fn;
}
const FERNANDA_ACCEPTED = 'Cliente aceitou o horário de sexta, 2/10, às 09:30';
const fernandaWaiting: NonNullable<Conversation['waiting']> = {
  kind: 'ia',
  since: '2026-10-01T08:10',
  get aiOff() {
    return !waitlistOfferAuto();
  },
  get reason() {
    const suspended = suspendedOfferNoteOf?.('Fernanda Lima');
    if (suspended) return suspended;
    return waitlistOfferAuto() ?
    `${FERNANDA_ACCEPTED}, oferecido pela assistente para a lista de espera. Marque o horário e confirme com a cliente.` :
    `${FERNANDA_ACCEPTED}, que a equipe ofereceu pela lista de espera. Marque o horário e confirme com a cliente.`;
  }
};

/**
 * FIXTURE DA AMOSTRA. Fila: Priscila (desde ontem, 30/09 11:01), Fernanda (70 min, vermelho), Bruno (20 min, âmbar), Gabriela (5 min, sem etiqueta).
 * R1 (06/11/2026, Christian, D2): a Priscila ENTROU na fila (a assistente pediu ajuda em 30/09, como diz o caso de Oportunidades).
 * R1b (06/11/2026, Christian, A-44): o motivo da Priscila mudou (ela quer um sábado que não seja o 10/10; a assistente sabe
 * responder sobre sábados, mas não pode abrir outro dia).
 * R1 (06/11/2026, Christian, D1): a Fernanda aceitou sexta, 2/10, às 09:30 (antes 11:30, que passava do almoço da Juliana).
 * Janela: Priscila fechando (1h40), Diego parado (29/09).
 * W4 (11/11/2026, Christian):
 *  - Ana (A2-04, promessa 11): a conversa é a do PACOTE (mensagens de 11/08, 18/08 e 24/09; ela respondeu em 25/09 e marcou
 *    01/10 e 02/10 às 09:00). Mesmo motivo e mesmas datas de Oportunidades, Início e Agenda. Saiu a troca de hoje às 09h10
 *    ("retorno"), que acontecia durante o atendimento dela.
 *  - Carla (G7): a equipe respondeu pelo celular às 09:14 → a conversa está "Com você" (antes "Pausada").
 *  - Diego (G7): voltou para a assistente em 29/09, 2 h depois da última resposta da equipe.
 *  - Helena (A2-01, G5): a mensagem de 30/09 foi mandada pela equipe (envios pausados); ela respondeu às 18:12 e a
 *    assistente não respondeu → "Aguardando você" pela regra dos 15 minutos (derivado, nada gravado).
 *  - Rodrigo (A4-13): conversa nova. Pediu o preço da drenagem em 29/09; a 1ª mensagem do acompanhamento (30/09) não foi entregue.
 */
export const conversations: Conversation[] = [
{ id: 'ana-ribeiro', name: 'Ana Ribeiro', preview: 'Agendado: sexta, 2/10, às 09:00, Limpeza de pele com a Dra. Carolina.', time: '25/09', unread: 0, handler: 'ia', fromAiOutreach: true, lastInboundAt: '2026-09-25T10:06' },
{ id: 'bruno-costa', name: 'Bruno Costa', preview: 'Consigo pagar a drenagem no cartão em duas vezes?', time: '09:00', unread: 2, handler: 'voce', lastInboundAt: '2026-10-01T09:00', waiting: { kind: 'ia', since: '2026-10-01T09:00', reason: 'Cliente pergunta se pode pagar a drenagem no cartão em duas vezes' } },
{ id: 'carla-mendes', name: 'Carla Mendes', preview: 'Você: Que bom, Carla! Qualquer coisa, estamos por aqui.', time: '09:14', unread: 0, handler: 'voce', lastInboundAt: '2026-10-01T08:41' },
{ id: 'fernanda-lima', name: 'Fernanda Lima', preview: 'Sexta de manhã fica ótimo, pode confirmar.', time: '08:09', unread: 1, badge: { label: 'Lista de espera', tone: 'info' }, handler: 'voce', get fromAiOutreach() {return waitlistOfferAuto();}, lastInboundAt: '2026-10-01T08:09', waiting: fernandaWaiting },
{ id: 'gabriela-rocha', name: 'Gabriela Rocha', preview: 'Áudio (0:21)', time: '09:14', unread: 1, handler: 'voce', fromAiOutreach: true, lastInboundAt: '2026-10-01T09:14', waiting: { kind: 'ia', since: '2026-10-01T09:15', reason: 'O cliente enviou algo que a IA não consegue ler (áudio, imagem ou documento). Assuma a conversa.' } },
{ id: 'diego-alves', name: 'Diego Alves', preview: 'Você: Combinado, Diego! Fico no aguardo.', time: '29/09', unread: 0, handler: 'ia', lastInboundAt: '2026-09-29T15:42' },
{ id: 'helena-duarte', name: 'Helena Duarte', preview: 'Oi! Quero sim. Tem horário na semana que vem, de manhã?', time: 'Ontem', unread: 0, handler: 'ia', fromAiOutreach: true, lastInboundAt: '2026-09-30T18:12' },
{ id: 'priscila-duarte', name: 'Priscila Duarte', preview: 'Nesse dia não consigo. Não tem outro sábado?', time: 'Ontem', unread: 1, handler: 'voce', fromAiOutreach: true, lastInboundAt: '2026-09-30T11:00', waiting: { kind: 'ia', since: '2026-09-30T11:01', reason: 'Cliente quer um sábado de manhã que não seja 10/10 (o único sábado com atendimento). A assistente não pode abrir outro sábado e pediu a sua ajuda.' } },
{ id: 'rodrigo-pires', name: 'Rodrigo Pires', preview: 'Assistente: Oi, Rodrigo! Ficou alguma dúvida sobre drenagem linfática?', time: '30/09', unread: 0, handler: 'ia', fromAiOutreach: false, lastInboundAt: '2026-09-29T14:05' }];


/**
 * W4 (11/11/2026, A2-04): conversa do PACOTE da Ana (mesmos textos e datas do caso `fu-pacote-pk3` em data/followUp.ts).
 * As três mensagens saíram antes dos envios pausados; ela respondeu em 25/09 e marcou as duas sessões.
 */
export const anaThread: ThreadMessage[] = [
{ id: 'm1', sender: 'lia', day: '2026-08-11', timestamp: '10:00', text: 'Oi, Ana! Você ainda tem sessões de limpeza de pele no seu pacote (pacote parado desde 12/07 · 2 sessões sem usar). Quer agendar a próxima?' },
{ id: 'm2', sender: 'lia', day: '2026-08-18', timestamp: '10:00', text: 'Ana, seu pacote de limpeza de pele está perto de vencer. Posso ver um horário para você?' },
{ id: 'm3', sender: 'lia', day: '2026-09-24', timestamp: '10:00', text: 'Ana, tudo bem? Passando para saber se você quer agendar limpeza de pele. É só responder aqui.' },
{ id: 'm4', sender: 'client', day: '2026-09-25', timestamp: '10:02', text: 'Quero sim! Pode ser dia 1º às 9h?' },
{ id: 'm5', sender: 'lia', day: '2026-09-25', timestamp: '10:03', text: 'Agendado: quinta, 1/10, às 09:00, Limpeza de pele com a Dra. Carolina. Quer deixar a próxima sessão do pacote marcada também?' },
{ id: 'm6', sender: 'client', day: '2026-09-25', timestamp: '10:06', audio: { duration: '0:09', transcript: 'Pode ser no dia seguinte, no mesmo horário.' } },
{ id: 'm7', sender: 'lia', day: '2026-09-25', timestamp: '10:06', text: 'Agendado: sexta, 2/10, às 09:00, Limpeza de pele com a Dra. Carolina.' }];


export const anaSummary = {
  name: 'Ana Ribeiro',
  phone: '(19) 99641-3378',
  fields: [
  { label: 'Próximo horário', value: 'sexta, 2/10, 09:00' },
  { label: 'Último serviço', value: 'Limpeza de pele, 12/07' },
  { label: 'Profissional', value: 'Dra. Carolina' },
  { label: 'Pacote', value: 'Limpeza de pele · 4 de 6 sessões' },
  { label: 'Observações visíveis para a IA', value: 'prefere manhãs' }]

};