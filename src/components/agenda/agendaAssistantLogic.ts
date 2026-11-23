/**
 * Rule-based reading of what is typed in the Agenda assistant (prototype: no AI call).
 * It follows the logic of the old dashboard assistant: it answers with information or
 * prepares a pending action that only changes the agenda after "Confirmar".
 * Os horários livres vêm da regra única de disponibilidade (data/availability.ts): expediente e datas especiais da
 * clínica, jornada individual de cada profissional (vários períodos, pausas, folgas/férias, horário especial),
 * bloqueios, agendamentos e intervalo. Precisão de 5 min: um pedido "às 10:10" é atendido se 10:10 estiver livre.
 *
 * W3 (11/11/2026, Christian, A1-02, A1-09 e item da W1):
 *  - Com MAIS DE UM horário do cliente que serve ao pedido, a assistente PERGUNTA qual (botões), nunca escolhe sozinha.
 *  - Atendimento EM ANDAMENTO (hoje, início ≤ agora < fim) nunca é remarcado nem cancelado pela assistente. Quando ele
 *    foi deixado de lado, a resposta diz isso no começo (rodada 2).
 *  - Remarcar avisa quando o cliente já tem o MESMO serviço no dia de destino (não bloqueia).
 *  - Cancelar com DATA ("dia 03/12") ou SERVIÇO citado procura só nesse dia/serviço; sem horário ali, diz isso e não
 *    propõe outro dia. Remarcar com serviço citado filtra pelo serviço (a data, ali, é o DESTINO).
 *  - "Próximo horário livre" parte de AGORA (hoje), não da data aberta na tela.
 *  - O "Desfazer" do resultado fica em AgendaAssistant.tsx.
 */
import { agendaWaitlist } from '../../data/agenda';
import { activeAgendaProfessionals, agendaProfessionalByName, agendaProfessionalOf, getTeam } from '../../data/availability';
import { allClientsForSelect, clientById, clientIdOfRecordedName } from '../../data/api/clientes';
import { activeServiceOf, catalogServices, resolveService, serviceUseIssue } from '../../data/catalogo';
import { dayWordsOf, getServices, isGroupService } from '../../data/servicesStore';
import { wordsNow } from '../../data/segment';
import { TODAY_ISO, mediumDayLabel, NOW } from '../../data/agendaStore';
import type { CalAppointment, CalBlock } from '../../data/agendaStore';
import { allFreeStartTimes, clinicDay, freeStartTimes, nextOpenIso } from '../../data/availability';
import { isPendingClosure } from '../../data/legado';

/** Prototype clock: same "now" used in Conversas. */
/** Relógio único do protótipo (data/agendaStore.ts). */
export const ASSISTANT_NOW = NOW;

export type AssistantContext = {
  appointments: Record<string, CalAppointment[]>;
  blocks: Record<string, CalBlock[]>;
  /** Day open on screen (used when the request has no date) */
  currentIso: string;
};

export type PendingAction =
{kind: 'remarcar';fromIso: string;appt: CalAppointment;toIso: string;time: string;professionalId: string;} |
{kind: 'cancelar';iso: string;appt: CalAppointment;} |
{kind: 'agendar';client: string;service: string;iso: string;time: string;professionalId: string;};

/** What a tap on a free time does: build an action for this client, or open the form. */
export type SlotIntent =
{kind: 'remarcar';fromIso: string;appt: CalAppointment;} |
{kind: 'agendar';client: string;service: string;} |
{kind: 'abrir';service?: string;};

export type SlotGroup = {iso: string;professionalId: string;times: string[];};

/** W3 (A1-02): mais de um horário serve ao pedido → a pessoa escolhe qual. */
export type PickRequest = {
  kind: 'remarcar' | 'cancelar';
  client: string;
  items: {iso: string;appt: CalAppointment;}[];
  /** remarcar: dia e hora de DESTINO e profissional pedidos */
  date?: string;
  time?: string;
  pro?: string;
};

export type AssistantReply = {
  text: string;
  action?: PendingAction;
  slots?: {groups: SlotGroup[];intent: SlotIntent;};
  day?: {iso: string;items: CalAppointment[];};
  /** W3: escolher qual horário (remarcar ou cancelar) */
  pick?: PickRequest;
  /** Open the "Bloquear horário" form */
  openBlock?: boolean;
};

// ---------- small helpers ----------

