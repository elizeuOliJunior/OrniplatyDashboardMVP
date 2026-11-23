/**
 * W4 (11/11/2026, combinado 6 entre as faixas W4 e W6): aviso de “assistente parada” no Início, em Conversas e no sino.
 * O ESTADO, o motivo e os TEXTOS são da faixa W6 (data/settingsStore.ts: `STOP_*`, entregues em `accountSummary.assistant`).
 * I1 (11/11/2026, integração, itens 12 e 15): este arquivo não guarda mais cópia dos textos. Só repassa o que vem do
 * resumo único e diz de qual assunto é o aviso (para o sino não repetir a pendência do mesmo assunto).
 * Desligada por você: não é “parada”; cada tela mantém o texto atual.
 *
 * L4 (16/11/2026, etapa de facilidade de uso, regra 5 “o que trava o trabalho aparece em todas as telas”): `short` é a
 * frase curta, a MESMA em todas as telas que mostram o aviso: Início, Agenda, Conversas, Oportunidades e IA Orniplaty.
 * O texto inteiro (`text`) continua no sino e na tela de destino (Configurações › WhatsApp ou › Plano e pagamento, que
 * leem a mesma fonte: data/settingsStore.ts).
 * L12 (17/11/2026): no limite do mês, a frase curta passa a ser a parte do texto único que diz o que continua saindo e
 * quando a assistente volta (os trechos “… continuam saindo” e “… volta a responder/atender …”, juntos numa frase só; o
 * resto da mesma frase, separado por “;”, fica de fora). Lida do texto, nunca escrita à mão. Sem esses trechos no texto,
 * fica a primeira frase, como antes. WhatsApp: sem mudança.
 */
import { accountSummary } from './settingsStore';
import type { SettingsState } from './settingsStore';

export type StopNotice = {
  subject: 'uso' | 'whatsapp';
  title: string;
  /** Texto inteiro (sino e tela de destino). */
  text: string;
  /** L4: frase curta, a mesma em todas as telas que mostram o aviso. */
  short: string;
  action: {label: string;to: string;} | null;
};

/** P1/L4: primeira frase de um texto (aviso compacto = título + UMA frase + um botão). */
export function oneSentence(text?: string): string {
  if (!text) return '';
  const m = text.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : text;
}

/** Trechos procurados: o que continua saindo e quando ela volta (não pega “Continuar depois do limite”). */
const KEEP = /continuam?\s+(saindo|a sair)|volta a (responder|atender)/i;

/** Trechos de um texto: frases (. ! ?) e, dentro delas, partes separadas por “;”. Datas como 15/10 não cortam. */
function partsOf(text: string): string[] {
  return (text.match(/.*?[.!?](?=\s|$)/g) ?? [text]).
  flatMap((s) => s.split(';')).
  map((s) => s.trim().replace(/[.!?]$/, '')).
  filter(Boolean);
}

/** L12: o que continua saindo e quando ela volta, numa frase só ("A; b."). Sem esses trechos, a primeira frase. */
export function limitShortSentence(text?: string): string {
  if (!text) return '';
  const keep = partsOf(text).filter((p) => KEEP.test(p));
  if (!keep.length) return oneSentence(text);
  return `${keep.map((p, i) => i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1)).join('; ')}.`;
}

export function assistantStopNotice(s: SettingsState): StopNotice | null {
  const sum = accountSummary(s);
  if (sum.assistant.key !== 'parada') return null;
  const subject = sum.assistant.reason === 'whatsapp' ? 'whatsapp' : 'uso';
  return {
    subject,
    title: sum.assistant.title,
    text: sum.assistant.text,
    short: subject === 'uso' ? limitShortSentence(sum.assistant.text) : oneSentence(sum.assistant.text),
    action: sum.assistant.action
  };
}