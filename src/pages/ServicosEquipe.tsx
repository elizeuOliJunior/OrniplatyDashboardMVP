import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useScreenInit } from '../useScreenInit.js';
import { markConfigured } from '../data/exampleRecords';
import { tabListNoScroll } from '../components/ui/styles';
import { PlusIcon } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Button } from '../components/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/Tabs';
import { ScrollableTabs } from '../components/ui/ScrollableTabs';
import { servicosEquipeTabs } from '../data/servicosEquipe';
import type { TeamMember } from '../data/equipeFuncionamento';
import { saveMember, setMembers, useTeam } from '../data/availability';
import { getAgendaState } from '../data/agendaLive';
import { professionalLinkChanges, saveService, setCategories, setProfessionalServices, setServiceActive, useServices } from '../data/servicesStore';
import type { ServiceItem } from '../data/servicesStore';
import { ServicoModal } from '../components/servicos/ServicoModal';
import { CategoriasModal } from '../components/servicos/CategoriasModal';
import { ServicosTab } from '../components/servicos/ServicosTab';
import { ProfissionalModal } from '../components/servicos/ProfissionalModal';
import { useToast } from '../components/ui/Toast';
import { EquipeTab } from '../components/servicos/EquipeTab';
import { FuncionamentoTab } from '../components/servicos/FuncionamentoTab';
import type { SaveInfo } from '../components/servicos/ProfissionalModal';
import { addServiceConflicts, pruneServiceConflicts } from '../data/serviceConflicts';
import type { ServiceConflictRecord } from '../data/serviceConflicts';
import { serviceConflictStillValid } from '../data/serviceArchiveImpact';
import { getServices } from '../data/servicesStore';
import { agendaLink, revealElement } from '../data/deepLinks';
import { TODAY_ISO } from '../data/agendaStore';
import { hasActiveGroupService } from '../data/servicesStore';
import { TurmasTab } from '../components/servicos/TurmasTab';
import { TurmaModal } from '../components/servicos/TurmaModal';
import { setTurmaActive, useTurmas, turmaWhen } from '../data/turmas';
import type { Turma } from '../data/turmas';

/** O serviço já foi usado em algum agendamento (qualquer data)? Então só arquiva, nunca apaga. */
const serviceHasHistory = (name: string) => Object.values(getAgendaState().appointments).some((list) => list.some((a) => a.service === name));
/** Agendamentos de hoje em diante do profissional, ainda não fechados (os que vão para "Conflitos a resolver" ao arquivar). */
const futureOfPro = (id: string) =>
Object.entries(getAgendaState().appointments).
filter(([iso]) => iso >= TODAY_ISO).
reduce((n, [, list]) => n + list.filter((a) => a.professionalId === id && a.status !== 'cancelled' && a.status !== 'completed' && a.status !== 'no_show').length, 0);

/**
 * Serviços e equipe (repaginada em 19/10/2026). Três abas:
 *  - Serviços: tabela por categoria; cada serviço ensina a assistente (descrição, outros nomes, preparo, FAQ…).
 *  - Equipe: tabela de profissionais; o perfil abre em abas (Dados, Serviços, Jornada, Ausências, Intervalo).
 *  - Funcionamento: horário, feriados, pausas coletivas, regras, encaixes, conflitos e resumo dos intervalos.
 * Serviços e profissionais vêm de stores únicos (data/servicesStore.ts e data/availability.ts), lidos por toda a agenda.
 * Rodada de 11/11/2026 (decisões do Christian): "+ Novo serviço" e "+ Novo profissional" ficam à direita da barra da
 * lista de cada aba (no lugar do antigo "Gerenciar categorias", que agora fica só dentro da janela do serviço).
 */
