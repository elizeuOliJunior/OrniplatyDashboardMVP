/**
 * Guarda de alterações não salvas (compartilhada por todo o Painel).
 *
 * Cada formulário editável registra se está "sujo" com `useDirtyForm` (páginas, via `useDraft`). Os MODAIS não precisam
 * fazer nada: o `AppModal` detecta sozinho se algum campo mudou desde a abertura e usa `askToDiscard`.
 * Enquanto algum formulário estiver sujo:
 *  - navegação interna (menu, abas, links, botões) passa por `requestLeave`, que abre o aviso;
 *  - links `#/...` e abas (`role="tab"`) são interceptados aqui mesmo, sem cada tela precisar tratar;
 *  - recarregar ou fechar a aba mostra o aviso nativo do navegador (o texto é do navegador, não dá para trocar);
 *  - o botão Voltar do navegador é interceptado com uma entrada "sentinela" no histórico.
 * Sem alterações, nada disso acontece e nenhum aviso aparece.
 *
 * PÁGINAS: "Descartar alterações" descarta e segue para onde a pessoa clicou; "Salvar e continuar" salva e segue para o
 * mesmo lugar (W9d, A5-20, 12/11/2026: antes era "Salvar e ficar", que salvava e não saía da tela); se o salvamento
 * falhar, fica na tela e o formulário mostra o motivo. "Continuar editando" cancela a navegação e mantém o rascunho.
 * ABAS (19/10/2026): trocar de aba com alterações mostra "Descartar e sair" e "Salvar e sair"; os DOIS levam à aba clicada.
 * Antes, a aba interceptada recebia `requestLeave(() => undefined)` e descartar não levava a lugar nenhum.
 * MODAIS (`askToDiscard`): quem pediu foi o fechamento do próprio modal; "Descartar e fechar" fecha o modal e só ele;
 * "Continuar editando" volta ao modal com tudo como estava.
 *
 * ROLAGEM (16/10/2026): a sentinela entra com `pushState` e sai com `history.back()`. No modo padrão (`auto`) o navegador
 * devolve a rolagem que a página tinha quando a sentinela foi criada (a primeira alteração), e a tela "pulava" ao desfazer
 * uma alteração (ex.: voltar ao tom Humanizada, apagar o que foi digitado). Por isso a entrada da página fica em
 * `scrollRestoration = 'manual'` enquanto a sentinela existe e volta a `auto` quando ela sai. O modo vale por entrada do
 * histórico: precisa ser ligado ANTES do `pushState` (testado no Chrome).
 */
import { useEffect, useRef } from 'react';

type Entry = {dirty: boolean;canSave: boolean;save: () => boolean;discard: () => void;};
type Pending = {
  proceed: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  discardLabel?: string;
  /** Sem efeito desde o W9d (A5-20): "Salvar" SEMPRE segue para o destino. Mantido para quem ainda passa a opção. */
  saveProceeds?: boolean;
  canSave: boolean;
  closeAfter?: boolean;
  forced?: boolean;
  /** Texto extra do aviso quando há janela aberta com alterações que só ela resolve. */
  note?: string;
};

const NOTE_BOTH = 'Salvar guarda o que está na página. A janela aberta tem alterações que só podem ser salvas nela.';
const NOTE_LEFT = 'O que estava na página foi salvo. A janela aberta ainda tem alterações: continue editando nela ou descarte.';

const entries = new Map<string, Entry>();
let pending: Pending | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export function subscribeGuard(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const guardVersion = () => version;
export const getPending = () => pending;

export function isDirty() {
  for (const e of entries.values()) if (e.dirty) return true;
  return false;
}

// ── histórico (botão Voltar) ────────────────────────────────────────────────────────────────────────────────────────────

let installed = false;
let popBound = false;
let sentinel = false;
let ignorePop = 0;

function setScrollRestoration(mode: 'auto' | 'manual') {
  try {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = mode;
  } catch {

    /* navegador sem suporte: segue sem */}
}

function pushSentinel() {
  try {
    setScrollRestoration('manual');
    window.history.pushState({ ...(window.history.state ?? {}), orniGuard: true }, '', window.location.href);
    sentinel = true;
  } catch {
    sentinel = false;
    setScrollRestoration('auto');
  }
}

/** Tira a entrada extra do histórico, sem navegar para lugar nenhum e sem mexer na rolagem. */
function releaseSentinel(done?: () => void) {
  if (!sentinel) {
    done?.();
    return;
  }
  sentinel = false;
  ignorePop += 1;
  let finished = false;
  let gotPop = false;
  const onPop1 = () => {
    gotPop = true;
    finish();
  };
  function finish() {
    if (finished) return;
    finished = true;
    window.removeEventListener('popstate', onPop1);
    if (!gotPop && ignorePop > 0) ignorePop -= 1;
    // De volta à entrada da página: navegação normal volta a restaurar a rolagem.
    setScrollRestoration('auto');
    done?.();
  }
  window.addEventListener('popstate', onPop1);
  window.setTimeout(finish, 300);
  window.history.back();
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!isDirty()) return;
  e.preventDefault();
  e.returnValue = '';
}