/** Accent marks (U+0300 to U+036F), built from char codes so the file stays plain ASCII here. */
const ACCENTS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(ACCENTS, '');
const pad = (n: number) => String(n).padStart(2, '0');

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** Mantido por compatibilidade. A decisão de "clínica aberta" vem de `isClosed` (semana + datas especiais), nunca do fim de semana. */
export const isWeekend = (iso: string) => weekday(iso) === 0 || weekday(iso) === 6;
/** A clínica não atende nesta data (dia fechado no horário semanal ou data especial de fechamento). */
const isClosed = (iso: string) => !clinicDay(iso).open;

export const proName = (id: string) => agendaProfessionalOf(id)?.name ?? '';
export const proColor = (id: string) => agendaProfessionalOf(id)?.color ?? '#7A9593';
const firstName = (name: string) => name.split(' ')[0];
const active = (a: CalAppointment) => a.status !== 'cancelled' && a.status !== 'no_show';
/** W3 (A1-02): atendimento acontecendo agora (hoje, início ≤ agora < fim). */
export const inProgress = (iso: string, a: CalAppointment) => iso === TODAY_ISO && a.start <= ASSISTANT_NOW && ASSISTANT_NOW < a.end;
/** W3 (rodada 2): quando um atendimento em andamento ficou de fora do pedido, a resposta começa dizendo isso. */
const skippedNote = (list: {iso: string;a: CalAppointment;}[]) => {
  const busy = list.find((x) => inProgress(x.iso, x.a));
  return busy ? `O horário de hoje às ${busy.a.start} está em atendimento e fica como está. ` : '';
};
const withNote = (note: string, r: AssistantReply): AssistantReply => note ? { ...r, text: `${note}${r.text}` } : r;
/**
 * Duração do serviço ATIVO (nome atual ou anterior, `resolveService`). Sem serviço citado, 60 min só para LISTAR horários
 * (a escolha abre o formulário, que exige o serviço). Serviço arquivado ou desconhecido nunca chega aqui: é recusado antes.
 */
const minutesOf = (service?: string) => service ? activeServiceOf(service)?.minutes ?? 60 : 60;
/** Nome ATUAL do serviço gravado (um nome antigo renomeado vira o nome de hoje). */
const canonicalService = (service: string) => activeServiceOf(service)?.label ?? service;

/** "hoje" / "amanhã" / "sexta, 02/10" */
export function dayWord(iso: string) {
  if (iso === TODAY_ISO) return 'hoje';
  if (iso === addDays(TODAY_ISO, 1)) return 'amanhã';
  return mediumDayLabel(iso).toLowerCase();
}

// ---------- reading the request ----------

const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function readDate(t: string): string | undefined {
  if (/depois de amanha/.test(t)) return addDays(TODAY_ISO, 2);
  if (/amanha/.test(t)) return addDays(TODAY_ISO, 1);
  if (/\bhoje\b/.test(t)) return TODAY_ISO;
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dm) {
    // G3 (F-048): ano do relógio do protótipo (não fixo); data já passada neste ano vai para o próximo.
    const year = Number(TODAY_ISO.slice(0, 4));
    const iso = `${year}-${pad(+dm[2])}-${pad(+dm[1])}`;
    return iso < TODAY_ISO ? `${year + 1}-${pad(+dm[2])}-${pad(+dm[1])}` : iso;
  }
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (wd >= 0) {
    const diff = (wd - weekday(TODAY_ISO) + 7) % 7;
    return addDays(TODAY_ISO, diff);
  }
  return undefined;
}

function readTime(t: string): string | undefined {
  const m = t.replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ').match(/\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b|\bas\s+(\d{1,2})\b/);
  if (!m) return undefined;
  const h = Number(m[1] ?? m[3]);
  const min = m[2] ?? '00';
  if (h < 6 || h > 21) return undefined;
  return `${pad(h)}:${min}`;
}

/** Tira o título do nome ("Dra. Carolina" → "Carolina") sem lista fixa de títulos por pessoa. */
const withoutTitle = (name: string) => name.replace(/^(dra?|sra?|prof[aª]?)\.?\s+/i, '');

/**
 * G3 (F-048): profissional pela equipe ATIVA (sem nomes fixos). Um nome que é também o primeiro nome de um cliente
 * citado por inteiro (ex.: "Juliana Prado") não conta como profissional.
 */
