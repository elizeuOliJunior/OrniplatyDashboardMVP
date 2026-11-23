/**
 * Resultados (Recebimentos e Gerado pela IA) — LEITOR do protótipo, só front-end. G1 · subetapa 3 (25/10/2026, aprovada).
 *
 * DUAS fontes, separadas e identificadas:
 *  1. AMOSTRA HISTÓRICA (antes de 28/09/2026, `LIVE_FROM`): o gerador determinístico abaixo (mesma data = mesmos
 *     atendimentos). Ela só existe para períodos sem registro vivo; cada evento tem id `amostra:<data>-<n>`. Não cria nada
 *     no mesmo cliente + dia de um registro vivo (reconciliação por identidade, não por data de corte).
 *  2. REGISTROS VIVOS (qualquer data): Agenda (`data/agendaLive.ts`, inclusive os atendimentos antigos que já existem lá),
 *     histórico do cadastro (`data/api/clientes.ts`), fechamentos/coparticipação/repasses (`data/convenios.ts`), reembolsos
 *     (`data/legado.ts`) e parcelas de pacote recebidas (`data/api/pacotes.ts`). Leitura do dinheiro: data/financeReaders.ts.
 * Definições (aprovadas):
 *  - Recebimentos = FLUXO DE CAIXA pela data real de cada pagamento: particular, coparticipação, repasse, parcela de pacote;
 *    reembolso entra como saída na data do reembolso (E1). Nunca muda um período que já passou.
 *  - Ticket médio = valor pago ÷ fechamentos pagos do MESMO período. Fechamento conta UMA vez: no período em que quitou
 *    (convênio: quando tudo foi recebido, pelo total recebido, E2/P1), pelo valor pago menos reembolsos (E1/R1: o período
 *    original é atualizado e a tela diz a data do reembolso). Reembolso total tira o fechamento. R$ 0 não é fechamento pago.
 *    Parcela de pacote não é fechamento: fica em Recebimentos, fora do ticket (sem contagem dupla com a sessão).
 *  - "Gerado pela IA": só agendamento com origem EXPLÍCITA da assistente pelo WhatsApp (`source=whatsapp` +
 *    `created_actor_type=ai_whatsapp`; na amostra, a marca do gerador), atendido e pago no período, com a lista.
 *    Nada é atribuído por semelhança. "Clientes recuperados" = clientes DISTINTOS.
 *  - "Conversas atendidas": só conta onde há registro de conversa com data (`CONVERSATION_RECORDS_FROM`); antes, indisponível.
 * Convênios FICTÍCIOS ("Saúde Mais", "Bem Viver") só na amostra. Nada aqui chama backend (contrato CT-18).
 */

export const RESULTADOS_TODAY = '2026-10-01';

export type DateRange = {from: string;to: string;};
export type ServiceKey = 'limpeza' | 'drenagem' | 'peeling' | 'toxina';
export type ProKey = 'carolina' | 'juliana' | 'rafael';
export type MethodKey = 'pix' | 'credito' | 'debito' | 'dinheiro' | 'convenio';
export type InsurerKey = 'saude-mais' | 'bem-viver';
export type Origin = 'clinica' | 'novo' | 'reativacao' | 'falta';
export type ApptStatus = 'realizado' | 'faltou' | 'cancelado' | 'agendado';

export const SERVICES: Record<ServiceKey, {name: string;price: number;}> = {
  limpeza: { name: 'Limpeza de pele', price: 180 },
  drenagem: { name: 'Drenagem linfática', price: 150 },
  peeling: { name: 'Peeling químico', price: 250 },
  toxina: { name: 'Toxina botulínica', price: 900 }
};
export const SERVICE_ORDER: ServiceKey[] = ['limpeza', 'drenagem', 'peeling', 'toxina'];

export const PROS: Record<ProKey, {name: string;}> = {
  carolina: { name: 'Dra. Carolina' },
  juliana: { name: 'Juliana' },
  rafael: { name: 'Rafael' }
};
export const PRO_ORDER: ProKey[] = ['carolina', 'juliana', 'rafael'];

export const METHODS: Record<MethodKey, string> = {
  pix: 'Pix',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  dinheiro: 'Dinheiro',
  convenio: 'Convênio'
};
export const METHOD_ORDER: MethodKey[] = ['pix', 'credito', 'debito', 'dinheiro', 'convenio'];

