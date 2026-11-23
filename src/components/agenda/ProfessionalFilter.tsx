import React, { useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, MinusIcon, SearchIcon } from 'lucide-react';
import { PickerPopover } from '../ui/PickerPopover';
import type { AgendaProfessional } from '../../data/agenda';
import { smallButton } from '../ui/styles';
import { Input } from '../Input';

/** Above this many professionals the list gets a search box. */
const SEARCH_FROM = 7;

function Box({ state }: {state: 'on' | 'off' | 'some';}) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
      state === 'off' ? 'border-border-strong bg-white' : 'border-primary bg-primary text-white'}`
      }>
      
      {state === 'on' && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
      {state === 'some' && <MinusIcon className="h-3 w-3" strokeWidth={3} />}
    </span>);

}

type ProfessionalFilterProps = {
  professionals: AgendaProfessional[];
  /** Ids shown in the agenda (never empty) */
  selected: string[];
  onChange: (ids: string[]) => void;
};

/** Chooses which professionals the agenda shows. Works the same with 3 or 30 professionals. */
export function ProfessionalFilter({ professionals, selected, onChange }: ProfessionalFilterProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const total = professionals.length;
  const all = selected.length === total;
  const chosen = professionals.filter((p) => selected.includes(p.id));
  const label = all ? 'Todos os profissionais' : selected.length === 1 ? chosen[0]?.name : `${selected.length} de ${total} profissionais`;
  const q = query.trim().toLowerCase();
  const visible = q ? professionals.filter((p) => p.name.toLowerCase().includes(q)) : professionals;

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    if (next.length === 0) return; // at least one professional stays on screen
    onChange(professionals.map((p) => p.id).filter((x) => next.includes(x)));
  };

  const row =
  'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery('');
          setOpen((o) => !o);
        }}
        className={`inline-flex h-9 w-56 max-w-full shrink-0 items-center gap-1.5 rounded-button border bg-white px-3 text-sm font-semibold text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        open ? 'border-primary' : 'border-border-strong hover:border-primary'}`
        }>
        
        {/* P4 (28/10/2026): espaços 6px e bolinhas mais sobrepostas para "Todos os profissionais" caber inteiro em w-56 (antes cortava 4px). */}
        <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
          {chosen.slice(0, 3).map((p) =>
          <span key={p.id} className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: p.color }} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      <PickerPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} width={288} label="Escolher profissionais">
        {total >= SEARCH_FROM &&
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar profissional"
          aria-label="Buscar profissional"
          prefix={<SearchIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />}
          containerClassName="mb-2" />

        }

        {!q &&
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={all ? true : 'mixed'}
          onClick={() => onChange(professionals.map((p) => p.id))}
          className={`${row} border-b border-border font-bold text-text-primary`}>
          
            <Box state={all ? 'on' : 'some'} />
            Todos os profissionais
            <span className="ml-auto text-xs font-semibold tabular-nums text-text-muted">{total}</span>
          </button>
        }

        <div className="mt-1 flex max-h-64 flex-col overflow-y-auto overscroll-contain" role="group" aria-label="Profissionais">
          {visible.length === 0 && <p className="px-2 py-3 text-sm text-text-muted">Nenhum profissional com esse nome.</p>}
          {visible.map((p) => {
            const on = selected.includes(p.id);
            return (
              <div key={p.id} className="flex items-center">
                <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(p.id)} className={`${row} min-w-0 flex-1 text-text-primary`}>
                  <Box state={on ? 'on' : 'off'} />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                  <span className="truncate">{p.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChange([p.id])}
                  aria-label={`Mostrar só ${p.name}`}
                  className={`${smallButton} ml-1`}>
                  
                  Só este
                </button>
              </div>);

          })}
        </div>

        <p className="mt-2 border-t border-border pt-2 text-center text-xs text-text-muted">
          {selected.length} de {total} na agenda · pelo menos 1
        </p>
      </PickerPopover>
    </>);

}