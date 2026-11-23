/**
 * Modo de envio das campanhas já SALVO em IA Orniplaty › Automações (P01). Fonte única para Oportunidades e Retornos.
 * Rascunho não salvo não vale. PROTÓTIPO: vive só na memória da sessão; o backend real não é chamado.
 *
 * G1 (23/10/2026, F-014): este arquivo deixou de guardar um segundo estado. O modo salvo mora SÓ em
 * `automacoesStore.mode` (data/automacoes.ts); as funções abaixo são atalhos para ler/escrever esse campo. Antes havia
 * dois stores sincronizados à mão (Automações e o seletor de telas escreviam nos dois).
 */
import { useSyncExternalStore } from 'react';
import { automacoesStore } from './automacoes';
import type { AutomationMode } from './automacoes';

export const getSavedAutomationMode = (): AutomationMode => automacoesStore.get().mode;

export function setSavedAutomationMode(next: AutomationMode) {
  const cur = automacoesStore.get();
  if (next === cur.mode) return;
  automacoesStore.set({ ...cur, mode: next });
}

export const useSavedAutomationMode = () => useSyncExternalStore(automacoesStore.subscribe, getSavedAutomationMode);

export const PAUSED_SEND_REASON = 'Modo Pausado: nenhuma campanha é enviada. Mude o modo em IA Orniplaty › Automações.';