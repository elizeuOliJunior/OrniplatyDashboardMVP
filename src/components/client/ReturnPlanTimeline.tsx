import React from 'react';
import { ClientProcess } from '../Card';
import { planTimelineItems } from '../../data/followUp';
import type { ReturnPlan } from '../../data/followUp';
import type { AutomationMode } from '../../data/automacoes';

/**
 * O que a Orniplaty vai fazer com um retorno, em linguagem simples e com datas (ajustes do Lote B, 21/10/2026).
 * Peça do design system: `ClientProcess dateFirst` (v3.12). Usado no Fechar atendimento, no exemplo do serviço
 * (Serviços e equipe › Agenda e retorno) e em Automações › Lembrar o cliente de voltar.
 */
export function ReturnPlanTimeline({ plan, mode, voice = 'plano', className }: {plan: Pick<ReturnPlan, 'messages' | 'modelKind'>;mode: AutomationMode;voice?: 'plano' | 'exemplo';className?: string;}) {
  return <ClientProcess dateFirst className={className} items={planTimelineItems(plan, mode, voice)} />;
}