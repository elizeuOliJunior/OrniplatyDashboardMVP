import { useEffect } from 'react';

/**
 * T1 1k (05/11/2026): camada de MODO NOTURNO para as cores FIXAS (hex) das peças locais (rascunho v3.19, Conversas e
 * telas antigas). As cores do DS já vêm de variáveis e mudam em index.css (`.dark { --surface … }`).
 *
 * Como funciona: observa as classes que aparecem na tela (ex.: `bg-[#E0F2F5]`, `hover:bg-[#F1F5F5]`, `text-[#0B2B2A]`,
 * `bg-white`) e cria, uma vez por classe, a regra equivalente só para `.dark`:
 * - fundo claro (luminosidade ≥ 80 %) vira um tom escuro da mesma cor (ex.: verde-claro → verde-escuro);
 * - texto escuro (≤ 50 %) vira um tom claro da mesma cor;
 * - borda clara (≥ 70 %) vira uma borda escura;
 * - cores médias e saturadas (botões, bolinhas de status) ficam como estão;
 * - cores do WhatsApp têm valor próprio (fundo da conversa e balão enviado iguais aos tokens escuros).
 * Os seletores usam `:where(.dark)` para não ganhar das variações de passar o mouse do próprio Tailwind.
 *
 * T1 1m (05/11/2026, Christian: cartão do Início ficava BRANCO ao passar o mouse no escuro). Causa: o cartão
 * interativo do DS usa `group-hover:!bg-[#F8FAFA]` (com "!" = importante) e `group-active:`, que esta camada ignorava.
 * Agora ela entende também:
 * - o "!" (antes ou depois da classe), repetindo o `!important` na regra escura;
 * - `group-*` e `peer-*` (hover, active, focus, focus-visible, focus-within, disabled, checked);
 * - prefixos de tela (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`, `max-sm:`, `max-md:`, `max-lg:`), com `@media`;
 * - cores com nome do Tailwind (`bg-gray-50`, `hover:bg-slate-100`…), além de hex e `white`;
 * - cor escrita direto no elemento (`style`):
 *   - fundo claro vira escuro (ex.: trilho das barras de Resultados › Recebimentos);
 *   - degradê com cor clara vira degradê escuro (ex.: esmaecido à direita das abas de Configurações no celular);
 *   - imagem com máscara (o nome "Orniplaty" do topo no celular) pintada de escuro vira clara. Pintada de branco
 *     (o menu lateral) fica como está.
 * PROTÓTIPO: no DS v3.19 as peças devem usar variáveis (tokens) e esta camada some.
 */

type Prop = 'bg' | 'text' | 'border' | 'ring' | 'divide' | 'outline' | 'fill' | 'stroke' | 'placeholder';

const PALETTE_NAMES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTIL = new RegExp(
  `^(bg|text|border(?:-[trblxy])?|ring|divide|outline|fill|stroke|placeholder)-(?:\\[#([0-9a-fA-F]{3,8})\\]|(white)|(${PALETTE_NAMES})-(50|100|200|300|400|500|600|700|800|900|950))(?:\\/(\\d{1,3}|\\[[\\d.]+\\]))?$`
);

