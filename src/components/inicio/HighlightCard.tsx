import React from 'react';
import { Link } from 'react-router-dom';
import { HighlightCard as DsHighlightCard } from '../Card';
import { useFollowUpTotals } from '../../data/followUp';
import type { InicioHighlight } from '../../data/inicio';

/**
 * L13 (17/11/2026): OBSOLETO. O Início usa o `HighlightCard` do design system (v4.8) direto, com o número calculado na
 * página. Este arquivo só fica porque a ferramenta não apaga arquivos: repassa para a peça do DS (mesmo desenho) e
 * mantém a conta antiga de Oportunidades para quem ainda importar daqui. Não use em tela nova.
 */
export function HighlightCard({ highlight }: {highlight: InicioHighlight;}) {
  const totals = useFollowUpTotals();
  const derived = highlight.id === 'oportunidades';
  const value = derived ? String(totals.precisa) : highlight.value;
  const support = derived ? totals.precisa === 1 ? 'cliente precisa de você' : 'clientes precisam de você' : highlight.support;
  return (
    <DsHighlightCard
      label={highlight.label}
      value={value}
      support={support}
      actionLabel={highlight.actionLabel}
      accent={highlight.accent}
      as={Link}
      linkProps={{ to: highlight.path }} />);


}