function readProfessional(t: string) {
  const clientNames = allClients().map(strip);
  for (const p of activeAgendaProfessionals()) {
    const f = strip(firstName(withoutTitle(p.name)));
    if (!f || !new RegExp(`\\b${f}\\b`).test(t)) continue;
    if (clientNames.some((c) => c !== f && c.startsWith(`${f} `) && t.includes(c))) continue;
    return p.id;
  }
  return undefined;
}

/**
 * G3 (F-048): serviço citado pelo nome, pela 1ª palavra do nome ou pelos sinônimos cadastrados, no catálogo VIVO.
 * Revisão v3: um serviço ARQUIVADO citado não é ignorado (antes a assistente caía num serviço deduzido sem avisar):
 * volta como `archived` para a resposta recusar e pedir um serviço ativo.
 */
function readService(t: string): {active?: string;archived?: string;} {
  const matches = (s: {name: string;knowledge?: {synonyms?: string[];};}) => {
    const keys = [strip(s.name), strip(firstName(s.name)), ...(s.knowledge?.synonyms ?? []).map(strip)].filter((k) => k.length >= 3);
    return keys.some((k) => new RegExp(`\\b${k}\\b`).test(t));
  };
  const all = getServices().services;
  const active = all.find((x) => x.active && matches(x));
  if (active) return { active: active.name };
  const archived = all.find((x) => !x.active && matches(x));
  return archived ? { archived: archived.name } : {};
}

/**
 * G3 (F-048, correção da revisão): quem FAZ o serviço vem de Serviços e equipe › Quem faz (`professionalIds` do catálogo
 * vivo). Estar livre no horário não prova que o profissional faz o serviço.
 */
function catalogServiceByName(name: string) {
  const r = resolveService(name);
  return r.status === 'active' || r.status === 'archived' ? getServices().services.find((s) => s.id === r.service.value) : undefined;
}

/** Revisão v3: só serviço ATIVO tem quem faz. Arquivado ou fora do catálogo devolve `false`. */
export function proDoesService(professionalId: string, serviceName?: string) {
  if (!serviceName) return true;
  const s = catalogServiceByName(serviceName);
  return !!s && s.active && s.professionalIds.includes(professionalId);
}

/** Profissionais ATIVOS que fazem o serviço (todos os ativos quando não há serviço). */
function prosFor(serviceName?: string) {
  return activeAgendaProfessionals().
  map((p) => p.id).
  filter((id) => proDoesService(id, serviceName));
}

/** "Rafael não faz toxina botulínica. Quem faz: Dra. Carolina." (texto da recusa, nunca uma proposta). */
function notDoesText(professionalId: string, serviceName: string) {
  const who = prosFor(serviceName).map(proName).filter(Boolean);
  return `${proName(professionalId)} não faz ${serviceName.toLowerCase()}.${
  who.length ? ` Quem faz: ${who.join(', ')}.` : ' Ninguém da equipe ativa faz esse serviço (Serviços e equipe › Quem faz).'}`;

}

/**
 * Mensagem para quem confirma uma ação que deixou de valer entre a proposta e a confirmação: o serviço foi arquivado,
 * saiu do catálogo ou trocaram "Quem faz". `null` = pode executar. Renomear não invalida (o nome antigo resolve).
 */
export function serviceMismatch(professionalId: string, serviceName: string) {
  const issue = serviceUseIssue(serviceName);
  if (issue) return issue;
  return proDoesService(professionalId, serviceName) ? null : notDoesText(professionalId, canonicalService(serviceName));
}

/** Texto de recusa quando o serviço (citado ou deduzido) não pode ser usado numa ação nova. */
const serviceRefusal = (what: string, serviceName: string, tail: string) => `Não dá para ${what}: ${serviceUseIssue(serviceName)} ${tail}`;

/**
 * G1 (F-001, v6): só clientes do cadastro (não arquivados) são candidatos. Um nome antigo que ainda está na agenda
 * vale como apelido do mesmo id e devolve o nome ATUAL; cliente excluído não é mais encontrado.
 */
function allClients() {
  return allClientsForSelect().map((c) => c.name);
}

/** Id do cadastro de um nome atual do cadastro (o que `readClient` devolve). */
const idOf = (client: string) => allClientsForSelect().find((c) => c.name === client)?.id;

/** O agendamento é deste cliente (pelo id; o nome na agenda pode ser o antigo). */
const isClient = (recordedName: string, client: string) => {
  const id = idOf(client);
  return !!id && clientIdOfRecordedName(recordedName) === id;
};

