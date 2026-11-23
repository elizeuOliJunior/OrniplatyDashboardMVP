import { twMerge } from 'tailwind-merge';
import { wordsNow } from '../../data/segment';
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheckIcon, CalendarClockIcon, CalendarOffIcon, CheckIcon, ChevronRightIcon, CoffeeIcon, DownloadIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon, ZapIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, IconButton, InfoTip, ProfessionalTag, StatusBadge, clickableCardClass, clickableChevronClass } from '../Card';
import { Toggle } from '../Toggle';
import { Input } from '../Input';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { Pill, PillGroup } from '../Pill';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { useToast } from '../ui/Toast';
import { ConflictNotice, NoticeInline } from '../ui/Notice';
import { clinicBlockLabel } from '../../data/equipeFuncionamento';
import type { BusinessDay, ClinicBlock } from '../../data/equipeFuncionamento';
import { DateField } from '../ui/DateField';
import { TimeField } from '../ui/TimeField';
import { useDirtyForm } from '../../data/dirtyGuard';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { agendaLink } from '../../data/deepLinks';
import { bufferMinutes, getTeam, isActiveMember, newScheduleConflicts, scheduleConflicts, setClinicBlocks, setClinicHours, setSharedBreaks, useTeam } from '../../data/availability';
import type { ScheduleConflict, SharedBreakRule } from '../../data/availability';
import { getAgendaState, useAgendaData } from '../../data/agendaLive';
import { TODAY_ISO, mediumDayLabel } from '../../data/agendaStore';
import { shortDate } from '../../data/catalogo';
import { WEEKDAY_LONG, WEEKDAY_SHORT, bufferLabel, clinicDayError, clinicPeriods, exceptionOn, newId, publicReasonOf, toMin, withClinicPeriods } from '../../data/schedule';
import { exceptionKindLabel, useExceptionLog } from '../../data/exceptions';
import { SLOT_STEP_OPTIONS, setBookingRules, useBookingRules } from '../../data/bookingRules';
import { offersHitBy } from '../../data/waitlistOffer';
import type { OfferHit } from '../../data/waitlistOffer';
import type { BookingRules } from '../../data/bookingRules';
import { makeupOn, setMakeupRules, useMakeupRules } from '../../data/makeupRules';
import type { MakeupRules } from '../../data/makeupRules';
import { hasActiveGroupService, useServices } from '../../data/servicesStore';
import { useServiceConflicts } from '../../data/serviceConflicts';
import { LOCAL_SUGGESTIONS, NATIONAL_HOLIDAYS, scopeLabel, setClinicDateMeta, useClinicDateMeta } from '../../data/clinicCalendar';
import type { HolidayScope } from '../../data/clinicCalendar';

/* ───────────── utilidades ───────────── */

// G3 (F-050): sem o identificador técnico do fuso na tela.
const TIMEZONE_LABEL = 'Horário de Brasília';
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const blockTypes = [
{ value: 'fechado', label: 'Fechado o dia todo' },
{ value: 'reduzido', label: 'Horário reduzido' },
{ value: 'aberto', label: 'Abertura extraordinária' }];

const kindOf = (type: string): ClinicBlock['kind'] => type === 'fechado' ? 'closed' : type === 'reduzido' ? 'reduced' : 'open';
const typeOf = (k: ClinicBlock['kind']) => k === 'closed' ? 'fechado' : k === 'reduced' ? 'reduzido' : 'aberto';
const kindBadge: Record<ClinicBlock['kind'], {tone: 'warning' | 'info' | 'neutral';label: string;}> = {
  closed: { tone: 'warning', label: 'Fechado' },
  reduced: { tone: 'neutral', label: 'Reduzido' },
  open: { tone: 'info', label: 'Abertura' }
};

/** Agendamentos ativos numa data (nada é cancelado ao mexer em datas especiais). */
function apptsOn(appointments: Record<string, {status: string;clientName: string;start: string;end: string;id: string;}[]>, iso: string) {
  return (appointments[iso] ?? []).filter((a) => a.status !== 'cancelled');
}

/**
 * W9b (12/11/2026, A3-24): `offers` = vagas da lista de espera com oferta em andamento (ou aceita, faltando marcar) que a
 * mudança deixa fora do expediente. Entram na mesma lista, com o que fazer depois de salvar.
 */
function ConflictAlert({ conflicts, title, ack, onAck, offers = [] }: {conflicts: ScheduleConflict[];title: string;ack?: boolean;onAck?: (v: boolean) => void;offers?: OfferHit[];}) {
  const offerPart = offers.length ? `${offers.length} ${offers.length === 1 ? 'vaga oferecida pela lista de espera' : 'vagas oferecidas pela lista de espera'}` : '';
  const head = conflicts.length ? `${conflicts.length} ${title}${offerPart ? `, e ${offerPart}` : ''}` : `${offerPart} ${offers.length === 1 ? 'fica fora do expediente' : 'ficam fora do expediente'}`;
  return (
    <ConflictNotice
      className="mt-4"
      title={head}
      items={[...conflicts.map((c) => ({ key: c.appt.id, name: c.appt.clientName, when: `${mediumDayLabel(c.iso)} ${c.appt.start}–${c.appt.end}` })), ...offers]}
      footnote={`Nada será cancelado nem movido. ${conflicts.length ? 'Eles continuam na agenda, marcados como conflito, até você remarcar.' : ''}${offers.length ? `${conflicts.length ? ' ' : ''}A oferta da vaga continua aberta: depois de salvar, cancele a oferta em Agenda › Lista de espera e avise o cliente.` : ''}`}
      ack={ack}
      onAck={onAck} />);


}

/** Cabeçalho padrão de cada seção: título, explicação de 1 linha e "Como isso afeta a agenda". */
function SectionHead({ id, title, line, effect, icon }: {id: string;title: string;line: string;effect: string;icon: React.ReactNode;}) {
  return (
    <CardHeader>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-primary-soft text-primary" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0">
          <CardTitle as="h2" id={`${id}-titulo`} className="inline-flex items-center gap-1.5">
            {title}
            <InfoTip label="Como isto afeta a agenda" content={effect} />
          </CardTitle>
          <p className="mt-0.5 text-sm text-text-secondary">{line}</p>
        </div>
      </div>
    </CardHeader>);

}

/* ───────────── A) Horário da clínica ───────────── */

