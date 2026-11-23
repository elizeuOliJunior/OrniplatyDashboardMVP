import { useSyncExternalStore } from 'react';

/**
 * G4 (F-066): ERROS RECUPERÁVEIS para testar pelo seletor de telas ("Falha ao carregar listas", "Falha ao salvar").
 * Ligado, a 1ª tentativa de cada lista (ou de cada formulário) falha e a tela mostra o aviso de erro do design system
 * (`Alert` error) com "Tentar de novo". A nova tentativa funciona (falha passageira). Desligar volta ao normal.
 * Nada é apagado: o rascunho do formulário continua como estava.
 */
type State = {load: boolean;save: boolean;retriedLoads: string[];retriedSaves: string[];};
let state: State = { load: false, save: false, retriedLoads: [], retriedSaves: [] };
const listeners = new Set<() => void>();
const emit = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useFailures = () => useSyncExternalStore(subscribe, () => state);
export const getFailures = () => state;
export const setLoadFailure = (on: boolean) => emit({ ...state, load: on, retriedLoads: [] });
export const setSaveFailure = (on: boolean) => emit({ ...state, save: on, retriedSaves: [] });

/** Lista `key` falhou ao carregar? `retry` simula a nova tentativa (que funciona). */
export function useLoadFailure(key: string) {
  const s = useFailures();
  return { failed: s.load && !s.retriedLoads.includes(key), retry: () => emit({ ...state, retriedLoads: [...state.retriedLoads, key] }) };
}

/** Chamado pelo salvar do formulário `id`: devolve true quando esta tentativa deve falhar. */
export function saveShouldFail(id: string) {
  return state.save && !state.retriedSaves.includes(id);
}
/** Depois de uma falha, a próxima tentativa do mesmo formulário funciona. */
export const markSaveRetried = (id: string) => emit({ ...state, retriedSaves: [...state.retriedSaves, id] });