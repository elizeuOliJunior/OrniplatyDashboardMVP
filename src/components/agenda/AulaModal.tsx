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
import { NovoClienteModal } from '../modals/NovoClienteModal';
import { ListaEsperaModal } from '../modals/ListaEsperaModal';
import { allClientsForSelect, clientIdOfRecordedName, useClientsVersion } from '../../data/api/clientes';
import { agendaProfessionalOf } from '../../data/availability';
import { checkNow, setWaitlist } from '../../data/agendaLive';
import { NOW, TODAY_ISO, isPastNow, mediumDayLabel } from '../../data/agendaStore';
import { addAvulso, removeEnrollment, restoreEnrollment, turmaWhen } from '../../data/turmas';
import {
  AULA_CLIENT_LABEL,
  aulaByKey,
  aulaChangeMessage,
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

const SECTION_TITLE = 'text-sm font-bold text-text-primary';
const STATE_TONE: Record<AulaClientState, PillTone> = { vai: 'neutral', avisou: 'warning', presente: 'success', faltou: 'muted' };
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
  const rules = useMakeupRules();
  const a: Aula | null = aulaKey ? aulaByKey(aulaKey) : null;
  const [adding, setAdding] = useState(false);
  const [addClient, setAddClient] = useState('');
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

  useEffect(() => {
    setAdding(false);
    setAddClient('');
    setRolling(false);
    setMarks({});
    setRollTried(false);
    setConfirm(null);
    setReason('');
  }, [aulaKey]);

  const pro = a ? agendaProfessionalOf(a.professionalId) : undefined;
  const started = !!a && isPastNow(a.iso, a.start);
  const open = !!a && !a.cancelled;
  const editable = open && !a!.done;
  const dayLabel = a ? mediumDayLabel(a.iso) : '';
  /** Quem recebe o aviso de aula cancelada ou mudada: todos que não avisaram que faltam. */
  const toWarn = a ? a.clients.filter((c) => c.state !== 'avisou') : [];
  const inRoll = a ? a.clients.filter((c) => c.state !== 'avisou') : [];

  /* ───────── adicionar cliente (avulso nesta aula) ───────── */
  const takenIds = new Set(a?.clients.map((c) => c.clientId) ?? []);
  const clientOptions = allClientsForSelect().
  filter((c) => !takenIds.has(c.id)).
  map((c) => ({ value: c.id, label: c.name }));
  const confirmAdd = () => {
    if (!a || !addClient || a.full) return;
    addAvulso(a.turma.id, addClient, a.origIso);
    const name = clientOptions.find((o) => o.value === addClient)?.label ?? 'Cliente';
    setAdding(false);
    setAddClient('');
    toast({ title: 'Cliente na aula', description: `${name} entrou como avulso na aula de ${aulaDayText(a.iso)}, às ${a.start}.` });
  };

  /* ───────── ações por cliente ───────── */
  const warn = (clientId: string, name: string) => {
    if (!a) return;
    const makeup = noticeGivesMakeup(a);
    const before = warnAbsence(a.key, clientId);
    toast({
      title: 'Falta registrada',
      description: `${name} não vem ${aulaDayText(a.iso)}. A vaga ficou livre nesta aula.${makeup ? ' Ganha reposição.' : ''}`,
      action: { label: 'Desfazer', onClick: () => restoreAula(a.key, before) }
    });
  };
  const removeAvulso = (enrollmentId: string, name: string) => {
    if (!a) return;
    const gone = removeEnrollment(enrollmentId);
    toast({ title: 'Saiu desta aula', description: `${name} não está mais na aula de ${aulaDayText(a.iso)}.`, tone: 'info', action: gone ? { label: 'Desfazer', onClick: () => restoreEnrollment(gone) } : undefined });
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
    const p = Object.values(marks).filter((v) => v === 'presente').length;
    const f = Object.values(marks).filter((v) => v === 'faltou').length;
    setRolling(false);
    toast({ title: 'Chamada salva', description: `${p} ${p === 1 ? 'presente' : 'presentes'} e ${f} ${f === 1 ? 'falta' : 'faltas'}. A aula ficou como feita.`, action: { label: 'Desfazer', onClick: () => restoreAula(a.key, before) } });
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
      title: 'Aula cancelada',
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
      title: 'Aula mudou de horário',
      description: `${a.serviceName}: de ${aulaDayText(a.iso)}, às ${a.start}, para ${aulaDayText(to.iso)}, às ${to.start}. ${warnedText(mode)}`,
      duration: 8000,
      ...(mode === 'avisar' && nWarn ? { action: { label: 'Ver quem falta avisar', onClick: () => navigate('/agenda?secao=notificacoes') } } : {})
    });
  };

  /* ───────── rodapé ───────── */
  const moreItems = editable ?
  [
  { id: 'mudar-horario', label: 'Mudar horário desta aula', onSelect: () => openConfirm('mudar') },
  { id: 'separador', type: 'separator' as const },
  { id: 'cancelar-aula', label: 'Cancelar esta aula', variant: 'danger' as const, onSelect: () => openConfirm('cancelar') }] :

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

  <ModalActions more={moreItems} moreLabel={`Mais ações para a aula de ${a.serviceName}`}>
      <Button onClick={startRoll} disabled={!started} aria-describedby={!started ? 'aula-chamada-quando' : undefined}>
        Fazer chamada
      </Button>
    </ModalActions>;


  const vagasText = a ? `${a.occupancy} de ${a.capacity}` : '';

  return (
    <>
      <AppModal
        open={!!a && !confirm && !waitOpen && !newClientOpen}
        onClose={onClose}
        unsavedGuard={false}
        size="lg"
        title={a?.serviceName ?? ''}
        description={a ? `Aula em grupo · ${a.durationMin} min · turma ${turmaWhen(a.turma).toLowerCase()}` : undefined}
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
          <NoticeInline tone="info" title="Aula cancelada">
                Cancelada em {a.change.cancelled!.at}
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
                  {started ? 'A aula já começou: faça a chamada.' : `A chamada abre no horário da aula, às ${a.start}.`}
                </p>
            }

              {a.clients.length === 0 ?
            <p className="text-sm text-text-secondary">Nenhum cliente nesta aula.</p> :
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
                        <span className="block text-xs text-text-secondary">{c.enrollment.kind === 'fixo' ? 'Fixo' : 'Avulso'}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={STATE_TONE[c.state]} label={AULA_CLIENT_LABEL[c.state]} />
                        {c.state === 'avisou' && c.makeup && <StatusPill tone="info" label="Ganha reposição" />}
                        {editable && c.state === 'vai' &&
                  <Button size="sm" variant="neutral" onClick={() => warn(c.clientId, c.name)} aria-label={`${c.name} avisou que falta nesta aula`}>
                            Avisou que falta
                          </Button>
                  }
                        {editable && c.enrollment.kind === 'avulso' &&
                  <IconButton size="sm" tone="danger" aria-label={`Tirar ${c.name} desta aula`} onClick={() => removeAvulso(c.enrollment.id, c.name)} icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} />
                  }
                      </span>
                    </li>
              )}
                </ul>
            }
              {editable && !rolling && rules.onClientNotice &&
            <p className="text-xs text-text-secondary">
                  Quem avisa a falta com {rules.clientNoticeHours} h ou mais de antecedência ganha reposição.{' '}
                  <InfoTip label="a reposição" content="Regra da empresa em Serviços e equipe › Funcionamento › Regras de agendamento › Reposição de aula." />
                </p>
            }

              {editable && !rolling && !adding &&
            <div className="flex flex-wrap items-center gap-3">
                  <Button size="md" variant="neutral" leftIcon={<PlusIcon className="h-4 w-4" />} disabled={a.full} aria-describedby={a.full ? 'aula-lotada' : undefined} onClick={() => setAdding(true)}>
                    Adicionar cliente
                  </Button>
                  {a.full &&
              <>
                      <p id="aula-lotada" className="text-sm font-semibold text-text-primary">
                        Aula lotada.
                      </p>
                      <Button size="md" variant="secondary" onClick={() => setWaitOpen(true)}>
                        Pôr na lista de espera
                      </Button>
                    </>
              }
                </div>
            }
              {editable && !rolling && adding &&
            <div className="flex flex-col gap-4 rounded-inner border border-border p-4" aria-label="Adicionar cliente">
                  <ClientSelect
                options={clientOptions}
                value={addClient}
                onChange={setAddClient}
                onCreate={(typed) => {
                  setNewClientName(typed);
                  setNewClientOpen(true);
                }} />
              
                  <p className="text-sm text-text-secondary">Entra como avulso só nesta aula ({aulaDayText(a.iso)}) e paga por aula.</p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {!addClient &&
                <p id="aula-add-motivo" className="mr-auto text-sm text-text-secondary">
                        Escolha o cliente.
                      </p>
                }
                    <Button
                  size="md"
                  variant="neutral"
                  onClick={() => {
                    setAdding(false);
                    setAddClient('');
                  }}>
                  
                      Desistir
                    </Button>
                    <Button size="md" variant="secondary" disabled={!addClient} aria-describedby={!addClient ? 'aula-add-motivo' : undefined} onClick={confirmAdd}>
                      Adicionar à aula
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
        title="Cancelar esta aula?"
        description={a ? `${a.serviceName} · ${dayLabel} às ${a.start}` : undefined}
        onClose={() => setConfirm(null)}
        footer={
        <ModalActions equal={2}>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button variant="danger" onClick={doCancel}>
              Cancelar aula
            </Button>
          </ModalActions>
        }>
        
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {nWarn === 0 ? 'Não há clientes para avisar.' : `${nWarn === 1 ? '1 cliente vai ser avisado' : `${nWarn} clientes vão ser avisados`} de que a aula foi cancelada.`}
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
        title="Mudar horário desta aula"
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