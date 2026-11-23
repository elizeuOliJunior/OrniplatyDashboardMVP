/**
 * Front-end only state helpers for the Agenda (no backend in the prototype).
 * The sample week is 28/09 to 04/10/2026 (segunda a domingo); "today" is Thursday 01/10.
 */
import type { AppointmentStatus } from '../components/AppointmentItem';
import { agendaAppointments } from './agenda';
import { weekDays } from './agendaSemana';
import { serviceByLabel } from './catalogo';
import { fromMinutes, toMinutes } from '../utils/time';

/*
 * RELÓGIO ÚNICO do protótipo (G1, F-017): "hoje" e "agora" moram só aqui. Início (saudação e data por extenso), Conversas,
 * trilhas de alteração (data/legado.ts), estado da assistente (data/settingsStore.ts), assistente da Agenda, pacotes e os
 * balões das prévias derivam destes valores. Mudar `TODAY_ISO`/`NOW` muda todas as telas.
 */
export const TODAY_ISO = '2026-10-01';
/** Hora "agora" do protótipo (HH:mm). */
export const NOW = '09:20';
/** Hora inteira de `NOW` (para a saudação). */
export const NOW_HOUR = Number(NOW.slice(0, 2));
const BASE_MONDAY = Date.UTC(2026, 8, 28); // 28/09/2026

/** "01/10" */
export const todayShort = () => `${TODAY_ISO.slice(8, 10)}/${TODAY_ISO.slice(5, 7)}`;
/** "01/10 09:20" — carimbo de trilhas e registros do protótipo. */
export const nowStamp = () => `${todayShort()} ${NOW}`;
/** "01/10, 09:20" — forma usada em avisos ("desligada em 01/10, 09:20"). */
export const nowDateTimeLabel = () => `${todayShort()}, ${NOW}`;
/** "2026-10-01T09:20:00" — carimbo ISO local do protótipo. */
export const nowIso = () => `${TODAY_ISO}T${NOW}:00`;
/** "Bom dia" · "Boa tarde" · "Boa noite" pelo relógio do protótipo. */
export const greeting = (hour: number = NOW_HOUR) => hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
/**
 * G4 (F-064/F-068): TEMPO DECORRIDO compartilhado. O relógio do protótipo continua parado em `TODAY_ISO`/`NOW` (as datas e
 * horas exibidas não mudam), mas contagens que precisam andar (pausa de 10 min da assistente, espera para pedir outro
 * código) usam os milissegundos reais desde que a sessão abriu, numa fonte só. Recarregar zera.
 */
const SESSION_START = typeof performance !== 'undefined' && performance.now ? -performance.now() : 0;
let elapsedOffset = 0;
export const sessionElapsedMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() + SESSION_START : Date.now() % 1e9) + elapsedOffset;
/** Só para testes: avança o tempo decorrido. */
export const advanceElapsedForTests = (ms: number) => {
  elapsedOffset += ms;
};
/** "9 min", "1 min" (arredonda para cima; mínimo 1). */
export const minutesLeftLabel = (ms: number) => `${Math.max(1, Math.ceil(ms / 60000))} min`;

/** `iso`+`time` já passou pelo relógio do protótipo? */
export const isPastNow = (iso: string, time: string) => iso < TODAY_ISO || iso === TODAY_ISO && time < NOW;

/** W3 (11/11/2026, Christian, G3): quem cancelou. Cancelamento da clínica não vira "Sumiu" em Oportunidades. */
export type CancelledBy = 'client' | 'clinic';

export type CalAppointment = {
  id: string;
  professionalId: string;
  start: string;
  end: string;
  clientName: string;
  service: string;
  fromWaitlist?: boolean;
  status: AppointmentStatus;
  /**
   * G1 subetapa 2 (F-006): caso de Oportunidades que originou este horário (ligação EXPLÍCITA: "Agendar" do caso ou
   * fixture da amostra). Só a ligação explícita credita "Voltou" e valor recuperado; semelhança de cliente/serviço só gera "Agendou".
   */
  followUpCaseId?: string;
  /** Data em que o horário foi criado (eventos novos: relógio do protótipo; amostra: só quando conhecida). */
  createdIso?: string;
  /**
   * G1 subetapa 3 (F-007): origem explícita do agendamento. Equivale ao contrato `source=whatsapp` +
   * `created_actor_type=ai_whatsapp` (CT-18). O Painel cria sempre `painel`/`user`; nada é deduzido por semelhança.
   */
  source?: 'whatsapp' | 'painel';
  createdActorType?: 'ai_whatsapp' | 'user';
  /** G3 (F-043): observação digitada ao criar o agendamento (interna). */
  note?: string;
  /** G3 (F-043): observação digitada no "Fechar atendimento" (compareceu ou faltou). */
  closingNote?: string;
  /**
   * G3 (F-052): pacote PRÉ-VINCULADO no agendamento. Só indica a intenção: a sessão é consumida no fechamento
   * (contrato histórico `package_sale_id` no agendamento).
   */
  packageSaleId?: string | null;
  /** G3 (F-046): cancelamento com motivo, data e Perfil do momento (o agendamento não é apagado). */
  cancelReason?: string;
  cancelledAt?: string;
  /**
   * W3 (11/11/2026, Christian, G3; combinado 1 entre faixas): QUEM cancelou — 'client' (o cliente pediu) ou 'clinic' (a
   * clínica cancelou: ausência, bloqueio, feriado…). Pode faltar em registros antigos: quem lê trata a ausência como
   * "não informado". Antes da W3 este campo guardava o Perfil da equipe; isso passou para `cancelledByUser`.
   */
  cancelledBy?: CancelledBy;
  /** W3: quem da equipe registrou o cancelamento (Perfil do momento). Era `cancelledBy` até a v169. */
  cancelledByUser?: string;
  /** W3 (A1-15): histórico de remarcações deste agendamento (mais antigo primeiro). */
  history?: {at: string;text: string;}[];
};

