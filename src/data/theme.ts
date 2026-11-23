import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

/**
 * T1 1k (05/11/2026, Christian, referência Tend): MODO NOTURNO do Painel.
 * - Estado único do tema (`light` | `dark`), lembrado neste navegador (localStorage; se o navegador bloquear, só não lembra).
 * - Aplica a classe `dark` (e `data-theme`) no <html>. As cores escuras ficam em index.css (variáveis do DS) e em
 *   components/ui/ThemeHost.tsx (cores fixas das peças locais).
 * - Começa sempre no claro (não segue o tema do sistema). No produto, a escolha deveria ficar no perfil do usuário:
 *   o backend (main de 22/10) não tem esse campo — CONTRATO NOVO, se for preciso lembrar entre aparelhos.
 * - 10/11/2026 (Christian: a troca de tema era "não linear", parecia erro visual). Causa: cada peça mudava de cor no seu
 *   próprio ritmo (umas na hora, outras com a animação de 150–200 ms do hover, outras pela camada do ThemeHost). Agora a
 *   troca é UMA passagem suave da tela inteira (~350 ms):
 *   - navegador com View Transitions (Chrome, Edge, Safari 18+): fotografa a tela, troca o tema de uma vez com as
 *     animações próprias das peças desligadas (`orni-theme-switching`) e faz um esmaecimento único entre as duas;
 *   - navegador sem isso: todas as cores mudam juntas com a mesma duração (`orni-theme-fade`);
 *   - "reduzir movimento" ligado no sistema: troca na hora, sem animação, mas tudo junto.
 */
export type Theme = 'light' | 'dark';
const KEY = 'orniplaty-tema';

function read(): Theme {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

let theme: Theme = read();
const listeners = new Set<() => void>();

export function applyTheme() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/** Duração da troca de tema (ms). Igual ao `--orni-theme-ms` de index.css. */
const SWITCH_MS = 350;

type ViewTransitionDoc = Document & {startViewTransition?: (update: () => void) => {finished: Promise<void>;};};

function commit() {
  applyTheme();
  listeners.forEach((l) => l());
}

export function setTheme(next: Theme) {
  if (next === theme) return;
  theme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {

    /* navegador sem armazenamento: o tema vale só nesta visita */}
  if (typeof document === 'undefined') return commit();
  const root = document.documentElement;
  const reduce = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as ViewTransitionDoc;
  // As animações próprias das peças (hover, chave) ficam desligadas durante a troca: tudo muda no mesmo instante.
  root.classList.add('orni-theme-switching');
  const release = () => requestAnimationFrame(() => root.classList.remove('orni-theme-switching'));
  if (!reduce && typeof doc.startViewTransition === 'function') {
    try {
      const vt = doc.startViewTransition(() => flushSync(commit));
      vt.finished.then(release, release);
      return;
    } catch {

      /* segue para a troca sem fotografia */}
  }
  if (reduce) {
    commit();
    release();
    return;
  }
  // Sem View Transitions: a mesma transição de cor em tudo, ao mesmo tempo.
  root.classList.remove('orni-theme-switching');
  root.classList.add('orni-theme-fade');
  void root.offsetWidth;
  commit();
  window.setTimeout(() => root.classList.remove('orni-theme-fade'), SWITCH_MS + 50);
}

export const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => theme
  );
}

applyTheme();