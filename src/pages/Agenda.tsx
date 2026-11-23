import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDownIcon } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { addDaysIso, addMonthsIso, locateIso, monthLabel } from '../components/agenda/AgendaDateNav';
import type { AgendaView } from '../components/agenda/AgendaDateNav';
import { AgendaToolbar } from '../components/agenda/AgendaToolbar';
import { AgendaHeaderActions } from '../components/agenda/AgendaHeaderActions';
import { AgendaPeriodNumbers } from '../components/agenda/AgendaPeriodNumbers';
import { DayCalendar } from '../components/agenda/DayCalendar';
import { MonthCalendar } from '../components/agenda/MonthCalendar';
import { WeekCalendar } from '../components/agenda/WeekCalendar';
import { WaitlistPanel } from '../components/agenda/WaitlistPanel';
import { AgendaAssistant } from '../components/agenda/AgendaAssistant';
import { ClosureRow, ConflictRow, EnterMotion, ExpandMotion, NotifyRow, ResolvedRow } from '../components/agenda/AttentionRows';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/Tabs';
import { TabsBar } from '../components/Card';
import { CountBadge } from '../components/CountBadge';
import { tabListNoScroll } from '../components/ui/styles';
import { ChangeNoticePanel } from '../components/agenda/WaitlistConversationPanel';
import type { ChangeChatTarget } from '../components/agenda/WaitlistConversationPanel';
import { NoActiveProfessionals } from '../components/agenda/NoActiveProfessionals';
import { NovoAgendamentoModal } from '../components/modals/NovoAgendamentoModal';
import type { AgendamentoDefaults } from '../components/modals/NovoAgendamentoModal';
import { BloquearHorarioModal } from '../components/modals/BloquearHorarioModal';
import type { HorarioBloqueado } from '../components/modals/BloquearHorarioModal';
import { AppointmentDetailsModal } from '../components/modals/AppointmentDetailsModal';
import { detailsFromCalendar } from '../components/modals/appointmentDetailsFromCalendar';
import { useToast } from '../components/ui/Toast';
import { StatusPill } from '../components/ui/StatusPill';
import { NoticeBanner, NotificationIcon, groupActionHoverClass } from '../components/ui/Notice';
import { twMerge } from 'tailwind-merge';
import { assistantStopNotice } from '../data/assistantStopNotice';
import { useSettings } from '../data/settingsStore';
import { actionClass } from '../components/ui/actionStyles';
import { serviceByLabel } from '../data/catalogo';
import { cancelAppointment, getAgendaState, moveAppointment, removeAppointment, setAppointmentStatus as setStatus, setBlocks, tryAddAppointment, undoCancel, useAgendaData } from '../data/agendaLive';
import type { AddResult } from '../data/agendaLive';
import { activeAgendaProfessionals, clinicDay, scheduleConflicts, useTeam } from '../data/availability';
import type { ScheduleConflict } from '../data/availability';
import { getAgendaPrefs, setAgendaPrefs, useAgendaPrefs } from '../data/agendaPrefs';
import { isIsoDate, revealElement } from '../data/deepLinks';
import { BlockDetailsModal } from '../components/agenda/BlockDetailsModal';
import type { CalBlock } from '../data/agendaStore';
import { pendingClosures } from '../data/legado';
import { TODAY_ISO, isoFor, longDayLabel, shortDayParts, weekRangeLabel } from '../data/agendaStore';
import type { CalAppointment } from '../data/agendaStore';
import { caseOf, changeMessage, changeText, markNoAnswer, markNotified, removeCase, restoreCase, syncConflicts, useConflictCases } from '../data/conflictCases';
import type { ConflictCase } from '../data/conflictCases';
import { clientIdOfRecordedName } from '../data/api/clientes';
import { toMinutes } from '../utils/time';
import { useScreenInit } from '../useScreenInit.js';
import { AulaModal } from '../components/agenda/AulaModal';
import { aulaAppointment, aulaByKey, aulaRefOf, useAulasVersion, withAulas } from '../data/aulas';

const TODAY_INDEX = 3; // Thursday of the sample week

/**
 * P2 (13/11/2026, facilidade de uso): a Lista de espera virou a ABA "Lista de espera" no topo da Agenda (antes era um
 * bloco abaixo do calendário, alcançado rolando a página). `secao=lista-espera` no endereço = aba aberta: todos os links
 * que já existiam (cartão do Início, sino, avisos) abrem a aba, e recarregar o mesmo endereço mantém a aba. Trocar de
 * aba grava/limpa só esse parâmetro (`replace`), sem outra mudança na Agenda.
 */
const WAITLIST_SECTION_ID = 'agenda-lista-espera';
type AgendaTab = 'agenda' | 'lista-espera';
/** W9b (J-04): bloco "Notificações da agenda" (destino de /agenda?secao=notificacoes). */
const NOTIFICATIONS_SECTION_ID = 'agenda-notificacoes-bloco';

type Selected = {iso: string;appt: CalAppointment;};

/**
 * Dia anterior/seguinte. Por padrão a Agenda percorre TODOS os dias (sábado e domingo incluídos).
 * Com "Ocultar dias sem atendimento" ligado, as setas pulam datas em que a clínica está fechada (até 60 dias);
 * o calendário de datas continua abrindo qualquer data.
 */
function stepDay(iso: string, step: number, skipClosed: boolean) {
  let next = addDaysIso(iso, step);
  if (!skipClosed) return next;
  for (let i = 0; i < 60 && !clinicDay(next).open; i++) next = addDaysIso(next, step);
  return clinicDay(next).open ? next : addDaysIso(iso, step);
}

