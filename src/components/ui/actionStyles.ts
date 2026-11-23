/**
 * Ações do Painel = botões do design system ORNIPLATY (v2.3). Fonte única: `Button`/`buttonClass` do design system.
 *
 * TAMANHO POR ÁREA (decisão do Christian, 16/10/2026, noite):
 *  - 'lg' 44px → ações do topo da página e rodapé de janelas
 *  - 'md' 36px → botões dentro de cartões, painéis e avisos
 *  - 'sm' 32px → ações dentro de linhas de lista, popovers e menus
 *
 * COR:
 *  - primary   → ação principal da área (1 por tela/janela)
 *  - secondary → ação importante: fundo BRANCO, texto e borda verde-azulados (único botão com contorno)
 *  - neutral   → ação auxiliar (cinza-claro): Lista de espera, Ignorar, Limpar
 *  - dangerSoft → GATILHO de exclusão (vermelho-claro). PADRÃO (decisão do Christian, P8 27/10/2026).
 *                 `dangerOutline` continua aceito como apelido antigo.
 *  - danger    → CONFIRMAR a exclusão (vermelho forte)
 *  - ghost     → mantido só por compatibilidade (= neutral)
 */
import { buttonClass } from '../Card';

export type ActionVariant = 'primary' | 'secondary' | 'neutral' | 'danger' | 'dangerSoft' | 'dangerOutline' | 'ghost';
export type ActionSize = 'sm' | 'md' | 'lg';

export function actionClass(variant: ActionVariant = 'secondary', size: ActionSize = 'sm', opts: {forcedOff?: boolean;} = {}): string {
  return buttonClass(variant, { off: opts.forcedOff, size });
}

/** Gatilho de exclusão (vermelho-claro, `dangerSoft`). Nome antigo mantido para quem importa. */
export const dangerOutline = actionClass('dangerSoft', 'md');
export const dangerOutlineMd = dangerOutline;

/** Legado: deixa um Button com a cara do gatilho de exclusão. Prefira `variant="dangerSoft"`. Hover/clique sem token (valores do Button do DS). */
export const dangerSecondaryClass = 'border-transparent bg-error-background text-error hover:bg-[#FCD3D3] active:bg-[#FAC4C4] focus-visible:ring-error';

/** Tons de fundo + texto. `warning`/`danger` mantêm o texto escuro sem token (#92400E/#991B1B). */
export const toneClass = {
  success: 'bg-success-background text-success-text',
  warning: 'bg-warning-background text-[#92400E]',
  danger: 'bg-error-background text-[#991B1B]',
  neutral: 'bg-surface-muted text-text-neutral',
  primary: 'bg-primary-soft text-primary-hover'
} as const;