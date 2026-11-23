import React, { useEffect, useState } from 'react';
import { AppModal } from '../ui/AppModal';
import { Button } from '../Button';
import { useToast } from '../ui/Toast';
import { TagPicker } from './TagPicker';
import { clientById, resolvePendingTags, updateClient } from '../../data/api/clientes';

/** Edita só as tags de UM cliente (marcar várias, tirar). Não altera o catálogo da clínica. */
export function ClientTagsModal({ open, clientId, onClose, onManage }: {open: boolean;clientId: string | null;onClose: () => void;onManage?: () => void;}) {
  const toast = useToast();
  const client = clientId ? clientById(clientId) : null;
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (open && client) setIds(client.tag_items.map((t) => t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);
  if (!client) return null;
  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="md"
      title={`Tags de ${client.name}`}
      description="Marque quantas quiser. Desmarcar tira a tag só deste cliente."
      footer={
      <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
          onClick={() => {
            updateClient(client.id, { tag_ids: resolvePendingTags(ids) });
            toast({ title: 'Tags atualizadas' });
            onClose();
          }}>
          
            Salvar tags
          </Button>
        </>
      }>
      
      <TagPicker value={ids} onChange={setIds} onManage={onManage ? () => onManage() : undefined} />
    </AppModal>);

}