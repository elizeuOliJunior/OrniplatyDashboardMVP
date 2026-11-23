import { useCallback } from 'react';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { useToast } from '../ui/Toast';
import { clientById, clientIdOfRecordedName } from '../../data/api/clientes';
import { ensureConversation } from '../../data/conversasThreads';
import { conversationLink } from '../../data/deepLinks';

/**
 * G2 (F-033): "Ver conversa" abre a conversa DESTE cliente. O id vem do cadastro (id explícito ou o nome gravado no
 * registro casado pelo cadastro: nome atual ou anterior do mesmo id); nunca se inventa id a partir do nome.
 * Cliente do cadastro sem conversa: `ensureConversation` cria a conversa vazia dele (o histórico de quem já tem conversa
 * não muda). Nome que não está no cadastro (ex.: cliente excluído): aviso e a lista de Conversas, sem abrir outra pessoa.
 * Nenhuma mensagem é enviada.
 */
export function useOpenConversation() {
  const navigate = useGuardedNavigate();
  const toast = useToast();
  return useCallback(
    (who: {clientId?: string | null;name: string;}) => {
      const id = who.clientId && clientById(who.clientId) ? who.clientId : clientIdOfRecordedName(who.name);
      const client = id ? clientById(id) : null;
      if (!client) {
        toast({ title: 'Cliente não encontrado', description: `${who.name} não está no cadastro de clientes. Abrimos a lista de conversas.`, tone: 'warning' });
        navigate('/conversas');
        return;
      }
      ensureConversation(client.id, client.name);
      navigate(conversationLink(client.id));
    },
    [navigate, toast]
  );
}