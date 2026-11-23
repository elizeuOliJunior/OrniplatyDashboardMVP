/** Copy of the design system Modal (not installed in this project), renamed AppModal. G5 P8: cores e raios por token do DS v3.18 (lógica sem mudança).
 * L13 (17/11/2026, DS 4.9): a cópia acompanha o `Modal` do design system em duas props:
 *  - `dismissToasts` (aqui ligado por padrão): ao abrir, fecha os toasts abertos com `dismissAllToasts()` do DS, para
 *    nenhum toast ficar por cima do título da janela.
 *  - `anchor="top"`: no computador a janela fica presa pelo topo (64px), como `Modal anchor="top"`. No celular continua
 *    embaixo, como era (o `Modal` do DS sobe para o topo no celular; ver correcao-L13).
 * L24b (18/11/2026, pedido 6 do Christian; DS 6.2 › `Modal` rodapé `row`): o rodapé segue o padrão novo do DS. Botões
 *    numa linha, com a largura deles, à direita, o principal por último (ordem do código); quebram só quando não cabem;
 *    só um botão sozinho no celular ocupa a largura toda. Antes: no celular, empilhados e esticados (principal em cima);
 *    no computador, largura mínima de 120 px por botão.
 * RV2B (19/11/2026, DS 6.3/6.4 › `actionGroupClass`): botões soltos passados em `footer` (fragmento, lista ou um
 *    `Button`) entram num grupo com a receita ÚNICA do design system (a mesma do `Modal` do DS e do `ModalActions`).
 *    Quando cabem: uma linha à direita, como antes. Quando não cabem: linhas na ordem do código, cada uma fechada nas duas
 *    bordas. Um `ModalActions` (ou um bloco que contém um) não é embrulhado de novo: ocupa a largura toda, para a ação
 *    `start` ficar na borda esquerda. Qualquer outro rodapé (ex.: `ModalActions equal`, rodapés feitos à mão) continua
 *    como antes: largura toda no celular e largura do conteúdo no computador.
 * CONTRATO NOVO (janela de tamanho único, 23/11/2026; lote SC1b): `steadyHeight` (desligada por padrão) dá à janela UMA
 *    altura fixa, a mesma em todas as abas: a máxima que a janela já permite na tela, com teto de 720 px. Título e
 *    rodapé ficam parados e só o miolo rola; texto de motivo ou aviso no rodapé tira espaço do miolo, não muda a altura.
 *    Ligada só em "Novo/Editar serviço" e "Novo/Editar profissional". OPÇÃO LOCAL DO PAINEL: ainda não existe no `Modal`
 *    do design system (pendência para a próxima publicação do DS).
 * CONTRATO NOVO (janela coberta, 23/11/2026; lote SC2c): `covered` (desligada por padrão) esconde a janela enquanto outra
 *    abre por cima dela (ex.: "Cadastrar cliente", "Cadastrar serviço", "Vender pacote", "Cadastrar turma") SEM esquecer
 *    o estado de quando ela abriu. Antes, quem usava passava `open={false}` e, ao voltar, a janela tirava uma foto nova do
 *    formulário já preenchido: o aviso de alterações não salvas sumia. Com `covered`, a foto de abertura volta junto com a
 *    janela, e o que foi preenchido antes (ou escolhido no cadastro) continua contando como alteração. Sem `covered`, nada
 *    muda. Local do Painel, ainda não existe no design system.
 * CONTRATO NOVO (foco no primeiro campo, 23/11/2026; lote SC3): `initialFocus="field"` (padrão `"first"`, como sempre) abre a
 *    janela com o cursor no primeiro campo de texto ou lista do miolo, em vez do primeiro botão (o X). Sem campo, faz o de
 *    sempre. Título, leitor de tela, Esc, Tab preso e foco de volta ao fechar não mudam. Ligada só em "Nova área de
 *    atuação". Local do Painel, ainda não existe no design system.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangleIcon, XIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { askToDiscard, useDirtyForm } from '../../data/dirtyGuard';
import { Button, actionGroupClass, dismissAllToasts } from '../Card';

export type AppModalSize = 'sm' | 'md' | 'lg';
export type AppModalTone = 'default' | 'danger';

export interface AppModalProps {
  /** Controls visibility */
  open: boolean;
  /** Called on overlay click (if enabled), Escape, close button or a dismiss button of the footer */
  onClose: () => void;
  /** Dialog heading */
  title: React.ReactNode;
  /** Optional supporting text under the title */
  description?: React.ReactNode;
  /** Body content (forms, details) */
  children?: React.ReactNode;
  /** Footer actions. Botões soltos (fragmento) entram no grupo de ações do DS; vários com `start` usam <ModalActions>. */
  footer?: React.ReactNode;
  /** Width preset */
  size?: AppModalSize;
  /** `danger` shows a warning icon — use for destructive confirmations */
  tone?: AppModalTone;
  /** Close when the backdrop is clicked (default false: only the buttons, the X or Escape close the dialog) */
  closeOnOverlayClick?: boolean;
  /** Hide the top-right close button. Também desliga o Esc (usado enquanto uma operação está em andamento). */
  hideCloseButton?: boolean;
  /** Render into document.body via portal (default true) */
  usePortal?: boolean;
  /**
   * Proteção de alterações não salvas (padrão: ligada). Se algum campo mudou desde a abertura, fechar pelo X, pelo Esc, pelo
   * fundo ou por um botão de dispensar abre o aviso (Continuar editando / Descartar e fechar). Salvar não pede confirmação.
   * Desligue só em modal cujos campos já se aplicam na hora.
   */
  unsavedGuard?: boolean;
  /** fecha sem animação de saída: desmonta na hora; use em avisos que disparam navegação */
  instantClose?: boolean;
  /**
   * Lote F (22/10/2026): estado do formulário para comparar no lugar dos campos da tela. Use em janela com ABAS: o
   * `TabsContent` do design system desmonta a aba escondida e a aba escolhida muda `aria-selected`, então só trocar de aba
   * contava como alteração (aviso falso ao fechar). Com `dirtyValue`, só muda o que a pessoa editou.
   */
  dirtyValue?: unknown;
  /** L13 (DS 4.9, `Modal anchor`): `top` = no computador, presa pelo topo (não pula quando aparecem campos). Padrão `center`. */
  anchor?: 'center' | 'top';
  /** L13 (DS 4.9, `Modal dismissToasts`): ao abrir, fecha os toasts abertos. Padrão `true` no Painel. */
  dismissToasts?: boolean;
  /**
   * CONTRATO NOVO (janela de tamanho único, 23/11/2026): altura fixa, igual em todas as abas (máxima da tela, teto 720 px);
   * só o miolo rola. Padrão `false`. Local do Painel, ainda não existe no design system.
   */
  steadyHeight?: boolean;
  /**
   * CONTRATO NOVO (janela coberta, 23/11/2026; lote SC2c): `true` = a janela fica escondida enquanto outra está aberta por
   * cima dela, e volta comparando com o estado de quando abriu (o aviso de alterações não salvas não zera). Padrão `false`.
   */
  covered?: boolean;
  /**
   * CONTRATO NOVO (foco no primeiro campo, 23/11/2026; lote SC3): `field` = ao abrir, o cursor vai para o primeiro campo do
   * miolo (input, textarea ou select ativo); sem campo, o primeiro item focável, como antes. Padrão `first` (o de sempre).
   */
  initialFocus?: 'first' | 'field';
  className?: string;
}

