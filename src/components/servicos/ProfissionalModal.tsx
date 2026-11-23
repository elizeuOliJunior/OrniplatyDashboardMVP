import { currentContent, currentWords } from '../../data/empresa';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveIcon, ArchiveRestoreIcon, CheckIcon, ImageIcon, PlusIcon, XIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ConflictNotice, NoticeInline } from '../ui/Notice';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ScrollableTabs } from '../ui/ScrollableTabs';
import { Button } from '../Button';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Select } from '../Select';
import { Pill } from '../Pill';
import { Avatar, Checkbox, InfoTip, PROFESSIONAL_COLORS, StatusBadge } from '../Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../Tabs';
import { ModalActions } from '../ui/ModalActions';
import { tabListNoScroll } from '../ui/styles';
import { COUNCILS, practiceAreaOptions, UFS, blankProfile } from '../../data/equipeFuncionamento';
import type { ProfessionalProfile, TeamMember } from '../../data/equipeFuncionamento';
import { DEFAULT_BUFFER, getTeam, scheduleConflicts, useTeam } from '../../data/availability';
import { getAgendaState, useAgendaData } from '../../data/agendaLive';
import { TODAY_ISO, mediumDayLabel } from '../../data/agendaStore';
import { cloneWeek, scheduleErrors, weekFromClinicHours, describeOverride } from '../../data/schedule';
import type { ProfessionalSchedule } from '../../data/schedule';
import { BufferPicker, OverridesEditor, WeeklyScheduleEditor } from '../schedule/ScheduleEditor';
import { priceLabel } from '../../data/servicesStore';
import type { ServiceItem } from '../../data/servicesStore';
import { weekSummary } from './EquipeTab';
import { ArchiveConfirm } from './ArchiveConfirm';
// L22c (18/11/2026): máscara de telefone do helper único. Continua guardando só os dígitos (phoneDigits), como antes.
import { maskPhoneBR, phoneDigits } from '../../utils/masks';
// CONTRATO NOVO (seletor com cadastro, 23/11/2026): "Cadastrar área de atuação".
import { SelectComCadastro, sameName, useSameNameNotice } from '../ui/SelectComCadastro';
import { NovaAreaModal } from './NovaAreaModal';
import { addPracticeArea, useCustomPracticeAreas, withCustomAreas } from '../../data/practiceAreas';

type ProfissionalModalProps = {
  open: boolean;
  onClose: () => void;
  editing: TeamMember | null;
  services: ServiceItem[];
  initialTab?: string;
  /** W2 (A3-09): abre com o cursor no campo WhatsApp (aviso "Falta WhatsApp" da Equipe). */
  focusWhatsApp?: boolean;
  /**
   * salva o profissional e os serviços que ele faz (vínculo N:N fica no serviço).
   * W2 (A3-10, A1-05): `info` diz o que mudou de fato e quantos agendamentos ficaram em conflito, para a mensagem.
   */
  onSave: (member: TeamMember, serviceIds: string[], info: SaveInfo) => void;
  onArchive: (member: TeamMember, active: boolean) => void;
  /** CONTRATO NOVO (seletor com cadastro, 23/11/2026): nome já preenchido (texto digitado no seletor que abriu a janela). */
  initialName?: string;
  /** CONTRATO NOVO (seletor com cadastro, 23/11/2026): serviços já marcados ao criar (ex.: o serviço da turma que abriu a janela). */
  initialServiceIds?: string[];
};

/**
 * CONTRATO NOVO (janela com etapas, 23/11/2026): só na CRIAÇÃO, a janela vira etapas Dados → Serviços → Jornada. "Próximo"
 * confere só os obrigatórios da aba atual; "Voltar" segue a ordem das abas; em Jornada, Ausências e Intervalo o botão
 * principal é "Adicionar profissional". As abas continuam clicáveis. Na edição nada muda.
 */
const CREATE_STEPS = ['dados', 'servicos', 'jornada'];
const TAB_ORDER = ['dados', 'servicos', 'jornada', 'ausencias', 'intervalo'];

