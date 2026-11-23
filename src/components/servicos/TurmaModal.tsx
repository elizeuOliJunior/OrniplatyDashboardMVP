import React, { useEffect, useMemo, useState } from 'react';
import { ArchiveIcon, ArchiveRestoreIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ConflictNotice, NoticeInline } from '../ui/Notice';
import { TimeField } from '../ui/TimeField';
import { Button } from '../Button';
import { Select } from '../Select';
import { Pill } from '../Pill';
import { ChoiceCards, IconButton } from '../Card';
import { ClientSelect } from '../client/ClientSelect';
import { NovoClienteModal } from '../modals/NovoClienteModal';
import { VendaDePacoteModal } from '../pacotes/VendaDePacoteModal';
import { ArchiveConfirm } from './ArchiveConfirm';
import { allClientsForSelect, clientById, clientIdOfRecordedName, useClientsVersion } from '../../data/api/clientes';
import { listPackages, useBackendVersion } from '../../data/api/pacotes';
import { textoDisponiveis } from '../../data/pacotesLib';
import { checkAvailability, isActiveMember } from '../../data/availability';
import { getAgendaState } from '../../data/agendaLive';
import { mediumDayLabel } from '../../data/agendaStore';
import { WEEKDAY_LONG, WEEKDAY_SHORT, dmy, fromMin, isStepTime, toMin } from '../../data/schedule';
import { isGroupService } from '../../data/servicesStore';
import type { ServiceItem } from '../../data/servicesStore';
import type { TeamMember } from '../../data/equipeFuncionamento';
import { getTurmas, newEnrollmentId, newTurmaId, nextClassDates, occupyingOf, saveTurma, turmaWhen } from '../../data/turmas';
import type { Enrollment, Turma, Weekday } from '../../data/turmas';

type Props = {
  open: boolean;
  onClose: () => void;
  editing: Turma | null;
  services: ServiceItem[];
  members: TeamMember[];
  onSaved: (t: Turma, isNew: boolean) => void;
  onArchive: (t: Turma, active: boolean) => void;
};

type Draft = {serviceId: string;professionalId: string;weekdays: Weekday[];startTime: string;enrollments: Enrollment[];};
type AddPay = '' | 'pacote' | 'vender' | 'por-aula';
type AddForm = {clientId: string;kind: 'fixo' | 'avulso';date: string;pay: AddPay;packageId: string;};
const blankAdd = (): AddForm => ({ clientId: '', kind: 'fixo', date: '', pay: '', packageId: '' });

const SECTION_TITLE = 'text-sm font-bold text-text-primary';
const SECTION_HELP = 'mt-0.5 text-xs text-text-secondary';

/**
 * Janela da turma (G1, aulas em grupo, 23/11/2026; CONTRATO NOVO). `AppModal` + `ModalActions` como a janela do serviço,
 * com o aviso de alterações não salvas (`dirtyValue`). Tudo é rascunho até "Salvar": quando acontece (serviço, dias,
 * horário, profissional) e quem participa (fixo ou avulso, e como paga). Pacote: o que o cliente já tem deste serviço ou
 * a venda na janela que já existe (`VendaDePacoteModal`, com cliente e serviço preenchidos). Turma lotada: não adiciona;
 * a lista de espera da turma chega no lote G2. Fora do horário: o aviso usa a MESMA regra da agenda (`checkAvailability`,
 * só configuração) e não impede salvar.
 */