function readClient(t: string, ctx: AssistantContext) {
  const names = allClients();
  const full = names.find((n) => t.includes(strip(n)));
  if (full) return full;
  // Nome antigo ainda escrito na agenda: devolve o nome atual do mesmo cliente, se ele estiver no cadastro.
  const selectable = new Set(names);
  for (const list of Object.values(ctx.appointments)) {
    for (const a of list) {
      if (!t.includes(strip(a.clientName))) continue;
      const now = clientById(clientIdOfRecordedName(a.clientName) ?? '')?.name;
      if (now && selectable.has(now)) return now;
    }
  }
  const pros = getTeam().members.map((p) => strip(firstName(withoutTitle(p.name))));
  return names.find((n) => {
    const f = strip(firstName(n));
    return !pros.includes(f) && new RegExp(`\\b${f}\\b`).test(t);
  });
}

// ---------- agenda queries ----------

/** Todos os horários do cliente de hoje em diante (sem cancelados, faltas e concluídos), em ordem. */
function upcomingOf(client: string, ctx: AssistantContext) {
  return Object.entries(ctx.appointments).
  filter(([iso]) => iso >= TODAY_ISO).
  flatMap(([iso, list]) => list.map((a) => ({ iso, a }))).
  filter((x) => isClient(x.a.clientName, client) && active(x.a) && x.a.status !== 'completed').
  sort((x, y) => (x.iso + x.a.start).localeCompare(y.iso + y.a.start));
}

/** Next appointment of a client from today on (skips cancelled and finished ones). */
function nextAppointment(client: string, ctx: AssistantContext) {
  return upcomingOf(client, ctx)[0];
}

/**
 * TODOS os inícios em que um serviço de `minutes` cabe para um profissional (passo de 5 min), pela MESMA regra da
 * agenda. Hoje, nada antes do relógio do protótipo. Usado para validar um horário pedido ("às 10:10").
 */
export function freeTimes(iso: string, professionalId: string, minutes: number, ctx: AssistantContext, ignoreId?: string) {
  return allFreeStartTimes({ appointments: ctx.appointments, blocks: ctx.blocks }, professionalId, iso, minutes, ignoreId, iso === TODAY_ISO ? ASSISTANT_NOW : undefined);
}

/** Horários SUGERIDOS (primeiro minuto exato de cada faixa livre + horas cheias/meias), também pela regra única. */
function suggestedTimes(iso: string, professionalId: string, minutes: number, ctx: AssistantContext, ignoreId?: string) {
  return freeStartTimes({ appointments: ctx.appointments, blocks: ctx.blocks }, professionalId, iso, minutes, ignoreId, iso === TODAY_ISO ? ASSISTANT_NOW : undefined);
}

function groupsFor(iso: string, pros: string[], minutes: number, ctx: AssistantContext, ignoreId?: string, max = 6): SlotGroup[] {
  return pros.map((id) => ({ iso, professionalId: id, times: suggestedTimes(iso, id, minutes, ctx, ignoreId).slice(0, max) })).filter((g) => g.times.length > 0);
}

/** Next open day with at least one free time (today included), up to `reach` days ahead. */
function firstDayWithRoom(from: string, pros: string[], minutes: number, ctx: AssistantContext, reach = 7) {
  for (let i = 0; i < reach; i++) {
    const iso = addDays(from, i);
    if (groupsFor(iso, pros, minutes, ctx).length) return iso;
  }
  return undefined;
}

/** "agende", "agendar", "marque"… but not the noun "agenda" */
const WANTS_BOOKING = /agend(?!a\b)|\bmarc|\bmarq/;

/** "A clínica não abre sábado, 03/10. Quer ver segunda, 05/10?" (considera feriados, dias fechados e aberturas extraordinárias). */
function closedText(iso: string) {
  const info = clinicDay(iso);
  const why = !info.open && info.why ? ` (${info.why})` : '';
  const next = nextOpenIso(iso);
  return `${wordsNow().The} não abre ${dayWord(iso)}${why}.${next ? ` Quer ver ${dayWord(next)}?` : ''}`;
}

/** "Limpeza de pele sexta, 02/10, às 09:00" (botão de escolha). */
export const pickLabel = (iso: string, a: CalAppointment) => `${a.service} · ${dayWord(iso)} às ${a.start} · ${proName(a.professionalId)}`;

// ---------- remarcar / cancelar um horário já escolhido ----------