export type CalBlock = {
  id: string;
  /** null = every professional */
  professionalId: string | null;
  start: string;
  end: string;
  label: string;
};

const WEEKDAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** ISO date of a weekday (0 = Monday … 6 = Sunday) in a week offset from the sample week. */
export function isoFor(weekOffset: number, dayIndex: number) {
  return toIso(new Date(BASE_MONDAY + (weekOffset * 7 + dayIndex) * 86400000));
}

/** "quinta-feira, 1º de outubro" — subtítulo do Início (dia de hoje por extenso). */
export function todayHeaderLabel(iso: string = TODAY_ISO) {
  const d = toDate(iso);
  const day = d.getUTCDate();
  const wd = d.getUTCDay();
  const name = WEEKDAYS_LONG[wd].toLowerCase();
  return `${wd === 0 || wd === 6 ? name : `${name}-feira`}, ${day === 1 ? '1º' : day} de ${MONTHS[d.getUTCMonth()]}`;
}

/** "Quinta, 1º de outubro" */
export function longDayLabel(iso: string) {
  const d = toDate(iso);
  const day = d.getUTCDate();
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${day === 1 ? '1º' : day} de ${MONTHS[d.getUTCMonth()]}`;
}

/** "Quinta, 01/10" */
export function mediumDayLabel(iso: string) {
  const d = toDate(iso);
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
}

/** "Qui" and "01/10" */
export function shortDayParts(iso: string) {
  const d = toDate(iso);
  return { label: WEEKDAYS_SHORT[d.getUTCDay()], date: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}` };
}

/** "Semana de 28/09 a 04/10" (segunda a domingo: os 7 dias, sempre) */
export function weekRangeLabel(weekOffset: number) {
  const a = shortDayParts(isoFor(weekOffset, 0)).date;
  const b = shortDayParts(isoFor(weekOffset, 6)).date;
  return `Semana de ${a} a ${b}`;
}

export function endFor(service: string, start: string) {
  const minutes = serviceByLabel(service)?.minutes ?? 60;
  return fromMinutes(toMinutes(start) + minutes);
}

const todayStatus: Record<string, AppointmentStatus> = {
  'Carla Mendes': 'completed',
  'Ana Ribeiro': 'confirmed',
  'Bruno Costa': 'pending_confirmation',
  'Fernanda Lima': 'confirmed',
  'Gabriela Rocha': 'pending_confirmation'
};

