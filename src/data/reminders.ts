import { useSyncExternalStore } from 'react';
import { NOW, TODAY_ISO } from './agendaStore';
import { clockLabel, dayWord } from './replyWindow';
import { clientIdFromName, kindOf, remindersBlockedOfName, stoppedLine } from './contactPreferences';
import { getSettings, waKey, whatsappStopped } from './settingsStore';
import { getConflictCases } from './conflictCases';

/*
 * T1 (Tend, 04/11/2026) · O-04. Situação do LEMBRETE de cada agendamento (um lembrete por agendamento; sem reenvio).
 * PROTÓTIPO: registros de amostra. No produto: `confirmation_status` + status da mensagem do lembrete + `reschedule_requested_at`
 * (novo) — adendo do contrato T2. Divergências do backend `origin/main` 04ccb3c9 registradas no Projeto.
 * T1 1b: `respondeu-mensagem` = o cliente respondeu em TEXTO e ninguém confirmou (caso Gabriela, decisão do Christian, 04/11);
 * a ação "O cliente confirmou" grava `confirmado-equipe`. Para o T2: expor esse estado no backend.
 * T1 1k: `failedReminders()` alimenta o sino de notificações ("Lembretes que falharam"). A amostra não tem nenhum lembrete
 * com falha hoje (todos os lembretes já enviados chegaram); a categoria aparece quando houver.
 * R3 (06/11/2026, Christian, A-39): lembrete enviado À MÃO pela equipe CONTA como o lembrete do agendamento
 * (`by: 'equipe'`, status "Lembrete enviado pela equipe"). Como é um lembrete por agendamento, sem reenvio, o envio
 * automático daquele agendamento não acontece depois. Para o T2: o envio de modelo pela equipe precisa levar o agendamento.
 * I1 (11/11/2026, integração, item 6; decisão G12): o lembrete respeita o pedido de saída. Cliente com pedido de saída
 * que NÃO pediu os lembretes de volta (`remindersBlockedOf`, data/contactPreferences.ts) não recebe lembrete: o horário
 * de hoje em diante sem lembrete já enviado mostra a linha do motivo.
 * L24d (19/11/2026): essa linha vem do dicionário: "Não recebe lembretes de horário: {motivo}" (`stoppedLine('lembretes')`),
 * no lugar de "Lembrete não enviado · o cliente pediu para não receber mensagens". Nenhuma regra mudou.
 * BACKEND: o envio do lembrete precisa conferir as escolhas da Ficha.
 * W9a (12/11/2026, conferência final, J-05 e NF-1): ORDEM dos motivos de "o lembrete não sai", a mesma de
 * data/appointmentNotices.ts (`reminderNotice`):
 *  1. o WhatsApp não está funcionando (`whatsappStopped`, data/settingsStore.ts): vem ANTES de todos, enquanto durar;
 *  2. o cliente parou os lembretes de horário;
 *  3. o horário está em conflito (caso em "Falta resolver", data/conflictCases.ts): o lembrete espera a equipe resolver;
 *  4. os motivos do registro (fora do prazo, sem telefone, lembretes desligados).
 * 1 e 3 valem só para horário de hoje em diante cujo lembrete ainda não saiu, e só enquanto durarem (não são gravados).
 * BACKEND: o envio do lembrete precisa conferir a conexão do WhatsApp e o conflito do horário no momento do envio.
 */

export type ReminderOutcome = 'confirmou' | 'remarcar' | 'cancelou' | 'respondeu-mensagem' | 'confirmado-equipe';
type NotSentReason = 'fora-do-prazo' | 'sem-telefone' | 'desligados' | 'pediu-saida' | 'whatsapp' | 'conflito';
export type ReminderRecord =
{stage: 'nao-enviado';reason: NotSentReason;line?: string;} |
{stage: 'enviado' | 'entregue' | 'lido';at: string;outcome?: ReminderOutcome;replyText?: string;by?: 'equipe';} |
{stage: 'falhou';at: string;reason: string;};

export const reminderKey = (iso: string, clientName: string, start: string) => `${iso}|${clientName}|${start}`;

/** FIXTURE DA AMOSTRA (04/11/2026). */
const records: Record<string, ReminderRecord> = {
  [reminderKey('2026-10-01', 'Bruno Costa', '10:30')]: { stage: 'nao-enviado', reason: 'fora-do-prazo' },
  [reminderKey('2026-10-01', 'Gabriela Rocha', '15:30')]: { stage: 'lido', at: '2026-09-30T17:02', outcome: 'respondeu-mensagem', replyText: 'Pode sim!' },
  [reminderKey('2026-10-01', 'Fernanda Lima', '14:00')]: { stage: 'lido', at: '2026-09-30T14:05', outcome: 'confirmou' },
  [reminderKey('2026-10-01', 'Ana Ribeiro', '09:00')]: { stage: 'lido', at: '2026-09-30T09:02', outcome: 'confirmou' },
  [reminderKey('2026-10-02', 'Ana Ribeiro', '09:00')]: { stage: 'nao-enviado', reason: 'fora-do-prazo' }
};