const isPending = (a: CalAppointment) => a.status === 'pending_confirmation';
/** W3 (rodada 2): só a primeira letra minúscula ("Remarcado para… com Juliana", sem baixar o nome do profissional). */
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * W3 (11/11/2026, Christian):
 *  - G1/A1-03: "Notificações da agenda" virou a LISTA DE TRABALHO DO DIA: Falta resolver (em conflito) · Falta avisar
 *    (remarcado ou cancelado pela clínica, cliente ainda não sabe; Chamar no WhatsApp · Avisado · Não atendeu) ·
 *    Resolvidos hoje, com contador. Fonte: data/conflictCases.ts.
 *  - G4/A1-10: filtro "Só A confirmar" (Dia e Semana) e o link `#/agenda?data=<AAAA-MM-DD>&filtro=a-confirmar` (combinado 2).
 *  - A1-02: a assistente devolve como DESFAZER cada ação (remarcar, cancelar, agendar).
 *  - Rodada 2: agendar pela lista de espera mostra UM aviso só ("Vaga preenchida" ou "Agendamento criado", da lista).
 * I3 (11/11/2026): o texto de apoio de "Falta resolver" cita também a mudança de serviço ("ou o serviço mudou"), porque a
 *    lista traz esses casos desde a I2.
 */