export const INSURERS: Record<InsurerKey, {name: string;termDays: number;}> = {
  'saude-mais': { name: 'Saúde Mais', termDays: 30 },
  'bem-viver': { name: 'Bem Viver', termDays: 45 }
};
export const INSURER_ORDER: InsurerKey[] = ['saude-mais', 'bem-viver'];

export const ORIGIN_LABEL: Record<Exclude<Origin, 'clinica'>, string> = {
  novo: 'Novo contato',
  reativacao: 'Reativação',
  falta: 'Remarcação de falta'
};
/** Origem da conversa nos agendamentos da assistente. */
export const ASSISTANT_ORIGINS: Exclude<Origin, 'clinica'>[] = ['novo', 'reativacao', 'falta'];

const CLIENTS = [
{ id: 'ana-ribeiro', name: 'Ana Ribeiro' },
{ id: 'bruno-costa', name: 'Bruno Costa' },
{ id: 'carla-mendes', name: 'Carla Mendes' },
{ id: 'diego-alves', name: 'Diego Alves' },
{ id: 'fernanda-lima', name: 'Fernanda Lima' },
{ id: 'gabriela-rocha', name: 'Gabriela Rocha' }];


const HOLIDAYS = new Set([
'2025-11-02', '2025-11-15', '2025-11-20', '2025-12-25',
'2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
'2027-01-01']
);
const RAFAEL_OFF = { from: '2026-10-19', to: '2026-10-23' };

/* ---------- datas ---------- */
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000) + 1;
export const weekdayOf = (iso: string) => toDate(iso).getUTCDay();
export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const WEEKDAY_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const dmy = (iso: string) => `${dm(iso)}/${iso.slice(0, 4)}`;
export const dayTitle = (iso: string) => `${WEEKDAY_SHORT[weekdayOf(iso)]}, ${dm(iso)}`;
export function isClosed(iso: string) {
  return weekdayOf(iso) === 0 || HOLIDAYS.has(iso);
}

/* ---------- gerador determinístico ---------- */
function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pickW<T>(r: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
}

export type Appt = {
  id: string;
  iso: string;
  time: string;
  clientId: string;
  client: string;
  service: ServiceKey;
  pro: ProKey;
  price: number;
  status: ApptStatus;
  origin: Origin;
  payer: 'particular' | 'convenio';
  insurer?: InsurerKey;
  /** particular: forma de pagamento; undefined enquanto "a fechar" */
  method?: Exclude<MethodKey, 'convenio'>;
  /** particular realizado e pago no dia */
  paid: boolean;
  /** convênio: vencimento pelo prazo do contrato e data em que a operadora pagou (null = ainda não pagou) */
  convDue?: string;
  convPaidOn?: string | null;
};

/** Atendimentos de um dia (por dia de semana: terça é o dia mais cheio). */
const BASE_BY_WEEKDAY = [0, 4, 6, 4, 5, 5, 3];
const cache = new Map<string, Appt[]>();