export type SaveInfo = {phoneAdded: boolean;scheduleChanged: boolean;conflicts: number;firstConflict?: {iso: string;apptId: string;};};

type Form = {name: string;color: string;profile: ProfessionalProfile;serviceIds: string[];} & ProfessionalSchedule;

const SECTION_HELP = 'mt-0.5 text-xs text-text-secondary';
const emailOk = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Exemplo visual do intervalo: atendimento termina 10:00 → próximo começa 10:00 + intervalo. */
function BufferTimeline({ minutes }: {minutes: number;}) {
  const next = 600 + minutes;
  const hhmm = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
  const gapPct = Math.min(30, minutes) * 1.2;
  return (
    <figure className="mt-3 rounded-xl border border-border bg-surface p-3" aria-label={`Exemplo: termina 10:00, próximo começa ${hhmm}`}>
      <div className="flex h-9 w-full items-stretch overflow-hidden rounded-lg text-xs font-semibold">
        <span className="flex flex-1 items-center justify-center bg-primary text-primary-foreground">Atendimento até 10:00</span>
        {minutes > 0 &&
        <span className="flex items-center justify-center bg-surface-muted text-text-secondary" style={{ width: `${gapPct + 8}%` }}>
            {minutes} min
          </span>
        }
        <span className="flex flex-1 items-center justify-center border-l-2 border-surface bg-primary-soft text-primary">Próximo às {hhmm}</span>
      </div>
      <figcaption className="mt-2 text-xs text-text-secondary">
        {minutes === 0 ? 'Sem intervalo: quem termina às 10:00 libera o próximo início às 10:00.' : `Quem termina às 10:00 libera o próximo início às ${hhmm}. A agenda e a assistente não oferecem nada no meio.`}
      </figcaption>
    </figure>);

}

/**
 * Perfil do profissional em abas (19/10/2026): Dados · Serviços · Jornada · Ausências · Intervalo.
 * Salvar nunca cancela nem move agendamentos: conflitos aparecem e exigem confirmação.
 * L24b (18/11/2026, pedido 4 do Christian; DS 6.2): "Cor na agenda" subiu para o alto da aba Dados, logo abaixo da foto;
 * as opções são as 14 `PROFESSIONAL_COLORS` do design system, nessa ordem, com o nome da cor para leitor de tela; o
 * círculo das iniciais usa `Avatar color` e muda na hora com a cor escolhida. Uma cor antiga fora da paleta continua
 * como "Cor atual" até alguém trocar (como antes).
 */