export function Agenda() {
  const screenInit = useScreenInit();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  // G2 (F-038): a visualização escolhida fica na preferência da Agenda (sessão do protótipo); o seletor de telas vence.
  const [view, setView] = useState<AgendaView>(screenInit.agendaView as AgendaView ?? getAgendaPrefs().view ?? 'dia');
  /**
   * Uma data guia todas as visualizações: o dia em Dia, a semana que a contém em Semana, o mês em Mês.
   * Trocar de visualização ou navegar mantém o filtro de profissionais.
   */
  const [focusIso, setFocusIso] = useState(() => isoFor(0, TODAY_INDEX));
  const { appointments: savedAppointments, blocks, waitlist } = useAgendaData();
  /*
   * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): o calendário desenha as AULAS das turmas junto dos agendamentos, como um
   * cartão cada (data/aulas.ts). Só para desenhar: conflitos, fechamentos, números e links continuam lendo os agendamentos
   * gravados (`savedAppointments`). Datas de 6 semanas antes e depois da data da tela (cobre Dia, Semana e Mês).
   */
  const aulasVersion = useAulasVersion();
  const team = useTeam();
  const appointments = useMemo(() => {
    const isos = Array.from({ length: 85 }, (_, i) => addDaysIso(focusIso, i - 42));
    return withAulas(savedAppointments, isos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAppointments, focusIso, aulasVersion, team]);
  // L4 (16/11/2026, regra 5): o MESMO aviso de “assistente parada” do Início (mesma fonte, título, frase curta e botão).
  const stopNotice = assistantStopNotice(useSettings());
  const tab: AgendaTab = new URLSearchParams(location.search).get('secao') === 'lista-espera' ? 'lista-espera' : 'agenda';
  const changeTab = (next: string) => {
    if (next === tab) return;
    navigate(next === 'lista-espera' ? '/agenda?secao=lista-espera' : '/agenda', { replace: true });
  };
  /** P2: legenda recolhida (fica aberta ou fechada ao trocar Dia/Semana/Mês). */
  const [legendOpen, setLegendOpen] = useState(false);
  const cases = useConflictCases();
  const { hideNonWorkingDays } = useAgendaPrefs();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newMode, setNewMode] = useState<'novo' | 'remarcar'>('novo');
  const [newDefaults, setNewDefaults] = useState<AgendamentoDefaults | undefined>();
  const [reschedule, setReschedule] = useState<{iso: string;id: string;} | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  /** W3 (G4): filtro "Só A confirmar". */
  const [onlyPending, setOnlyPending] = useState(false);
  /** W3 (G1): conversa ao lado com a mensagem pronta de "seu horário mudou". */
  const [changeChat, setChangeChat] = useState<{caseId: string;target: ChangeChatTarget;} | null>(null);
  // G1 (F-003): colunas e filtro vêm da equipe VIVA (ativos). Guardamos quem foi DESMARCADO no filtro, para que um
  // profissional novo já apareça e um arquivado saia na hora, sem o filtro "lembrar" uma lista antiga.
  const activePros = useMemo(() => activeAgendaProfessionals(team.members), [team.members]);
  // G2 (F-038): quem foi desmarcado também fica na preferência da Agenda. Um link direto com `profissional` mostra só
  // esse profissional NESTA visita (`linkHidden`), sem trocar a preferência; mexer no filtro volta a gravar.
  const [hiddenProIds, setHiddenProIds] = useState<string[]>(() => getAgendaPrefs().hiddenProIds);
  const [linkHidden, setLinkHidden] = useState<string[] | null>(null);
  const effectiveHidden = linkHidden ?? hiddenProIds;
  const proIds = activePros.map((p) => p.id).filter((id) => !effectiveHidden.includes(id));
  const setProIds = (next: string[]) => {
    const hidden = activePros.map((p) => p.id).filter((id) => !next.includes(id));
    setLinkHidden(null);
    setHiddenProIds(hidden);
    setAgendaPrefs({ hiddenProIds: hidden });
  };
  const [focusProId, setFocusProId] = useState<string | undefined>();
  const [blockTarget, setBlockTarget] = useState<{date: string;block: CalBlock;} | null>(null);
  const [editingBlock, setEditingBlock] = useState<{date: string;block: CalBlock;} | null>(null);
  const shownPros = activePros.filter((p) => proIds.includes(p.id));

  // P2: `secao=lista-espera` não rola mais nada; abre a aba (acima). Leva a pessoa ao topo da página, onde a aba está.
  // W9b (J-04): `secao=notificacoes` (aviso "Falta avisar" do Início e do sino) abre Notificações da agenda e rola até ela.
  useEffect(() => {
    const secao = new URLSearchParams(location.search).get('secao');
    if (secao === 'notificacoes') {
      setNotificationsOpen(true);
      const n = window.setTimeout(() => document.getElementById(NOTIFICATIONS_SECTION_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      return () => window.clearTimeout(n);
    }
    if (secao === 'lista-espera') window.scrollTo({ top: 0 });
  }, [location.search, location.key]);

  /** W3 (G4, combinado 2): `filtro=a-confirmar` liga o filtro (e a data do link vale, pelo efeito abaixo). */
  useEffect(() => {
    const f = new URLSearchParams(location.search).get('filtro');
    if (f === 'a-confirmar') setOnlyPending(true);else
    if (f) toast({ title: 'Link com destino inválido', description: `O filtro do link (${f}) não existe. A Agenda mostra todos os agendamentos.`, tone: 'warning' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.key]);

  const currentIso = focusIso;
  const weekOffset = locateIso(focusIso).week;

  const periodLabel = view === 'dia' ? longDayLabel(currentIso) : view === 'semana' ? weekRangeLabel(weekOffset) : monthLabel(currentIso);
  const atToday = view === 'dia' ? currentIso === TODAY_ISO : view === 'semana' ? weekOffset === locateIso(TODAY_ISO).week : currentIso.slice(0, 7) === TODAY_ISO.slice(0, 7);

  const changeView = (next: AgendaView) => {
    setView(next);
    setAgendaPrefs({ view: next });
  };

  /*
   * G2 (F-032): link direto `#/agenda?data=AAAA-MM-DD(&profissional=<id>)(&agendamento=<id> | &bloqueio=<id>)`.
   * O alvo explícito vence a preferência salva (vista e filtro) só nesta visita. O item é achado pelo ID (nunca pelo nome
   * do cliente); com item, a data é a do item. Data malformada, id inexistente ou profissional fora da equipe ativa:
   * aviso explícito e volta segura (hoje / todos), nunca outra data ou outro item em silêncio.
   * W3 (G4): com `filtro=a-confirmar` e sem outro alvo, a vista Dia na data do link.
   */
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const rawDate = q.get('data');
    const proParam = q.get('profissional');
    const apptParam = q.get('agendamento');
    const blockParam = q.get('bloqueio');
    if (!rawDate && !proParam && !apptParam && !blockParam) return;
    const notices: string[] = [];
    let date: string | null = null;
    if (rawDate) {
      if (isIsoDate(rawDate)) date = rawDate;else
      notices.push(`A data do link (${rawDate}) não é válida. A Agenda abriu hoje.`);
    }
    let pro = proParam ? activePros.find((p) => p.id === proParam) : undefined;
    if (proParam && !pro) notices.push('O profissional do link não está na equipe ativa. A Agenda mostra todos.');
    let targetEl: string | null = null;
    let itemPro: string | undefined;
    let targetAppt: {iso: string;appt: CalAppointment;} | null = null;
    if (apptParam) {
      const found = Object.entries(savedAppointments).flatMap(([iso, list]) => list.filter((a) => a.id === apptParam).map((appt) => ({ iso, appt })))[0];
      if (!found) notices.push('Agendamento não encontrado. Ele pode ter sido removido; nada foi selecionado.');else
      {
        if (date && date !== found.iso) notices.push(`Esse agendamento está em ${found.iso.split('-').reverse().slice(0, 2).join('/')}. A Agenda abriu essa data.`);
        date = found.iso;
        targetAppt = found;
        targetEl = `agenda-appt-${found.appt.id}`;
        itemPro = found.appt.professionalId;
      }
    } else if (blockParam) {
      const found = Object.entries(blocks).flatMap(([iso, list]) => list.filter((b) => b.id === blockParam).map((block) => ({ iso, block })))[0];
      if (!found) notices.push('Bloqueio não encontrado. Ele pode ter sido removido; nada foi selecionado.');else
      {
        date = found.iso;
        targetEl = `agenda-block-${found.block.id}`;
        itemPro = found.block.professionalId ?? undefined;
      }
    }
    setFocusIso(date ?? TODAY_ISO);
    setView('dia');
    // `profissional` explícito: só ele nesta visita. Item sem `profissional`: a preferência fica, mas a coluna do item
    // nunca fica escondida pelo filtro salvo (o alvo explícito vence).
    if (pro) setLinkHidden(activePros.map((p) => p.id).filter((id) => id !== pro!.id && id !== itemPro));else
    if (proParam) setLinkHidden([]);else
    if (itemPro) setLinkHidden(hiddenProIds.filter((id) => id !== itemPro));else
    setLinkHidden(null);
    setFocusProId(itemPro ?? pro?.id);
    if (notices.length) toast({ title: notices.length > 1 ? 'Alguns itens do link não foram encontrados' : 'Link com destino inválido', description: notices.join(' '), tone: 'warning' });
    if (!targetEl) return;
    const appt = targetAppt;
    return revealElement(targetEl, {
      // Cancelado com outro horário por cima não é desenhado na grade: abre os detalhes em vez de selecionar outro item.
      onMissing: () => appt && setSelected(appt)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.key]);
  const move = (step: number) => setFocusIso((iso) => view === 'dia' ? stepDay(iso, step, hideNonWorkingDays) : view === 'semana' ? addDaysIso(iso, step * 7) : addMonthsIso(iso, step));
  const goToday = () => setFocusIso(TODAY_ISO);
  // O calendário de datas abre QUALQUER data, inclusive fins de semana e dias fechados (que ficam visíveis, sem oferecer horário)
  const pickDate = (iso: string) => setFocusIso(iso);
  const openDay = (iso: string) => {
    setFocusIso(iso);
    changeView('dia');
  };

  // Semana: SEMPRE segunda a domingo. A preferência só esconde dias em que a clínica está fechada (a disponibilidade não muda).
  const { weekColumns, hiddenDays } = useMemo(() => {
    const all = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const iso = isoFor(weekOffset, i);
      const parts = shortDayParts(iso);
      const list = appointments[iso] ?? [];
      return { iso, label: parts.label, date: parts.date, isToday: iso === TODAY_ISO, appointments: onlyPending ? list.filter(isPending) : list };
    });
    if (!hideNonWorkingDays) return { weekColumns: all, hiddenDays: [] as typeof all };
    return { weekColumns: all.filter((d) => clinicDay(d.iso).open), hiddenDays: all.filter((d) => !clinicDay(d.iso).open) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, appointments, hideNonWorkingDays, team.hours, team.blocks, onlyPending]);

  /** W3 (G4): quantos "A confirmar" no período mostrado (só dos profissionais do filtro). */
  const pendingCount = useMemo(() => {
    const isos = view === 'semana' ? [0, 1, 2, 3, 4, 5, 6].map((i) => isoFor(weekOffset, i)) : [currentIso];
    return isos.reduce((n, iso) => n + (appointments[iso] ?? []).filter((a) => isPending(a) && proIds.includes(a.professionalId)).length, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, weekOffset, currentIso, appointments, proIds.join(',')]);

  // Agendamentos futuros que ficaram em cima de pausa, bloqueio, folga ou fora do horário configurado: nada é cancelado nem movido
  const conflicts = useMemo(() => {
    const base = scheduleConflicts({ appointments: savedAppointments, blocks });
    const seen = new Set(base.map((c) => c.appt.id));
    const underBlock: ScheduleConflict[] = [];
    Object.entries(blocks).forEach(([iso, list]) => {
      if (iso < TODAY_ISO) return;
      (savedAppointments[iso] ?? []).forEach((a) => {
        if (seen.has(a.id) || a.status === 'cancelled' || a.status === 'completed' || a.status === 'no_show') return;
        const b = list.find(
          (x) => (x.professionalId === null || x.professionalId === a.professionalId) && toMinutes(a.start) < toMinutes(x.end) && toMinutes(x.start) < toMinutes(a.end)
        );
        if (b) {
          seen.add(a.id);
          underBlock.push({ iso, appt: a, kind: 'block', message: `Horário bloqueado das ${b.start} às ${b.end} (${b.label}).` });
        }
      });
    });
    return [...base, ...underBlock].sort((x, y) => (x.iso + x.appt.start).localeCompare(y.iso + y.appt.start));
  }, [savedAppointments, blocks, team]);

  // W3 (G1): cada conflito vira um caso da lista do dia; o que deixou de conflitar fecha ou vai para "Falta avisar".
  useEffect(() => {
    syncConflicts(conflicts, savedAppointments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflicts]);
  const toNotify = cases.filter((c) => c.state === 'avisar');
  const resolved = cases.filter((c) => c.state === 'resolvido');
  // Quando um caso entra em "Falta avisar", a lista abre sozinha: a próxima tarefa fica à vista.
  const notifyCount = useRef(toNotify.length);
  useEffect(() => {
    if (toNotify.length > notifyCount.current) setNotificationsOpen(true);
    notifyCount.current = toNotify.length;
  }, [toNotify.length]);
  /*
   * P2 (13/11/2026): "Notificações da agenda" abre sozinha quando há pelo menos um "Falta resolver" ou "Falta avisar"
   * (ao abrir a Agenda e quando entra um conflito novo); sem nenhum dos dois, começa fechada. Fechar à mão continua valendo.
   */
  const resolveCount = useRef(0);
  const checkedOnLoad = useRef(false);
  useEffect(() => {
    if (!checkedOnLoad.current) {
      checkedOnLoad.current = true;
      if (conflicts.length > 0 || toNotify.length > 0) setNotificationsOpen(true);
    } else if (conflicts.length > resolveCount.current) setNotificationsOpen(true);
    resolveCount.current = conflicts.length;
  }, [conflicts.length, toNotify.length]);
  /** P2: itens que entram com a lista já aberta ganham a animação de entrada; os que já estavam, não. */
  const seenItems = useRef<Set<string> | null>(null);
  const listWasOpen = useRef(false);

  // Passou do horário e ninguém registrou comparecimento nem falta (derivado, nunca presumido)
  const pending = useMemo(() => pendingClosures(savedAppointments), [savedAppointments]);

  /*
   * G1 (ajuste do F-003, 23/10/2026): sem NENHUM profissional ativo a grade fica sem colunas, porque a fonte canônica
   * continua sendo a equipe ativa (a lista fixa antiga não volta). Em vez da grade vazia, a Agenda explica o motivo e
   * lista os agendamentos já marcados no período mostrado (dia, semana ou mês); os conflitos seguem em Notificações.
   */
  const noActivePros = activePros.length === 0;
  const orphanItems = useMemo(() => {
    if (!noActivePros) return [];
    const isos =
    view === 'dia' ?
    [currentIso] :
    view === 'semana' ?
    [0, 1, 2, 3, 4, 5, 6].map((i) => isoFor(weekOffset, i)) :
    Object.keys(savedAppointments).filter((iso) => iso.slice(0, 7) === currentIso.slice(0, 7));
    const conflictOf = new Map(conflicts.map((c) => [c.appt.id, c.message]));
    return isos.
    flatMap((iso) => (savedAppointments[iso] ?? []).map((appt) => ({ iso, appt, conflict: conflictOf.get(appt.id) }))).
    sort((x, y) => (x.iso + x.appt.start).localeCompare(y.iso + y.appt.start));
  }, [noActivePros, view, currentIso, weekOffset, savedAppointments, conflicts]);
  const showConflicts = () => {
    setNotificationsOpen(true);
    window.setTimeout(() => document.getElementById('agenda-notificacoes')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  const afterSaveRef = useRef<(() => void) | null>(null);
  /** G3 (F-045): o agendamento nasce da lista de espera (grava `fromWaitlist`). */
  const fromWaitlistRef = useRef(false);
  /** W3 (rodada 2): vindo da lista de espera, quem mostra o aviso é a lista (um aviso só). */
  const [silentNew, setSilentNew] = useState(false);
  const openNew = (defaults?: AgendamentoDefaults, mode: 'novo' | 'remarcar' = 'novo', afterSave?: () => void, resched?: {iso: string;id: string;}, fromWaitlist = false) => {
    afterSaveRef.current = afterSave ?? null;
    fromWaitlistRef.current = fromWaitlist;
    setSilentNew(mode === 'novo' && fromWaitlist);
    setReschedule(resched ?? null);
    setNewDefaults({ date: currentIso, ...defaults });
    setNewMode(mode);
    setNewOpen(true);
  };

  const fail = (title: string, r: AddResult) => {
    if (!r.ok) toast({ title, description: r.message, tone: 'info' });
    return r;
  };

  const addBlock = (b: HorarioBloqueado) =>
  setBlocks((map) => ({
    ...map,
    [b.date]: [
    ...(map[b.date] ?? []),
    { id: `b${Date.now()}`, professionalId: b.whoId === 'todos' ? null : b.whoId, start: b.from, end: b.to, label: `Bloqueado · ${b.reason.toLowerCase()}` }]

  }));

  /** G2 (F-036): edição de um bloqueio manual (mesmo id; muda de data se a data mudou). */
  const updateBlock = (b: HorarioBloqueado) =>
  setBlocks((map) => {
    const from = b.previousDate ?? b.date;
    const kept = (map[from] ?? []).filter((x) => x.id !== b.id);
    const next = { ...map, [from]: kept };
    next[b.date] = [
    ...(b.date === from ? kept : next[b.date] ?? []),
    { id: b.id!, professionalId: b.whoId === 'todos' ? null : b.whoId, start: b.from, end: b.to, label: `Bloqueado · ${b.reason.toLowerCase()}` }];

    return next;
  });

  /** W3 (A1-02): desfazer também devolve o caso da lista do dia como estava antes da ação. */
  const caseUndo = (id: string) => {
    const before = caseOf(id);
    return () => before ? restoreCase(before) : removeCase(id);
  };

  /** W3 (G1): abre o agendamento de um caso (onde ele estiver agora). */
  const openCase = (c: ConflictCase) => {
    // G2 (aulas em grupo; CONTRATO NOVO): caso de um cliente de uma aula abre a janela da aula.
    if (c.aulaKey) {
      const a = aulaByKey(c.aulaKey);
      if (a) setSelected({ iso: a.iso, appt: aulaAppointment(a) });
      return;
    }
    const found = Object.entries(getAgendaState().appointments).flatMap(([iso, l]) => l.filter((a) => a.id === c.id).map((appt) => ({ iso, appt })))[0];
    if (found) setSelected(found);
  };
  const notified = (c: ConflictCase) => {
    const before = markNotified(c.id);
    toast({ title: 'Cliente avisado', description: `${c.client} · caso resolvido. Ele continua em “Resolvidos hoje”.`, action: before ? { label: 'Desfazer', onClick: () => restoreCase(before) } : undefined });
  };
  const noAnswer = (c: ConflictCase) => {
    const before = markNoAnswer(c.id);
    toast({ title: 'Tentativa registrada', description: `${c.client} não atendeu. O caso continua em “Falta avisar”.`, tone: 'info', action: before ? { label: 'Desfazer', onClick: () => restoreCase(before) } : undefined });
  };
  const chat = (c: ConflictCase) =>
  setChangeChat({ caseId: c.id, target: { clientId: clientIdOfRecordedName(c.client) ?? c.client, clientName: c.client, message: changeMessage(c), what: lowerFirst(changeText(c)) } });

  // G2 (aulas em grupo; CONTRATO NOVO): cartão de aula abre a janela da aula, não os detalhes do agendamento.
  const selectedAulaKey = selected ? aulaRefOf(selected.appt)?.key ?? null : null;
  const details = selected && !selectedAulaKey ? detailsFromCalendar(selected.iso, selected.appt) : null;

  // Dias fechados escondidos na semana que têm agendamentos: aparecem como contador no próprio botão (sem faixa extra)
  const hiddenWithAppts = hiddenDays.filter((d) => d.appointments.some((a) => proIds.includes(a.professionalId) && a.status !== 'cancelled'));

  const toolbar =
  <AgendaToolbar
    view={view}
    onViewChange={changeView}
    periodLabel={periodLabel}
    currentIso={currentIso}
    atToday={atToday}
    onToday={goToday}
    onPrev={() => move(-1)}
    onNext={() => move(1)}
    onPickDate={pickDate}
    professionals={activePros}
    selectedIds={proIds}
    onSelectedIds={setProIds}
    hideNonWorkingDays={hideNonWorkingDays}
    onHideNonWorkingDaysChange={(value) => setAgendaPrefs({ hideNonWorkingDays: value })}
    hiddenWithAppointments={hiddenWithAppts.length}
    onlyPending={onlyPending}
    onOnlyPendingChange={setOnlyPending}
    pendingCount={pendingCount}
    legendOpen={legendOpen}
    onLegendOpenChange={setLegendOpen}
    // L18 (rodada 4, pedido do Christian): os dois botões da página dentro do cartão, no fim da linha 1 da barra.
    actions={<AgendaHeaderActions onNew={() => openNew()} onBlock={() => setBlockOpen(true)} />} />;



  const dayAppointments = (appointments[currentIso] ?? []).filter((a) => !onlyPending || isPending(a));
  const hasNotifications = pending.length > 0 || conflicts.length > 0 || toNotify.length > 0 || resolved.length > 0;
  const itemIds = [...pending.map((c) => `p-${c.appt.id}`), ...conflicts.map((c) => `c-${c.appt.id}`), ...toNotify.map((c) => `n-${c.id}`), ...resolved.map((c) => `r-${c.id}`)];
  const isNewItem = (key: string) => listWasOpen.current && !!seenItems.current && !seenItems.current.has(key);
  useEffect(() => {
    seenItems.current = new Set(itemIds);
    listWasOpen.current = notificationsOpen;
  });

  return (
    <DashboardLayout activeId="agenda" title="Agenda" subtitle="Quem você atende, quando, e o que aconteceu">
      {/* L4: assistente parada (WhatsApp desconectado, autorização vencida, limite do mês) = o mesmo aviso do Início,
           acima das abas (vale para as duas). O texto inteiro fica em Configurações. */}
      {stopNotice &&
      <NoticeBanner
        className="mt-6"
        tone="error"
        title={stopNotice.title}
        description={stopNotice.short}
        to={stopNotice.action?.to ?? '/configuracoes'}
        ariaLabel={`${stopNotice.title}. ${stopNotice.action?.label ?? 'Abrir Configurações'}`}
        role="alert"
        action={stopNotice.action ? <span className={twMerge(actionClass('primary', 'md'), 'pointer-events-none', groupActionHoverClass)}>{stopNotice.action.label}</span> : undefined} />

      }
      {/* P2: abas no topo da Agenda (Tabs do DS, como em Clientes).
           L13 (17/11/2026, DS 4.8): a linha é o `TabsBar` do design system no lugar do `div` feito à mão (mesmo layout).
           L18 (17/11/2026, pontos 1 e 3 do Christian): "Bloquear horário ou folga" e "+ Novo agendamento" saíram desta linha
           (apareciam nas duas abas) e foram para a barra do calendário, na aba Agenda. Na Lista de espera, os dois continuam
           no "+ Novo" do topo. Muda o padrão "ação principal no cabeçalho da página", a pedido dele. */}
      <Tabs value={tab} onValueChange={changeTab} className="mt-6">
        <TabsBar>
          <TabsList aria-label="Agenda e lista de espera" className={tabListNoScroll}>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="lista-espera">
              Lista de espera
              <CountBadge count={waitlist.length} size="sm" ariaLabel={`${waitlist.length} aguardando`} className="ml-2" />
            </TabsTrigger>
          </TabsList>
        </TabsBar>

        <TabsContent value="agenda" className="flex flex-col gap-6 pt-6">
        <AgendaAssistant
            ctx={{ appointments: savedAppointments, blocks, currentIso }}
            // G3 (F-048): cada ação devolve o resultado; a assistente só diz "Remarcado/Agendado" quando deu certo.
            // W3 (A1-02): e devolve como desfazer.
            onReschedule={(a) => {
              const undoCase = caseUndo(a.appt.id);
              const service = serviceByLabel(a.appt.service)?.value ?? '';
              const r = moveAppointment(a.fromIso, a.appt.id, { client: a.appt.clientName, service, professional: a.professionalId, date: a.toIso, time: a.time });
              if (!r.ok) return fail('Não foi possível remarcar', r);
              const before = r.before;
              return {
                ok: true as const,
                undo: () => {
                  moveAppointment(a.toIso, a.appt.id, { client: before.appt.clientName, service, professional: before.appt.professionalId, date: before.iso, time: before.appt.start }, { restore: before.appt });
                  undoCase();
                }
              };
            }}
            onCancel={(iso, appt, by) => {
              const undoCase = caseUndo(appt.id);
              const before = (getAgendaState().appointments[iso] ?? []).find((x) => x.id === appt.id);
              cancelAppointment(iso, appt.id, 'Pedido no assistente da Agenda', by);
              return {
                undo: before ?
                () => {
                  undoCancel(iso, before);
                  undoCase();
                } :
                undefined
              };
            }}
            onCreate={(a) => {
              const r = fail('Não foi possível agendar', tryAddAppointment({ client: a.client, service: serviceByLabel(a.service)?.value ?? '', professional: a.professionalId, date: a.iso, time: a.time }));
              return r.ok ? { ok: true as const, undo: () => removeAppointment(a.iso, r.appt.id) } : r;
            }}
            onAdjust={(a) => {
              if (a.kind === 'cancelar') {
                setSelected({ iso: a.iso, appt: a.appt });
                return;
              }
              openNew(
                {
                  client: a.kind === 'remarcar' ? a.appt.clientName : a.client,
                  service: serviceByLabel(a.kind === 'remarcar' ? a.appt.service : a.service)?.value,
                  professional: a.professionalId,
                  date: a.kind === 'remarcar' ? a.toIso : a.iso,
                  time: a.time
                },
                a.kind === 'remarcar' ? 'remarcar' : 'novo',
                undefined,
                a.kind === 'remarcar' ? { iso: a.fromIso, id: a.appt.id } : undefined
              );
            }}
            onOpenNew={(defaults) => openNew(defaults)}
            onOpenBlock={() => setBlockOpen(true)}
            onShowDay={openDay}
            onOpenAppointment={(iso, appt) => setSelected({ iso, appt })} />
          

        {hasNotifications && (
          /* Padrão único de avisos (components/ui/Notice.tsx). O cabeçalho inteiro abre/fecha e reage ao mouse como os botões.
             Ícone = sino de notificações do design system (v2.5), sempre verde-azulado; a gravidade fica nas etiquetas. */
          <section id={NOTIFICATIONS_SECTION_ID} aria-label="Notificações da agenda" className="scroll-mt-6 overflow-hidden rounded-inner border border-border bg-surface transition-colors duration-150 hover:border-focus-ring/50">
            <button
              type="button"
              aria-expanded={notificationsOpen}
              aria-controls="agenda-notificacoes"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="group flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-hover-surface active:bg-active-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
              
              <NotificationIcon />
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-bold text-text-primary">Notificações da agenda</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {pending.length > 0 &&
                  <StatusPill tone="warning" label={`${pending.length} ${pending.length === 1 ? 'fechamento pendente' : 'fechamentos pendentes'}`} />
                  }
                  {conflicts.length > 0 && <StatusPill tone="error" label={`${conflicts.length} falta resolver`} />}
                  {toNotify.length > 0 && <StatusPill tone="warning" label={`${toNotify.length} falta avisar`} />}
                  {resolved.length > 0 && <StatusPill tone="success" label={`${resolved.length} ${resolved.length === 1 ? 'resolvido hoje' : 'resolvidos hoje'}`} />}
                </span>
              </span>
              {/* Visual do botão neutro (o clique é do cabeçalho inteiro) */}
              <span className={`${actionClass('neutral', 'sm')} pointer-events-none group-hover:border-text-muted group-hover:text-text-primary`}>
                {notificationsOpen ? 'Ocultar' : 'Ver notificações'}
                <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${notificationsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </span>
            </button>
            {notificationsOpen &&
            <ExpandMotion id="agenda-notificacoes" className="max-h-[32rem] divide-y divide-border overflow-y-auto border-t border-border">
                {pending.length > 0 &&
              <div className="px-4 pb-1 pt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Fechamentos pendentes <span className="tabular-nums">· {pending.length}</span>
                    </h3>
                    <p className="mt-0.5 text-xs text-text-secondary">O horário passou sem registro de comparecimento ou falta. Nada foi presumido.</p>
                    <ul className="mt-1 divide-y divide-border">
                      {pending.map((c) =>
                  <EnterMotion key={c.appt.id} play={isNewItem(`p-${c.appt.id}`)}>
                          <ClosureRow iso={c.iso} appt={c.appt} onOpen={() => setSelected({ iso: c.iso, appt: c.appt })} />
                        </EnterMotion>
                  )}
                    </ul>
                  </div>
              }
                {conflicts.length > 0 &&
              <div className="px-4 pb-1 pt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Falta resolver <span className="tabular-nums">· {conflicts.length}</span>
                    </h3>
                    <p className="mt-0.5 text-xs text-text-secondary">O horário caiu numa folga, bloqueio, pausa ou fora do horário, ou o serviço mudou. Nada foi cancelado nem movido. Abra, remarque ou cancele; depois, o caso vai para “Falta avisar”.</p>
                    <ul className="mt-1 divide-y divide-border">
                      {conflicts.map((c) =>
                  <EnterMotion key={c.appt.id} play={isNewItem(`c-${c.appt.id}`)}>
                          <ConflictRow iso={c.iso} appt={c.appt} message={c.message} onOpen={() => setSelected({ iso: c.iso, appt: c.appt })} />
                        </EnterMotion>
                  )}
                    </ul>
                  </div>
              }
                {toNotify.length > 0 &&
              <div className="px-4 pb-1 pt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Falta avisar <span className="tabular-nums">· {toNotify.length}</span>
                    </h3>
                    <p className="mt-0.5 text-xs text-text-secondary">A clínica mudou ou cancelou o horário e o cliente ainda não sabe. Quem avisa é a equipe: chame no WhatsApp com a mensagem pronta e marque “Avisado”.</p>
                    <ul className="mt-1 divide-y divide-border">
                      {toNotify.map((c) =>
                  <EnterMotion key={c.id} play={isNewItem(`n-${c.id}`)}>
                          <NotifyRow c={c} onOpen={() => openCase(c)} onChat={() => chat(c)} onNotified={() => notified(c)} onNoAnswer={() => noAnswer(c)} />
                        </EnterMotion>
                  )}
                    </ul>
                  </div>
              }
                {resolved.length > 0 &&
              <div className="px-4 pb-1 pt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Resolvidos hoje <span className="tabular-nums">· {resolved.length}</span>
                    </h3>
                    <ul className="mt-1 divide-y divide-border">
                      {resolved.map((c) =>
                  <EnterMotion key={c.id} play={isNewItem(`r-${c.id}`)}>
                          <ResolvedRow c={c} onOpen={() => openCase(c)} />
                        </EnterMotion>
                  )}
                    </ul>
                  </div>
              }
              </ExpandMotion>
            }
          </section>)
          }

        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-3">
            {/* L18 (ponto 2; rodada 2, pedido do Christian): números do período ACIMA do cartão do calendário, em três
                   cartões compactos. Seguem a barra do calendário (visão, data e profissionais). Rodada 4: os botões da página
                   voltaram para dentro da barra do calendário (`actions` do `AgendaToolbar`). */}
            <AgendaPeriodNumbers view={view} currentIso={currentIso} professionalIds={proIds} />
            {noActivePros ?
              <NoActiveProfessionals
                toolbar={toolbar}
                periodLabel={periodLabel}
                items={orphanItems}
                conflictsCount={conflicts.length}
                onOpen={(iso, appt) => setSelected({ iso, appt })}
                onConflicts={showConflicts}
                onTeam={() => navigate('/servicos-equipe?aba=equipe')} /> :

              view === 'dia' ?
              <DayCalendar
                professionals={shownPros}
                iso={currentIso}
                toolbar={toolbar}
                appointments={dayAppointments}
                blocks={blocks[currentIso] ?? []}
                onAppointmentClick={(appt) => setSelected({ iso: currentIso, appt })}
                onSlotClick={(professionalId, time) => openNew({ professional: professionalId, time })}
                onBlockClick={(block) => setBlockTarget({ date: currentIso, block })}
                focusProfessionalId={focusProId} /> :

              view === 'semana' ?
              <WeekCalendar
                professionals={shownPros}
                toolbar={toolbar}
                days={weekColumns}
                onAppointmentClick={(iso, appt) => setSelected({ iso, appt })}
                onDayClick={openDay}
                onCreateDay={(iso) => openNew({ date: iso })} /> :


              <MonthCalendar
                professionals={shownPros}
                toolbar={toolbar}
                monthIso={currentIso}
                hideClosed={hideNonWorkingDays}
                selectedIso={currentIso}
                appointments={appointments}
                onSelectDay={setFocusIso}
                onOpenDay={openDay}
                onCreateDay={(iso) => openNew({ date: iso })}
                onAppointmentClick={(iso, appt) => setSelected({ iso, appt })} />

              }
          </div>
        </div>
        </TabsContent>

        <TabsContent value="lista-espera" className="pt-6">
          <div id={WAITLIST_SECTION_ID}>
            <WaitlistPanel onSchedule={(defaults, done) => openNew(defaults, 'novo', done, undefined, true)} />
          </div>
        </TabsContent>
      </Tabs>

      <NovoAgendamentoModal
        open={newOpen}
        mode={newMode}
        defaults={newDefaults}
        silentToast={silentNew}
        ignoreAppointmentId={reschedule?.id}
        onClose={() => setNewOpen(false)}
        onSaved={(data) => {
          let r: AddResult;
          if (newMode === 'remarcar') {
            // G2 (F-038): remarca SÓ pelo id do agendamento. Sem id (ou id que não existe mais) nada muda: nunca se
            // escolhe outro agendamento pelo nome do cliente nem se cria um novo no lugar.
            const target = reschedule && (savedAppointments[reschedule.iso] ?? []).some((a) => a.id === reschedule.id) ? reschedule : null;
            r = target ? moveAppointment(target.iso, target.id, data) : { ok: false, message: 'Não foi possível identificar o agendamento a remarcar. Nada mudou na agenda; abra o agendamento e use Remarcar.' };
          } else {
            r = tryAddAppointment(data, fromWaitlistRef.current ? { fromWaitlist: true } : undefined);
          }
          if (r.ok) {
            afterSaveRef.current?.();
            afterSaveRef.current = null;
          }
          return r;
        }} />
      

      <BloquearHorarioModal
        open={blockOpen}
        defaultDate={currentIso}
        editing={editingBlock}
        onClose={() => {
          setBlockOpen(false);
          setEditingBlock(null);
        }}
        onSaved={(b) => b.id ? updateBlock(b) : addBlock(b)} />
      

      <BlockDetailsModal
        target={blockTarget}
        appointments={blockTarget ? savedAppointments[blockTarget.date] ?? [] : []}
        onClose={() => setBlockTarget(null)}
        onEdit={(t) => {
          setBlockTarget(null);
          setEditingBlock(t);
          setBlockOpen(true);
        }}
        onRemove={(t) => {
          setBlockTarget(null);
          setBlocks((map) => ({ ...map, [t.date]: (map[t.date] ?? []).filter((x) => x.id !== t.block.id) }));
          toast({ title: 'Bloqueio removido', description: `${t.block.start} às ${t.block.end} volta a ser oferecido, se estiver dentro do horário. Nenhum agendamento mudou.`, tone: 'info' });
        }} />
      

      <AppointmentDetailsModal
        appointment={details}
        onClose={() => setSelected(null)}
        onStatusChange={(status) => selected && setStatus(selected.iso, selected.appt.id, status)}
        onRescheduled={(data) => selected ? moveAppointment(selected.iso, selected.appt.id, data) : undefined} />
      

      <AulaModal aulaKey={selectedAulaKey} onClose={() => setSelected(null)} />

      <ChangeNoticePanel
        target={changeChat?.target ?? null}
        onClose={() => setChangeChat(null)}
        onNotified={() => {
          const c = changeChat ? caseOf(changeChat.caseId) : undefined;
          if (c) notified(c);
        }} />
      
    </DashboardLayout>);

}

export { removeAppointment };