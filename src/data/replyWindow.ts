import { useSyncExternalStore } from 'react';
import { NOW, TODAY_ISO } from './agendaStore';

/*
 * T1 (Tend, 04/11/2026) · O-01 e O-02. FONTE ÚNICA da janela de 24 h e da espera da fila "Aguardando você".
 * PROTÓTIPO: o relógio é o do protótipo (01/10/2026, 09:20, `TODAY_ISO`/`NOW`), parado.
 * No produto real, a janela (`reply_window_expires_at`) e a trava do envio (409 `reply_window_closed`) são do backend
 * (adendo do contrato T2). Regra: abre ou renova SÓ a cada mensagem RECEBIDA do cliente.
 */

export function absMin(isoDateTime: string) {
  const [d, t = '00:00'] = isoDateTime.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 60000) + h * 60 + min;
}
export const nowAbsMin = () => absMin(`${TODAY_ISO}T${NOW}`);

export const WINDOW_MIN = 24 * 60;
export const CLOSING_MIN = 2 * 60;

/** "9h15" · "14h30" · "11h" */
export function clockLabel(isoDateTime: string) {
  const t = isoDateTime.split('T')[1] ?? '00:00';
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  return m === '00' ? `${h}h` : `${h}h${m}`;
}
/** "40 min" · "1h40" · "2h" */
export function durationLabel(min: number) {
  const v = Math.max(0, Math.floor(min));
  if (v < 60) return `${Math.max(1, v)} min`;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
/** "22 h 49 min" · "1 h" · "40 min" (selo da janela, como a referência Tend). */
export function leftLabel(min: number) {
  const v = Math.max(1, Math.floor(min));
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
/** "hoje" · "amanhã" · "ontem" · "02/10" */
export function dayWord(isoDate: string) {
  const diff = Math.round((absMin(`${isoDate}T00:00`) - absMin(`${TODAY_ISO}T00:00`)) / 1440);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}
const fromAbs = (abs: number) => {
  const d = new Date(abs * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

export type WindowState =
{band: 'aberta';closesAt: string;leftMin: number;text: string;} |
{band: 'fechando';closesAt: string;leftMin: number;text: string;} |
{band: 'fechada';text: string;};

export function replyWindow(lastInboundAt: string | undefined, closedByRace = false): WindowState {
  if (!lastInboundAt || closedByRace) return { band: 'fechada', text: 'Parada há mais de 24 horas' };
  const closesAbs = absMin(lastInboundAt) + WINDOW_MIN;
  const left = closesAbs - nowAbsMin();
  if (left <= 0) return { band: 'fechada', text: 'Parada há mais de 24 horas' };
  const closesAt = fromAbs(closesAbs);
  if (left < CLOSING_MIN) return { band: 'fechando', closesAt, leftMin: left, text: `Você pode responder só até ${clockLabel(closesAt)} (faltam ${durationLabel(left)})` };
  return { band: 'aberta', closesAt, leftMin: left, text: `Você pode responder até ${dayWord(closesAt.slice(0, 10))}, ${clockLabel(closesAt)}` };
}

export type WindowBadge = {band: WindowState['band'];label: string;value?: string;spoken: string;};

/**
 * Selo da janela no cabeçalho da conversa. T1 1c (04/11, Christian: "como a referência"): rótulo + tempo que falta.
 * Aberta: "Janela de resposta · 22 h 49 min restantes" (verde). Menos de 2 h: o mesmo, em âmbar.
 * Fechada: "Só mensagem aprovada" (cinza, cadeado). Substitui "Até amanhã, 9h" (ponto B de 04/11).
 */
export function windowBadge(win: WindowState): WindowBadge {
  if (win.band === 'fechada') return { band: 'fechada', label: 'Só mensagem aprovada', spoken: 'Fora da janela de 24 horas: por aqui, só mensagem aprovada até o cliente responder.' };
  const value = `${leftLabel(win.leftMin)} restantes`;
  const until = `${dayWord(win.closesAt.slice(0, 10))}, ${clockLabel(win.closesAt)}`;
  return { band: win.band, label: 'Janela de resposta', value, spoken: `Janela de resposta: ${value}, até ${until}.` };
}

/* ───────────── O-02: espera da fila ───────────── */

export const AMBER_MIN = 15;
export const RED_MIN = 60;

export function agoLabel(min: number) {
  if (min >= 1440) {
    const d = Math.floor(min / 1440);
    return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  // R2 (06/11/2026, A-31): espera que começou ontem → "desde ontem, 11h01" (antes "há 22h19").
  const start = fromAbs(nowAbsMin() - Math.floor(min));
  if (start.slice(0, 10) !== TODAY_ISO) return `desde ${dayWord(start.slice(0, 10))}, ${clockLabel(start)}`;
  return `há ${durationLabel(min)}`;
}

export type WaitBadge = {tone: 'warning' | 'error' | 'neutral';label: string;} | null;

/** Selo de espera: âmbar ≥ 15 min, vermelho ≥ 60 min; abaixo de 15 min, sem selo. Fora do expediente: "fora do horário" (cinza). */
export function waitBadge(min: number, offHours: boolean): WaitBadge {
  if (min < AMBER_MIN) return null;
  if (offHours) return { tone: 'neutral', label: 'fora do horário' };
  if (min >= RED_MIN) return { tone: 'error', label: agoLabel(min) };
  return { tone: 'warning', label: agoLabel(min) };
}

const SERVER_REASONS: [RegExp, string][] = [
[/^A IA não conseguiu responder por uma falha técnica/i, 'A assistente teve uma falha e não respondeu'],
[/^A IA não gerou resposta/i, 'A assistente teve uma falha e não respondeu'],
[/^A IA não encontrou os dados da conversa/i, 'A assistente teve uma falha e não respondeu'],
[/^Falha (técnica )?ao executar/i, 'A assistente teve uma falha e não respondeu'],
[/^A IA respondeu, mas o WhatsApp recusou o envio/i, 'O WhatsApp recusou a resposta da assistente'],
[/^O cliente enviou algo que a IA não consegue ler/i, 'Mandou áudio, imagem ou documento'],
[/^O cliente ficou esperando durante uma pausa longa/i, 'Ficou esperando durante uma pausa da assistente'],
[/^O cliente está sem resposta há mais tempo que o aceitável/i, 'Está sem resposta há muito tempo'],
[/^Cliente já tem .+ agendado e a IA não conseguiu esclarecer/i, 'Não ficou claro se quer remarcar ou marcar outro horário'],
[/^(Solicitação de atendimento humano|Solicitado pela IA)$/i, 'Pediu para falar com a equipe']];

export function reasonLine(reason: string | undefined, kind: 'ia' | 'equipe') {
  if (kind === 'equipe') return 'Você assumiu · mensagem sem resposta';
  const r = (reason ?? '').trim();
  if (!r) return 'Pediu ajuda';
  for (const [re, plain] of SERVER_REASONS) if (re.test(r)) return plain;
  return r;
}

/* ───────────── cenários do seletor de telas (só protótipo) ───────────── */

export type ConversasScenario = 'normal' | 'carregando' | 'fora-do-horario' | 'envio-recusado';
export const CONVERSAS_SCENARIOS: {value: ConversasScenario;label: string;}[] = [
{ value: 'normal', label: 'Normal' },
{ value: 'carregando', label: 'Lista carregando' },
{ value: 'fora-do-horario', label: 'Agora: fora do expediente' },
{ value: 'envio-recusado', label: 'Envio recusado (24 h passaram)' }];

let scenario: ConversasScenario = 'normal';
const listeners = new Set<() => void>();
export function setConversasScenario(v: ConversasScenario) {
  scenario = v;
  listeners.forEach((l) => l());
}
export const getConversasScenario = () => scenario;
export function useConversasScenario() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => scenario
  );
}