export function apptsOfDay(iso: string): Appt[] {
  const hit = cache.get(iso);
  if (hit) return hit;
  const list: Appt[] = [];
  if (!isClosed(iso)) {
    const r = rng(seedOf(`vida-plena:${iso}`));
    const x = r();
    const count = Math.max(1, BASE_BY_WEEKDAY[weekdayOf(iso)] + (x < 0.3 ? -1 : x > 0.75 ? 1 : 0));
    const past = iso <= RESULTADOS_TODAY;
    const rafaelOff = iso >= RAFAEL_OFF.from && iso <= RAFAEL_OFF.to;
    let minutes = 9 * 60;
    for (let i = 0; i < count; i++) {
      const service = pickW<ServiceKey>(r, [['limpeza', 38], ['drenagem', 32], ['peeling', 18], ['toxina', 12]]);
      let pro: ProKey =
      service === 'toxina' ?
      'carolina' :
      service === 'peeling' ?
      pickW<ProKey>(r, [['carolina', 60], ['juliana', 40]]) :
      service === 'limpeza' ?
      pickW<ProKey>(r, [['juliana', 50], ['carolina', 25], ['rafael', 25]]) :
      pickW<ProKey>(r, [['rafael', 60], ['juliana', 40]]);
      if (pro === 'rafael' && rafaelOff) pro = 'juliana';
      const client = CLIENTS[Math.floor(r() * CLIENTS.length)];
      const byAssistant = r() < 0.22;
      const origin: Origin = byAssistant ? pickW<Origin>(r, [['novo', 55], ['reativacao', 30], ['falta', 15]]) : 'clinica';
      const st = r();
      const status: ApptStatus = !past ? 'agendado' : st < 0.07 ? 'faltou' : st < 0.12 ? 'cancelado' : 'realizado';
      const convenio = !byAssistant && service !== 'toxina' && r() < 0.14;
      const appt: Appt = {
        id: `${iso}-${i}`,
        iso,
        time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
        clientId: client.id,
        client: client.name,
        service,
        pro,
        price: SERVICES[service].price,
        status,
        origin,
        payer: convenio ? 'convenio' : 'particular',
        paid: false
      };
      minutes += 60 + (r() < 0.5 ? 30 : 0);
      if (status === 'realizado') {
        if (convenio) {
          const insurer: InsurerKey = r() < 0.6 ? 'saude-mais' : 'bem-viver';
          const term = INSURERS[insurer].termDays;
          const late = r() < (insurer === 'saude-mais' ? 0.1 : 0.25);
          const delay = term - 2 + Math.floor(r() * (insurer === 'saude-mais' ? 6 : 8));
          let paidOn = addDays(iso, delay);
          while (isClosed(paidOn)) paidOn = addDays(paidOn, 1); // repasse só cai em dia útil
          appt.insurer = insurer;
          appt.convDue = addDays(iso, term);
          appt.convPaidOn = !late && paidOn <= RESULTADOS_TODAY ? paidOn : null;
        } else {
          const recent = daysBetween(iso, RESULTADOS_TODAY) <= 3;
          appt.paid = !(recent && r() < 0.1);
          if (appt.paid) appt.method = pickW<Exclude<MethodKey, 'convenio'>>(r, [['pix', 45], ['credito', 30], ['debito', 15], ['dinheiro', 10]]);
        }
      }
      list.push(appt);
    }
  }
  cache.set(iso, list);
  return list;
}

