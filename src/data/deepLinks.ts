/**
 * G2 (F-030…F-038): vocabulário ÚNICO dos links diretos do Painel e o destaque do item de destino.
 *
 * Parâmetros (rota hash, `#/rota?param=valor`); ids sempre ESTÁVEIS, nunca o nome de uma pessoa:
 *  - Agenda: `/agenda?data=AAAA-MM-DD` + opcional `profissional=<id da equipe>` e UM item: `agendamento=<id>` ou
 *    `bloqueio=<id>`. `secao=lista-espera` continua levando à Lista de espera.
 *  - Conversas: `/conversas?cliente=<id do cadastro>` (o id do cadastro é o id da conversa).
 *  - Serviços e equipe: `/servicos-equipe?aba=servicos&servico=<id>` + opcional `secao=pagamento`.
 *  - Oportunidades: `?aba=<motivo>` (retorno, faltou, retomada, pacotes, reativacao), `?caso=<id>`, `?cliente=<id>`.
 *  - IA Orniplaty: `?campo=<id do campo>` (foco) · Automações: `?campanha=<id>`.
 * Destino inválido: aviso "… não encontrado" e volta para a lista/tela normal, sem fingir que achou.
 * Integração (G6): é o vocabulário combinado para o frontend real; o protótipo não implementa o roteador real.
 */

/** Data no formato AAAA-MM-DD e que existe de verdade no calendário (2026-02-30 é recusada). */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export type AgendaTarget = {date?: string;professionalId?: string;appointmentId?: string;blockId?: string;};

export function agendaLink(t: AgendaTarget = {}) {
  const q = new URLSearchParams();
  if (t.date) q.set('data', t.date);
  if (t.professionalId) q.set('profissional', t.professionalId);
  if (t.appointmentId) q.set('agendamento', t.appointmentId);else
  if (t.blockId) q.set('bloqueio', t.blockId);
  const s = q.toString();
  return s ? `/agenda?${s}` : '/agenda';
}

export const conversationLink = (clientId: string) => `/conversas?cliente=${encodeURIComponent(clientId)}`;

export const serviceLink = (serviceId: string, section?: 'pagamento') =>
`/servicos-equipe?aba=servicos&servico=${encodeURIComponent(serviceId)}${section ? `&secao=${section}` : ''}`;

export const HIGHLIGHT_MS = 2500;
/** Mesmo destaque do cartão marcado (DS v3.13, rules/stable-selection-and-deep-links.md). */
export const HIGHLIGHT_CLASSES = ['!border-primary', '!bg-active-surface', 'ring-2', 'ring-primary'];

export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Rola até o elemento. A rolagem suave pode não acontecer (aba em segundo plano, outra rolagem por cima): depois de
 * ~700 ms, se o destino ainda estiver fora da tela, rola direto. Devolve o timer da conferência.
 */
function scrollToTarget(el: HTMLElement) {
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  return window.setTimeout(() => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ behavior: 'auto', block: 'center' });
  }, 700);
}

/**
 * Rola até o elemento (centralizado; sem animação com menos movimento), destaca 2,5 s e põe o foco nele (ou no controle
 * indicado). Tenta por até ~1,5 s, porque o destino pode ainda estar sendo desenhado. Devolve uma função de cancelar.
 */
export function revealElement(elementId: string, opts: {focusId?: string;onMissing?: () => void;} = {}) {
  let tries = 0;
  let off = 0;
  let t = 0;
  let check = 0;
  let shown: HTMLElement | null = null;
  const clear = () => {
    shown?.classList.remove(...HIGHLIGHT_CLASSES);
    shown?.removeAttribute('data-highlighted');
  };
  const run = () => {
    const el = document.getElementById(elementId);
    if (!el) {
      tries += 1;
      if (tries < 10) t = window.setTimeout(run, 150);else
      opts.onMissing?.();
      return;
    }
    check = scrollToTarget(el);
    const focusEl = (opts.focusId ? document.getElementById(opts.focusId) : null) ?? el;
    focusEl.focus({ preventScroll: true });
    shown = el;
    el.classList.add(...HIGHLIGHT_CLASSES);
    el.setAttribute('data-highlighted', 'true');
    off = window.setTimeout(clear, HIGHLIGHT_MS);
  };
  t = window.setTimeout(run, 150);
  return () => {
    window.clearTimeout(t);
    window.clearTimeout(off);
    window.clearTimeout(check);
    clear();
  };
}

/**
 * `?campo=<id>` / "Mudar o padrão": rola até o campo, põe o foco no primeiro controle dele. Campo que não existe
 * (id antigo ou errado) chama `onMissing` (a tela mostra "Campo não encontrado") em vez de falhar em silêncio.
 */
export function focusField(fieldId: string, opts: {delay?: number;onMissing?: () => void;} = {}) {
  let tries = 0;
  let t = 0;
  let check = 0;
  const run = () => {
    const el = document.getElementById(fieldId);
    if (!el) {
      tries += 1;
      if (tries < 8) t = window.setTimeout(run, 150);else
      opts.onMissing?.();
      return;
    }
    check = scrollToTarget(el);
    const focusable = (el.matches('input,textarea,button,select') ? el : el.querySelector('input,textarea,button,select')) as HTMLElement | null;
    (focusable ?? el).focus({ preventScroll: true });
  };
  t = window.setTimeout(run, opts.delay ?? 350);
  return () => {
    window.clearTimeout(t);
    window.clearTimeout(check);
  };
}