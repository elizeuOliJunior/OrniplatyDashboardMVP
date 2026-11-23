import { wordsNow } from '../../data/segment';
import React, { useState } from 'react';
import { PlusIcon, SettingsIcon } from 'lucide-react';
import { Pill } from '../Pill';
import { Input } from '../Input';
import { Button } from '../Button';
import { isPendingTag, pendingTagId, useTagCatalog, validateTagName, PENDING_TAG_PREFIX } from '../../data/api/clientes';

type Props = {
  /** ids das tags do cliente */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Abre o gerenciador do catálogo da clínica (renomear, desativar, excluir) */
  onManage?: () => void;
};

/**
 * Escolha de várias tags. Clicar numa tag marcada só a tira DESTE cliente;
 * excluir a tag para todos só existe no gerenciador do catálogo.
 */
export function TagPicker({ value, onChange, onManage }: Props) {
  const catalog = useTagCatalog();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Tag desativada continua visível se o cliente já a tem (nada some em silêncio)
  const visible = catalog.filter((t) => t.is_active || value.includes(t.id));

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const add = () => {
    const err = validateTagName(name, undefined, value.filter(isPendingTag));
    if (err) {
      setError(err);
      return;
    }
    // G4 (F-069): a tag nova só entra no catálogo quando o cliente for salvo (cancelar não cria nada).
    onChange([...value, pendingTagId(name)]);
    setName('');
    setError(null);
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tags do cliente">
        {visible.length === 0 && !value.some(isPendingTag) && <p className="text-sm text-text-muted">Nenhuma tag criada ainda.</p>}
        {visible.map((t) =>
        <Pill key={t.id} size="sm" selected={value.includes(t.id)} onClick={() => toggle(t.id)}>
            {t.name}
            {!t.is_active ? ' (desativada)' : ''}
          </Pill>
        )}
        {value.filter(isPendingTag).map((id) =>
        <Pill key={id} size="sm" selected onClick={() => toggle(id)}>
            {id.slice(PENDING_TAG_PREFIX.length)} (nova)
          </Pill>
        )}
      </div>
      {adding ?
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Input
          aria-label="Nome da nova tag"
          placeholder="Nome da nova tag"
          value={name}
          error={error ?? undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          containerClassName="sm:max-w-xs sm:flex-1" />
        
          <div className="flex gap-2">
            <Button size="md" onClick={add}>
              Criar e marcar
            </Button>
            <Button
            size="md"
            variant="secondary"
            onClick={() => {
              setAdding(false);
              setName('');
              setError(null);
            }}>
            
              Cancelar
            </Button>
          </div>
        </div> :

      <div className="flex flex-wrap gap-2">
          <Button size="md" variant="secondary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Nova tag
          </Button>
          {onManage &&
        <Button size="md" variant="ghost" leftIcon={<SettingsIcon className="h-4 w-4" />} onClick={onManage}>
              Gerenciar tags {wordsNow().of}
            </Button>
        }
        </div>
      }
    </div>);

}