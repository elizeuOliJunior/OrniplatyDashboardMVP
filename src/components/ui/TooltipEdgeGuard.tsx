import { useEffect } from 'react';

/**
 * T1 1f (05/11/2026, Christian: "o (i) de Conversas hoje abre para fora da tela e causa um bug"): guarda GLOBAL das
 * dicas (`role="tooltip"` do Tooltip/InfoTip do DS) para o Painel todo.
 * Quando uma dica aparece perto da borda:
 *  1. dica que abriria para CIMA e encosta em qualquer borda passa a abrir para BAIXO (prioridade pedida);
 *     dica que abriria para baixo e sairia pelo rodapé vai para cima;
 *  2. ela é empurrada para dentro; a setinha continua apontando para o elemento.
 * T1 1j (05/11/2026, Christian: "a dica do botão da ficha fica por baixo da borda e não dá para ler"): além da tela, a
 * conta agora respeita a CAIXA QUE CORTA a dica — qualquer elemento acima dela com rolagem ou conteúdo escondido
 * (`overflow` diferente de visible), como a coluna da conversa. Folga: 16 px da tela, 8 px dentro dessas caixas.
 * A medida usa a caixa do INVÓLUCRO da dica (sem a animação de entrada, que encolhe a dica por alguns quadros).
 * O Tooltip do DS posiciona a dica sem medir nada (por isso estourava). Correção local do Painel; levar ao DS (Tooltip
 * com detecção de borda e de caixa que corta) na v3.19.
 */
const MARGIN = 16;
const INNER = 8;

/** Área onde a dica pode aparecer inteira: a tela menos a folga, cortada por cada ancestral com overflow ≠ visible. */
function visibleBox(el: HTMLElement) {
  let left = MARGIN;
  let top = MARGIN;
  let right = document.documentElement.clientWidth - MARGIN;
  let bottom = window.innerHeight - MARGIN;
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(hidden|auto|scroll|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
      const r = p.getBoundingClientRect();
      left = Math.max(left, r.left + INNER);
      right = Math.min(right, r.right - INNER);
      top = Math.max(top, r.top + INNER);
      bottom = Math.min(bottom, r.bottom - INNER);
    }
  }
  return { left, top, right, bottom };
}

function adjust(tip: HTMLElement) {
  const wrap = tip.parentElement as HTMLElement | null;
  if (!wrap || wrap.dataset.edgeGuard) return;
  wrap.dataset.edgeGuard = '1';
  const arrow = Array.from(tip.children).find((c) => c.getAttribute('aria-hidden') === 'true') as HTMLElement | undefined;
  const box = visibleBox(wrap);
  // Invólucro: tamanho real da dica, sem a escala da animação de entrada.
  const rect = () => wrap.getBoundingClientRect();
  let r = rect();
  const trigger = wrap.parentElement?.getBoundingClientRect();
  const opensUp = wrap.classList.contains('bottom-full');
  const opensDown = wrap.classList.contains('top-full');
  const nearEdge = r.left < box.left || r.right > box.right || r.top < box.top;
  if (opensUp && nearEdge) {
    wrap.style.bottom = 'auto';
    wrap.style.top = '100%';
    wrap.style.marginBottom = '0';
    wrap.style.marginTop = '8px';
    if (arrow) {
      arrow.style.top = '-4px';
      arrow.style.bottom = 'auto';
      arrow.style.marginTop = '0';
    }
    r = rect();
  } else if (opensDown && r.bottom > box.bottom && trigger && r.height + 8 <= trigger.top - box.top) {
    wrap.style.top = 'auto';
    wrap.style.bottom = '100%';
    wrap.style.marginTop = '0';
    wrap.style.marginBottom = '8px';
    if (arrow) {
      arrow.style.bottom = '-4px';
      arrow.style.top = 'auto';
      arrow.style.marginBottom = '0';
    }
    r = rect();
  }
  let dx = 0;
  if (r.right > box.right) dx = box.right - r.right;
  if (r.left + dx < box.left) dx = box.left - r.left;
  if (dx) {
    wrap.style.marginLeft = `${dx}px`;
    if (arrow) {
      // A setinha volta para cima do elemento (anda o contrário da dica), sem sair da dica.
      const limit = Math.max(0, r.width / 2 - 12);
      arrow.style.marginLeft = `${Math.max(-limit, Math.min(limit, -dx))}px`;
    }
  }
}

const later = (tip: HTMLElement) => requestAnimationFrame(() => adjust(tip));

export function TooltipEdgeGuard() {
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.getAttribute('role') === 'tooltip') later(n);else
          n.querySelectorAll<HTMLElement>('[role="tooltip"]').forEach(later);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return null;
}