export function apptsIn(range: DateRange): Appt[] {
  const out: Appt[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(...apptsOfDay(d));
  return out;
}

export type Receipt = {appt: Appt;iso: string;amount: number;method: MethodKey;};

/** Recebimentos com DATA DE PAGAMENTO no período (inclui repasses de convênio de atendimentos até 60 dias antes). */
export function receiptsIn(range: DateRange): Receipt[] {
  const out: Receipt[] = [];
  for (let d = addDays(range.from, -60); d <= range.to; d = addDays(d, 1)) {
    for (const a of apptsOfDay(d)) {
      if (a.payer === 'particular' && a.paid && a.iso >= range.from) out.push({ appt: a, iso: a.iso, amount: a.price, method: a.method! });
      if (a.payer === 'convenio' && a.convPaidOn && a.convPaidOn >= range.from && a.convPaidOn <= range.to)
      out.push({ appt: a, iso: a.convPaidOn, amount: a.price, method: 'convenio' });
    }
  }
  return out;
}


/* ---------- reconciliação: amostra × registros vivos (G1 subetapa 3) ---------- */

/** Início da agenda viva de exemplo (semana de 28/09). Antes disso o gerador preenche só o que não tem registro vivo. */
export const LIVE_FROM = '2026-09-28';

export type VisitStatus = ApptStatus;
/** Atendimento (de qualquer fonte) com identidade estável. `price` = valor do serviço (para "Valor agendado"). */
export type Visit = {
  id: string;
  source: 'amostra' | 'agenda' | 'historico';
  iso: string;
  time: string;
  clientId: string;
  client: string;
  service: string;
  pro: string;
  price: number;
  status: VisitStatus;
  byAssistant: boolean;
  origin: Origin;
};
export type CashKind = 'particular' | 'sinal' | 'coparticipacao' | 'repasse' | 'pacote' | 'reembolso' | 'avulso';
/** Dinheiro que entrou (ou saiu, reembolso) numa data real. */
export type Cash = {id: string;iso: string;amount: number;method: string;kind: CashKind;service: string;pro: string;visitId: string | null;};
/** Fechamento PAGO (conta uma vez, no período em que quitou). `amount` já sem reembolsos. */
export type PaidClosure = {
  id: string;
  visitId: string | null;
  iso: string;
  time: string;
  amount: number;
  client: string;
  clientId: string;
  service: string;
  pro: string;
  byAssistant: boolean;
  origin: Origin;
  refundIso: string | null;
};
export type ConvRow = {id: string;iso: string;client: string;service: string;price: number;insurer: string;convDue: string | null;convPaidOn: string | null;};

export type LiveSources = {
  appointments: Record<string, {id: string;professionalId: string;start: string;clientName: string;service: string;status: string;source?: string;createdActorType?: string;followUpCaseId?: string;}[]>;
  history: {id: string;clientId: string | null;client: string;iso: string;time: string;status: string;service: string;pro: string;}[];
  closures: {entry: {id: string;appointmentId?: string | null;clientId?: string | null;clientName: string;iso: string;time: string;service: string;payer: string;insurer: string;coveredCents: number;claimStatus: string;claimReceivedIso?: string | null;};paidCents: number;settledIso: string | null;qualifies: boolean;lastRefundIso: string | null;receipts: {id: string;iso: string;cents: number;kind: string;method: string | null;}[];}[];
  packageReceipts: {id: string;iso: string;cents: number;method: string | null;service: string;}[];
  /** G3: reembolsos de pacote (negativos) e sinais ainda não usados por fechamento, cada um na data real. Opcional. W5: e lançamentos avulsos sem fechamento. */
  otherCash?: {id: string;iso: string;cents: number;method: string | null;service: string;kind: 'sinal' | 'reembolso' | 'avulso';}[];
  clientIdOf: (name: string) => string | null;
  priceOf: (service: string) => number;
  /** Motivo do caso ligado ao horário (para a origem da conversa no "Gerado pela IA"). */
  motiveOfCase: (caseId: string) => string | null;
  /** Conversas com resposta da assistente e a data do registro. */
  assistantConversations: {id: string;iso: string;}[];
  conversationsFrom: string;
};

const STATUS_OF: Record<string, VisitStatus> = { completed: 'realizado', no_show: 'faltou', cancelled: 'cancelado' };
/** W5 (G15): 'convenio' = reembolso de repasse devolvido à operadora (sai da linha Convênio). */
const METHOD_OF: Record<string, string> = { convenio: 'convenio', pix: 'pix', cartao: 'cartao', credit: 'credito', credito: 'credito', debit: 'debito', debito: 'debito', dinheiro: 'dinheiro', cash: 'dinheiro', transferencia: 'transferencia' };
const SAMPLE_CLIENT_NAMES: Record<string, string> = Object.fromEntries(CLIENTS.map((c) => [c.id, c.name]));

/** Junta as duas fontes num período (eventos com id único). Puro: recebe os registros vivos. */
export function collect(range: DateRange, live: LiveSources) {
  const visits: Visit[] = [];
  const cash: Cash[] = [];
  const paid: PaidClosure[] = [];
  const conv: ConvRow[] = [];

  // 1) registros vivos — agenda
  const liveKeys = new Set<string>();
  const visitById = new Map<string, Visit>();
  Object.entries(live.appointments).forEach(([iso, list]) =>
  list.forEach((a) => {
    const clientId = live.clientIdOf(a.clientName) ?? `nome:${a.clientName}`;
    liveKeys.add(`${clientId}|${iso}`);
    const motive = a.followUpCaseId ? live.motiveOfCase(a.followUpCaseId) : null;
    const v: Visit = {
      id: `agenda:${a.id}`,
      source: 'agenda',
      iso,
      time: a.start,
      clientId,
      client: a.clientName,
      service: a.service,
      pro: a.professionalId,
      price: live.priceOf(a.service),
      status: STATUS_OF[a.status] ?? 'agendado',
      byAssistant: a.source === 'whatsapp' && a.createdActorType === 'ai_whatsapp',
      origin: motive === 'sumiu' ? 'reativacao' : motive === 'faltou' ? 'falta' : a.source === 'whatsapp' && a.createdActorType === 'ai_whatsapp' ? 'novo' : 'clinica'
    };
    visitById.set(a.id, v);
    if (iso >= range.from && iso <= range.to) visits.push(v);
  })
  );
  // histórico do cadastro (sem valor; conta atendimento e falta)
  live.history.forEach((h) => {
    const clientId = h.clientId ?? `nome:${h.client}`;
    liveKeys.add(`${clientId}|${h.iso}`);
    if (h.iso < range.from || h.iso > range.to) return;
    visits.push({ id: `historico:${h.id}`, source: 'historico', iso: h.iso, time: h.time, clientId, client: h.client, service: h.service, pro: h.pro, price: live.priceOf(h.service), status: STATUS_OF[h.status] ?? 'agendado', byAssistant: false, origin: 'clinica' });
  });

  // fechamentos vivos (dinheiro de verdade da sessão + fixture identificada)
  live.closures.forEach((c) => {
    const e = c.entry;
    const visit = e.appointmentId ? visitById.get(e.appointmentId) ?? null : null;
    const service = e.service;
    const pro = visit?.pro ?? '';
    c.receipts.forEach((r) => {
      if (r.iso < range.from || r.iso > range.to) return;
      cash.push({ id: r.id, iso: r.iso, amount: r.cents / 100, method: r.kind === 'repasse' ? 'convenio' : METHOD_OF[r.method ?? ''] ?? 'outro', kind: r.kind as CashKind, service, pro, visitId: visit?.id ?? null });
    });
    if (c.qualifies && c.settledIso && c.settledIso >= range.from && c.settledIso <= range.to) {
      paid.push({
        id: `fech:${e.id}`,
        visitId: visit?.id ?? null,
        iso: c.settledIso,
        time: e.time,
        amount: c.paidCents / 100,
        client: e.clientName,
        clientId: e.clientId ?? live.clientIdOf(e.clientName) ?? `nome:${e.clientName}`,
        service,
        pro,
        // Revisão do G1: o "Gerado pela IA" exige o horário da assistente ATENDIDO. O dinheiro recebido continua em
        // Recebimentos e no fechamento pago, mesmo que o horário tenha sido cancelado, faltado ou reaberto depois.
        byAssistant: !!visit?.byAssistant && visit.status === 'realizado',
        origin: visit?.origin ?? 'clinica',
        refundIso: c.lastRefundIso
      });
    }
    if (e.payer === 'convenio' && e.iso >= range.from && e.iso <= range.to) {
      conv.push({ id: `fech:${e.id}`, iso: e.iso, client: e.clientName, service, price: e.coveredCents / 100, insurer: e.insurer || 'Convênio', convDue: null, convPaidOn: e.claimStatus === 'received' ? e.claimReceivedIso ?? e.iso : null });
    }
  });
  // parcelas de pacote recebidas (Recebimentos; não são fechamento)
  live.packageReceipts.forEach((r) => {
    if (r.iso < range.from || r.iso > range.to) return;
    cash.push({ id: `pkfin:${r.id}`, iso: r.iso, amount: r.cents / 100, method: METHOD_OF[r.method ?? ''] ?? 'outro', kind: 'pacote', service: r.service, pro: '', visitId: null });
  });

  (live.otherCash ?? []).forEach((r) => {
    if (r.iso < range.from || r.iso > range.to) return;
    cash.push({ id: r.id, iso: r.iso, amount: r.cents / 100, method: METHOD_OF[r.method ?? ''] ?? 'outro', kind: r.kind, service: r.service, pro: '', visitId: null });
  });

  // 2) amostra histórica: só antes de LIVE_FROM e só onde não há registro vivo do mesmo cliente no mesmo dia
  const sampleAllowed = (a: Appt) => a.iso < LIVE_FROM && !liveKeys.has(`${a.clientId}|${a.iso}`);
  const sampleVisit = (a: Appt): Visit => ({
    id: `amostra:${a.id}`,
    source: 'amostra',
    iso: a.iso,
    time: a.time,
    clientId: a.clientId,
    client: SAMPLE_CLIENT_NAMES[a.clientId] ?? a.client,
    service: SERVICES[a.service].name,
    pro: a.pro,
    price: a.price,
    status: a.status,
    byAssistant: a.origin !== 'clinica',
    origin: a.origin
  });
  // Atendimentos da amostra até 60 dias antes do período: o repasse de convênio pode cair dentro dele (P1).
  const sampleTo = range.to < LIVE_FROM ? range.to : addDays(LIVE_FROM, -1);
  const sample = sampleTo >= addDays(range.from, -60) ? apptsIn({ from: addDays(range.from, -60), to: sampleTo }).filter(sampleAllowed) : [];
  sample.forEach((a) => {
    const name = SERVICES[a.service].name;
    const inRange = a.iso >= range.from && a.iso <= range.to;
    if (inRange) visits.push(sampleVisit(a));
    if (inRange && a.status === 'realizado' && a.payer === 'particular' && a.paid) {
      cash.push({ id: `amostra:${a.id}:pag`, iso: a.iso, amount: a.price, method: a.method!, kind: 'particular', service: name, pro: a.pro, visitId: `amostra:${a.id}` });
      paid.push({ id: `amostra:${a.id}`, visitId: `amostra:${a.id}`, iso: a.iso, time: a.time, amount: a.price, client: a.client, clientId: a.clientId, service: name, pro: a.pro, byAssistant: a.origin !== 'clinica', origin: a.origin, refundIso: null });
    }
    if (inRange && a.status === 'realizado' && a.payer === 'convenio') {
      conv.push({ id: `amostra:${a.id}`, iso: a.iso, client: a.client, service: name, price: a.price, insurer: INSURERS[a.insurer!].name, convDue: a.convDue ?? null, convPaidOn: a.convPaidOn ?? null });
    }
    if (a.payer === 'convenio' && a.convPaidOn && a.convPaidOn >= range.from && a.convPaidOn <= range.to) {
      cash.push({ id: `amostra:${a.id}:repasse`, iso: a.convPaidOn, amount: a.price, method: 'convenio', kind: 'repasse', service: name, pro: a.pro, visitId: `amostra:${a.id}` });
      paid.push({ id: `amostra:${a.id}`, visitId: `amostra:${a.id}`, iso: a.convPaidOn, time: a.time, amount: a.price, client: a.client, clientId: a.clientId, service: name, pro: a.pro, byAssistant: false, origin: a.origin, refundIso: null });
    }
  });

  // conversas com resposta da assistente (só onde há registro com data)
  const conversations = live.assistantConversations.filter((c) => c.iso >= range.from && c.iso <= range.to).length;
  const conversationsCoverage: 'completo' | 'parcial' | 'indisponivel' = range.to < live.conversationsFrom ? 'indisponivel' : range.from < live.conversationsFrom ? 'parcial' : 'completo';
  return { visits, cash, paid, conv, conversations, conversationsCoverage };
}

/* ---------- resumo do período ---------- */
export type Bucket = {key: string;label: string;from: string;to: string;};

export function bucketsOf(range: DateRange): {unit: 'dia' | 'semana';buckets: Bucket[];} {
  const days = daysBetween(range.from, range.to);
  const buckets: Bucket[] = [];
  if (days <= 31) {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) buckets.push({ key: d, label: dm(d), from: d, to: d });
    return { unit: 'dia', buckets };
  }
  let start = range.from;
  while (start <= range.to) {
    const toSunday = (7 - weekdayOf(start)) % 7;
    const end = addDays(start, toSunday) > range.to ? range.to : addDays(start, toSunday);
    buckets.push({ key: start, label: dm(start), from: start, to: end });
    start = addDays(end, 1);
  }
  return { unit: 'semana', buckets };
}

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);

