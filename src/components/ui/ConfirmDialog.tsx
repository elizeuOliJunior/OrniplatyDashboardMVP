import React, { useEffect, useRef } from 'react';
import { AppModal } from './AppModal';
import { ModalActions } from './ModalActions';
import { Button } from '../Button';

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Variante do botão de voltar. Padrão `secondary`; Configurações usa `neutral` (só botões preenchidos, decisão 8 de 20/10/2026). */
  cancelVariant?: 'secondary' | 'neutral';
  /** Foco inicial no botão de voltar (confirmações destrutivas). */
  focusCancel?: boolean;
};

/** Rótulo acima disto não cabe em dois botões de largura igual no modal pequeno: o modal passa a médio. */
const SHORT_LABEL = 16;

/** Confirmação pequena (destrutiva ou não). Voltar = contorno neutro; confirmar = vermelho (danger) ou verde-azulado. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Voltar',
  danger = false,
  cancelVariant = 'secondary',
  focusCancel = false
}: ConfirmDialogProps) {
  const long = Math.max(confirmLabel.length, cancelLabel.length) > SHORT_LABEL;
  const cancelRef = useRef<HTMLSpanElement>(null);
  // Foco inicial no botão de voltar: depois do foco automático do AppModal (que vai para o primeiro botão da janela)
  useEffect(() => {
    if (!open || !focusCancel) return;
    const t = window.setTimeout(() => cancelRef.current?.querySelector('button')?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open, focusCancel]);
  return (
    <AppModal
      open={open}
      onClose={onClose}
      size={long ? 'md' : 'sm'}
      tone={danger ? 'danger' : 'default'}
      title={title}
      description={description}
      footer={
      <ModalActions equal={2}>
          <span ref={cancelRef} className="contents">
            <Button variant={cancelVariant} onClick={onClose} data-dismiss="">
              {cancelLabel}
            </Button>
          </span>
          <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}>
          
            {confirmLabel}
          </Button>
        </ModalActions>
      } />);


}