const sizeClasses: Record<AppModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl'
};

/** SC3 (`initialFocus="field"`): campos que recebem o cursor ao abrir. */
const FIELD_FOCUS = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea:not([disabled]), select:not([disabled])';

const FOCUSABLE =
'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Pilha dos AppModals abertos (ordem de abertura). Só o do topo reage ao Esc. A pilha muda quando `open` muda, não quando a
 * animação de saída termina: um modal fechando (ainda no DOM com opacidade 0) não bloqueia o Esc do modal de baixo.
 */
const openModalStack: object[] = [];

/**
 * Botões do rodapé que só fecham o modal: marque com `data-dismiss` (preferido) ou use exatamente um destes textos
 * (convenção antiga, mantida por compatibilidade).
 */
const DISMISS_LABEL = /^(Cancelar|Voltar|Fechar)$/i;
const isDismissButton = (btn: HTMLElement) => btn.hasAttribute('data-dismiss') || DISMISS_LABEL.test((btn.textContent || '').trim());

/**
 * RV2B: o rodapé é feito de botões soltos? (fragmento `<>…</>`, lista, ou um `Button` sozinho). Esses entram no grupo de
 * ações do DS. Um elemento que não é `Button` (ex.: `<ModalActions>`, um bloco feito à mão) é usado como veio.
 */
