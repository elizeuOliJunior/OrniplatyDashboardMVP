import React from 'react';
import { Logo } from '../Logo';

/**
 * Soft animated glow drawn behind the Orniplaty symbol (decorative, respects reduced motion).
 * Same glow as the sidebar logo, so both shine exactly the same way. Intensidade levemente aumentada em 16/10/2026
 * (pedido do Christian: um pouco mais notável, sem exagero). Manter idêntico ao GLOW_CSS de AppSidebarNav.
 * 10/11/2026 (Christian):
 * - Modo CLARO: como sempre, símbolo no quadrado claro #F2FAFA e brilho com cantos arredondados em volta dele.
 * - Modo ESCURO: o quadrado fica transparente (antes virava um recorte escuro e a luz só aparecia depois dele) e o
 *   brilho fica redondo, saindo de trás do ornitorrinco. Vale para a logo do menu e o símbolo do campo da assistente
 *   da Agenda (a regra pega só o `Logo` irmão do brilho: `:has(> .orni-glow) + span`). A arte da logo não muda.
 * - A luz NÃO recomeça a cada troca de página ou aba: o menu é montado de novo em cada página, então cada brilho novo
 *   é alinhado ao relógio da página (`startTime = 0`), e continua do ponto em que estaria (sem pulo).
 */
export const GLOW_CSS = `
@keyframes orni-glow-spin { to { transform: rotate(360deg); } }
@keyframes orni-glow-breathe { 0%, 100% { opacity: .62; transform: scale(.98); } 50% { opacity: .92; transform: scale(1.06); } }
.orni-glow { position: absolute; inset: -8px; border-radius: 16px; pointer-events: none; z-index: 0; animation: orni-glow-breathe 7s ease-in-out infinite; }
.orni-glow::before, .orni-glow::after { content: ''; position: absolute; inset: 0; border-radius: inherit; filter: blur(7px); }
.orni-glow::before { background: conic-gradient(from 0deg, rgba(52,211,153,0) 0deg, rgba(52,211,153,.88) 70deg, rgba(14,116,144,0) 150deg, rgba(94,234,212,.68) 230deg, rgba(14,116,144,0) 300deg, rgba(52,211,153,0) 360deg); animation: orni-glow-spin 14s linear infinite; }
.orni-glow::after { inset: 3px; background: conic-gradient(from 180deg, rgba(14,116,144,0) 0deg, rgba(14,116,144,.9) 90deg, rgba(14,116,144,0) 200deg, rgba(167,243,208,.45) 290deg, rgba(14,116,144,0) 360deg); animation: orni-glow-spin 22s linear infinite reverse; }
.orni-glow--sm { inset: -5px; border-radius: 12px; }
.orni-glow--sm::before, .orni-glow--sm::after { filter: blur(5px); }
:where(.dark) .orni-glow { border-radius: 9999px; }
:where(.dark) span:has(> .orni-glow) + span [role='img'][style*='background'] { background: transparent !important; }
@media (prefers-reduced-motion: reduce) { .orni-glow, .orni-glow::before, .orni-glow::after { animation: none; } }
`;

/**
 * Mantém a luz contínua entre páginas: toda animação de um `.orni-glow` novo passa a contar do início da página
 * (`startTime = 0`), então o brilho de cada página nova continua exatamente de onde o anterior estava.
 */
function syncGlow() {
  document.querySelectorAll<HTMLElement>('.orni-glow').forEach((el) => {
    el.getAnimations?.({ subtree: true }).forEach((a) => {
      if (a.startTime !== 0) a.startTime = 0;
    });
  });
}
if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncGlow();
    });
  };
  const start = () => {
    new MutationObserver((records) => {
      for (const r of records)
      for (const n of Array.from(r.addedNodes))
      if (n instanceof HTMLElement && (n.matches('.orni-glow') || n.querySelector('.orni-glow'))) return schedule();
    }).observe(document.body, { childList: true, subtree: true });
    schedule();
  };
  if (document.body) start();else
  window.addEventListener('DOMContentLoaded', start, { once: true });
}

/** Injects the glow keyframes (identical copies are harmless). */
export function OrniGlowStyles() {
  return <style>{GLOW_CSS}</style>;
}

type OrniMarkProps = {
  /** Height of the symbol in px (the light tile adds ~26%) */
  height?: number;
  /** Brighter glow for a moment (e.g. while the assistant starts or answers) */
  boost?: boolean;
  className?: string;
};

/** Orniplaty platypus symbol on its light tile (transparent in dark mode), with the same glow as the main logo. */
export function OrniMark({ height = 22, boost = false, className = '' }: OrniMarkProps) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[opacity,filter] duration-700 ease-out"
        style={{ opacity: boost ? 1 : 0.85, filter: boost ? 'brightness(1.15) saturate(1.25)' : 'none' }}>
        
        <span className="orni-glow orni-glow--sm" />
      </span>
      <span className="relative z-[1] inline-flex">
        <Logo variant="mark" withTile height={height} />
      </span>
    </span>);

}