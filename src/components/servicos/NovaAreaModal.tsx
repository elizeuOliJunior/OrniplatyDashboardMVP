import React, { useEffect, useState } from 'react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { Button } from '../Button';
import { Input } from '../Input';

/**
 * CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2a): janela pequena "Nova área de atuação", aberta pelo
 * "Cadastrar área de atuação" da janela do profissional, POR CIMA dela. Mesmas peças da janela de categorias (`AppModal`,
 * `Input`, `ModalActions` com Cancelar + ação principal). Só o nome. Quem abre confere nome repetido e escolhe a área.
 * CONTRATO NOVO (foco no primeiro campo, 23/11/2026; lote SC3): abre com o cursor no Nome (`AppModal initialFocus="field"`).
 */
export function NovaAreaModal({ open, onClose, initialName, onSave }: {open: boolean;onClose: () => void;initialName?: string;onSave: (name: string) => void;}) {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setName((initialName ?? '').trim().slice(0, 120));
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    setSubmitted(true);
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Nova área de atuação"
      initialFocus="field"
      description="Aparece na lista de áreas de todos os profissionais."
      footer={
      <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Adicionar área</Button>
        </ModalActions>
      }>
      
      <Input
        label="Nome"
        required
        placeholder="Ex.: Massoterapia"
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
        error={submitted && !name.trim() ? 'Dê um nome.' : undefined} />
      
    </AppModal>);

}