const isLooseFooter = (node: React.ReactNode) =>
Array.isArray(node) || React.isValidElement(node) && (node.type === React.Fragment || node.type === Button);

/**
 * RV2B: classes do contêiner do rodapé. Antes: `[&>*:only-child]:w-full sm:[&>*:only-child]:w-auto` para QUALQUER filho
 * único. Isso esticava o grupo de ações no celular (desfazia a receita) e, no computador, encolhia o `ModalActions` (a
 * ação `start` ficava colada nos outros botões). Agora a regra antiga vale só para os outros rodapés (`ModalActions equal`
 * e os feitos à mão), que continuam iguais: não vale para o grupo (`data-action-group`) nem para o `ModalActions` ou um
 * bloco que contém um (`data-modal-actions`).
 */
const FOOTER_CLASS =
'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-6 py-4 ' +
'[&>:only-child:not([data-action-group])]:w-full ' +
'sm:[&>:only-child:not([data-action-group]):not([data-modal-actions]):not(:has([data-modal-actions]))]:w-auto';

/**
 * Assinatura do que a pessoa pode ter editado: valores de campos, estados marcados (pills, abas, switches) e o rótulo dos
 * seletores. Mensagens de erro e textos não entram, então tentar salvar com campo vazio não conta como alteração.
 */
function formSignature(root: HTMLElement) {
  const parts: string[] = [];
  root.querySelectorAll('input, textarea, select').forEach((el, i) => {
    const e = el as HTMLInputElement;
    if (e.type === 'hidden' || e.type === 'file' || e.closest('[data-guard-ignore]')) return;
    parts.push(`${i}:${e.type === 'checkbox' || e.type === 'radio' ? String(e.checked) : e.value}`);
  });
  root.querySelectorAll('[aria-pressed], [aria-checked], [aria-selected]').forEach((el, i) => {
    if (el.closest('[data-guard-ignore]')) return;
    parts.push(`s${i}:${el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked') ?? el.getAttribute('aria-selected')}`);
  });
  root.querySelectorAll('button[aria-haspopup]').forEach((el, i) => {
    if (el.closest('[data-guard-ignore]')) return;
    parts.push(`p${i}:${(el.textContent || '').trim()}`);
  });
  return parts.join('|');
}