export function TurmaModal({ open, onClose, editing, services, members, onSaved, onArchive }: Props) {
  useClientsVersion();
  useBackendVersion();
  const groupServices = services.filter((s) => isGroupService(s) && (s.active || s.id === editing?.serviceId));
  const blank = (): Draft => ({ serviceId: groupServices.find((s) => s.active)?.id ?? '', professionalId: '', weekdays: [], startTime: '', enrollments: [] });
  const [draft, setDraft] = useState<Draft>(blank);
  const [submitted, setSubmitted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<AddForm>(blankAdd);
  const [removing, setRemoving] = useState<Enrollment | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');

  useEffect(() => {
    if (!open) return;
    const t = editing;
    setDraft(
      t ?
      { serviceId: t.serviceId, professionalId: t.professionalId, weekdays: [...t.weekdays], startTime: t.startTime, enrollments: getTurmas().enrollments.filter((e) => e.turmaId === t.id).map((e) => ({ ...e })) } :
      blank()
    );
    setSubmitted(false);
    setAdding(false);
    setAdd(blankAdd());
    setRemoving(null);
    setConfirmArchive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const service = services.find((s) => s.id === draft.serviceId);
  const capacity = service?.group?.capacity ?? 0;
  const duration = service?.durationMin ?? 0;
  const pros = members.filter((m) => isActiveMember(m) && !!service?.professionalIds.includes(m.id) || m.id === draft.professionalId);
  const occupied = occupyingOf(draft.enrollments).length;
  const full = capacity > 0 && occupied >= capacity;
  const endTime = isStepTime(draft.startTime) && duration ? fromMin(toMin(draft.startTime) + duration) : '';

  const errors = {
    service: !draft.serviceId ? 'Escolha o serviço.' : undefined,
    weekdays: draft.weekdays.length === 0 ? 'Escolha pelo menos um dia.' : undefined,
    time: !isStepTime(draft.startTime) ? 'Escolha o horário de início.' : undefined,
    pro: !draft.professionalId ? 'Escolha o profissional.' : !service?.professionalIds.includes(draft.professionalId) ? 'Este profissional não faz o serviço.' : undefined
  };
  const err = (k: keyof typeof errors) => submitted ? errors[k] : undefined;

  /** Mesma regra da agenda, só a configuração (horário da clínica, jornada, pausas, ausências), na próxima aula de cada dia. */
  const outside = useMemo(() => {
    if (!draft.professionalId || !duration || !isStepTime(draft.startTime)) return [];
    return [...draft.weekdays].
    sort((a, b) => a - b).
    flatMap((d) => {
      const iso = nextClassDates([d], 1)[0];
      if (!iso) return [];
      const r = checkAvailability(getAgendaState(), { professionalId: draft.professionalId, iso, start: draft.startTime, durationMin: duration }, { scope: 'schedule' });
      return r.ok ? [] : [`${mediumDayLabel(iso)}: ${r.message}`];
    });
  }, [draft.professionalId, draft.weekdays, draft.startTime, duration]);

  /**
   * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): a aula ocupa o profissional. Agendamentos que já estão no horário das
   * próximas aulas aparecem no aviso de conflito que já existe (`ConflictNotice`); nada é cancelado nem movido.
   */
  const overlapping = useMemo(() => {
    if (!draft.professionalId || !duration || !isStepTime(draft.startTime) || !draft.weekdays.length) return [];
    const s0 = toMin(draft.startTime);
    const e0 = s0 + duration;
    const { appointments } = getAgendaState();
    return nextClassDates(draft.weekdays, 8).flatMap((iso) =>
    (appointments[iso] ?? []).
    filter((x) => x.professionalId === draft.professionalId && x.status !== 'cancelled' && toMin(x.start) < e0 && s0 < toMin(x.end)).
    map((x) => ({ key: `${iso}-${x.id}`, name: x.clientName, when: `${mediumDayLabel(iso)} ${x.start}–${x.end}` }))
    );
  }, [draft.professionalId, draft.weekdays, draft.startTime, duration]);

  const setD = <K extends keyof Draft,>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  /* ───────── adicionar cliente ───────── */
  const fixedIds = new Set(draft.enrollments.filter((e) => e.kind === 'fixo').map((e) => e.clientId));
  const clientOptions = allClientsForSelect().
  filter((c) => !fixedIds.has(c.id)).
  map((c) => ({ value: c.id, label: c.name }));
  const packages = add.clientId && draft.serviceId ? listPackages({ client_id: add.clientId }).filter((p) => p.service_id === draft.serviceId && p.status === 'active' && p.saldo > 0) : [];
  const dateOptions = nextClassDates(draft.weekdays, 8).map((iso) => ({ value: iso, label: mediumDayLabel(iso) }));
  const addIssue = !add.clientId ?
  'Escolha o cliente.' :
  add.kind === 'avulso' && !add.date ?
  'Escolha a data da aula.' :
  add.kind === 'avulso' && draft.enrollments.some((e) => e.clientId === add.clientId && e.kind === 'avulso' && e.date === add.date) ?
  'Este cliente já está nesta aula.' :
  add.kind === 'fixo' && !add.pay ?
  'Escolha como o cliente paga.' :
  add.kind === 'fixo' && add.pay === 'vender' ?
  'Venda o pacote ou escolha outra forma de pagar.' :
  add.kind === 'fixo' && add.pay === 'pacote' && !packages.some((p) => p.id === add.packageId) ?
  'Escolha o pacote.' :
  null;
  // Pacote único: já vem escolhido. Cliente trocado: a escolha do pacote recomeça.
  useEffect(() => {
    if (add.pay === 'pacote' && packages.length === 1 && add.packageId !== packages[0].id) setAdd((a) => ({ ...a, packageId: packages[0].id }));
    if (add.pay === 'pacote' && packages.length === 0) setAdd((a) => ({ ...a, pay: '', packageId: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [add.pay, add.clientId, packages.length]);

  const confirmAdd = () => {
    if (addIssue || full) return;
    const e: Enrollment = {
      id: newEnrollmentId(),
      turmaId: editing?.id ?? '',
      clientId: add.clientId,
      kind: add.kind,
      ...(add.kind === 'avulso' ? { date: add.date } : {}),
      payment: add.kind === 'fixo' && add.pay === 'pacote' ? 'pacote' : 'por-aula',
      packageId: add.kind === 'fixo' && add.pay === 'pacote' ? add.packageId : null
    };
    setD('enrollments', [...draft.enrollments, e]);
    setAdd(blankAdd());
    setAdding(false);
  };

  const save = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    const t: Turma = { id: editing?.id ?? newTurmaId(), serviceId: draft.serviceId, professionalId: draft.professionalId, weekdays: [...draft.weekdays].sort((a, b) => a - b), startTime: draft.startTime, active: editing?.active ?? true };
    saveTurma(t, draft.enrollments);
    onSaved(t, !editing);
    onClose();
  };

  const nameOf = (id: string) => clientById(id)?.name ?? 'Cliente removido';
  const payText = (e: Enrollment) => {
    if (e.payment !== 'pacote') return 'Paga por aula';
    const p = listPackages({ client_id: e.clientId }).find((x) => x.id === e.packageId);
    return p ? `Pacote · ${textoDisponiveis(p)}` : 'Pacote';
  };
  const sortedEnrollments = [...draft.enrollments].sort((a, b) => Number(a.kind === 'avulso') - Number(b.kind === 'avulso') || (a.date ?? '').localeCompare(b.date ?? '') || nameOf(a.clientId).localeCompare(nameOf(b.clientId)));
  const title = editing ? `Turma de ${service?.name ?? 'serviço'}` : 'Nova turma';

  return (
    <>
      <AppModal
        open={open}
        onClose={onClose}
        dirtyValue={draft}
        size="lg"
        title={title}
        description={editing ? turmaWhen(editing) : 'Em que dias e horário o serviço em grupo acontece e quem participa.'}
        footer={
        <ModalActions
          start={
          editing ?
          <Button variant={editing.active ? 'dangerOutline' : 'neutral'} leftIcon={editing.active ? <ArchiveIcon className="h-4 w-4" /> : <ArchiveRestoreIcon className="h-4 w-4" />} onClick={() => editing.active ? setConfirmArchive(true) : (onArchive(editing, true), onClose())}>
                  {editing.active ? 'Arquivar turma' : 'Reativar turma'}
                </Button> :
          undefined
          }>
          
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save}>{editing ? 'Salvar' : 'Adicionar turma'}</Button>
          </ModalActions>
        }>
        
        <div className="flex flex-col gap-5">
          {/* ───────── Quando ───────── */}
          <section aria-labelledby="turma-quando" className="flex flex-col gap-4">
            <div>
              <h3 id="turma-quando" className={SECTION_TITLE}>
                Quando
              </h3>
              <p className={SECTION_HELP}>O fim de cada aula segue a duração do serviço.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Serviço"
                required
                placeholder="Escolha o serviço"
                options={groupServices.map((s) => ({ value: s.id, label: s.name, description: `${s.durationMin} min · ${s.group?.capacity ?? 0} vagas` }))}
                value={draft.serviceId || undefined}
                onChange={(v) =>
                setDraft((d) => {
                  const next = services.find((s) => s.id === v);
                  return { ...d, serviceId: v, professionalId: next?.professionalIds.includes(d.professionalId) ? d.professionalId : '' };
                })
                }
                error={err('service')} />
              
              <Select
                label="Profissional"
                required
                placeholder={service ? 'Escolha o profissional' : 'Escolha o serviço antes'}
                disabled={!service}
                options={pros.map((m) => ({ value: m.id, label: m.name, color: m.color }))}
                value={draft.professionalId || undefined}
                onChange={(v) => setD('professionalId', v)}
                error={err('pro')}
                helperText={service ? 'Só quem faz este serviço.' : undefined} />
              
              <div className="sm:col-span-2">
                {/* Mesmo padrão dos dias da semana da Pausa coletiva (Funcionamento). */}
                <p className="mb-1.5 text-sm font-semibold text-text-primary">Dias da semana</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                  {WEEKDAY_SHORT.map((d, i) =>
                  <Pill
                    key={d}
                    size="sm"
                    selected={draft.weekdays.includes(i as Weekday)}
                    aria-label={WEEKDAY_LONG[i]}
                    onClick={() => setD('weekdays', draft.weekdays.includes(i as Weekday) ? draft.weekdays.filter((w) => w !== i) : [...draft.weekdays, i].sort((x, y) => x - y) as Weekday[])}>
                    
                      {d}
                    </Pill>
                  )}
                </div>
                {err('weekdays') && <p className="mt-1.5 text-sm text-error">{err('weekdays')}</p>}
              </div>
              <TimeField label="Horário de início" required value={draft.startTime} onChange={(v) => setD('startTime', v)} error={err('time')} helperText={endTime ? `Termina às ${endTime} (${duration} min).` : undefined} />
            </div>
            {outside.length > 0 &&
            <NoticeInline tone="warning" title="Este horário fica fora do atendimento">
                <ul className="flex flex-col gap-1">
                  {outside.map((l) =>
                <li key={l}>{l}</li>
                )}
                </ul>
              </NoticeInline>
            }
            {overlapping.length > 0 &&
            <ConflictNotice
              title={`${overlapping.length} ${overlapping.length === 1 ? 'agendamento fica' : 'agendamentos ficam'} no horário das próximas aulas`}
              items={overlapping}
              footnote="Nada será cancelado nem movido. Remarque esses agendamentos na Agenda ou escolha outro horário para a turma." />

            }
          </section>

          {/* ───────── Clientes da turma ───────── */}
          <section aria-labelledby="turma-clientes" className="flex flex-col gap-3 border-t border-border pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="turma-clientes" className={SECTION_TITLE}>
                Clientes da turma
              </h3>
              <p className="text-sm tabular-nums text-text-secondary">{capacity ? `${occupied} de ${capacity} vagas` : `${occupied} ${occupied === 1 ? 'cliente' : 'clientes'}`}</p>
            </div>
            {sortedEnrollments.length > 0 ?
            <ul className="divide-y divide-border border-y border-border">
                {sortedEnrollments.map((e) =>
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-text-primary">{nameOf(e.clientId)}</span>
                      <span className="block text-xs text-text-secondary">
                        {e.kind === 'fixo' ? 'Fixo' : `Avulso, ${dmy(e.date ?? '')}`} · {payText(e)}
                      </span>
                    </span>
                    <IconButton size="sm" tone="danger" aria-label={`Remover ${nameOf(e.clientId)} da turma`} onClick={() => setRemoving(e)} icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} />
                  </li>
              )}
              </ul> :

            <p className="text-sm text-text-secondary">Nenhum cliente ainda.</p>
            }

            {!adding &&
            <div className="flex flex-wrap items-center gap-3">
                <Button size="md" variant="neutral" leftIcon={<PlusIcon className="h-4 w-4" />} disabled={full || !service} aria-describedby={full ? 'turma-lotada' : undefined} onClick={() => setAdding(true)}>
                  Adicionar cliente
                </Button>
                {full &&
              <p id="turma-lotada" className="text-sm font-semibold text-text-primary">
                    Turma lotada.
                  </p>
              }
              </div>
            }

            {adding &&
            <div className="flex flex-col gap-4 rounded-inner border border-border p-4" aria-label="Adicionar cliente">
                <ClientSelect
                options={clientOptions}
                value={add.clientId}
                onChange={(v) => setAdd((a) => ({ ...a, clientId: v, pay: a.pay === 'pacote' ? '' : a.pay, packageId: '' }))}
                onCreate={(typed) => {
                  setNewClientName(typed);
                  setNewClientOpen(true);
                }} />
              
                <ChoiceCards
                label="Participa como"
                size="sm"
                columns={2}
                value={add.kind}
                onChange={(v) => setAdd((a) => ({ ...a, kind: v === 'avulso' ? 'avulso' : 'fixo' }))}
                options={[
                { value: 'fixo', title: 'Fixo' },
                { value: 'avulso', title: 'Avulso' }]
                }
                helperText={add.kind === 'fixo' ? 'Vem em todas as aulas da turma.' : 'Vem em uma aula só.'} />
              
                {add.kind === 'avulso' &&
              <Select label="Data da aula" required placeholder="Escolha a data" options={dateOptions} value={add.date || undefined} onChange={(v) => setAdd((a) => ({ ...a, date: v }))} helperText="Só os dias desta turma." />
              }
                {add.kind === 'fixo' &&
              <>
                    <ChoiceCards
                  label="Como este cliente paga?"
                  columns={1}
                  value={add.pay}
                  onChange={(v) => setAdd((a) => ({ ...a, pay: v as AddPay, packageId: '' }))}
                  options={[
                  {
                    value: 'pacote',
                    title: 'Pacote que já tem',
                    description: !add.clientId ?
                    'Escolha o cliente primeiro.' :
                    packages.length ?
                    `Cada presença usa uma sessão do pacote de ${service?.name ?? 'este serviço'}.` :
                    `Este cliente não tem pacote de ${service?.name ?? 'este serviço'} com sessões.`,
                    disabled: !packages.length
                  },
                  { value: 'vender', title: 'Vender pacote agora', description: 'Abre a venda de pacote com o cliente e o serviço já escolhidos.' },
                  { value: 'por-aula', title: 'Paga por aula', description: 'Cada aula é cobrada separada.' }]
                  } />
                
                    {add.pay === 'pacote' && packages.length > 1 &&
                <Select
                  label="Pacote"
                  required
                  placeholder="Escolha o pacote"
                  options={packages.map((p) => ({ value: p.id, label: `Pacote de ${p.service_name_snapshot}`, description: textoDisponiveis(p) }))}
                  value={add.packageId || undefined}
                  onChange={(v) => setAdd((a) => ({ ...a, packageId: v }))} />

                }
                    {add.pay === 'pacote' && packages.length === 1 && <p className="text-sm text-text-secondary">Pacote de {packages[0].service_name_snapshot} · {textoDisponiveis(packages[0])}</p>}
                    {add.pay === 'vender' &&
                <div>
                        <Button size="md" variant="secondary" disabled={!add.clientId} aria-describedby={!add.clientId ? 'turma-add-motivo' : undefined} onClick={() => setSaleOpen(true)}>
                          Vender pacote
                        </Button>
                      </div>
                }
                  </>
              }
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {addIssue &&
                <p id="turma-add-motivo" className="mr-auto text-sm text-text-secondary">
                      {addIssue}
                    </p>
                }
                  <Button
                  size="md"
                  variant="neutral"
                  onClick={() => {
                    setAdding(false);
                    setAdd(blankAdd());
                  }}>
                  
                    Desistir
                  </Button>
                  <Button size="md" variant="secondary" disabled={!!addIssue || full} aria-describedby={addIssue ? 'turma-add-motivo' : undefined} onClick={confirmAdd}>
                    Adicionar à turma
                  </Button>
                </div>
              </div>
            }
          </section>
        </div>
      </AppModal>

      <ConfirmDialog
        open={!!removing}
        danger
        focusCancel
        title={removing ? `Tirar ${nameOf(removing.clientId)} da turma?` : ''}
        description="A vaga fica livre para outro cliente. A mudança vale quando você salvar a turma."
        confirmLabel="Tirar da turma"
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && setD('enrollments', draft.enrollments.filter((x) => x.id !== removing.id))} />
      

      <ArchiveConfirm
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={`Arquivar a turma de ${service?.name ?? 'serviço'}?`}
        description="A turma sai da lista. Os clientes inscritos ficam guardados e voltam se você reativar."
        onConfirm={() => {
          if (editing) onArchive(editing, false);
          onClose();
        }} />
      

      <VendaDePacoteModal
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        clientePreSelecionadoId={add.clientId || undefined}
        servicoPreSelecionadoId={draft.serviceId || undefined}
        onSalvo={() => {
          // A venda acabou de criar o pacote: ele passa a ser a forma de pagar deste cliente.
          const novo = listPackages({ client_id: add.clientId }).
          filter((p) => p.service_id === draft.serviceId && p.status === 'active' && p.saldo > 0).
          sort((a, b) => a.created_at < b.created_at ? 1 : -1)[0];
          if (novo) setAdd((a) => ({ ...a, pay: 'pacote', packageId: novo.id }));
        }} />
      

      <NovoClienteModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        initialName={newClientName}
        onSaved={(c) => {
          const id = clientIdOfRecordedName(c.name);
          if (id) setAdd((a) => ({ ...a, clientId: id }));
        }} />
      
    </>);

}