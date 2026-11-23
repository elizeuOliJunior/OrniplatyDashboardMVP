import { wordsNow } from '../../data/segment';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Textarea } from '../Textarea';
import { Checkbox } from '../Checkbox';
import { InfoTip } from '../Card';
import { ModalActions } from '../ui/ModalActions';
import { NoticeInline } from '../ui/Notice';
import { NovoClienteModal } from './NovoClienteModal';
import { ClientSelect } from '../client/ClientSelect';
import { SelectComCadastro } from '../ui/SelectComCadastro';
import { NovoServicoHost } from '../servicos/NovoServicoHost';
import { NovoProfissionalHost } from '../servicos/NovoProfissionalHost';
import { professionalByValue, professionalOptions, serviceByValue, serviceOptions, shortDate } from '../../data/catalogo';
import { getServices, useServices } from '../../data/servicesStore';
import { clientIdOfRecordedName, useClientOptions } from '../../data/api/clientes';
import { listPackages, usablePackagesFor, useBackendVersion } from '../../data/api/pacotes';
import { VendaDePacoteModal } from '../pacotes/VendaDePacoteModal';
import { DateField } from '../ui/DateField';
import { TimeField } from '../ui/TimeField';
import { checkNow, getAgendaState } from '../../data/agendaLive';
import { clinicDay, freeStartTimes } from '../../data/availability';
import { MIN_REASON, canAuthorizeException, runWithException, useRole } from '../../data/exceptions';
import { Pill } from '../Pill';
import { endFor, mediumDayLabel, NOW, TODAY_ISO } from '../../data/agendaStore';
import { slotText } from '../../data/conflictCases';
import { toldText } from '../../data/appointmentNotices';
import { ChoiceCards } from '../Card';
import { ListaEsperaModal } from './ListaEsperaModal';
import { dayWordsOfService, isGroupService } from '../../data/servicesStore';
import { setWaitlist } from '../../data/agendaLive';
import { addAvulso } from '../../data/turmas';
import { aulaDayText, aulaOptionText, nextAulasOfService, useAulasVersion } from '../../data/aulas';

export type AgendamentoDefaults = {
  client?: string;
  service?: string;
  professional?: string;
  date?: string;
  time?: string;
  /** G3: observação já gravada (remarcar mantém e permite editar). */
  note?: string;
  /** W3 (rodada 2): quem abriu o formulário mostra o próprio aviso ao salvar (lista de espera: "Vaga preenchida"). */
  silentToast?: boolean;
};

export type AgendamentoSalvo = {
  client: string;
  service: string;
  professional: string;
  date: string;
  time: string;
  /** G3 (F-043): observação interna, gravada no agendamento. */
  note?: string;
  /** G3 (F-052): pacote pré-vinculado (só no agendamento novo; não consome sessão). */
  packageSaleId?: string | null;
  /** G3 (F-044, D4): "O cliente já confirmou". */
  confirmed?: boolean;
};

type NovoAgendamentoModalProps = {
  open: boolean;
  onClose: () => void;
  defaults?: AgendamentoDefaults;
  /** "novo" creates, "remarcar" reschedules an existing appointment */
  mode?: 'novo' | 'remarcar';
  /** Agendamento que está sendo remarcado: não conflita consigo mesmo */
  ignoreAppointmentId?: string;
  /**
   * Chamado com o formulário já validado pela regra única de disponibilidade.
   * Se devolver { ok:false } o modal continua aberto e mostra o motivo.
   */
  onSaved?: (data: AgendamentoSalvo) => {ok: boolean;message?: string;} | void;
  /** W3 (rodada 2): quem chama já mostra o próprio aviso (ex.: "Vaga preenchida"); este modal não mostra o dele. */
  silentToast?: boolean;
};

