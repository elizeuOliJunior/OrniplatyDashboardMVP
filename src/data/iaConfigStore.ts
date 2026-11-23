/**
 * Configuração SALVA da IA Orniplaty (Empresa, Como atender, Conhecimento, Automações).
 * Cada aba é uma rota própria: sem esta store, voltar a uma aba relia os dados de exemplo e o que foi salvo sumia.
 * O rascunho de cada aba continua no `useDraft`; ao salvar, o rascunho vira o valor desta store.
 * PROTÓTIPO: vive só na memória da sessão (backend não é chamado).
 */
import { useSyncExternalStore } from 'react';

export interface SavedStore<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createSavedStore<T>(initial: T): SavedStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export function useSavedStore<T>(store: SavedStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}