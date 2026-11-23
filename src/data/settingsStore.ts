/**
 * FONTE ÚNICA de Configurações (20/10/2026): WhatsApp, assinatura, uso da assistente e pendências.
 * Configurações, Início, rodapé do menu, item "Configurações" do menu e IA Orniplaty leem SÓ daqui.
 * Protótipo: vive em memória. Os estados de teste ficam no seletor de telas (ScreenSwitcher), fora da página.
 * Relógio do protótipo: TODAY_ISO (data/agendaStore.ts) = 2026-10-01.
 *
 * W6 (11/11/2026, auditoria final):
 *  - Textos ÚNICOS da "assistente parada" (combinado 6 entre faixas): `STOP_LIMIT_*` e `STOP_WA_*`. Conversas e Início (W4)
 *    leem daqui; nenhuma tela escreve a sua versão.
 *  - G19: no limite do mês param as respostas e as campanhas; lembretes de horário e ofertas de vaga continuam (`campaignsOut`).
 *  - A5-05: mensagem de confirmação (ou aviso de agenda) recusada pelo WhatsApp é pendência (Visão geral e número do menu).
 *  - A5-11: previsão do uso em DATA (`usageForecast`), nunca em "atendimentos".
 *  - G25 / A6-03: o plano vem do Onboarding ("Plano 2"); a amostra deixou de usar o nome comercial inventado "Essencial".
 *  - G17: `submitForApproval` manda para o WhatsApp aprovar as mensagens "Não enviada" de automações ligadas.
 */
import { useSyncExternalStore } from 'react';
import { TODAY_ISO, nowDateTimeLabel } from './agendaStore';
import { wordsNow } from './segment';

