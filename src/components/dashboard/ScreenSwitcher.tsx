import { setLoadFailure, setSaveFailure, useFailures } from '../../data/failures';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, LayersIcon, XIcon } from 'lucide-react';
import { dashboardScreens } from '../../data/dashboardScreens';
import { PillGroup } from '../Pill';
import {
  SUB_SCENARIOS,
  TEMPLATE_SCENARIOS,
  USAGE_SCENARIOS,
  WA_SCENARIOS,
  setSmsAvailable,
  setSubScenario,
  setSupportFails,
  setTemplateStatus,
  setCampaignTemplateStatus,
  setUsageScenario,
  setWaScenario,
  usageKey,
  useSettings,
  waKey } from
'../../data/settingsStore';
import type { SubState, TemplateStatus, UsageScenario, WaScenario } from '../../data/settingsStore';
import { roleLabel, setRole, useRole } from '../../data/exceptions';
import { setG3Sample, useG3Sample } from '../../data/g3Sample';
import type { Role } from '../../data/exceptions';
import { setSavedAutomationMode, useSavedAutomationMode } from '../../data/automationMode';
import { automationModes } from '../../data/automacoes';
import type { AutomationMode } from '../../data/automacoes';
import { useSavedStore } from '../../data/iaConfigStore';
import { applySegmentValue, empresaStore, samplePaymentDetails } from '../../data/empresa';
import { blankServicePayment, migrateLegacyPayment } from '../../data/paymentRules';
import type { LegacyPaymentDetails } from '../../data/paymentRules';
import { activeServicesOf, getServices, samplePaymentOf, setServicePayments } from '../../data/servicesStore';
import { SEGMENT_OPTIONS, SPECIALTY_OPTIONS, hasSpecialty } from '../../data/segment';
import { applyScenario, requestLeave } from '../../data/dirtyGuard';
import { CONVERSAS_SCENARIOS, setConversasScenario, useConversasScenario } from '../../data/replyWindow';
import type { ConversasScenario } from '../../data/replyWindow';

const one = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

/**
 * Lista do seletor = telas do protótipo + o primeiro acesso PREENCHIDO (decisão 3A, 21/10/2026), logo abaixo do primeiro
 * acesso. Ele abre `?exemplo=preenchido` (data/firstAccessSample.ts) e não vira rota própria: a rota continua a mesma.
 */
const switcherScreens = dashboardScreens.flatMap((screen) =>
screen.id === 'inicio-primeiro-acesso' ?
[screen, { id: screen.id, path: `${screen.path}?exemplo=preenchido`, label: 'Início · primeiro acesso (preenchido)' }] :
[screen]
);

/**
 * Lote F (F4): pagamento salvo no formato antigo (até o Lote E), para ver a conversão `migrateLegacyPayment` funcionando.
 * Sinal só para a Toxina (vira padrão "Não pede" + exceção na Toxina), parcela mínima R$ 50,00 (descartada) e os dois
 * textos antigos somando mais de 300 caracteres (cortado, com aviso no campo "Como o cliente paga").
 */
const LEGACY_SAMPLE: LegacyPaymentDetails = {
  installments: 'sim',
  maxInstallments: '6',
  interestFreeUpTo: '2',
  minInstallment: '50',
  discount: 'sim',
  discountPercent: '5',
  discountMethods: ['pix'],
  deposit: 'sim',
  depositKind: 'fixo',
  depositValue: '100',
  depositServices: ['toxina'],
  depositHow: 'A equipe envia a chave Pix pelo WhatsApp e confirma o pagamento antes do horário.',
  note: 'Pacotes podem ser parcelados em até 10x no cartão. Aceitamos Pix na recepção, no dia do atendimento, e cartão de débito. Para pacotes fechados na avaliação, a primeira parcela é paga no mesmo dia e as outras ficam no cartão, sem juros até 3x. Dúvidas sobre valores, a equipe responde.'
};
let paymentSample: 'novo' | 'antigo' = 'novo';
function loadPaymentSample(v: 'novo' | 'antigo') {
  paymentSample = v;
  const cur = empresaStore.get();
  if (v === 'novo') {
    empresaStore.set({ ...cur, payment: { ...samplePaymentDetails(), insuranceDefault: cur.payment.insuranceDefault }, paymentNotice: undefined });
    setServicePayments((s) => samplePaymentOf(s.id));
    return;
  }
  const m = migrateLegacyPayment(LEGACY_SAMPLE, cur.payment.insuranceDefault);
  empresaStore.set({ ...cur, payment: m.payment, paymentNotice: m.notice });
  setServicePayments((s) => m.serviceDeposit[s.id] ? { ...blankServicePayment(), deposit: m.serviceDeposit[s.id] } : blankServicePayment());
}

