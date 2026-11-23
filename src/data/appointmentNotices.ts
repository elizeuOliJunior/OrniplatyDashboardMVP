/**
 * W3 (11/11/2026, Christian, achado A1-11): depois de agendar, remarcar ou cancelar, UMA linha diz quem foi avisado:
 *  - o profissional recebe aviso no WhatsApp, ou "não recebe aviso: falta o WhatsApp" (com o caminho para completar);
 *  - quando sai o lembrete automático do cliente (automação "Confirmar o horário"), ou que ele está desligado.
 * W8 (12/11/2026, revê a G18): o lembrete só sai nos dias e horários que a clínica escolheu para as mensagens de horário
 * marcado (IA Orniplaty › Automações; data/sendWindows.ts). Se o momento calculado cair fora, sai ANTES, no último horário
 * permitido (`slotAtOrBefore`). Segunda a sábado, das 9h às 20h, é só o valor inicial.
 * Fontes lidas (sem alterar): telefone do profissional em Serviços e equipe (data/availability.ts) e a automação
 * `confirmacao` (data/automacoes.ts, faixa W6). PROTÓTIPO: nenhum aviso sai de verdade.
 * I3 (11/11/2026, decisão G12): o aviso respeita o pedido de saída, pela mesma fonte de `data/reminders.ts`
 * (`remindersBlockedOfName`, data/contactPreferences.ts). Quem chama passa o nome do cliente (`clientName`); com pedido de
 * saída e sem "lembretes de volta", o texto diz que o lembrete não sai e o motivo. Esse motivo vem antes dos outros
 * (desligado, fora do prazo), como em `reminderOf`. Sem `clientName`, o texto é o de antes.
 * W9a (12/11/2026, conferência final, J-05 e NF-1): mesma ORDEM de motivos de `reminderOf` (data/reminders.ts):
 *  1. o WhatsApp não está funcionando: o lembrete não sai até reconectar (vem antes de todos, como no Início);
 *  2. o cliente pediu para não receber mensagens;
 *  3. o horário está em conflito (caso em "Falta resolver"): o lembrete espera o conflito ser resolvido;
 *  4. desligado, fora do prazo, ou o dia e a hora em que sai.
 */
import { getTeam } from './availability';
import { automacoesStore, savedSendWindows } from './automacoes';
import { NOW, TODAY_ISO, mediumDayLabel } from './agendaStore';
import { remindersBlockedOfName } from './contactPreferences';
import { slotInConflict, whatsappDown, whatsappDownText } from './reminders';
import { momentStamp, slotAtOrBefore } from './sendWindows';

export type ProNotice = {name: string;text: string;missing: boolean;};

/** Aviso ao profissional (agendamento novo, remarcado ou cancelado). */
export function proNotice(professionalId: string): ProNotice | null {
  const m = getTeam().members.find((x) => x.id === professionalId);
  if (!m) return null;
  const has = !!(m.profile?.phone ?? '').replace(/\D/g, '');
  return has ?
  { name: m.name, text: `${m.name} recebe o aviso no WhatsApp.`, missing: false } :
  { name: m.name, text: `${m.name} não recebe aviso: falta o WhatsApp no cadastro.`, missing: true };
}

const pad = (n: number) => String(n).padStart(2, '0');
const toMs = (iso: string, time: string) => {
  const [y, mo, d] = iso.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi);
};
const dayWord = (iso: string) => iso === TODAY_ISO ? 'hoje' : mediumDayLabel(iso).toLowerCase();

/** Quando sai o lembrete automático do cliente para um horário (ou por que não sai). `clientName`: confere o pedido de saída (I3). */
export function reminderNotice(iso: string, start: string, clientName?: string): string {
  // W9a (J-05): com o WhatsApp parado nenhum lembrete sai. Vem antes dos outros motivos, como no Início.
  if (whatsappDown()) return `Lembrete automático do cliente: não sai, porque ${whatsappDownText()}. Nenhum lembrete sai pelo painel até reconectar.`;
  // I3 (G12): pedido de saída sem "lembretes de volta" → o lembrete não sai. Mesmo motivo de data/reminders.ts.
  if (clientName && remindersBlockedOfName(clientName)) return 'Lembrete automático do cliente: não sai, porque o cliente pediu para não receber mensagens.';
  // W9a (NF-1): horário em conflito → o lembrete espera a equipe resolver (remarcar ou cancelar).
  if (clientName && slotInConflict(iso, clientName, start)) return 'Lembrete automático do cliente: não sai enquanto o horário estiver em conflito. Ele espera o conflito ser resolvido.';
  const a = automacoesStore.get();
  if (!a.enabled.confirmacao) return 'Lembrete automático do cliente: desligado (IA Orniplaty › Automações).';
  const hours = a.values.horas ?? 24;
  const t = new Date(toMs(iso, start) - hours * 3600000);
  // W8: só nos dias e horários das mensagens de horário marcado; fora disso, sai antes (nunca depois).
  const target = { iso: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` };
  const slot = slotAtOrBefore(savedSendWindows().appointments, target);
  if (momentStamp(slot) <= `${TODAY_ISO}T${NOW}`) return `Lembrete automático do cliente: não sai, porque o horário foi marcado depois do momento do lembrete (${hours} horas antes).`;
  return `Lembrete automático do cliente: ${dayWord(slot.iso)} às ${slot.time}.`;
}

/**
 * Texto único "quem foi avisado" para o aviso rápido. `kind` = o que aconteceu. Na remarcação, profissional antigo e
 * novo (quando mudou). No cancelamento, o lembrete não sai mais. `clientName` (I3): confere o pedido de saída.
 */
export function toldText(kind: 'criado' | 'remarcado' | 'cancelado', professionalIds: string[], iso: string, start: string, clientName?: string): {text: string;missingPro?: string;} {
  const pros = Array.from(new Set(professionalIds)).map(proNotice).filter((x): x is ProNotice => !!x);
  const proText = pros.map((p) => p.text).join(' ');
  const missingPro = pros.find((p) => p.missing)?.name;
  const rem = kind === 'cancelado' ? 'O lembrete deste horário não sai mais.' : reminderNotice(iso, start, clientName);
  return { text: `${proText} ${rem}`.trim(), missingPro };
}