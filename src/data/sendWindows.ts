/**
 * W8 (12/11/2026, decisões do Christian de 11/11, 21h40 a 22h30): dias e horários em que a Orniplaty manda mensagens SOZINHA.
 * Duas escolhas da clínica, cada uma com dias da semana + UMA faixa de horário:
 *  - `appointments`: mensagens de horário marcado (confirmação do horário e oferta de vaga da lista de espera). Escolha livre.
 *  - `campaigns`: campanhas ("Chamar clientes de volta"). Só entre 7h e 23h (teto da Orniplaty, escolha de produto, não é lei).
 *    Aviso quando a clínica escolhe domingo, antes das 9h ou depois das 21h. `campaignHolidays`: "Enviar também em feriados".
 * As duas começam em segunda a sábado, das 9h às 20h (valor inicial; revê a regra de 19/10 e a G18).
 * Fora da faixa: a confirmação sai ANTES (`slotAtOrBefore`); a campanha espera a próxima faixa (`slotAtOrAfter`); a oferta
 * de vaga não sai e a vaga fica para a equipe chamar; o prazo da oferta só conta dentro da faixa (`addInsideWindow`).
 * NÃO seguem a faixa: a resposta da assistente a quem escreveu e "Avisar mudança de horário" (decisão I1-2).
 * Arquivo PURO (só data/schedule.ts): o valor salvo fica em `automacoesStore` (data/automacoes.ts, campo `send`); os
 * feriados da clínica ficam em data/sendHolidays.ts. Dias: 0 = segunda … 6 = domingo (mesma ordem de data/schedule.ts).
 * BACKEND: nada disto existe; o horário é o do fuso da clínica. Ver correcao-W8 (Para o Elizeu).
 */
import { addDays, fromMin, toMin, weekdayOf } from './schedule';

export type SendWindow = {days: number[];start: string;end: string;};
export type SendWindows = {appointments: SendWindow;campaigns: SendWindow;campaignHolidays: boolean;};
export type Moment = {iso: string;time: string;};

export const DEFAULT_SEND_WINDOW: SendWindow = { days: [0, 1, 2, 3, 4, 5], start: '09:00', end: '20:00' };
export const DEFAULT_SEND_WINDOWS: SendWindows = {
  appointments: { ...DEFAULT_SEND_WINDOW, days: [...DEFAULT_SEND_WINDOW.days] },
  campaigns: { ...DEFAULT_SEND_WINDOW, days: [...DEFAULT_SEND_WINDOW.days] },
  campaignHolidays: false
};

/** Teto das campanhas (Orniplaty) e limites do aviso. */
export const CAMPAIGN_MIN = '07:00';
export const CAMPAIGN_MAX = '23:00';
export const WARN_BEFORE = '09:00';
export const WARN_AFTER = '21:00';
export const SUNDAY = 6;

export const SEND_DAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const SEND_DAY_LONG = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const DAY_WORD = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** "09:00" → "9h" · "08:30" → "8h30" */
export const hourText = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

const sorted = (days: number[]) => [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);