let version = 0;
const listeners = new Set<() => void>();
export function useRemindersVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => version
  );
}

/**
 * W9a (J-05): o WhatsApp parado, nas palavras da tela. "Desconectado" só quando é esse o estado; nos outros (autorização
 * vencida ou cancelada, nunca conectado) a frase é a geral, a mesma de data/settingsStore.ts.
 */
export const whatsappDown = () => whatsappStopped(getSettings());
export const whatsappDownText = () => waKey(getSettings()) === 'desconectado' ? 'o WhatsApp está desconectado' : 'o WhatsApp não está funcionando';

/** W9a (NF-1): o horário está em conflito agora (caso em "Falta resolver" na Agenda). */
export const slotInConflict = (iso: string, clientName: string, start: string) =>
getConflictCases().some((c) => c.state === 'resolver' && c.iso === iso && c.start === start && c.client === clientName);

export function reminderOf(iso: string, clientName: string, start: string): ReminderRecord | null {
  const rec = records[reminderKey(iso, clientName, start)] ?? null;
  const pending = iso >= TODAY_ISO && (!rec || rec.stage === 'nao-enviado');
  // W9a (J-05): com o WhatsApp parado nenhum lembrete sai. Esse motivo vem antes dos outros enquanto durar.
  if (pending && whatsappDown()) return { stage: 'nao-enviado', reason: 'whatsapp' };
  // I1 (G12) + L24d: lembretes de horário parados → o lembrete deste horário não sai; a linha vem do dicionário.
  if (pending && remindersBlockedOfName(clientName)) return { stage: 'nao-enviado', reason: 'pediu-saida', line: stoppedLine('lembretes', kindOf(clientIdFromName(clientName), 'lembretes')) };
  // W9a (NF-1): horário em conflito e lembrete ainda por sair → espera a equipe resolver o conflito.
  if (iso >= TODAY_ISO && !rec && slotInConflict(iso, clientName, start)) return { stage: 'nao-enviado', reason: 'conflito' };
  return rec;
}

/** Lembretes que não chegaram (de agendamentos de hoje em diante). */
export function failedReminders(): {key: string;iso: string;clientName: string;start: string;at: string;reason: string;}[] {
  return Object.entries(records).flatMap(([key, r]) => {
    if (r.stage !== 'falhou') return [];
    const [iso, clientName, start] = key.split('|');
    return iso >= TODAY_ISO ? [{ key, iso, clientName, start, at: r.at, reason: r.reason }] : [];
  });
}

/** "O cliente confirmou" (equipe): grava no lembrete que a equipe confirmou a partir da resposta por mensagem. */
export function markConfirmedByTeam(iso: string, clientName: string, start: string) {
  const k = reminderKey(iso, clientName, start);
  const r = records[k];
  if (r && (r.stage === 'enviado' || r.stage === 'entregue' || r.stage === 'lido')) records[k] = { ...r, outcome: 'confirmado-equipe' };
  version += 1;
  listeners.forEach((l) => l());
}

/**
 * R3 (06/11/2026, Christian, A-39): a equipe enviou à mão o modelo `lembrete_confirmacao` deste agendamento (Conversas).
 * Vira o lembrete do agendamento. Se o lembrete automático já saiu (enviado/entregue/lido), nada muda: um por agendamento.
 * Substitui "não enviado" e "falhou" (a equipe mandou de novo depois da falha).
 */
export function markSentByTeam(iso: string, clientName: string, start: string, at = `${TODAY_ISO}T${NOW}`) {
  const k = reminderKey(iso, clientName, start);
  const r = records[k];
  if (r && r.stage !== 'nao-enviado' && r.stage !== 'falhou') return;
  records[k] = { stage: 'enviado', at, by: 'equipe' };
  version += 1;
  listeners.forEach((l) => l());
}

const NOT_SENT: Record<Exclude<NotSentReason, 'whatsapp' | 'conflito'>, string> = {
  'fora-do-prazo': 'marcado depois do horário do lembrete',
  'sem-telefone': 'cliente sem telefone',
  desligados: 'lembretes desligados',
  'pediu-saida': 'não recebe lembretes de horário'
};
const STAGE: Record<'enviado' | 'entregue' | 'lido', string> = { enviado: 'enviado', entregue: 'entregue', lido: 'lido' };

