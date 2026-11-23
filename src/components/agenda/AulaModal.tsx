import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarIcon, ClockIcon, PlusIcon, Trash2Icon, UserIcon, UsersIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { NoticeInline } from '../ui/Notice';
import { useToast } from '../ui/Toast';
import { StatusPill } from '../ui/StatusPill';
import type { PillTone } from '../ui/StatusPill';
import { AppointmentStatusChip } from '../ui/StatusChip';
import { DateField } from '../ui/DateField';
import { TimeField } from '../ui/TimeField';
import { Button } from '../Button';
import { Textarea } from '../Textarea';
import { PillGroup } from '../Pill';
import { IconButton, InfoTip, labelValueIconClass, labelValueItemClass } from '../Card';
import { ClientSelect } from '../client/ClientSelect';
import { Select } from '../Select';
import { ChoiceCards } from '../Card';
import { FecharAtendimentoModal } from '../modals/FecharAtendimentoModal';
import { NovoClienteModal } from '../modals/NovoClienteModal';
import { ListaEsperaModal } from '../modals/ListaEsperaModal';
import { WaitlistConversationPanel } from './WaitlistConversationPanel';
import type { WaitlistChatTarget } from './WaitlistConversationPanel';
import { allClientsForSelect, clientById, clientIdOfRecordedName, useClientsVersion } from '../../data/api/clientes';
import { agendaProfessionalOf } from '../../data/availability';
import { checkNow, setWaitlist, useAgendaData } from '../../data/agendaLive';
import type { AgendaWaitlistEntry } from '../../data/agenda';
import { activeServiceOf } from '../../data/catalogo';
import { closeOffersOfServedRequest } from '../../data/freedSlots';
import { ensureConversation } from '../../data/conversasThreads';
import { NOW, TODAY_ISO, isPastNow, mediumDayLabel } from '../../data/agendaStore';
import { addAvulso, getTurmas, removeEnrollment, restoreEnrollment, turmaWhen } from '../../data/turmas';
import type { Enrollment, EnrollmentPayment } from '../../data/turmas';
import { usablePackagesFor, useBackendVersion } from '../../data/api/pacotes';
import { textoDisponiveis } from '../../data/pacotesLib';
import { dataBR } from '../../data/fichaLib';
import { useFinanceEntries } from '../../data/convenios';
import { useMakeupCreditsVersion } from '../../data/makeupCredits';
import {
  AULA_CLIENT_LABEL,
  aulaByKey,
  aulaChangeMessage,
  aulaClientApptId,
  freeCreditsFor,
  syncRollCallEffects,
  enrollmentPayText,
  aulaDayText,
  cancelAula,
  cancelGivesMakeup,
  moveAula,
  noticeGivesMakeup,
  restoreAula,
  saveRollCall,
  useAulasVersion,
  warnAbsence } from
'../../data/aulas';
import type { Aula, AulaClientState, RollMark } from '../../data/aulas';
import { getConflictCases, noteAulaChange, restoreCases } from '../../data/conflictCases';
import { useMakeupRules } from '../../data/makeupRules';
import { dayWords } from '../../data/turmaWords';

const SECTION_TITLE = 'text-sm font-bold text-text-primary';
const STATE_TONE: Record<AulaClientState, PillTone> = { vai: 'neutral', avisou: 'warning', presente: 'success', faltou: 'muted' };
/** G3 (CONTRATO NOVO, aulas em grupo): como o avulso paga esta aula. */
type AvulsoPay = '' | EnrollmentPayment;

/**
 * G6b (CONTRATO NOVO, aulas em grupo, 23/11/2026): quantos pedidos da lista de espera aparecem no aviso de vaga livre
 * antes de "Ver mais". O pedido pode trazer a turma (`turmaId`, gravado pela janela da lista de espera desde o G2).
 */
const WAIT_VISIBLE = 3;
type WaitEntry = AgendaWaitlistEntry & {turmaId?: string;};

const ROLL_OPTIONS = [
{ value: 'presente', label: 'Presente' },
{ value: 'faltou', label: 'Faltou' }];


/**
 * Janela da AULA (G2, aulas em grupo, 23/11/2026; CONTRATO NOVO). Abre pelo cartão da aula na Agenda.
 * Mesmo padrão de "Detalhes do agendamento" (`AppModal` + rótulo e valor do DS 6.5 + rodapé com "Mais ações"):
 *  - topo: Dia, Horário, Profissional, Vagas;
 *  - "Clientes": cada um como Fixo ou Avulso e a situação nesta aula (Vai · Avisou que falta · Presente · Faltou);
 *    "Avisou que falta" libera a vaga só nesta data (com "Ganha reposição" quando a regra da empresa vale; o crédito é do
 *    lote G3); avulso pode sair desta aula; "+ Adicionar cliente" = o mesmo fluxo da janela da turma, avulso nesta data;
 *    aula lotada: "Aula lotada." e "Pôr na lista de espera" (pedido com a turma);
 *  - chamada: do horário de início em diante, o principal é "Fazer chamada" (Presente ou Faltou de cada um, Salvar);
 *    salva, a aula fica como feita;
 *  - rodapé: principal à vista; "Mais ações" com "Mudar horário desta aula" e, por último, separado e em vermelho,
 *    "Cancelar esta aula". As duas pedem confirmação, dizem quantos clientes serão avisados e aceitam um motivo, que vai
 *    na mensagem. Avisar: automação "Avisar mudança de horário" ligada = a assistente avisa; desligada = cada cliente entra
 *    em "Falta avisar" com a mensagem pronta (o mesmo caminho do agendamento cancelado pela empresa).
 */
