import { useEffect } from 'react';

/**
 * L21 (17/11/2026, validação V5: "o aviso cobre o título da janela", não atendido desde o L13): guarda GLOBAL da posição
 * dos avisos rápidos (`ToastProvider` do DS) no Painel. Mesmo tipo de correção local do `TooltipEdgeGuard`.
 *
 * O `Toast` do DS fica no topo (>= 640 px) ou embaixo (< 640 px) e não sabe o que está aberto. Visto na V5: depois de uma
 * ação dentro de uma janela ou painel lateral, o aviso cobria o título ("Laris…", "Ana Ribeiro"); em Conversas, cobria o
 * contador "Com a assistente" da linha do topo.
 *
 * Regra (só muda ONDE o contêiner dos avisos fica; o aviso em si é o do DS, sem mudança):
 * 1. Com uma janela ou painel lateral aberto (`role="dialog"`/`"alertdialog"` com `aria-modal`, o de cima):
 *    - no computador, se sobra uma faixa livre ao lado da janela (>= 380 px), o aviso aparece NESSA faixa, no topo, sem
 *      tocar a janela;
 *    - senão (e no celular), o aviso aparece sobre a janela, LOGO ACIMA do rodapé dela (nem o título nem os botões ficam
 *      cobertos). Sem rodapé: 16 px acima da base da janela.
 * 2. Sem janela, no computador: o aviso fica no topo, como sempre, mas desce para baixo dos contadores da linha do topo
 *    que estejam à vista (`StatChipGroup` do DS, `role="group"` com nome "Indicadores …", ex.: Conversas) e de qualquer
 *    elemento marcado com `data-toast-avoid`.
 * 3. Fora disso, nada muda (posição do DS).
 * A medida usa a posição FINAL da janela (offset, sem a animação de entrada), para o aviso não pular junto com ela.
 * Levar ao DS: `Toast` com zonas a evitar (ver correcao-L21, "Falta no design system").
 */
const GAP = 16;
const NEAR = 12;
const MIN_STRIP = 380;
const AVOID_TOP_ZONE = 200;
const AVOID = '[data-toast-avoid], [role="group"][aria-label^="Indicadores"]';

type Pos = {top?: number;bottom?: number;left?: number;right?: number;};

const toastHost = () => document.querySelector<HTMLElement>('[aria-live="polite"][data-toast-position]');

function topDialog(): HTMLElement | null {
  const list = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')).filter(
    (el) => el.dataset.state !== 'closing' && !el.closest('[aria-hidden="true"]') && el.offsetWidth > 0 && el.offsetHeight > 0
  );
  return list[list.length - 1] ?? null;
}

/** Rodapé da janela: o último filho, quando é uma faixa com borda em cima e botões (DS `Modal` e `AppModal`). */
function footerOf(panel: HTMLElement): HTMLElement | null {
  const last = panel.lastElementChild as HTMLElement | null;
  if (!last || last === panel.firstElementChild) return null;
  if (last.hasAttribute('data-modal-footer')) return last;
  const border = parseFloat(getComputedStyle(last).borderTopWidth) || 0;
  return border > 0 && last.querySelector('button') ? last : null;
}

function compute(): Pos | null {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const narrow = vw < 640;
  const d = topDialog();
  if (d) {
    const parent = d.offsetParent as HTMLElement | null;
    const pr = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
    const left = pr.left + d.offsetLeft;
    const top = pr.top + d.offsetTop;
    const right = left + d.offsetWidth;
    const bottom = top + d.offsetHeight;
    if (!narrow) {
      if (left >= MIN_STRIP) return { top: GAP, left: 0, right: Math.max(0, vw - left) };
      if (vw - right >= MIN_STRIP) return { top: GAP, left: right, right: 0 };
    }
    const foot = footerOf(d);
    const footTop = foot ? top + foot.offsetTop : bottom - GAP;
    return { bottom: Math.max(GAP, vh - footTop + NEAR), left: Math.max(0, left), right: Math.max(0, vw - right) };
  }
  if (narrow) return null;
  let floor = 0;
  document.querySelectorAll<HTMLElement>(AVOID).forEach((el) => {
    if (el.closest('[aria-live]')) return;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.bottom > 0 && r.top < AVOID_TOP_ZONE) floor = Math.max(floor, r.bottom);
  });
  return floor + NEAR > GAP ? { top: floor + NEAR, left: 0, right: 0 } : null;
}

function apply(host: HTMLElement, pos: Pos | null) {
  const s = host.style;
  if (!pos) {
    s.top = s.bottom = s.left = s.right = '';
    return;
  }
  s.top = pos.top !== undefined ? `${pos.top}px` : 'auto';
  s.bottom = pos.bottom !== undefined ? `${pos.bottom}px` : 'auto';
  s.left = `${pos.left ?? 0}px`;
  s.right = `${pos.right ?? 0}px`;
}

export function ToastPlacementGuard() {
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    let raf = 0;
    let host: HTMLElement | null = null;
    let hostObserver: MutationObserver | null = null;
    const loop = () => {
      raf = 0;
      if (!host || !host.isConnected) return;
      if (host.childElementCount === 0) {
        apply(host, null);
        return;
      }
      apply(host, compute());
      raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!host) return;
      if (host.childElementCount > 0) apply(host, compute());
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const attach = () => {
      const h = toastHost();
      if (!h || h === host) return;
      hostObserver?.disconnect();
      host = h;
      hostObserver = new MutationObserver(kick);
      hostObserver.observe(h, { childList: true });
      kick();
    };
    attach();
    const bodyObserver = new MutationObserver(attach);
    bodyObserver.observe(document.body, { childList: true });
    return () => {
      bodyObserver.disconnect();
      hostObserver?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}