import { currentContent } from '../../data/empresa';
import { wordsNow } from '../../data/segment';
import React, { useState } from 'react';
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { Button } from '../Button';
import { Input } from '../Input';
import { StatusBadge } from '../StatusBadge';
import { ModalActions } from '../ui/ModalActions';
import { useToast } from '../ui/Toast';
import { createTag, deleteTag, renameTag, setTagActive, suggestedTagNames, tagUsage, useTagCatalog, validateTagName } from '../../data/api/clientes';

/**
 * Catálogo de tags da clínica: criar, renomear, ativar/desativar e excluir para todos.
 * Excluir aqui apaga a tag do catálogo (para todos). Tirar a tag de um único cliente é feito na edição de tags do cliente.
 * A confirmação de exclusão fica dentro do próprio modal (dois modais empilhados brigam pelo foco).
 * PROTÓTIPO: o backend real ainda não tem exclusão de tag (só renomear e desativar).
 */
export function TagManagerModal({ open, onClose }: {open: boolean;onClose: () => void;}) {
  const toast = useToast();
  const catalog = useTagCatalog();
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{id: string;name: string;error: string | null;} | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const close = () => {
    setEditing(null);
    setConfirmId(null);
    setNewName('');
    setNewError(null);
    onClose();
  };

  const add = (name: string) => {
    const err = validateTagName(name);
    if (err) {
      setNewError(err);
      return;
    }
    createTag(name);
    toast({ title: 'Tag criada' });
    setNewName('');
    setNewError(null);
  };

  const saveRename = () => {
    if (!editing) return;
    const err = validateTagName(editing.name, editing.id);
    if (err) {
      setEditing({ ...editing, error: err });
      return;
    }
    renameTag(editing.id, editing.name);
    toast({ title: 'Tag renomeada', description: 'Quem já tinha a tag continua com ela, com o nome novo.' });
    setEditing(null);
  };

  const confirming = catalog.find((t) => t.id === confirmId) ?? null;
  const confirmUsage = confirming ? tagUsage(confirming.id) : 0;
  const suggestions = currentContent().tags.filter((s) => !catalog.some((t) => t.name.toLowerCase() === s.toLowerCase()));

  return (
    <AppModal
      open={open}
      onClose={close}
      size="md"
      title={confirming ? `Excluir a tag "${confirming.name}"?` : `Tags ${wordsNow().of}`}
      description={confirming ? undefined : 'Crie, renomeie ou exclua as tags usadas em Clientes e Conversas.'}
      footer={
      confirming ?
      <ModalActions equal={2}>
            <Button variant="secondary" onClick={() => setConfirmId(null)}>
              Manter a tag
            </Button>
            <Button
          variant="danger"
          onClick={() => {
            deleteTag(confirming.id);
            toast({ title: 'Tag excluída', description: confirmUsage ? `Removida de ${confirmUsage} ${confirmUsage === 1 ? 'cliente' : 'clientes'}.` : undefined });
            setConfirmId(null);
          }}>
          
              Excluir para todos
            </Button>
          </ModalActions> :

      <ModalActions>
            <Button onClick={close}>Concluído</Button>
          </ModalActions>

      }>
      
      {confirming ?
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
          <p>
            {confirmUsage > 0 ?
          <>
                Esta tag está em <strong className="text-text-primary">{confirmUsage} {confirmUsage === 1 ? 'cliente' : 'clientes'}</strong> e será removida de todos.
              </> :

          'Nenhum cliente usa esta tag.'
          }{' '}
            Os clientes, agendamentos e históricos continuam como estão.
          </p>
          <p>Para só tirar a tag de um cliente, edite as tags dele. Para escondê-la sem apagar, use Desativar.</p>
        </div> :

      <div className="flex flex-col gap-5">
          <ul className="flex flex-col divide-y divide-border rounded-button border border-border" aria-label="Tags existentes">
            {catalog.length === 0 && <li className="p-3 text-sm text-text-muted">Nenhuma tag criada ainda.</li>}
            {catalog.map((t) => {
            const used = tagUsage(t.id);
            const isEditing = editing?.id === t.id;
            return (
              <li key={t.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between md:gap-4">
                  {isEditing && editing ?
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                      <Input
                    aria-label={`Novo nome da tag ${t.name}`}
                    value={editing.name}
                    error={editing.error ?? undefined}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value, error: null })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveRename();
                      }
                    }}
                    containerClassName="sm:flex-1" />
                  
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" leftIcon={<CheckIcon className="h-4 w-4" />} onClick={saveRename}>
                          Salvar
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div> :

                <>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-bold text-text-primary">{t.name}</span>
                        {!t.is_active && <StatusBadge status="muted" label="Desativada" showDot={false} />}
                        <span className="whitespace-nowrap text-xs text-text-muted">{used === 0 ? 'Sem clientes' : `${used} ${used === 1 ? 'cliente' : 'clientes'}`}</span>
                      </div>
                      <div className="flex shrink-0 flex-nowrap items-center gap-2 [&>button]:whitespace-nowrap">
                        <Button size="sm" variant="secondary" leftIcon={<PencilIcon className="h-4 w-4" />} onClick={() => setEditing({ id: t.id, name: t.name, error: null })}>
                          Renomear
                        </Button>
                        <Button size="sm" variant="secondary" className="min-w-[5.5rem]" onClick={() => setTagActive(t.id, !t.is_active)}>
                          {t.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button size="sm" variant="dangerSoft" aria-label={`Excluir a tag ${t.name} para todos`} leftIcon={<TrashIcon className="h-4 w-4" />} onClick={() => setConfirmId(t.id)}>
                          Excluir
                        </Button>
                      </div>
                    </>
                }
                </li>);

          })}
          </ul>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-text-primary">Nova tag</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Input
              aria-label="Nome da nova tag"
              placeholder="Ex.: Aniversariante do mês"
              value={newName}
              error={newError ?? undefined}
              onChange={(e) => {
                setNewName(e.target.value);
                setNewError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(newName);
                }
              }}
              containerClassName="sm:flex-1" />
            
              <Button leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => add(newName)}>
                Criar tag
              </Button>
            </div>
          </div>

          {suggestions.length > 0 &&
        <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-text-primary">Sugestões para {wordsNow().your}</p>
              <p className="text-xs text-text-secondary">Opcionais. Só entram no seu catálogo se você adicionar.</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) =>
            <Button key={s} size="md" variant="secondary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => add(s)}>
                    {s}
                  </Button>
            )}
              </div>
            </div>
        }
        </div>
      }
    </AppModal>);

}