function onPop() {
  if (ignorePop > 0) {
    ignorePop -= 1;
    return;
  }
  if (!installed && sentinel && releaseTimer) {
    // Voltar logo depois de ficar sem alterações: a entrada extra é que foi consumida; nada mais a tirar.
    window.clearTimeout(releaseTimer);
    releaseTimer = 0;
    sentinel = false;
    setScrollRestoration('auto');
    return;
  }
  if (!installed || !sentinel) return;
  // O usuário apertou Voltar: a entrada extra foi consumida e a página continua a mesma.
  sentinel = false;
  setScrollRestoration('auto');
  if (!isDirty()) return;
  requestLeave(() => window.history.back(), { onCancel: () => pushSentinel() });
}

const inDialog = (el: Element) => !!el.closest('[role="dialog"],[role="alertdialog"]');

/** Aba de outra seção (não a atual, fora de modais): trocar de aba também é sair da tela editada. */
function foreignTab(target: Element | null) {
  const tab = target && target.closest ? target.closest('[role="tab"]') : null;
  if (!tab || tab.getAttribute('aria-selected') === 'true' || inDialog(tab)) return null;
  return tab as HTMLElement;
}

/** Troca de aba: descartar OU salvar leva à aba clicada (o clique é refeito depois que a guarda sai). */
function leaveToTab(tab: HTMLElement) {
  requestLeave(() => tab.click(), { saveLabel: 'Salvar e sair', discardLabel: 'Descartar e sair', saveProceeds: true });
}

function onClick(e: MouseEvent) {
  if (!isDirty() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const target = e.target as Element | null;
  const tab = foreignTab(target);
  if (tab) {
    e.preventDefault();
    e.stopPropagation();
    leaveToTab(tab);
    return;
  }
  const a = target && target.closest ? target.closest('a[href]') as HTMLAnchorElement | null : null;
  if (!a || a.target === '_blank') return;
  const href = a.getAttribute('href') ?? '';
  if (href.indexOf('#/') !== 0 || href === window.location.hash) return;
  e.preventDefault();
  e.stopPropagation();
  requestLeave(() => {
    window.location.hash = href;
  });
}

/** Abas costumam ativar no mousedown e nas setas do teclado, antes do click. */
function onMouseDown(e: MouseEvent) {
  if (!isDirty() || e.button !== 0) return;
  const tab = foreignTab(e.target as Element | null);
  if (tab) {
    e.preventDefault();
    e.stopPropagation();
    leaveToTab(tab);
  }
}
function onKeyDown(e: KeyboardEvent) {
  if (!isDirty() || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(e.key)) return;
  const t = e.target as Element | null;
  const tab = t && t.closest ? t.closest('[role="tab"]') as HTMLElement | null : null;
  if (!tab || inDialog(tab)) return;
  // Setas movem o foco/ativam outra aba; Enter/Espaço ativam a aba focada se não for a atual
  if ((e.key === 'Enter' || e.key === ' ') && tab.getAttribute('aria-selected') === 'true') return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Enter' || e.key === ' ') {
    leaveToTab(tab);
    return;
  }
  const list = tab.closest('[role="tablist"]');
  const tabs = list ? Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')) : [];
  const i = tabs.indexOf(tab);
  let next = i;
  if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
  if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = tabs.length - 1;
  const dest = tabs[next];
  // G2 (F-037): antes, seta sem outra aba para ir abria um aviso cujo "Descartar" não levava a lugar nenhum (proceed
  // vazio). Agora: só pede para sair quando há uma aba de destino; senão a seta não faz nada.
  if (dest && dest.getAttribute('aria-selected') !== 'true') leaveToTab(dest);
}