/**
 * Estados de teste (fora da página, decisão 9 A de 20/10/2026): mudar aqui muda Configurações, Início, menu e IA Orniplaty,
 * porque todos leem data/settingsStore.ts. O perfil (Dono/Administrador/Equipe) só vale para o encaixe da Agenda.
 */
function PrototypeStates() {
  const s = useSettings();
  const role = useRole();
  const mode = useSavedAutomationMode();
  const empresa = useSavedStore(empresaStore);
  const g3 = useG3Sample();
  const failures = useFailures();
  const conversasScenario = useConversasScenario();
  const groups: {label: string;value: string;options: readonly {value: string;label: string;}[];onChange: (v: string) => void;}[] = [
  { label: 'WhatsApp', value: waKey(s), options: WA_SCENARIOS, onChange: (v) => setWaScenario(v as WaScenario) },
  { label: 'Assinatura', value: s.sub.state, options: SUB_SCENARIOS, onChange: (v) => setSubScenario(v as SubState) },
  { label: 'Uso da assistente', value: usageKey(s), options: USAGE_SCENARIOS, onChange: (v) => setUsageScenario(v as UsageScenario) },
  { label: 'Lembrete da véspera', value: s.templates.lembrete, options: TEMPLATE_SCENARIOS, onChange: (v) => setTemplateStatus('lembrete', v as TemplateStatus) },
  // G1 subetapa 2 (F-025): situação no WhatsApp da mensagem da campanha de pacote (B8: "Em análise" segura o envio).
  { label: 'Mensagem: lembrar sessões de pacote', value: s.campaignTemplates.pacotes, options: TEMPLATE_SCENARIOS, onChange: (v) => setCampaignTemplateStatus('pacotes', v as TemplateStatus) },
  { label: 'SMS para trocar o número', value: s.smsAvailable ? 'sim' : 'nao', options: [{ value: 'sim', label: 'Disponível' }, { value: 'nao', label: 'Indisponível' }], onChange: (v) => setSmsAvailable(v === 'sim') },
  { label: 'Envio do chamado', value: s.supportFails ? 'falha' : 'ok', options: [{ value: 'ok', label: 'Funciona' }, { value: 'falha', label: 'Falha' }], onChange: (v) => setSupportFails(v === 'falha') },
  {
    // Lote A de Oportunidades (20/10/2026): mesmo valor salvo em IA Orniplaty › Automações (o padrão continua Pausado)
    label: 'Modo de envio (Oportunidades)',
    value: mode,
    options: automationModes.map((m) => ({ value: m.id, label: m.label })),
    onChange: (v) => {
      // G1 (F-014): um store só (automacoesStore.mode); `setSavedAutomationMode` escreve nele.
      // G2 (IA-22): grava no cadastro salvo de Automações: passa pelo aviso se houver rascunho e recarrega o rascunho.
      applyScenario(() => setSavedAutomationMode(v as AutomationMode));
    }
  },
  {
    // Lote D (21/10/2026): o mesmo valor de IA Orniplaty › Empresa. Muda as palavras das telas (clínica · empresa).
    // G4 (F-062): palavras E exemplos/sugestões. Os serviços cadastrados não mudam; com serviços, aparece o aviso das áreas.
    label: 'Segmento (palavras e exemplos)',
    value: empresa.segment,
    options: SEGMENT_OPTIONS,
    onChange: (v) =>
    applyScenario(() => {
      const cur = empresaStore.get();
      applySegmentValue(v, hasSpecialty(v) ? cur.specialty || 'estetica' : '', activeServicesOf(getServices().services).length);
    })
  },
  {
    // G4 (F-062): especialidade (só Clínica e Consultório) para conferir os exemplos de cada uma.
    label: 'Especialidade (Clínica e Consultório)',
    value: hasSpecialty(empresa.segment) ? empresa.specialty || 'outra' : '',
    options: hasSpecialty(empresa.segment) ? SPECIALTY_OPTIONS : [],
    onChange: (v) => applyScenario(() => empresaStore.set({ ...empresaStore.get(), specialty: v }))
  },
  {
    // Lote F (F4): conversão do pagamento salvo no formato antigo
    label: 'Pagamento salvo (IA Orniplaty › Empresa)',
    value: paymentSample,
    options: [
    { value: 'novo', label: 'Exemplo atual' },
    { value: 'antigo', label: 'Formato antigo (converte)' }],

    onChange: (v) => applyScenario(() => loadPaymentSample(v as 'novo' | 'antigo'))
  },
  {
    // G3 (26/10/2026): fixture identificada, desligada por padrão (data/g3Sample.ts). Não é configuração da clínica.
    label: 'Exemplo do G3: convênio e sinal',
    value: g3 ? 'on' : 'off',
    options: [
    { value: 'off', label: 'Desligado' },
    { value: 'on', label: 'Ligado (exemplo)' }],

    onChange: (v) => applyScenario(() => setG3Sample(v === 'on'))
  },
  {
    // G4 (F-066): erros recuperáveis (Alert de erro + "Tentar de novo"); a nova tentativa funciona.
    label: 'Falha ao carregar listas',
    value: failures.load ? 'sim' : 'nao',
    options: [{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim (Clientes, Pacotes, Conversas, Oportunidades, Resultados)' }],
    onChange: (v) => setLoadFailure(v === 'sim')
  },
  {
    // T1 (O-01/O-02, 04/11/2026): lista carregando, relógio fora do expediente (selo "fora do horário") e a corrida do envio.
    label: 'Conversas (janela e fila)',
    value: conversasScenario,
    options: CONVERSAS_SCENARIOS,
    onChange: (v) => setConversasScenario(v as ConversasScenario)
  },
  {
    label: 'Falha ao salvar (IA Orniplaty)',
    value: failures.save ? 'sim' : 'nao',
    options: [{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim (Empresa, Como atender, Conhecimento, Automações)' }],
    onChange: (v) => setSaveFailure(v === 'sim')
  },
  {
    label: 'Perfil (encaixe na Agenda)',
    value: role,
    options: (Object.keys(roleLabel) as Role[]).map((r) => ({ value: r, label: roleLabel[r] })),
    onChange: (v) => setRole(v as Role)
  }];

  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-3">
      <p className="text-xs text-text-muted">Estados para testar o protótipo. Valem para todas as telas. Nenhuma mensagem real é enviada, nenhum pagamento é cobrado e nenhuma integração real está ligada: todo envio é simulado e os dados ficam só nesta sessão (recarregar a página volta à amostra).</p>
      {groups.filter((g) => g.options.length > 0).map((g) =>
      <PillGroup key={g.label} label={g.label} size="sm" options={g.options.map((o) => ({ value: o.value, label: o.label }))} value={g.value} onChange={(v) => g.onChange(one(v))} />
      )}
    </div>);

}

type ScreenSwitcherProps = {
  available: string[];
};

export function ScreenSwitcher({ available }: ScreenSwitcherProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open &&
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="max-h-[75vh] w-80 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-2xl border border-border bg-surface shadow-lg">
          
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Situação da conta (protótipo)</p>
            </div>
            <PrototypeStates />
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Telas do protótipo</p>
            </div>
            <ul className="p-2" role="menu">
              {switcherScreens.map((screen) => {
              const isAvailable = available.includes(screen.id);
              const isCurrent = pathname === screen.path;
              return (
                <li key={screen.path}>
                    <button
                    type="button"
                    role="menuitem"
                    disabled={!isAvailable}
                    onClick={() => {
                      // G2 (F-031): trocar de tela pelo seletor também passa pelo aviso de alterações não salvas.
                      setOpen(false);
                      requestLeave(() => navigate(screen.path));
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-button px-3 py-2 text-left text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isCurrent ?
                    'bg-primary-soft text-primary' :
                    isAvailable ?
                    'text-text-primary hover:bg-surface-muted' :
                    'cursor-not-allowed text-text-muted opacity-60'}`
                    }>
                    
                      <span>{screen.label}</span>
                      {isCurrent ?
                    <CheckIcon className="h-4 w-4 shrink-0" /> :
                    !isAvailable ?
                    <span className="shrink-0 text-xs font-medium">em breve</span> :
                    null}
                    </button>
                  </li>);

            })}
            </ul>
          </motion.div>
        }
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fechar lista de telas' : 'Abrir lista de telas'}
        aria-expanded={open}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-background text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-badge-count focus-visible:ring-offset-2">
        
        {open ? <XIcon className="h-5 w-5" /> : <LayersIcon className="h-5 w-5" />}
      </button>
    </div>);

}