/* ───────────── datas ───────────── */
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export function addDaysIso(iso: string, days: number) {
  const t = new Date(utc(iso) + days * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
/** Dias inteiros de hoje (relógio do protótipo) até a data. Negativo = já passou. */
export const daysUntil = (iso: string) => Math.round((utc(iso) - utc(TODAY_ISO)) / 86400000);
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Duração da autorização do Facebook depois de conectar/renovar. Medição nossa de 25/08/2026 (não é regra publicada). */
export const AUTH_VALID_DAYS = 60;
/** Avisa quando faltam até 14 dias (mesma régua do backend: e-mail em 14, 7 e 2 dias). */
export const AUTH_WARN_DAYS = 14;

/* ───────────── textos únicos da assistente parada (combinado 6 entre faixas, 11/11/2026) ───────────── */
export const STOP_LIMIT_TITLE = 'A assistente parou: o limite do mês acabou';
export const stopLimitText = (resetDm: string) =>
`As conversas ficam com a sua equipe em Conversas › Aguardando você. Lembretes de horário e ofertas de vaga continuam saindo. Ela volta a responder em ${resetDm}. Para voltar agora, ligue “Continuar depois do limite”.`;
export const STOP_LIMIT_ACTION = 'Ver uso do mês';
export const STOP_WA_TITLE = 'A assistente parou: o WhatsApp está desconectado';
export const STOP_WA_TEXT = 'Nenhuma mensagem sai nem chega pelo painel, e os lembretes de horário também não saem. Responda pelo celular até reconectar.';
export const STOP_WA_ACTION = 'Conectar o WhatsApp';
/** G19: o que acontece no limite, para as telas que falam do limite e para a explicação do uso. */
export const LIMIT_RULE_TEXT = 'No limite do mês, param as respostas da assistente e as campanhas. Lembretes de horário e ofertas de vaga continuam saindo.';
/** G25: uso extra sem preço definido (pendência comercial). */
export const EXTRA_CHARGE_TEXT = 'cobrado conforme o seu contrato';

/* ───────────── estado ───────────── */
export type WaStatus = 'connected' | 'disconnected' | 'never';
export type WaHealth = 'ok' | 'invalid' | 'unknown';
export type SubState = 'active' | 'pending' | 'canceled' | 'none';
export type TemplateStatus = 'liberada' | 'em-analise' | 'recusada' | 'nao-enviada';

/** Lote E (22/10/2026, D1): o que parou quando a clínica desligou a assistente. */
export type AiStopScope = 'respostas' | 'tudo';

export type SettingsState = {
  /**
   * Liga/desliga GERAL da assistente (backend: tenant.ai_enabled + ai_disabled_at). `stopScope` = 'tudo' também para
   * lembretes e campanhas: NÃO existe no backend (hoje ai_enabled só silencia as respostas). `disabledAt` = "01/10, 09:20".
   */
  ai: {enabled: boolean;stopScope: AiStopScope;disabledAt: string | null;};
  wa: {status: WaStatus;health: WaHealth;expiresOn: string;};
  /** `plan` = só o nome que vai depois de "Plano" (ex.: "2" → "Plano 2"). Catálogo comercial em aberto (G25). */
  sub: {state: SubState;plan: string;nextCharge: string;card: string;};
  /** `estimate` ficou só por compatibilidade com o seletor de telas; a tela mostra a previsão em DATA (`usageForecast`). */
  usage: {unlimited: boolean;percent: number;periodStart: string;periodEnd: string;estimate: number | null;extraEnabled: boolean;cardDeclined: boolean;};
  templates: Record<'lembrete' | 'aviso-profissional', TemplateStatus>;
  /**
   * G1 subetapa 2 (F-025): situação no WhatsApp da mensagem de cada CAMPANHA (ids de Automações). Lida por Automações e
   * Oportunidades (B8) e trocada no seletor de telas.
   * W6 (G17): campanha LIGADA nunca fica "Não enviada": a Orniplaty manda sozinha para aprovação. Na amostra, as campanhas
   * ligadas começam "Em análise" (antes: "Não enviada").
   * I2 (11/11/2026): a automação transacional `avisar-mudanca-horario` (desligada por padrão) também guarda aqui a situação
   * da mensagem, para `submitForApproval` e `messageStatusOf` (data/automacoes.ts) a tratarem como as outras. Não é campanha.
   */
  campaignTemplates: Record<'retorno' | 'faltou' | 'retomada' | 'pacotes' | 'reativacao' | 'avisar-mudanca-horario', TemplateStatus>;
  /** Troca do número de avisos depende de SMS (backend: sms_verification_available). */
  smsAvailable: boolean;
  /** Teste do estado "Falha" ao enviar chamado. */
  supportFails: boolean;
};

const initial: SettingsState = {
  ai: { enabled: true, stopScope: 'respostas', disabledAt: null },
  wa: { status: 'connected', health: 'ok', expiresOn: '2026-10-10' },
  sub: { state: 'active', plan: '2', nextCharge: '2026-10-15', card: 'Visa final 4242' },
  usage: { unlimited: false, percent: 62, periodStart: '2026-09-15', periodEnd: '2026-10-14', estimate: 190, extraEnabled: false, cardDeclined: false },
  templates: { lembrete: 'liberada', 'aviso-profissional': 'liberada' },
  campaignTemplates: { retorno: 'em-analise', faltou: 'em-analise', retomada: 'em-analise', pacotes: 'em-analise', reativacao: 'em-analise', 'avisar-mudanca-horario': 'nao-enviada' },
  smsAvailable: true,
  supportFails: false
};

let state: SettingsState = initial;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (next: SettingsState) => {
  state = next;
  listeners.forEach((l) => l());
};
export const getSettings = () => state;
export const useSettings = () => useSyncExternalStore(subscribe, () => state);

/* ───────────── ações ───────────── */
/** Conectar ou renovar pelo Facebook: autorização nova por AUTH_VALID_DAYS a partir de hoje. Devolve a nova data. */
export function connectOrRenew(): string {
  const expiresOn = addDaysIso(TODAY_ISO, AUTH_VALID_DAYS);
  set({ ...state, wa: { status: 'connected', health: 'ok', expiresOn } });
  return expiresOn;
}
export const disconnectWhatsApp = () => set({ ...state, wa: { ...state.wa, status: 'disconnected' } });
export const checkWhatsAppNow = () => set({ ...state, wa: { ...state.wa, health: 'ok' } });
export function setExtraEnabled(on: boolean) {
  set({ ...state, usage: { ...state.usage, extraEnabled: on, cardDeclined: on ? state.usage.cardDeclined : false } });
}
/** Relógio ÚNICO do protótipo (data/agendaStore.ts): "01/10, 09:20". */
export const turnAssistantOff = (stopScope: AiStopScope) => set({ ...state, ai: { enabled: false, stopScope, disabledAt: nowDateTimeLabel() } });
export const turnAssistantOn = () => set({ ...state, ai: { enabled: true, stopScope: 'respostas', disabledAt: null } });
/** Lembretes e campanhas parados porque a clínica desligou "tudo". */
export const automationsStopped = (s: SettingsState = state) => !s.ai.enabled && s.ai.stopScope === 'tudo';

export const setTemplateStatus = (id: keyof SettingsState['templates'], status: TemplateStatus) =>
set({ ...state, templates: { ...state.templates, [id]: status } });
export const setCampaignTemplateStatus = (id: keyof SettingsState['campaignTemplates'], status: TemplateStatus) =>
set({ ...state, campaignTemplates: { ...state.campaignTemplates, [id]: status } });

/**
 * G17 (11/11/2026): ao LIGAR uma automação cuja mensagem nunca foi enviada para aprovação, a Orniplaty manda sozinha.
 * Recebe os ids de Automações ligados; devolve os ids que passaram de "Não enviada" para "Em análise".
 * A confirmação do horário usa a mensagem "lembrete" (Configurações › WhatsApp).
 * I2: cobre também `avisar-mudanca-horario` (a situação da mensagem dela fica em `campaignTemplates`).
 */
export function submitForApproval(enabledIds: string[]): string[] {
  const sent: string[] = [];
  const templates = { ...state.templates };
  const campaignTemplates = { ...state.campaignTemplates };
  enabledIds.forEach((id) => {
    if (id === 'confirmacao') {
      if (templates.lembrete === 'nao-enviada') {
        templates.lembrete = 'em-analise';
        sent.push(id);
      }
      return;
    }
    const k = id as keyof SettingsState['campaignTemplates'];
    if (campaignTemplates[k] === 'nao-enviada') {
      campaignTemplates[k] = 'em-analise';
      sent.push(id);
    }
  });
  if (sent.length) set({ ...state, templates, campaignTemplates });
  return sent;
}

/** A6-03 (G25): plano contratado no Onboarding (`tier_2`) → "2" (a tela escreve "Plano 2"). Valor desconhecido fica como veio. */
export function setPlanFromOnboarding(plan: string | undefined) {
  if (!plan) return;
  const m = /^tier_(\d+)$/.exec(plan.trim());
  set({ ...state, sub: { ...state.sub, plan: m ? m[1] : plan.trim() } });
}

/* ───────────── cenários do seletor de telas ───────────── */
export const WA_SCENARIOS = [
{ value: 'em-dia', label: 'Em dia' },
{ value: 'vence-em-breve', label: 'Vence em breve' },
{ value: 'vencida', label: 'Vencida' },
{ value: 'cancelada', label: 'Cancelada' },
{ value: 'nao-conferido', label: 'Não conferido' },
{ value: 'desconectado', label: 'Desconectado' },
{ value: 'nunca', label: 'Nunca conectado' }] as
const;
export type WaScenario = (typeof WA_SCENARIOS)[number]['value'];

export function setWaScenario(s: WaScenario) {
  const wa: SettingsState['wa'] = {
    'em-dia': { status: 'connected', health: 'ok', expiresOn: '2026-11-30' },
    'vence-em-breve': { status: 'connected', health: 'ok', expiresOn: '2026-10-10' },
    vencida: { status: 'connected', health: 'ok', expiresOn: '2026-09-28' },
    cancelada: { status: 'connected', health: 'invalid', expiresOn: '2026-11-30' },
    'nao-conferido': { status: 'connected', health: 'unknown', expiresOn: '2026-11-30' },
    desconectado: { status: 'disconnected', health: 'ok', expiresOn: '2026-11-30' },
    nunca: { status: 'never', health: 'ok', expiresOn: '2026-11-30' }
  }[s] as SettingsState['wa'];
  set({ ...state, wa });
}

export const SUB_SCENARIOS = [
{ value: 'active', label: 'Em dia' },
{ value: 'pending', label: 'Pagamento pendente' },
{ value: 'canceled', label: 'Cancelada' },
{ value: 'none', label: 'Sem assinatura' }] as
const;
export const setSubScenario = (s: SubState) => set({ ...state, sub: { ...state.sub, state: s } });

export const USAGE_SCENARIOS = [
{ value: 'normal', label: 'Abaixo de 80% (62%)' },
{ value: 'perto', label: 'Perto do limite (82%)' },
{ value: 'limite-desligado', label: '100%, uso extra desligado' },
{ value: 'limite-ligado', label: '100%, uso extra ligado' },
{ value: 'cartao-recusou', label: 'Cartão recusou o uso extra' },
{ value: 'sem-limite', label: 'Plano sem limite' }] as
const;
export type UsageScenario = (typeof USAGE_SCENARIOS)[number]['value'];

export function setUsageScenario(s: UsageScenario) {
  const base = { ...state.usage, unlimited: false, cardDeclined: false };
  const usage: SettingsState['usage'] = {
    normal: { ...base, percent: 62, estimate: 190, extraEnabled: false },
    perto: { ...base, percent: 82, estimate: 40, extraEnabled: false },
    'limite-desligado': { ...base, percent: 100, estimate: null, extraEnabled: false },
    'limite-ligado': { ...base, percent: 100, estimate: null, extraEnabled: true },
    'cartao-recusou': { ...base, percent: 100, estimate: null, extraEnabled: true, cardDeclined: true },
    'sem-limite': { ...base, unlimited: true, percent: 0, estimate: null, extraEnabled: false }
  }[s];
  set({ ...state, usage });
}

export const TEMPLATE_SCENARIOS = [
{ value: 'liberada', label: 'Liberada' },
{ value: 'em-analise', label: 'Em análise' },
{ value: 'recusada', label: 'Recusada' },
{ value: 'nao-enviada', label: 'Não enviada' }] as
const;
export const setSmsAvailable = (on: boolean) => set({ ...state, smsAvailable: on });
export const setSupportFails = (on: boolean) => set({ ...state, supportFails: on });

/* ───────────── leitura em linguagem simples ───────────── */
export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type AlertTone = 'success' | 'warning' | 'error' | 'info';
export type ActionKind = 'facebook' | 'primary' | 'neutral';
export type Notice = {tone: AlertTone;title: string;text?: string;action?: {label: string;kind: ActionKind;};};
export type View = {key: string;badge: {tone: Tone;label: string;};summary: string;notice?: Notice;pending: boolean;};

const venceLabel = (n: number) => n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`;

export type WaKey = 'em-dia' | 'vence-em-breve' | 'vencida' | 'cancelada' | 'nao-conferido' | 'desconectado' | 'nunca';
export function waKey(s: SettingsState = state): WaKey {
  if (s.wa.status === 'never') return 'nunca';
  if (s.wa.status === 'disconnected') return 'desconectado';
  if (s.wa.health === 'invalid') return 'cancelada';
  if (s.wa.health === 'unknown') return 'nao-conferido';
  const n = daysUntil(s.wa.expiresOn);
  if (n < 0) return 'vencida';
  if (n <= AUTH_WARN_DAYS) return 'vence-em-breve';
  return 'em-dia';
}

export function waView(s: SettingsState = state): View {
  const key = waKey(s);
  const n = daysUntil(s.wa.expiresOn);
  const d = dm(s.wa.expiresOn);
  const renew = { label: 'Renovar pelo Facebook', kind: 'primary' as const };
  switch (key) {
    case 'em-dia':
      return { key, badge: { tone: 'success', label: 'Conectado' }, summary: `Autorização do Facebook válida até ${d}`, pending: false };
    case 'vence-em-breve':
      return {
        key,
        badge: { tone: 'warning', label: n <= 1 ? `Vence ${venceLabel(n)}` : `Vence em ${n} dias` },
        summary: `Autorização do Facebook até ${d}`,
        pending: true,
        notice: {
          tone: 'warning',
          title: `A autorização do Facebook vence ${venceLabel(n)} (${d})`,
          text: 'O WhatsApp continua funcionando até lá. Se vencer, a assistente para de receber e responder mensagens. Renovar leva cerca de 2 minutos e não muda o número.',
          action: renew
        }
      };
    case 'vencida':
      return {
        key,
        badge: { tone: 'error', label: 'Vencida' },
        summary: `A autorização do Facebook venceu em ${d}`,
        pending: true,
        notice: { tone: 'error', title: `A autorização do Facebook venceu em ${d}`, text: `${STOP_WA_TEXT} Renove para voltar a atender.`, action: renew }
      };
    case 'cancelada':
      return {
        key,
        badge: { tone: 'error', label: 'Cancelada' },
        summary: 'A autorização do Facebook foi cancelada',
        pending: true,
        notice: {
          tone: 'error',
          title: 'A autorização do Facebook foi cancelada',
          text: `Isso costuma acontecer quando a senha do Facebook muda ou alguém remove o acesso. ${STOP_WA_TEXT}`,
          action: { label: 'Conectar de novo', kind: 'primary' }
        }
      };
    case 'nao-conferido':
      return {
        key,
        badge: { tone: 'neutral', label: 'Não conferido' },
        summary: 'Vamos conferir de novo em alguns minutos',
        pending: false,
        notice: { tone: 'info', title: 'Não conseguimos conferir o WhatsApp agora', text: 'Isso não quer dizer que ele parou. Vamos tentar de novo em alguns minutos.', action: { label: 'Conferir agora', kind: 'neutral' } }
      };
    case 'desconectado':
      // W6 (A5-04, combinado 6): o MESMO aviso de IA Orniplaty, Conversas e Início.
      return {
        key,
        badge: { tone: 'error', label: 'Desconectado' },
        summary: 'Nenhuma mensagem sai nem chega pelo painel',
        pending: true,
        notice: { tone: 'error', title: STOP_WA_TITLE, text: STOP_WA_TEXT, action: { label: STOP_WA_ACTION, kind: 'primary' } }
      };
    case 'nunca':
      return {
        key,
        badge: { tone: 'warning', label: 'Não conectado' },
        summary: 'Conecte para a assistente começar a atender',
        pending: true,
        notice: {
          tone: 'info',
          title: `Conecte o WhatsApp ${wordsNow().of}`,
          text: 'Você mantém o número. Leva cerca de 2 minutos. Tenha em mãos: o Facebook de quem administra a empresa e o celular do número por perto.',
          action: { label: 'Conectar com o Facebook', kind: 'facebook' }
        }
      };
  }
}

export function subView(s: SettingsState = state): View {
  const d = dm(s.sub.nextCharge);
  switch (s.sub.state) {
    case 'active':
      return { key: 'active', badge: { tone: 'success', label: 'Em dia' }, summary: `Próxima cobrança em ${d}`, pending: false };
    case 'pending':
      return {
        key: 'pending',
        badge: { tone: 'error', label: 'Pendente' },
        summary: `A cobrança de ${d} não foi paga`,
        pending: true,
        notice: { tone: 'error', title: 'Pagamento pendente', text: `A cobrança de ${d} não foi paga. Regularize para continuar usando o painel e a assistente.`, action: { label: 'Regularizar pagamento', kind: 'primary' } }
      };
    case 'canceled':
      return {
        key: 'canceled',
        badge: { tone: 'warning', label: 'Cancelada' },
        summary: `Acesso até ${d}`,
        pending: true,
        notice: { tone: 'warning', title: 'Assinatura cancelada', text: `Você tem acesso até ${d}. Depois disso, a assistente para de atender.`, action: { label: 'Assinar de novo', kind: 'primary' } }
      };
    case 'none':
      return {
        key: 'none',
        badge: { tone: 'neutral', label: 'Sem plano' },
        summary: 'Escolha um plano para começar',
        pending: true,
        notice: { tone: 'info', title: 'Escolha um plano para começar', action: { label: 'Ver planos', kind: 'primary' } }
      };
  }
}

export type UsageKey = 'normal' | 'perto' | 'limite-desligado' | 'limite-ligado' | 'cartao-recusou' | 'sem-limite';
export function usageKey(s: SettingsState = state): UsageKey {
  const u = s.usage;
  if (u.unlimited) return 'sem-limite';
  if (u.cardDeclined) return 'cartao-recusou';
  if (u.percent >= 100) return u.extraEnabled ? 'limite-ligado' : 'limite-desligado';
  if (u.percent >= 80) return 'perto';
  return 'normal';
}

/** Dia em que o uso volta a zero (dd/mm). */
export const usageResetDm = (s: SettingsState = state) => dm(addDaysIso(s.usage.periodEnd, 1));

/**
 * A5-11 (W6): previsão do uso em DATA, no ritmo do ciclo até hoje. `null` quando não há o que prever (sem limite, já no
 * limite, nada usado). `withinPeriod` = no ritmo atual, o limite não chega antes do fim do ciclo.
 */
export function usageForecast(s: SettingsState = state): {date: string;withinPeriod: boolean;} | null {
  const u = s.usage;
  if (u.unlimited || u.percent <= 0 || u.percent >= 100) return null;
  const elapsed = Math.max(1, Math.round((utc(TODAY_ISO) - utc(u.periodStart)) / 86400000));
  const perDay = u.percent / elapsed;
  const date = addDaysIso(TODAY_ISO, Math.ceil((100 - u.percent) / perDay));
  return date > u.periodEnd ? { date: u.periodEnd, withinPeriod: true } : { date, withinPeriod: false };
}
export function usageForecastText(s: SettingsState = state): string | null {
  const f = usageForecast(s);
  if (!f) return null;
  return f.withinPeriod ? `No ritmo atual, o limite dura até o fim do ciclo (${dm(f.date)}).` : `No ritmo atual, o limite chega por volta de ${dm(f.date)}.`;
}

export function usageView(s: SettingsState = state): View {
  const key = usageKey(s);
  const end = dm(s.usage.periodEnd);
  const reset = usageResetDm(s);
  const p = `${s.usage.percent}%`;
  switch (key) {
    case 'normal':
      return { key, badge: { tone: 'neutral', label: p }, summary: `do limite deste mês, até ${end}`, pending: false };
    case 'perto':
      return {
        key,
        badge: { tone: 'warning', label: p },
        summary: `do limite deste mês, até ${end}`,
        pending: true,
        notice: {
          tone: 'warning',
          title: `Você já usou ${p} do limite deste mês`,
          text: `Se chegar a 100%, param as respostas da assistente e as campanhas até ${reset}, a não ser que “Continuar depois do limite” esteja ligado. Lembretes de horário e ofertas de vaga continuam saindo.`
        }
      };
    case 'limite-desligado':
      return {
        key,
        badge: { tone: 'error', label: 'Parada' },
        summary: `O limite do mês acabou; ela volta em ${reset}`,
        pending: true,
        notice: { tone: 'error', title: STOP_LIMIT_TITLE, text: stopLimitText(reset) }
      };
    case 'limite-ligado':
      return {
        key,
        badge: { tone: 'info', label: 'Uso extra' },
        summary: `Passou do limite; o uso extra é ${EXTRA_CHARGE_TEXT}`,
        pending: false,
        notice: { tone: 'info', title: 'Você passou do limite deste mês', text: `A assistente continua respondendo e as campanhas continuam saindo. O uso extra é ${EXTRA_CHARGE_TEXT}.` }
      };
    case 'cartao-recusou':
      return {
        key,
        badge: { tone: 'error', label: 'Parada' },
        summary: 'O cartão recusou a cobrança do uso extra',
        pending: true,
        notice: {
          tone: 'error',
          title: 'O cartão recusou a cobrança do uso extra',
          text: 'A assistente e as campanhas estão paradas até o pagamento. Lembretes de horário e ofertas de vaga continuam saindo. Atualize o cartão e tentamos de novo.',
          action: { label: 'Atualizar cartão', kind: 'primary' }
        }
      };
    case 'sem-limite':
      return { key, badge: { tone: 'neutral', label: 'Sem limite' }, summary: 'Seu plano não tem limite de uso da assistente', pending: false };
  }
}

/** A assistente está parada por causa do uso do mês (limite ou cartão). */
export const stoppedByUsage = (s: SettingsState = state) => ['limite-desligado', 'cartao-recusou'].includes(usageKey(s));

/* ───────────── mensagens aprovadas (A5-05) ───────────── */
const TEMPLATE_NAMES: Record<keyof SettingsState['templates'], string> = { lembrete: 'Confirmação do horário', 'aviso-profissional': 'Aviso de agenda' };
/** Mensagens da clínica (não campanhas) recusadas pelo WhatsApp: elas não estão saindo. */
export const refusedTemplates = (s: SettingsState = state) =>
(Object.keys(s.templates) as (keyof SettingsState['templates'])[]).filter((k) => s.templates[k] === 'recusada').map((k) => TEMPLATE_NAMES[k]);

export function messagesView(s: SettingsState = state): View {
  const refused = refusedTemplates(s);
  if (refused.length) {
    const conf = s.templates.lembrete === 'recusada';
    return {
      key: 'recusada',
      badge: { tone: 'error', label: 'Recusada' },
      summary: `${refused.join(' e ')}: não está saindo`,
      pending: true,
      notice: {
        tone: 'error',
        title: refused.length === 1 ? `O WhatsApp recusou a mensagem “${refused[0]}”` : 'O WhatsApp recusou mensagens da clínica',
        text: conf ?
        'Os clientes com horário marcado não recebem o pedido de confirmação até a mensagem ser corrigida e aprovada. Veja o motivo e envie de novo.' :
        'Ela não está saindo até ser corrigida e aprovada. Veja o motivo e envie de novo.',
        action: { label: 'Ver motivo', kind: 'primary' }
      }
    };
  }
  const waiting = Object.values(s.templates).some((t) => t === 'em-analise' || t === 'nao-enviada');
  return waiting ?
  { key: 'em-analise', badge: { tone: 'warning', label: 'Em análise' }, summary: 'O WhatsApp está revisando uma mensagem', pending: false } :
  { key: 'liberada', badge: { tone: 'success', label: 'Liberadas' }, summary: 'Confirmação do horário e aviso de agenda liberados', pending: false };
}

/**
 * Estado da assistente em linguagem simples (Lote E, D1): Ligada · Desligada · Parada (limite do mês ou cartão).
 * Desligar de propósito NÃO entra em `pendingItems` (decisão do redator do lote; o Christian pode trocar).
 */
export type AssistantKey = 'ligada' | 'desligada' | 'desligada-tudo' | 'parada';
/** G4 (F-067): o WhatsApp sem funcionar (autorização vencida/cancelada, desconectado, nunca conectado) também para a assistente. */
export const whatsappStopped = (s: SettingsState = state) => ['vencida', 'cancelada', 'desconectado', 'nunca'].includes(waKey(s));
export type StopReason = 'whatsapp' | 'limite' | 'cartao';
/** Por que a assistente está parada (sem ter sido desligada por você). O WhatsApp vem primeiro: sem ele nada chega. */
export function stopReason(s: SettingsState = state): StopReason | null {
  if (!s.ai.enabled) return null;
  if (whatsappStopped(s)) return 'whatsapp';
  const u = usageKey(s);
  if (u === 'limite-desligado') return 'limite';
  if (u === 'cartao-recusou') return 'cartao';
  return null;
}
export function assistantKey(s: SettingsState = state): AssistantKey {
  if (!s.ai.enabled) return s.ai.stopScope === 'tudo' ? 'desligada-tudo' : 'desligada';
  if (stopReason(s)) return 'parada';
  return 'ligada';
}
export function assistantView(s: SettingsState = state): View {
  const key = assistantKey(s);
  const since = s.ai.disabledAt ? `Desde ${s.ai.disabledAt}` : '';
  switch (key) {
    case 'ligada':
      return { key, badge: { tone: 'success', label: 'Ligada' }, summary: 'Responde seus clientes no WhatsApp a qualquer hora', pending: false };
    case 'desligada':
      // R3 (06/11/2026, Christian, A-12). W9b (N-A5-01): só as conversas em que o cliente espera resposta, e as novas.
      return { key, badge: { tone: 'warning', label: 'Desligada' }, summary: `${since}. As conversas em que o cliente espera resposta, e as novas, vão para Aguardando você`, pending: false };
    case 'desligada-tudo':
      return { key, badge: { tone: 'warning', label: 'Desligada' }, summary: `${since}. Respostas e mensagens automáticas paradas`, pending: false };
    case 'parada':{
        // W6 (A5-13): a causa já é uma linha própria (WhatsApp ou Uso da assistente); esta linha não conta de novo.
        const sum = accountSummary(s);
        return { key, badge: { tone: 'error', label: 'Parada' }, summary: sum.assistant.title.replace(/^A assistente parou: /, 'Parada: '), pending: false, notice: { tone: 'error', title: sum.assistant.title, text: sum.assistant.text } };
      }
  }
}

/**
 * G4 (F-067): RESUMO ÚNICO da conta. Início, IA Orniplaty, Conversas, Configurações e Automações leem daqui o estado da
 * assistente (atendendo, desligada por você ou parada, com o motivo e onde resolver), as pendências e o que pede atenção sem
 * ser pendência (assistente desligada de propósito, uso extra sendo cobrado, WhatsApp não conferido). "Tudo certo" só quando
 * não há pendência NEM ponto de atenção. Regras de plano/limite continuam as mesmas; nada é cobrado aqui.
 */
export type AccountSummary = {
  assistant: {
    key: AssistantKey;
    reason: StopReason | null;
    answering: boolean;
    badge: {tone: Tone;label: string;};
    title: string;
    text: string;
    action: {label: string;to: string;} | null;
  };
  /** Lembretes e campanhas saem? (não saem com tudo desligado ou com o WhatsApp sem funcionar) */
  automationsOut: boolean;
  /** G19 (W6): campanhas saem? Além do acima, param no limite do mês (ou com o cartão do uso extra recusado). */
  campaignsOut: boolean;
  pending: PendingItem[];
  attention: string[];
  allClear: boolean;
};

export function accountSummary(s: SettingsState = state): AccountSummary {
  const key = assistantKey(s);
  const reason = stopReason(s);
  const since = s.ai.disabledAt ? `Desde ${s.ai.disabledAt}. ` : '';
  const reset = usageResetDm(s);
  const wk = waKey(s);
  const waStop: Record<string, {title: string;text: string;action: string;}> = {
    desconectado: { title: STOP_WA_TITLE, text: STOP_WA_TEXT, action: STOP_WA_ACTION },
    vencida: { title: 'A assistente parou: a autorização do WhatsApp venceu', text: `A autorização do Facebook venceu em ${dm(s.wa.expiresOn)}. ${STOP_WA_TEXT}`, action: 'Renovar a autorização' },
    cancelada: { title: 'A assistente parou: a autorização do WhatsApp foi cancelada', text: STOP_WA_TEXT, action: 'Conectar de novo' },
    nunca: { title: 'A assistente ainda não atende: o WhatsApp não foi conectado', text: 'Nenhuma mensagem sai nem chega pelo painel até você conectar o número.', action: STOP_WA_ACTION }
  };
  const ws = waStop[wk] ?? waStop.desconectado;
  const assistant: AccountSummary['assistant'] =
  key === 'ligada' ?
  { key, reason, answering: true, badge: { tone: 'success', label: 'Assistente atendendo' }, title: 'A assistente está atendendo', text: 'Responde seus clientes no WhatsApp a qualquer hora.', action: null } :
  key === 'desligada' ?
  { key, reason, answering: false, badge: { tone: 'warning', label: 'Assistente desligada' }, title: 'A assistente está desligada', text: `${since}As conversas dela em que o cliente espera resposta, e as novas, vão para Conversas › Aguardando você. As outras ficam em “Com você”. ${whatsappStopped(s) ? 'O WhatsApp também não está funcionando: nenhum lembrete ou campanha sai.' : 'Lembretes de horário e campanhas continuam saindo.'}`, action: null } :
  key === 'desligada-tudo' ?
  { key, reason, answering: false, badge: { tone: 'warning', label: 'Assistente desligada' }, title: 'A assistente e as mensagens automáticas estão desligadas', text: `${since}Ninguém responde sozinho: as conversas dela em que o cliente espera resposta vão para Conversas › Aguardando você; as outras ficam em “Com você”. Nenhum lembrete ou campanha sai até você ligar de novo.`, action: null } :
  reason === 'whatsapp' ?
  { key, reason, answering: false, badge: { tone: 'error', label: 'Assistente parada' }, title: ws.title, text: ws.text, action: { label: ws.action, to: '/configuracoes?secao=whatsapp' } } :
  reason === 'cartao' ?
  { key, reason, answering: false, badge: { tone: 'error', label: 'Assistente parada' }, title: 'A assistente parou: o cartão recusou o uso extra', text: 'As conversas ficam com a sua equipe em Conversas › Aguardando você. Lembretes de horário e ofertas de vaga continuam saindo. Atualize o cartão para ela voltar a atender.', action: { label: STOP_LIMIT_ACTION, to: '/configuracoes?secao=plano' } } :
  { key, reason, answering: false, badge: { tone: 'error', label: 'Assistente parada' }, title: STOP_LIMIT_TITLE, text: stopLimitText(reset), action: { label: STOP_LIMIT_ACTION, to: '/configuracoes?secao=plano' } };
  const pending = pendingItems(s);
  const attention: string[] = [];
  if (key === 'desligada' || key === 'desligada-tudo') attention.push('A assistente está desligada por você.');
  if (usageKey(s) === 'limite-ligado') attention.push(`O uso extra está sendo ${EXTRA_CHARGE_TEXT}.`);
  if (wk === 'nao-conferido') attention.push('Não conseguimos conferir o WhatsApp agora.');
  const automationsOut = !automationsStopped(s) && !whatsappStopped(s);
  return {
    assistant,
    automationsOut,
    campaignsOut: automationsOut && !stoppedByUsage(s),
    pending,
    attention,
    allClear: pending.length === 0 && attention.length === 0
  };
}

/* ───────────── pendências (uma por assunto, a mais grave primeiro) ───────────── */
export type SettingsSectionId = 'geral' | 'whatsapp' | 'plano' | 'conta' | 'ajuda';
/** W6 (A5-05): `mensagem` = mensagem da clínica recusada pelo WhatsApp (mora em Configurações › WhatsApp). */
export type PendingItem = {id: 'whatsapp' | 'assinatura' | 'uso' | 'mensagem';section: SettingsSectionId;notice: Notice;};

const RANK: Record<AlertTone, number> = { error: 0, warning: 1, info: 2, success: 3 };

export function pendingItems(s: SettingsState = state): PendingItem[] {
  const out: PendingItem[] = [];
  const w = waView(s);
  if (w.pending && w.notice) out.push({ id: 'whatsapp', section: 'whatsapp', notice: w.notice });
  const msg = messagesView(s);
  if (msg.pending && msg.notice) out.push({ id: 'mensagem', section: 'whatsapp', notice: msg.notice });
  const sb = subView(s);
  if (sb.pending && sb.notice) out.push({ id: 'assinatura', section: 'plano', notice: sb.notice });
  const u = usageView(s);
  if (u.pending && u.notice) out.push({ id: 'uso', section: 'plano', notice: u.notice });
  return out.sort((a, b) => RANK[a.notice.tone] - RANK[b.notice.tone]);
}

export const pendingCountBySection = (s: SettingsState = state) => {
  const items = pendingItems(s);
  return {
    geral: items.length,
    whatsapp: items.filter((i) => i.section === 'whatsapp').length,
    plano: items.filter((i) => i.section === 'plano').length,
    conta: 0,
    ajuda: 0
  } as Record<SettingsSectionId, number>;
};

/** Rodapé do menu: "Plano 2 · 62% do limite do mês". */
export function sidebarPlan(s: SettingsState = state) {
  const u = s.usage;
  const label = s.sub.state === 'none' ? 'Escolha um plano' : u.unlimited ? 'Sem limite de uso' : `${Math.min(u.percent, 100)}% do limite do mês`;
  return { planName: s.sub.plan, used: 0, limit: 0, percent: u.unlimited || s.sub.state === 'none' ? 0 : Math.min(100, u.percent), usageLabel: label };
}
/** Rodapé do menu no PRIMEIRO acesso: conta recém-criada, nada consumido ainda (mesmo plano da conta; G1, F-005). */
export function firstAccessPlan(s: SettingsState = state) {
  return { planName: s.sub.plan, used: 0, limit: 0, percent: 0, usageLabel: s.sub.state === 'none' ? 'Escolha um plano' : '0% do limite do mês' };
}

/** Link do suporte (backend: WhatsApp do suporte 5519971797827 + mensagem pronta). */
export const SUPPORT_WHATSAPP_URL = `https://wa.me/5519971797827?text=${encodeURIComponent('Olá! Sou assinante da Orniplaty e preciso de ajuda.')}`;
/** G21 (11/11/2026): prazo e horário do suporte. */
export const SUPPORT_RESPONSE_TEXT = 'A resposta chega no seu e-mail em até 1 dia útil. Atendimento de segunda a sexta, das 9h às 18h.';

/** Hook do resumo único (G4, F-067). */
export const useAccountSummary = () => accountSummary(useSettings());
/* R3 (06/11/2026, Christian, A-12): textos de "desligada" (assistantView e accountSummary) passam a dizer que as conversas em andamento vão para "Aguardando você" (regra em data/conversas.ts). */
/* W9b (12/11/2026, N-A5-01): os mesmos textos agora seguem a janela de confirmação (components/atendente-ia/AssistantPower.tsx): só as conversas dela em que o cliente espera resposta, e as novas, vão para "Aguardando você"; as outras ficam em "Com você". */