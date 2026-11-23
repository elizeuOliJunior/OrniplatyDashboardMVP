import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { Button } from '../Button';
import { Input } from '../Input';
import { Pill } from '../Pill';
import { IconButton } from '../Card';
import { OTHER_CATEGORY } from '../../data/servicesStore';
import { currentContent, currentWords, empresaStore } from '../../data/empresa';
import { suggestionLabel } from '../../data/segment';
import type { Category, ServiceItem } from '../../data/servicesStore';

const slug = (t: string) =>
`cat-${t.
toLowerCase().
normalize('NFD').
replace(/[̀-ͯ]/g, '').
replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;

/**
 * Categorias da clínica: criar, renomear, reordenar e excluir (só vazias).
 * Backend: `category` é texto livre (100) no serviço. A ORDEM e a lista própria de categorias são CONTRATO NOVO.
 */
/** G5 (23/11/2026): `focusNew` = aberta pelo "+ Nova categoria" da aba Serviços, já pronta para digitar a nova categoria. */
export function CategoriasModal({ open, onClose, categories, services, onSave, focusNew = false }: {open: boolean;onClose: () => void;categories: Category[];services: ServiceItem[];onSave: (list: Category[]) => void;focusNew?: boolean;}) {
  const newRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<Category[]>(categories);
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setList(categories.map((c) => ({ ...c })));
      setDraft('');
      setSubmitted(false);
      if (focusNew)
      window.setTimeout(() => {
        const input = newRef.current?.querySelector('input');
        input?.scrollIntoView({ block: 'nearest' });
        input?.focus();
      }, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const count = (id: string) => services.filter((s) => s.categoryId === id).length;
  const exists = (name: string) => list.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const add = (name: string) => {
    const n = name.trim().slice(0, 100);
    if (!n || exists(n)) return;
    setList((l) => [...l, { id: slug(n), name: n }]);
    setDraft('');
  };
  const move = (i: number, dir: -1 | 1) =>
  setList((l) => {
    const j = i + dir;
    if (j < 0 || j >= l.length) return l;
    const next = [...l];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const emptyName = list.find((c) => !c.name.trim());
  const duplicate = list.find((c, i) => list.findIndex((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase()) !== i);

  const save = () => {
    setSubmitted(true);
    if (emptyName || duplicate) return;
    onSave(list.map((c) => ({ ...c, name: c.name.trim() })));
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="lg"
      title="Categorias de serviço"
      description={`Organizam a lista de serviços e ajudam a assistente a apresentar o que ${currentWords().the} oferece. A ordem aqui é a ordem da lista.`}
      footer={
      <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar categorias</Button>
        </ModalActions>
      }>
      
      <div className="flex flex-col gap-5">
        <ol className="flex flex-col gap-2" aria-label="Categorias">
          {list.map((c, i) => {
            const n = count(c.id);
            return (
              <li key={c.id} className="flex items-start gap-2 rounded-xl border border-border px-3 py-2.5">
                <span className="mt-3 w-6 shrink-0 text-center text-sm font-bold tabular-nums text-text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Input aria-label={`Nome da categoria ${i + 1}`} value={c.name} maxLength={100} onChange={(e) => setList((l) => l.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} error={submitted && !c.name.trim() ? 'Dê um nome.' : undefined} />
                  <p className="mt-1 text-xs text-text-muted">{n === 0 ? 'Nenhum serviço' : n === 1 ? '1 serviço' : `${n} serviços`}</p>
                  {/* G1 (F-055): o serviço arquivado também impede excluir a categoria; a tela diz qual é. */}
                  {(() => {
                    const archived = services.filter((s) => s.categoryId === c.id && !s.active).map((s) => s.name);
                    return archived.length > 0 ?
                    <p className="mt-0.5 text-xs text-text-secondary">
                        {archived.length === 1 ? 'Arquivado que fica nesta categoria' : 'Arquivados que ficam nesta categoria'}: {archived.join(', ')}
                      </p> :
                    null;
                  })()}
                </div>
                <div className="mt-1 flex shrink-0 gap-1">
                  <IconButton size="sm" aria-label={`Subir ${c.name}`} disabled={i === 0} onClick={() => move(i, -1)} icon={<ArrowUpIcon className="h-4 w-4" aria-hidden="true" />} />
                  <IconButton size="sm" aria-label={`Descer ${c.name}`} disabled={i === list.length - 1} onClick={() => move(i, 1)} icon={<ArrowDownIcon className="h-4 w-4" aria-hidden="true" />} />
                  <IconButton size="sm" tone="danger" aria-label={n > 0 ? `${c.name} tem serviços e não pode ser excluída` : `Excluir ${c.name}`} disabled={n > 0} onClick={() => setList((l) => l.filter((x) => x.id !== c.id))} icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} />
                </div>
              </li>);

          })}
        </ol>
        {list.some((c) => count(c.id) > 0) && <p className="-mt-3 text-xs text-text-secondary">Só dá para excluir categoria vazia, contando os serviços arquivados. Mova os serviços para outra categoria antes.</p>}
        {submitted && duplicate && <p className="text-sm text-error">Já existe uma categoria chamada “{duplicate.name.trim()}”.</p>}

        <div>
          <p className="text-sm font-semibold text-text-primary">Nova categoria</p>
          <div ref={newRef} className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-start">
            <Input
              aria-label="Nome da nova categoria"
              placeholder="Ex.: Capilar"
              value={draft}
              maxLength={100}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(draft);
                }
              }} />
            
            <Button size="md" variant="secondary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => add(draft)} disabled={!draft.trim() || exists(draft)} className="sm:mt-1">
              Adicionar
            </Button>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-text-primary">Sugestões</p>
          {/* G4 (F-062): sugestões do segmento/especialidade salvos. As áreas já criadas nunca somem por trocar o segmento. */}
          {[{ segment: suggestionLabel(empresaStore.get().segment, empresaStore.get().specialty), names: currentContent().categories }].map((g) =>
          <div key={g.segment} className="mt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{g.segment}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {g.names.map((name) =>
              <Pill key={name} size="sm" addable disabled={exists(name)} onClick={() => add(name)}>
                    {name}
                  </Pill>
              )}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill size="sm" addable disabled={exists(OTHER_CATEGORY)} onClick={() => add(OTHER_CATEGORY)}>
              {OTHER_CATEGORY}
            </Pill>
          </div>
          <p className="mt-2 text-xs text-text-muted">Toque para adicionar; depois renomeie como preferir.</p>
        </div>
      </div>
    </AppModal>);

}