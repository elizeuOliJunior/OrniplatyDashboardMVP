import React from 'react';
import { CalendarXIcon, PlusIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { Button } from '../Button';

export type { AgendaView } from './AgendaDateNav';

type AgendaHeaderActionsProps = {
  onBlock: () => void;
  onNew: () => void;
  className?: string;
};

/**
 * Ações da Agenda: "Bloquear horário ou folga" (secondary, ícone de calendário bloqueado, o mesmo do "+ Novo" do topo) ·
 * "+ Novo agendamento" (primary, por último).
 * P2 (13/11/2026): "Lista de espera" virou aba; "Bloquear horário" passou a "Bloquear horário ou folga".
 * L18, rodada 4 (17/11/2026, pedido do Christian): os dois botões voltam para DENTRO do cartão do calendário, na linha 1
 * da barra, à direita, com 36 px (`md`, regra de tamanho para cartões e barras; escolha do Christian). Só na aba Agenda;
 * na Lista de espera continuam pelo "+ Novo" do topo. Abaixo de 640 px: um embaixo do outro, largura toda, o cheio em cima.
 * Mesmas ações e mesmas janelas.
 */
export function AgendaHeaderActions({ onBlock, onNew, className }: AgendaHeaderActionsProps) {
  return (
    <div className={twMerge('flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end', className)}>
      <Button size="md" variant="secondary" leftIcon={<CalendarXIcon className="h-4 w-4" aria-hidden="true" />} onClick={onBlock} className="w-full justify-center sm:w-auto">
        Bloquear horário ou folga
      </Button>
      <Button size="md" leftIcon={<PlusIcon className="h-4 w-4" aria-hidden="true" />} onClick={onNew} className="w-full justify-center sm:w-auto">
        Novo agendamento
      </Button>
    </div>);

}