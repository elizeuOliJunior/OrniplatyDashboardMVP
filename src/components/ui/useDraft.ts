import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getScenarioVersion, subscribeScenario, useDirtyForm } from '../../data/dirtyGuard';
import { markSaveRetried, saveShouldFail } from '../../data/failures';

export type DraftErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Rascunho de formulário ligado à proteção de alterações não salvas.
 * - `dirty` compara o rascunho com o último estado SALVO (voltar ao valor original limpa o aviso).
 * - `save()` valida; se falhar, mantém o rascunho, mostra os erros e devolve false.
 * - `discard()` volta ao último estado salvo.
 * PROTOTIPO: "salvo" vive só na memória da tela; o backend real não é chamado.
 */
export function useDraft<T extends object>(
id: string,
initial: T,
opts: {validate?: (d: T) => DraftErrors<T>;onSaved?: (d: T) => void; /** G2 (IA-22): lê o cadastro salvo de novo depois de um cenário do seletor */reload?: () => T;} = {})
{
  const [saved, setSaved] = useState<T>(initial);
  const [draft, setDraft] = useState<T>(initial);
  const [errors, setErrors] = useState<DraftErrors<T>>({});
  /** G4 (F-066): falha ao salvar (cenário do seletor). O rascunho fica; "Tentar de novo" chama `save` outra vez. */
  const [saveError, setSaveError] = useState('');

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = (): boolean => {
    const errs = opts.validate ? opts.validate(draft) : {};
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;
    if (saveShouldFail(id)) {
      markSaveRetried(id);
      setSaveError('Não foi possível salvar agora. Suas alterações continuam aqui: tente de novo.');
      return false;
    }
    setSaveError('');
    setSaved(draft);
    opts.onSaved?.(draft);
    return true;
  };
  const discard = () => {
    setDraft(saved);
    setErrors({});
  };

  useDirtyForm(id, dirty, { save, discard });

  // G2 (F-037, IA-22): depois de um cenário do seletor de telas, o rascunho volta a mostrar o cadastro salvo. O cenário
  // só é aplicado com o formulário limpo (o aviso de alterações não salvas vem antes), então nada digitado se perde.
  const scenario = useSyncExternalStore(subscribeScenario, getScenarioVersion);
  const reloadRef = useRef(opts.reload);
  reloadRef.current = opts.reload;
  const first = useRef(scenario);
  useEffect(() => {
    if (scenario === first.current || !reloadRef.current) return;
    first.current = scenario;
    const fresh = reloadRef.current();
    setSaved(fresh);
    setDraft(fresh);
    setErrors({});
  }, [scenario]);

  const set = useCallback(<K extends keyof T,>(key: K, value: T[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => e[key] ? { ...e, [key]: undefined } : e);
  }, []);

  return { draft, set, dirty, errors, save, discard, saveError };
}