/**
 * G2 (F-037): tirar a entrada extra fica para DEPOIS do clique. Quando uma janela com alterações fecha no mesmo clique em
 * que a página fica com alterações (ex.: Conhecimento › Nova pergunta › Adicionar), a entrada era tirada (history.back,
 * assíncrono) e posta de novo; o back chegava depois e, num "Salvar e ficar" (hoje "Salvar e continuar") seguinte, a tela voltava uma página no
 * histórico. Agora a entrada só sai se, passado o clique, continuar tudo sem alterações.
 */
let releaseTimer = 0;
function scheduleRelease() {
  window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    releaseTimer = 0;
    if (!isDirty() && !installed) releaseSentinel();
  }, 80);
}

function sync() {
  const dirty = isDirty();
  if (typeof window === 'undefined') return;
  if (!popBound) {
    popBound = true;
    window.addEventListener('popstate', onPop);
  }
  if (dirty && !installed) {
    window.clearTimeout(releaseTimer);
    releaseTimer = 0;
    installed = true;
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    if (!sentinel) pushSentinel();
  } else if (!dirty && installed) {
    uninstall();
    scheduleRelease();
  }
}

function uninstall() {
  installed = false;
  window.removeEventListener('beforeunload', onBeforeUnload);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('mousedown', onMouseDown, true);
  document.removeEventListener('keydown', onKeyDown, true);
}

// ── API ───────────────────────────────────────────────────────────────────────────────────────────────────────

function setEntry(id: string, entry: Entry) {
  entries.set(id, entry);
  sync();
  emit();
}

function removeEntry(id: string) {
  if (!entries.has(id)) return;
  entries.delete(id);
  sync();
  emit();
}

/**
 * Registra um formulário. `dirty` = há algo diferente do último estado salvo.
 * `save` devolve false quando a validação barra o salvamento (o rascunho é mantido e os erros aparecem);
 * `discard` volta o formulário ao último estado salvo.
 */
export function useDirtyForm(id: string, dirty: boolean, handlers: {save?: () => boolean;discard?: () => void;} = {}) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    setEntry(id, {
      dirty,
      canSave: Boolean(ref.current.save),
      save: () => ref.current.save ? ref.current.save() : true,
      discard: () => ref.current.discard?.()
    });
  }, [id, dirty]);
  useEffect(() => () => removeEntry(id), [id]);
}

/**
 * Navegação de página: executa `proceed` direto se não há alterações; senão abre o aviso, e `proceed` só roda se a
 * pessoa escolher descartar ou salvar. Ver `confirmLeave`.
 */
export function requestLeave(
proceed: () => void,
opts: {onCancel?: () => void;saveLabel?: string;discardLabel?: string;saveProceeds?: boolean;} = {})
{
  if (!isDirty()) {
    proceed();
    return;
  }
  // Já existe um aviso aberto: nunca empilha dois. G2 (F-037): um NOVO pedido de saída de página (ex.: Voltar do
  // navegador ou atalho disparado por código) passa a valer como destino do aviso aberto, com os rótulos dele; antes era
  // ignorado e a pessoa escolhia "Descartar" para um destino que não era o último pedido. O aviso de fechar MODAL
  // (`forced`) não é trocado: ele só fecha a janela.
  if (pending) {
    if (pending.forced) return;
    pending = { ...pending, proceed, onCancel: opts.onCancel, saveLabel: opts.saveLabel, discardLabel: opts.discardLabel, saveProceeds: opts.saveProceeds };
    emit();
    return;
  }
  let canSave = false;
  let unsavable = false;
  entries.forEach((e) => {
    if (e.dirty && e.canSave) canSave = true;
    if (e.dirty && !e.canSave) unsavable = true;
  });
  pending = {
    note: canSave && unsavable ? NOTE_BOTH : undefined,
    proceed,
    onCancel: opts.onCancel,
    saveLabel: opts.saveLabel,
    discardLabel: opts.discardLabel,
    saveProceeds: opts.saveProceeds,
    canSave
  };
  emit();
}

/**
 * Fechamento de MODAL com alterações: abre o aviso só com "Continuar editando" e "Descartar e fechar".
 * `onDiscard` (fechar o modal) roda só se a pessoa escolher descartar.
 */
export function askToDiscard(onDiscard: () => void) {
  if (pending) return;
  pending = { proceed: onDiscard, canSave: false, closeAfter: true, forced: true };
  emit();
}

/** "Continuar editando": fecha o aviso, mantém o rascunho e cancela a navegação pedida. */
export function cancelLeave() {
  const p = pending;
  pending = null;
  emit();
  p?.onCancel?.();
}