function HorarioCard() {
  const toast = useToast();
  const { hours: savedWeek, members } = useTeam();
  const [week, setWeek] = useState<BusinessDay[]>(savedWeek);
  const [ack, setAck] = useState(false);
  const update = (i: number, next: BusinessDay) => setWeek((w) => w.map((d, idx) => idx === i ? next : d));
  // G3 (F-050): vários períodos no dia, validados pela mesma regra dos dois projetos (data/schedule.ts).
  const invalidIdx = week.findIndex((d) => !!clinicDayError(d));
  const invalid = invalidIdx >= 0 ? week[invalidIdx] : undefined;
  const setPeriods = (i: number, periods: {start: string;end: string;}[]) => update(i, withClinicPeriods(week[i], periods));
  const dirty = JSON.stringify(week) !== JSON.stringify(savedWeek);
  const conflicts = useMemo(() => !dirty || invalid ? [] : newScheduleConflicts(getAgendaState(), { hours: week }), [week, dirty, invalid]);
  useEffect(() => setAck(false), [week]);

  // Jornadas que passariam a ficar (em parte) fora do horário da clínica
  const outside = useMemo(() => {
    if (!dirty || invalid) return [];
    const out: string[] = [];
    members.filter(isActiveMember).forEach((m) => {
      const days = m.week.
      map((d, i) => ({ d, i, c: week[i] })).
      filter(({ d, c }) => d.working && d.periods.length > 0 && (!c.open || d.periods.some((p) => !clinicPeriods(c).some((w) => toMin(p.start) >= toMin(w.start) && toMin(p.end) <= toMin(w.end))))).
      map(({ i }) => WEEKDAY_SHORT[i]);
      if (days.length) out.push(`${m.name} (${days.join(', ')})`);
    });
    return out;
  }, [members, week, dirty, invalid]);

  const saveWeek = (): boolean => {
    if (invalid) return false;
    if (conflicts.length > 0 && !ack) return false;
    setClinicHours(week);
    setAck(false);
    toast({ title: 'Horários salvos', description: 'A agenda e a assistente já usam o novo horário.' });
    return true;
  };
  useDirtyForm('servicos-funcionamento', dirty, { save: saveWeek, discard: () => setWeek(savedWeek) });

  return (
    <Card as="section" padding="lg" id="func-horario" aria-labelledby="func-horario-titulo" className="scroll-mt-6">
      <SectionHead
        id="func-horario"
        icon={<CalendarClockIcon className="h-5 w-5" />}
        title={`Horário ${wordsNow().of}`}
        line={`Dias e horários em que ${wordsNow().the} atende. Sábado e domingo podem abrir normalmente.`}
        effect={`A assistente só oferece horários em que ${wordsNow().the} e o profissional estão atendendo. Se ${wordsNow().the} fecha às 18:00, ninguém é marcado depois disso.`} />
      
      <CardContent>
        <p className="mb-3 text-sm text-text-secondary">
          Fuso: <span className="font-semibold text-text-primary">{TIMEZONE_LABEL}</span>
        </p>
        <ul className="divide-y divide-border border-y border-border">
          {week.map((d, i) =>
          <li key={d.day} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:gap-6">
              <div className="sm:w-48">
                <Toggle checked={d.open} onCheckedChange={(checked: boolean) => update(i, { ...d, open: checked })} labelPosition="right" label={<span className="text-base font-semibold text-text-primary">{d.day}</span>} />
              </div>
              {d.open ?
            <div className="flex flex-1 flex-col gap-2">
                  {clinicPeriods(d).map((p, k, all) =>
              <div key={k} className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-text-secondary">das</span>
                      <TimeField ariaLabel={`${d.day}, período ${k + 1}, das`} value={p.start} onChange={(v) => setPeriods(i, all.map((x, j) => j === k ? { ...x, start: v } : x))} className="w-32" />
                      <span className="text-sm text-text-secondary">às</span>
                      <TimeField ariaLabel={`${d.day}, período ${k + 1}, às`} value={p.end} onChange={(v) => setPeriods(i, all.map((x, j) => j === k ? { ...x, end: v } : x))} className="w-32" />
                      {all.length > 1 &&
                <IconButton
                  size="md"
                  tone="danger"
                  aria-label={`Remover o período ${k + 1} de ${d.day}`}
                  onClick={() => setPeriods(i, all.filter((_, j) => j !== k))}
                  icon={<XIcon className="h-4 w-4" aria-hidden="true" />} />

                }
                    </div>
              )}
                  <div>
                    <Button
                  size="sm"
                  variant="neutral"
                  leftIcon={<PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => {
                    const all = clinicPeriods(d);
                    const last = all[all.length - 1];
                    const start = last ? Math.min(toMin(last.end) + 60, 22 * 60) : 14 * 60;
                    const end = Math.min(start + 4 * 60, 23 * 60 + 55);
                    const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
                    setPeriods(i, [...all, { start: fmt(start), end: fmt(end) }]);
                  }}>
                  
                      Adicionar período
                    </Button>
                  </div>
                  {clinicDayError(d) && <p className="text-sm text-error">{clinicDayError(d)}</p>}
                </div> :

            <p className="flex flex-1 items-center text-sm font-semibold text-text-secondary sm:min-h-[var(--size-button-min-height)]">Fechado</p>
            }
            </li>
          )}
        </ul>
        <p className="mt-3 text-xs text-text-secondary">O dia pode ter mais de um período (ex.: 08:00–12:00 e 14:00–18:00): fora deles ninguém é marcado. Para uma pausa {wordsNow().fem ? "da" : "do"} {wordsNow().noun} {wordsNow().fem ? 'inteira' : 'inteiro'} em vários dias, use a Pausa coletiva abaixo; o almoço de cada profissional fica na jornada dele.</p>
        {outside.length > 0 &&
        <NoticeInline className="mt-4" tone="warning" title="Parte da jornada destes profissionais fica fora do novo horário">
            {outside.join(' · ')}. Esses horários deixam de ser oferecidos (vale a interseção). A jornada deles não é apagada.
          </NoticeInline>
        }
        <ConflictAlert conflicts={conflicts} title={conflicts.length === 1 ? 'agendamento ficaria fora do novo horário' : 'agendamentos ficariam fora do novo horário'} ack={ack} onAck={setAck} />
        <div className="mt-5 flex flex-col items-end gap-2">
          {invalid && <p className="text-sm text-error">{invalid.day}: {clinicDayError(invalid)}</p>}
          {!dirty && <p id="funcionamento-sem-alteracao" className="text-xs text-text-muted">Nenhuma alteração para salvar.</p>}
          <Button size="md" disabled={!!invalid || !dirty || conflicts.length > 0 && !ack} aria-describedby={!dirty ? 'funcionamento-sem-alteracao' : undefined} onClick={() => saveWeek()}>
            Salvar horários
          </Button>
        </div>
      </CardContent>
    </Card>);

}

/* ───────────── B) Feriados e datas especiais ───────────── */

type DateForm = {id?: string;date: string;type: string;until: string;from: string;to: string;reason: string;scope: HolidayScope;yearly: boolean;reasonShared: boolean;publicLabel?: string;};