export function ProfissionalModal({ open, onClose, editing, services, initialTab, focusWhatsApp, onSave, onArchive, initialName, initialServiceIds }: ProfissionalModalProps) {
  const { hours, members } = useTeam();
  const agenda = useAgendaData();
  const fileRef = useRef<HTMLInputElement>(null);
  const firstFreeColor = () => PROFESSIONAL_COLORS.find((c) => !members.some((m) => sameHex(m.color, c.hex)))?.hex ?? PROFESSIONAL_COLORS[0].hex;
  const blank = (): Form => ({ name: '', color: firstFreeColor(), profile: blankProfile(), serviceIds: [], week: weekFromClinicHours(hours, [{ start: '12:00', end: '13:00' }]), overrides: [], bufferMin: DEFAULT_BUFFER });
  const [form, setForm] = useState<Form>(blank);
  const [tab, setTab] = useState('dados');
  const [submitted, setSubmitted] = useState(false);
  const [ack, setAck] = useState(false);
  const [specDraft, setSpecDraft] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  /** CONTRATO NOVO (janela com etapas, 23/11/2026): abas já conferidas pelo "Próximo" (mostram os erros delas). */
  const [checkedTabs, setCheckedTabs] = useState<string[]>([]);
  const tabsTopRef = useRef<HTMLDivElement>(null);
  /** CONTRATO NOVO (seletor com cadastro, 23/11/2026): "Cadastrar área de atuação" por cima. */
  const customAreas = useCustomPracticeAreas();
  const [newArea, setNewArea] = useState<{open: boolean;typed: string;}>({ open: false, typed: '' });
  const sameNameNotice = useSameNameNotice();

  useEffect(() => {
    if (!open) return;
    setForm(
      editing ?
      {
        name: editing.name,
        color: editing.color,
        profile: { ...blankProfile(), ...editing.profile, specialties: [...(editing.profile?.specialties ?? [])] },
        serviceIds: services.filter((s) => s.professionalIds.includes(editing.id)).map((s) => s.id),
        week: cloneWeek(editing.week),
        overrides: editing.overrides.map((o) => ({ ...o, ranges: o.ranges.map((r) => ({ ...r })) })),
        bufferMin: editing.bufferMin
      } :
      { ...blank(), name: (initialName ?? '').trim().slice(0, 80), serviceIds: [...(initialServiceIds ?? [])] }
    );
    setTab(initialTab ?? 'dados');
    setSubmitted(false);
    setCheckedTabs([]);
    setAck(false);
    setSpecDraft('');
    // W2 (A3-09): depois do foco automático da janela, leva o cursor ao WhatsApp.
    if (focusWhatsApp) {
      const t = window.setTimeout(() => document.getElementById('pro-whatsapp')?.focus(), 150);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setP = <K extends keyof ProfessionalProfile,>(k: K, v: ProfessionalProfile[K]) => setForm((f) => ({ ...f, profile: { ...f.profile, [k]: v } }));
  /** CONTRATO NOVO (seletor com cadastro, 23/11/2026): as áreas de sempre + as cadastradas pela empresa. */
  const areaOptions = withCustomAreas(practiceAreaOptions(currentContent().roleOptions, form.profile.role), customAreas);

  const scheduleError = scheduleErrors(form);
  const errors = {
    name: !form.name.trim() ? 'Informe o nome.' : undefined,
    // R3 (06/11/2026, Christian, A-17): WhatsApp deixa de ser obrigatório para salvar (inclusive a jornada). Vazio salva e
    // aparece "Falta WhatsApp" no cartão (EquipeTab) e na aba Dados; só um número incompleto continua barrando.
    phone: form.profile.phone.length > 0 && form.profile.phone.length < 10 ? 'Complete o WhatsApp com DDD ou deixe em branco.' : undefined,
    email: !emailOk(form.profile.email) ? 'E-mail inválido.' : undefined,
    schedule: scheduleError ?? undefined
  };
  const tabOf: [keyof typeof errors, string][] = [
  ['name', 'dados'],
  ['phone', 'dados'],
  ['email', 'dados'],
  ['schedule', 'jornada']];


  const candidate: TeamMember = useMemo(
    () => ({
      id: editing?.id ?? 'novo-profissional',
      name: form.name.trim() || 'Profissional',
      color: form.color,
      services: services.filter((s) => form.serviceIds.includes(s.id)).map((s) => s.name),
      profile: { ...form.profile, email: form.profile.email.trim(), bio: form.profile.bio.trim() },
      active: editing?.active ?? true,
      week: form.week,
      overrides: form.overrides,
      bufferMin: form.bufferMin
    }),
    [editing, form, services]
  );

  // Agendamentos já marcados que a nova jornada/pausa/exceção deixaria em conflito (o intervalo não reprova agendamentos existentes)
  const conflicts = useMemo(() => {
    if (!open || !editing || scheduleError) return [];
    const team = getTeam();
    const list = team.members.map((m) => m.id === candidate.id ? candidate : m);
    const before = new Set(scheduleConflicts(getAgendaState()).map((c) => c.appt.id));
    return scheduleConflicts(getAgendaState(), { members: list, sharedBreaks: team.sharedBreaks }).filter((c) => c.appt.professionalId === candidate.id && !before.has(c.appt.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, candidate, scheduleError]);
  useEffect(() => setAck(false), [conflicts.length]);

  // W2 (A3-14): os agendamentos futuros com NOMES (antes: só o número).
  const futureList = useMemo(() => {
    if (!editing) return [];
    return Object.entries(agenda.appointments).
    filter(([iso]) => iso >= TODAY_ISO).
    flatMap(([iso, list]) => list.filter((a) => a.professionalId === editing.id && a.status !== 'cancelled' && a.status !== 'completed' && a.status !== 'no_show').map((a) => ({ iso, a }))).
    sort((x, y) => (x.iso + x.a.start).localeCompare(y.iso + y.a.start));
  }, [agenda, editing]);
  const futureAppts = futureList.length;

  const save = () => {
    setSubmitted(true);
    const first = tabOf.find(([k]) => errors[k]);
    if (first) {
      setTab(first[1]);
      return;
    }
    if (conflicts.length > 0 && !ack) return;
    const member = candidate.id === 'novo-profissional' ? { ...candidate, id: `pro-${Date.now()}` } : candidate;
    const scheduleChanged =
    !!editing && (JSON.stringify(editing.week) !== JSON.stringify(form.week) || JSON.stringify(editing.overrides) !== JSON.stringify(form.overrides) || editing.bufferMin !== form.bufferMin);
    onSave(member, form.serviceIds, {
      phoneAdded: !!editing && !editing.profile?.phone && !!form.profile.phone,
      scheduleChanged,
      conflicts: conflicts.length,
      firstConflict: conflicts[0] ? { iso: conflicts[0].iso, apptId: conflicts[0].appt.id } : undefined
    });
    onClose();
  };

  const addSpec = () => {
    const t = specDraft.trim();
    if (t && !form.profile.specialties.some((x) => x.toLowerCase() === t.toLowerCase())) setP('specialties', [...form.profile.specialties, t]);
    setSpecDraft('');
  };

  const tabOfKey = (k: keyof typeof errors) => tabOf.find(([key]) => key === k)?.[1];
  const err = (k: keyof typeof errors) => submitted || checkedTabs.includes(tabOfKey(k) ?? '') ? errors[k] : undefined;
  // CONTRATO NOVO (janela com etapas, 23/11/2026)
  const isCreate = !editing;
  const tabIndex = TAB_ORDER.indexOf(tab);
  const isLastStep = !CREATE_STEPS.includes(tab) || tab === CREATE_STEPS[CREATE_STEPS.length - 1];
  /** CONTRATO NOVO (janela de tamanho único, 23/11/2026): o miolo volta ao topo na mesma hora da troca (antes, um
   *  instante depois), para a aba nova nunca aparecer rolada e depois pular. Vale também para o clique na aba. */
  const scrollTop = () => {
    const box = tabsTopRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
    box?.scrollTo({ top: 0 });
  };
  const next = () => {
    setCheckedTabs((l) => l.includes(tab) ? l : [...l, tab]);
    if (tabOf.some(([k, t]) => t === tab && errors[k])) return;
    const i = CREATE_STEPS.indexOf(tab);
    if (i >= 0 && i < CREATE_STEPS.length - 1) {
      scrollTop();
      setTab(CREATE_STEPS[i + 1]);
    }
  };
  const back = () => {
    if (tabIndex > 0) {
      scrollTop();
      setTab(TAB_ORDER[tabIndex - 1]);
    }
  };
  // L24b: as 14 cores do DS 6.2, na ordem dele. Cor antiga fora da paleta: aparece no fim como "Cor atual".
  const palette = PROFESSIONAL_COLORS.map((c) => ({ key: c.id, label: c.name, hex: c.hex }));
  const colorOptions = palette.some((c) => sameHex(c.hex, form.color)) ? palette : [...palette, { key: 'atual', label: 'Cor atual', hex: form.color }];
  const takenBy = (hex: string) => members.find((m) => sameHex(m.color, hex) && m.id !== editing?.id);
  const upcoming = form.overrides.filter((o) => o.to >= TODAY_ISO).sort((a, b) => a.from.localeCompare(b.from));
  const past = form.overrides.filter((o) => o.to < TODAY_ISO).sort((a, b) => b.from.localeCompare(a.from));

  return (
    <>
      <AppModal
        open={open}
        onClose={onClose}
        dirtyValue={form}
        size="lg"
        steadyHeight
        title={editing ? editing.name : 'Novo profissional'}
        description={`A assistente e a agenda só oferecem horários dentro da jornada deste profissional e do horário ${currentWords().of}, fora das pausas e das ausências.`}
        footer={
        <ModalActions
          start={
          editing ?
          <Button variant={editing.active === false ? 'neutral' : 'dangerSoft'} leftIcon={editing.active === false ? <ArchiveRestoreIcon className="h-4 w-4" /> : <ArchiveIcon className="h-4 w-4" />} onClick={() => editing.active === false ? (onArchive(editing, true), onClose()) : setConfirmArchive(true)}>
                  {editing.active === false ? 'Reativar' : 'Arquivar'}
                </Button> :
          undefined
          }>
          
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            {/* CONTRATO NOVO (janela com etapas, 23/11/2026): Cancelar · Voltar · Próximo/Adicionar, só na criação. O texto
               escondido tira o "Voltar" da regra de botão que fecha a janela (AppModal) e dá nome completo ao leitor de tela. */}
            {isCreate && tabIndex > 0 &&
          <Button variant="secondary" onClick={back}>
                Voltar<span className="sr-only"> para a etapa anterior</span>
              </Button>
          }
            {isCreate && !isLastStep ?
          <Button onClick={next}>Próximo</Button> :

          <Button onClick={save} disabled={conflicts.length > 0 && !ack} aria-describedby={conflicts.length > 0 && !ack ? 'pro-confirmar-aviso' : undefined}>
                {editing ? 'Salvar' : 'Adicionar profissional'}
              </Button>
          }
          </ModalActions>
        }>
        
        {conflicts.length > 0 && !ack && <p id="pro-confirmar-aviso" className="-mt-2 mb-3 text-sm text-text-secondary">Para salvar, confirme o aviso de agendamentos em conflito no fim desta janela.</p>}
        <div ref={tabsTopRef} />
        <Tabs
          value={tab}
          onValueChange={(t) => {
            scrollTop();
            setTab(t);
          }}>
          
          {/* CONTRATO NOVO (janela de tamanho único, 23/11/2026): as abas ficam paradas no topo do miolo; só o conteúdo rola. */}
          <div className="sticky top-0 z-10 bg-white">
            <ScrollableTabs>
              <TabsList aria-label="Seções do profissional" className={`min-w-max ${tabListNoScroll}`}>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="servicos">Serviços</TabsTrigger>
                <TabsTrigger value="jornada">Jornada</TabsTrigger>
                <TabsTrigger value="ausencias">Ausências</TabsTrigger>
                <TabsTrigger value="intervalo">Intervalo</TabsTrigger>
              </TabsList>
            </ScrollableTabs>
          </div>

          {/* ───────── A) Dados ───────── */}
          <TabsContent value="dados" className="mt-5">
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                {/* L24b: círculo das iniciais na cor escolhida (DS 6.2, `Avatar color`); com foto, vale a foto. */}
                <Avatar name={form.name || 'Profissional'} src={form.profile.photo || undefined} color={form.color} size="xl" />
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button size="md" variant="secondary" leftIcon={<ImageIcon className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                      {form.profile.photo ? 'Trocar foto' : 'Adicionar foto'}
                    </Button>
                    {form.profile.photo &&
                    <Button size="md" variant="neutral" onClick={() => setP('photo', '')}>
                        Remover
                      </Button>
                    }
                  </div>
                  <p className="text-xs text-text-muted">Opcional. Aparece no perfil do profissional neste painel.</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-guard-ignore
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setP('photo', URL.createObjectURL(f));
                      e.target.value = '';
                    }} />
                  
                </div>
              </div>

              {/* L24b (pedido 4): "Cor na agenda" no alto da aba, logo abaixo da foto. Mesmos botões redondos de antes. */}
              <fieldset className="min-w-0">
                <legend className="text-sm font-semibold text-text-primary">Cor na agenda</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {colorOptions.map((c) => {
                    const other = takenBy(c.hex);
                    const on = sameHex(form.color, c.hex);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        aria-label={`${c.label}${other ? ` (também usada por ${other.name})` : ''}`}
                        title={c.label}
                        aria-pressed={on}
                        onClick={() => setForm((f) => ({ ...f, color: c.hex }))}
                        className="flex h-9 w-9 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        style={{ backgroundColor: c.hex }}>
                        
                        {on && <CheckIcon className="h-4 w-4 text-white" aria-hidden="true" />}
                      </button>);

                  })}
                </div>
                {takenBy(form.color) && <p className={SECTION_HELP}>{takenBy(form.color)?.name} também usa esta cor. Funciona, mas fica mais difícil diferenciar na agenda.</p>}
              </fieldset>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Nome de exibição" required value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={err('name')} helperText={`Como aparece na agenda e como a assistente apresenta. Ex.: ${currentContent().teamExample.name}.`} />
                {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026): primeira linha "Cadastrar área de atuação". */}
                <SelectComCadastro
                  label="Área de atuação"
                  placeholder="Escolha a área"
                  options={areaOptions}
                  value={form.profile.role || undefined}
                  onChange={(v) => setP('role', v)}
                  createLabel="Cadastrar área de atuação"
                  onCreate={(typed) => setNewArea({ open: true, typed })} />
                
                <Input
                  id="pro-whatsapp"
                  label="WhatsApp"
                  inputMode="tel"
                  placeholder="Ex.: (19) 98700-2201"
                  value={maskPhoneBR(form.profile.phone)}
                  onChange={(e) => setP('phone', phoneDigits(e.target.value))}
                  error={err('phone')}
                  helperText="Recebe aviso quando um agendamento na própria agenda é criado, cancelado ou remarcado." />
                
                <Input label="E-mail (opcional)" type="email" value={form.profile.email} maxLength={120} onChange={(e) => setP('email', e.target.value)} error={err('email')} helperText="Fica só no cadastro; a assistente não usa." />
              </div>
              {/* R3 (06/11/2026, Christian, A-17): aviso na aba Dados quando falta o WhatsApp (o cartão da Equipe já mostra "Falta WhatsApp"). */}
              {!form.profile.phone &&
              <NoticeInline tone="warning" title="Falta WhatsApp">
                  Sem ele, {form.name.trim() || 'o profissional'} não recebe aviso quando um agendamento na própria agenda é criado, cancelado ou remarcado. Dá para salvar o resto e completar depois.
                </NoticeInline>
              }

              <div>
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  Especialidades
                  <InfoTip label="Especialidades" content="A assistente usa isto para dizer ao cliente com o que o profissional trabalha. Ex.: “A Dra. Carolina atende injetáveis e tratamentos faciais”." />
                </p>
                {form.profile.specialties.length > 0 &&
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Especialidades">
                    {form.profile.specialties.map((sp) =>
                  <li key={sp}>
                        <Pill size="sm" selected aria-label={`Remover ${sp}`} onClick={() => setP('specialties', form.profile.specialties.filter((x) => x !== sp))}>
                          {sp}
                          <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </Pill>
                      </li>
                  )}
                  </ul>
                }
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <Input
                    aria-label="Nova especialidade"
                    placeholder="Digite e aperte Enter"
                    value={specDraft}
                    maxLength={60}
                    onChange={(e) => setSpecDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSpec();
                      }
                    }} />
                  
                  <Button size="md" variant="secondary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={addSpec} disabled={!specDraft.trim()} className="sm:mt-1">
                    Adicionar
                  </Button>
                </div>
              </div>

              <fieldset className="min-w-0">
                <legend className="text-sm font-semibold text-text-primary">
                  Registro profissional <span className="font-normal text-text-muted">(opcional)</span>
                </legend>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)]">
                  <Select ariaLabel="Conselho" placeholder="Conselho" options={COUNCILS.map((c) => ({ value: c, label: c }))} value={form.profile.council || undefined} onChange={(v) => setP('council', v)} />
                  <Input aria-label="Número do registro" placeholder="Número" value={form.profile.councilNumber} maxLength={20} onChange={(e) => setP('councilNumber', e.target.value.replace(/[^\dA-Za-z-]/g, ''))} />
                  <Select ariaLabel="Estado do registro" placeholder="UF" options={UFS.map((u) => ({ value: u, label: u }))} value={form.profile.councilUf || undefined} onChange={(v) => setP('councilUf', v)} />
                </div>
                <p className={SECTION_HELP}>Ex.: CRM 123456 SP.</p>
              </fieldset>

              <Textarea label="Mini bio para o cliente (opcional)" rows={3} showCount maxLength={300} value={form.profile.bio} onChange={(e) => setP('bio', e.target.value)} placeholder="Ex.: Médica com foco em estética facial e injetáveis. Atende há 10 anos em Campinas." />
            </div>
          </TabsContent>

          {/* ───────── B) Serviços que faz ───────── */}
          <TabsContent value="servicos" className="mt-5">
            <p className="text-sm text-text-secondary">A assistente só oferece este profissional nos serviços marcados. Duração e preço vêm do cadastro do serviço (não existe preço diferente por profissional).</p>
            <ul className="mt-3 flex flex-col gap-2">
              {services.
              filter((s) => s.active).
              map((s) => {
                const on = form.serviceIds.includes(s.id);
                return (
                  <li key={s.id}>
                      {/* G5 parte 2: Checkbox do DS no lugar da caixa nativa. */}
                      <div className={`rounded-xl border px-4 py-3 ${on ? 'border-primary bg-active-surface' : 'border-border bg-surface'}`}>
                        <Checkbox
                        className="w-full"
                        checked={on}
                        onChange={(checked: boolean) => setForm((f) => ({ ...f, serviceIds: checked ? [...f.serviceIds, s.id] : f.serviceIds.filter((x) => x !== s.id) }))}
                        label={<span className="text-sm font-semibold text-text-primary">{s.name}</span>}
                        description={<span className="tabular-nums">{s.durationMin} min · {priceLabel(s)}</span>} />
                      
                      </div>
                    </li>);

              })}
            </ul>
            {/* CONTRATO NOVO (janela com etapas, 23/11/2026): na criação, aviso no padrão do "Falta WhatsApp" da aba Dados. Não trava. */}
            {form.serviceIds.length === 0 && (
            isCreate ?
            <NoticeInline className="mt-3" tone="warning" title="Nenhum serviço marcado">
                  Sem isso, a assistente não oferece horários {form.name.trim() ? `de ${form.name.trim()}` : 'do profissional'}. Dá para salvar e marcar depois.
                </NoticeInline> :

            <p className="mt-2 text-sm text-text-secondary">Sem serviço marcado, a assistente não oferece este profissional.</p>)
            }
          </TabsContent>

          {/* ───────── C) Jornada ───────── */}
          <TabsContent value="jornada" className="mt-5">
            <div className="mb-3 rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Resumo</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{weekSummary(form.week).join(' · ')}</p>
            </div>
            <p className="mb-2 text-xs text-text-secondary">Ligue os dias em que atende. Em cada dia dá para ter mais de um período (o espaço entre eles vira o almoço) e copiar o dia para outros.</p>
            <WeeklyScheduleEditor week={form.week} clinicHours={hours} onChange={(week) => setForm((f) => ({ ...f, week }))} idPrefix="pro-dia" />
            {form.week.some((d, i) => d.working && hours[i] && hours[i].open && d.periods.some((p) => p.start < hours[i].from || p.end > hours[i].to)) &&
            <NoticeInline className="mt-3" tone="warning" title={`Parte da jornada fica fora do horário ${currentWords().of}`}>
                O que estiver fora do horário {currentWords().of} não é oferecido pela agenda nem pela assistente.
              </NoticeInline>
            }
            {(submitted || checkedTabs.includes('jornada')) && errors.schedule &&
            <p role="alert" className="mt-2 text-sm text-error">
                Revise a jornada: {errors.schedule}
              </p>
            }
          </TabsContent>

          {/* ───────── D) Ausências e exceções ───────── */}
          <TabsContent value="ausencias" className="mt-5">
            <p className="mb-3 text-sm text-text-secondary">Folga, férias, bloqueio de algumas horas ou horário especial numa data. Valem só nas datas escolhidas e vencem a jornada semanal. Nunca abrem a agenda num dia em que {currentWords().the} está {currentWords().closed}.</p>
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <StatusBadge status={upcoming.length ? 'info' : 'muted'} label={upcoming.length === 1 ? '1 próxima' : `${upcoming.length} próximas`} />
              <StatusBadge status="muted" label={past.length === 1 ? '1 passada' : `${past.length} passadas`} />
            </div>
            <OverridesEditor schedule={form} defaultDate={TODAY_ISO} onChange={(overrides) => setForm((f) => ({ ...f, overrides }))} />
            {past.length > 0 &&
            <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-text-primary">Ausências passadas</summary>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                  {past.map((o) =>
                <li key={o.id}>{describeOverride(form, o)}</li>
                )}
                </ul>
              </details>
            }
            <p className="mt-3 text-xs text-text-muted">Com “Mostrar o motivo ao cliente” marcado, a assistente diz o motivo quando o cliente pergunta por essa data ou horário. Sem a marcação, o motivo fica só para a equipe.</p>
          </TabsContent>

          {/* ───────── E) Intervalo ───────── */}
          <TabsContent value="intervalo" className="mt-5">
            <BufferPicker value={form.bufferMin} onChange={(bufferMin) => setForm((f) => ({ ...f, bufferMin }))} />
            <BufferTimeline minutes={form.bufferMin} />
            <p className="mt-3 text-xs text-text-secondary">Serve para arrumar a sala ou descansar entre um cliente e outro. Vale só para este profissional; não muda agendamentos já marcados.</p>
          </TabsContent>
        </Tabs>
        {/* W2 (A3-13, A1-06): o aviso fica fora das abas, visível na aba em que a mudança foi feita (Jornada, Ausências…). */}
        <ConflictNotice
          className="mt-4"
          title={`${conflicts.length} ${conflicts.length === 1 ? 'agendamento fica' : 'agendamentos ficam'} em conflito com essa configuração`}
          items={conflicts.map((c) => ({ key: c.appt.id, name: c.appt.clientName, when: `${mediumDayLabel(c.iso)} ${c.appt.start}–${c.appt.end}`, detail: c.message }))}
          footnote="Nada será cancelado nem movido automaticamente. Eles continuam visíveis na agenda, marcados como conflito, até você remarcar."
          ack={ack}
          onAck={setAck} />
        
      </AppModal>

      {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026): área nova volta já escolhida; nome repetido escolhe a que existe. */}
      <NovaAreaModal
        open={newArea.open}
        onClose={() => setNewArea((a) => ({ ...a, open: false }))}
        initialName={newArea.typed}
        onSave={(name) => {
          const existing = sameName(areaOptions, name);
          if (existing) {
            setP('role', existing.value);
            sameNameNotice(existing.label);
            return;
          }
          setP('role', addPracticeArea(name));
        }} />
      

      <ArchiveConfirm
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={`Arquivar ${editing?.name ?? 'profissional'}?`}
        description={
        futureAppts > 0 ?
        'O profissional sai das listas de agendamento e a assistente deixa de oferecer horários com ele.' :
        'O profissional sai das listas de agendamento e a assistente deixa de oferecer horários com ele. O histórico continua igual e dá para reativar depois.'
        }
        onConfirm={() => {
          if (editing) onArchive(editing, false);
          onClose();
        }}>
        
        {futureAppts > 0 &&
        // W2 (A3-14): os nomes, não só o número.
        <ConflictNotice
          title={`${editing?.name} tem ${futureAppts} ${futureAppts === 1 ? 'agendamento futuro' : 'agendamentos futuros'}`}
          items={futureList.map(({ iso, a }) => ({ key: a.id, name: a.clientName, when: `${mediumDayLabel(iso)} ${a.start}–${a.end}`, detail: a.service }))}
          footnote="Nada será cancelado nem movido. Eles continuam na agenda e entram em “Conflitos a resolver” até você remarcar." />

        }
      </ArchiveConfirm>
    </>);

}