/** Tons do Tailwind usados como cor fixa (só os claros e escuros importam aqui; os médios ficam como estão). */
const TW: Record<string, Record<string, string>> = {
  slate: { 50: 'F8FAFC', 100: 'F1F5F9', 200: 'E2E8F0', 300: 'CBD5E1', 400: '94A3B8', 500: '64748B', 600: '475569', 700: '334155', 800: '1E293B', 900: '0F172A', 950: '020617' },
  gray: { 50: 'F9FAFB', 100: 'F3F4F6', 200: 'E5E7EB', 300: 'D1D5DB', 400: '9CA3AF', 500: '6B7280', 600: '4B5563', 700: '374151', 800: '1F2937', 900: '111827', 950: '030712' },
  zinc: { 50: 'FAFAFA', 100: 'F4F4F5', 200: 'E4E4E7', 300: 'D4D4D8', 400: 'A1A1AA', 500: '71717A', 600: '52525B', 700: '3F3F46', 800: '27272A', 900: '18181B', 950: '09090B' },
  neutral: { 50: 'FAFAFA', 100: 'F5F5F5', 200: 'E5E5E5', 300: 'D4D4D4', 400: 'A3A3A3', 500: '737373', 600: '525252', 700: '404040', 800: '262626', 900: '171717', 950: '0A0A0A' },
  stone: { 50: 'FAFAF9', 100: 'F5F5F4', 200: 'E7E5E4', 300: 'D6D3D1', 400: 'A8A29E', 500: '78716C', 600: '57534E', 700: '44403C', 800: '292524', 900: '1C1917', 950: '0C0A09' },
  red: { 50: 'FEF2F2', 100: 'FEE2E2', 200: 'FECACA', 700: 'B91C1C', 800: '991B1B', 900: '7F1D1D' },
  orange: { 50: 'FFF7ED', 100: 'FFEDD5', 200: 'FED7AA', 700: 'C2410C', 800: '9A3412', 900: '7C2D12' },
  amber: { 50: 'FFFBEB', 100: 'FEF3C7', 200: 'FDE68A', 700: 'B45309', 800: '92400E', 900: '78350F' },
  yellow: { 50: 'FEFCE8', 100: 'FEF9C3', 200: 'FEF08A', 700: 'A16207', 800: '854D0E', 900: '713F12' },
  lime: { 50: 'F7FEE7', 100: 'ECFCCB', 200: 'D9F99D', 700: '4D7C0F', 800: '3F6212', 900: '365314' },
  green: { 50: 'F0FDF4', 100: 'DCFCE7', 200: 'BBF7D0', 700: '15803D', 800: '166534', 900: '14532D' },
  emerald: { 50: 'ECFDF5', 100: 'D1FAE5', 200: 'A7F3D0', 700: '047857', 800: '065F46', 900: '064E3B' },
  teal: { 50: 'F0FDFA', 100: 'CCFBF1', 200: '99F6E4', 700: '0F766E', 800: '115E59', 900: '134E4A' },
  cyan: { 50: 'ECFEFF', 100: 'CFFAFE', 200: 'A5F3FC', 700: '0E7490', 800: '155E75', 900: '164E63' },
  sky: { 50: 'F0F9FF', 100: 'E0F2FE', 200: 'BAE6FD', 700: '0369A1', 800: '075985', 900: '0C4A6E' },
  blue: { 50: 'EFF6FF', 100: 'DBEAFE', 200: 'BFDBFE', 700: '1D4ED8', 800: '1E40AF', 900: '1E3A8A' },
  indigo: { 50: 'EEF2FF', 100: 'E0E7FF', 200: 'C7D2FE', 700: '4338CA', 800: '3730A3', 900: '312E81' },
  violet: { 50: 'F5F3FF', 100: 'EDE9FE', 200: 'DDD6FE', 700: '6D28D9', 800: '5B21B6', 900: '4C1D95' },
  purple: { 50: 'FAF5FF', 100: 'F3E8FF', 200: 'E9D5FF', 700: '7E22CE', 800: '6B21A8', 900: '581C87' },
  fuchsia: { 50: 'FDF4FF', 100: 'FAE8FF', 200: 'F5D0FE', 700: 'A21CAF', 800: '86198F', 900: '701A75' },
  pink: { 50: 'FDF2F8', 100: 'FCE7F3', 200: 'FBCFE8', 700: 'BE185D', 800: '9D174D', 900: '831843' },
  rose: { 50: 'FFF1F2', 100: 'FFE4E6', 200: 'FECDD3', 700: 'BE123C', 800: '9F1239', 900: '881337' }
};

/** Cores com valor escuro definido à mão (o cálculo automático deixaria marrom/oliva). */
const FIXED: Record<string, Partial<Record<Prop, string>>> = {
  ECE5DD: { bg: 'var(--whatsapp-background)' },
  D9FDD3: { bg: 'var(--whatsapp-outgoing)', border: 'var(--whatsapp-outgoing)' }
};

const PSEUDO: Record<string, string> = {
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  'focus-within': ':focus-within',
  active: ':active',
  disabled: ':disabled',
  checked: ':checked',
  first: ':first-child',
  last: ':last-child',
  odd: ':nth-child(odd)',
  even: ':nth-child(even)',
  placeholder: '::placeholder',
  'aria-selected': '[aria-selected="true"]',
  'aria-pressed': '[aria-pressed="true"]',
  'aria-current': '[aria-current]',
  'aria-expanded': '[aria-expanded="true"]',
  'data-[state=open]': '[data-state="open"]',
  'data-[state=active]': '[data-state="active"]',
  'data-[state=checked]': '[data-state="checked"]'
};

/** Estados de `group-*` / `peer-*` (o pai ou o irmão anterior). */
const RELATIVE: Record<string, string> = {
  hover: ':hover',
  active: ':active',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  'focus-within': ':focus-within',
  disabled: ':disabled',
  checked: ':checked',
  'aria-selected': '[aria-selected="true"]',
  'aria-pressed': '[aria-pressed="true"]',
  'aria-expanded': '[aria-expanded="true"]',
  'data-[state=open]': '[data-state="open"]'
};

