/**
 * W1 (11/11/2026, Christian, decisões 15 e 16 + confirmações do início da tarde): PREFERÊNCIA do pedido na lista de espera.
 *
 * Campos: dias da semana (ou qualquer dia), período (manhã, tarde, noite ou qualquer horário), janela de datas
 * ("a partir de", padrão hoje; "até", opcional) e observação livre.
 * Regra: a preferência ORDENA quem recebe a oferta e NUNCA exclui ninguém. "Combina" = a vaga cai dentro da janela de
 * datas, num dia pedido e num período pedido.
 * Períodos (texto de tela, para revisão do Christian): manhã = começa antes das 12h; tarde = das 12h às 17h59;
 * noite = das 18h em diante.
 * Pedido duplicado: mesmo cliente e mesmo serviço = bloqueado; mesmo cliente e outro serviço = avisa e deixa passar.
 * Mensagem pronta da oferta: texto aprovado pelo Christian em 11/11/2026. O cadastro não guarda gênero, então a mensagem
 * e os avisos usam o nome sem artigo ("com Juliana", "Chame Carla").
 */
import { TODAY_ISO } from './agendaStore';
import type { AgendaWaitlistEntry, WaitlistPeriod } from './agenda';
import { clientIdOfRecordedName } from './api/clientes';
import { resolveService } from './catalogo';
import { toMinutes } from '../utils/time';

export const PERIOD_OPTIONS: {value: WaitlistPeriod;label: string;}[] = [
{ value: 'manha', label: 'Manhã' },
{ value: 'tarde', label: 'Tarde' },
{ value: 'noite', label: 'Noite' }];

export const PERIOD_HELP = 'Manhã: até 12h · Tarde: das 12h às 18h · Noite: depois das 18h';

/** Segunda primeiro, como a Agenda. `value` = dia da semana (0 = domingo). */
export const WEEKDAY_OPTIONS: {value: number;label: string;}[] = [
{ value: 1, label: 'Seg' },
{ value: 2, label: 'Ter' },
{ value: 3, label: 'Qua' },
{ value: 4, label: 'Qui' },
{ value: 5, label: 'Sex' },
{ value: 6, label: 'Sáb' },
{ value: 0, label: 'Dom' }];

const WEEKDAY_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export const weekdayOfIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function periodOf(time: string): WaitlistPeriod {
  const m = toMinutes(time);
  return m < 12 * 60 ? 'manha' : m < 18 * 60 ? 'tarde' : 'noite';
}

/** "seg, qua · tarde · de 05/10 a 09/10": a preferência em uma linha, para a fila e para a janela da vaga. */
export function preferenceLabel(e: Pick<AgendaWaitlistEntry, 'preference' | 'days' | 'periods' | 'fromIso' | 'untilIso'>): string {
  // Pedido antigo, sem os campos: mostra o texto que já estava gravado.
  if (!e.fromIso && !e.days && !e.periods) return e.preference;
  const days = e.days ?? [];
  const periods = e.periods ?? [];
  const dayText = days.length === 0 || days.length === 7 ? 'qualquer dia' : WEEKDAY_OPTIONS.filter((o) => days.includes(o.value)).map((o) => o.label.toLowerCase()).join(', ');
  const periodText = periods.length === 0 || periods.length === 3 ? 'qualquer horário' : PERIOD_OPTIONS.filter((o) => periods.includes(o.value)).map((o) => o.label.toLowerCase()).join(' e ');
  const from = e.fromIso ?? TODAY_ISO;
  const windowText = e.untilIso ? e.untilIso === from ? `só em ${dm(from)}` : from <= TODAY_ISO ? `até ${dm(e.untilIso)}` : `de ${dm(from)} a ${dm(e.untilIso)}` : `a partir de ${dm(from)}`;
  return `${dayText} · ${periodText} · ${windowText}`;
}

export type PrefMatch = {window: boolean;day: boolean;period: boolean;full: boolean;text: string;};

