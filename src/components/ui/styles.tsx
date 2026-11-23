/**
 * Estilos de interação compartilhados. Botões com texto vêm do `buttonClass` do design system — esta é a única
 * definição; os atalhos abaixo existem só para links e botões nativos que não podem usar <Button>.
 * Tamanho por área (design system v2.3): linha de lista/menu = 32px, dentro de cartão/aviso = 36px, topo/janela = 44px.
 * G5 P8 (27/10/2026): arquivo IDÊNTICO no Painel e no Onboarding, sem hex. Botão só com ícone = `IconButton` do DS v3.18.
 */
import { buttonClass, iconButtonClass } from '../Card';

const focus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1';

/** Secundário 32px: ações dentro de LINHAS de lista, popovers e menus. */
export const smallButton = buttonClass('secondary', { size: 'sm' });

/** Neutro 32px, para ações auxiliares em linhas de lista, popovers e menus. */
export const smallButtonNeutral = buttonClass('neutral', { size: 'sm' });

/** Secundário 36px: botões DENTRO de cartões, painéis e avisos. */
export const cardButton = buttonClass('secondary', { size: 'md' });

/** Neutro 36px: ações auxiliares dentro de cartões, painéis e avisos. */
export const cardButtonNeutral = buttonClass('neutral', { size: 'md' });

/** Hover for segmented controls built with the design-system Tabs (pills). */
export const pillHover = 'transition-all duration-150 hover:bg-white hover:text-text-primary hover:shadow-sm active:scale-[0.97]';

/** One option of a segmented control (Dia/Semana, Por profissional/Todos juntos). */
export function segmentItem(active: boolean) {
  return `inline-flex h-7 items-center justify-center rounded-md text-xs font-semibold transition-all duration-150 active:scale-[0.97] ${focus} ${
  active ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-white hover:text-text-primary hover:shadow-sm'}`;

}

/**
 * @deprecated Use `<IconButton>` do design system (v3.18). Mantido só para links: classes do `iconButtonClass()` SEM o
 * tamanho (quem usar soma `h-8 w-8` ou `h-9 w-9`). Nenhuma tela usa hoje.
 */
export const iconButton = iconButtonClass().replace(' h-9 w-9', '');

/** @deprecated Use `cardButton`/`cardButtonNeutral` (36px). Mantido: converte um botão de 32px em 36px. */
export const md = (cls: string) => cls.replace('h-8', 'h-9').replace('text-[13px]', 'text-sm').replace('px-3 ', 'px-3.5 ');

/** @deprecated Mesmo botão em 28px. Pela regra v2.3, menus usam 32px (`smallButton`). */
export const xs = (cls: string) => cls.replace('h-8', 'h-7').replace('px-3 ', 'px-2.5 ');

/**
 * For underline tab lists: the active tab's line sits 1px below the list (DS `-mb-px`), and the
 * list's `overflow-x-auto` turned that 1px into a vertical scrollbar. One extra pixel of room and
 * no vertical overflow; horizontal scroll on narrow screens still works.
 *
 * L24b (18/11/2026, pedido 1 do Christian): `pr-0.5`. O sublinhado deslizante do `TabsList` (DS 4.10) é medido em
 * pixels inteiros (posição arredondada e largura arredondada para cima), e a lista `w-fit` tem largura fracionada
 * (ex.: 241,68 px). Com a ÚLTIMA aba escolhida, o sublinhado terminava até ~1 px depois da borda da lista e a
 * `overflow-x-auto` mostrava uma barra de rolagem fina embaixo de abas que cabem (Agenda › "Lista de espera",
 * Clientes › "Pacotes", Resultados, Serviços e equipe). 2 px de folga à direita absorvem o arredondamento; quando as
 * abas não cabem de verdade, a rolagem horizontal continua igual.
 */
export const tabListNoScroll = 'pb-px pr-0.5 overflow-y-hidden';

/** Barra de ferramentas padrão (busca + filtros + ações da lista): numa linha, quebra sem estourar. */
export const toolbarClass = 'flex flex-wrap items-center gap-2';