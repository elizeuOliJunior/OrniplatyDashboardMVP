import React, { useEffect, useMemo, useState } from 'react';
import { ArchiveIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { Button } from '../Button';
import { Input } from '../Input';
import { NoticeInline } from '../ui/Notice';
import { useToast } from '../ui/Toast';
import { archiveClient, clientIdOfRecordedName } from '../../data/api/clientes';
import { useFinanceEntries } from '../../data/convenios';
import { deleteClientWithEffects, deletionImpact } from '../../data/clientDeletion';

export type ClientRecordCounts = {appointments: number;financial: number;conversations: number;packages: number;openCases?: number;};
export type ClientAction = 'archive' | 'delete';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Arquivar (reversível) ou excluir definitivamente (G4, F-069: o texto diz exatamente o que acontece).
 * - Arquivar: sai das listas e da busca; a ficha fica só para consulta até restaurar. Nada é cancelado.
 * - Excluir: sai do cadastro e das telas de operação; horários futuros são cancelados com motivo; o histórico financeiro,
 *   os atendimentos passados, as mensagens enviadas e Resultados ficam (`data/clientDeletion.ts`).
 * Backend lido: só `DELETE /clients/{id}` (cascata) e nenhum arquivamento. O que é retido é contrato do G6.
 * W9d (N-01, G10, 12/11/2026): "registros financeiros" conta também os FECHAMENTOS de atendimento do cliente (o dinheiro de um
 * atendimento vale pelo fechamento), e não só os lançamentos. É a mesma soma do número da aba Financeiro da ficha.
 */
export function ClientArchiveDeleteModal({
  mode,
  onClose,
  clientId,
  clientName,
  counts,
  onDone







}: {mode: ClientAction | null;onClose: () => void;clientId: string;clientName: string;counts: ClientRecordCounts;onDone: () => void;}) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (mode) setTyped('');
  }, [mode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const impact = useMemo(() => deletionImpact(clientId), [clientId, mode]);
  // W9d (N-01): fechamentos deste cliente, pela mesma regra da ficha (id gravado no fechamento; sem id, o nome registrado).
  const closures = useFinanceEntries().filter((e) => e.clientId ? e.clientId === clientId : clientIdOfRecordedName(e.clientName) === clientId).length;
  const financial = counts.financial + closures;

  const matches = typed.trim().toLowerCase() === clientName.trim().toLowerCase();
  const deleting = mode === 'delete';
  const leaves = [
  impact.future > 0 && `${plural(impact.future, 'horário futuro é cancelado', 'horários futuros são cancelados')} com o motivo “Cliente excluído do cadastro” (a vaga volta a ficar livre)`,
  impact.waitlist > 0 && `${plural(impact.waitlist, 'pedido sai', 'pedidos saem')} da lista de espera`,
  impact.conversation && 'a conversa sai da lista de Conversas',
  (counts.openCases ?? 0) > 0 && `${plural(counts.openCases ?? 0, 'acompanhamento sai', 'acompanhamentos saem')} de Oportunidades`,
  impact.packages > 0 && `${plural(impact.packages, 'pacote sai', 'pacotes saem')} da aba Pacotes${impact.activePackages > 0 ? ` (${plural(impact.activePackages, 'ativo', 'ativos')}: as sessões que sobraram não poderão ser usadas)` : ''}`].
  filter(Boolean) as string[];

  return (
    <AppModal
      open={!!mode}
      onClose={onClose}
      // P4 (28/10/2026): o nome digitado só confirma a exclusão; não é rascunho a proteger (antes, excluir abria "alterações não salvas").
      unsavedGuard={false}
      size="md"
      tone={deleting ? 'danger' : 'default'}
      title={deleting ? `Excluir ${clientName} definitivamente` : `Arquivar ${clientName}`}
      footer={
      deleting ?
      <ModalActions>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
          variant="danger"
          disabled={!matches}
          onClick={() => {
            const done = deleteClientWithEffects(clientId);
            toast({
              title: `${clientName} saiu do cadastro`,
              description: done && done.future > 0 ? `${plural(done.future, 'horário futuro foi cancelado', 'horários futuros foram cancelados')}. O histórico financeiro ficou.` : 'O histórico financeiro e os atendimentos passados ficaram.',
              tone: 'warning'
            });
            onClose();
            onDone();
          }}>
          
              Excluir definitivamente
            </Button>
          </ModalActions> :

      <ModalActions>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
          leftIcon={<ArchiveIcon className="h-4 w-4" />}
          onClick={() => {
            archiveClient(clientId);
            toast({ title: `Cliente arquivado: ${clientName}`, description: 'Histórico, financeiro e conversas foram preservados.' });
            onClose();
            onDone();
          }}>
          
              Arquivar cliente
            </Button>
          </ModalActions>

      }>
      
      {deleting ?
      <div className="flex flex-col gap-4 text-sm text-text-secondary">
          <NoticeInline tone="error" title="Não dá para desfazer">
            Se você só quer tirar {clientName} das listas, arquive: dá para restaurar depois.
          </NoticeInline>
          <div>
            <p className="font-semibold text-text-primary">O que acontece agora</p>
            <ul className="mt-1 list-disc pl-5">
              <li>{clientName} sai do cadastro, da busca e das listas de escolha</li>
              {leaves.map((l) =>
            <li key={l}>{l}</li>
            )}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-text-primary">O que fica guardado</p>
            <ul className="mt-1 list-disc pl-5">
              <li>{plural(Math.max(0, counts.appointments - impact.future), 'atendimento passado', 'atendimentos passados')} na Agenda, com o nome registrado</li>
              <li>{plural(financial, 'registro financeiro', 'registros financeiros')}, recebimentos e reembolsos, também em Resultados</li>
              <li>As mensagens já enviadas e o registro de alterações</li>
            </ul>
          </div>
          <Input label={`Para confirmar, digite o nome: ${clientName}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div> :

      <div className="flex flex-col gap-3 text-sm text-text-secondary">
          <p>
            {clientName} sai das listas e da busca. A ficha fica só para consulta: para agendar, vender pacote ou editar, restaure. Agendamentos, financeiro, pacotes e conversas ficam
            guardados e nada é cancelado.
          </p>
          {impact.future > 0 &&
        <NoticeInline tone="warning" title={`${plural(impact.future, 'horário futuro continua', 'horários futuros continuam')} na Agenda`}>
              Arquivar não cancela. Se o cliente não vem mais, cancele pela Agenda.
            </NoticeInline>
        }
        </div>
      }
    </AppModal>);

}