/** Initial appointments of the sample week, keyed by ISO date. */
export function initialAppointments(): Record<string, CalAppointment[]> {
  const map: Record<string, CalAppointment[]> = {};
  weekDays.forEach((day, i) => {
    const iso = isoFor(0, i);
    if (iso === TODAY_ISO) {
      map[iso] = agendaAppointments.map((a) => ({ ...a, status: todayStatus[a.clientName] ?? 'confirmed' }));
      return;
    }
    map[iso] = day.appointments.map((a) => ({
      id: a.id,
      professionalId: a.professionalId,
      start: a.time,
      end: endFor(a.service, a.time),
      clientName: a.clientName,
      service: a.service,
      fromWaitlist: a.fromWaitlist,
      status: iso < TODAY_ISO ? 'completed' : 'confirmed'
    }));
  });
  // Oportunidades › "Hora do retorno" (20/10/2026, aprovado pelo Christian): atendimentos concluídos em setembro cujo
  // retorno vence em até 3 dias ou já venceu. Sem eles, nenhum retorno da amostra entraria no critério da aba.
  const seed = (iso: string, a: Omit<CalAppointment, 'end' | 'status'>) => {
    map[iso] = [...(map[iso] ?? []), { ...a, end: endFor(a.service, a.start), status: 'completed' as AppointmentStatus }];
  };
  seed('2026-09-01', { id: 'set-mariana', professionalId: 'juliana', start: '10:00', clientName: 'Mariana Teixeira', service: 'Limpeza de pele' });
  seed('2026-09-22', { id: 'set-carla', professionalId: 'juliana', start: '09:00', clientName: 'Carla Mendes', service: 'Drenagem linfática' });
  seed('2026-09-24', { id: 'set-bruno', professionalId: 'juliana', start: '09:00', clientName: 'Bruno Costa', service: 'Drenagem linfática' });
  // G1 subetapa 2 (FIXTURE DA AMOSTRA, 25/10/2026): o atendimento de 31/08 que o caso fixo da Carla citava ("Atendimento 31/08").
  // Antes ele só existia como texto do caso; agora o retorno é gerado pela regra do serviço a partir deste registro.
  seed('2026-08-31', { id: 'amostra-carla-0831', professionalId: 'juliana', start: '09:00', clientName: 'Carla Mendes', service: 'Limpeza de pele' });
  // Demonstração (Etapa 7): o último atendimento de 30/09 ficou sem fechamento — aparece como "Aguardando fechamento".
  const prev = map['2026-09-30'];
  if (prev && prev.length > 0) {
    const last = prev.length - 1;
    map['2026-09-30'] = prev.map((a, k) => k === last ? { ...a, status: 'confirmed' as AppointmentStatus } : a);
  }
  // Oportunidades › motivo Faltou (Lote A, 20/10/2026, aprovado pelo Christian): falta de 30/09, depois do ajuste acima.
  map['2026-09-30'] = [
  ...(map['2026-09-30'] ?? []),
  { id: 'set-otavio', professionalId: 'carolina', start: '11:00', end: endFor('Peeling químico', '11:00'), clientName: 'Otávio Reis', service: 'Peeling químico', status: 'no_show' as AppointmentStatus }];

  // G1 subetapa 2 (FIXTURES DA AMOSTRA): ligações explícitas caso → horário que os casos fixos já afirmavam
  // (Ana "Agendou: Limpeza de pele em 01/10, às 09:00"; Carla "Atendida e paga em 01/10"). Data de criação = a resposta de 25/09.
  const SAMPLE_LINKS: Record<string, {caseId: string;createdIso: string;}> = {
    c1: { caseId: 'fu-pacote-pk3', createdIso: '2026-09-25' },
    j1: { caseId: 'fu-ret-amostra-carla-0831', createdIso: '2026-09-25' }
  };
  map[TODAY_ISO] = (map[TODAY_ISO] ?? []).map((a) => SAMPLE_LINKS[a.id] ? { ...a, followUpCaseId: SAMPLE_LINKS[a.id].caseId, createdIso: SAMPLE_LINKS[a.id].createdIso } : a);
  // G3 (F-045, FIXTURES DA AMOSTRA): os dois cancelamentos de hoje que liberaram as vagas que a lista fixa antiga mostrava
  // (10:30 preenchida por Bruno pela lista de espera; 15:00 livre desde a R1 de 06/11, antes oferecida a Fernanda). As vagas agora são DERIVADAS daqui.
  // W3: os dois foram pedidos dos clientes pelo WhatsApp → `cancelledBy: 'client'`; o Perfil antigo foi para `cancelledByUser`.
  // I3 (11/11/2026, decisão I1-4a do Christian): o cancelado das 10:30 é de Lucas Ferreira (era Rodrigo Pires, que na amostra
  // só pediu preço e nunca teve horário marcado).
  map[TODAY_ISO] = [
  ...(map[TODAY_ISO] ?? []),
  { id: 'amostra-vaga-1030', professionalId: 'juliana', start: '10:30', end: endFor('Drenagem linfática', '10:30'), clientName: 'Lucas Ferreira', service: 'Drenagem linfática', status: 'cancelled' as AppointmentStatus, createdIso: '2026-09-24', cancelReason: 'Avisou pelo WhatsApp que não pode vir', cancelledAt: '01/10 07:40', cancelledBy: 'client', cancelledByUser: 'Amostra' },
  { id: 'amostra-vaga-1500', professionalId: 'juliana', start: '15:00', end: endFor('Drenagem linfática', '15:00'), clientName: 'Juliana Prado', service: 'Drenagem linfática', status: 'cancelled' as AppointmentStatus, createdIso: '2026-09-26', cancelReason: 'Avisou pelo WhatsApp que não pode vir', cancelledAt: '01/10 08:55', cancelledBy: 'client', cancelledByUser: 'Amostra' }];

  return map;
}

/** Lunch block that appears every weekday. */
export const lunchBlock: CalBlock = { id: 'almoco', professionalId: null, start: '12:00', end: '13:00', label: 'Bloqueado · almoço' };