/** Prefixos de tela do Tailwind (padrão). */
const SCREENS: Record<string, string> = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
  'max-sm': '(max-width: 639.98px)',
  'max-md': '(max-width: 767.98px)',
  'max-lg': '(max-width: 1023.98px)',
  'max-xl': '(max-width: 1279.98px)'
};

/** Divide pelos ":" que não estão dentro de colchetes. */
function splitVariants(token: string) {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of token) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ':' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

type RGB = {r: number;g: number;b: number;};

function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
}
function rgbToHsl({ r, g, b }: RGB) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

/** Fundo claro (≥ 80 %) → tom escuro da mesma cor. */
function darkBgOfRgb(rgb: RGB): string | null {
  const { h, s, l } = rgbToHsl(rgb);
  return l >= 0.8 ? hsl(h, Math.min(s, 0.42), 0.1 + (1 - l) * 0.85) : null;
}
/** Tinta escura (≤ 50 %) → tom claro da mesma cor (texto, ícone, imagem com máscara). */
function lightInkOfRgb(rgb: RGB): string | null {
  const { h, s, l } = rgbToHsl(rgb);
  return l <= 0.5 ? hsl(h, Math.min(s, 0.6), 0.92 - l * 0.5) : null;
}

/** Cor escura equivalente (ou null = manter). */
function darkOf(hex: string, prop: Prop): string | null {
  const fixed = FIXED[hex.toUpperCase()]?.[prop];
  if (fixed) return fixed;
  const rgb = hexToRgb(hex);
  if (prop === 'bg') return darkBgOfRgb(rgb);
  if (prop === 'text' || prop === 'placeholder' || prop === 'fill' || prop === 'stroke') return lightInkOfRgb(rgb);
  const { h, s, l } = rgbToHsl(rgb);
  return l >= 0.7 ? hsl(h, Math.min(s, 0.38), 0.17 + (1 - l) * 0.6) : null;
}

function withAlpha(color: string, alpha?: string) {
  if (!alpha) return color;
  const a = alpha.startsWith('[') ? Number(alpha.slice(1, -1)) : Number(alpha) / 100;
  if (!Number.isFinite(a)) return color;
  return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
}

const PROPS: Record<string, string> = {
  bg: 'background-color',
  text: 'color',
  border: 'border-color',
  'border-t': 'border-top-color',
  'border-b': 'border-bottom-color',
  'border-l': 'border-left-color',
  'border-r': 'border-right-color',
  'border-x': 'border-left-color',
  'border-y': 'border-top-color',
  ring: '--tw-ring-color',
  divide: 'border-color',
  outline: 'outline-color',
  fill: 'fill',
  stroke: 'stroke',
  placeholder: 'color'
};

function ruleFor(token: string): string | null {
  const parts = splitVariants(token);
  let util = parts.pop()!;
  // "!" = !important (Tailwind 3 usa antes da classe; o 4, depois).
  let important = false;
  if (util.startsWith('!')) {
    important = true;
    util = util.slice(1);
  } else if (util.endsWith('!')) {
    important = true;
    util = util.slice(0, -1);
  }
  const m = UTIL.exec(util);
  if (!m) return null;
  const [, kind, hex, white, palette, shade, alpha] = m;
  const prop: Prop = (kind.startsWith('border') ? 'border' : kind) as Prop;
  let color: string | null;
  if (white) {
    if (prop !== 'bg') return null;
    color = 'var(--surface)';
  } else if (palette) {
    const h = TW[palette]?.[shade];
    if (!h) return null;
    color = darkOf(h, prop);
  } else color = darkOf(hex, prop);
  if (!color) return null;
  let prefix = '';
  let pseudo = '';
  let suffix = '';
  let media = '';
  for (const v of parts) {
    const rel = /^(group|peer)-(.+)$/.exec(v);
    if (rel && RELATIVE[rel[2]]) {
      if (rel[1] === 'group') prefix += `.group${RELATIVE[rel[2]]} `;else
      prefix += `.peer${RELATIVE[rel[2]]} ~ `;
    } else if (SCREENS[v]) media = media ? `${media} and ${SCREENS[v]}` : SCREENS[v];else
    if (PSEUDO[v]) pseudo += PSEUDO[v];else
    if (v === '[&::-webkit-scrollbar-thumb]') pseudo += '::-webkit-scrollbar-thumb';else
    if (v === '[&>svg]') suffix += ' > svg';else
    return null; // variação desconhecida: deixa como está
  }
  if (prop === 'placeholder') pseudo += '::placeholder';
  if (prop === 'divide') suffix += ' > :not([hidden]) ~ :not([hidden])';
  const imp = important ? ' !important' : '';
  const decls = [`${PROPS[kind]}: ${withAlpha(color, alpha)}${imp}`];
  if (kind === 'border-x') decls.push(`border-right-color: ${withAlpha(color, alpha)}${imp}`);
  if (kind === 'border-y') decls.push(`border-bottom-color: ${withAlpha(color, alpha)}${imp}`);
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(token) : token;
  const rule = `:where(.dark) ${prefix}.${esc}${pseudo}${suffix} { ${decls.join('; ')} }`;
  return media ? `@media ${media} { ${rule} }` : rule;
}

