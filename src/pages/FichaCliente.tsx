import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArchiveIcon, ArchiveRestoreIcon, BellOffIcon, CalendarPlusIcon, ChevronLeftIcon, DownloadIcon, Trash2Icon } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ActionMenu } from '../components/ui/ActionMenu';
import type { ActionMenuItem } from '../components/ui/ActionMenu';
import { ClientCard, ClientNumbers, NextAppointmentCard } from '../components/client/ClientProfile';
import { HistoricoCard, PacotesCard } from '../components/client/ClientHistory';
import { ClientRegistrationForm } from '../components/client/ClientRegistrationForm';
import { ExportarDadosModal } from '../components/client/PrivacidadeCards';
import { OPT_OUT_ACTION_LABEL, useStoppableKinds } from '../components/client/ContatoCard';
import { ClientTagsModal } from '../components/client/ClientTagsModal';
import { TagManagerModal } from '../components/client/TagManagerModal';
import { ClientArchiveDeleteModal } from '../components/client/ClientArchiveDeleteModal';
import type { ClientAction } from '../components/client/ClientArchiveDeleteModal';
import { AcompanhamentoCard } from '../components/client/AcompanhamentoCard';
import { PackageDetailModal } from '../components/pacotes/PackageDetailModal';
import { VendaDePacoteModal } from '../components/pacotes/VendaDePacoteModal';
import { NovoAgendamentoModal } from '../components/modals/NovoAgendamentoModal';
import { AppointmentDetailsModal } from '../components/modals/AppointmentDetailsModal';
import { calFromProfile, detailsFromCalendar } from '../components/modals/appointmentDetailsFromCalendar';
import { useToast } from '../components/ui/Toast';
import { useGuardedNavigate } from '../components/ui/UnsavedChanges';
import { actionClass } from '../components/ui/actionStyles';
import { restoreClient, useClientProfile } from '../data/api/clientes';
import type { AppointmentResponse } from '../data/api/clientes';
import { listPackages, useBackendVersion } from '../data/api/pacotes';
import { moveAppointment, setAppointmentStatus, tryAddAppointment } from '../data/agendaLive';
import type { CalAppointment } from '../data/agendaStore';
import { useFollowUp } from '../data/followUp';
import { STOP_CHOICE_DESCRIPTION, useContactBlocks } from '../data/contactPreferences';

/**
 * Ficha do cliente (rota real `app.clientes.$clientId`), montada só com GET /api/clients/{id}/profile,
 * os endpoints de pacotes e a agenda. No protótipo arquivar e excluir são SIMULADOS (sem backend de arquivamento).
 * Lote C (20/10/2026): cartão Acompanhamento com o processo de cada serviço (as ações ficam em Oportunidades).
 *
 * Reorganizada em 11/11/2026 (pedido do Christian, referência: ficha de paciente do Tend), para tirar o excesso de
 * informação repetida. Decisões do Christian:
 * - Topo (rodada 6): uma linha só — "← Clientes" à esquerda; menu "⋯" (Arquivar/Restaurar, Exportar dados do cliente,
 *   Excluir definitivamente por último, em vermelho, sempre com confirmação) e "Agendar" à direita. O título com o
 *   nome saiu (o nome está no cartão do cliente, que é o h1); "Primeiro contato" e "Origem" foram para o cartão.
 * - Coluna da esquerda (rodada 3): só o cartão do cliente, que também mostra o cadastro principal. "Editar" ao lado do
 *   nome troca o cartão pelo cadastro inteiro em edição; Salvar ou Cancelar volta ao cartão.
 * - Coluna da direita, um embaixo do outro: Números (`StatStrip` como o Tend) · Próximo agendamento · Histórico ·
 *   Pacotes · Acompanhamento.
 * - Rodada 5: as listas dos cartões rolam por dentro (`ScrollList`), sem paginação (Pacotes e Acompanhamento: 3
 *   visíveis, confirmado pelo Christian na rodada 6).
 * - Faixa do topo (horário, modo noturno, notificações, + Novo): NÃO aparece na Ficha (decisão do Christian de
 *   11/11/2026, rodada da faixa na linha do título). Vale também para "Cliente não encontrado".
 * Abaixo de 1280 px as colunas empilham (cartão do cliente primeiro).
 * L7 (16/11/2026, etapa de facilidade de uso): o menu "⋯" ganhou `OPT_OUT_ACTION_LABEL` ("Cliente pediu para não
 * receber mensagens") quando não há pedido registrado; abre a MESMA confirmação do cartão "Preferência de contato"
 * (`registerSignal`). Com o cadastro em edição o cartão não está na tela, então a entrada não aparece.
 * L9 (16/11/2026): `?registrar=saida` (vindo de Oportunidades) abre essa mesma confirmação ao chegar; o parâmetro sai do
 * endereço logo depois (recarregar não abre de novo).
 * L24a (18/11/2026): a entrada "Cliente pediu para parar" aparece sempre que algum tipo MOSTRADO no cartão ainda pode ser
 * parado (`useStoppableKinds`, a mesma regra do botão do cartão); descrição "Escolha o que parar.".
 */
