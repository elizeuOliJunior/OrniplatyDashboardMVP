import { wordsNow } from '../../data/segment';
import React, { useEffect, useMemo, useState } from 'react';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { Textarea } from '../Textarea';
import { Checkbox } from '../Checkbox';
import { Pill, PillGroup } from '../Pill';
import { ModalActions } from '../ui/ModalActions';
import { NoticeInline } from '../ui/Notice';
import { Card, ChoiceCards } from '../Card';
import { DateField } from '../ui/DateField';
import { TimeField } from '../ui/TimeField';
import { ReturnPlanTimeline } from '../client/ReturnPlanTimeline';
import { professionalOptions, serviceByLabel, serviceByValue, serviceOptions } from '../../data/catalogo';
import { NOW, TODAY_ISO } from '../../data/agendaStore';
import { cancelAppointment, checkNow, getAgendaState, patchAppointment, tryAddAppointment } from '../../data/agendaLive';
import { clientIdOfRecordedName } from '../../data/api/clientes';
import { absorbAppointmentRecords, consumeSession, packageBlockReason, reverseConsumption, usablePackagesFor, useBackendVersion } from '../../data/api/pacotes';
import { clinicDay, freeStartTimes, nextOpenIso, scheduleConflicts } from '../../data/availability';
import { serviceByName } from '../../data/servicesStore';
import { aulaByKey } from '../../data/aulas';
import { dayWords } from '../../data/turmaWords';
import { durationText, serviceReturnSentence } from '../../data/followUpModels';
import { automacoesStore } from '../../data/automacoes';
import { empresaStore } from '../../data/empresa';
import { effectivePayment } from '../../data/paymentRules';
import { useSavedStore } from '../../data/iaConfigStore';
import { useSavedAutomationMode } from '../../data/automationMode';
import { addDays } from '../../data/returns';
import { firstName, nextBooking, previewReturn, proName, registerClosure, shortDate } from '../../data/followUp';
import type { ReturnChoice } from '../../data/followUp';
import {
  CLAIM_LABEL,
  CLAIM_ORDER,
  METHODS,
  appliedDepositIds,
  brl,
  clientMethodOptions,
  closeFinance,
  depositsOfAppointment,
  methodWithInstallments,
  moneyInput,
  parseMoney,
  useDeposits } from
'../../data/convenios';
import type { ClaimStatus, Payer } from '../../data/convenios';

export type ClosableAppointment = {
  clientName: string;
  service: string;
  when: string;
  professional?: string;
  iso?: string;
  time?: string;
  /** G3: id do agendamento (pacote pré-vinculado, sinal e observação). Sem id, o agendamento é procurado por dia + hora + nome. */
  id?: string;
};

type FecharAtendimentoModalProps = {
  open: boolean;
  onClose: () => void;
  appointment: ClosableAppointment | null;
  onClosed?: (attended: boolean) => void;
  /**
   * CONTRATO NOVO (aulas em grupo, G3, 23/11/2026): pagamento de UM cliente de uma aula em grupo, aberto pela chamada.
   * É esta mesma janela e o mesmo passo de pagamento (valor, particular/convênio, forma, "Recebido agora / Ainda não
   * pagou", `closeFinance`). A presença já veio da chamada, então somem "O cliente compareceu?", o procedimento, o pacote
   * (o pacote da aula é usado pela própria chamada) e o Retorno. O `appointment.id` é `aula:<turma>@<data>:<cliente>`.
   */
  aula?: boolean;
};

const PAYERS = [
{ value: 'particular', label: 'Particular' },
{ value: 'convenio', label: 'Convênio' }];

/** Ajustes do Lote B (B1, 21/10/2026): cada opção com o efeito em linguagem comum (ChoiceCards do design system v3.12). */
const RETURN_OPTIONS: {value: ReturnChoice;title: string;description: string;}[] = [
{ value: 'ja-marcado', title: 'Já marcado', description: 'O cliente já sai com o próximo horário. Escolha abaixo.' },
{ value: 'nao-marcado', title: 'Não marcado', description: 'A Orniplaty chama o cliente perto da data de volta. Você não precisa fazer nada.' },
{ value: 'nao-precisa', title: 'Não precisa', description: 'Este cliente não precisa voltar por este serviço. Nenhuma mensagem será enviada.' }];

const ATTENDED = [
{ value: 'sim', title: 'Compareceu' },
{ value: 'nao', title: 'Faltou' }];

const SUGGESTIONS_MAX = 8;

/** W5 (G9, G16): mesmo par de opções em todo pagamento (fechamento, coparticipação, correção de pacote). */
const YESNO = [
{ value: 'sim', label: 'Recebido agora' },
{ value: 'nao', label: 'Ainda não pagou' }];


type Booking = {professional: string;date: string;time: string;};
/** G3 (D2): o que fazer quando o pacote pré-vinculado não pode mais cobrir a sessão. */
type PrelinkAction = '' | 'outro' | 'avulso';

const priceInput = (value: string) => {
  const s = serviceByValue(value);
  return s ? moneyInput(s.price * 100) : '';
};

/**
 * Fechar atendimento. Lote B (20/10/2026): campo "Retorno" (Já marcado · Não marcado · Não precisa), preenchido pelo
 * modelo do PROCEDIMENTO REALIZADO, com prazo só para este cliente e os próximos passos.
 * Ajustes do Lote B (21/10/2026, decisões do Christian):
 *  - B1: opções em ChoiceCards com o efeito escrito; sugestão do serviço sem nome técnico; "A Orniplaty cuida disso para você"
 *    com as datas (ClientProcess dateFirst) e o texto conforme o modo de envio SALVO (Pausado/Supervisionado/Automático).
 *  - B2: "Daqui a quantos dias {nome} deve voltar?" com a data calculada ao lado; vale só para este cliente.
 *  - B3: "Já marcado" escolhe profissional, data e horário NESTA janela (regra única de data/availability.ts). O botão vira
 *    "Fechar e marcar retorno"; o Toast traz Desfazer, que CANCELA (com motivo) SÓ o horário do retorno (G3, F-046).
 * G3 (26/10/2026):
 *  - F-042 (D3): data futura não fecha; no próprio dia, antes do início, só com confirmação explícita.
 *  - F-040: o valor segue o procedimento REALIZADO enquanto não foi editado à mão; editado, a troca só sugere o preço novo.
 *  - F-041: formas, parcelas, desconto (só aplicado com clique), sinal RECEBIDO e convênio vêm de `effectivePayment`.
 *  - F-052: "Usar sessão do pacote X (n restantes)": R$ 0, sem recebível novo, uma sessão consumida (idempotente).
 *    Pacote pré-vinculado que não vale mais exige escolha explícita (D2): outro pacote, avulso ou desistir.
 *  - F-053: convênio só da lista da Empresa; pagador ≠ forma.
 *  - F-043: a observação fica gravada no fechamento e no agendamento.
 * W5 (11/11/2026): G14 (pacote único já vem marcado), G16 ("Ainda não pagou" → Em aberto), G10 (o lançamento pendente do
 * atendimento vira o fechamento), A4-14 ("Não marcado" segue a regra do serviço), A3-01 (frase do "Já marcado") e
 * A3-21 (horário já marcado em conflito).
 */
