/**
 * CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2a): áreas de atuação cadastradas pela empresa pelo
 * "Cadastrar área de atuação" da janela do profissional. Somam-se às sugeridas (`practiceAreaOptions` em
 * data/equipeFuncionamento.ts, que não mudou). Protótipo: só memória, nada persiste. No backend real, uma área por
 * empresa (o comentário de `PRACTICE_AREAS` cita a tabela professional_area); o profissional guarda o texto
 * (`practice_area`, 120).
 */
import { useSyncExternalStore } from 'react';

let areas: string[] = [];
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getCustomPracticeAreas = () => areas;
export const useCustomPracticeAreas = () => useSyncExternalStore(subscribe, () => areas);

/** Guarda a área nova (texto já conferido por quem chama) e devolve o nome salvo. */
export function addPracticeArea(name: string) {
  const n = name.trim().slice(0, 120);
  if (!n) return '';
  if (!areas.includes(n)) {
    areas = [...areas, n];
    listeners.forEach((l) => l());
  }
  return n;
}

/** Opções do seletor: as de sempre e, no fim, as cadastradas que ainda não estão na lista. */
export function withCustomAreas(options: {value: string;label: string;}[], custom: string[] = areas) {
  return [...options, ...custom.filter((a) => !options.some((o) => o.value === a)).map((a) => ({ value: a, label: a }))];
}