/** A classe pode ter cor fixa que esta camada traduz? (filtro rápido antes do regex) */
const CANDIDATE = new RegExp(`\\[#|white|-(?:${PALETTE_NAMES})-\\d`);

const RGB_IN = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g;

/**
 * Cor escrita no próprio elemento (`style`). Marca o elemento e guarda o tom do escuro em variáveis:
 * - elemento comum com fundo claro → fundo escuro;
 * - imagem com máscara (o fundo é a "tinta" do desenho) pintada de escuro → tinta clara;
 * - degradê com cores claras → as mesmas paradas em tom escuro.
 */
function markInline(el: HTMLElement) {
  const raw = el.style.backgroundColor;
  const img = el.style.backgroundImage;
  const key = `${raw}|${img}`;
  if (el.dataset.orniDarkFrom === key) return;
  el.dataset.orniDarkFrom = key;
  // Fundo sólido
  let dark: string | null = null;
  if (raw) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(raw);
    const rgb = m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
    const masked = /mask/i.test(el.getAttribute('style') ?? '');
    dark = !rgb ? null : masked ? lightInkOfRgb(rgb) : el.querySelector('[style*="mask"]') ? null : darkBgOfRgb(rgb);
  }
  if (dark) {
    el.style.setProperty('--orni-dark-bg', dark);
    el.setAttribute('data-orni-dark-bg', '');
  } else {
    el.style.removeProperty('--orni-dark-bg');
    el.removeAttribute('data-orni-dark-bg');
  }
  // Degradê
  let changed = false;
  const darkImg =
  img && /gradient/.test(img) ?
  img.replace(RGB_IN, (all, r, g, b, a) => {
    const d = darkBgOfRgb({ r: +r, g: +g, b: +b });
    if (!d) return all;
    changed = true;
    return a !== undefined ? `color-mix(in srgb, ${d} ${Math.round(Number(a) * 100)}%, transparent)` : d;
  }) :
  '';
  if (changed) {
    el.style.setProperty('--orni-dark-bgimg', darkImg);
    el.setAttribute('data-orni-dark-bgimg', '');
  } else {
    el.style.removeProperty('--orni-dark-bgimg');
    el.removeAttribute('data-orni-dark-bgimg');
  }
}

export function ThemeHost() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = 'orni-dark-fixed-colors';
    document.head.appendChild(style);
    for (const r of [
    ':where(.dark) [data-orni-dark-bg] { background-color: var(--orni-dark-bg) !important }',
    ':where(.dark) [data-orni-dark-bgimg] { background-image: var(--orni-dark-bgimg) !important }'])
    {
      try {
        style.sheet?.insertRule(r, style.sheet.cssRules.length);
      } catch {

        /* ignora */}
    }
    const done = new Set<string>();
    const scan = () => {
      const rules: string[] = [];
      document.querySelectorAll<HTMLElement>('[class]').forEach((el) => {
        const cls = el.getAttribute('class');
        if (!cls || !CANDIDATE.test(cls)) return;
        for (const t of cls.split(/\s+/)) {
          if (!t || done.has(t) || !CANDIDATE.test(t)) continue;
          done.add(t);
          const r = ruleFor(t);
          if (r) rules.push(r);
        }
      });
      document.querySelectorAll<HTMLElement>('[style*="background"]').forEach(markInline);
      if (!rules.length || !style.sheet) return;
      for (const r of rules) {
        try {
          style.sheet.insertRule(r, style.sheet.cssRules.length);
        } catch {

          /* seletor que o navegador não aceita: ignora */}
      }
    };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scan();
      });
    };
    scan();
    // Só classes e elementos novos: o `style` muda a cada quadro das animações e varrer a tela toda a cada quadro pesa.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      mo.disconnect();
      if (frame) cancelAnimationFrame(frame);
      style.remove();
    };
  }, []);
  return null;
}