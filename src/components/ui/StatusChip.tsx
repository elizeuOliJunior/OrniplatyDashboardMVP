import React from 'react';
import { StatusPill } from './StatusPill';
import type { PillTone } from './StatusPill';

export type ApptStatus = 'completed' | 'confirmed' | 'pending_confirmation' | 'cancelled' | 'no_show';

const META: Record<ApptStatus, {label: string;tone: PillTone;}> = {
  // Decisões do Christian (16/10/2026): Confirmado verde, Concluído neutro; textos curtos (v2.3).
  completed: { label: 'Concluído', tone: 'neutral' },
  confirmed: { label: 'Confirmado', tone: 'success' },
  pending_confirmation: { label: 'A confirmar', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'error' },
  no_show: { label: 'Faltou', tone: 'muted' }
};

export const apptStatusLabel = (s: string) => META[s as ApptStatus]?.label ?? s;

/**
 * Etiqueta de status de agendamento: StatusPill com largura mínima fixa (7.5rem), para que Início, Agenda (Dia/Semana/Mês)
 * e detalhes mostrem o mesmo tamanho e o rótulo completo.
 */
export function AppointmentStatusChip({ status, className = '' }: {status: string;className?: string;}) {
  const m = META[status as ApptStatus] ?? META.confirmed;
  return <StatusPill tone={m.tone} label={m.label} minWidth="lg" className={className} />;
}