export function AulaModal({ aulaKey, onClose }: {aulaKey: string | null;onClose: () => void;}) {
  const toast = useToast();
  const navigate = useNavigate();
  useAulasVersion();
  useClientsVersion();
  useBackendVersion();
  useMakeupCreditsVersion();
  const finance = useFinanceEntries();
  const rules = useMakeupRules();
  const a: Aula | null = aulaKey ? aulaByKey(aulaKey) : null;
  /** G5 (CONTRATO NOVO, aulas em grupo): a palavra do serviço para este dia ("esta aula" / "este treino"). */
  const w = a?.words ?? dayWords();
  const [adding, setAdding] = useState(false);
  const [addClient, setAddClient] = useState('');
  /** G3 (C): como o avulso paga esta aula, e o pacote escolhido. */
  const [addPay, setAddPay] = useState<AvulsoPay>('');
  const [addPkg, setAddPkg] = useState('');
  /** G3 (D): clientes que pagam por aula esperando a janela "Pagamento da aula" (um por vez, depois da chamada). */
  const [payQueue, setPayQueue] = useState<string[]>([]);
  const [rolling, setRolling] = useState(false);
  const [marks, setMarks] = useState<Record<string, RollMark>>({});
  const [rollTried, setRollTried] = useState(false);
  const [confirm, setConfirm] = useState<'cancelar' | 'mudar' | null>(null);
  const [reason, setReason] = useState('');
  const [moveDate, setMoveDate] = useState('');
  const [moveTime, setMoveTime] = useState('');
  const [moveTried, setMoveTried] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  /**
   * G6b (CONTRATO NOVO, aulas em grupo, 23/11/2026): vaga livre na turma = a equipe vê quem espera e chama ou inscreve.
   * Só o caminho manual; a oferta automática (data/freedSlots.ts, waitlistOffer.ts, waitlistAutoBooking.ts) não muda.
   */
  const { waitlist } = useAgendaData();
  const [waitAll, setWaitAll] = useState(false);
  /** Pedido que está sendo inscrito pelo "Inscrever" (sai da fila quando o cliente entra). */
  const [fromWait, setFromWait] = useState<WaitEntry | null>(null);
  const [chat, setChat] = useState<WaitlistChatTarget | null>(null);

  useEffect(() => {
    setAdding(false);
    setAddClient('');
    setAddPay('');
    setAddPkg('');
    setPayQueue([]);
    setRolling(false);
    setMarks({});
    setRollTried(false);
    setConfirm(null);
    setReason('');
    setWaitAll(false);
    setFromWait(null);
    setChat(null);
  }, [aulaKey]);

  const pro = a ? agendaProfessionalOf(a.professionalId) : undefined;
  const started = !!a && isPastNow(a.iso, a.start);
  const open = !!a && !a.cancelled;
  const editable = open && !a!.done;
  /** G2b/G3 (A2): depois do início a aula mostra só a chamada (sem "Avisou que falta", sem adicionar nem tirar cliente). */
  const beforeStart = editable && !started;
  const dayLabel = a ? mediumDayLabel(a.iso) : '';
  /** Quem recebe o aviso de aula cancelada ou mudada: todos que não avisaram que faltam. */
  const toWarn = a ? a.clients.filter((c) => c.state !== 'avisou') : [];
  const inRoll = a ? a.clients.filter((c) => c.state !== 'avisou') : [];

  /* ───────── adicionar cliente (avulso nesta aula) ───────── */
  const takenIds = new Set(a?.clients.map((c) => c.clientId) ?? []);
  const clientOptions = allClientsForSelect().
  filter((c) => !takenIds.has(c.id)).
  map((c) => ({ value: c.id, label: c.name }));
  /* G3 (C): "Como este cliente paga esta aula?" — reposição, pacote ou por aula; opção sem saldo fica desligada com o motivo. */
  const credits = a && addClient ? freeCreditsFor(addClient, a.serviceId, a.iso) : { free: 0, next: null };
  const addPackages = a && addClient ? usablePackagesFor(addClient, a.serviceName, a.iso) : [];
  useEffect(() => {
    if (addPay === 'pacote' && addPackages.length === 1 && addPkg !== addPackages[0].id) setAddPkg(addPackages[0].id);
    if (addPay === 'pacote' && addPackages.length === 0) setAddPay('');
    if (addPay === 'credito' && credits.free === 0) setAddPay('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addPay, addClient, addPackages.length, credits.free]);
  const payOptions = [
  {
    value: 'credito',
    title: 'Crédito de reposição',
    description: !addClient ? 'Escolha o cliente primeiro.' : credits.free > 0 && credits.next ? `Usa uma reposição de ${a?.serviceName ?? 'este serviço'} (vence em ${dataBR(credits.next.expiresIso)}).` : `Sem reposição válida de ${a?.serviceName ?? 'este serviço'}.`,
    disabled: credits.free === 0
  },
  {
    value: 'pacote',
    title: 'Pacote',
    description: !addClient ? 'Escolha o cliente primeiro.' : addPackages.length ? `Usa uma sessão do pacote de ${a?.serviceName ?? 'este serviço'}.` : `Sem pacote de ${a?.serviceName ?? 'este serviço'} com sessões.`,
    disabled: addPackages.length === 0
  },
  { value: 'por-aula', title: `Paga por ${w.one}`, description: `${w.This} é ${w.pick('cobrada separada', 'cobrado separado')}.` }];

  const addIssue = !addClient ? 'Escolha o cliente.' : !addPay ? 'Escolha como o cliente paga.' : addPay === 'pacote' && !addPackages.some((p) => p.id === addPkg) ? 'Escolha o pacote.' : null;
  const confirmAdd = () => {
    if (!a || addIssue || a.full) return;
    addAvulso(a.turma.id, addClient, a.origIso, addPay as EnrollmentPayment, addPay === 'pacote' ? addPkg : null);
    const name = clientOptions.find((o) => o.value === addClient)?.label ?? 'Cliente';
    // G6b: inscrito pelo "Inscrever" = pedido atendido. Mesmo caminho do "Agendar agora" da lista de espera: as ofertas
    // abertas do pedido fecham e ele sai da fila.
    const served = fromWait && clientIdOfRecordedName(fromWait.clientName) === addClient ? fromWait : null;
    if (served) {
      closeOffersOfServedRequest(served.id, served.clientName);
      setWaitlist((list) => list.filter((e) => e.id !== served.id));
    }
    setFromWait(null);
    setAdding(false);
    setAddClient('');
    setAddPay('');
    setAddPkg('');
    toast({ title: `Cliente ${w.inThe}`, description: `${name} entrou como avulso ${w.inThe} de ${aulaDayText(a.iso)}, às ${a.start}.${served ? ' O pedido saiu da lista de espera.' : ''}` });
  };

  /* ───────── ações por cliente ───────── */
  const warn = (clientId: string, name: string) => {
    if (!a) return;
    const makeup = noticeGivesMakeup(a);
    const before = warnAbsence(a.key, clientId);
    toast({
      title: 'Falta registrada',
      description: `${name} não vem ${aulaDayText(a.iso)}. A vaga ficou livre ${w.in}.${makeup ? ' Ganha reposição.' : ''}`,
      action: { label: 'Desfazer', onClick: () => restoreAula(a.key, before) }
    });
  };
  const removeAvulso = (enrollmentId: string, name: string) => {
    if (!a) return;
    const gone = removeEnrollment(enrollmentId);
    toast({ title: `Saiu ${w.of}`, description: `${name} não está mais ${w.inThe} de ${aulaDayText(a.iso)}.`, tone: 'info', action: gone ? { label: 'Desfazer', onClick: () => restoreEnrollment(gone) } : undefined });
  };

  /* ───────── chamada ───────── */
  const startRoll = () => {
    if (!a) return;
    const m: Record<string, RollMark> = {};
    a.clients.forEach((c) => {
      if (c.state === 'presente' || c.state === 'faltou') m[c.clientId] = c.state;
    });
    setMarks(m);
    setRollTried(false);
    setRolling(true);
  };
  const rollMissing = inRoll.filter((c) => !marks[c.clientId]).length;
  const saveRoll = () => {
    setRollTried(true);
    if (!a || rollMissing > 0) return;
    const before = saveRollCall(a.key, marks);
    // G3 (D): pacote e reposição já foram usados por `saveRollCall`; aqui só a lista do que não pôde ser usado.
    const problems = syncRollCallEffects(a.key);
    const p = Object.values(marks).filter((v) => v === 'presente').length;
    const f = Object.values(marks).filter((v) => v === 'faltou').length;
    setRolling(false);
    toast({
      title: 'Chamada salva',
      description: `${p} ${p === 1 ? 'presente' : 'presentes'} e ${f} ${f === 1 ? 'falta' : 'faltas'}. ${w.The} ficou como ${w.pick('feita', 'feito')}.${problems.length ? ` Não usado: ${problems.join(' ')}` : ''}`,
      tone: problems.length ? 'warning' : undefined,
      duration: problems.length ? 8000 : undefined,
      action: { label: 'Desfazer', onClick: () => restoreAula(a.key, before) }
    });
    // G3 (D): quem paga por aula e está presente passa, um por vez, pela MESMA janela de pagamento do fechamento.
    setPayQueue(inRoll.filter((c) => marks[c.clientId] === 'presente' && c.enrollment.payment === 'por-aula' && !closureOf(c.clientId)).map((c) => c.clientId));
  };

  /* ───────── G3 (D): dinheiro de cada cliente (pacote, reposição ou fechamento) ───────── */
  const closureOf = (clientId: string) => a ? finance.find((e) => e.appointmentId === aulaClientApptId(a.key, clientId)) : undefined;
  const payingId = payQueue[0] ?? null;
  const paying = a && payingId ? a.clients.find((c) => c.clientId === payingId) : undefined;
  const moneyPill = (c: {clientId: string;state: AulaClientState;enrollment: Enrollment;name: string;}) => {
    if (!a || c.state !== 'presente') return null;
    if (c.enrollment.payment === 'pacote') return <StatusPill tone="info" label="Sessão do pacote" />;
    if (c.enrollment.payment === 'credito') return <StatusPill tone="info" label="Reposição usada" />;
    const e = closureOf(c.clientId);
    if (e) return e.particularOpen ? <StatusPill tone="warning" label="Em aberto" /> : <StatusPill tone="success" label="Recebido" />;
    return (
      <Button size="sm" variant="neutral" onClick={() => setPayQueue([c.clientId])} aria-label={`Registrar o pagamento de ${c.name} ${w.in}`}>
        Registrar pagamento
      </Button>);

  };

  /* ───────── cancelar ou mudar ───────── */
  const openConfirm = (kind: 'cancelar' | 'mudar') => {
    setReason('');
    setMoveDate(a?.iso ?? TODAY_ISO);
    setMoveTime('');
    setMoveTried(false);
    setConfirm(kind);
  };
  const moveCheck = useMemo(() => {
    if (!a || confirm !== 'mudar' || !moveDate || !moveTime) return null;
    if (isPastNow(moveDate, moveTime)) return 'Esse horário já passou. Escolha um horário a partir de agora.';
    if (moveDate === a.iso && moveTime === a.start) return 'Escolha um dia ou horário diferente do atual.';
    const r = checkNow({ professionalId: a.professionalId, iso: moveDate, start: moveTime, durationMin: a.durationMin, ignoreId: a.id });
    return r.ok ? null : r.message;
  }, [a, confirm, moveDate, moveTime]);
  const warnPeople = (kind: 'cancelar' | 'mudar', to: {iso: string;start: string;} | null) => {
    if (!a) return { mode: 'auto' as const, before: getConflictCases() };
    const before = getConflictCases();
    const mode = noteAulaChange(
      { key: a.key, id: a.id, serviceName: a.serviceName, iso: a.iso, start: a.start, professionalId: a.professionalId },
      toWarn.map((c) => ({ clientId: c.clientId, name: c.name, message: aulaChangeMessage(c.name, a.serviceName, a.iso, a.start, to, reason) })),
      kind === 'cancelar' ? { kind: 'cancelado' } : { kind: 'remarcado', iso: to!.iso, start: to!.start, professionalId: a.professionalId }
    );
    return { mode, before };
  };
  const nWarn = toWarn.length;
  const warnedText = (mode: 'auto' | 'avisar') =>
  nWarn === 0 ? 'Não havia clientes para avisar.' : mode === 'auto' ? `A assistente avisou ${nWarn === 1 ? 'o cliente' : `os ${nWarn} clientes`} pelo WhatsApp.` : `${nWarn === 1 ? 'O cliente está' : `Os ${nWarn} clientes estão`} em “Falta avisar”, com a mensagem pronta.`;
  const doCancel = () => {
    if (!a) return;
    const beforeAula = cancelAula(a.key, reason);
    const { mode, before } = warnPeople('cancelar', null);
    setConfirm(null);
    onClose();
    toast({
      title: `${w.One} ${w.pick('cancelada', 'cancelado')}`,
      description: `${a.serviceName}, ${aulaDayText(a.iso)}, às ${a.start}. ${warnedText(mode)}${cancelGivesMakeup() && nWarn ? ' Os clientes ganham reposição.' : ''}`,
      duration: 8000,
      action:
      mode === 'avisar' && nWarn ?
      { label: 'Ver quem falta avisar', onClick: () => navigate('/agenda?secao=notificacoes') } :
      {
        label: 'Desfazer',
        onClick: () => {
          restoreAula(a.key, beforeAula);
          restoreCases(before);
        }
      }
    });
  };
  const doMove = () => {
    setMoveTried(true);
    if (!a || !moveDate || !moveTime || moveCheck) return;
    const to = { iso: moveDate, start: moveTime };
    const { mode } = warnPeople('mudar', to);
    moveAula(a.key, to.iso, to.start, reason);
    setConfirm(null);
    onClose();
    toast({
      title: `${w.One} mudou de horário`,
      description: `${a.serviceName}: de ${aulaDayText(a.iso)}, às ${a.start}, para ${aulaDayText(to.iso)}, às ${to.start}. ${warnedText(mode)}`,
      duration: 8000,
      ...(mode === 'avisar' && nWarn ? { action: { label: 'Ver quem falta avisar', onClick: () => navigate('/agenda?secao=notificacoes') } } : {})
    });
  };

  /* ───────── rodapé ───────── */
  const moreItems = editable ?
  [
  { id: 'mudar-horario', label: `Mudar horário ${w.of}`, onSelect: () => openConfirm('mudar') },
  { id: 'separador', type: 'separator' as const },
  { id: 'cancelar-aula', label: `Cancelar ${w.this}`, variant: 'danger' as const, onSelect: () => openConfirm('cancelar') }] :

  undefined;
  const footer = !a || a.cancelled ? undefined : rolling ?
  <ModalActions>
      <Button variant="secondary" onClick={() => setRolling(false)}>
        Voltar
      </Button>
      <Button onClick={saveRoll} aria-describedby={rollTried && rollMissing ? 'aula-chamada-falta' : undefined}>
        Salvar chamada
      </Button>
    </ModalActions> :
  a.done ?
  <ModalActions>
      <Button onClick={startRoll}>Corrigir chamada</Button>
    </ModalActions> :

  <ModalActions more={moreItems} moreLabel={`Mais ações para ${w.the} de ${a.serviceName}`}>
      <Button onClick={startRoll} disabled={!started} aria-describedby={!started ? 'aula-chamada-quando' : undefined}>
        Fazer chamada
      </Button>
    </ModalActions>;


  const vagasText = a ? `${a.occupancy} de ${a.capacity}` : '';

  /* ───────── G6b: vaga livre e quem está na lista de espera deste serviço ───────── */
  const freeSeats = a ? Math.max(0, a.capacity - a.occupancy) : 0;
  const waiting: WaitEntry[] = (() => {
    if (!a || !beforeStart || a.full || freeSeats === 0) return [];
    const sameService = (e: WaitEntry) => activeServiceOf(e.service)?.value === a.serviceId || e.service.trim().toLowerCase() === a.serviceName.trim().toLowerCase();
    const list = (waitlist as WaitEntry[]).filter((e) => sameService(e) && !takenIds.has(clientIdOfRecordedName(e.clientName) ?? ''));
    // Quem pediu ESTA turma primeiro; depois os outros, na ordem da fila.
    return [...list.filter((e) => e.turmaId === a.turma.id), ...list.filter((e) => e.turmaId !== a.turma.id)];
  })();
  const turmaOfEntry = (e: WaitEntry) => e.turmaId ? getTurmas().turmas.find((t) => t.id === e.turmaId) : undefined;
  const callWaiting = (e: WaitEntry) => {
    if (!a) return;
    const id = clientIdOfRecordedName(e.clientName);
    const client = id ? clientById(id) : null;
    if (!client) {
      toast({ title: 'Cliente não encontrado', description: `${e.clientName} não está no cadastro de clientes.`, tone: 'warning' });
      return;
    }
    ensureConversation(client.id, client.name);
    setChat({
      clientId: client.id,
      offer: { clientName: client.name, service: a.serviceName, iso: a.iso, time: a.start, professional: pro?.name ?? '' },
      message: `Abriu uma vaga em ${a.serviceName}, ${aulaDayText(a.iso)}, às ${a.start}. Quer entrar?`
    });
  };
  const enrollWaiting = (e: WaitEntry) => {
    const id = clientIdOfRecordedName(e.clientName);
    if (!id) {
      toast({ title: 'Cliente não encontrado', description: `${e.clientName} não está no cadastro de clientes.`, tone: 'warning' });
      return;
    }
    setFromWait(e);
    setAddClient(id);
    setAddPay('');
    setAddPkg('');
    setAdding(true);
  };

  return (
    <>
      <AppModal
        open={!!a && !confirm && !waitOpen && !newClientOpen && !paying && !chat}
        onClose={onClose}
        unsavedGuard={false}
        size="lg"
        title={a?.serviceName ?? ''}
        description={a ? `${w.One} em grupo · ${a.durationMin} min · turma ${turmaWhen(a.turma).toLowerCase()}` : undefined}
        footer={footer}>
        
        {a &&
        <div className="flex flex-col gap-5">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Mesma receita de rótulo e valor de "Detalhes do agendamento" (DS 6.5). */}
              <div className={labelValueItemClass()}>
                <CalendarIcon className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true" />
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Dia</dt>
                <dd className="text-sm font-semibold text-text-primary">{dayLabel}</dd>
              </div>
              <div className={labelValueItemClass()}>
                <ClockIcon className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true" />
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Horário</dt>
                <dd className="text-sm font-semibold tabular-nums text-text-primary">
                  {a.start}–{a.end}
                </dd>
              </div>
              <div className={labelValueItemClass()}>
                <UserIcon className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true" />
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Profissional</dt>
                <dd className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  {pro && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pro.color }} aria-hidden="true" />}
                  {pro?.name ?? '—'}
                </dd>
              </div>
              <div className={labelValueItemClass()}>
                <UsersIcon className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true" />
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Vagas</dt>
                <dd className="flex flex-wrap items-center gap-2 text-sm font-semibold tabular-nums text-text-primary">
                  {vagasText}
                  {a.cancelled ? <AppointmentStatusChip status="cancelled" /> : a.done ? <AppointmentStatusChip status="completed" /> : a.full ? <StatusPill tone="neutral" label="Lotada" /> : null}
                </dd>
              </div>
            </dl>

            {a.cancelled &&
          <NoticeInline tone="info" title={`${w.One} ${w.pick('cancelada', 'cancelado')}`}>
                {w.pick('Cancelada', 'Cancelado')} em {a.change.cancelled!.at}
                {a.change.cancelled!.reason ? `. Motivo: ${a.change.cancelled!.reason}` : ''}. As vagas não são oferecidas.
              </NoticeInline>
          }
            {a.change.moved && !a.cancelled &&
          <p className="text-sm text-text-secondary">
                Mudou de {aulaDayText(a.origIso)}, às {a.turma.startTime}, em {a.change.moved.at}.
              </p>
          }

            {/* ───────── Clientes ───────── */}
            <section aria-labelledby="aula-clientes" className="flex flex-col gap-3 border-t border-border pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="aula-clientes" className={SECTION_TITLE}>
                  {rolling ? 'Chamada' : 'Clientes'}
                </h3>
                <p className="text-sm tabular-nums text-text-secondary">{vagasText} vagas</p>
              </div>
              {open && !a.done && !rolling &&
            <p id="aula-chamada-quando" className="text-xs text-text-secondary">
                  {started ? `${w.The} já começou: faça a chamada.` : `A chamada abre no horário ${w.ofThe}, às ${a.start}.`}
                </p>
            }

              {/* G6b (CONTRATO NOVO, aulas em grupo, 23/11/2026): vaga livre + pedidos na lista de espera deste serviço. */}
              {!rolling && waiting.length > 0 &&
            <NoticeInline tone="info" title={`${waiting.length} na lista de espera. Há ${freeSeats} ${freeSeats === 1 ? 'vaga' : 'vagas'} ${w.in}.`}>
                  <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Pedidos na lista de espera">
                    {(waitAll ? waiting : waiting.slice(0, WAIT_VISIBLE)).map((e) => {
                  const t = turmaOfEntry(e);
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                          <span className="min-w-0 flex-1 basis-40">
                            <span className="block text-sm font-bold text-text-primary">{e.clientName}</span>
                            {t && <span className="block text-xs text-text-secondary">{turmaWhen(t)}</span>}
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="neutral" onClick={() => callWaiting(e)} aria-label={`Chamar ${e.clientName} para a vaga ${w.in}`}>
                              Chamar
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => enrollWaiting(e)} aria-label={`Inscrever ${e.clientName} ${w.in}`}>
                              Inscrever
                            </Button>
                          </span>
                        </li>);

                })}
                  </ul>
                  {waiting.length > WAIT_VISIBLE &&
              <Button size="sm" variant="neutral" className="mt-2" onClick={() => setWaitAll((v) => !v)} aria-expanded={waitAll}>
                      {waitAll ? 'Ver menos' : `Ver mais ${waiting.length - WAIT_VISIBLE}`}
                    </Button>
              }
                </NoticeInline>
            }

              {a.clients.length === 0 ?
            <p className="text-sm text-text-secondary">Nenhum cliente {w.in}.</p> :
            rolling ?
            <ul className="flex flex-col gap-4">
                  {inRoll.map((c) =>
              <li key={c.clientId}>
                      <PillGroup
                  label={`${c.name} · ${c.enrollment.kind === 'fixo' ? 'Fixo' : 'Avulso'}`}
                  size="sm"
                  options={ROLL_OPTIONS}
                  value={marks[c.clientId] ?? ''}
                  onChange={(v) => typeof v === 'string' && setMarks((m) => ({ ...m, [c.clientId]: v as RollMark }))} />
                
                      {/* G4 (B; CONTRATO NOVO, aulas em grupo, 23/11/2026): chamada corrigida para Faltou depois do dinheiro
                     registrado. A sessão ou a reposição voltam ao salvar, mas o pagamento NUNCA é apagado sozinho. O
                     reembolso fica na Ficha do cliente (Histórico › Atendimentos fechados), fora desta janela. */}
                      {marks[c.clientId] === 'faltou' && !!closureOf(c.clientId) &&
                <NoticeInline tone="info" className="mt-2">
                          O pagamento {w.of} continua registrado. Se for devolver, use o reembolso.
                        </NoticeInline>
                }
                    </li>
              )}
                  {rollTried && rollMissing > 0 &&
              <li id="aula-chamada-falta" role="alert" className="text-sm text-error">
                      Marque Presente ou Faltou para {rollMissing === 1 ? 'mais 1 cliente' : `mais ${rollMissing} clientes`}.
                    </li>
              }
                </ul> :

            <ul className="divide-y divide-border border-y border-border">
                  {a.clients.map((c) =>
              <li key={c.enrollment.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="block text-sm font-bold text-text-primary">{c.name}</span>
                        <span className="block text-xs text-text-secondary">
                          {c.enrollment.kind === 'fixo' ? 'Fixo' : 'Avulso'} · {enrollmentPayText(c.enrollment)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={STATE_TONE[c.state]} label={AULA_CLIENT_LABEL[c.state]} />
                        {c.state === 'avisou' && c.makeup && <StatusPill tone="info" label="Ganha reposição" />}
                        {a.done && moneyPill(c)}
                        {beforeStart && c.state === 'vai' &&
                  <Button size="sm" variant="neutral" onClick={() => warn(c.clientId, c.name)} aria-label={`${c.name} avisou que falta ${w.in}`}>
                            Avisou que falta
                          </Button>
                  }
                        {beforeStart && c.enrollment.kind === 'avulso' &&
                  <IconButton size="sm" tone="danger" aria-label={`Tirar ${c.name} ${w.of}`} onClick={() => removeAvulso(c.enrollment.id, c.name)} icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} />
                  }
                      </span>
                    </li>
              )}
                </ul>
            }
              {beforeStart && !rolling && rules.onClientNotice &&
            <p className="text-xs text-text-secondary">
                  Quem avisa a falta com {rules.clientNoticeHours} h ou mais de antecedência ganha reposição.{' '}
                  <InfoTip label="a reposição" content="Regra da empresa em Serviços e equipe › Funcionamento › Regras de agendamento › Reposição." />
                </p>
            }

              {beforeStart && !rolling && !adding &&
            <div className="flex flex-wrap items-center gap-3">
                  <Button size="md" variant="neutral" leftIcon={<PlusIcon className="h-4 w-4" />} disabled={a.full} aria-describedby={a.full ? 'aula-lotada' : undefined} onClick={() => setAdding(true)}>
                    Adicionar cliente
                  </Button>
                  {a.full &&
              <>
                      <p id="aula-lotada" className="text-sm font-semibold text-text-primary">
                        Turma lotada.
                      </p>
                      <Button size="md" variant="secondary" onClick={() => setWaitOpen(true)}>
                        Pôr na lista de espera
                      </Button>
                    </>
              }
                </div>
            }
              {beforeStart && !rolling && adding &&
            <div className="flex flex-col gap-4 rounded-inner border border-border p-4" aria-label="Adicionar cliente">
                  <ClientSelect
                options={clientOptions}
                value={addClient}
                onChange={(v) => {
                  setAddClient(v);
                  setAddPay('');
                  setAddPkg('');
                }}
                onCreate={(typed) => {
                  setNewClientName(typed);
                  setNewClientOpen(true);
                }} />
              
                  <p className="text-sm text-text-secondary">Entra como avulso só {w.in} ({aulaDayText(a.iso)}).</p>
                  {/* G3 (C): mesma pergunta e mesmas opções da janela da turma. */}
                  <ChoiceCards label={`Como este cliente paga ${w.this}?`} columns={1} value={addPay} onChange={(v) => setAddPay(v as AvulsoPay)} options={payOptions} />
                  {addPay === 'pacote' && addPackages.length > 1 &&
              <Select
                label="Pacote"
                required
                placeholder="Escolha o pacote"
                options={addPackages.map((p) => ({ value: p.id, label: `Pacote de ${p.service_name_snapshot}`, description: textoDisponiveis(p) }))}
                value={addPkg || undefined}
                onChange={setAddPkg} />

              }
                  {addPay === 'pacote' && addPackages.length === 1 &&
              <p className="text-sm text-text-secondary">
                      Pacote de {addPackages[0].service_name_snapshot} · {textoDisponiveis(addPackages[0])}
                    </p>
              }
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {addIssue &&
                <p id="aula-add-motivo" className="mr-auto text-sm text-text-secondary">
                        {addIssue}
                      </p>
                }
                    <Button
                  size="md"
                  variant="neutral"
                  onClick={() => {
                    setAdding(false);
                    setFromWait(null);
                    setAddClient('');
                    setAddPay('');
                    setAddPkg('');
                  }}>
                  
                      Desistir
                    </Button>
                    <Button size="md" variant="secondary" disabled={!!addIssue} aria-describedby={addIssue ? 'aula-add-motivo' : undefined} onClick={confirmAdd}>
                      Adicionar {w.toThe}
                    </Button>
                  </div>
                </div>
            }
            </section>
          </div>
        }
      </AppModal>

      {/* Confirmação de cancelar (mesmo padrão de "Cancelar este agendamento?"). */}
      <AppModal
        open={!!a && confirm === 'cancelar'}
        unsavedGuard={false}
        size="md"
        title={`Cancelar ${w.this}?`}
        description={a ? `${a.serviceName} · ${dayLabel} às ${a.start}` : undefined}
        onClose={() => setConfirm(null)}
        footer={
        <ModalActions equal={2}>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button variant="danger" onClick={doCancel}>
              Cancelar {w.one}
            </Button>
          </ModalActions>
        }>
        
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {nWarn === 0 ? 'Não há clientes para avisar.' : `${nWarn === 1 ? '1 cliente vai ser avisado' : `${nWarn} clientes vão ser avisados`} de que ${w.the} foi ${w.pick('cancelada', 'cancelado')}.`}
            {cancelGivesMakeup() && nWarn > 0 ? ' Os clientes ganham reposição.' : ''}
          </p>
          <Textarea label="Motivo (aparece na mensagem)" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} helperText="Opcional." />
        </div>
      </AppModal>

      {/* Mudar o horário desta aula: mesma regra única de horário (o profissional precisa estar livre). */}
      <AppModal
        open={!!a && confirm === 'mudar'}
        unsavedGuard={false}
        size="md"
        anchor="top"
        title={`Mudar horário ${w.of}`}
        description={a ? `${a.serviceName} · ${dayLabel} às ${a.start} · ${pro?.name ?? ''}` : undefined}
        onClose={() => setConfirm(null)}
        footer={
        <ModalActions equal={2}>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button onClick={doMove}>Mudar horário</Button>
          </ModalActions>
        }>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField label="Novo dia" value={moveDate} onChange={setMoveDate} />
          <TimeField
            label="Novo horário"
            required
            value={moveTime}
            onChange={setMoveTime}
            isTimeDisabled={(t) => !!a && (isPastNow(moveDate, t) || !checkNow({ professionalId: a.professionalId, iso: moveDate, start: t, durationMin: a.durationMin, ignoreId: a.id }).ok)}
            error={moveTried && !moveTime ? 'Escolha o horário.' : undefined}
            helperText={moveDate === TODAY_ISO ? `Hoje, a partir de ${NOW}.` : undefined} />
          
          {moveCheck &&
          <NoticeInline tone="warning" role="alert" title="Esse horário não pode ser usado" className="sm:col-span-2">
              {moveCheck}
            </NoticeInline>
          }
          <p className="text-sm text-text-secondary sm:col-span-2">
            {nWarn === 0 ? 'Não há clientes para avisar.' : `${nWarn === 1 ? '1 cliente vai ser avisado' : `${nWarn} clientes vão ser avisados`} do novo horário.`}
          </p>
          <div className="sm:col-span-2">
            <Textarea label="Motivo (aparece na mensagem)" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} helperText="Opcional." />
          </div>
        </div>
      </AppModal>

      {/* Aula lotada: pedido na lista de espera já com o serviço e a turma. */}
      <ListaEsperaModal
        open={waitOpen}
        onClose={() => setWaitOpen(false)}
        initial={a ? { service: a.serviceId, turmaId: a.turma.id } : undefined}
        onSaved={(entry) => setWaitlist((list) => [...list, { id: `w${Date.now()}`, ...entry }])} />
      

      {/* G3 (D): pagamento de quem paga por aula = a MESMA janela e o mesmo passo de pagamento do fechamento. */}
      <FecharAtendimentoModal
        key={payingId ?? 'nenhum'}
        aula
        aulaWords={w}
        open={!!a && !!paying}
        onClose={() => setPayQueue((q) => q.slice(1))}
        appointment={
        a && paying ?
        { id: aulaClientApptId(a.key, paying.clientId), clientName: paying.name, service: a.serviceName, when: `${dayLabel} às ${a.start}`, professional: pro?.name, iso: a.iso, time: a.start } :
        null
        } />
      

      {/* G6b: "Chamar" = a mesma conversa ao lado da lista de espera, com a mensagem da vaga pronta. */}
      <WaitlistConversationPanel target={chat} onClose={() => setChat(null)} onSent={() => undefined} />

      <NovoClienteModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        initialName={newClientName}
        onSaved={(c) => {
          const id = clientIdOfRecordedName(c.name);
          if (id) setAddClient(id);
        }} />
      
    </>);

}