/**
 * Regras de agendamento da clínica (W2, 11/11/2026, D-A3-2 = a do Christian). Antes eram fixas no código e a tela só
 * "registrava proposta". Agora são configuração da clínica (Serviços e equipe › Funcionamento › Regras de agendamento).
 *
 * Quem segue cada regra (respostas do Christian em 11/11: 1 = a, 3 = a):
 *  - `slotStepMin` (horários sugeridos a cada N min): TODA sugestão de horário (Novo agendamento, assistente da Agenda,
 *    assistente do WhatsApp), porque passa por `freeStartTimes` (data/availability.ts). Não muda a grade nem o que dá
 *    para marcar à mão (a precisão continua de 5 min).
 *  - `minNoticeMin` e `maxDaysAhead`: só o que a assistente OFERECE AO CLIENTE (data/assistantAnswer.ts). A equipe,
 *    marcando pelo painel, não fica presa a elas.
 *  - `assistantDays`: quando o cliente pede horário sem dizer o dia e hoje não tem nada, a assistente procura nos
 *    próximos N dias (contando hoje) e oferece o primeiro dia com horário livre.
 * Backend (CONTRATO NOVO): hoje fixas no código (antecedência 5 min — service.py:1839; grade 30 min — service.py:1946;
 * a assistente oferece no máximo 4 dias — tools.py:1264; sem janela máxima). Referências da leitura de 22/10.
 * Protótipo: só memória; recarregar volta aos valores iniciais.
 */
import { useSyncExternalStore } from 'react';

export type BookingRules = {
  /** antecedência mínima, em minutos (a tela mostra em minutos ou horas) */
  minNoticeMin: number;
  /** até quantos dias à frente o cliente pode marcar pela assistente; null = sem limite */
  maxDaysAhead: number | null;
  /** de quantos em quantos minutos aparecem os horários sugeridos */
  slotStepMin: number;
  /** quantos dias (contando hoje) a assistente procura quando o cliente não diz o dia */
  assistantDays: number;
};

export const DEFAULT_BOOKING_RULES: BookingRules = { minNoticeMin: 5, maxDaysAhead: null, slotStepMin: 30, assistantDays: 4 };
export const SLOT_STEP_OPTIONS = [10, 15, 20, 30, 60];

let rules: BookingRules = DEFAULT_BOOKING_RULES;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getBookingRules = () => rules;
export const useBookingRules = () => useSyncExternalStore(subscribe, () => rules);
export function setBookingRules(next: BookingRules) {
  rules = next;
  listeners.forEach((l) => l());
}

/** "5 minutos", "2 horas", "1 dia". */
export function noticeText(min: number) {
  if (min > 0 && min % 1440 === 0) return min === 1440 ? '1 dia' : `${min / 1440} dias`;
  if (min > 0 && min % 60 === 0) return min === 60 ? '1 hora' : `${min / 60} horas`;
  return min === 1 ? '1 minuto' : `${min} minutos`;
}

/** Frase única das regras (cartão e mensagem de salvo). */
export function rulesSentence(r: BookingRules) {
  return `antecedência mínima de ${noticeText(r.minNoticeMin)}, ${r.maxDaysAhead ? `até ${r.maxDaysAhead} dias à frente` : 'sem limite de dias à frente'}, horários sugeridos de ${r.slotStepMin} em ${r.slotStepMin} minutos e a assistente procurando nos próximos ${r.assistantDays} ${r.assistantDays === 1 ? 'dia' : 'dias'}`;
}