function remarcarReply(client: string, next: {iso: string;a: CalAppointment;}, date: string | undefined, time: string | undefined, pro: string | undefined, ctx: AssistantContext): AssistantReply {
  const toIso = date ?? next.iso;
  // Revisão v3: o serviço do horário precisa estar ATIVO no catálogo (nome atual ou anterior).
  if (serviceUseIssue(next.a.service)) return { text: serviceRefusal(`remarcar ${firstName(client)} pela assistente`, next.a.service, 'Abra o horário na Agenda para escolher o serviço. Nada mudou na agenda.') };
  if (pro && !proDoesService(pro, next.a.service)) return { text: `${notDoesText(pro, next.a.service)} Nada mudou na agenda.` };
  const candidates = prosFor(next.a.service);
  const proId = pro ?? (proDoesService(next.a.professionalId, next.a.service) ? next.a.professionalId : candidates[0]);
  if (!proId) return { text: `${notDoesText(next.a.professionalId, next.a.service)} Nada mudou na agenda.` };
  if (isClosed(toIso)) return { text: closedText(toIso) };
  // W3 (A1-02): o cliente já tem o MESMO serviço no dia de destino (outro horário). Avisa e deixa seguir.
  const twin = (ctx.appointments[toIso] ?? []).find((x) => x.id !== next.a.id && active(x) && x.status !== 'completed' && isClient(x.clientName, client) && canonicalService(x.service) === canonicalService(next.a.service));
  const warn = twin ? `Atenção: ${firstName(client)} já tem ${twin.service.toLowerCase()} ${dayWord(toIso)} às ${twin.start}. ` : '';
  const minutes = minutesOf(next.a.service);
  const free = freeTimes(toIso, proId, minutes, ctx, next.a.id);
  const intent: SlotIntent = { kind: 'remarcar', fromIso: next.iso, appt: next.a };
  if (time && free.includes(time)) {
    return {
      text: `${warn}${proName(proId)} está livre ${dayWord(toIso)} às ${time}. Confirme a remarcação:`,
      action: { kind: 'remarcar', fromIso: next.iso, appt: next.a, toIso, time, professionalId: proId }
    };
  }
  const groups = groupsFor(toIso, [proId], minutes, ctx, next.a.id, 8);
  if (!groups.length) return { text: `${warn}${proName(proId)} não tem horário livre ${dayWord(toIso)} para ${next.a.service.toLowerCase()}. Tente outro dia.` };
  return {
    text: time ?
    `${warn}Às ${time} ${proName(proId)} não está livre ${dayWord(toIso)}. Estes horários estão livres, toque em um:` :
    `${warn}Para qual horário? Estes estão livres com ${proName(proId)} ${dayWord(toIso)}:`,
    slots: { groups, intent }
  };
}

function cancelarReply(client: string, next: {iso: string;a: CalAppointment;}): AssistantReply {
  return {
    text: `Encontrei o horário de ${firstName(client)}. Diga quem cancelou e confirme:`,
    action: { kind: 'cancelar', iso: next.iso, appt: next.a }
  };
}

/** W3 (A1-02): resposta depois que a pessoa escolheu UM dos horários oferecidos em `pick`. */
export function answerPicked(req: PickRequest, item: {iso: string;appt: CalAppointment;}, ctx: AssistantContext): AssistantReply {
  // Confere de novo: o horário pode ter mudado entre a pergunta e o clique.
  const live = (ctx.appointments[item.iso] ?? []).find((a) => a.id === item.appt.id);
  if (!live || !active(live) || live.status === 'completed') return { text: 'Esse horário mudou depois da pergunta. Peça de novo. Nada mudou na agenda.' };
  if (inProgress(item.iso, live)) return { text: `${firstName(req.client)} está em atendimento agora nesse horário. A assistente não mexe em atendimento em andamento. Nada mudou na agenda.` };
  const next = { iso: item.iso, a: live };
  return req.kind === 'cancelar' ? cancelarReply(req.client, next) : remarcarReply(req.client, next, req.date, req.time, req.pro, ctx);
}

// ---------- main entry ----------

/** Revisão v3: o exemplo de pedido cita um serviço ATIVO do catálogo vivo (nunca um nome fixo, que pode estar arquivado). */
const exampleAsk = (who: string) => {
  const active = catalogServices.find((s) => s.active);
  return active ? `Diga o serviço, por exemplo: “agende ${who} para ${active.label.toLowerCase()} amanhã às 15h”. Nada foi agendado.` : 'Não há serviço ativo em Serviços e equipe. Nada foi agendado.';
};

