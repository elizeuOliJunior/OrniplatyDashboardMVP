import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ONBOARDING_ORIGIN, isOnboardingOrigin } from './projectOrigins';
import type { ClinicException } from './schedule';
import { firstAccessSample } from './firstAccessSample';
import { applyReceivedConfig } from './receivedConfig';
import type { ApplyResult, ReceivedClient, ReceivedService } from './receivedConfig';
import { setWhatsappNumber } from './configuracoes';
export { ONBOARDING_ORIGIN };
export type AutomationKind = 'transacional' | 'pedido' | 'campanha';
/**
 * Equipe no handoff. `schedule` (versão 2, data/schedule.ts) traz a jornada individual de 7 dias, as exceções por data e o
 * intervalo, exatamente na estrutura que o Painel edita. Payload antigo (sem `schedule`) = profissional seguia o horário da
 * clínica: o Painel converte com `normalizeSchedule(undefined, weekFromClinicHours(hours))`, sem perder nada.
 */
export type FirstAccessPro = {id?: string;name: string;color: string;phone?: string;specialty?: string;schedule?: unknown;};
/**
 * Payload da passagem Onboarding → Painel. G4 (F-071): `handoffVersion: 3` acrescenta `importedClients` (as linhas conferidas
 * na importação) e campos que o Painel aplica (endereço, formas de pagamento, política de cancelamento). Versões antigas
 * continuam aceitas: o que não vem fica como está.
 */
export type FirstAccess = {
  handoffVersion?: number;
  owner: {name: string;};
  clinic: {name: string;segment: string;specialty?: string;about?: string;street: string;number: string;city: string;complement?: string;district?: string;uf?: string;zip?: string;mapsUrl?: string;};
  profile: {name: string;tone: string;greeting: string;canDo?: string;cannotDo?: string;handoff?: string;acceptsInsurance?: '' | 'sim' | 'nao';payments?: string[];cancellation?: string;};
  hours: {day: string;open: boolean;from: string;to: string;periods?: {start: string;end: string;}[];}[];
  clinicExceptions?: ClinicException[];
  scheduleVersion?: number;
  team: FirstAccessPro[];
  services: ReceivedService[];
  faqs: {id?: string;question?: string;answer: string;}[];
  documents: unknown[];
  level: string;
  /** Quantos clientes a importação conferiu (= `importedClients.length` a partir da versão 3). */
  imported: number;
  importedClients?: ReceivedClient[];
  plan: string;
  /** WhatsApp para avisos internos (etapa 5 do Onboarding). */
  alertPhone?: string;
  automations: Record<string, boolean>;
  automationKinds?: Record<string, AutomationKind>;
  completed: number[];
  deferred: number[];
  whatsapp: string;
  whatsappNumber: string;
  aiOn: boolean;
};
/** De onde veio o que está na tela: a passagem real (postMessage) ou o cenário do seletor de telas. */
export type FirstAccessSource = 'onboarding' | 'exemplo';

// Só a passagem REAL fica guardada para a sessão: o cenário do seletor nunca vaza para a rota sem parâmetro.
let received: {data: FirstAccess;result: ApplyResult;} | null = null;
let sample: {data: FirstAccess;result: ApplyResult;} | null = null;
let token = '';
let openerOrigin = ONBOARDING_ORIGIN;

function valid(p: any): p is FirstAccess {
  return (
    !!p &&
    typeof p.clinic?.name === 'string' &&
    typeof p.owner?.name === 'string' &&
    typeof p.profile?.name === 'string' &&
    ['hours', 'team', 'services', 'faqs', 'documents', 'completed', 'deferred'].every((k) => Array.isArray(p[k])) &&
    typeof p.automations === 'object' &&
    typeof p.aiOn === 'boolean' &&
    typeof p.imported === 'number' && (
    p.clinicExceptions === undefined || Array.isArray(p.clinicExceptions)) && (
    p.importedClients === undefined || Array.isArray(p.importedClients)));

}