/**
 * "Salvar e continuar" (páginas), "Salvar e sair" (troca de aba) e "Salvar e aplicar" (cenário): salva e executa a
 * navegação pedida (`proceed`). W9d (A5-20): antes, nas páginas, "Salvar e ficar" salvava e NÃO navegava.
 * "Descartar": descarta e executa a navegação pedida (`proceed`).
 * Se o salvamento falhar (validação ou erro ao salvar), a navegação é cancelada, o rascunho é mantido e o motivo
 * aparece no próprio formulário.
 */
export function confirmLeave(mode: 'discard' | 'save') {
  const p = pending;
  if (!p) return;
  if (p.forced) {
    // fechamento de modal: só existe "descartar"
    pending = null;
    emit();
    if (mode === 'discard') p.proceed();
    return;
  }
  // G2 (revisão F-031/F-037): só fica "sem alterações" o formulário que foi SALVO ou DESCARTADO de fato. Antes, todos
  // eram marcados limpos depois de salvar pelo aviso, inclusive uma janela por cima (ex.: serviço aberto sobre
  // Conhecimento), que não sabe salvar: a janela continuava com as alterações e a navegação seguinte passava sem aviso.
  const resolved: Entry[] = [];
  if (mode === 'save') {
    let failed = false;
    entries.forEach((e) => {
      if (failed || !e.dirty || !e.canSave) return;
      if (e.save() === false) failed = true;else
      resolved.push(e);
    });
    resolved.forEach((e) => {
      e.dirty = false;
    });
    if (failed) {
      pending = null;
      emit();
      p.onCancel?.();
      return;
    }
    if (isDirty()) {
      // Sobrou rascunho que só pode ser resolvido no próprio formulário (janela aberta). A proteção e a entrada extra do
      // histórico continuam. NÃO segue em silêncio: o aviso volta só para o que sobrou (Continuar editando · Descartar),
      // com o mesmo destino.
      pending = { ...p, canSave: false, note: NOTE_LEFT };
      emit();
      return;
    }
  } else {
    entries.forEach((e) => {
      if (e.dirty) {
        e.discard();
        resolved.push(e);
      }
    });
    resolved.forEach((e) => {
      e.dirty = false;
    });
  }
  // W9d (A5-20): salvar também segue para o destino, em qualquer saída (menu, link, Voltar, aba, cenário).
  const proceed = p.proceed;
  pending = null;
  if (installed) uninstall();
  window.clearTimeout(releaseTimer);
  releaseTimer = 0;
  emit();
  // Seguir para o destino só DEPOIS de tudo acima e da saída do modal de aviso (AppModal, ~180 ms):
  // (1) a remoção da sentinela usa history.back(), assíncrono; `proceed` como callback do releaseSentinel roda após o popstate,
  //     e navegar antes disso faria o back desfazer a navegação nova;
  // (2) `proceed` pode ser só uma troca de seção (re-render da mesma página). Se rodar durante a animação de saída do AppModal,
  //     a saída não termina e a camada do aviso fica invisível e bloqueando a tela. O atraso de 250 ms cobre essa saída.
  releaseSentinel(() => window.setTimeout(proceed, 250));
}

// ── G2 (F-037, IA-22): cenários do seletor de telas × rascunho aberto ───────────────────────────────────────────
// Um cenário do seletor (segmento, pagamento salvo, exemplo do G3, modo de envio) grava direto no cadastro salvo. Antes,
// o rascunho aberto (Empresa, Automações) continuava mostrando o valor antigo e "Salvar" desfazia o cenário. Agora:
// com alterações não salvas, o cenário passa pelo aviso (Continuar editando · Descartar e aplicar · Salvar e aplicar);
// aplicado o cenário, os rascunhos SEM alterações recarregam do cadastro (`useDraft` com `reload`).
let scenarioVersion = 0;
const scenarioListeners = new Set<() => void>();
export const subscribeScenario = (l: () => void) => {
  scenarioListeners.add(l);
  return () => {
    scenarioListeners.delete(l);
  };
};
export const getScenarioVersion = () => scenarioVersion;
export function applyScenario(change: () => void) {
  requestLeave(
    () => {
      change();
      scenarioVersion += 1;
      scenarioListeners.forEach((l) => l());
    },
    { saveLabel: 'Salvar e aplicar', discardLabel: 'Descartar e aplicar', saveProceeds: true }
  );
}