export function answer(raw: string, ctx: AssistantContext): AssistantReply {
  const t = strip(raw);
  const date = readDate(t);
  const time = readTime(t);
  const pro = readProfessional(t);
  const mention = readService(t);
  const service = mention.active;
  const client = readClient(t, ctx);
  // Só profissionais ativos recebem sugestões (arquivado não atende; a regra única também recusa).
  // G3 (F-048): com o serviço citado, só quem faz esse serviço no catálogo vivo (Serviços e equipe › Quem faz).
  const allPros = prosFor(service);

  if (/bloque/.test(t)) {
    return { text: 'Abri o bloqueio de horário para você escolher o período e o motivo.', openBlock: true };
  }

  // G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): serviço em grupo acontece em turmas. A assistente não marca horário
  // individual nem oferece vaga de aula (isso seria um fluxo novo); aponta o caminho certo e não agenda nada.
  const groupSvc = service ? getServices().services.find((s) => s.active && s.name === service && isGroupService(s)) : undefined;
  if (groupSvc) {
    return { text: `${groupSvc.name} acontece em turmas, não em horário individual. Para pôr alguém ${dayWordsOf(groupSvc).pick('numa', 'num')} ${dayWordsOf(groupSvc).one}, use “Novo agendamento” e escolha a turma e o dia. Nada foi agendado.` };
  }

  // Cancelar
  if (/cancel|desmar[cq]/.test(t)) {
    if (!client) return { text: 'De quem é o horário que você quer cancelar? Ex.: “cancele o horário do Bruno”.' };
    const all = upcomingOf(client, ctx);
    if (!all.length) return { text: `Não achei horário marcado de ${client} a partir de hoje.` };
    // W3 (item da W1): com data ou serviço citados, procura SÓ ali. Nunca cai em outro dia sem dizer.
    const byDate = date ? all.filter((x) => x.iso === date) : all;
    const bySvc = service ? byDate.filter((x) => canonicalService(x.a.service) === canonicalService(service)) : byDate;
    if (!bySvc.length) {
      // Rodada 2: "não tem horário de drenagem linfática amanhã" (sem concordância de gênero com o nome do serviço).
      const what = service ? `horário de ${service.toLowerCase()}` : 'horário marcado';
      return { text: `${firstName(client)} não tem ${what} ${date ? dayWord(date) : 'a partir de hoje'}. Nada foi cancelado.` };
    }
    const usable = bySvc.filter((x) => !inProgress(x.iso, x.a));
    if (!usable.length) return { text: `${firstName(client)} está em atendimento agora (${bySvc[0].a.start}). A assistente não cancela atendimento em andamento. Nada foi cancelado.` };
    const note = skippedNote(bySvc);
    if (usable.length > 1) return { text: `${note}${firstName(client)} tem ${usable.length} horários. Qual você quer cancelar?`, pick: { kind: 'cancelar', client, items: usable.map((x) => ({ iso: x.iso, appt: x.a })) } };
    return withNote(note, cancelarReply(client, usable[0]));
  }

  // Remarcar
  if (/remar[cq]|reagend|mud[ae]|troc|pass[ae] .*para|adiant/.test(t)) {
    if (!client) return { text: 'De quem é o horário que você quer remarcar? Ex.: “remarque a Ana para amanhã às 15h”.' };
    const all = upcomingOf(client, ctx);
    if (!all.length) return { text: `Não achei horário marcado de ${client} a partir de hoje para remarcar.` };
    const bySvc = service ? all.filter((x) => canonicalService(x.a.service) === canonicalService(service)) : all;
    if (!bySvc.length) return { text: `${firstName(client)} não tem horário de ${service!.toLowerCase()} a partir de hoje. Nada mudou na agenda.` };
    // R3 (A-14): horário de hoje que já passou sem fechamento não é remarcado (fecha-se no detalhe).
    // W3 (A1-02): atendimento EM ANDAMENTO também não.
    const usable = bySvc.filter((x) => !inProgress(x.iso, x.a) && !isPendingClosure(x.iso, x.a));
    if (!usable.length) {
      const busy = bySvc.find((x) => inProgress(x.iso, x.a));
      return busy ?
      { text: `${firstName(client)} está em atendimento agora (${busy.a.start}, ${busy.a.service.toLowerCase()}). A assistente não remarca atendimento em andamento. Nada mudou na agenda.` } :
      { text: `Não achei horário de ${client} que dê para remarcar. O que já passou se fecha no detalhe do atendimento. Nada mudou na agenda.` };
    }
    const note = skippedNote(bySvc);
    if (usable.length > 1) {
      return {
        text: `${note}${firstName(client)} tem ${usable.length} horários. Qual você quer remarcar${date ? ` para ${dayWord(date)}` : ''}${time ? ` às ${time}` : ''}?`,
        pick: { kind: 'remarcar', client, items: usable.map((x) => ({ iso: x.iso, appt: x.a })), date, time, pro }
      };
    }
    return withNote(note, remarcarReply(client, usable[0], date, time, pro, ctx));
  }

  // Encaixe
  if (/encaix/.test(t)) {
    if (mention.archived) return { text: serviceRefusal('buscar encaixe', mention.archived, 'Nada foi agendado.') };
    const waiting = client ? agendaWaitlist.find((w) => isClient(w.clientName, client)) : undefined;
    const inferred = service ?? (waiting?.service || undefined) ?? (client ? nextAppointment(client, ctx)?.a.service : undefined);
    // Revisão v3: serviço deduzido (lista de espera, próximo horário) arquivado ou fora do catálogo não é oferecido.
    if (inferred && serviceUseIssue(inferred)) return { text: serviceRefusal(`buscar encaixe${client ? ` para ${firstName(client)}` : ''}`, inferred, 'Diga o serviço que a pessoa quer agora. Nada foi agendado.') };
    const svc = inferred ? canonicalService(inferred) : undefined;
    if (pro && svc && !proDoesService(pro, svc)) return { text: notDoesText(pro, svc) };
    const svcPros = prosFor(svc);
    const pros = pro ? [pro] : waiting ? [professionalIdByName(waiting.professional) ?? ''].filter((id) => id && proDoesService(id, svc)) : svcPros;
    const prosToUse = pros.length ? pros : svcPros;
    if (!prosToUse.length) return { text: svc ? `Ninguém da equipe ativa faz ${svc.toLowerCase()} (Serviços e equipe › Quem faz).` : 'Não há profissional ativo.' };
    const minutes = minutesOf(svc);
    const day = date && !isClosed(date) ? date : firstDayWithRoom(date ?? TODAY_ISO, prosToUse, minutes, ctx);
    if (!day) return { text: 'Não achei encaixe nos próximos dias com esses filtros.' };
    const groups = groupsFor(day, prosToUse, minutes, ctx, undefined, 3);
    const intent: SlotIntent = client && svc ? { kind: 'agendar', client, service: svc } : { kind: 'abrir', service: svc };
    const who = client ? ` para ${firstName(client)}` : '';
    const extra = waiting ? ` Está na lista de espera (${waiting.preference}).` : '';
    return {
      text: `Primeiros encaixes${who} ${dayWord(day)}${svc ? ` (${svc.toLowerCase()}, ${minutes} min)` : ''}.${extra} Toque em um horário:`,
      slots: { groups, intent }
    };
  }

  // Horários livres
  if (/livre|vaga|disponiv|horarios?\b|brecha/.test(t) && !WANTS_BOOKING.test(t)) {
    if (mention.archived) return { text: serviceRefusal('mostrar horários', mention.archived, 'Nada mudou na agenda.') };
    if (pro && service && !proDoesService(pro, service)) return { text: notDoesText(pro, service) };
    const minutes = minutesOf(service);
    const pros = pro ? [pro] : allPros;
    // W3 (A1-09): "próximo horário livre" (sem data) parte de AGORA, não do dia aberto na tela.
    if (/proxim/.test(t) && !date) {
      const day = firstDayWithRoom(TODAY_ISO, pros, minutes, ctx, 60);
      if (!day) return { text: `Não achei horário livre nos próximos 60 dias${pro ? ` com ${proName(pro)}` : ''}.` };
      return {
        text: `Próximo horário livre${service ? ` para ${service.toLowerCase()}` : ''}: ${dayWord(day)}. Toque em um para agendar:`,
        slots: { groups: groupsFor(day, pros, minutes, ctx), intent: { kind: 'abrir', service } }
      };
    }
    const iso = date ?? ctx.currentIso;
    if (isClosed(iso)) return { text: closedText(iso) };
    const groups = groupsFor(iso, pros, minutes, ctx);
    if (!groups.length) return { text: `Não há horário livre ${dayWord(iso)}${pro ? ` com ${proName(pro)}` : ''}.` };
    return {
      text: `Horários livres ${dayWord(iso)}${service ? ` para ${service.toLowerCase()}` : ''}. Toque em um para agendar:`,
      slots: { groups, intent: { kind: 'abrir', service } }
    };
  }

  // Agendar
  if (WANTS_BOOKING.test(t)) {
    if (mention.archived) return { text: serviceRefusal('agendar', mention.archived, 'Nada foi agendado.') };
    const inferred = service ?? (client ? nextAppointment(client, ctx)?.a.service : undefined) ?? (client ? agendaWaitlist.find((w) => isClient(w.clientName, client))?.service : undefined);
    if (inferred && serviceUseIssue(inferred))
    return { text: serviceRefusal(`agendar${client ? ` ${firstName(client)}` : ''}`, inferred, exampleAsk(client ? firstName(client) : 'a Ana')) };
    const svc = inferred ? canonicalService(inferred) : undefined;
    const iso = date ?? ctx.currentIso;
    if (isClosed(iso)) return { text: closedText(iso) };
    if (pro && svc && !proDoesService(pro, svc)) return { text: `${notDoesText(pro, svc)} Nada foi agendado.` };
    const minutes = minutesOf(svc);
    const pros = pro ? [pro] : prosFor(svc);
    if (!pros.length) return { text: svc ? `Ninguém da equipe ativa faz ${svc.toLowerCase()} (Serviços e equipe › Quem faz).` : 'Não há profissional ativo.' };
    if (client && svc && time) {
      const proId = pros.find((id) => freeTimes(iso, id, minutes, ctx).includes(time));
      if (proId) {
        return {
          text: `${proName(proId)} está livre ${dayWord(iso)} às ${time}. Confirme o agendamento:`,
          action: { kind: 'agendar', client, service: svc, iso, time, professionalId: proId }
        };
      }
    }
    const groups = groupsFor(iso, pros, minutes, ctx);
    if (!groups.length) return { text: `Não há horário livre ${dayWord(iso)}. Tente “encaixe para ${client ? firstName(client) : 'a Helena'}”.` };
    const intent: SlotIntent = client && svc ? { kind: 'agendar', client, service: svc } : { kind: 'abrir', service: svc };
    return {
      text: time ? `Às ${time} não há profissional livre ${dayWord(iso)}. Escolha outro horário:` : `Para quando${client ? ` agendar ${firstName(client)}` : ''}? Livres ${dayWord(iso)}:`,
      slots: { groups, intent }
    };
  }

  // Agenda de um dia
  if (date || /agenda|quem|atendimento|como esta|mostr|\bdia\b/.test(t)) {
    const iso = date ?? ctx.currentIso;
    const items = (ctx.appointments[iso] ?? []).slice().sort((a, b) => a.start.localeCompare(b.start));
    const live = items.filter(active);
    // Dia fechado: avisa, mas continua mostrando o que já estiver marcado nele
    if (isClosed(iso) && live.length === 0) return { text: closedText(iso) };
    return {
      text: `${isClosed(iso) ? `${closedText(iso)} ` : ''}${live.length ? `${dayWord(iso)[0].toUpperCase()}${dayWord(iso).slice(1)}: ${live.length} ${live.length === 1 ? 'atendimento' : 'atendimentos'}.` : `Nenhum atendimento ${dayWord(iso)}.`}`,
      day: { iso, items }
    };
  }

  return {
    text: 'Ainda não entendi esse pedido. Posso consultar horários livres, remarcar, cancelar, buscar encaixes ou mostrar a agenda de um dia.'
  };
}

function professionalIdByName(name: string) {
  return agendaProfessionalByName(name)?.id;
}

/** Turns a tapped free time into the reply that follows it (an action to confirm, or nothing when it just opens the form). */
export function actionFromSlot(intent: SlotIntent, iso: string, time: string, professionalId: string): PendingAction | undefined {
  if (intent.kind === 'remarcar') return { kind: 'remarcar', fromIso: intent.fromIso, appt: intent.appt, toIso: iso, time, professionalId };
  if (intent.kind === 'agendar') return { kind: 'agendar', client: intent.client, service: intent.service, iso, time, professionalId };
  return undefined;
}

export const SUGGESTIONS = [
'Próximo horário livre',
'Remarque a Ana para amanhã às 15h',
'Cancele o horário da Gabriela',
'Encaixe para o Diego',
'Ver a agenda de amanhã'];


export { catalogServices };