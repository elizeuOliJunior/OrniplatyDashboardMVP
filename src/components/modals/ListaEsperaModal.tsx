import React, { useEffect, useMemo, useState } from 'react';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { NoticeInline } from '../ui/Notice';
import { DateField } from '../ui/DateField';
import { Button } from '../Button';
import { Input } from '../Input';
import { PillGroup } from '../Pill';
import { ClientSelect } from '../client/ClientSelect';
import { NovoClienteModal } from './NovoClienteModal';
import { SelectComCadastro } from '../ui/SelectComCadastro';
import { NovoServicoHost } from '../servicos/NovoServicoHost';
import { NovoProfissionalHost } from '../servicos/NovoProfissionalHost';
import { TurmaModal } from '../servicos/TurmaModal';
import { activeServiceOf, serviceByValue, serviceOptions } from '../../data/catalogo';
import { clientIdOfRecordedName, useClientOptions } from '../../data/api/clientes';
import { getTeam, isActiveMember, useTeam } from '../../data/availability';
import { useAgendaData } from '../../data/agendaLive';
import { NOW, TODAY_ISO, mediumDayLabel } from '../../data/agendaStore';
import type { AgendaWaitlistEntry, WaitlistPeriod } from '../../data/agenda';
import { PERIOD_HELP, PERIOD_OPTIONS, WEEKDAY_OPTIONS, duplicateOf, preferenceLabel } from '../../data/waitlistPrefs';
import { reviewReasonOf } from '../../data/waitlistOffer';
import { turmaWhen, turmasOfService, useTurmas } from '../../data/turmas';
import { dayWordsOf, isGroupService, useServices } from '../../data/servicesStore';
import { alwaysAnswersText, clientIdFromName, kindOf, stoppedSentence, stoppedTitle, useContactBlocks } from '../../data/contactPreferences';

/** W1 (11/11/2026, Christian, decisão 15): a preferência virou campos (dias, período, janela de datas, observação). */
export type NovaEntradaEspera = {
  clientName: string;
  service: string;
  professional: string;
  preference: string;
  days: number[];
  periods: WaitlistPeriod[];
  fromIso: string;
  untilIso?: string;
  note?: string;
  /** CONTRATO NOVO (aulas em grupo, G2, 23/11/2026): turma pedida, só em serviço em grupo (opcional). */
  turmaId?: string;
};

type ListaEsperaModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (entry: NovaEntradaEspera) => void;
  /**
   * W3 (11/11/2026, Christian): pedido já existente aberto no MESMO formulário.
   *  - `editar` (D-A3-4 e "Editar" de qualquer pedido): o pedido continua no mesmo lugar da fila;
   *  - `renovar` (pedido vencido › "Voltar para a fila"): datas novas, a partir de hoje; entra no fim da fila.
   */
  editing?: AgendaWaitlistEntry | null;
  mode?: 'novo' | 'editar' | 'renovar';
  /** G2 (aulas em grupo; CONTRATO NOVO): pedido novo já preenchido (ex.: aula lotada › "Pôr na lista de espera"). */
  initial?: {client?: string;service?: string;turmaId?: string;};
};

/** Sem preferência de profissional (continua valendo mesmo sem nenhum profissional ativo). */
const ANY = 'qualquer';
/** "Qualquer dia" / "Qualquer horário": pílula que limpa as outras do grupo. */
const ANY_DAY = 'qualquer-dia';
const ANY_PERIOD = 'qualquer-horario';

const emptyForm = { client: '', service: '', professional: ANY, days: [] as number[], periods: [] as WaitlistPeriod[], from: TODAY_ISO, until: '', note: '', turma: '' };

const listOf = (v: string | string[]) => Array.isArray(v) ? v : [v];

/** Formulário a partir de um pedido já gravado (serviço pelo nome atual; profissional pelo nome). */
function formOf(e: AgendaWaitlistEntry, renew: boolean) {
  const member = getTeam().members.find((m) => m.name === e.professional);
  return {
    client: e.clientName,
    service: activeServiceOf(e.service)?.value ?? '',
    professional: member && isActiveMember(member) ? member.id : ANY,
    days: e.days ?? [],
    periods: e.periods ?? [],
    from: renew || !e.fromIso || e.fromIso < TODAY_ISO ? TODAY_ISO : e.fromIso,
    until: renew ? '' : e.untilIso ?? '',
    note: e.note ?? '',
    turma: e.turmaId ?? ''
  };
}