export type InsurerRow = {
  key: string;
  name: string;
  termDays: number | null;
  count: number;
  billed: number;
  received: number;
  pending: number;
  overdue: number;
  avgDays: number | null;
  late: boolean;
  appts: ConvRow[];
};

export type Summary = ReturnType<typeof summarize>;

const METHOD_LABEL: Record<string, string> = { ...METHODS, cartao: 'Cartão', transferencia: 'Transferência', outro: 'Outra forma' };
const METHOD_KEYS = ['pix', 'credito', 'debito', 'cartao', 'dinheiro', 'transferencia', 'convenio', 'outro'];
const PRO_NAME: Record<string, string> = { carolina: 'Dra. Carolina', juliana: 'Juliana', rafael: 'Rafael' };

export function summarize(range: DateRange, live: LiveSources) {
  const { visits, cash, paid, conv, conversations, conversationsCoverage } = collect(range, live);
  const realized = visits.filter((a) => a.status === 'realizado');
  const noShows = visits.filter((a) => a.status === 'faltou');
  const cancelled = visits.filter((a) => a.status === 'cancelado');
  const received = sum(cash, (r) => r.amount);
  const scheduled = sum(visits.filter((a) => a.status !== 'cancelado'), (a) => a.price);
  const presence = realized.length + noShows.length ? realized.length / (realized.length + noShows.length) * 100 : 0;
  // Ticket médio = valor pago ÷ fechamentos pagos do MESMO período.
  const paidRevenue = sum(paid, (c) => c.amount);
  const ticket = paid.length ? paidRevenue / paid.length : 0;

  const { unit, buckets } = bucketsOf(range);
  const series = buckets.map((b) => {
    const rs = cash.filter((r) => r.iso >= b.from && r.iso <= b.to);
    return { ...b, received: sum(rs, (r) => r.amount), attended: realized.filter((a) => a.iso >= b.from && a.iso <= b.to).length };
  });

  const group = (key: (r: Cash) => string, name: (k: string) => string) => {
    const keys = [...new Set(cash.map(key).filter(Boolean))];
    return keys.
    map((k) => {
      const rs = cash.filter((r) => key(r) === k);
      return { key: k, name: name(k), value: sum(rs, (r) => r.amount), count: new Set(rs.filter((r) => r.visitId).map((r) => r.visitId)).size };
    }).
    filter((x) => x.value !== 0).
    sort((a, b) => b.value - a.value);
  };
  const byService = group((r) => r.service, (k) => k);
  const byPro = group((r) => r.pro, (k) => PRO_NAME[k] ?? k);
  // W5 (A4-03): reembolso sai pela forma do pagamento (G15), então cada forma já vem líquida. Uma forma nunca fica
  // negativa (reembolso de dinheiro recebido em outro período): o gráfico não mostra parte negativa nem acima de 100%.
  const byMethod = METHOD_KEYS.map((k) => ({ key: k, label: METHOD_LABEL[k] ?? k, value: Math.max(0, sum(cash.filter((r) => r.method === k), (r) => r.amount)) })).filter((m) => m.value !== 0 || METHOD_ORDER.includes(m.key as MethodKey));

  const weeks: Bucket[] = [];
  {
    let start = range.from;
    while (start <= range.to) {
      const toSunday = (7 - weekdayOf(start)) % 7;
      const end = addDays(start, toSunday) > range.to ? range.to : addDays(start, toSunday);
      weeks.push({ key: start, label: dm(start), from: start, to: end });
      start = addDays(end, 1);
    }
  }
  const lossWeeks = weeks.map((w) => {
    const inW = (a: Visit) => a.iso >= w.from && a.iso <= w.to;
    const ns = noShows.filter(inW);
    const cc = cancelled.filter(inW);
    return { ...w, noShows: ns.length, cancelled: cc.length, lost: sum([...ns, ...cc], (a) => a.price) };
  });

  // convênios: atendimentos do período fechados como convênio
  const insurerNames = [...new Set(conv.map((c) => c.insurer))];
  const insurers: InsurerRow[] = insurerNames.map((name) => {
    const list = conv.filter((c) => c.insurer === name).sort((a, b) => a.iso < b.iso ? 1 : -1);
    const paidList = list.filter((a) => a.convPaidOn);
    const pendingList = list.filter((a) => !a.convPaidOn);
    const overdueList = pendingList.filter((a) => a.convDue && a.convDue < RESULTADOS_TODAY);
    const sampleKey = (Object.keys(INSURERS) as InsurerKey[]).find((k) => INSURERS[k].name === name);
    return {
      key: name,
      name,
      termDays: sampleKey ? INSURERS[sampleKey].termDays : null,
      count: list.length,
      billed: sum(list, (a) => a.price),
      received: sum(paidList, (a) => a.price),
      pending: sum(pendingList, (a) => a.price),
      overdue: sum(overdueList, (a) => a.price),
      avgDays: paidList.length ? Math.round(sum(paidList, (a) => daysBetween(a.iso, a.convPaidOn!) - 1) / paidList.length) : null,
      late: overdueList.length > 0,
      appts: list
    };
  });
  const convReceivedInPeriod = sum(cash.filter((r) => r.kind === 'repasse'), (r) => r.amount);

  // Gerado pela IA: origem EXPLÍCITA, atendido e pago no período
  const counted = paid.filter((c) => c.byAssistant).sort((a, b) => a.iso === b.iso ? a.time < b.time ? 1 : -1 : a.iso < b.iso ? 1 : -1);
  const assistantRevenue = sum(counted, (c) => c.amount);
  const assistantSeries = buckets.map((b) => {
    const inB = counted.filter((a) => a.iso >= b.from && a.iso <= b.to);
    return {
      ...b,
      parts: ASSISTANT_ORIGINS.map((o) => sum(inB.filter((a) => a.origin === o), (a) => a.amount)),
      counts: ASSISTANT_ORIGINS.map((o) => inB.filter((a) => a.origin === o).length)
    };
  });
  const assistantVisits = visits.filter((a) => a.byAssistant);
  const recoveredClients = new Set(counted.filter((a) => a.origin === 'reativacao' || a.origin === 'falta').map((a) => a.clientId));

  return {
    range,
    hasPast: range.from <= RESULTADOS_TODAY,
    hasFuture: range.to > RESULTADOS_TODAY,
    /** O período usa a amostra histórica (antes de 28/09). */
    usesSample: range.from < LIVE_FROM,
    visits,
    cash,
    received,
    scheduled,
    attended: realized.length,
    noShowCount: noShows.length,
    cancelledCount: cancelled.length,
    lost: sum([...noShows, ...cancelled], (a) => a.price),
    presence,
    ticket,
    paidClosures: paid.length,
    paidRevenue,
    refundedInPeriod: -sum(cash.filter((r) => r.kind === 'reembolso'), (r) => r.amount),
    unit,
    series,
    byService,
    byPro,
    byMethod,
    lossWeeks,
    insurers,
    convToReceive: sum(insurers, (i) => i.pending),
    convReceivedInPeriod,
    convOverdue: sum(insurers, (i) => i.overdue),
    assistant: {
      revenue: assistantRevenue,
      /** Agendamentos da assistente atendidos E pagos no período (a lista abaixo). */
      paidCount: counted.length,
      share: paidRevenue ? assistantRevenue / paidRevenue * 100 : 0,
      recovered: recoveredClients.size,
      counted,
      series: assistantSeries,
      funnel: {
        conversations,
        conversationsCoverage,
        conversationsFrom: live.conversationsFrom,
        booked: assistantVisits.length,
        realized: assistantVisits.filter((a) => a.status === 'realizado').length,
        paid: counted.length
      }
    }
  };
}

