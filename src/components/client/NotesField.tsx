import React, { useEffect, useRef, useState } from 'react';
import { Textarea } from '../Card';
import { updateClient } from '../../data/api/clientes';
import { useDirtyForm } from '../../data/dirtyGuard';
import { logChange } from '../../data/legado';

/**
 * Observações do cliente que salvam sozinhas ao sair do campo: o MESMO padrão da ficha resumida de Conversas
 * (T1 1g, 05/11/2026, referência Tend). Ficha completa (11/11/2026): cada gravação entra também na trilha de alterações.
 * Trocar de tela com texto não salvo passa pelo aviso de alterações. Arquivado (`readOnly`): só leitura.
 * Pendência: `ClientSummaryPanel` (Conversas) ainda tem a cópia própria dele; unificar quando aquele arquivo for mexido.
 */
export function NotesField({ clientId, notes, readOnly = false }: {clientId: string;notes: string;readOnly?: boolean;}) {
  const [draft, setDraft] = useState(notes);
  const [savedAt, setSavedAt] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(notes);
  }, [notes]);
  const dirty = !readOnly && draft.trim() !== notes.trim();
  const save = (): boolean => {
    if (!dirty) return true;
    const next = draft.trim();
    updateClient(clientId, { notes: next || null });
    logChange(clientId, 'Observações', notes.trim() || 'vazio', next || 'vazio');
    setSavedAt(true);
    return true;
  };
  useDirtyForm(`ficha-observacoes-${clientId}`, dirty, { save, discard: () => setDraft(notes) });
  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(false), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  if (readOnly) {
    return <p className={`whitespace-pre-line text-sm ${notes ? 'text-text-primary' : 'text-text-muted'}`}>{notes || 'Nenhuma observação.'}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        aria-label="Observações do cliente"
        aria-describedby={`ficha-obs-ajuda-${clientId}`}
        rows={3}
        size="sm"
        value={draft}
        onFocus={() => focused.current = true}
        onChange={(e) => {
          setDraft(e.target.value);
          setSavedAt(false);
        }}
        onBlur={() => {
          focused.current = false;
          save();
        }}
        placeholder="Ex.: prefere horários pela manhã, pele sensível…" />
      
      <p id={`ficha-obs-ajuda-${clientId}`} aria-live="polite" className={`text-xs ${savedAt ? 'font-semibold text-success-text' : 'text-text-muted'}`}>
        {savedAt ? 'Observação salva.' : 'Salva sozinha quando você sai do campo.'}
      </p>
    </div>);

}