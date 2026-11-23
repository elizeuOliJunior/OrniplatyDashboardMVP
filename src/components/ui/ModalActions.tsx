import React from 'react';
import { Dropdown, actionGroupClass } from '../Card';

/**
 * Rodapé padrão de TODOS os modais (use dentro de `footer` do AppModal quando houver mais de uma ação).
 * L24b (18/11/2026, pedido 6 do Christian; DS 6.2 › `Modal` rodapé numa linha): os botões ficam numa linha, com a
 * largura deles, à direita, o principal por último (ordem do código). Só descem para uma segunda linha quando não cabem.
 * Só um botão sozinho no celular ocupa a largura toda.
 * RV2B (19/11/2026, DS 6.3/6.4 › `actionGroupClass`): o grupo da direita usa a receita ÚNICA do design system (a mesma do
 * `Modal` do DS). Quando cabe: uma linha à direita, como antes. Quando não cabe: linhas na ordem do código, cada linha
 * fechada nas duas bordas, principal por último. Ordem na tela = ordem no código = ordem do Tab (nada invertido).
 * - `start` = ação à esquerda (ex.: "Arquivar serviço"), FORA do grupo, na borda esquerda (como `footerStart` do `Modal`
 *   do DS). Quando falta espaço, vai sozinha para a primeira linha, na largura dela.
 * - `more` = itens do menu "Mais ações" (primeiro item do grupo; `Dropdown` do DS igual ao rodapé de Oportunidades).
 *   Só por declaração da janela. Ação destrutiva: por último, depois de separador, `variant: 'danger'`.
 * - `equal={n}`: n colunas de largura igual (ex.: aviso de alterações não salvas). Sem mudança no RV2B. RV13 (20/11/2026):
 *   no celular, sem inversão (principal embaixo; ordem na tela = ordem do Tab).
 * Botões: sempre <Button>. Principal = primary, cancelar = secondary, destrutivo = danger/dangerOutline.
 * `data-modal-actions`: o `AppModal` usa para não embrulhar este rodapé uma segunda vez.
 */
type MoreItem = React.ComponentProps<typeof Dropdown>['items'][number];

export function ModalActions({
  children,
  equal,
  start,
  more,
  moreLabel








}: {children: React.ReactNode;equal?: 2 | 3;start?: React.ReactNode; /** RV2B: itens do menu "Mais ações" (primeiro item do grupo). Nenhuma janela usa ainda. */more?: MoreItem[]; /** RV2B: nome do menu para leitor de tela (ex.: "Mais ações para Bruno Costa"). Padrão "Mais ações". */moreLabel?: string;}) {
  if (equal) {
    const btn = '[&_button]:w-full [&_button]:justify-center [&_button]:whitespace-nowrap';
    const grid = equal === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
    return <div className={`flex w-full flex-col gap-2 sm:grid ${grid} ${btn}`}>{children}</div>;
  }
  return (
    <div data-modal-actions="" className="flex w-full flex-wrap items-center gap-2">
      {start && <div className="mr-auto flex flex-wrap items-center gap-2">{start}</div>}
      <div className={actionGroupClass({ fullWidthAloneOnPhone: true })}>
        {more && more.length > 0 &&
        <Dropdown
          portal
          triggerVariant="neutral"
          triggerSize="lg"
          trigger="Mais ações"
          triggerLabel={moreLabel ?? 'Mais ações'}
          align="end"
          maxMenuHeight={320}
          items={more} />

        }
        {children}
      </div>
    </div>);

}