/** Variação em % contra o período anterior (para o KpiStatCard). Sem base: undefined. */
export const deltaPct = (cur: number, prev: number) => prev ? Math.round((cur - prev) / prev * 1000) / 10 : undefined;

/** Frase automática em linguagem simples abaixo do gráfico de faturamento. */
export function revenueInsight(s: Summary) {
  const days = daysBetween(s.range.from, s.range.to);
  if (!s.hasPast) return 'Este período ainda não aconteceu: por enquanto só há atendimentos marcados.';
  if (s.received === 0) return 'Nenhum valor entrou no caixa neste período.';
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  s.cash.forEach((r) => byWeekday[weekdayOf(r.iso)] += r.amount);
  const bestWd = byWeekday.indexOf(Math.max(...byWeekday));
  if (days === 1) return `Neste dia entraram ${brl0(s.received)} em ${s.attended} ${s.attended === 1 ? 'atendimento' : 'atendimentos'}.`;
  if (days < 14) {
    const best = s.series.reduce((a, b) => b.received > a.received ? b : a);
    return `Seu melhor dia foi ${WEEKDAY_NAME[weekdayOf(best.from)].toLowerCase()}, ${dm(best.from)}, com ${brl0(best.received)}.`;
  }
  const weeks = s.lossWeeks.map((w) => ({ w, v: sum(s.cash.filter((r) => r.iso >= w.from && r.iso <= w.to), (r) => r.amount) }));
  const bestWeek = weeks.reduce((a, b) => b.v > a.v ? b : a);
  const wdName = WEEKDAY_NAME[bestWd];
  return `Sua melhor semana foi de ${dm(bestWeek.w.from)} a ${dm(bestWeek.w.to)}. ${wdName} é o dia que mais fatura.`;
}

const brl0 = (v: number) =>
new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v).replace(/ /g, ' ');