export function ServicosEquipe() {
  const toast = useToast();
  const screenInit = useScreenInit();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState<string>(params.get('aba') ?? screenInit.servicosTab ?? 'servicos');
  const { services, categories } = useServices();
  const { members: team } = useTeam();
  const [serviceModal, setServiceModal] = useState(false);
  const [serviceTab, setServiceTab] = useState<string | undefined>();
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [categoriesModal, setCategoriesModal] = useState(false);
  const [proModal, setProModal] = useState(false);
  const [proTab, setProTab] = useState<string | undefined>();
  const [editingPro, setEditingPro] = useState<TeamMember | null>(null);
  const [proFocusPhone, setProFocusPhone] = useState(false);
  /** Serviço novo que já abre com o tipo escolhido (W2, A3-05: "Cadastrar serviço de Avaliação"). */
  const [newKind, setNewKind] = useState<ServiceItem['kind'] | undefined>();
  /** CONTRATO NOVO (aulas em grupo, 23/11/2026): aba Turmas só com um serviço em grupo ativo. */
  const showTurmas = hasActiveGroupService(services);
  const pageTabs = servicosEquipeTabs.filter((t) => t.value !== 'turmas' || showTurmas);
  useEffect(() => {
    if (tab === 'turmas' && !showTurmas) setTab('servicos');
  }, [tab, showTurmas]);
  const { turmas } = useTurmas();
  const [turmaModal, setTurmaModal] = useState(false);
  const [editingTurma, setEditingTurma] = useState<Turma | null>(null);
  const openTurma = (t: Turma | null) => {
    setEditingTurma(t);
    setTurmaModal(true);
  };

  // Atalhos: /servicos-equipe?aba=servicos&servico=<id> (IA Orniplaty › Conhecimento: abre em "O que a assistente explica")
  // e, desde o Lote F, &secao=pagamento (pílula-link da Empresa: abre na aba Pagamento e destaca a 1ª regra diferente).
  // G2 (F-030): id inexistente avisa ("Serviço não encontrado") e mostra a lista; depois de abrir (ou avisar), o
  // `servico`/`secao` sai do endereço (sem novo item no histórico), para o MESMO atalho funcionar de novo depois de
  // fechar a janela, sem precisar de outro texto no endereço nem recarregar.
  const navigate = useNavigate();
  useEffect(() => {
    const id = params.get('servico');
    if (!id) return;
    const s = services.find((x) => x.id === id);
    setTab('servicos');
    if (s) {
      setEditingService(s);
      setServiceTab(params.get('secao') === 'pagamento' ? 'pagamento' : 'assistente');
      setServiceModal(true);
    } else {
      toast({ title: 'Serviço não encontrado', description: 'O atalho aponta para um serviço que não existe mais. Esta é a lista de serviços.', tone: 'warning' });
    }
    const rest = new URLSearchParams(location.search);
    rest.delete('servico');
    rest.delete('secao');
    rest.set('aba', 'servicos');
    navigate(`${location.pathname}?${rest.toString()}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.key]);

  const openService = (s: ServiceItem | null, t?: string, kind?: ServiceItem['kind']) => {
    setEditingService(s);
    setServiceTab(t);
    setNewKind(kind);
    setServiceModal(true);
  };
  const openPro = (m: TeamMember | null, t?: string, focusPhone = false) => {
    setEditingPro(m);
    setProTab(t);
    setProFocusPhone(focusPhone);
    setProModal(true);
  };
  /** W2 (D-A3-1): grava os conflitos da mudança e tira os que deixaram de valer com o serviço como ficou. */
  const syncServiceConflicts = (records: ServiceConflictRecord[]) => {
    const now = getServices().services;
    pruneServiceConflicts((r) => serviceConflictStillValid(r, now.find((x) => x.id === r.serviceId)));
    addServiceConflicts(records);
  };
  // L11 (meta 2): um nome só, "Falta resolver" (Notificações da agenda); o botão abre a Agenda nas notificações, como o
  // aviso do "Bloquear horário ou folga" desde o L3. Antes: "Conflitos a resolver" + "Ver conflitos" (Funcionamento).
  const conflictsLine = (n: number) => n === 1 ? '1 agendamento ficou em “Falta resolver”.' : `${n} agendamentos ficaram em “Falta resolver”.`;
  const goConflicts = {
    label: 'Ver quem falta resolver',
    onClick: () => navigate('/agenda?secao=notificacoes')
  };

  return (
    <DashboardLayout
      activeId="servicos-equipe"
      title="Serviços e equipe"
      subtitle="O que você oferece, quem faz e quando. É com isso que a assistente responde e agenda os clientes.">
      
      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <ScrollableTabs>
          <TabsList aria-label="Seções de serviços e equipe" className={`min-w-max ${tabListNoScroll}`}>
            {pageTabs.map((t) =>
            <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            )}
          </TabsList>
        </ScrollableTabs>

        <TabsContent value="servicos" className="mt-5">
          <ServicosTab
            services={services}
            categories={categories}
            members={team}
            onOpen={(s, t) => openService(s, t)}
            action={
            <Button leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => openService(null)}>
                Novo serviço
              </Button>
            } />
          
        </TabsContent>
        {showTurmas &&
        <TabsContent value="turmas" className="mt-5">
            <TurmasTab
            turmas={turmas}
            services={services}
            members={team}
            onOpen={openTurma}
            action={
            <Button leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => openTurma(null)}>
                  Nova turma
                </Button>
            } />
          
          </TabsContent>
        }
        <TabsContent value="equipe" className="mt-5">
          <EquipeTab
            members={team}
            services={services}
            onOpen={(m, t, focusPhone) => openPro(m, t, !!focusPhone)}
            action={
            <Button leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => openPro(null)}>
                Novo profissional
              </Button>
            } />
          
        </TabsContent>
        <TabsContent value="funcionamento" className="mt-5">
          <FuncionamentoTab
            onGoTeam={() => setTab('equipe')}
            onEditBuffer={(id) => {
              const m = team.find((x) => x.id === id);
              if (m) openPro(m, 'intervalo');
            }} />
          
        </TabsContent>
      </Tabs>

      <ServicoModal
        open={serviceModal}
        onClose={() => setServiceModal(false)}
        editing={editingService}
        initialTab={serviceTab}
        categories={categories}
        services={services}
        members={team}
        hasHistory={(id) => serviceHasHistory(services.find((s) => s.id === id)?.name ?? '')}
        initialKind={newKind}
        onManageCategories={() => setCategoriesModal(true)}
        onNewEvaluation={() => window.setTimeout(() => openService(null, 'basico', 'avaliacao'), 50)}
        onSave={(s, conflicts) => {
          const prosChanged = professionalLinkChanges(s);
          saveService(s);
          markConfigured('servico', s.id);
          prosChanged.forEach((id) => markConfigured('profissional', id));
          syncServiceConflicts(conflicts);
          toast({
            title: editingService ? 'Serviço atualizado' : 'Serviço adicionado',
            description: conflicts.length ? `A agenda, os formulários e a assistente já usam o serviço. ${conflictsLine(conflicts.length)}` : 'A agenda, os formulários e a assistente já usam o serviço.',
            ...(conflicts.length ? { action: goConflicts } : {})
          });
        }}
        onArchive={(id, active, conflicts = []) => {
          setServiceActive(id, active);
          markConfigured('servico', id);
          syncServiceConflicts(conflicts);
          toast({
            title: active ? 'Serviço reativado' : 'Serviço arquivado',
            description: active ? 'Volta a aparecer nas listas de agendamento.' : `A assistente deixa de oferecer e ele sai das listas de agendamento. O histórico continua igual.${conflicts.length ? ` ${conflictsLine(conflicts.length)}` : ''}`,
            tone: 'info',
            ...(conflicts.length ? { action: goConflicts } : {})
          });
        }} />
      

      <TurmaModal
        open={turmaModal}
        onClose={() => setTurmaModal(false)}
        editing={editingTurma}
        services={services}
        members={team}
        onSaved={(t, isNew) => {
          const s = services.find((x) => x.id === t.serviceId);
          const pro = team.find((m) => m.id === t.professionalId);
          toast({ title: isNew ? 'Turma adicionada' : 'Turma atualizada', description: `${s?.name ?? 'Turma'}: ${turmaWhen(t).toLowerCase()}${pro ? `, com ${pro.name}` : ''}.` });
        }}
        onArchive={(t, active) => {
          setTurmaActive(t.id, active);
          toast({
            title: active ? 'Turma reativada' : 'Turma arquivada',
            description: active ? 'Volta para a lista de turmas.' : 'Sai da lista de turmas. Os clientes inscritos ficam guardados e voltam se você reativar.',
            tone: 'info'
          });
        }} />
      

      <CategoriasModal
        open={categoriesModal}
        onClose={() => setCategoriesModal(false)}
        categories={categories}
        services={services}
        onSave={(list) => {
          setCategories(list);
          toast({ title: 'Categorias salvas', description: 'A lista de serviços segue a nova ordem.' });
        }} />
      

      <ProfissionalModal
        open={proModal}
        onClose={() => setProModal(false)}
        editing={editingPro}
        initialTab={proTab}
        focusWhatsApp={proFocusPhone}
        services={services}
        onSave={(member, serviceIds, info: SaveInfo) => {
          saveMember(member);
          markConfigured('profissional', member.id);
          setProfessionalServices(member.id, serviceIds).forEach((id) => markConfigured('servico', id));
          // W2 (A3-10, A1-05): a mensagem diz o que mudou de fato e, se houver, quantos agendamentos ficaram em conflito.
          const parts: string[] = [];
          if (!editingPro) parts.push(`${member.name} já aparece na agenda.`);
          if (info.phoneAdded) parts.push(`WhatsApp salvo. ${member.name} passa a receber os avisos.`);
          if (info.scheduleChanged) parts.push('A agenda já usa os novos horários.');
          if (info.conflicts > 0) parts.push(info.conflicts === 1 ? '1 agendamento ficou em conflito.' : `${info.conflicts} agendamentos ficaram em conflito.`);
          if (!parts.length) parts.push(`Dados de ${member.name} salvos.`);
          const first = info.firstConflict;
          toast({
            title: editingPro ? 'Profissional atualizado' : 'Profissional adicionado',
            description: parts.join(' '),
            ...(first ? { tone: 'warning' as const, action: { label: 'Ver na Agenda', onClick: () => navigate(agendaLink({ date: first.iso, appointmentId: first.apptId })) } } : {})
          });
        }}
        onArchive={(member, active) => {
          setMembers((list) => list.map((m) => m.id === member.id ? { ...m, active } : m));
          markConfigured('profissional', member.id);
          const future = active ? 0 : futureOfPro(member.id);
          toast({
            title: active ? `${member.name} reativado` : `${member.name} arquivado`,
            description: active ? 'Volta a receber agendamentos.' : `Sai das listas de agendamento. Nada foi cancelado.${future ? ` ${conflictsLine(future)}` : ''}`,
            tone: 'info',
            ...(future ? { action: goConflicts } : {})
          });
        }} />
      
    </DashboardLayout>);

}