/**
 * L24c (19/11/2026, pedido 3a): o campo Cliente é o `ClientSelect` (DS 6.2 `Select searchable`): filtra enquanto digita e,
 * no pedido novo, tem "Cadastrar cliente" no topo da lista, que abre o Novo cliente com o nome digitado; o cliente cadastrado
 * volta escolhido. Em Editar e Voltar para a fila o campo continua travado (como antes).
 */
export function ListaEsperaModal({ open, onClose, onSaved, editing, mode = 'novo', initial }: ListaEsperaModalProps) {
  const toast = useToast();
  // G1 (F-001): clientes do cadastro único (data/api/clientes.ts).
  const clientOptions = useClientOptions();
  // G1 (F-003, 24/10/2026): profissionais da equipe ATIVA (data/availability.ts).
  const { members } = useTeam();
  const { waitlist, appointments } = useAgendaData();
  // L24a: reage quando a Preferência de contato muda na Ficha.
  useContactBlocks();
  const proOptions = useMemo(
    () => [{ value: ANY, label: 'Qualquer profissional' }, ...members.filter(isActiveMember).map((m) => ({ value: m.id, label: m.name, color: m.color }))],
    [members]
  );
  const [form, setForm] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [proError, setProError] = useState<string | undefined>();
  /** L24c: janela Novo cliente aberta a partir de "Cadastrar cliente", com o nome digitado. */
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  /** CONTRATO NOVO (seletor com cadastro, 23/11/2026): "Cadastrar serviço" e "Cadastrar profissional" abrem a janela de cadastro por cima (montada só enquanto usada). */
  const [newSvc, setNewSvc] = useState<{mounted: boolean;open: boolean;typed: string;}>({ mounted: false, open: false, typed: '' });
  const [newPro, setNewPro] = useState<{mounted: boolean;open: boolean;typed: string;}>({ mounted: false, open: false, typed: '' });
  const closeNewSvc = () => {
    setNewSvc((e) => ({ ...e, open: false }));
    window.setTimeout(() => setNewSvc((e) => e.open ? e : { ...e, mounted: false }), 400);
  };
  const closeNewPro = () => {
    setNewPro((e) => ({ ...e, open: false }));
    window.setTimeout(() => setNewPro((e) => e.open ? e : { ...e, mounted: false }), 400);
  };
  /** CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2c): "Cadastrar turma" abre a janela da turma por cima. */
  const [newTurmaOpen, setNewTurmaOpen] = useState(false);
  const isEdit = mode !== 'novo' && !!editing;

  useEffect(() => {
    if (open) {
      setForm(isEdit && editing ? formOf(editing, mode === 'renovar') : { ...emptyForm, client: initial?.client ?? '', service: initial?.service ?? '', turma: initial?.turmaId ?? '' });
      setSubmitted(false);
      setProError(undefined);
      setNewClientOpen(false);
      setNewClientName('');
      setNewSvc({ mounted: false, open: false, typed: '' });
      setNewPro({ mounted: false, open: false, typed: '' });
      setNewTurmaOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: 'client' | 'service' | 'professional' | 'from' | 'until' | 'note' | 'turma') => (value: string) => {
    if (key === 'professional') setProError(undefined);
    // G2: trocar o serviço limpa a turma (a turma é do serviço).
    setForm((f) => ({ ...f, [key]: value, ...(key === 'service' && value !== f.service ? { turma: '' } : {}) }));
  };
  /** G2 (aulas em grupo; CONTRATO NOVO): serviço em grupo pode pedir uma turma (opcional). */
  useTurmas();
  const servicesList = useServices().services;
  const groupService = servicesList.find((x) => x.id === form.service && isGroupService(x));
  const turmaOptions = groupService ? turmasOfService(groupService.id).map((t) => ({ value: t.id, label: turmaWhen(t), description: getTeam().members.find((m) => m.id === t.professionalId)?.name })) : [];
  // Escolher "Qualquer dia" limpa os dias; escolher um dia tira o "Qualquer dia".
  const setDays = (v: string | string[]) => {
    const picked = listOf(v);
    const hadAny = form.days.length === 0;
    const days = picked.includes(ANY_DAY) && !hadAny ? [] : picked.filter((x) => x !== ANY_DAY).map(Number);
    setForm((f) => ({ ...f, days }));
  };
  const setPeriods = (v: string | string[]) => {
    const picked = listOf(v);
    const hadAny = form.periods.length === 0;
    const periods = picked.includes(ANY_PERIOD) && !hadAny ? [] : picked.filter((x) => x !== ANY_PERIOD) as WaitlistPeriod[];
    setForm((f) => ({ ...f, periods }));
  };
  // L24a: lê o tipo "Aviso de vaga" da Preferência de contato, pelo id do cadastro (o nome escolhido é o atual).
  const vagaRecord = form.client ? kindOf(clientIdOfRecordedName(form.client) ?? clientIdFromName(form.client), 'vaga') : null;
  const optedOut = vagaRecord && vagaRecord.status === 'nao-recebe' ? vagaRecord : null;
  const optedOutText = optedOut ? `${stoppedSentence(form.client, 'vaga', optedOut)}. Fica na lista, mas a vaga não é oferecida a ele.` : '';
  const serviceLabel = serviceByValue(form.service)?.label ?? '';
  // W1: mesmo cliente + mesmo serviço = bloqueado; outro serviço = avisa e deixa passar. W3: na edição, o próprio pedido não conta.
  const others = isEdit && editing ? waitlist.filter((e) => e.id !== editing.id) : waitlist;
  const duplicate = duplicateOf(others, form.client, serviceLabel);
  /** W3 (A1-14): o cliente já tem HORÁRIO FUTURO do mesmo serviço. Avisa e deixa passar. */
  const booked = useMemo(() => {
    if (!form.client || !serviceLabel) return null;
    const id = clientIdOfRecordedName(form.client);
    const same = (name: string) => id ? clientIdOfRecordedName(name) === id : name === form.client;
    return (
      Object.entries(appointments).
      flatMap(([iso, list]) => list.map((a) => ({ iso, a }))).
      filter((x) => (x.iso > TODAY_ISO || x.iso === TODAY_ISO && x.a.start >= NOW) && x.a.status !== 'cancelled' && x.a.status !== 'no_show' && x.a.status !== 'completed').
      filter((x) => same(x.a.clientName) && (activeServiceOf(x.a.service)?.label ?? x.a.service) === serviceLabel).
      sort((p, q) => (p.iso + p.a.start).localeCompare(q.iso + q.a.start))[0] ?? null);

  }, [appointments, form.client, serviceLabel]);
  const fromError = !form.from ? 'Escolha a data.' : form.from < TODAY_ISO ? 'Escolha hoje ou uma data futura.' : undefined;
  const untilError = form.until && form.from && form.until < form.from ? 'Escolha uma data igual ou depois de “A partir de”.' : undefined;
  /** W3 (D-A3-4): o que fez o pedido precisar de revisão (some quando a pessoa corrige). */
  const reviewNow = isEdit && editing ? reviewReasonOf(editing) : null;

  const save = () => {
    setSubmitted(true);
    // Confere de novo na hora de salvar (o profissional pode ter sido arquivado com a janela aberta).
    const chosen = form.professional === ANY ? null : getTeam().members.find((m) => m.id === form.professional);
    const proInvalid = form.professional !== ANY && !(chosen && isActiveMember(chosen));
    if (proInvalid) setProError('Este profissional não está ativo. Escolha outro ou “Qualquer profissional”.');
    if (!form.client || !form.service || proInvalid || fromError || untilError || duplicate?.kind === 'same') return;
    const fields = { days: form.days, periods: form.periods, fromIso: form.from, untilIso: form.until || undefined };
    onSaved({
      clientName: form.client,
      service: serviceLabel,
      professional: chosen ? chosen.name : 'qualquer profissional',
      ...fields,
      preference: preferenceLabel({ preference: '', ...fields }),
      note: form.note.trim() || undefined,
      turmaId: groupService && form.turma ? form.turma : undefined
    });
    toast({
      title: mode === 'editar' ? 'Pedido atualizado' : mode === 'renovar' ? 'Pedido voltou para a fila' : 'Pedido registrado na lista de espera',
      description: optedOut ?
      optedOutText :
      mode === 'editar' ?
      `${form.client} continua no mesmo lugar da fila.` :
      mode === 'renovar' ?
      `${form.client} entrou no fim da fila com as datas novas.` :
      'Quando abrir uma vaga que sirva, ela aparece em Vagas liberadas para a equipe oferecer.'
    });
    onClose();
  };

  return (
    <>
    <AppModal
        open={open}
        covered={newClientOpen || newSvc.open || newPro.open || newTurmaOpen}
        onClose={onClose}
        title={mode === 'editar' ? 'Editar pedido da lista de espera' : mode === 'renovar' ? 'Voltar para a fila' : 'Adicionar à lista de espera'}
        description={
        mode === 'editar' ?
        'O pedido continua no mesmo lugar da fila.' :
        mode === 'renovar' ?
        'O pedido venceu. Escolha as datas novas: ele entra no fim da fila.' :
        'Pedido do cliente, que quer ser avisado quando surgir uma vaga.'
        }
        footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>{mode === 'editar' ? 'Salvar pedido' : mode === 'renovar' ? 'Voltar para a fila' : 'Adicionar'}</Button>
        </>
        }>
        
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {reviewNow &&
          <NoticeInline tone="warning" title="Este pedido precisa ser revisado" className="sm:col-span-2">
            Motivo: {reviewNow}. Escolha outro serviço ou outro profissional (ou “Qualquer profissional”) e salve. Enquanto isso, ele não recebe ofertas de vaga.
          </NoticeInline>
          }
        <div className="sm:col-span-2">
          <ClientSelect
              required
              disabled={isEdit}
              options={isEdit && form.client && !clientOptions.some((o) => o.value === form.client) ? [{ value: form.client, label: form.client }, ...clientOptions] : clientOptions}
              value={form.client}
              onChange={set('client')}
              error={submitted && !form.client ? 'Escolha o cliente.' : undefined}
              onCreate={
              isEdit ?
              undefined :
              (typed) => {
                setNewClientName(typed);
                setNewClientOpen(true);
              }
              } />
            
        </div>
        {optedOut &&
          <NoticeInline tone="warning" title={stoppedTitle('vaga')} className="sm:col-span-2">
            {optedOutText} {alwaysAnswersText()}
          </NoticeInline>
          }
        {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026): "Cadastrar serviço" e "Cadastrar profissional" no topo da lista, só no pedido novo (como o cliente). */}
        <SelectComCadastro
            label="Serviço"
            required
            placeholder="Escolha o serviço"
            options={serviceOptions}
            value={form.service || undefined}
            onChange={set('service')}
            error={submitted && !form.service ? 'Escolha o serviço.' : duplicate?.kind === 'same' ? 'Este cliente já tem um pedido para este serviço.' : undefined}
            createLabel="Cadastrar serviço"
            onCreate={isEdit ? undefined : (typed) => setNewSvc({ mounted: true, open: true, typed })} />
          
        <SelectComCadastro
            label="Profissional"
            options={proOptions}
            value={form.professional}
            onChange={set('professional')}
            error={proError}
            helperText={proOptions.length === 1 ? 'Nenhum profissional ativo agora: o pedido fica para qualquer profissional.' : undefined}
            createLabel="Cadastrar profissional"
            onCreate={isEdit ? undefined : (typed) => setNewPro({ mounted: true, open: true, typed })} />
          
        {groupService &&
          <div className="sm:col-span-2">
            {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2c): primeira linha "Cadastrar turma" (só pedido novo). */}
            <SelectComCadastro
              label="Turma"
              options={[{ value: '', label: 'Qualquer turma' }, ...turmaOptions]}
              value={form.turma}
              onChange={set('turma')}
              helperText={`Opcional. Com a turma, o pedido é para ${dayWordsOf(groupService).pick('as', 'os')} ${dayWordsOf(groupService).many} dela.`}
              createLabel="Cadastrar turma"
              onCreate={isEdit ? undefined : () => setNewTurmaOpen(true)} />
            
          </div>
          }
        {duplicate?.kind === 'same' &&
          <NoticeInline tone="warning" role="alert" title={`${form.client} já está na lista de espera para ${duplicate.entry.service}`} className="sm:col-span-2">
            Não dá para ter dois pedidos iguais. O pedido atual é: {preferenceLabel(duplicate.entry)}. Para mudar a preferência, use “Editar” no pedido da lista.
          </NoticeInline>
          }
        {duplicate?.kind === 'other' &&
          <NoticeInline tone="info" title={`${form.client} já tem ${duplicate.entries.length === 1 ? 'um pedido' : `${duplicate.entries.length} pedidos`} na lista de espera`} className="sm:col-span-2">
            {duplicate.entries.map((e) => e.service).join(', ')}. Este será mais um pedido, para outro serviço. Pode adicionar.
          </NoticeInline>
          }
        {/* W3 (A1-14): mesmo padrão do aviso de pedido em outro serviço: avisa e deixa passar. */}
        {booked &&
          <NoticeInline tone="info" title={`${form.client} já tem ${booked.a.service} marcado`} className="sm:col-span-2">
            {mediumDayLabel(booked.iso)} às {booked.a.start}. Se o pedido é por um horário antes desse, pode {isEdit ? 'salvar' : 'adicionar'}. Quando o cliente aceitar uma vaga, lembre de cancelar ou remarcar o horário que já existe.
          </NoticeInline>
          }
        <div className="sm:col-span-2">
          <PillGroup
              label="Dias da semana"
              size="sm"
              multiple
              value={form.days.length === 0 ? [ANY_DAY] : form.days.map(String)}
              onChange={setDays}
              options={[{ value: ANY_DAY, label: 'Qualquer dia' }, ...WEEKDAY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))]} />
            
        </div>
        <div className="sm:col-span-2">
          <PillGroup
              label="Período"
              size="sm"
              multiple
              helperText={PERIOD_HELP}
              value={form.periods.length === 0 ? [ANY_PERIOD] : form.periods}
              onChange={setPeriods}
              options={[{ value: ANY_PERIOD, label: 'Qualquer horário' }, ...PERIOD_OPTIONS]} />
            
        </div>
        <DateField label="A partir de" required clearable={false} value={form.from} onChange={set('from')} error={submitted ? fromError : undefined} />
        <DateField
            label="Até (opcional)"
            value={form.until}
            onChange={set('until')}
            error={untilError}
            helperText={untilError ? undefined : 'Em branco: o pedido vale para qualquer data futura. Preenchido: no dia seguinte, o pedido sai da fila sozinho e vai para “Pedidos vencidos”.'} />
          
        <div className="sm:col-span-2">
          <Input label="Observação (opcional)" placeholder="Ex.: só depois das 17h" value={form.note} onChange={(e) => set('note')(e.target.value)} />
        </div>
        <p className="text-sm text-text-secondary sm:col-span-2">A preferência põe este pedido na frente quando a vaga combina com ela. Ninguém fica de fora por causa da preferência.</p>
      </div>
    </AppModal>
    {/* L24c: Novo cliente aberto por "Cadastrar cliente", com o nome digitado; o cliente cadastrado volta escolhido. */}
    <NovoClienteModal
        open={open && newClientOpen}
        onClose={() => setNewClientOpen(false)}
        initialName={newClientName}
        onSaved={(c) => setForm((f) => ({ ...f, client: c.name }))} />
      
    {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026): cadastro aberto pelos seletores; ao adicionar, volta com o item escolhido. Cancelar volta sem mudar nada. */}
    {newSvc.mounted &&
      <NovoServicoHost
        open={open && newSvc.open}
        initialName={newSvc.typed || undefined}
        onClose={closeNewSvc}
        onCreated={(s) => {
          if (s.active) set('service')(s.id);
        }} />

      }
    {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2c): a janela da turma que já existe, em criação, com o
           serviço do pedido; ao adicionar, volta com a turma escolhida. Cancelar volta sem mudar nada. */}
    <TurmaModal
        open={open && newTurmaOpen}
        onClose={() => setNewTurmaOpen(false)}
        editing={null}
        initialServiceId={form.service || undefined}
        services={servicesList}
        members={members}
        onSaved={(t) => {
          const s = servicesList.find((x) => x.id === t.serviceId);
          const pro = members.find((m) => m.id === t.professionalId);
          toast({ title: 'Turma adicionada', description: `${s?.name ?? 'Turma'}: ${turmaWhen(t).toLowerCase()}${pro ? `, com ${pro.name}` : ''}.` });
          if (t.serviceId === form.service) set('turma')(t.id);
        }}
        onArchive={() => undefined} />
      
    {newPro.mounted &&
      <NovoProfissionalHost
        open={open && newPro.open}
        initialName={newPro.typed || undefined}
        initialServiceIds={form.service ? [form.service] : undefined}
        onClose={closeNewPro}
        onCreated={(m) => set('professional')(m.id)} />

      }
    </>);

}