function DataEspecialModal({ open, onClose, initial }: {open: boolean;onClose: () => void;initial: DateForm | null;}) {
  const metaAll = useClinicDateMeta();
  const toast = useToast();
  const agenda = useAgendaData();
  const blank: DateForm = { date: '', type: 'fechado', until: '13:00', from: '08:00', to: '12:00', reason: '', scope: 'clinica', yearly: false, reasonShared: false };
  const [form, setForm] = useState<DateForm>(blank);
  const [submitted, setSubmitted] = useState(false);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial ?? blank);
      setSubmitted(false);
      setAck(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidate = (): ClinicBlock => {
    const kind = kindOf(form.type);
    return {
      id: form.id ?? `b-${Date.now()}`,
      date: form.date,
      kind,
      until: kind === 'reduced' ? form.until : undefined,
      from: kind === 'open' ? form.from : undefined,
      to: kind === 'open' ? form.to : undefined,
      reason: form.reason.trim(),
      // G3 (F-058/F-049): motivo interno × público, repetição anual no próprio registro.
      ...(form.reasonShared ? { reasonShared: true } : {}),
      ...(form.publicLabel && kind === 'closed' ? { publicLabel: form.publicLabel } : {}),
      ...(form.yearly ? { yearly: true } : {})
    };
  };
  // G3 (F-049): data nova no passado não; mesma data e mesmo tipo (inclusive pela repetição anual) não duplica.
  const others = getTeam().blocks.filter((b) => b.id !== form.id);
  const kindNow = kindOf(form.type);
  const sameKind = form.date ? others.find((b) => b.kind === kindNow && (exceptionOn(b, form.date) || form.yearly && exceptionOn({ date: form.date, yearly: true }, b.date))) : undefined;
  const dateError = !form.date ?
  'Escolha a data.' :
  !form.id && form.date < TODAY_ISO ?
  'Escolha uma data a partir de hoje.' :
  sameKind ?
  `Já existe ${kindBadge[kindNow].label.toLowerCase()} cadastrado em ${shortDate(sameKind.date)}${sameKind.date !== form.date ? ' (repete todo ano)' : ''}. Edite a data existente.` :
  undefined;
  const openingSameDay = form.date && kindNow === 'closed' ? others.find((b) => b.kind === 'open' && exceptionOn(b, form.date)) : undefined;
  const rangeError = form.type === 'aberto' && toMin(form.to) <= toMin(form.from) ? 'O fim precisa ser depois do início.' : undefined;
  const impact = useMemo(() => {
    if (!open || !form.date || rangeError) return [];
    const others = getTeam().blocks.filter((b) => b.id !== form.id);
    return newScheduleConflicts(getAgendaState(), { clinicBlocks: [...others, { ...candidate(), id: 'novo' }] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form, rangeError]);
  // W9b (A3-24): vaga da lista de espera com oferta em andamento ou aceita nesse dia também entra no aviso.
  const offerImpact = useMemo(() => {
    if (!open || !form.date || rangeError) return [];
    const others = getTeam().blocks.filter((b) => b.id !== form.id);
    return offersHitBy({ clinicBlocks: [...others, { ...candidate(), id: 'novo' }] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form, rangeError]);
  const mustAck = impact.length > 0 || offerImpact.length > 0;
  useEffect(() => setAck(false), [impact.length, offerImpact.length]);
  const sameDay = form.date ? apptsOn(agenda.appointments, form.date).length : 0;

  const save = () => {
    setSubmitted(true);
    if (dateError || rangeError) return;
    if (mustAck && !ack) return;
    const b = candidate();
    setClinicBlocks((list) => list.some((x) => x.id === b.id) ? list.map((x) => x.id === b.id ? b : x) : [...list, b]);
    setClinicDateMeta(b.id, { scope: form.scope, yearly: form.yearly, imported: (form.id ? metaAll[form.id]?.imported : false) ?? false });
    toast({ title: form.id ? 'Data especial atualizada' : 'Data especial adicionada', description: `${shortDate(b.date)} · ${clinicBlockLabel(b)}` });
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={form.id ? 'Editar data especial' : 'Adicionar data especial'}
      description="Feriado, recesso, dia com horário diferente ou abertura extraordinária (ex.: um sábado). A agenda e a assistente seguem exatamente isso."
      footer={
      <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={mustAck && !ack}>
            {form.id ? 'Salvar' : 'Adicionar'}
          </Button>
        </ModalActions>
      }>
      
      <div className="flex flex-col gap-4">
        <DateField label="Data" required value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} error={submitted ? dateError : undefined} />
        {openingSameDay &&
        <NoticeInline tone="warning" title="Há uma abertura extraordinária nesta data">
            {clinicBlockLabel(openingSameDay)}. O fechamento vence: com esta data, {wordsNow().the} fica {wordsNow().closed} em {shortDate(form.date)}.
          </NoticeInline>
        }
        {form.date && sameDay > 0 &&
        <p className="-mt-2 text-sm text-text-secondary">
            Já {sameDay === 1 ? 'existe 1 agendamento' : `existem ${sameDay} agendamentos`} nesta data (inclusive os já fechados). Nada será cancelado.
          </p>
        }
        <PillGroup label="O que acontece nesta data" size="sm" options={blockTypes} value={form.type} onChange={(v) => typeof v === 'string' && setForm((f) => ({ ...f, type: v }))} />
        {form.type === 'reduzido' && <TimeField label="Atende até" value={form.until} onChange={(v) => setForm((f) => ({ ...f, until: v }))} />}
        {form.type === 'aberto' &&
        <div className="grid grid-cols-2 gap-4">
            <TimeField label="Abre às" value={form.from} onChange={(v) => setForm((f) => ({ ...f, from: v }))} />
            <TimeField label="Fecha às" value={form.to} onChange={(v) => setForm((f) => ({ ...f, to: v }))} error={rangeError} />
            <p className="col-span-2 text-xs text-text-secondary">Reabre {wordsNow().the} nesta data. Cada profissional só atende se trabalhar nesse dia da semana ou tiver um horário especial nesta data (aba Equipe).</p>
          </div>
        }
        {form.publicLabel && kindNow === 'closed' &&
        <p className="text-sm text-text-secondary">
            Feriado nacional: <span className="font-semibold text-text-primary">{form.publicLabel}</span> (nome do calendário oficial, informação pública).
          </p>
        }
        <Input label="Motivo (opcional)" placeholder="Ex.: Aniversário de Campinas, Recesso de fim de ano, Sábado de mutirão" value={form.reason} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} helperText="Nota interna da equipe." />
        <Toggle
          checked={form.reasonShared}
          onCheckedChange={(v: boolean) => setForm((f) => ({ ...f, reasonShared: v }))}
          labelPosition="right"
          label={<span className="text-sm font-semibold text-text-primary">Mostrar o motivo ao cliente</span>}
          description={form.reasonShared ? 'A assistente pode dizer este motivo ao cliente.' : form.publicLabel && kindNow === 'closed' ? 'Desligado: a assistente diz só o nome oficial do feriado.' : `Desligado: a assistente diz só que ${wordsNow().the} não abre (ou o horário), sem o motivo.`} />
        
        <PillGroup
          label="Tipo de data"
          size="sm"
          options={(['nacional', 'estadual', 'municipal', 'clinica'] as HolidayScope[]).map((s) => ({ value: s, label: s === 'clinica' ? `${wordsNow().of.charAt(0).toUpperCase()}${wordsNow().of.slice(1)} (recesso, evento)` : `Feriado ${scopeLabel[s].toLowerCase()}` }))}
          value={form.scope}
          onChange={(v) => typeof v === 'string' && setForm((f) => ({ ...f, scope: v as HolidayScope }))} />
        
        {form.scope !== 'nacional' && form.scope !== 'clinica' &&
        <div className="flex flex-wrap gap-2">
            {LOCAL_SUGGESTIONS.filter((s) => s.scope === form.scope).map((s) =>
          <Pill key={s.name} size="sm" addable onClick={() => setForm((f) => ({ ...f, reason: s.name }))}>
                {s.name} · {s.hint}
              </Pill>
          )}
          </div>
        }
        <Toggle checked={form.yearly} onCheckedChange={(v: boolean) => setForm((f) => ({ ...f, yearly: v }))} labelPosition="right" label={<span className="text-sm font-semibold text-text-primary">Repetir todo ano nesta data</span>} description="Para feriados de data fixa: a mesma data dos próximos anos segue esta regra (agenda e assistente)." />
        <ConflictAlert conflicts={impact} offers={offerImpact} title={impact.length === 1 ? 'agendamento já marcado fica fora do expediente' : 'agendamentos já marcados ficam fora do expediente'} ack={ack} onAck={setAck} />
      </div>
    </AppModal>);

}

function ImportarFeriadosModal({ open, onClose }: {open: boolean;onClose: () => void;}) {
  const toast = useToast();
  const { blocks } = useTeam();
  const agenda = useAgendaData();
  const upcoming = NATIONAL_HOLIDAYS.filter((h) => h.date >= TODAY_ISO);
  // G3 (F-049): "já cadastrado" = já existe FECHAMENTO nesta data; uma abertura extraordinária não impede importar o feriado.
  const already = (iso: string) => blocks.some((b) => b.kind === 'closed' && exceptionOn(b, iso));
  const opening = (iso: string) => blocks.some((b) => b.kind === 'open' && exceptionOn(b, iso));
  const [picked, setPicked] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const toCreate = upcoming.filter((h) => picked.includes(h.date) && !already(h.date));
  const impact = useMemo(
    () => open && toCreate.length ? newScheduleConflicts(getAgendaState(), { clinicBlocks: [...blocks, ...toCreate.map((h) => ({ id: `imp-${h.date}`, date: h.date, kind: 'closed' as const, reason: h.name }))] }) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, picked.join('|'), blocks]
  );
  useEffect(() => setAck(false), [impact.length]);
  useEffect(() => {
    if (open) setPicked(upcoming.filter((h) => !h.optional && !already(h.date)).map((h) => h.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const years = [...new Set(upcoming.map((h) => h.date.slice(0, 4)))];

  const apply = () => {
    if (impact.length > 0 && !ack) return;
    // Nome oficial = texto PÚBLICO (D5); o motivo interno começa igual e pode ser editado.
    const created = toCreate.map((h) => ({ id: newId('fer'), date: h.date, kind: 'closed' as const, reason: h.name, publicLabel: h.name }));
    setClinicBlocks((list) => [...list, ...created]);
    created.forEach((b) => setClinicDateMeta(b.id, { scope: 'nacional', yearly: false, imported: true }));
    toast({ title: `${created.length} ${created.length === 1 ? 'feriado importado' : 'feriados importados'}`, description: `${wordsNow().The} fica ${wordsNow().closed} nessas datas. Agendamentos já marcados não foram alterados.` });
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="lg"
      title="Importar feriados nacionais"
      description={`Escolha as datas em que ${wordsNow().the} vai fechar. Pontos facultativos vêm desmarcados. Estaduais e municipais você adiciona à mão.`}
      footer={
      <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={picked.filter((d) => !already(d)).length === 0 || impact.length > 0 && !ack}>
            Importar {picked.filter((d) => !already(d)).length || ''}
          </Button>
        </ModalActions>
      }>
      
      <NoticeInline tone="info" title="Feriados nacionais de 2026 e 2027">
        Confira as datas antes de importar. Feriados estaduais, municipais e recessos você adiciona à mão.
      </NoticeInline>
      {years.map((y) =>
      <fieldset key={y} className="mt-4">
          <legend className="text-sm font-bold text-text-primary">{y}</legend>
          <ul className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border">
            {upcoming.
          filter((h) => h.date.startsWith(y)).
          map((h) => {
            const has = already(h.date);
            const n = apptsOn(agenda.appointments, h.date).length;
            return (
              <li key={h.date} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <Checkbox
                  size="sm"
                  checked={has || picked.includes(h.date)}
                  disabled={has}
                  onChange={(v: boolean) => setPicked((p) => v ? [...p, h.date] : p.filter((x) => x !== h.date))}
                  label={
                  <span className="text-sm text-text-primary">
                          <span className="font-bold tabular-nums">{shortDate(h.date)}</span> · {h.name}
                        </span>
                  } />
                
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {h.optional && <StatusBadge status="muted" label="Facultativo" />}
                      {has && <StatusBadge status="success" label="Já cadastrado" />}
                      {n > 0 && <StatusBadge status="warning" label={n === 1 ? '1 agendamento' : `${n} agendamentos`} />}
                      {!has && opening(h.date) && <StatusBadge status="info" label="Tem abertura extra" />}
                    </span>
                  </li>);

          })}
          </ul>
        </fieldset>
      )}
      <ConflictAlert conflicts={impact} title={impact.length === 1 ? 'agendamento já marcado fica fora do expediente com estes feriados' : 'agendamentos já marcados ficam fora do expediente com estes feriados'} ack={ack} onAck={setAck} />
    </AppModal>);

}

function DatasEspeciaisCard() {
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const { blocks } = useTeam();
  const meta = useClinicDateMeta();
  const agenda = useAgendaData();
  const [editing, setEditing] = useState<DateForm | null>(null);
  const [modal, setModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<{block: ClinicBlock;impact: ScheduleConflict[];} | null>(null);
  const [showPast, setShowPast] = useState(false);

  const removeBlock = (b: ClinicBlock) => {
    setClinicBlocks((list) => list.filter((x) => x.id !== b.id));
    setClinicDateMeta(b.id, null);
    setRemoving(null);
    toast({ title: 'Data especial removida', description: `${shortDate(b.date)} volta a seguir o horário normal. Agendamentos já marcados não foram alterados.`, tone: 'info' });
  };
  const askRemove = (b: ClinicBlock) => {
    const impact = newScheduleConflicts(getAgendaState(), { clinicBlocks: blocks.filter((x) => x.id !== b.id) });
    if (impact.length === 0) removeBlock(b);else
    setRemoving({ block: b, impact });
  };
  const sorted = [...blocks].sort((a, b) => a.date.localeCompare(b.date));
  const future = sorted.filter((b) => b.date >= TODAY_ISO);
  const past = sorted.filter((b) => b.date < TODAY_ISO);
  const byMonth = (list: ClinicBlock[]) => {
    const out: {key: string;label: string;items: ClinicBlock[];}[] = [];
    list.forEach((b) => {
      const key = b.date.slice(0, 7);
      const label = `${MONTHS[Number(b.date.slice(5, 7)) - 1]} de ${b.date.slice(0, 4)}`;
      const g = out.find((x) => x.key === key);
      if (g) g.items.push(b);else
      out.push({ key, label, items: [b] });
    });
    return out;
  };
  const openEdit = (b: ClinicBlock) => {
    const m = meta[b.id];
    setEditing({ id: b.id, date: b.date, type: typeOf(b.kind), until: b.until ?? '13:00', from: b.from ?? '08:00', to: b.to ?? '12:00', reason: b.reason, scope: m?.scope ?? 'clinica', yearly: b.yearly ?? m?.yearly ?? false, reasonShared: !!b.reasonShared, publicLabel: b.publicLabel });
    setModal(true);
  };

  const Row = ({ b }: {b: ClinicBlock;}) => {
    const m = meta[b.id];
    const n = apptsOn(agenda.appointments, b.date).length;
    const badge = kindBadge[b.kind];
    return (
      <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-button ${b.kind === 'open' ? 'bg-primary-soft text-primary' : 'bg-warning-background text-warning'}`} aria-hidden="true">
          {b.kind === 'open' ? <CalendarCheckIcon className="h-icon-md w-icon-md" strokeWidth={1.75} /> : <CalendarOffIcon className="h-icon-md w-icon-md" strokeWidth={1.75} />}
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm text-text-primary">
            <span className="font-bold tabular-nums">{mediumDayLabel(b.date)}</span> · {clinicBlockLabel(b)}
          </p>
          <p className="text-xs text-text-secondary">
            {m && m.scope !== 'clinica' ? scopeLabel[m.scope] : `${wordsNow().of.charAt(0).toUpperCase()}${wordsNow().of.slice(1)}`}
            {b.yearly || m?.yearly ? ' · repete todo ano' : ''}
            {m?.imported ? ' · importado' : ''}
            {publicReasonOf(b) ? ` · o cliente vê: ${publicReasonOf(b)}` : ' · motivo oculto ao cliente'}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={badge.tone} label={badge.label} minWidth="md" />
          {n > 0 &&
          <Button size="sm" variant="neutral" onClick={() => navigate(agendaLink({ date: b.date }))} aria-label={`${n} agendamentos em ${shortDate(b.date)}: abrir a Agenda nessa data`}>
              {n === 1 ? '1 agendamento' : `${n} agendamentos`}
            </Button>
          }
          <Button size="sm" variant="neutral" leftIcon={<PencilIcon className="h-4 w-4" />} onClick={() => openEdit(b)} aria-label={`Editar ${shortDate(b.date)}`}>
            Editar
          </Button>
          <IconButton size="sm" tone="danger" onClick={() => askRemove(b)} aria-label={`Remover ${shortDate(b.date)}`} icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} />
        </span>
      </li>);

  };

  return (
    <Card as="section" padding="lg" id="func-feriados" aria-labelledby="func-feriados-titulo" className="scroll-mt-6">
      <SectionHead
        id="func-feriados"
        icon={<CalendarOffIcon className="h-5 w-5" />}
        title="Feriados e datas especiais"
        line={`Datas em que ${wordsNow().the} fecha, atende menos horas ou abre fora do normal.`}
        effect={`Fechado: ninguém é marcado nesse dia. Reduzido: ${wordsNow().the} fecha mais cedo. Abertura extra: abre um dia que seria fechado, só para quem tiver horário nele.`} />
      
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button size="md" leftIcon={<DownloadIcon className="h-4 w-4" />} onClick={() => setImporting(true)}>
            Importar feriados nacionais
          </Button>
          <Button
            size="md"
            variant="secondary"
            leftIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setModal(true);
            }}>
            
            Adicionar data especial
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-secondary">Feriados estaduais e municipais (ex.: os de Campinas/SP) você adiciona em “Adicionar data especial”.</p>

        {future.length === 0 ?
        <p className="mt-4 text-sm text-text-muted">Nenhuma data especial daqui para frente.</p> :

        byMonth(future).map((g) =>
        <section key={g.key} className="mt-5" aria-label={g.label}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">{g.label}</h3>
              <ul className="flex flex-col gap-2">
                {g.items.map((b) =>
            <Row key={b.id} b={b} />
            )}
              </ul>
            </section>
        )
        }

        {removing &&
        <div className="mt-3">
            <ConflictAlert conflicts={removing.impact} title={`${removing.impact.length === 1 ? 'agendamento fica' : 'agendamentos ficam'} fora do expediente se ${shortDate(removing.block.date)} for removida`} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="md" variant="dangerSoft" onClick={() => removeBlock(removing.block)}>
                Remover mesmo assim
              </Button>
              <Button size="md" variant="secondary" onClick={() => setRemoving(null)}>
                Manter data especial
              </Button>
            </div>
          </div>
        }

        {past.length > 0 &&
        <div className="mt-5">
            <Button size="sm" variant="neutral" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Ocultar datas passadas' : `Ver datas passadas (${past.length})`}
            </Button>
            {showPast &&
          <ul className="mt-2 flex flex-col gap-2">
                {past.map((b) =>
            <Row key={b.id} b={b} />
            )}
              </ul>
          }
          </div>
        }
      </CardContent>
      <DataEspecialModal open={modal} onClose={() => setModal(false)} initial={editing} />
      <ImportarFeriadosModal open={importing} onClose={() => setImporting(false)} />
    </Card>);

}

/* ───────────── C) Pausas coletivas ───────────── */

function PausaModal({ open, onClose, initial }: {open: boolean;onClose: () => void;initial: SharedBreakRule | null;}) {
  const toast = useToast();
  const { sharedBreaks, hours } = useTeam();
  const blank: SharedBreakRule = { id: '', label: '', start: '12:00', end: '13:00', weekdays: hours.map((h, i) => h.open ? i : -1).filter((i) => i >= 0), from: undefined, to: undefined };
  const [draft, setDraft] = useState<SharedBreakRule>(blank);
  const [limited, setLimited] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(initial ? { ...initial, weekdays: [...initial.weekdays] } : blank);
      setLimited(!!(initial?.from || initial?.to));
      setSubmitted(false);
      setAck(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rule: SharedBreakRule = { ...draft, id: draft.id || newId('pausa'), label: draft.label.trim(), from: limited ? draft.from : undefined, to: limited ? draft.to : undefined };
  const errors = {
    label: !draft.label.trim() ? 'Dê um nome. Ex.: Reunião de equipe.' : undefined,
    range: toMin(draft.end) <= toMin(draft.start) ? 'O fim precisa ser depois do início.' : undefined,
    days: draft.weekdays.length === 0 ? 'Escolha ao menos um dia.' : undefined,
    // G3 (F-049): validade ligada e vazia não vira "vale sempre" sem querer.
    validity:
    limited && !draft.from && !draft.to ?
    'Informe a data inicial, a final ou as duas (ou desligue o período de validade).' :
    limited && draft.from && draft.to && draft.to < draft.from ?
    'A data final precisa ser depois da inicial.' :
    undefined
  };
  const hasError = Object.values(errors).some(Boolean);
  const conflicts = useMemo(() => {
    if (!open || errors.range || errors.days) return [];
    const others = sharedBreaks.filter((r) => r.id !== draft.id);
    return newScheduleConflicts(getAgendaState(), { members: getTeam().members, sharedBreaks: [...others, rule] }).filter((c) => c.kind === 'shared-break');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, limited]);
  useEffect(() => setAck(false), [conflicts.length]);

  const save = () => {
    setSubmitted(true);
    if (hasError) return;
    if (conflicts.length > 0 && !ack) return;
    setSharedBreaks(sharedBreaks.some((r) => r.id === rule.id) ? sharedBreaks.map((r) => r.id === rule.id ? rule : r) : [...sharedBreaks, rule]);
    toast({ title: initial ? 'Pausa coletiva atualizada' : 'Pausa coletiva criada', description: 'Já vale na agenda e nos horários oferecidos.' });
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={initial ? 'Editar pausa coletiva' : 'Nova pausa coletiva'}
      description={`Quando ${wordsNow().the} ${wordsNow().fem ? 'inteira' : 'inteiro'} para ao mesmo tempo. Ex.: reunião de equipe toda segunda 08:00–09:00: ninguém recebe agendamento nesse horário.`}
      footer={
      <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={conflicts.length > 0 && !ack}>
            {initial ? 'Salvar' : 'Criar pausa'}
          </Button>
        </ModalActions>
      }>
      
      <div className="flex flex-col gap-4">
        <Input label="Nome" required placeholder="Ex.: Reunião de equipe, Almoço coletivo, Limpeza" value={draft.label} maxLength={60} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} error={submitted ? errors.label : undefined} />
        <div className="grid grid-cols-2 gap-4">
          <TimeField label="Das" value={draft.start} onChange={(v) => setDraft((d) => ({ ...d, start: v }))} />
          <TimeField label="Até" value={draft.end} onChange={(v) => setDraft((d) => ({ ...d, end: v }))} error={errors.range} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-text-primary">Dias da semana</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
            {WEEKDAY_SHORT.map((d, i) =>
            <Pill key={d} size="sm" selected={draft.weekdays.includes(i)} aria-label={WEEKDAY_LONG[i]} onClick={() => setDraft((x) => ({ ...x, weekdays: x.weekdays.includes(i) ? x.weekdays.filter((w) => w !== i) : [...x.weekdays, i].sort() }))}>
                {d}
              </Pill>
            )}
          </div>
          {submitted && errors.days && <p className="mt-1.5 text-sm text-error">{errors.days}</p>}
        </div>
        <Toggle checked={limited} onCheckedChange={(v: boolean) => setLimited(v)} labelPosition="right" label={<span className="text-sm font-semibold text-text-primary">Vale só por um período</span>} description="Ex.: reunião às segundas só durante outubro. Desligado = vale sempre." />
        {limited &&
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateField label="A partir de" value={draft.from ?? ''} onChange={(v) => setDraft((d) => ({ ...d, from: v || undefined }))} />
            <DateField label="Até (inclusive)" value={draft.to ?? ''} onChange={(v) => setDraft((d) => ({ ...d, to: v || undefined }))} error={submitted || draft.from || draft.to ? errors.validity : undefined} />
          </div>
        }
        <p className="text-xs text-text-secondary">Soma com as pausas de cada profissional (aba Equipe › Jornada). Quando as duas se sobrepõem, nenhum horário dentro de qualquer uma delas é oferecido.</p>
        <ConflictAlert conflicts={conflicts} title={conflicts.length === 1 ? 'agendamento ficaria dentro da pausa' : 'agendamentos ficariam dentro da pausa'} ack={ack} onAck={setAck} />
      </div>
    </AppModal>);

}

function PausasCard() {
  const toast = useToast();
  const { sharedBreaks } = useTeam();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<SharedBreakRule | null>(null);
  const daysText = (w: number[]) => {
    if (w.length === 7) return 'Todos os dias';
    if (w.join() === '0,1,2,3,4') return 'Segunda a sexta';
    return w.map((i) => WEEKDAY_SHORT[i]).join(', ');
  };
  return (
    <Card as="section" padding="lg" id="func-pausas" aria-labelledby="func-pausas-titulo" className="scroll-mt-6">
      <SectionHead
        id="func-pausas"
        icon={<CoffeeIcon className="h-5 w-5" />}
        title="Pausas coletivas"
        line={`Horários em que ${wordsNow().the} ${wordsNow().fem ? 'inteira' : 'inteiro'} para: reunião, almoço coletivo, limpeza. Opcional.`}
        effect="Ninguém recebe agendamento no horário da pausa, nos dias escolhidos. Soma com as pausas de cada profissional. Agendamentos já marcados dentro dela não são cancelados nem movidos: ficam marcados como conflito." />
      
      <CardContent>
        {sharedBreaks.length === 0 ?
        <p className="text-sm text-text-muted">Nenhuma pausa coletiva. Cada profissional segue só as pausas da própria jornada.</p> :

        <ul className="flex flex-col gap-2">
            {sharedBreaks.map((r) =>
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-bold text-text-primary">{r.label}</p>
                  <p className="text-sm tabular-nums text-text-secondary">
                    {r.start}–{r.end} · {daysText(r.weekdays)}
                    {r.from || r.to ? ` · ${r.from ? `de ${shortDate(r.from)}` : ''}${r.to ? ` até ${shortDate(r.to)}` : ''}` : ''}
                  </p>
                </div>
                <Button
              size="sm"
              variant="neutral"
              leftIcon={<PencilIcon className="h-4 w-4" />}
              onClick={() => {
                setEditing(r);
                setModal(true);
              }}>
              
                  Editar
                </Button>
                <IconButton
              size="sm"
              tone="danger"
              aria-label={`Remover ${r.label}`}
              onClick={() => {
                setSharedBreaks(sharedBreaks.filter((x) => x.id !== r.id));
                toast({ title: 'Pausa coletiva removida', description: `${r.label} deixa de valer. Nada na agenda foi alterado.`, tone: 'info' });
              }}
              icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} />
            
              </li>
          )}
          </ul>
        }
        <div className="mt-4">
          <Button
            size="md"
            variant="secondary"
            leftIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setModal(true);
            }}>
            
            Nova pausa coletiva
          </Button>
        </div>
      </CardContent>
      <PausaModal open={modal} onClose={() => setModal(false)} initial={editing} />
    </Card>);

}

/* ───────────── D) Regras de agendamento ───────────── */

/**
 * W2 (11/11/2026, D-A3-2 = a): as regras viram configuração da clínica (data/bookingRules.ts). Saíram a "proposta",
 * "Registrar proposta" e "Hoje no sistema…". Mesmo padrão do Horário da clínica: rascunho na tela, "Salvar regras",
 * aviso de alterações não salvas e mensagem rápida. Não mudam o que já está marcado.
 */
type RulesDraft = {minNotice: string;minUnit: string;maxDays: string;grid: string;aiDays: string;};
const draftOf = (r: BookingRules): RulesDraft => {
  const hours = r.minNoticeMin > 0 && r.minNoticeMin % 60 === 0;
  return { minNotice: String(hours ? r.minNoticeMin / 60 : r.minNoticeMin), minUnit: hours ? 'h' : 'min', maxDays: r.maxDaysAhead ? String(r.maxDaysAhead) : '', grid: String(r.slotStepMin), aiDays: String(r.assistantDays) };
};
const rulesOf = (d: RulesDraft): BookingRules => ({
  minNoticeMin: (Number(d.minNotice) || 0) * (d.minUnit === 'h' ? 60 : 1),
  maxDaysAhead: Number(d.maxDays) > 0 ? Number(d.maxDays) : null,
  slotStepMin: Number(d.grid) || 30,
  assistantDays: Number(d.aiDays) || 0
});

/**
 * CONTRATO NOVO (aulas em grupo, 23/11/2026): "Reposição de aula" fica DENTRO deste cartão, com o mesmo "Salvar regras" e o
 * mesmo aviso de alterações não salvas. Só aparece com um serviço em grupo ativo (data/makeupRules.ts).
 */
type MakeupDraft = {onBusinessCancel: boolean;onClientNotice: boolean;hours: string;days: string;};
const makeupDraftOf = (m: MakeupRules): MakeupDraft => ({ onBusinessCancel: m.onBusinessCancel, onClientNotice: m.onClientNotice, hours: String(m.clientNoticeHours), days: String(m.validityDays) });
const makeupOf = (d: MakeupDraft): MakeupRules => ({ onBusinessCancel: d.onBusinessCancel, onClientNotice: d.onClientNotice, clientNoticeHours: Number(d.hours) || 0, validityDays: Number(d.days) || 0 });

function RegrasCard() {
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const saved = useBookingRules();
  const [r, setR] = useState<RulesDraft>(() => draftOf(saved));
  const savedMakeup = useMakeupRules();
  const [mk, setMk] = useState<MakeupDraft>(() => makeupDraftOf(savedMakeup));
  const { services } = useServices();
  const showMakeup = hasActiveGroupService(services);
  const rulesDirty = JSON.stringify(rulesOf(r)) !== JSON.stringify(saved);
  const makeupDirty = showMakeup && JSON.stringify(makeupOf(mk)) !== JSON.stringify(savedMakeup);
  const dirty = rulesDirty || makeupDirty;
  const aiDaysError = !(Number(r.aiDays) >= 1 && Number(r.aiDays) <= 30) ? 'Use de 1 a 30 dias.' : undefined;
  const maxDaysError = r.maxDays && !(Number(r.maxDays) >= 1 && Number(r.maxDays) <= 365) ? 'Use de 1 a 365 dias, ou deixe em branco.' : undefined;
  const hoursError = showMakeup && mk.onClientNotice && !(Number(mk.hours) >= 1 && Number(mk.hours) <= 168) ? 'Use de 1 a 168 horas.' : undefined;
  const daysError = showMakeup && makeupOn(makeupOf(mk)) && !(Number(mk.days) >= 1 && Number(mk.days) <= 365) ? 'Use de 1 a 365 dias.' : undefined;
  const invalid = !!aiDaysError || !!maxDaysError || !!hoursError || !!daysError;
  const save = (): boolean => {
    if (invalid) return false;
    const next = rulesOf(r);
    const parts: string[] = [];
    if (rulesDirty) parts.push('Os horários sugeridos e o que a assistente oferece já seguem as novas regras. O que já está marcado não muda.');
    if (makeupDirty) {
      const nextMakeup = makeupOf(mk);
      setMakeupRules(nextMakeup);
      setMk(makeupDraftOf(nextMakeup));
      parts.push('A reposição de aula já segue as novas regras.');
    }
    setBookingRules(next);
    setR(draftOf(next));
    toast({ title: 'Regras de agendamento salvas', description: parts.join(' ') || 'Os horários sugeridos e o que a assistente oferece já seguem as novas regras. O que já está marcado não muda.' });
    return true;
  };
  useDirtyForm('servicos-funcionamento-regras', dirty, {
    save,
    discard: () => {
      setR(draftOf(saved));
      setMk(makeupDraftOf(savedMakeup));
    }
  });
  return (
    <Card as="section" padding="lg" id="func-regras" aria-labelledby="func-regras-titulo" className="scroll-mt-6">
      <SectionHead
        id="func-regras"
        icon={<CalendarClockIcon className="h-5 w-5" />}
        title="Regras de agendamento"
        line="Com quanta antecedência o cliente pode marcar e de quanto em quanto tempo os horários aparecem."
        effect="Definem com quanta antecedência e até quando o cliente pode marcar pela assistente, e de quanto em quanto tempo aparecem os horários sugeridos. Não mudam o que já está marcado." />
      
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
            <span>Pela assistente, o cliente pode marcar com pelo menos</span>
            <div className="w-20 shrink-0">
              <Input aria-label="Antecedência mínima" inputMode="numeric" value={r.minNotice} onChange={(e) => setR((x) => ({ ...x, minNotice: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
            </div>
            <PillGroup size="sm" options={[{ value: 'min', label: 'minutos' }, { value: 'h', label: 'horas' }]} value={r.minUnit} onChange={(v) => typeof v === 'string' && setR((x) => ({ ...x, minUnit: v }))} />
            <span>de antecedência e até</span>
            <div className="w-28 shrink-0">
              <Input aria-label="Até quantos dias à frente" inputMode="numeric" placeholder="sem limite" value={r.maxDays} error={maxDaysError} onChange={(e) => setR((x) => ({ ...x, maxDays: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
            </div>
            <span>dias à frente.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
            <span>Os horários sugeridos aparecem a cada</span>
            <PillGroup size="sm" options={SLOT_STEP_OPTIONS.map((v) => ({ value: String(v), label: `${v} min` }))} value={r.grid} onChange={(v) => typeof v === 'string' && setR((x) => ({ ...x, grid: v }))} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
            <span>Quando o cliente não diz o dia, a assistente procura horários nos próximos</span>
            <div className="w-20 shrink-0">
              <Input aria-label="Dias que a assistente procura" inputMode="numeric" value={r.aiDays} error={aiDaysError} onChange={(e) => setR((x) => ({ ...x, aiDays: e.target.value.replace(/\D/g, '').slice(0, 2) }))} />
            </div>
            <span>dias.</span>
          </div>
          <p className="text-xs text-text-secondary">A antecedência e o limite de dias valem para o que a assistente oferece ao cliente. Pelo painel, a equipe pode marcar em qualquer horário livre.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="md" variant="secondary" onClick={() => navigate('/atendente-ia/empresa')}>
              Ver política de cancelamento
            </Button>
            <span className="text-xs text-text-muted">Fica em IA Orniplaty › Empresa; não é repetida aqui.</span>
          </div>
          {showMakeup &&
          // CONTRATO NOVO (aulas em grupo, 23/11/2026): mesmo padrão das regras acima (frases com campos no meio).
          <section aria-labelledby="func-reposicao-titulo" className="flex flex-col gap-4 border-t border-border pt-4">
              <h3 id="func-reposicao-titulo" className="text-sm font-bold text-text-primary">
                Reposição de aula
              </h3>
              <Toggle
              checked={mk.onBusinessCancel}
              onCheckedChange={(v: boolean) => setMk((x) => ({ ...x, onBusinessCancel: v }))}
              labelPosition="right"
              label={<span className="text-sm font-semibold text-text-primary">Aula cancelada {wordsNow().by} dá direito a reposição</span>} />
            
              <Toggle
              checked={mk.onClientNotice}
              onCheckedChange={(v: boolean) => setMk((x) => ({ ...x, onClientNotice: v }))}
              labelPosition="right"
              label={<span className="text-sm font-semibold text-text-primary">Cliente que avisa a falta com antecedência ganha reposição</span>} />
            
              {mk.onClientNotice &&
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                  <span>Avisar com pelo menos</span>
                  <div className="w-20 shrink-0">
                    <Input aria-label="Antecedência do aviso de falta, em horas" inputMode="numeric" value={mk.hours} error={hoursError} onChange={(e) => setMk((x) => ({ ...x, hours: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
                  </div>
                  <span>horas.</span>
                </div>
            }
              {makeupOn(makeupOf(mk)) ?
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                  <span>A reposição vale por</span>
                  <div className="w-20 shrink-0">
                    <Input aria-label="Validade da reposição, em dias" inputMode="numeric" value={mk.days} error={daysError} onChange={(e) => setMk((x) => ({ ...x, days: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
                  </div>
                  <span>dias.</span>
                </div> :

            <p className="text-sm text-text-secondary">Sem reposição: a aula cancelada só é registrada e avisada.</p>
            }
            </section>
          }
          <div className="flex flex-col items-end gap-2">
            {!dirty && <p id="regras-sem-alteracao" className="text-xs text-text-muted">Nenhuma alteração para salvar.</p>}
            <Button size="md" disabled={!dirty || invalid} aria-describedby={!dirty ? 'regras-sem-alteracao' : undefined} onClick={() => save()}>
              Salvar regras
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>);

}

/* ───────────── E) Encaixes ───────────── */

function EncaixesCard() {
  const log = useExceptionLog();
  return (
    <Card as="section" padding="lg" id="func-encaixes" aria-labelledby="func-encaixes-titulo" className="scroll-mt-6">
      <SectionHead
        id="func-encaixes"
        icon={<ZapIcon className="h-5 w-5" />}
        title="Encaixes"
        line="Quando alguém da equipe marca um cliente fora da regra, de propósito, com motivo escrito."
        effect="Um encaixe autorizado aparece na Agenda com um raio e não conta como conflito. Ele nunca é oferecido pela assistente." />
      
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-white" aria-hidden="true">
                <CheckIcon className="h-4 w-4" />
              </span>
              Pode
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-secondary">
              <li>Quem está no painel, com motivo escrito e confirmação.</li>
              <li>Em dia em que {wordsNow().the} está {wordsNow().fem ? 'aberta' : 'aberto'}.</li>
              <li>Fora do horário habitual do profissional.</li>
              <li>Sem respeitar o intervalo entre atendimentos.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-error text-white" aria-hidden="true">
                <XIcon className="h-4 w-4" />
              </span>
              Não pode
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-secondary">
              <li>Em feriado ou dia em que {wordsNow().the} está {wordsNow().closed}.</li>
              <li>Na folga ou nas férias do profissional.</li>
              <li>Em pausa (do profissional ou coletiva) ou bloqueio.</li>
              <li>Em horário que já está ocupado.</li>
              <li>Pela assistente, pela lista de espera ou pelos retornos.</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-text-secondary">Como fazer: Agenda › Novo agendamento › escolha o horário fora da regra e autorize com o motivo.</p>

        <h3 className="mt-5 text-sm font-bold text-text-primary">Registro de encaixes</h3>
        {log.length === 0 ?
        <p className="mt-1 text-sm text-text-muted">Nenhum encaixe registrado.</p> :

        <ul className="mt-2 flex flex-col gap-2">
            {log.map((e) =>
          <li key={e.id} className="rounded-xl border border-border px-4 py-3 text-sm">
                <p className="text-text-primary">
                  <span className="font-bold">{mediumDayLabel(e.iso)}</span> · {e.start}–{e.end} · {e.client} com {e.professional}
                </p>
                <p className="text-text-secondary">
                  {e.kinds.map((k) => exceptionKindLabel[k]).join(' e ')} · motivo: {e.reason} · registrado às {e.at}
                </p>
              </li>
          )}
          </ul>
        }
      </CardContent>
    </Card>);

}

/* ───────────── F) Conflitos ───────────── */

function ConflitosCard() {
  const navigate = useGuardedNavigate();
  const data = useAgendaData();
  // W2 (D-A3-1): redesenha quando uma mudança de serviço grava ou tira conflitos.
  useServiceConflicts();
  const conflicts = scheduleConflicts(data);
  return (
    <Card as="section" padding="lg" id="func-conflitos" aria-labelledby="func-conflitos-titulo" className="scroll-mt-6">
      <SectionHead
        id="func-conflitos"
        icon={<CalendarOffIcon className="h-5 w-5" />}
        title="Conflitos"
        line="Agendamentos já marcados que ficaram fora da configuração atual."
        effect="O sistema nunca deixa dois agendamentos no mesmo horário do mesmo profissional. Quando você muda horário, pausa, feriado ou jornada e algum agendamento fica de fora, ele não é cancelado: aparece aqui e na Agenda até alguém remarcar." />
      
      <CardContent>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-secondary">
          <li>Dois agendamentos do mesmo profissional no mesmo horário: o sistema não deixa marcar.</li>
          <li>Bloqueio ou mudança de horário em cima de agendamentos: o sistema pede confirmação e não cancela nada.</li>
          <li>Mudança no serviço (duração, quem faz ou arquivar): os agendamentos já marcados continuam como estavam e aparecem aqui com o motivo.</li>
        </ul>
        <h3 className="mt-5 text-sm font-bold text-text-primary">Conflitos a resolver</h3>
        {conflicts.length === 0 ?
        <p className="mt-1 text-sm text-text-muted">Nenhum conflito agora.</p> :

        <ul className="mt-2 flex flex-col gap-2">
            {conflicts.map((c) =>
          <li key={c.appt.id}>
                <button type="button" onClick={() => navigate(agendaLink({ date: c.iso, appointmentId: c.appt.id }))} className={clickableCardClass} aria-label={`${c.appt.clientName}, ${mediumDayLabel(c.iso)} ${c.appt.start}: abrir na Agenda`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-text-primary">
                      {c.appt.clientName} · {mediumDayLabel(c.iso)} {c.appt.start}–{c.appt.end}
                    </span>
                    <span className="block text-sm text-text-secondary">{c.message}</span>
                  </span>
                  <StatusBadge status="error" label="Conflito" />
                  <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                </button>
              </li>
          )}
          </ul>
        }
      </CardContent>
    </Card>);

}

/* ───────────── G) Intervalos (resumo) ───────────── */

function IntervalosResumo({ onGoTeam, onEditBuffer }: {onGoTeam: () => void;onEditBuffer?: (memberId: string) => void;}) {
  const { members } = useTeam();
  return (
    <Card as="section" padding="lg" id="func-intervalos" aria-labelledby="func-intervalos-titulo" className="scroll-mt-6">
      <SectionHead
        id="func-intervalos"
        icon={<CalendarClockIcon className="h-5 w-5" />}
        title="Intervalo entre atendimentos"
        line="Cada profissional tem o seu. Clique em Alterar para abrir o perfil dele na aba Intervalo."
        effect="Tempo livre depois de cada atendimento, para arrumar a sala ou descansar. Ex.: com 10 min, quem termina às 10:00 libera o próximo às 10:10." />
      
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {members.filter(isActiveMember).map((m) =>
          <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
              <ProfessionalTag name={m.name} color={m.color} />
              <span className="flex items-center gap-3">
                <span className="font-semibold tabular-nums text-text-primary">{bufferLabel(bufferMinutes(m))}</span>
                {/* G4 (F-056): edita no próprio perfil, sem trocar de aba (o perfil abre por cima). */}
                {onEditBuffer &&
              <Button size="sm" variant="neutral" onClick={() => onEditBuffer(m.id)} aria-label={`Alterar o intervalo de ${m.name}`}>
                    Alterar
                  </Button>
              }
              </span>
            </li>
          )}
        </ul>
        <div className="mt-4">
          <Button size="md" variant="secondary" onClick={onGoTeam}>
            Ver a equipe
          </Button>
        </div>
      </CardContent>
    </Card>);

}

/* ───────────── página ───────────── */

const SECTIONS = [
{ id: 'func-horario', label: 'Horário de funcionamento' },
{ id: 'func-feriados', label: 'Feriados e datas' },
{ id: 'func-pausas', label: 'Pausas coletivas' },
{ id: 'func-regras', label: 'Regras de agendamento' },
{ id: 'func-encaixes', label: 'Encaixes' },
{ id: 'func-conflitos', label: 'Conflitos' },
{ id: 'func-intervalos', label: 'Intervalos' }];


export function FuncionamentoTab({ onGoTeam, onEditBuffer }: {onGoTeam: () => void;onEditBuffer?: (memberId: string) => void;}) {
  const data = useAgendaData();
  useServiceConflicts();
  const conflictCount = scheduleConflicts(data).length;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Seções de funcionamento" className="lg:sticky lg:top-6">
        <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
          {SECTIONS.map((s) =>
          <li key={s.id}>
              <button type="button" onClick={() => go(s.id)} className={twMerge(clickableCardClass, 'w-auto gap-2 px-3 py-2 text-sm font-semibold text-text-primary lg:w-full')}>
                <span className="min-w-0 flex-1">{s.label}</span>
                {s.id === 'func-conflitos' && conflictCount > 0 && <StatusBadge status="error" label={String(conflictCount)} />}
                <ChevronRightIcon className={`${clickableChevronClass} hidden lg:block`} aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-col gap-6">
        <HorarioCard />
        <DatasEspeciaisCard />
        <PausasCard />
        <RegrasCard />
        <EncaixesCard />
        <ConflitosCard />
        <IntervalosResumo onGoTeam={onGoTeam} onEditBuffer={onEditBuffer} />
      </div>
    </div>);

}