/**
 * W6 (11/11/2026, A6-01 e A6-03): a passagem também aplica as automações escolhidas e o plano contratado.
 * W9e (12/11/2026, A6F-01): com o WhatsApp conectado na etapa 11, o número conectado lá passa a ser o de Configurações ›
 * WhatsApp (antes ficava o número da amostra).
 */
const apply = (t: string, p: FirstAccess) => {
  const result = applyReceivedConfig(t, { clinic: p.clinic, profile: p.profile, hours: p.hours, clinicExceptions: p.clinicExceptions, team: p.team, services: p.services, faqs: p.faqs, documents: p.documents, importedClients: p.importedClients, alertPhone: p.alertPhone, whatsapp: p.whatsapp, aiOn: p.aiOn, automations: p.automations, plan: p.plan });
  if (p.whatsapp === 'connected') setWhatsappNumber(p.whatsappNumber);
  return result;
};

/** Esta URL traz o parâmetro de handoff? (o onboarding sempre abre assim; sem ele é acesso direto) */
const hasHandoffParam = () => !!new URLSearchParams(location.hash.split('?')[1]).get('handoff');

export function useOnboardingHandoff() {
  const { search } = useLocation();
  const q0 = new URLSearchParams(location.hash.split('?')[1]);
  const isSample = !q0.get('handoff') && q0.get('exemplo') === 'preenchido';
  const initial = isSample ? sample : received;
  const [data, setData] = useState<FirstAccess | null>(initial?.data ?? null);
  const [result, setResult] = useState<ApplyResult | null>(initial?.result ?? null);
  const [source, setSource] = useState<FirstAccessSource | null>(initial ? isSample ? 'exemplo' : 'onboarding' : null);
  const [status, setStatus] = useState(initial ? 'received' : 'waiting');
  useEffect(() => {
    const q = new URLSearchParams(location.hash.split('?')[1]);
    const next = q.get('handoff');
    // Decisão 3A (21/10/2026): ?exemplo=preenchido (seletor de telas) mostra o cenário preenchido do Onboarding sem o handoff.
    // G4 (F-071): fica SEPARADO da passagem real (não vira "recebido" na rota sem parâmetro) e é aplicado às telas do Painel
    // como o real, para "Ver no painel" mostrar o que veio.
    if (!next && q.get('exemplo') === 'preenchido') {
      if (!sample) {
        const d = firstAccessSample();
        sample = { data: d, result: apply('exemplo', d) };
      }
      setData(sample.data);
      setResult(sample.result);
      setSource('exemplo');
      setStatus('received');
      return;
    }
    if (!next || !window.opener) {
      setData(received?.data ?? null);
      setResult(received?.result ?? null);
      setSource(received ? 'onboarding' : null);
      setStatus(received ? 'received' : 'standalone');
      return;
    }
    token = next;
    let got = false;
    const receive = (e: MessageEvent) => {
      if (!isOnboardingOrigin(e.origin) || e.source !== window.opener || e.data?.token !== token || e.data.type !== 'orniplaty:session' || !valid(e.data.payload)) return;
      got = true;
      openerOrigin = e.origin;
      const d = e.data.payload as FirstAccess;
      received = { data: d, result: apply(token, d) };
      setData(received.data);
      setResult(received.result);
      setSource('onboarding');
      setStatus('received');
      window.opener.postMessage({ type: 'orniplaty:received', token }, e.origin);
    };
    window.addEventListener('message', receive);
    // G4 (F-071): "ready" só para a origem do Onboarding pareado (nunca '*').
    const ready = () => window.opener?.postMessage({ type: 'orniplaty:ready', token }, ONBOARDING_ORIGIN);
    ready();
    const interval = setInterval(() => {
      if (!got) ready();
    }, 500);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!got && !received) setStatus('timeout');
    }, 15000);
    return () => {
      window.removeEventListener('message', receive);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [search]);
  return { data, status, source, result, attempted: hasHandoffParam() };
}

export function editOnboarding(step: number) {
  if (window.opener && !window.opener.closed && token) {
    window.opener.postMessage({ type: 'orniplaty:edit', token, step }, openerOrigin);
    window.opener.focus();
    return true;
  }
  return false;
}