import React, { useCallback, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppModal } from './AppModal';
import { ModalActions } from './ModalActions';
import { Button } from '../Button';
import { cancelLeave, confirmLeave, getPending, guardVersion, requestLeave, subscribeGuard } from '../../data/dirtyGuard';

export { useDirtyForm, requestLeave } from '../../data/dirtyGuard';

/** Navegação interna que respeita alterações não salvas. */
export function useGuardedNavigate() {
  const navigate = useNavigate();
  return useCallback((to: string) => requestLeave(() => navigate(to)), [navigate]);
}

/**
 * Compatibilidade: o AppModal já protege sozinho qualquer modal com campos (X, fundo, Cancelar/Voltar/Fechar).
 * Este hook não faz mais nada além de devolver o `onClose`; não crie guardas manuais para modais.
 */
export function useModalGuard(_open: boolean, _draft: unknown, onClose: () => void) {
  return { close: onClose, dirty: false };
}

/**
 * Aviso "alterações não salvas". Fica no DashboardLayout, então existe em toda tela do Painel.
 * Páginas: descartar segue para onde a pessoa clicou; "Salvar e continuar" salva e segue para o mesmo lugar (W9d, A5-20;
 * se o salvamento falhar, fica na tela e o formulário mostra o motivo); continuar editando cancela a navegação.
 * Modais: descartar fecha o modal.
 */
export function UnsavedChangesHost() {
  useSyncExternalStore(subscribeGuard, guardVersion);
  const pending = getPending();
  const forModal = !!pending?.closeAfter;
  return (
    <AppModal
      open={!!pending}
      onClose={cancelLeave}
      size="lg"
      instantClose
      title="Você tem alterações não salvas"
      description={forModal ? 'Se fechar agora, o que você alterou neste formulário será perdido.' : pending?.note ? `Escolha o que fazer com as alterações antes de continuar. ${pending.note}` : 'Escolha o que fazer com as alterações antes de continuar.'}
      footer={
      <ModalActions equal={pending?.canSave ? 3 : 2}>
          <Button variant="secondary" onClick={cancelLeave}>
            Continuar editando
          </Button>
          {/* G2 (F-037): `dangerSoft` é o nome documentado da variante (o DS ainda aceita o apelido antigo `dangerOutline`). */}
          <Button variant={pending?.canSave ? 'dangerSoft' : 'danger'} onClick={() => confirmLeave('discard')}>
            {forModal ? 'Descartar e fechar' : pending?.discardLabel ?? 'Descartar alterações'}
          </Button>
          {pending?.canSave && <Button onClick={() => confirmLeave('save')}>{pending.saveLabel ?? 'Salvar e continuar'}</Button>}
        </ModalActions>
      } />);


}