export type ReminderView = {line: string;short: string;tone: 'success' | 'info' | 'warning' | 'error' | 'neutral';};

/** Situação do lembrete em texto (Agenda, detalhe do agendamento). */
export function reminderView(rec: ReminderRecord | null, apptIso: string): ReminderView | null {
  const row = reminderRow(rec, apptIso);
  if (!row) return null;
  const tone = row.state === 'confirmou' ? 'success' : row.state === 'falhou' ? 'error' : row.state === 'nao-enviado' || row.state === 'cancelou' ? 'neutral' : row.state === 'remarcar' || row.state === 'sem-resposta' || row.state === 'respondeu-mensagem' ? 'warning' : 'info';
  return { line: row.text, short: row.short, tone };
}

export type ReminderRow = {
  state: 'nao-enviado' | 'enviado' | 'entregue' | 'lido' | 'confirmou' | 'remarcar' | 'cancelou' | 'sem-resposta' | 'respondeu-mensagem' | 'falhou';
  text: string;
  detail?: string;
  short: string;
  /** Mostra a ação "O cliente confirmou". */
  canConfirm?: boolean;
};

/** Linha do lembrete para `ReminderStatusRow` (v3.19). `apptIso` decide "sem resposta" × "aguardando resposta". */
export function reminderRow(rec: ReminderRecord | null, apptIso: string): ReminderRow | null {
  if (!rec) return null;
  if (rec.stage === 'nao-enviado') {
    // W9a (J-05, NF-1): motivos que valem só enquanto durarem. O lembrete ainda não saiu, por isso "não sai" (e não "não enviado").
    if (rec.reason === 'whatsapp') return { state: 'nao-enviado', text: `Lembrete não sai · ${whatsappDownText()}`, detail: 'Nenhum lembrete sai pelo painel até reconectar o WhatsApp.', short: 'Não sai' };
    if (rec.reason === 'conflito') return { state: 'nao-enviado', text: 'Lembrete não sai · o horário está em conflito', detail: 'O lembrete espera o conflito ser resolvido.', short: 'Não sai' };
    // L24d: lembretes de horário parados → "Não recebe lembretes de horário: {motivo}" (dicionário).
    if (rec.reason === 'pediu-saida') return { state: 'nao-enviado', text: rec.line ?? 'Não recebe lembretes de horário', short: 'Não enviado' };
    return { state: 'nao-enviado', text: `Lembrete não enviado · ${NOT_SENT[rec.reason]}`, short: 'Não enviado' };
  }
  const when = `${dayWord(rec.at.slice(0, 10))} às ${clockLabel(rec.at)}`;
  if (rec.stage === 'falhou') return { state: 'falhou', text: `Lembrete não chegou ${when}`, detail: rec.reason, short: 'Falhou' };
  // R3 (06/11/2026, Christian, A-39): enviado à mão pela equipe → "Lembrete enviado pela equipe" (quando vai no detalhe).
  const byTeam = rec.by === 'equipe';
  const head = byTeam ? 'Lembrete enviado pela equipe' : `Lembrete ${STAGE[rec.stage]} ${when}`;
  if (rec.outcome === 'confirmou') return { state: 'confirmou', text: `${head} · Confirmou`, short: 'Confirmou' };
  if (rec.outcome === 'confirmado-equipe') return { state: 'confirmou', text: 'Confirmado pela equipe', detail: 'O cliente respondeu por mensagem e a equipe confirmou o horário.', short: 'Confirmou' };
  if (rec.outcome === 'remarcar') return { state: 'remarcar', text: 'Pediu para remarcar', detail: 'A assistente está cuidando.', short: 'Remarcar' };
  if (rec.outcome === 'cancelou') return { state: 'cancelou', text: `${head} · Cancelou`, short: 'Cancelou' };
  if (rec.outcome === 'respondeu-mensagem')
  return { state: 'respondeu-mensagem', text: 'Respondeu por mensagem · confira', detail: rec.replyText ? `Respondeu “${rec.replyText}” e ninguém confirmou o horário ainda.` : 'Ninguém confirmou o horário ainda.', short: 'Confira', canConfirm: true };
  if (byTeam)
  return apptIso <= TODAY_ISO ?
  { state: 'sem-resposta', text: head, detail: `Enviado ${when} · sem resposta`, short: 'Sem resposta' } :
  { state: rec.stage, text: head, detail: `Enviado ${when} · aguardando resposta`, short: 'Aguardando' };
  return apptIso <= TODAY_ISO ? { state: 'sem-resposta', text: `${head} · sem resposta`, short: 'Sem resposta' } : { state: rec.stage, text: `${head} · aguardando resposta`, short: 'Aguardando' };
}