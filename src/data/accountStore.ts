/**
 * Contatos da conta (e-mail de acesso e WhatsApp para avisos), com troca confirmada por código SIMULADO.
 * Protótipo: vive em memória. No produto o código é enviado ao novo contato e validado no servidor (item B).
 * D7 (padrão aprovado): o e-mail continua sendo o login; trocar exige código no novo e-mail.
 */
import { useSyncExternalStore } from 'react';
import { accountInfo } from './configuracoes';
import { nowDateTimeLabel } from './agendaStore';

/** G1 (F-014): o nome do responsável também mora aqui (antes era variável solta em ContaSection). */
/** G4 (F-064): `passwordChangedAt` registra QUANDO a senha foi trocada nesta sessão (nunca a senha). */
type Contacts = {ownerName: string;email: string;alertsPhone: string;passwordChangedAt?: string;};

let contacts: Contacts = { ownerName: accountInfo.ownerName, email: accountInfo.email, alertsPhone: accountInfo.alertsPhone };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = (next: Contacts) => {
  contacts = next;
  listeners.forEach((l) => l());
};

export const useAccountContacts = () => useSyncExternalStore(subscribe, () => contacts);
export const getAccountContacts = () => contacts;
export const setAccountEmail = (email: string) => emit({ ...contacts, email });
export const setAccountPhone = (alertsPhone: string) => emit({ ...contacts, alertsPhone });
export const setAccountOwnerName = (ownerName: string) => emit({ ...contacts, ownerName: ownerName.trim() });
/** Grava só a data e a hora da troca (relógio do protótipo). A senha não é guardada em lugar nenhum. */
export const markPasswordChanged = () => emit({ ...contacts, passwordChangedAt: nowDateTimeLabel() });