/** "de segunda a sábado" · "todos os dias" · "segunda, quarta e sexta" · "segunda e terça" · "sábado" */
export function daysText(days: number[]): string {
  const d = sorted(days);
  if (d.length === 0) return 'nenhum dia';
  if (d.length === 7) return 'todos os dias';
  const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (run && d.length >= 3) return `de ${DAY_WORD[d[0]]} a ${DAY_WORD[d[d.length - 1]]}`;
  const names = d.map((x) => DAY_WORD[x]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** "das 9h às 20h" */
export const hoursText = (w: SendWindow) => `das ${hourText(w.start)} às ${hourText(w.end)}`;
/** "de segunda a sábado, das 9h às 20h" */
export const windowText = (w: SendWindow) => `${daysText(w.days)}, ${hoursText(w)}`;

export type WindowErrors = {days?: string;time?: string;};

/** Erros de UMA escolha. `campaign`: aplica o teto das 7h às 23h, com o motivo. */
export function windowErrors(w: SendWindow, campaign: boolean): WindowErrors {
  const out: WindowErrors = {};
  if (sorted(w.days).length === 0) out.days = 'Escolha pelo menos um dia.';
  if (!w.start || !w.end || toMin(w.end) <= toMin(w.start)) out.time = 'O fim precisa ser depois do início.';else
  if (campaign && (toMin(w.start) < toMin(CAMPAIGN_MIN) || toMin(w.end) > toMin(CAMPAIGN_MAX)))
  out.time = 'Escolha um horário entre 7h e 23h. A Orniplaty não envia campanhas fora desse limite, para proteger o número da clínica de bloqueios e denúncias.';
  return out;
}

export const sendWindowsValid = (s: SendWindows) =>
Object.keys(windowErrors(s.appointments, false)).length === 0 && Object.keys(windowErrors(s.campaigns, true)).length === 0;

/** O que dispara o aviso das campanhas: "domingo", "antes das 9h", "depois das 21h". Vazio = sem aviso. */
export function campaignWarnings(w: SendWindow): string[] {
  const out: string[] = [];
  if (w.days.includes(SUNDAY)) out.push('domingo');
  if (w.start && toMin(w.start) < toMin(WARN_BEFORE)) out.push('antes das 9h');
  if (w.end && toMin(w.end) > toMin(WARN_AFTER)) out.push('depois das 21h');
  return out;
}

export const listText = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;

/** Dia em que a faixa vale. `blocked`: datas que não contam (feriados, só para campanhas). */
export const isWindowDay = (w: SendWindow, iso: string, blocked?: (iso: string) => boolean) => w.days.includes(weekdayOf(iso)) && !(blocked?.(iso) ?? false);

const MAX_LOOK = 60;

/** Próximo dia da faixa a partir de `iso` (inclusive). Sem dia possível em 60 dias, devolve o próprio `iso`. */
export function windowDayFrom(w: SendWindow, iso: string, blocked?: (iso: string) => boolean): string {
  let d = iso;
  for (let i = 0; i < MAX_LOOK; i++) {
    if (isWindowDay(w, d, blocked)) return d;
    d = addDays(d, 1);
  }
  return iso;
}

/** Último dia da faixa até `iso` (inclusive). */
function windowDayUntil(w: SendWindow, iso: string): string {
  let d = iso;
  for (let i = 0; i < MAX_LOOK; i++) {
    if (isWindowDay(w, d)) return d;
    d = addDays(d, -1);
  }
  return iso;
}

/** O momento está dentro da faixa? (o fim da faixa já está fora: às 20h em ponto nada novo sai) */
export const insideWindow = (w: SendWindow, m: Moment, blocked?: (iso: string) => boolean) => isWindowDay(w, m.iso, blocked) && m.time >= w.start && m.time < w.end;

/** Primeiro momento permitido A PARTIR de `m` (campanha que espera a próxima faixa). */
export function slotAtOrAfter(w: SendWindow, m: Moment, blocked?: (iso: string) => boolean): Moment {
  const day = windowDayFrom(w, m.iso, blocked);
  if (day !== m.iso) return { iso: day, time: w.start };
  if (m.time < w.start) return { iso: day, time: w.start };
  if (m.time >= w.end) return { iso: windowDayFrom(w, addDays(day, 1), blocked), time: w.start };
  return m;
}

/** Último momento permitido ATÉ `m` (confirmação que cairia fora da faixa sai antes; nunca depois). */
export function slotAtOrBefore(w: SendWindow, m: Moment): Moment {
  if (isWindowDay(w, m.iso)) {
    if (m.time >= w.start && m.time <= w.end) return m;
    if (m.time > w.end) return { iso: m.iso, time: w.end };
  }
  return { iso: windowDayUntil(w, addDays(m.iso, -1)), time: w.end };
}

/**
 * Prazo que só conta DENTRO da faixa: soma `minutes` a partir de `from`, pulando o que está fora (noite, dias sem envio).
 * Ex.: faixa 9h–20h, oferta às 19:50 com 30 minutos → 10 minutos hoje + 20 amanhã = amanhã às 09:20.
 */
export function addInsideWindow(w: SendWindow, from: Moment, minutes: number): Moment {
  let cur = slotAtOrAfter(w, from);
  let left = minutes;
  for (let i = 0; i < MAX_LOOK; i++) {
    const room = toMin(w.end) - toMin(cur.time);
    if (left <= room) return { iso: cur.iso, time: fromMin(toMin(cur.time) + left) };
    left -= room;
    cur = { iso: windowDayFrom(w, addDays(cur.iso, 1)), time: w.start };
  }
  return cur;
}

export const momentStamp = (m: Moment) => `${m.iso}T${m.time}`;