import React from 'react';
import { StatusBadge } from '../Card';

export type PillTone = 'success' | 'warning' | 'error' | 'info' | 'violet' | 'neutral' | 'muted';

/**
 * Etiqueta de status do Painel = `StatusBadge` do design system ORNIPLATY (v2.3):
 * um tamanho só (28px, texto 14px, bolinha 8px), texto centralizado, NUNCA corta com "…".
 * Textos CURTOS (A confirmar, A fechar, Faltou…). `minWidth="lg"` (7.5rem, do design system) cobre todos os
 * status de agendamento, para a coluna empilhada ficar com uma largura só.
 */
export function StatusPill({
  tone = 'neutral',
  label,
  dot = true,
  minWidth,
  title,
  className







}: {tone?: PillTone;label: string;dot?: boolean;minWidth?: 'md' | 'lg';title?: string;className?: string;}) {
  return <StatusBadge status={tone} label={label} showDot={dot} minWidth={minWidth} title={title} className={className} />;
}