export function FecharAtendimentoModal({ open, onClose, appointment, onClosed, aula = false }: FecharAtendimentoModalProps) {
  const toast = useToast();
  /** G5b: pagamento de um dia de turma usa a palavra do serviço ("Pagamento do treino"). id = `aula:<turma>@<data>:<cliente>`. */
  const aulaWords = aula && appointment?.id ? aulaByKey(appointment.id.slice(5, appointment.id.lastIndexOf(':')))?.words ?? dayWords() : dayWords();
  const mode = useSavedAutomationMode();
  const empresa = useSavedStore(empresaStore);
  useBackendVersion();
  useDeposits();
  const [attended, setAttended] = useState<'sim' | 'nao'>('sim');
  const [service, setService] = useState('');
  const [value, setValue] = useState('');
  /** F-040: o valor foi digitado à mão (trocar o procedimento não sobrescreve). */
  const [valueEdited, setValueEdited] = useState(false);
  const [payer, setPayer] = useState<Payer>('particular');
  const [method, setMethod] = useState('');
  const [installments, setInstallments] = useState('1');
  /** F-041 (correção da revisão): aviso visível quando a quantidade escolhida deixou de valer e voltou para À vista. */
  const [installmentsNotice, setInstallmentsNotice] = useState<string | null>(null);
  const [discountOn, setDiscountOn] = useState(false);
  const [insurer, setInsurer] = useState('');
  const [plan, setPlan] = useState('');
  const [covered, setCovered] = useState('');
  const [copayNow, setCopayNow] = useState<'sim' | 'nao'>('nao');
  /** W5 (G16): particular recebido agora ou "Ainda não pagou" (fica Em aberto e aparece em "A receber" na ficha). */
  const [paidNow, setPaidNow] = useState<'sim' | 'nao' | ''>('');
  const [copayMethod, setCopayMethod] = useState('pix');
  const [claim, setClaim] = useState<ClaimStatus>('pending');
  const [claimReceived, setClaimReceived] = useState('');
  const [claimMethod, setClaimMethod] = useState('transferencia');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  /** F-042: confirmação de fechar antes do horário (só no próprio dia). */
  const [earlyOk, setEarlyOk] = useState(false);
  /** F-052: pacote usado nesta sessão ('' = cobrar a sessão). */
  const [pkg, setPkg] = useState('');
  const [prelinkAction, setPrelinkAction] = useState<PrelinkAction>('');
  const [packageError, setPackageError] = useState<string | null>(null);
  /** Retorno (Lote B): vem preenchido pelo procedimento realizado; o prazo vale só para este cliente. */
  const [ret, setRet] = useState<ReturnChoice>('nao-marcado');
  const [suggestedRet, setSuggestedRet] = useState<ReturnChoice>('nao-marcado');
  const [retDays, setRetDays] = useState('');
  /** B3: horário do retorno escolhido nesta janela. */
  const [booking, setBooking] = useState<Booking>({ professional: '', date: '', time: '' });
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const saved = useSavedStore(automacoesStore);

  const sourceIso = appointment?.iso ?? TODAY_ISO;
  const serviceLabel = serviceOptions.find((o) => o.value === service)?.label ?? appointment?.service ?? '';
  const svc = serviceByName(serviceLabel);
  const existing = open && appointment ? nextBooking(getAgendaState().appointments, appointment.clientName, serviceLabel, sourceIso) : undefined;
  const sourceAppt =
  open && appointment ?
  (getAgendaState().appointments[sourceIso] ?? []).find((a) => appointment.id ? a.id === appointment.id : a.start === appointment.time && a.clientName === appointment.clientName) :
  undefined;
  const apptId = appointment?.id ?? sourceAppt?.id ?? null;
  /** Chave do atendimento no razão do pacote e no sinal (id do agendamento; sem id, dia|hora|nome). */
  const apptKey = apptId ?? (appointment ? `${sourceIso}|${appointment.time ?? ''}|${appointment.clientName}` : '');
  const clientId = appointment ? clientIdOfRecordedName(appointment.clientName) : null;

  /** B3: sugestão do horário do retorno (mesmo serviço e profissional, na data de volta; primeiro horário livre). */
  const suggestBooking = (serviceValue: string, label: string, days: number | null): Booking => {
    const pro = sourceAppt?.professionalId ?? '';
    const plan = appointment ? previewReturn(label, appointment.clientName, sourceIso, days) : null;
    let date = plan?.dueIso ?? '';
    if (date && date <= TODAY_ISO) date = addDays(TODAY_ISO, 1);
    if (date && !clinicDay(date).open) date = nextOpenIso(date) ?? date;
    const minutes = serviceByValue(serviceValue)?.minutes ?? 30;
    const free = pro && date ? freeStartTimes(getAgendaState(), pro, date, minutes) : [];
    const time = appointment?.time && free.includes(appointment.time) ? appointment.time : free[0] ?? '';
    return { professional: pro, date, time };
  };

  /** Preenche o Retorno pelo serviço (ao abrir e ao trocar o procedimento realizado). */
  const fillReturn = (serviceValue: string, label: string) => {
    if (!appointment) return;
    const sv = serviceByName(label);
    const booked = nextBooking(getAgendaState().appointments, appointment.clientName, label, appointment.iso ?? TODAY_ISO);
    const m = sv?.followUp.model ?? 'sem-retorno';
    const choice: ReturnChoice = booked ? 'ja-marcado' : m === 'sem-retorno' || m === 'recorrente' ? 'nao-precisa' : 'nao-marcado';
    setRet(choice);
    setSuggestedRet(choice);
    // Série já concluída: o prazo passa a ser o da Manutenção depois da série.
    const d = previewReturn(label, appointment.clientName, appointment.iso ?? TODAY_ISO, null)?.dueDays ?? sv?.followUp.dueDays;
    setRetDays(d ? String(d) : '');
    setBooking(suggestBooking(serviceValue, label, null));
    setBookingError(null);
  };

  // Formas do cliente = as formas salvas na Empresa (P6). Sem nenhuma salva, mostra as quatro com aviso.
  const savedMethods = clientMethodOptions(empresa.payments);
  const methodOptions = savedMethods.length ? savedMethods : clientMethodOptions(['pix', 'credito', 'debito', 'dinheiro']);

  useEffect(() => {
    if (open && appointment) {
      const s = serviceByLabel(appointment.service);
      setAttended('sim');
      setService(s?.value ?? '');
      setValue(s ? priceInput(s.value) : '');
      setValueEdited(false);
      setPayer('particular');
      setMethod('');
      setInstallments('1');
      setInstallmentsNotice(null);
      setDiscountOn(false);
      setInsurer('');
      setPlan('');
      setCovered('');
      setCopayNow('nao');
      setPaidNow('');
      setCopayMethod(methodOptions[0]?.value ?? 'pix');
      setClaim('pending');
      setClaimReceived('');
      setClaimMethod('transferencia');
      setNote('');
      setSubmitted(false);
      setEarlyOk(false);
      setPackageError(null);
      setPrelinkAction('');
      setBookingConfirmed(false);
      // F-052: pacote pré-vinculado e ainda válido vem marcado; inválido exige escolha (D2).
      const appt = (getAgendaState().appointments[appointment.iso ?? TODAY_ISO] ?? []).find((a) => appointment.id ? a.id === appointment.id : a.start === appointment.time && a.clientName === appointment.clientName);
      const linked = appt?.packageSaleId ?? null;
      const cid = clientIdOfRecordedName(appointment.clientName);
      // W5 (G14, 11/11/2026): sem pacote vinculado, se o cliente tem EXATAMENTE UM pacote válido do mesmo serviço, a janela
      // já abre em "Usar sessão do pacote" (a pessoa pode trocar para "Cobrar esta sessão"). Com dois ou mais, nada vem marcado.
      const key = appt?.id ?? appointment.id ?? `${appointment.iso ?? TODAY_ISO}|${appointment.time ?? ''}|${appointment.clientName}`;
      const onlyOne = usablePackagesFor(cid, s?.label ?? appointment.service, appointment.iso ?? TODAY_ISO, key);
      setPkg(
        aula ? '' : linked && !packageBlockReason(linked, cid, s?.label ?? appointment.service, appointment.iso ?? TODAY_ISO) ? linked : !linked && onlyOne.length === 1 ? onlyOne[0].id : ''
      );
      fillReturn(s?.value ?? '', s?.label ?? appointment.service);
      // CONTRATO NOVO (aulas em grupo, G3): pagamento de aula não tem Retorno.
      if (aula) setRet('nao-precisa');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── pacote (F-052) ──
  const prelinkId = sourceAppt?.packageSaleId ?? null;
  const prelinkBlock = open && prelinkId ? packageBlockReason(prelinkId, clientId, serviceLabel, sourceIso) : null;
  const usable = open && appointment && !aula ? usablePackagesFor(clientId, serviceLabel, sourceIso, apptKey) : [];
  const usableIds = usable.map((p) => p.id).join('|');
  useEffect(() => {
    // Trocar o procedimento tira um pacote que não cobre o serviço novo (nunca escolhe outro sozinho).
    if (pkg && !usable.some((p) => p.id === pkg)) setPkg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usableIds]);
  const usingPackage = attended === 'sim' && !!pkg && usable.some((p) => p.id === pkg);
  const chosenPackage = usable.find((p) => p.id === pkg);

  // ── regra de pagamento do serviço REALIZADO (F-041) ──
  const eff = svc ? effectivePayment(svc, empresa) : null;
  const insuranceBlocked =
  empresa.acceptsInsurance !== 'sim' ?
  'A empresa não atende convênio (IA Orniplaty › Empresa › Convênio).' :
  !eff || eff.insurance.mode === 'particular' || eff.insurance.mode === 'nao-atende' ?
  `${serviceLabel || 'Este serviço'} é só particular (Serviços e equipe › serviço › Pagamento).` :
  null;
  const insurerOptions = eff && !insuranceBlocked ? eff.insurance.insurers : [];
  useEffect(() => {
    if (insuranceBlocked && payer === 'convenio') setPayer('particular');
    if (insurer && !insurerOptions.includes(insurer)) setInsurer('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insuranceBlocked, insurerOptions.join('|')]);

  const gross = parseMoney(value);
  const instRule = eff?.installments ?? null;
  const canInstall = method === 'credito' && instRule?.installments === 'sim' && Number(instRule.maxInstallments) > 1;
  const maxInst = canInstall ? Number(instRule!.maxInstallments) : 1;
  // F-041 (correção da revisão): a quantidade só vale enquanto cabe na regra EFETIVA (procedimento realizado, forma e regra
  // do serviço/empresa). Fora dela, volta para À vista com aviso visível; ao salvar, valida de novo (nunca grava 10x num serviço de 6x).
  const instNumber = Number(installments) || 1;
  const installmentsValid = method !== 'credito' || Number.isInteger(instNumber) && instNumber >= 1 && instNumber <= maxInst;
  useEffect(() => {
    if (!open || installmentsValid) return;
    setInstallments('1');
    setInstallmentsNotice(
      canInstall ?
      `As parcelas voltaram para À vista: ${serviceLabel || 'este serviço'} parcela em até ${maxInst}x. Escolha de novo.` :
      `As parcelas voltaram para À vista: ${serviceLabel || 'este serviço'} não parcela no crédito.`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, installmentsValid, maxInst, canInstall, method]);
  const discRule = eff?.discount;
  const discountPct = discRule && discRule.discount === 'sim' ? Number(String(discRule.discountPercent).replace(',', '.')) || 0 : 0;
  const notPaid = payer === 'particular' && paidNow === 'nao';
  // Regra 6a (17/11/2026): nada vem marcado; "Fechar atendimento" só libera depois de escolher o pagamento.
  const paymentMissing = attended === 'sim' && !usingPackage && payer === 'particular' && (paidNow === '' || paidNow === 'sim' && !method);
  const discountEligible = payer === 'particular' && !notPaid && discountPct > 0 && !!discRule?.discountMethods.includes(method);
  const discountCents = discountOn && discountEligible ? Math.round(gross * discountPct / 100) : 0;
  const charged = gross - discountCents;
  // Sinal RECEBIDO deste atendimento (data, valor e forma próprios), ainda não usado por outro fechamento.
  const applied = useMemo(() => open ? appliedDepositIds() : new Set<string>(), [open]);
  const deposits = open ? depositsOfAppointment(apptId).filter((d) => !applied.has(d.id)) : [];
  const depositTotal = payer === 'particular' && !usingPackage ? deposits.reduce((t, d) => t + d.cents, 0) : 0;
  const remaining = charged - depositTotal;
  const depositRule = eff?.deposit;
  const configuredDeposit = depositRule && depositRule.deposit === 'sim' && depositRule.depositValue.trim();
  const methodNames = (ids: string[]) => ids.map((m) => methodOptions.find((o) => o.value === m)?.label ?? m).join(' ou ');

  const coveredCents = parseMoney(covered);
  const copay = Math.max(0, gross - coveredCents);

  const defaultPlan = open && appointment && svc ? previewReturn(serviceLabel, appointment.clientName, sourceIso, null) : null;
  const defaultDays = defaultPlan?.dueDays ?? null;
  const retNumber = Number(retDays);
  const model = svc?.followUp.model;
  const needsDays = !aula && attended === 'sim' && ret === 'nao-marcado' && !!svc && model !== 'sem-retorno' && model !== 'recorrente';
  const retPlan = needsDays && retNumber >= 1 && retNumber <= 365 && svc ? previewReturn(serviceLabel, appointment?.clientName ?? '', sourceIso, retNumber) : null;
  const reminderOn = saved.enabled.retorno !== false;
  const missedOn = saved.enabled.faltou !== false;
  // R2 (06/11/2026, divergência R3b): com outro horário do mesmo serviço já marcado (`existing`), a Orniplaty não chama para remarcar.
  const missedBooked = existing ? `${appointment?.clientName ?? 'O cliente'} já tem outro horário de ${existing.a.service.toLowerCase()} marcado em ${shortDate(existing.iso)}, às ${existing.a.start}: a Orniplaty não chama para remarcar.` : '';

  // B3: horário do retorno nesta janela (regra única: o mesmo teste da Agenda).
  const wantsBooking = !aula && attended === 'sim' && ret === 'ja-marcado' && !existing;
  const duration = serviceByValue(service)?.minutes ?? 30;
  const bookingCheck =
  wantsBooking && booking.professional && booking.date && booking.time ?
  checkNow({ professionalId: booking.professional, iso: booking.date, start: booking.time, durationMin: duration }) :
  null;
  const bookingConflict = bookingCheck && !bookingCheck.ok ? bookingCheck.message : null;
  const freeTimes = wantsBooking && booking.professional && booking.date ? freeStartTimes(getAgendaState(), booking.professional, booking.date, duration).slice(0, SUGGESTIONS_MAX) : [];
  const bookingDay = wantsBooking && booking.date ? clinicDay(booking.date) : null;
  const isTimeDisabled = (t: string) =>
  !!booking.professional && !!booking.date && !checkNow({ professionalId: booking.professional, iso: booking.date, start: t, durationMin: duration }).ok;
  const setBook = (patch: Partial<Booking>) => {
    setBookingError(null);
    setBooking((b) => ({ ...b, ...patch }));
  };

  const errors = {
    retDays: needsDays && !(retNumber >= 1 && retNumber <= 365) ? retDays ? 'Use de 1 a 365 dias.' : 'Informe em quantos dias o cliente deve voltar.' : undefined,
    bookPro: wantsBooking && !booking.professional ? 'Escolha o profissional.' : undefined,
    bookDate: wantsBooking && !booking.date ? 'Escolha a data.' : undefined,
    bookTime: wantsBooking && !booking.time ? 'Escolha o horário.' : undefined,
    bookConflict: bookingConflict ?? undefined,
    prelink: attended === 'sim' && prelinkBlock && !prelinkAction ? 'Escolha o que fazer com o pacote vinculado.' : undefined,
    pkg: attended === 'sim' && prelinkBlock && prelinkAction === 'outro' && !usingPackage ? 'Escolha o pacote que cobre esta sessão.' : undefined,
    value: attended === 'sim' && !usingPackage && gross <= 0 && !(svc?.priceMode === 'sob-consulta' && value.trim()) ? 'Informe o valor do serviço.' : undefined,
    deposit: attended === 'sim' && !usingPackage && payer === 'particular' && remaining < 0 ? `O sinal recebido (${brl(depositTotal)}) é maior que o valor cobrado (${brl(charged)}). Ajuste o valor.` : undefined,
    insurer: !usingPackage && payer === 'convenio' && !insurerOptions.includes(insurer) ? 'Escolha o convênio da lista da Empresa.' : undefined,
    covered: !usingPackage && payer === 'convenio' && (coveredCents <= 0 || coveredCents > gross) ? 'O valor coberto precisa ser maior que zero e não passar do valor cobrado.' : undefined,
    received: !usingPackage && payer === 'convenio' && claim === 'received' && parseMoney(claimReceived || moneyInput(coveredCents)) <= 0 ? 'Informe o valor recebido do convênio.' : undefined,
    installments:
    attended === 'sim' && !usingPackage && payer === 'particular' && !notPaid && !installmentsValid ?
    canInstall ?
    `Escolha as parcelas de novo: em até ${maxInst}x.` :
    'Este serviço não parcela no crédito: só à vista.' :
    undefined
  };

  if (!appointment) return null;
  const who = firstName(appointment.clientName);

  // F-042 (D3): fechamento só no dia do atendimento ou depois; no próprio dia, antes do início, só com confirmação.
  const future = sourceIso > TODAY_ISO;
  const beforeStart = sourceIso === TODAY_ISO && !!appointment.time && appointment.time > NOW;
  if (open && (future || beforeStart && !earlyOk)) {
    return (
      <AppModal
        open={open}
        onClose={onClose}
        unsavedGuard={false}
        size="md"
        title={future ? 'Ainda não dá para fechar' : 'O atendimento ainda não começou'}
        description={`${appointment.clientName} · ${appointment.service} · ${appointment.when}`}
        footer={
        future ?
        <ModalActions>
              <Button variant="secondary" onClick={onClose}>
                Voltar
              </Button>
            </ModalActions> :

        <ModalActions equal={2}>
              <Button variant="secondary" onClick={onClose}>
                Voltar
              </Button>
              <Button onClick={() => setEarlyOk(true)}>Fechar mesmo assim</Button>
            </ModalActions>

        }>
        
        {future ?
        <p className="text-sm text-text-secondary">
            Este atendimento é em {shortDate(sourceIso)}. Só dá para fechar no dia do atendimento ou depois. Para mudar o horário, use Remarcar; se o cliente desistiu, use Cancelar agendamento.
          </p> :

        <p className="text-sm text-text-secondary">
            Começa às {appointment.time} e agora são {NOW}. Feche antes do horário só se o atendimento já aconteceu (por exemplo, o cliente foi atendido mais cedo).
          </p>
        }
      </AppModal>);

  }

  const confirm = () => {
    if (paymentMissing) return;
    let bookedAppt: {id: string;iso: string;time: string;professional: string;} | null = null;
    const closingNote = note.trim();
    if (attended === 'sim') {
      setSubmitted(true);
      setPackageError(null);
      if (Object.values(errors).some(Boolean)) return;
      if (usingPackage) {
        const why = packageBlockReason(pkg, clientId, serviceLabel, sourceIso);
        if (why && !usable.some((p) => p.id === pkg)) {
          setPackageError(why);
          return;
        }
      }
      // B3: cria o horário do retorno ANTES de fechar; se a regra única recusar, nada é fechado.
      if (wantsBooking) {
        const r = tryAddAppointment({ client: appointment.clientName, service, professional: booking.professional, date: booking.date, time: booking.time, confirmed: bookingConfirmed });
        if (!r.ok) {
          setBookingError(r.message);
          return;
        }
        bookedAppt = { id: r.appt.id, iso: booking.date, time: booking.time, professional: booking.professional };
      }
      // F-052: consome UMA sessão (idempotente pelo atendimento). Se falhar, desfaz o retorno recém-criado e nada fecha.
      let pkgEntryId: string | null = null;
      if (usingPackage) {
        try {
          pkgEntryId = consumeSession(pkg, apptKey, sourceIso, clientId, serviceLabel).id;
        } catch (err) {
          if (bookedAppt) cancelAppointment(bookedAppt.iso, bookedAppt.id, 'Fechamento não concluído');
          setPackageError((err as Error).message);
          return;
        }
      }
      const label = serviceLabel;
      try {
        closeFinance({
          appointmentId: apptId,
          clientId,
          clientName: appointment.clientName,
          iso: appointment.iso ?? TODAY_ISO,
          time: appointment.time ?? '',
          service: label,
          payer: usingPackage ? 'particular' : payer,
          insurer: !usingPackage && payer === 'convenio' ? insurer : '',
          plan: !usingPackage && payer === 'convenio' ? plan.trim() : '',
          totalCents: usingPackage ? 0 : payer === 'particular' ? charged : gross,
          grossCents: usingPackage ? 0 : gross,
          discountCents: usingPackage || payer !== 'particular' ? 0 : discountCents,
          installments: !usingPackage && payer === 'particular' && !notPaid && method === 'credito' ? installmentsValid ? instNumber : 1 : null,
          depositIds: usingPackage || payer !== 'particular' ? [] : deposits.map((d) => d.id),
          depositCents: usingPackage ? 0 : depositTotal,
          coveredCents: !usingPackage && payer === 'convenio' ? coveredCents : 0,
          copayCents: !usingPackage && payer === 'convenio' ? copay : 0,
          copayPaid: !usingPackage && payer === 'convenio' ? copay === 0 || copayNow === 'sim' : true,
          copayMethod: !usingPackage && payer === 'convenio' && copay > 0 && copayNow === 'sim' ? copayMethod : null,
          claimStatus: !usingPackage && payer === 'convenio' ? claim : 'received',
          receivedCents: usingPackage ? 0 : payer === 'convenio' ? claim === 'received' ? parseMoney(claimReceived || moneyInput(coveredCents)) : 0 : notPaid ? 0 : charged,
          claimMethod: !usingPackage && payer === 'convenio' && claim === 'received' ? claimMethod : null,
          method: usingPackage ? null : payer === 'particular' && !notPaid ? method : null,
          // W5 (G16): "Ainda não pagou" = atendimento fechado, valor Em aberto (aparece em "A receber" na ficha).
          ...(!usingPackage && notPaid ? { particularOpen: true, paidIso: null } : {}),
          note: closingNote || undefined,
          packageSaleId: usingPackage ? pkg : null,
          packageEntryId: pkgEntryId
        });
        // W5 (G10, A4-02): o lançamento pendente do mesmo atendimento vira este fechamento (some de "Lançamentos").
        absorbAppointmentRecords(clientId, apptId, appointment.iso ?? TODAY_ISO, label);
      } catch (err) {
        if (pkgEntryId) reverseConsumption(pkg, pkgEntryId, 'Fechamento não concluído');
        if (bookedAppt) cancelAppointment(bookedAppt.iso, bookedAppt.id, 'Fechamento não concluído');
        setPackageError((err as Error).message);
        return;
      }
      // Retorno: registra a escolha (vale o procedimento realizado; prazo só deste cliente). Aula em grupo: sem retorno.
      if (!aula) registerClosure({
        clientName: appointment.clientName,
        iso: sourceIso,
        time: appointment.time ?? '',
        service: label,
        choice: ret,
        dueDays: ret === 'nao-marcado' && retNumber > 0 && retNumber !== defaultDays ? retNumber : null
      });
    }
    // F-043: a observação do fechamento fica no agendamento (também em falta); o pacote usado fica ligado ao atendimento.
    if (apptId && !aula) patchAppointment(sourceIso, apptId, { closingNote: closingNote || undefined, ...(usingPackage ? { packageSaleId: pkg } : {}) });
    onClosed?.(attended === 'sim');
    // W9b (J-07): o aviso segue o modo de envio salvo, como a frase dentro da janela (careLine).
    const retWho = mode === 'pausado' ? 'a mensagem fica pronta em Oportunidades para você mandar.' : mode === 'supervisionado' ? 'a mensagem aparece em Oportunidades para você aprovar.' : 'a Orniplaty cuida disso.';
    const retLine = attended === 'sim' && ret === 'nao-marcado' && retPlan && reminderOn ? ` Volta por volta de ${shortDate(retPlan.dueIso)}: ${retWho}` : '';
    const money = usingPackage ?
    `${appointment.clientName} · sessão do pacote de ${chosenPackage?.service_name_snapshot ?? serviceLabel}: R$ 0,00 nesta sessão, restam ${(chosenPackage?.saldo ?? 1) - 1}.` :
    payer === 'particular' && notPaid ?
    `${appointment.clientName} · ${brl(Math.max(0, remaining))} fica em aberto, em “A receber” na ficha${depositTotal > 0 ? ` (sinal de ${brl(depositTotal)} já recebido)` : ''}.` :
    payer === 'particular' ?
    `${appointment.clientName} · ${brl(charged)}${depositTotal > 0 ? ` (sinal de ${brl(depositTotal)} já recebido; ${brl(Math.max(0, remaining))} agora)` : ''} recebido via ${methodWithInstallments(method, Number(installments))}.` :
    `${appointment.clientName} · convênio ${insurer}: cobrança “${CLAIM_LABEL[claim]}”${claim === 'received' ? '' : ', nada foi marcado como recebido'}.${copay > 0 ? ` Coparticipação ${brl(copay)} ${copayNow === 'sim' ? 'recebida' : 'em aberto'}.` : ''}`;
    if (bookedAppt) {
      const b = bookedAppt;
      toast({
        title: `Atendimento fechado e retorno marcado para ${shortDate(b.iso)}, ${b.time}`,
        description: `${money} Retorno com ${proName(b.professional)}.`,
        action: {
          label: 'Desfazer',
          onClick: () => {
            // Decisão do Christian (21/10/2026): Desfazer tira SÓ o horário do retorno; o atendimento continua fechado.
            // G3 (F-046): o horário é CANCELADO com motivo e histórico, não apagado.
            cancelAppointment(b.iso, b.id, 'Retorno desfeito no fechamento');
            toast({
              title: 'Retorno desmarcado',
              description: reminderOn ? `O horário ficou cancelado, com o motivo registrado. A Orniplaty passa a cuidar da volta de ${who}.` : 'O horário ficou cancelado, com o motivo registrado. O atendimento continua fechado.'
            });
          }
        }
      });
    } else {
      toast({
        title: aula ? `Pagamento ${aulaWords.ofThe} salvo` : 'Atendimento fechado',
        description: attended !== 'sim' ? `Falta registrada para ${appointment.clientName}.${missedOn ? missedBooked ? ` ${missedBooked}` : ' A Orniplaty vai chamar para remarcar.' : ''}` : `${money}${retLine}`
      });
    }
    onClose();
  };

  const isSerieRunning = model === 'serie' && defaultPlan?.modelKind !== 'manutencao';
  const suggestionLine = existing ?
  `Já tem horário: ${shortDate(existing.iso)}, ${existing.a.start} com ${proName(existing.a.professionalId)}.` :
  !svc ?
  'Este procedimento não está no cadastro de serviços.' :
  model === 'serie' && !isSerieRunning && defaultDays ?
  `Sugerido pelo serviço: a série de ${serviceLabel} terminou; agora volta a cada ${durationText(defaultDays)}.` :
  `Sugerido pelo serviço: ${serviceReturnSentence(serviceLabel, svc.followUp)}`;
  const daysLabel = isSerieRunning ? `Daqui a quantos dias é a próxima sessão de ${who}?` : model === 'revisao' ? `Daqui a quantos dias é a revisão de ${who}?` : `Daqui a quantos dias ${who} deve voltar?`;
  const daysHelp =
  model === 'profissional' ?
  `O profissional decide. Vale só para ${who}.` :
  defaultDays ?
  `Mudar aqui vale só para ${who}. O serviço continua com ${durationText(defaultDays)}.` :
  `Vale só para ${who}.`;
  const dueLabel = retPlan ? `${isSerieRunning ? 'Próxima sessão' : model === 'revisao' ? 'Revisão' : 'Volta'} por volta de ${shortDate(retPlan.dueIso)}` : null;
  const careTitle = mode === 'pausado' ? 'A Orniplaty deixa as mensagens prontas para você' : mode === 'supervisionado' ? 'A Orniplaty prepara as mensagens para você' : 'A Orniplaty cuida disso para você';
  const careLine =
  mode === 'pausado' ?
  'Os envios estão pausados: a mensagem fica pronta em Oportunidades para você mandar.' :
  mode === 'supervisionado' ?
  'Os envios precisam da sua aprovação: cada mensagem aparece em Oportunidades para você aprovar.' :
  'Você não precisa fazer nada.';
  // W5 (A4-14): "Não marcado" só promete mensagem de retorno quando o serviço tem retorno e a automação está ligada.
  const noReturnModel = !!svc && (model === 'sem-retorno' || model === 'recorrente');
  const notMarkedText = noReturnModel ?
  'Nenhuma mensagem de retorno é enviada para este serviço.' :
  !reminderOn ?
  '“Lembrar o cliente de voltar” está desligada: ninguém será chamado.' :
  RETURN_OPTIONS.find((o) => o.value === 'nao-marcado')!.description;
  const returnOptions = RETURN_OPTIONS.map((o) => ({ ...o, description: o.value === 'nao-marcado' ? notMarkedText : o.description, badge: o.value === suggestedRet ? 'Sugerido' : undefined }));
  // W5 (A3-21): o horário que já está marcado pode estar em conflito (profissional arquivado, folga, horário da clínica…).
  const existingConflict = existing ? scheduleConflicts(getAgendaState()).find((c) => c.appt.id === existing.a.id) ?? null : null;
  const suggestedPrice = valueEdited && service ? priceInput(service) : '';
  const showPriceHint = !!suggestedPrice && parseMoney(suggestedPrice) !== gross;
  const packageOptions = [
  { value: '', title: 'Cobrar esta sessão', description: 'Particular ou convênio, como um atendimento avulso.' },
  ...usable.map((p) => ({
    value: p.id,
    title: `Usar sessão do pacote ${p.service_name_snapshot} (${p.saldo} ${p.saldo === 1 ? 'restante' : 'restantes'})`,
    description: `Vendido em ${shortDate(p.sold_at)}${p.expires_at ? ` · vale até ${shortDate(p.expires_at)}` : ''}. Esta sessão fica em R$ 0,00.`,
    badge: p.id === prelinkId ? 'Vinculado' : undefined
  }))];


  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="lg"
      title={aula ? `Pagamento ${aulaWords.ofThe}` : 'Fechar atendimento'}
      description={`${appointment.clientName} · ${appointment.service} · ${appointment.when}${appointment.professional ? ` · ${appointment.professional}` : ''}`}
      footer={
      <div className="flex flex-col gap-2">
          {paymentMissing &&
        <p id="fechar-pagamento-motivo" className="text-sm text-text-secondary sm:text-right">
              Escolha como foi o pagamento.
            </p>
        }
          <ModalActions equal={2}>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={confirm} disabled={paymentMissing} aria-describedby={paymentMissing ? 'fechar-pagamento-motivo' : undefined}>
              {aula ? 'Salvar pagamento' : wantsBooking ? 'Fechar e marcar retorno' : 'Fechar atendimento'}
            </Button>
          </ModalActions>
        </div>
      }>
      
      <div className="flex flex-col gap-5">
        {beforeStart && earlyOk &&
        <NoticeInline tone="info" title="Fechando antes do horário">
            O atendimento começa às {appointment.time}. Você confirmou que ele já aconteceu.
          </NoticeInline>
        }
        {!aula &&
        <div>
          {/* P4 (28/10/2026): `size="md"` + 2 colunas = um cartão por linha no celular (< 640 px), lado a lado acima; "Compareceu" não quebra no meio. */}
          <ChoiceCards label="O cliente compareceu?" columns={2} options={ATTENDED} value={attended} onChange={(v) => setAttended(v as 'sim' | 'nao')} />
          {attended === 'nao' &&
          <p className="mt-2 text-sm text-text-secondary">
              {missedOn ?
            missedBooked || 'A Orniplaty vai chamar para remarcar (no mesmo dia e no dia seguinte).' :
            'A campanha “Chamar quem faltou” está desligada em Automações: ninguém será chamado para remarcar.'}
              {prelinkId ? ' A falta não usa sessão do pacote vinculado.' : ''}
            </p>
          }
        </div>
        }

        {attended === 'sim' &&
        <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {!aula &&
            <Select
              label="Procedimento realizado"
              options={serviceOptions}
              value={service || undefined}
              onChange={(v) => {
                setService(v);
                // F-040: o valor segue o procedimento realizado enquanto não foi digitado à mão.
                if (!valueEdited) setValue(priceInput(v));
                // Vale o procedimento realizado: o Retorno passa a seguir o serviço novo.
                fillReturn(v, serviceOptions.find((o) => o.value === v)?.label ?? '');
              }} />

            }
              {!usingPackage &&
            <div>
                  <Input
                label="Valor do serviço"
                prefix="R$"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setValueEdited(true);
                }}
                inputMode="decimal"
                error={submitted ? errors.value : undefined}
                helperText={svc?.priceMode === 'sob-consulta' ? 'Serviço sob consulta: informe o valor combinado.' : undefined} />
              
                  {showPriceHint &&
              <p className="mt-1.5 text-sm text-text-secondary">
                      O preço de {serviceLabel} é {brl(parseMoney(suggestedPrice))}.{' '}
                      <Button
                  type="button"
                  size="sm"
                  variant="neutral"
                  className="ml-1 align-middle"
                  onClick={() => {
                    setValue(suggestedPrice);
                    setValueEdited(false);
                  }}>
                  
                        Usar este preço
                      </Button>
                    </p>
              }
                </div>
            }
            </div>

            {/* F-052: pacote do cliente para o serviço realizado */}
            {(prelinkBlock || usable.length > 0) &&
          <section aria-label="Pacote" className="flex flex-col gap-3">
                {prelinkBlock &&
            <>
                    <NoticeInline tone="warning" title="O pacote vinculado não pode cobrir esta sessão" role="alert">
                      {prelinkBlock} Escolha o que fazer. Nada é cobrado sem a sua escolha.
                    </NoticeInline>
                    <ChoiceCards
                label="O que fazer com esta sessão?"
                columns={2}
                options={[
                { value: 'outro', title: 'Usar outro pacote', description: usable.length ? 'Escolha abaixo um pacote que vale para este serviço.' : 'Este cliente não tem outro pacote que cubra este serviço.', disabled: usable.length === 0 },
                { value: 'avulso', title: 'Cobrar avulso', description: 'A sessão é cobrada como particular ou convênio. O valor pode ser editado.' }]
                }
                value={prelinkAction || undefined}
                onChange={(v) => {
                  setPrelinkAction(v as PrelinkAction);
                  setPkg(v === 'outro' ? usable[0]?.id ?? '' : '');
                }} />
              
                    {submitted && errors.prelink && <p className="text-sm text-error">{errors.prelink}</p>}
                    <p className="text-sm text-text-secondary">
                      Prefere decidir depois?{' '}
                      <Button type="button" size="sm" variant="neutral" className="align-middle" onClick={onClose}>
                        Desistir do fechamento
                      </Button>{' '}
                      (o agendamento continua como está).
                    </p>
                  </>
            }
                {usable.length > 0 && (!prelinkBlock || prelinkAction === 'outro') &&
            <ChoiceCards
              label="Pacote"
              columns={2}
              options={prelinkBlock ? packageOptions.filter((o) => o.value) : packageOptions}
              value={pkg}
              onChange={(v) => {
                setPkg(v);
                setPackageError(null);
              }} />

            }
                {submitted && errors.pkg && <p className="text-sm text-error">{errors.pkg}</p>}
                {packageError &&
            <NoticeInline tone="error" role="alert" title="Não foi possível usar o pacote">
                    {packageError}
                  </NoticeInline>
            }
              </section>
          }

            {!aula &&
          <div className="flex flex-col gap-3">
              <ChoiceCards
              label="Retorno"
              helperText="Quando este cliente deve voltar? A Orniplaty usa essa data para chamar o cliente na hora certa."
              columns={3}
              options={returnOptions}
              value={ret}
              onChange={(v) => {
                setRet(v as ReturnChoice);
                setBookingError(null);
              }} />
            
              <p className="text-sm text-text-secondary">{suggestionLine}</p>

              {/* W5 (A3-01): a frase segue a regra: com o retorno já marcado, a Orniplaty não precisa chamar o cliente. */}
              {ret === 'ja-marcado' && existing && !existingConflict && <p className="text-sm text-text-secondary">O retorno já está marcado: a Orniplaty não precisa chamar {who}.</p>}
              {existing && existingConflict &&
            <NoticeInline tone="warning" role="alert" title={`O horário de ${shortDate(existing.iso)}, ${existing.a.start} está em conflito`}>
                  {existingConflict.message} Ele continua marcado, mas precisa ser resolvido em Agenda › Conflitos a resolver.
                </NoticeInline>
            }

              {wantsBooking &&
            <Card padding="md" as="section" aria-label="Horário do retorno">
                  <p className="text-sm font-bold text-text-primary">Horário do retorno</p>
                  <p className="mt-0.5 text-sm text-text-secondary">Já vem com o mesmo profissional, na data de volta. Horários ocupados ficam indisponíveis, como na Agenda.</p>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Select
                  label="Profissional"
                  required
                  placeholder="Escolha quem atende"
                  options={professionalOptions}
                  value={booking.professional || undefined}
                  onChange={(v) => setBook({ professional: v })}
                  error={submitted ? errors.bookPro : undefined} />
                
                    <DateField
                  label="Data"
                  value={booking.date}
                  onChange={(v) => setBook({ date: v })}
                  helperText={bookingDay && !bookingDay.open ? `${wordsNow().The} está ${wordsNow().closed} nesta data.` : undefined}
                  error={submitted ? errors.bookDate : undefined} />
                
                    <TimeField
                  label="Horário"
                  required
                  value={booking.time}
                  onChange={(v) => setBook({ time: v })}
                  isTimeDisabled={booking.professional ? isTimeDisabled : undefined}
                  error={submitted ? errors.bookTime : undefined} />
                
                  </div>
                  {(bookingError ?? bookingConflict) &&
              <NoticeInline tone="warning" role="alert" title="Esse horário não pode ser usado" className="mt-4">
                      <p>{bookingError ?? bookingConflict}</p>
                    </NoticeInline>
              }
                  {booking.professional && booking.date && freeTimes.length > 0 &&
              <div className="mt-4">
                      <p className="mb-1.5 text-sm font-semibold text-text-secondary">Horários livres neste dia ({duration} min)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {freeTimes.map((t) =>
                  <Pill key={t} size="sm" selected={booking.time === t} onClick={() => setBook({ time: t })} className="tabular-nums">
                            {t}
                          </Pill>
                  )}
                      </div>
                    </div>
              }
                  {booking.professional && booking.date && freeTimes.length === 0 &&
              <p className="mt-4 text-sm font-semibold text-text-secondary">
                      {bookingDay && !bookingDay.open ? `${bookingDay.message} Escolha outra data.` : 'Sem horários livres para esse profissional neste dia. Escolha outra data ou outro profissional.'}
                    </p>
              }
                  <Checkbox
                className="mt-4"
                checked={bookingConfirmed}
                onChange={(v: boolean) => setBookingConfirmed(v)}
                label="O cliente já confirmou este horário"
                description="Sem esta marcação, o retorno fica “A confirmar”. Nenhuma mensagem é enviada por isso." />
              
                </Card>
            }

              {ret === 'nao-marcado' && svc && (model === 'sem-retorno' || model === 'recorrente') &&
            <p className="text-sm text-text-secondary">Este serviço não tem mensagens de retorno. Para a Orniplaty chamar o cliente, mude a resposta em Serviços e equipe.</p>
            }

              {ret === 'nao-marcado' && needsDays &&
            <Card padding="md" as="section" aria-label="Retorno não marcado">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
                    <Input
                  label={daysLabel}
                  required={model === 'profissional'}
                  inputMode="numeric"
                  suffix="dias"
                  value={retDays}
                  onChange={(e) => setRetDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  error={submitted ? errors.retDays : undefined}
                  fullWidth={false}
                  containerClassName="w-full sm:w-72" />
                
                    {dueLabel && <p className="text-sm font-semibold text-text-primary sm:pb-3">{dueLabel}</p>}
                  </div>
                  <p className="mt-1.5 text-sm text-text-secondary">{daysHelp}</p>

                  <div className="mt-4 border-t border-border pt-4">
                    {!reminderOn ?
                <NoticeInline tone="warning" title="A Orniplaty não vai chamar este cliente">
                        “Lembrar o cliente de voltar” está desligada em IA Orniplaty › Automações. Nenhuma mensagem será enviada para {who}.
                      </NoticeInline> :
                retPlan ?
                <>
                        <p className="text-sm font-bold text-text-primary">{careTitle}</p>
                        <p className="mb-3 mt-0.5 text-sm text-text-secondary">{careLine}</p>
                        <ReturnPlanTimeline plan={retPlan} mode={mode} />
                      </> :

                <p className="text-sm text-text-secondary">Informe em quantos dias {who} deve voltar para ver o que a Orniplaty vai fazer.</p>
                }
                  </div>
                </Card>
            }
            </div>
          }

            {usingPackage ?
          <Card padding="md" as="section" aria-label="Cobrança da sessão">
                <p className="text-sm font-bold text-text-primary">Cobrança desta sessão: R$ 0,00</p>
                <p className="mt-0.5 text-sm text-text-secondary">
                  Nenhum valor novo a receber: a sessão já foi paga no pacote. Ao fechar, o pacote de {chosenPackage?.service_name_snapshot} passa de {chosenPackage?.saldo} para {(chosenPackage?.saldo ?? 1) - 1}{' '}
                  {(chosenPackage?.saldo ?? 1) - 1 === 1 ? 'sessão restante' : 'sessões restantes'}.
                </p>
              </Card> :

          <>
                <div>
                  <PillGroup
                label="Quem paga"
                size="sm"
                options={PAYERS.map((p) => ({ ...p, disabled: p.value === 'convenio' && !!insuranceBlocked }))}
                value={payer}
                onChange={(v) => typeof v === 'string' && setPayer(v as Payer)} />
              
                  {insuranceBlocked && <p className="mt-1.5 text-sm text-text-secondary">Convênio indisponível: {insuranceBlocked}</p>}
                </div>

                {payer === 'particular' ?
            <div className="flex flex-col gap-4">
                    <PillGroup label="Pagamento" size="sm" options={YESNO} value={paidNow} onChange={(v) => typeof v === 'string' && setPaidNow(v as 'sim' | 'nao')} />
                    {notPaid &&
              <p className="text-sm text-text-secondary">
                        O atendimento fica fechado e o valor fica <span className="font-semibold text-text-primary">Em aberto</span>, em “A receber” na ficha de {who}. Quando {who} pagar, use “Registrar pagamento” na ficha.
                      </p>
              }
                    {paidNow === 'sim' &&
              <>
                    <div>
                      <PillGroup
                    label="Forma de pagamento"
                    size="sm"
                    options={methodOptions}
                    value={method}
                    onChange={(v) => {
                      if (typeof v !== 'string') return;
                      setMethod(v);
                      setInstallments('1');
                      setInstallmentsNotice(null);
                    }} />
                  
                      {savedMethods.length === 0 && <p className="mt-1.5 text-sm text-text-secondary">Nenhuma forma de pagamento salva em IA Orniplaty › Empresa: mostrando todas.</p>}
                    </div>
                    {method === 'credito' && (
                canInstall ?
                <Select
                  label="Parcelas"
                  options={Array.from({ length: maxInst }, (_, i) => ({ value: String(i + 1), label: i === 0 ? 'À vista' : `${i + 1}x` }))}
                  value={installments}
                  onChange={(v: string) => {
                    setInstallments(v);
                    setInstallmentsNotice(null);
                  }}
                  error={submitted ? errors.installments : undefined}
                  helperText={`Regra ${eff?.source.installments === 'servico' ? `de ${serviceLabel}` : 'da empresa'}: em até ${maxInst}x${
                  instRule?.interestFreeUpTo === 'todas' ? ', sem juros' : instRule?.interestFreeUpTo === 'nenhuma' ? ', com juros' : `, sem juros até ${instRule?.interestFreeUpTo}x`}. O valor das parcelas e os juros não são calculados aqui.`
                  } /> :


                <p className="text-sm text-text-secondary">Crédito só à vista para {serviceLabel || 'este serviço'} (regra de parcelamento).</p>)

                }
                    {method === 'credito' && installmentsNotice &&
                <p className="text-sm text-text-secondary" role="status">
                        {installmentsNotice}
                      </p>
                }
                    {discountPct > 0 && discRule &&
                <div className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-text-secondary">
                          Desconto à vista de {discountPct}% {discountEligible ? `no ${methodNames([method])}` : `só em ${methodNames(discRule.discountMethods)}`}
                          {discountEligible ? `: −${brl(Math.round(gross * discountPct / 100))}` : ''}. {discountOn && discountEligible ? 'Aplicado.' : 'Só entra se você aplicar.'}
                        </p>
                        {discountEligible &&
                  <Button size="sm" variant="secondary" onClick={() => setDiscountOn((v) => !v)}>
                            {discountOn ? 'Tirar desconto' : 'Aplicar desconto'}
                          </Button>
                  }
                      </div>
                }
                    </>
              }
                    {deposits.length > 0 ?
              <div className="text-sm text-text-secondary">
                        {deposits.map((d) =>
                <p key={d.id}>
                            Sinal recebido em {shortDate(d.iso)} · {brl(d.cents)} · {methodWithInstallments(d.method)}
                          </p>
                )}
                      </div> :
              configuredDeposit ?
              <p className="text-sm text-text-secondary">
                        {serviceLabel} pede sinal ({depositRule!.depositKind === 'fixo' ? brl(parseMoney(depositRule!.depositValue)) : `${depositRule!.depositValue}% do valor`}). Nenhum sinal recebido foi registrado para este atendimento, então nada é descontado.
                      </p> :
              null}
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-surface-muted px-3.5 py-3 text-sm tabular-nums" aria-label="Resumo da cobrança">
                      <dt className="text-text-secondary">Valor do serviço</dt>
                      <dd className="text-right text-text-primary">{brl(gross)}</dd>
                      {discountCents > 0 &&
                <>
                          <dt className="text-text-secondary">Desconto aplicado</dt>
                          <dd className="text-right text-text-primary">−{brl(discountCents)}</dd>
                        </>
                }
                      {depositTotal > 0 &&
                <>
                          <dt className="text-text-secondary">Sinal já recebido</dt>
                          <dd className="text-right text-text-primary">−{brl(depositTotal)}</dd>
                        </>
                }
                      {/* W5 (A4-17): "Recebido agora" no lugar de "A receber agora"; com "Ainda não pagou", o valor fica em aberto. */}
                      <dt className="font-semibold text-text-primary">Recebido agora</dt>
                      <dd className="text-right font-semibold text-text-primary">{brl(paidNow === 'sim' ? Math.max(0, remaining) : 0)}</dd>
                      {notPaid &&
                <>
                          <dt className="text-text-secondary">Fica em aberto</dt>
                          <dd className="text-right text-text-primary">{brl(Math.max(0, remaining))}</dd>
                        </>
                }
                    </dl>
                    {submitted && errors.deposit && <p className="text-sm text-error">{errors.deposit}</p>}
                  </div> :

            <fieldset className="flex flex-col gap-4 rounded-xl border border-border p-4">
                    <legend className="px-1 text-sm font-semibold text-text-primary">Dados do convênio</legend>
                    <p className="text-xs text-text-secondary">Fechar sob convênio NÃO marca a cobrança como paga. Ela fica acompanhada em Resultados › Recebimentos até a operadora repassar.</p>
                    {deposits.length > 0 &&
              <p className="text-xs text-text-secondary">O sinal de {brl(deposits.reduce((t, d) => t + d.cents, 0))} continua registrado em Recebimentos e não é descontado num fechamento sob convênio.</p>
              }
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Select
                  label="Convênio"
                  required
                  placeholder="Escolha o convênio"
                  options={insurerOptions.map((i) => ({ value: i, label: i }))}
                  value={insurer || undefined}
                  onChange={setInsurer}
                  error={submitted ? errors.insurer : undefined}
                  helperText="Lista salva em IA Orniplaty › Empresa › Convênio." />
                
                      <Input label="Plano (opcional)" value={plan} onChange={(e) => setPlan(e.target.value)} />
                      <Input label="Valor coberto pelo convênio" prefix="R$" inputMode="decimal" value={covered} onChange={(e) => setCovered(e.target.value)} error={submitted ? errors.covered : undefined} />
                      <div>
                        <p className="text-sm font-medium text-text-primary">Coparticipação do cliente</p>
                        <p className="mt-1.5 flex min-h-11 items-center rounded-button bg-surface-muted px-3.5 text-sm font-semibold tabular-nums text-text-primary">{brl(copay)}</p>
                      </div>
                    </div>

                    {copay > 0 &&
              <>
                        <PillGroup label="Coparticipação" size="sm" options={YESNO} value={copayNow} onChange={(v) => typeof v === 'string' && setCopayNow(v as 'sim' | 'nao')} />
                        {copayNow === 'sim' && <PillGroup label="Forma de pagamento da coparticipação" size="sm" options={methodOptions} value={copayMethod} onChange={(v) => typeof v === 'string' && setCopayMethod(v)} />}
                      </>
              }

                    <Select label="Situação da cobrança ao convênio" options={CLAIM_ORDER.map((s) => ({ value: s, label: CLAIM_LABEL[s] }))} value={claim} onChange={(v) => setClaim(v as ClaimStatus)} />
                    {claim === 'received' &&
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input label="Valor recebido do convênio" prefix="R$" inputMode="decimal" value={claimReceived || moneyInput(coveredCents)} onChange={(e) => setClaimReceived(e.target.value)} error={submitted ? errors.received : undefined} />
                        <PillGroup label="Como o repasse entrou" size="sm" options={METHODS} value={claimMethod} onChange={(v) => typeof v === 'string' && setClaimMethod(v)} />
                      </div>
              }
                  </fieldset>
            }
              </>
          }
          </>
        }

        <Textarea label="Observação (opcional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} helperText="Fica no histórico deste atendimento. Uso interno: não vai para o cliente." />
      </div>
    </AppModal>);

}