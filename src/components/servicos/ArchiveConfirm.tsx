import React from 'react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { Button } from '../Button';

/**
 * W2 (11/11/2026, A3-02 e A3-14): confirmação de arquivar (serviço ou profissional) que mostra, ANTES de confirmar, a
 * lista de quem já está marcado. É a mesma janela do `ConfirmDialog` (AppModal pequeno/médio, Voltar + confirmar com
 * `ModalActions equal`), com espaço para o `ConflictNotice` no corpo: o `ConfirmDialog` só aceita texto no cabeçalho.
 */
export function ArchiveConfirm({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children







}: {open: boolean;onClose: () => void;onConfirm: () => void;title: string;description: string;children?: React.ReactNode;}) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      unsavedGuard={false}
      size="md"
      title={title}
      description={description}
      footer={
      <ModalActions equal={2}>
          <Button variant="secondary" onClick={onClose} data-dismiss="">
            Voltar
          </Button>
          <Button
          onClick={() => {
            onConfirm();
            onClose();
          }}>
          
            Arquivar
          </Button>
        </ModalActions>
      }>
      
      {children}
    </AppModal>);

}