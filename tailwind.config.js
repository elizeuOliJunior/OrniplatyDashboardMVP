export default {content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  /*
   * L18 (17/11/2026): classes da linha do topo do DS 5.1 (`PageHeader placement="topbar"`). O CSS das peças do DS chega
   * ANTES do CSS deste projeto; quando este projeto também usa a classe base (ex.: `grid-cols-1`, `sm:col-span-2`), ela
   * vence a variante que só o DS usa (ex.: `lg:col-span-1`) e a linha do topo desmonta. Listadas aqui, entram no CSS do
   * projeto na ordem certa do Tailwind. Nenhuma classe nova de visual: são as mesmas do DS.
   */
  safelist: [
    'grid',
    'w-full',
    'grid-cols-1',
    'items-center',
    'gap-x-4',
    'gap-y-2',
    'sm:grid-cols-1',
    'sm:grid-cols-[minmax(0,1fr)_auto]',
    'lg:grid-cols-[minmax(0,1fr)_auto]',
    'lg:grid-cols-[minmax(0,1fr)_auto_auto]',
    'sm:col-start-1',
    'sm:col-start-2',
    'sm:row-start-1',
    'sm:row-start-2',
    'sm:col-span-2',
    'sm:justify-end',
    'lg:col-span-1',
    'lg:col-start-2',
    'lg:col-start-3',
    'lg:row-start-1',
    'break-words',
    'leading-5',
    'leading-7',
    'text-xl',
    'text-[13px]',
    // L19: classes que só o `Table stickyHeader` do DS usa (cabeçalho preso de Clientes e Pacotes). O CSS do DS chega antes
    // do CSS do Painel; sem esta lista, `overflow-x-auto` do Painel vence o `sm:overflow-x-clip` do DS e o cabeçalho
    // prende na caixa da tabela em vez da página.
    'sm:overflow-x-clip',
    'sm:sticky',
    'border-separate',
    'border-spacing-0',
    'z-10',
    'shadow-[inset_0_-1px_0_#D7E7E5]',
    '[&>tr+tr>td]:border-t',
    '[&>tr+tr>td]:border-[#D7E7E5]',
    // RV13 (20/11/2026): classes de tamanho base que a 6.5 usa no `Alert` (bloco do texto) e na legenda da rosca. O CSS
    // do DS chega antes; sem esta lista, `.flex-1` do Painel zera o `flex-basis` e no celular o botão do aviso não desce
    // e a legenda fica ao lado da rosca.
    'basis-[264px]',
    'basis-60',
    'basis-[256px]',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-soft': 'var(--primary-soft)',
        'primary-foreground': 'var(--primary-foreground)',
        'sidebar-background': 'var(--sidebar-background)',
        'sidebar-active': 'var(--sidebar-active)',
        'sidebar-text': 'var(--sidebar-text)',
        'logo-tile': 'var(--logo-tile)',
        success: 'var(--success)',
        'success-background': 'var(--success-background)',
        'success-text': 'var(--success-text)',
        'badge-count': 'var(--badge-count)',
        'badge-count-text': 'var(--badge-count-text)',
        warning: 'var(--warning)',
        'warning-background': 'var(--warning-background)',
        'warning-icon': 'var(--warning-icon)',
        'text-neutral': 'var(--text-neutral)',
        'hover-surface': 'var(--hover-surface)',
        'active-surface': 'var(--active-surface)',
        'disabled-surface': 'var(--disabled-surface)',
        'disabled-text': 'var(--disabled-text)',
        error: 'var(--error)',
        'error-background': 'var(--error-background)',
        'whatsapp-background': 'var(--whatsapp-background)',
        'whatsapp-outgoing': 'var(--whatsapp-outgoing)',
        facebook: 'var(--facebook)',
        'professional-carolina': 'var(--professional-carolina)',
        'professional-juliana': 'var(--professional-juliana)',
        'professional-rafael': 'var(--professional-rafael)',
        'spacing-card-padding': 'var(--spacing-card-padding)',
        'radius-card': 'var(--radius-card)',
        'radius-input': 'var(--radius-input)',
        'border-width-default': 'var(--border-width-default)',
        // v3.18: aceitam transparência (bg-overlay/50, ring-focus-ring/10)
        overlay: 'rgb(var(--overlay-rgb) / <alpha-value>)',
        'focus-ring': 'rgb(var(--focus-ring-rgb) / <alpha-value>)'
      },
      // v3.18: raios como classe (rounded-button no lugar de rounded-[var(--radius-button)])
      borderRadius: {
        button: 'var(--radius-button)',
        input: 'var(--radius-input)',
        card: 'var(--radius-card)',
        inner: 'var(--radius-inner)',
        xs: 'var(--radius-xs)'
      },
      // v3.18: número grande de indicador
      fontSize: {
        kpi: ['var(--font-size-kpi)', { lineHeight: '1.2' }]
      },
      // v3.18: ícone médio (h-icon-md w-icon-md)
      spacing: {
        'icon-md': 'var(--size-icon-md)'
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)'
      },
      fontFamily: {
        heading: ['Manrope']
      }
    }
  }
}
