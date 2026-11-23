/**
 * Reposição de aula (G1, aulas em grupo, 23/11/2026). Mesmo estilo de data/bookingRules.ts: configuração da empresa,
 * editada em Serviços e equipe › Funcionamento › Regras de agendamento › "Reposição de aula" (só aparece com um serviço
 * em grupo ativo). As três regras começam desligadas.
 * CONTRATO NOVO (aulas em grupo, 23/11/2026): nada disto existe no backend. Quem usa as regras (crédito de reposição ao
 * cancelar uma aula ou ao registrar o aviso de falta) chega nos lotes G2 e G3.
 * Protótipo: só memória; recarregar volta aos valores iniciais.
 */
import { useSyncExternalStore } from 'react';

export type MakeupRules = {
  /** CONTRATO NOVO (aulas em grupo, 23/11/2026): aula cancelada pela empresa dá crédito de reposição. */
  onBusinessCancel: boolean;
  /** CONTRATO NOVO (aulas em grupo, 23/11/2026): cliente que avisa a falta com antecedência ganha crédito. */
  onClientNotice: boolean;
  /** CONTRATO NOVO (aulas em grupo, 23/11/2026): antecedência mínima do aviso, em horas. */
  clientNoticeHours: number;
  /** CONTRATO NOVO (aulas em grupo, 23/11/2026): validade do crédito, em dias. */
  validityDays: number;
};

export const DEFAULT_MAKEUP_RULES: MakeupRules = { onBusinessCancel: false, onClientNotice: false, clientNoticeHours: 24, validityDays: 30 };

let rules: MakeupRules = DEFAULT_MAKEUP_RULES;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getMakeupRules = () => rules;
export const useMakeupRules = () => useSyncExternalStore(subscribe, () => rules);
export function setMakeupRules(next: MakeupRules) {
  rules = next;
  listeners.forEach((l) => l());
}

/** Alguma regra dá reposição? */
export const makeupOn = (r: MakeupRules) => r.onBusinessCancel || r.onClientNotice;