export function AppModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  tone = 'default',
  closeOnOverlayClick = false,
  hideCloseButton = false,
  usePortal = true,
  unsavedGuard = true,
  instantClose = false,
  dirtyValue,
  anchor = 'center',
  dismissToasts = true,
  steadyHeight = false,
  covered = false,
  initialFocus = 'first',
  className
}: AppModalProps) {
  // CONTRATO NOVO (janela coberta, SC2c): `shown` = aberta e sem outra janela por cima. Sem `covered`, é o mesmo que `open`.
  const shown = open && !covered;
  /** SC2c: foto do formulário guardada enquanto a janela está coberta (volta quando ela reaparece). */
  const heldBaseline = useRef<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const guardId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const baseline = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [changed, setChanged] = useState(false);
  const dirtyValueRef = useRef(dirtyValue);
  dirtyValueRef.current = dirtyValue;
  const snapshot = useCallback(() => {
    if (dirtyValueRef.current !== undefined) return JSON.stringify(dirtyValueRef.current);
    return bodyRef.current ? formSignature(bodyRef.current) : null;
  }, []);

  // L13 (DS 4.9): abrir a janela fecha os toasts abertos (eles ficavam por cima do título).
  useEffect(() => {
    if (shown && dismissToasts) dismissAllToasts();
  }, [shown, dismissToasts]);

  const dirtyNow = useCallback(() => {
    if (!shown || !unsavedGuard || baseline.current === null || !bodyRef.current) return false;
    return snapshot() !== baseline.current;
  }, [shown, unsavedGuard, snapshot]);

  // Foto do formulário logo depois da abertura (o modal já inicializou os campos) e comparação periódica
  // SC2c: ao ser coberta, guarda a foto; ao reaparecer (ainda aberta), usa a foto guardada em vez de tirar outra.
  useEffect(() => {
    if (!open) heldBaseline.current = null;else
    if (covered && baseline.current !== null) heldBaseline.current = baseline.current;
    baseline.current = null;
    setChanged(false);
    if (!shown || !unsavedGuard) return;
    const held = heldBaseline.current;
    heldBaseline.current = null;
    if (held !== null) baseline.current = held;
    const t =
    held !== null ?
    undefined :
    window.setTimeout(() => {
      if (bodyRef.current) baseline.current = snapshot();
    }, 300);
    const iv = window.setInterval(() => setChanged(dirtyNow()), 250);
    return () => {
      if (t !== undefined) window.clearTimeout(t);
      window.clearInterval(iv);
    };
  }, [shown, open, covered, unsavedGuard, dirtyNow]);

  // Enquanto há alterações, menu/abas/Voltar do navegador também passam pelo aviso
  useDirtyForm(guardId, shown && changed, { discard: () => onCloseRef.current() });

  /** Fechar pelo X, pelo Esc, pelo fundo ou por um botão de dispensar: pergunta antes se há alterações. */
  const requestClose = () => {
    if (dirtyNow()) askToDiscard(() => onCloseRef.current());else
    onCloseRef.current();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const hideCloseRef = useRef(hideCloseButton);
  hideCloseRef.current = hideCloseButton;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  useEffect(() => {
    if (!shown) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const stackToken = {};
    openModalStack.push(stackToken);

    // Block page scroll behind the dialog without touching body overflow
    // (changing body overflow breaks the sticky sidebar in the preview).
    const root = rootRef.current;
    const blockScroll = (e: Event) => {
      const body = bodyRef.current;
      if (body && body.contains(e.target as Node) && body.scrollHeight > body.clientHeight) return;
      e.preventDefault();
    };
    root?.addEventListener('wheel', blockScroll, { passive: false });
    root?.addEventListener('touchmove', blockScroll, { passive: false });

    const raf = requestAnimationFrame(() => {
      // SC3: com `initialFocus="field"`, o primeiro campo do miolo; sem campo (ou padrão), o primeiro focável, como antes.
      const field = initialFocusRef.current === 'field' ? bodyRef.current?.querySelector<HTMLElement>(FIELD_FOCUS) : null;
      const first = field ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      // Esc (decisão O08/FD4): mesmo caminho do X, com o aviso de alterações não salvas. Desligado enquanto o X está oculto.
      // Só o modal do topo da pilha reage, e nunca quando um popover/menu aberto dentro dele já tratou a tecla.
      if (e.key === 'Escape') {
        if (e.defaultPrevented || hideCloseRef.current) return;
        if (openModalStack[openModalStack.length - 1] !== stackToken) return;
        e.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      const idx = openModalStack.indexOf(stackToken);
      if (idx >= 0) openModalStack.splice(idx, 1);
      root?.removeEventListener('wheel', blockScroll);
      root?.removeEventListener('touchmove', blockScroll);
      previousFocus.current?.focus?.();
    };
  }, [shown]);

  // L13: `anchor="top"` = mesmas medidas do `Modal anchor="top"` do DS no computador (64px do topo, altura até 100vh-5rem).
  const top = anchor === 'top';
  const body = shown &&
  <div
    key="app-modal-root"
    ref={rootRef}
    data-anchor={top ? 'top' : undefined}
    className={`fixed inset-0 z-[60] flex items-end justify-center p-4 ${top ? 'sm:items-start sm:pt-16' : 'sm:items-center'}`}>
    
          <motion.div
      aria-hidden="true"
      className="absolute inset-0 bg-overlay/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={(e) => {
        // Clicks on the backdrop never reach the dashboard behind it
        e.stopPropagation();
        if (closeOnOverlayClick) requestClose();
      }} />
    
          <motion.div
      ref={panelRef}
      role={tone === 'danger' ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      tabIndex={-1}
      className={twMerge(
        'relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-card bg-white shadow-xl ring-1 ring-focus-ring/5 focus:outline-none',
        top && 'sm:max-h-[calc(100vh-5rem)]',
        // CONTRATO NOVO (janela de tamanho único, 23/11/2026): mesma altura máxima de sempre, teto 720 px.
        steadyHeight && 'h-[min(720px,calc(100vh-2rem))]',
        steadyHeight && top && 'sm:h-[min(720px,calc(100vh-5rem))]',
        sizeClasses[size],
        className
      )}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
      
            <div className="flex shrink-0 items-start gap-4 px-6 pb-4 pt-6">
              {tone === 'danger' &&
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-background">
                  <AlertTriangleIcon className="h-5 w-5 text-error" aria-hidden="true" />
                </div>
        }
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-bold leading-6 text-text-primary">
                  {title}
                </h2>
                {description &&
          <p id={descId} className="mt-1 text-sm leading-5 text-text-secondary">
                    {description}
                  </p>
          }
              </div>
              {!hideCloseButton &&
        <button
          type="button"
          onClick={requestClose}
          aria-label="Fechar"
          className="-mr-2 -mt-1 rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          
                  <XIcon className="h-5 w-5" aria-hidden="true" />
                </button>
        }
            </div>
            {children &&
      <div
        ref={bodyRef}
        className={twMerge(
          'flex-1 overflow-y-auto overscroll-contain px-6 pb-6 text-sm text-text-secondary',
          // CONTRATO NOVO (janela de tamanho único, 23/11/2026): o espaço da barra de rolagem fica reservado, para o
          // conteúdo não andar para o lado quando uma aba rola e a outra não.
          steadyHeight && 'min-h-0 [scrollbar-gutter:stable]'
        )}>
        
                {children}
              </div>
      }
            {footer &&
      <div
        data-modal-footer=""
        onClickCapture={(e) => {
          // Botão de dispensar com alterações: pergunta antes de fechar (nenhum modal precisa tratar isso)
          const btn = (e.target as HTMLElement).closest('button');
          if (!btn || !isDismissButton(btn) || !dirtyNow()) return;
          e.stopPropagation();
          e.preventDefault();
          askToDiscard(() => onCloseRef.current());
        }}
        className={FOOTER_CLASS}>
        
                {isLooseFooter(footer) ?
        <div data-action-group="" className={actionGroupClass({ fullWidthAloneOnPhone: true })}>
                    {footer}
                  </div> :

        footer
        }
              </div>
      }
          </motion.div>
        </div>;


  const content = instantClose ? body : <AnimatePresence>{body}</AnimatePresence>;

  if (usePortal && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
}