export function FichaCliente() {
  const { clientId = 'ana-ribeiro' } = useParams();
  const toast = useToast();
  const guardedNavigate = useGuardedNavigate();
  useBackendVersion();
  useContactBlocks();
  const ficha = useClientProfile(clientId);
  // L24a: tipos mostrados que ainda podem ser parados (chamado antes de qualquer retorno, por ser um hook).
  const paraParar = useStoppableKinds(ficha?.client.id ?? clientId);
  const { mode, all } = useFollowUp();
  const [vendendo, setVendendo] = useState(false);
  const [pacoteAberto, setPacoteAberto] = useState<string | null>(null);
  const [agendando, setAgendando] = useState(false);
  const [atendimento, setAtendimento] = useState<{iso: string;appt: CalAppointment;live: boolean;} | null>(null);
  const [tagsAbertas, setTagsAbertas] = useState(false);
  const [gerenciarTags, setGerenciarTags] = useState(false);
  const [exportando, setExportando] = useState(false);
  // W4 (11/11/2026, A2-11, fora da faixa): `?editar=cadastro` abre o cadastro já em edição (“Corrigir telefone” de Oportunidades).
  const [searchParams, setSearchParams] = useSearchParams();
  // L7: cada clique no "⋯" soma 1 e a `ContatoSection` abre a mesma confirmação do registro.
  // L9: chegando com `?registrar=saida`, começa em 1 (abre a confirmação uma vez).
  const [registrarSaida, setRegistrarSaida] = useState(() => searchParams.get('registrar') === 'saida' ? 1 : 0);
  useEffect(() => {
    if (searchParams.get('registrar') === null) return;
    const next = new URLSearchParams(searchParams);
    next.delete('registrar');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editando, setEditando] = useState(searchParams.get('editar') === 'cadastro');
  const [acao, setAcao] = useState<ClientAction | null>(null);

  const voltar =
  <Link to="/clientes" className={`${actionClass('neutral', 'lg')} pl-2`}>
      <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
      Clientes
    </Link>;


  if (!ficha) {
    return (
      <DashboardLayout activeId="clientes" title="Cliente não encontrado" beforeTitle={voltar} hideTopBar>
        <Card padding="lg" className="mt-6 text-sm text-text-secondary">
          Não foi possível abrir a ficha. O cliente pode ter sido removido.
        </Card>
      </DashboardLayout>);

  }

  const { client } = ficha;
  // G4 (F-069): arquivado = só consulta (sem agendar, vender pacote, editar cadastro, tags ou liberar contato).
  const archived = !!client.archived_at;
  const pacotes = listPackages({ client_id: client.id });
  // Acompanhamento deste cliente (mesma fonte de Oportunidades).
  const cases = all.filter((c) => c.clientId === client.id);
  const restaurar = () => {
    restoreClient(client.id);
    toast({ title: `${client.name} foi restaurado` });
  };
  const agendar = archived ? undefined : () => setAgendando(true);
  const semPedido = paraParar.length > 0;
  const cartaoNaTela = !(editando && !archived);

  const abrirAtendimento = (a: AppointmentResponse) => {
    if (a.cal) {
      setAtendimento({ ...a.cal, live: true });
      return;
    }
    // Atendimentos antigos (fora da semana da agenda): mesmo card, só leitura.
    setAtendimento({ ...calFromProfile(a, client.name), live: false });
  };

  const maisAcoes: ActionMenuItem[] = [
  ...(semPedido && cartaoNaTela ?
  [{ key: 'nao-receber', label: OPT_OUT_ACTION_LABEL, description: STOP_CHOICE_DESCRIPTION, icon: <BellOffIcon className="h-4 w-4" />, onSelect: () => setRegistrarSaida((n) => n + 1) }] :
  []),
  archived ?
  { key: 'restaurar', label: 'Restaurar', description: 'Volta para as listas e libera a edição.', icon: <ArchiveRestoreIcon className="h-4 w-4" />, onSelect: restaurar } :
  { key: 'arquivar', label: 'Arquivar', description: 'Sai das listas; a ficha fica só para consulta.', icon: <ArchiveIcon className="h-4 w-4" />, onSelect: () => setAcao('archive') },
  { key: 'exportar', label: 'Exportar dados do cliente', description: 'Pedido do titular (LGPD).', icon: <DownloadIcon className="h-4 w-4" />, onSelect: () => setExportando(true) },
  { key: 'excluir', label: 'Excluir definitivamente', description: 'Pede confirmação antes.', icon: <Trash2Icon className="h-4 w-4" />, danger: true, onSelect: () => setAcao('delete') }];


  return (
    <DashboardLayout activeId="clientes" title={client.name} hidePageHeader hideTopBar>
      <div className="mt-2 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {voltar}
          <div className="flex items-center gap-2" role="group" aria-label="Ações do cliente">
            <ActionMenu iconOnly label={`Mais ações para ${client.name}`} items={maisAcoes} variant="neutral" size="lg" />
            {!archived &&
            <Button leftIcon={<CalendarPlusIcon className="h-4 w-4" />} onClick={() => setAgendando(true)}>
                Agendar
              </Button>
            }
          </div>
        </div>

        {archived &&
        <Card padding="md" className="flex flex-wrap items-center justify-between gap-3 border-border-strong bg-background">
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">Cliente arquivado.</strong> Não aparece nas listas e a ficha fica só para consulta. Restaure para editar ou agendar.
            </p>
            <Button size="md" variant="neutral" leftIcon={<ArchiveRestoreIcon className="h-4 w-4" />} onClick={restaurar}>
              Restaurar
            </Button>
          </Card>
        }

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {editando && !archived ?
            <ClientRegistrationForm client={client} onManageTags={() => setGerenciarTags(true)} onClose={() => setEditando(false)} /> :

            <ClientCard
              ficha={ficha}
              archived={archived}
              onEditTags={archived ? undefined : () => setTagsAbertas(true)}
              onAgendar={agendar}
              onEditarCadastro={archived ? undefined : () => setEditando(true)}
              registerSignal={registrarSaida} />

            }
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <ClientNumbers ficha={ficha} />
            <NextAppointmentCard ficha={ficha} onAbrir={abrirAtendimento} onAgendar={agendar} />
            <HistoricoCard ficha={ficha} onAbrirAtendimento={abrirAtendimento} onAbrirPacote={setPacoteAberto} />
            <PacotesCard ficha={ficha} pacotes={pacotes} onAbrirPacote={setPacoteAberto} onVenderPacote={archived ? undefined : () => setVendendo(true)} />
            <AcompanhamentoCard clientId={client.id} cases={cases} mode={mode} />
          </div>
        </div>
      </div>

      <VendaDePacoteModal open={vendendo} clientePreSelecionadoId={client.id} onClose={() => setVendendo(false)} />
      <PackageDetailModal packageSaleId={pacoteAberto} nomeDoPaciente={client.name} onClose={() => setPacoteAberto(null)} />

      <NovoAgendamentoModal open={agendando} onClose={() => setAgendando(false)} defaults={{ client: client.name }} onSaved={(data) => tryAddAppointment(data)} />

      <ClientTagsModal open={tagsAbertas} clientId={client.id} onClose={() => setTagsAbertas(false)} onManage={() => {setTagsAbertas(false);setGerenciarTags(true);}} />
      <TagManagerModal open={gerenciarTags} onClose={() => setGerenciarTags(false)} />
      <ExportarDadosModal ficha={ficha} open={exportando} onClose={() => setExportando(false)} />
      <ClientArchiveDeleteModal
        mode={acao}
        onClose={() => setAcao(null)}
        clientId={client.id}
        clientName={client.name}
        counts={{ appointments: ficha.atendimentos_total, financial: ficha.financeiro.total, conversations: ficha.conversas.total, packages: pacotes.length, openCases: cases.filter((c) => c.situation !== 'resolvidos').length }}
        onDone={() => guardedNavigate('/clientes')} />
      

      <AppointmentDetailsModal
        appointment={atendimento ? detailsFromCalendar(atendimento.iso, atendimento.appt) : null}
        onClose={() => setAtendimento(null)}
        onStatusChange={(status) => atendimento?.live && setAppointmentStatus(atendimento.iso, atendimento.appt.id, status)}
        onRescheduled={(data) => {
          if (!atendimento?.live) return { ok: false, message: 'Este atendimento é antigo e só pode ser consultado.' };
          return moveAppointment(atendimento.iso, atendimento.appt.id, data);
        }} />
      
    </DashboardLayout>);

}