const empty = { client: '', service: '', professional: '', date: TODAY_ISO, time: '', note: '' };
const WAIVE = ['outside', 'buffer'] as ('outside' | 'buffer')[];
/** Quantos horários sugeridos mostrar (cada um passou pela regra única; precisão de 5 min) */
const SUGGESTIONS_MAX = 8;
/** W3 (A1-09): até quantos dias procurar o próximo dia com horário livre. */
const NEXT_DAY_REACH = 60;

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
/** L5: abreviações de nomes que terminam com ponto e não fecham a frase ("Dra. Carolina"). */
const ABBREVIATION_END = /(?:^|\s)(?:Dr|Dra|Sr|Sra|Srta|Prof|Profa)$/i;
/** L5: primeira frase de uma mensagem da regra única, sem o ponto final. */
const firstSentenceBare = (text: string) => {
  const end = /[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while (m = end.exec(text)) {
    if (ABBREVIATION_END.test(text.slice(0, m.index))) continue;
    return text.slice(0, m.index).trim();
  }
  return text.trim();
};

/**
 * R3 (06/11/2026, Christian, A-35): "Quem faz" (Serviços e equipe › `professionalIds` do serviço) vale também aqui, a MESMA
 * regra da lista de espera (data/waitlistOffer.ts, motivo 'not-assigned') e do assistente (`proDoesService`).
 * W3 (11/11/2026, Christian, A1-08): agora vale nos DOIS sentidos — com profissional escolhido, a lista de serviços mostra só
 * os que ele faz; com serviço escolhido, a lista de profissionais mostra só quem faz. Combinação inválida vinda de fora
 * (`defaults`): limpa o SERVIÇO e avisa. O campo mostrado nunca diverge do valor usado (o campo é recriado ao limpar).
 */
const proDoes = (serviceId: string, proId: string, list = getServices().services) => !!list.find((s) => s.id === serviceId)?.professionalIds.includes(proId);
function quemFazCheck<T extends {service: string;professional: string;}>(f: T): {form: T;notice: string | null;} {
  // Serviço arquivado ou fora do catálogo continua com o aviso que já existia (não é caso de "Quem faz").
  if (!f.service || !f.professional || !serviceOptions.some((o) => o.value === f.service) || proDoes(f.service, f.professional)) return { form: f, notice: null };
  const pro = professionalByValue(f.professional)?.label ?? 'Esse profissional';
  const svc = serviceByValue(f.service)?.label ?? 'esse serviço';
  return { form: { ...f, service: '' }, notice: `${pro} não faz ${svc}. Escolha outro serviço.` };
}

/**
 * Novo agendamento e Remarcar (mesma janela).
 * L5 (16/11/2026, etapa de facilidade de uso, só visual):
 *  - "Horários livres neste dia" fica ACIMA dos campos Data e Horário (antes ficava abaixo da dobra e a pessoa usava a roda
 *    de horas). O texto "qualquer minuto múltiplo de 5…" foi para o "i". Vale para as duas formas da janela.
 *  - Remarcar aberto com um horário que não pode ser usado (profissional de folga, bloqueio…) ou que já passou hoje: uma
 *    frase no topo diz isso, enquanto profissional, data e horário forem os que vieram. O aviso igual de baixo não repete.
 *    Os valores que vêm preenchidos e o que "Salvar novo horário" faz não mudaram.
 *  - Aviso "Agendamento remarcado": título + uma frase (de onde para onde). Quem da equipe é avisado continua no bloco
 *    "Quem é avisado" da janela do agendamento; a situação ("A confirmar"/"Confirmado") continua na etiqueta do agendamento.
 * L8 (17/11/2026, só texto e um botão que muda de lugar):
 *  - Sem horário livre para o profissional no dia (com a clínica aberta e outro profissional que faz o serviço), uma frase
 *    ao lado de "Próximo dia com horário" diz que trocar o profissional mostra os horários do mesmo dia. O atalho fica.
 *  - O aviso "Agendamento remarcado" não tem mais o botão "Completar" (estava sem explicação). "Completar o WhatsApp de
 *    {nome}" continua no bloco "Quem é avisado" da janela do agendamento. Os outros avisos (criado, encaixe) não mudaram.
 * L24c (19/11/2026, pedido 3a): "Buscar cliente" + "Cliente" viraram UM campo (`ClientSelect`, DS 6.2 `Select searchable`),
 *  que filtra enquanto digita. "Cadastrar cliente" é a primeira linha da lista (antes, "+ Cadastrar cliente" no fim) e abre
 *  o Novo cliente com o nome digitado; o cliente cadastrado volta escolhido, como antes. No Remarcar, o campo também filtra,
 *  sem "Cadastrar cliente" (antes também não tinha).
 */
export function NovoAgendamentoModal({ open, onClose, defaults, mode = 'novo', ignoreAppointmentId, onSaved, silentToast }: NovoAgendamentoModalProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const role = useRole();
  const canEx = canAuthorizeException(role);
  const [form, setForm] = useState({ ...empty });
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [allowEx, setAllowEx] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [packageSaleId, setPackageSaleId] = useState('');
  const [clientConfirmed, setClientConfirmed] = useState(false);
  /** L24c: o nome digitado no campo de cliente, para abrir o Novo cliente já com ele. */
  const [newClientName, setNewClientName] = useState('');
  const [newClientOpen, setNewClientOpen] = useState(false);
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
  /** L5: o que impede o horário que veio preenchido no Remarcar (só texto; calculado ao abrir). */
  const [openIssue, setOpenIssue] = useState<{text: string;professional: string;date: string;time: string;} | null>(null);
  useBackendVersion();
  // R3 (06/11/2026, Christian, A-35): catálogo vivo para filtrar por "Quem faz" e o aviso de combinação inválida.
  const services = useServices().services;
  const [quemFazNotice, setQuemFazNotice] = useState<string | null>(null);
  /**
   * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): serviço em grupo não vira horário individual. O passo do horário vira
   * "Escolha a turma e o dia" (próximas aulas; lotada desabilitada, com "Pôr na lista de espera") e confirmar põe o
   * cliente como AVULSO naquela aula. No Remarcar, serviço em grupo não aparece.
   */
  useAulasVersion();
  const [aulaPick, setAulaPick] = useState('');
  const [waitOpen, setWaitOpen] = useState(false);
  /** CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2c): "Vender pacote" no campo Pacote abre a venda por cima. */
  const [saleOpen, setSaleOpen] = useState(false);

  useEffect(() => {
    if (open) {
      // R3 (A-35): aberto já com profissional + serviço que ele não faz → limpa o serviço e avisa.
      const { silentToast: _s, ...given } = defaults ?? {};
      const checked = quemFazCheck({ ...empty, ...given });
      setForm(checked.form);
      setQuemFazNotice(checked.notice);
      setSubmitted(false);
      setSaveError(null);
      setAllowEx(false);
      setReason('');
      setConfirmed(false);
      setPackageSaleId('');
      setClientConfirmed(false);
      setNewClientName('');
      setNewSvc({ mounted: false, open: false, typed: '' });
      setNewPro({ mounted: false, open: false, typed: '' });
      setSaleOpen(false);
      setAulaPick('');
      // L5: só leitura, com a MESMA regra única (checkNow) e o mesmo relógio (NOW). Nada é trocado nos campos.
      const f = checked.form;
      let issue: string | null = null;
      if (mode === 'remarcar' && f.professional && f.date && f.time) {
        const minutes = serviceByValue(f.service)?.minutes ?? 30;
        const v = checkNow({ professionalId: f.professional, iso: f.date, start: f.time, durationMin: minutes, ignoreId: ignoreAppointmentId });
        const reasons: string[] = [];
        if (!v.ok && v.message) reasons.push(firstSentenceBare(v.message));
        if (f.date === TODAY_ISO && f.time < NOW) reasons.push(`${reasons.length ? 'o' : 'O'} horário das ${f.time} já passou`);
        if (reasons.length) issue = `${reasons.join(' e ')}.`;
      }
      setOpenIssue(issue ? { text: issue, professional: f.professional, date: f.date, time: f.time } : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // G1 (F-001): clientes do cadastro único (data/api/clientes.ts), acompanhando criar/arquivar/excluir.
  const clientOptions = useClientOptions();
  const allClientOptions = form.client && !clientOptions.some((o) => o.value === form.client) ? [{ value: form.client, label: form.client }, ...clientOptions] : clientOptions;
  const set = (key: keyof typeof form) => (value: string) => {
    setSaveError(null);
    // R3 (A-35): trocar serviço ou profissional confere "Quem faz"; inválido limpa o serviço e avisa.
    if (key === 'service' || key === 'professional') {
      const checked = quemFazCheck({ ...form, [key]: value });
      setQuemFazNotice(checked.notice);
      setForm(checked.form);
      return;
    }
    setForm((f) => ({ ...f, [key]: value }));
  };
  // G3 (revisão v3): o serviço precisa ser um serviço ATIVO da lista. Valor vindo de fora (horário antigo, lista de espera)
  // com serviço arquivado ou fora do catálogo não conta: a pessoa escolhe um serviço ativo antes de salvar.
  const serviceActive = serviceOptions.some((o) => o.value === form.service);
  const missing = { client: !form.client, service: !serviceActive, professional: !form.professional, time: !form.time };
  const invalid = Object.values(missing).some(Boolean);
  // R3 (A-35): com profissional escolhido, só os serviços que ele faz.
  const isGroup = (id: string) => !!services.find((x) => x.id === id && isGroupService(x));
  const serviceChoicesAll = form.professional ? serviceOptions.filter((o) => proDoes(o.value, form.professional, services)) : serviceOptions;
  const serviceChoices = mode === 'remarcar' ? serviceChoicesAll.filter((o) => !isGroup(o.value)) : serviceChoicesAll;
  // W3 (A1-08): com serviço escolhido, só os profissionais que fazem esse serviço.
  const professionalChoices = serviceActive ? professionalOptions.filter((p) => proDoes(form.service, p.value, services)) : professionalOptions;

  const serviceLabel = serviceByValue(form.service)?.label ?? '';
  const duration = (serviceActive ? serviceByValue(form.service)?.minutes : undefined) ?? 30;
  const exMode = canEx && allowEx;

  // Regra única: o mesmo teste usado na agenda, no assistente e na lista de espera
  const normal = useMemo(() => {
    if (!open || !form.professional || !form.date || !form.time) return null;
    return checkNow({ professionalId: form.professional, iso: form.date, start: form.time, durationMin: duration, ignoreId: ignoreAppointmentId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.professional, form.date, form.time, duration, ignoreAppointmentId, saveError]);

  // Com encaixe excepcional: dispensa APENAS expediente e intervalo entre atendimentos
  const waived = useMemo(() => {
    if (!open || !exMode || !form.professional || !form.date || !form.time) return null;
    return checkNow({ professionalId: form.professional, iso: form.date, start: form.time, durationMin: duration, ignoreId: ignoreAppointmentId, waive: WAIVE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exMode, form.professional, form.date, form.time, duration, ignoreAppointmentId, saveError]);

  /**
   * R3 (06/11/2026, Christian, A-20): horário de HOJE antes de agora (relógio do protótipo, `NOW`) não entra no fluxo normal:
   * fica riscado no campo Horário (mesmo sem profissional escolhido) e, se vier preenchido (ex.: `defaults`), vira conflito.
   * Conta como "exceptable": com "Encaixe excepcional" marcado pode ser registrado (motivo + confirmação), igual a fora
   * do expediente. A regra única (checkNow) não olha a hora passada; por isso o teste fica aqui. Comparação "HH:MM" por string.
   */
  const isPastToday = (t: string) => form.date === TODAY_ISO && !!t && t < NOW;
  const pastNow = isPastToday(form.time);
  const PAST_MSG = 'Esse horário de hoje já passou. Escolha um horário a partir de agora.';
  const normalExceptable = !!normal && !normal.ok && (normal.kind === 'outside' || normal.kind === 'buffer');
  // Hora passada só vira encaixe se o resto da regra única também for dispensável (livre, ou só expediente/intervalo).
  const pastExceptable = pastNow && (!normal || normal.ok || normalExceptable);
  const exceptable = normalExceptable || pastExceptable;
  const needsEx = exMode && exceptable && !!waived && waived.ok;
  const verdict = exMode ? waived : normal;
  const conflict = !exMode && pastNow ? PAST_MSG : verdict && !verdict.ok ? verdict.message : null;

  const isTimeDisabled = (t: string) => {
    // R3 (A-20): hoje, antes de agora, só com encaixe excepcional.
    if (!exMode && isPastToday(t)) return true;
    if (!form.professional || !form.date) return false;
    return !checkNow({ professionalId: form.professional, iso: form.date, start: t, durationMin: duration, ignoreId: ignoreAppointmentId, waive: exMode ? WAIVE : undefined }).ok;
  };

  const suggestions = useMemo(() => {
    if (!open || !form.professional || !form.date) return [];
    // R3 (06/11/2026, Christian, A-20): hoje, "Horários livres" só a partir de agora (relógio do protótipo, `NOW`), igual à
    // assistente da Agenda. O campo Horário e o encaixe excepcional não mudam.
    return freeStartTimes(getAgendaState(), form.professional, form.date, duration, ignoreAppointmentId, form.date === TODAY_ISO ? NOW : undefined).slice(0, SUGGESTIONS_MAX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.professional, form.date, duration, ignoreAppointmentId, saveError]);

  /** W3 (A1-09): sem horário no dia escolhido, o próximo dia (a partir de hoje) em que este profissional tem horário livre. */
  const nextDayWithRoom = useMemo(() => {
    if (!open || !form.professional || !form.date || suggestions.length > 0) return null;
    const from = form.date < TODAY_ISO ? TODAY_ISO : form.date;
    for (let i = 1; i <= NEXT_DAY_REACH; i++) {
      const iso = addDays(from, i);
      if (freeStartTimes(getAgendaState(), form.professional, iso, duration, ignoreAppointmentId).length > 0) return iso;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.professional, form.date, duration, ignoreAppointmentId, suggestions.length]);

  const dayInfo = form.date ? clinicDay(form.date) : null;
  // L8: só texto. Com a clínica aberta no dia e outro profissional que faz o serviço, diz que trocar o profissional mostra
  // os horários do mesmo dia (não diz que há horário livre com ele: isso aparece ao trocar).
  const otherProHint = !!dayInfo?.open && professionalChoices.some((p) => p.value !== form.professional) ? `Para ver os horários ${form.date === TODAY_ISO ? 'de hoje' : 'deste dia'} com outra pessoa, troque o Profissional acima.` : null;
  // G3 (F-052): pacotes do cliente que valem para este serviço na data escolhida (pré-vínculo opcional).
  const usable = mode === 'novo' && open && form.client && serviceLabel ? usablePackagesFor(clientIdOfRecordedName(form.client), serviceLabel, form.date) : [];
  const linked = usable.some((p) => p.id === packageSaleId) ? packageSaleId : '';
  /** CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC3): o campo Pacote fica ativo quando há cliente e serviço. */
  const pkgReady = mode === 'novo' && !!form.client && !!serviceLabel;

  const reasonOk = reason.trim().length >= MIN_REASON;

  /* G2: serviço em grupo → aulas. */
  const groupMode = mode === 'novo' && serviceActive && isGroup(form.service);
  const aulas = groupMode ? nextAulasOfService(form.service, 8) : [];
  /** G5b: um serviço só → a palavra dele ("esta aula", "este treino"). */
  const gw = dayWordsOfService(groupMode ? form.service : '');
  const pickedAula = aulas.find((x) => x.key === aulaPick && !x.full);
  const groupClientId = form.client ? clientIdOfRecordedName(form.client) : null;
  const alreadyIn = !!pickedAula && !!groupClientId && pickedAula.clients.some((c) => c.clientId === groupClientId);
  const saveGroup = () => {
    setSubmitted(true);
    if (!form.client || !pickedAula || alreadyIn || !groupClientId) return;
    addAvulso(pickedAula.turma.id, groupClientId, pickedAula.origIso);
    toast({ title: `Cliente ${gw.inThe}`, description: `${form.client} · ${pickedAula.serviceName}, ${aulaDayText(pickedAula.iso)}, às ${pickedAula.start}. Entrou como avulso ${gw.in}.`, duration: 8000 });
    onClose();
  };

  const save = () => {
    if (groupMode) return saveGroup();
    setSubmitted(true);
    if (invalid || conflict) return;
    if (needsEx && (!reasonOk || !confirmed)) return;
    const data: AgendamentoSalvo = {
      client: form.client,
      service: form.service,
      professional: form.professional,
      date: form.date,
      time: form.time,
      note: form.note,
      confirmed: clientConfirmed,
      ...(mode === 'novo' ? { packageSaleId: linked || null } : {})
    };
    const call = () => onSaved?.(data);
    const result = needsEx ? runWithException({ reason: reason.trim(), by: role }, call) : call();
    if (result && !result.ok) {
      setSaveError(result.message ?? 'Esse horário não está mais disponível.');
      return;
    }
    if (!silentToast && !defaults?.silentToast) {
      // W3 (A1-11 + A1-15): quem foi avisado e, na remarcação, de onde para onde.
      // I3 (G12): o nome do cliente vai junto, para o aviso do lembrete respeitar o pedido de saída.
      const oldPro = defaults?.professional;
      const told = toldText(mode === 'remarcar' ? 'remarcado' : 'criado', mode === 'remarcar' && oldPro && oldPro !== form.professional ? [oldPro, form.professional] : [form.professional], form.date, form.time, form.client);
      const fromTo = mode === 'remarcar' && defaults?.date && defaults?.time ? `de ${slotText(defaults.date, defaults.time, oldPro)} para ${slotText(form.date, form.time, form.professional)}` : null;
      const moved = fromTo ? `De${fromTo.slice(2)}.` : `${shortDate(form.date)} às ${form.time}.`;
      const status = clientConfirmed ? 'Confirmado.' : 'Fica “A confirmar” até o cliente confirmar.';
      // L5: remarcação comum = título + uma frase. Quem é avisado continua na janela do agendamento ("Quem é avisado").
      const shortRemarcado = mode === 'remarcar' && !needsEx && !!fromTo;
      toast({
        title: needsEx ? 'Encaixe excepcional registrado' : mode === 'remarcar' ? 'Agendamento remarcado' : 'Agendamento criado',
        description: shortRemarcado ?
        `${form.client} · ${serviceLabel}: ${fromTo}.` :
        `${form.client} · ${serviceLabel}. ${moved} ${status} ${needsEx ? 'O encaixe fica registrado em Serviços e equipe › Funcionamento. ' : ''}${told.text}`.trim(),
        duration: 8000,
        // L8: sem "Completar" no aviso de remarcado curto (o botão com o nome continua na janela do agendamento).
        ...(told.missingPro && !shortRemarcado ? { action: { label: 'Completar', onClick: () => navigate('/servicos-equipe?aba=equipe') } } : {})
      });
    }
    onClose();
  };

  // L5: o aviso do topo vale enquanto profissional, data e horário forem os que vieram preenchidos.
  const topIssue = openIssue && form.professional === openIssue.professional && form.date === openIssue.date && form.time === openIssue.time ? openIssue.text : null;
  const errorText = saveError ?? (topIssue ? null : conflict);
  const endHint = form.time && serviceActive ? `Termina às ${endFor(serviceLabel, form.time)} (${duration} min).` : undefined;
  const dayName = form.date ? mediumDayLabel(form.date).toLowerCase() : '';

  // R2 (06/11/2026, A-19): dia fechado não tem horário para escolher → o subtítulo pede outra data.
  return (
    <>
    <AppModal
        open={open && !waitOpen}
        covered={newClientOpen || newSvc.open || newPro.open || saleOpen}
        onClose={onClose}
        title={mode === 'remarcar' ? 'Remarcar agendamento' : 'Novo agendamento'}
        description={defaults?.date && !defaults?.time ? dayInfo && !dayInfo.open ? 'Nesta data não há horários disponíveis. Escolha outra data.' : 'A data já está escolhida. Escolha o horário entre os disponíveis.' : 'Horários ocupados, em pausa, bloqueados, de folga ou sem o intervalo entre atendimentos ficam indisponíveis.'}
        footer={
        <ModalActions equal={2}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>{groupMode ? `Pôr ${gw.inThe}` : needsEx ? 'Registrar encaixe e agendar' : mode === 'remarcar' ? 'Salvar novo horário' : 'Agendar'}</Button>
        </ModalActions>
        }>
        
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* L5: o horário que veio no Remarcar não pode ser usado → uma frase no topo. */}
        {topIssue &&
          <NoticeInline tone="warning" role="status" title="Escolha um novo horário" className="sm:col-span-2">
            {topIssue}
          </NoticeInline>
          }
        {/* L24c (3a): um campo só, que filtra enquanto digita; "Cadastrar cliente" no topo da lista (só no agendamento novo). */}
        <div className="sm:col-span-2">
          <ClientSelect
              required
              options={allClientOptions}
              value={form.client}
              onChange={set('client')}
              error={submitted && missing.client ? 'Escolha o cliente.' : undefined}
              onCreate={
              mode === 'novo' ?
              (typed) => {
                setNewClientName(typed);
                setNewClientOpen(true);
              } :
              undefined
              } />
            
        </div>
        {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026): "Cadastrar serviço" e "Cadastrar profissional" no topo da lista, só no agendamento novo (como o cliente). */}
        <SelectComCadastro key={`svc-${form.service || 'vazio'}`} label="Serviço" required placeholder="Escolha o serviço" options={serviceChoices} value={serviceActive ? form.service : undefined} onChange={set('service')} error={missing.service && (submitted || !!form.service) ? form.service ? 'O serviço deste horário está arquivado ou não existe mais. Escolha um serviço ativo.' : 'Escolha o serviço.' : undefined} createLabel="Cadastrar serviço" onCreate={mode === 'novo' ? (typed) => setNewSvc({ mounted: true, open: true, typed }) : undefined} />
        {!groupMode &&
          <SelectComCadastro
            key={`pro-${form.professional || 'vazio'}`}
            label="Profissional"
            required
            placeholder="Escolha quem atende"
            options={professionalChoices}
            value={form.professional || undefined}
            onChange={set('professional')}
            helperText={serviceActive && professionalChoices.length < professionalOptions.length ? `Só quem faz ${serviceLabel}.` : undefined}
            error={submitted && missing.professional ? 'Escolha o profissional.' : undefined}
            createLabel="Cadastrar profissional"
            onCreate={mode === 'novo' ? (typed) => setNewPro({ mounted: true, open: true, typed }) : undefined} />

          }
        {quemFazNotice &&
          <NoticeInline tone="warning" role="status" className="sm:col-span-2">
            <p>{quemFazNotice}</p>
          </NoticeInline>
          }

        {/* G2 (aulas em grupo; CONTRATO NOVO): serviço em grupo → escolher a turma e o dia (avulso naquela aula). */}
        {groupMode &&
          <div className="flex flex-col gap-3 sm:col-span-2">
            {aulas.length === 0 ?
            <p className="text-sm text-text-secondary">Nenhum{gw.pick('a', '')} {gw.one} deste serviço nos próximos dias. Crie ou reative uma turma em Serviços e equipe › Turmas.</p> :

            <ChoiceCards
              label="Escolha a turma e o dia"
              columns={1}
              size="sm"
              value={pickedAula ? aulaPick : ''}
              onChange={(v) => setAulaPick(v)}
              options={aulas.map((x) => ({ value: x.key, title: aulaOptionText(x), disabled: x.full }))}
              helperText={`Entra como avulso só ${gw.in} e paga por ${gw.one}.`} />

            }
            {submitted && !pickedAula && aulas.length > 0 && <p className="text-sm text-error">Escolha {gw.the}.</p>}
            {alreadyIn && <p className="text-sm text-error">{form.client} já está {gw.in}.</p>}
            {aulas.some((x) => x.full) &&
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-text-secondary">{gw.One} {gw.pick('lotada', 'lotado')}? Ponha o cliente na lista de espera da turma.</p>
                <Button size="md" variant="secondary" onClick={() => setWaitOpen(true)}>
                  Pôr na lista de espera
                </Button>
              </div>
            }
          </div>
          }
        {!groupMode &&
          <>
        {/* L5: horários livres ACIMA dos campos Data e Horário, para ficarem à vista sem rolar. */}
        {form.professional && form.date && suggestions.length > 0 &&
            <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-text-secondary">
              Horários livres neste dia ({dayName}) para {duration} min{' '}
              <InfoTip label="os horários livres" content="Qualquer minuto múltiplo de 5 também pode ser escolhido no campo Horário, abaixo." />
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((t) =>
                <Pill key={t} size="sm" selected={form.time === t} onClick={() => set('time')(t)} className="tabular-nums">
                  {t}
                </Pill>
                )}
            </div>
          </div>
            }
        {form.professional && form.date && suggestions.length === 0 &&
            <div className="flex flex-col gap-2 sm:col-span-2">
            <p className="text-xs font-semibold text-warning">{dayInfo && !dayInfo.open ? `${dayInfo.message} Escolha outra data.` : 'Sem horários livres para esse profissional neste dia. Escolha outra data ou outro profissional.'}</p>
            {/* W3 (A1-09): aponta o próximo dia com horário, sem a pessoa procurar dia por dia. L8: ao lado, a frase de trocar o profissional. */}
            {(nextDayWithRoom || otherProHint) &&
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {nextDayWithRoom &&
                <Button size="sm" variant="secondary" onClick={() => set('date')(nextDayWithRoom)}>
                    Próximo dia com horário: {mediumDayLabel(nextDayWithRoom)}
                  </Button>
                }
                {otherProHint && <p className="text-xs text-text-secondary">{otherProHint}</p>}
              </div>
              }
          </div>
            }

        <DateField label="Data" value={form.date} onChange={set('date')} helperText={dayInfo && !dayInfo.open ? `${wordsNow().The} está ${wordsNow().closed} nesta data.` : undefined} />
        <TimeField
              label="Horário"
              required
              value={form.time}
              onChange={set('time')}
              isTimeDisabled={form.professional || form.date === TODAY_ISO ? isTimeDisabled : undefined}
              helperText={endHint}
              error={submitted && missing.time ? 'Escolha o horário.' : undefined} />
            

        {errorText &&
            <NoticeInline tone="warning" role="alert" title="Esse horário não pode ser usado" className="sm:col-span-2">
            <p>{errorText}</p>
            {!canEx && exceptable && !saveError &&
              <p className="mt-1">
                {pastExceptable ? 'Horário que já passou hoje só pode ser registrado como encaixe excepcional, com motivo.' : 'Encaixe fora do expediente ou sem o intervalo entre atendimentos só pode ser registrado como encaixe excepcional, com motivo.'}
              </p>
              }
          </NoticeInline>
            }

        {canEx &&
            <div className="rounded-xl border border-border px-4 py-3 sm:col-span-2">
            {/* W3 (A1-13): sem "(dono)": um só tipo de usuário; o motivo escrito continua obrigatório. */}
            <Checkbox size="sm" label={<span className="font-semibold">Encaixe excepcional</span>} checked={allowEx} onChange={(checked) => setAllowEx(checked)} />
            <p className="mt-1 text-xs text-text-secondary">
              Permite um horário fora do expediente, sem o intervalo entre atendimentos ou que já passou hoje, com motivo escrito. Não vale para horário ocupado, bloqueado, em pausa, folga ou dia fechado. Fica registrado e a assistente nunca faz isso.
            </p>
            {allowEx && needsEx &&
              <div className="mt-3 flex flex-col gap-3">
                <Textarea label="Motivo do encaixe" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={submitted && !reasonOk ? `Informe o motivo (mínimo ${MIN_REASON} caracteres).` : undefined} />
                <Checkbox size="sm" label="Confirmo que este encaixe é excepcional e será registrado." checked={confirmed} onChange={(checked) => setConfirmed(checked)} />
                {submitted && !confirmed && <p className="text-sm text-error">Confirme o encaixe para continuar.</p>}
              </div>
              }
            {allowEx && !needsEx && form.time && !conflict && <p className="mt-2 text-xs font-semibold text-text-secondary">Este horário não precisa de exceção.</p>}
          </div>
            }

        {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC3): "Pacote (opcional)" aparece SEMPRE no agendamento novo
                 (Remarcar continua sem o campo). Três estados: sem cliente ou sem serviço → desativado, "Escolha o cliente e o
                 serviço"; com os dois e sem pacote que valha → ativo em "Não vincular", com "Vender pacote" no topo; com pacote →
                 como antes. A regra de quais pacotes valem (`usablePackagesFor`) e o vínculo não mudaram. Desativado, a lista fica
                 vazia para o campo mostrar o texto de espera (com "Não vincular" na lista, o `Select` mostrava esse nome). */}
        {mode === 'novo' &&
            <div className="sm:col-span-2">
            <SelectComCadastro
                key={pkgReady ? 'pkg-pronto' : 'pkg-espera'}
                label="Pacote (opcional)"
                disabled={!pkgReady}
                placeholder="Escolha o cliente e o serviço"
                options={pkgReady ? [{ value: '', label: 'Não vincular' }, ...usable.map((p) => ({ value: p.id, label: `${p.service_name_snapshot} · ${p.saldo} ${p.saldo === 1 ? 'sessão restante' : 'sessões restantes'}`, description: `Vendido em ${shortDate(p.sold_at)}${p.expires_at ? ` · vale até ${shortDate(p.expires_at)}` : ''}` }))] : []}
                value={pkgReady ? linked : undefined}
                onChange={setPackageSaleId}
                helperText={!pkgReady ? undefined : usable.length > 0 ? 'Vincular não usa a sessão agora. A sessão só é usada quando o atendimento for fechado.' : 'Este cliente não tem pacote deste serviço.'}
                createLabel="Vender pacote"
                onCreate={pkgReady ? () => setSaleOpen(true) : undefined} />
              
          </div>
            }

        <div className="sm:col-span-2">
          <Checkbox
                checked={clientConfirmed}
                onChange={(v: boolean) => setClientConfirmed(v)}
                label={mode === 'remarcar' ? 'O cliente já confirmou o novo horário' : 'O cliente já confirmou'}
                description="Sem esta marcação, o agendamento fica “A confirmar”. Nenhuma mensagem é enviada por isso." />
              
        </div>

        <div className="sm:col-span-2">
          <Textarea label="Observação (opcional)" rows={2} value={form.note} onChange={(e) => set('note')(e.target.value)} helperText="Uso interno: aparece nos detalhes do agendamento e não vai para o cliente." />
        </div>
          </>
          }
      </div>
    </AppModal>
    {/* G2: aula lotada › pedido na lista de espera, já com o cliente e o serviço (a turma fica para escolher). */}
    <ListaEsperaModal
        open={open && waitOpen}
        onClose={() => setWaitOpen(false)}
        initial={{ client: form.client, service: form.service, turmaId: aulas.find((x) => x.full)?.turma.id }}
        onSaved={(entry) => {
          setWaitlist((list) => [...list, { id: `w${Date.now()}`, ...entry }]);
          onClose();
        }} />
      
    {/* CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2c): a venda que já existe, com o cliente e o serviço deste
           agendamento; ao vender, volta com o pacote novo escolhido. Cancelar volta sem mudar nada. */}
    <VendaDePacoteModal
        open={open && saleOpen}
        onClose={() => setSaleOpen(false)}
        clientePreSelecionadoId={form.client && clientIdOfRecordedName(form.client) || undefined}
        servicoPreSelecionadoId={serviceActive ? form.service : undefined}
        onSalvo={() => {
          const id = form.client ? clientIdOfRecordedName(form.client) : null;
          const novo = id ?
          listPackages({ client_id: id }).
          filter((p) => p.service_id === form.service && p.status === 'active' && p.saldo > 0).
          sort((a, b) => a.created_at < b.created_at ? 1 : -1)[0] :
          undefined;
          if (novo) setPackageSaleId(novo.id);
        }} />
      
    {/* W3 (A1-12): janela de cliente novo que já existe em Clientes (dona: faixa W5). L24c: abre com o nome digitado; o cliente cadastrado já vem escolhido. */}
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
    {newPro.mounted &&
      <NovoProfissionalHost
        open={open && newPro.open}
        initialName={newPro.typed || undefined}
        initialServiceIds={serviceActive ? [form.service] : undefined}
        onClose={closeNewPro}
        onCreated={(m) => set('professional')(m.id)} />

      }
    </>);

}