/**
 * Configurações (repaginada em 20/10/2026). Estado vivo (WhatsApp, assinatura, uso, pendências): data/settingsStore.ts.
 * Aqui ficam só os textos e dados fixos da tela.
 */
import type { SettingsSectionId } from './settingsStore';

export type SettingsSection = SettingsSectionId;

export const settingsSections: {value: SettingsSection;label: string;}[] = [
{ value: 'geral', label: 'Visão geral' },
{ value: 'whatsapp', label: 'WhatsApp' },
{ value: 'plano', label: 'Plano e pagamento' },
{ value: 'conta', label: 'Conta' },
{ value: 'ajuda', label: 'Ajuda' }];


/** Nomes antigos que ainda podem chegar por link ou pelo canvas. */
export const legacySection: Record<string, SettingsSection> = { suporte: 'ajuda', agenda: 'geral' };

/* ───────────── WhatsApp ───────────── */

/** Número conectado (amostra). O NOME exibido no WhatsApp é o nome da empresa salvo em IA Orniplaty › Empresa (G1, F-004: `useBusinessName`). */
export const whatsappConnection = {
  number: '(19) 3200-1000'
};

/**
 * W9e (12/11/2026, A6F-01): o número conectado na etapa 11 do Onboarding passa a ser o número desta tela, na passagem
 * Onboarding → Painel (data/onboardingHandoff.ts). Antes, o Painel mostrava sempre o número da amostra. Vazio não troca.
 */
export function setWhatsappNumber(number: string | undefined) {
  const n = (number ?? '').trim();
  if (n) whatsappConnection.number = n;
}

/** As 2 mensagens que existem por clínica no backend (lembrete_confirmacao e aviso_agendamento_profissional). */
export const messageTemplates = [
{ id: 'lembrete' as const, name: 'Confirmação do horário', usage: 'Para o cliente, antes do horário marcado (antecedência em Automações)' },
{ id: 'aviso-profissional' as const, name: 'Aviso de agenda', usage: 'Para o profissional, quando a agenda dele muda' }];


/* ───────────── Conta ───────────── */

export const accountInfo = {
  ownerName: 'Marina Souza',
  alertsPhone: '(19) 98811-4420',
  email: 'marina@vidaplena.com.br'
};

/** Código aceito pelo protótipo na troca de e-mail/número. NUNCA mostrar na tela (documentado só no CLAUDE.md). */
export const DEMO_VERIFICATION_CODE = '123456';

/* ───────────── Ajuda ───────────── */

/** Assuntos do chamado = enum do backend (`dashboard`, `agent`, `payment`, `facebook`). */
export const supportSubjects = [
{ value: 'dashboard', label: 'Painel', hint: 'Telas com erro, dados que não carregam, algo que não salva.' },
{ value: 'agent', label: 'Assistente', hint: 'A assistente não responde, responde errado ou não agenda.' },
{ value: 'payment', label: 'Pagamento e assinatura', hint: 'Cobrança, cartão recusado, nota fiscal.' },
{ value: 'facebook', label: 'Conexão com o WhatsApp', hint: 'WhatsApp desconectado, erro ao conectar.' }];