/** A vaga (dia + hora de início) combina com o que o pedido quer? Só ORDENA; nunca exclui. */
export function prefMatch(e: AgendaWaitlistEntry, iso: string, start: string): PrefMatch {
  const days = e.days ?? [];
  const periods = e.periods ?? [];
  const window = (!e.fromIso || iso >= e.fromIso) && (!e.untilIso || iso <= e.untilIso);
  const day = days.length === 0 || days.includes(weekdayOfIso(iso));
  const period = periods.length === 0 || periods.includes(periodOf(start));
  const full = window && day && period;
  const misses = [!window ? 'fora das datas pedidas' : '', !day ? 'outro dia da semana' : '', !period ? 'outro período do dia' : ''].filter(Boolean);
  const text = full ? 'Combina com o pedido.' : `Fora da preferência: ${misses.join(', ')}.`;
  return { window, day, period, full, text };
}

const serviceKey = (name: string) => {
  const r = resolveService(name);
  return r.status === 'active' || r.status === 'archived' ? r.service.value : name.trim().toLowerCase();
};

export type DuplicateCheck = {kind: 'same';entry: AgendaWaitlistEntry;} | {kind: 'other';entries: AgendaWaitlistEntry[];} | null;

/** Pedido duplicado (confirmado pelo Christian em 11/11/2026): mesmo serviço bloqueia; outro serviço só avisa. */
export function duplicateOf(list: AgendaWaitlistEntry[], clientName: string, serviceLabel: string): DuplicateCheck {
  if (!clientName) return null;
  const id = clientIdOfRecordedName(clientName);
  const mine = list.filter((e) => id ? clientIdOfRecordedName(e.clientName) === id : e.clientName === clientName);
  if (mine.length === 0) return null;
  const same = serviceLabel ? mine.find((e) => serviceKey(e.service) === serviceKey(serviceLabel)) : undefined;
  return same ? { kind: 'same', entry: same } : { kind: 'other', entries: mine };
}

/** "hoje" · "amanhã" · "na quinta-feira, 03/12" · "no sábado, 05/12" */
export function slotDayPhrase(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = TODAY_ISO.split('-').map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  const wd = weekdayOfIso(iso);
  return `${wd === 0 || wd === 6 ? 'no' : 'na'} ${WEEKDAY_LONG[wd]}, ${dm(iso)}`;
}

/** "Hoje" · "Amanhã" · "Quinta-feira, 03/12": título do grupo de vagas e da janela da vaga. */
export function slotDayTitle(iso: string): string {
  const p = slotDayPhrase(iso);
  if (p === 'hoje') return 'Hoje';
  if (p === 'amanhã') return 'Amanhã';
  const text = `${WEEKDAY_LONG[weekdayOfIso(iso)]}, ${dm(iso)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type OfferText = {clientName: string;service: string;iso: string;time: string;professional: string;};

/** Mensagem pronta da oferta (texto aprovado pelo Christian, 11/11/2026). Vai escrita para a equipe enviar pela conversa. */
export function offerMessage(o: OfferText): string {
  return `Oi, ${o.clientName.split(' ')[0]}! Abriu uma vaga para ${o.service} ${slotDayPhrase(o.iso)}, às ${o.time}, com ${o.professional}. Quer ficar com ela?`;
}

/** Campos da mensagem aprovada `vaga_lista_espera` (data/messageTemplates.ts), na ordem de `vars`. */
export function offerTemplateValues(o: OfferText): string[] {
  return [o.clientName.split(' ')[0], o.service, dm(o.iso), o.time, o.professional];
}

/** Prazo da oferta com a automação ligada (IA Orniplaty › Automações › Lista de espera): "30 minutos" · "2 horas". */
export function offerDeadlineLabel(iso: string, values: Record<string, number>): string {
  if (iso === TODAY_ISO) return `${values['prazo-hoje'] ?? 30} minutos`;
  const h = values['prazo-outro-dia'] ?? 2;
  return `${h} ${h === 1 ? 'hora' : 'horas'}`;
}