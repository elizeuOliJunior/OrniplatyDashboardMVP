import React from 'react';
import { Alert } from '../Card';
import { actionClass } from '../ui/actionStyles';
import { groupActionHoverClass } from '../ui/Notice';
import { useSavedAutomationMode } from '../../data/automationMode';
import { automacoesStore } from '../../data/automacoes';
import type { AutomationMode } from '../../data/automacoes';
import { useSavedStore } from '../../data/iaConfigStore';

const LINE: Record<AutomationMode, string> = {
  pausado: 'Envio pausado: nenhuma mensagem sai agora. Em Oportunidades você copia a mensagem e marca quem foi chamado.',
  supervisionado: 'Você aprova cada envio em Oportunidades. Depois de aprovada, a mensagem sai das 9h às 20h.',
  automatico: 'As mensagens saem sozinhas, dentro das regras de segurança.'
};

/** Texto da linha de status do envio de retornos (modo SALVO + automação "Lembrar do retorno do procedimento"). */
export function useReturnSendLine() {
  const mode = useSavedAutomationMode();
  const saved = useSavedStore(automacoesStore);
  const reminderOff = !(saved.enabled.retorno ?? false);
  return { mode, text: `${LINE[mode]}${reminderOff ? ' A campanha de retorno está desligada: nenhum retorno está sendo acompanhado.' : ''}` };
}

/**
 * Controle de envio dos retornos em UM lugar só: esta linha mostra o que está salvo em IA Orniplaty › Automações e leva até lá.
 * Usada em Clientes › Retornos (só consulta desde o Lote C, 20/10/2026). Não repetir o aviso de Pausado em outro ponto da tela.
 * Padrão do design system para aviso que leva a outra tela: `Alert` com `to` (cartão inteiro clicável, hover único e seta);
 * o botão "Mudar em Automações" vira só visual. No celular o botão some e fica a seta (o aviso não empurra a fila para baixo).
 */
export function ReturnSendStatus({ className = '' }: {className?: string;}) {
  const { mode, text } = useReturnSendLine();
  return (
    <Alert
      variant={mode === 'pausado' ? 'warning' : 'info'}
      role="status"
      compact
      title={text}
      to="/atendente-ia/automacoes"
      className={className}
      actions={<span className={`${actionClass('neutral', 'md')} ${groupActionHoverClass} hidden sm:inline-flex`}>Mudar em Automações</span>} />);


}