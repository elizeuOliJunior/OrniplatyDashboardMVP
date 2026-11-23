import React, { useState } from 'react';
import { clinicPeriods, rangesText } from '../data/schedule';
import { markConfigured } from '../data/exampleRecords';
import type { ClinicHoursDay } from '../data/schedule';
import { NOW } from '../data/agendaStore';
import { ChevronRightIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { AtendenteIaLayout } from '../components/dashboard/AtendenteIaLayout';
import { Card, CardTitle, CardDescription, SocialIcon, clickableRowClass, clickableChevronClass } from '../components/Card';
import type { SocialIconType } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Textarea } from '../components/Textarea';
import { Pill, PillGroup } from '../components/Pill';
import { Button } from '../components/Button';
import { useToast } from '../components/ui/Toast';
import { focusField } from '../data/deepLinks';
import { useDraft } from '../components/ui/useDraft';
import { useGuardedNavigate } from '../components/ui/UnsavedChanges';
import { ExampleHint, FieldLabel, SectionCard, StickySaveBar } from '../components/atendente-ia/FormParts';
import { WhatsAppPreview } from '../components/atendente-ia/WhatsAppPreview';
import {
  HOW_TO_PAY_EXAMPLE,
  HOW_TO_PAY_MAX,
  INSURER_SUGGESTIONS,
  MAX_CUSTOM_LINKS,
  NO_SHOW_EXAMPLE,
  UF_OPTIONS,
  descriptionExample,
  empresaStore,
  segmentNoticeStore,
  formatAddress,
  isMapsLink,
  linkErrors,
  normalizeInstagram,
  paymentMethods } from
'../data/empresa';
import type { ClinicLinks, EmpresaConfig, PaymentDetails } from '../data/empresa';
import { SEGMENT_OPTIONS, SPECIALTY_OPTIONS, businessWords, hasSpecialty, insuranceApplies } from '../data/segment';
import { SegmentNotices } from '../components/atendente-ia/SegmentNotices';
import { lookupCep } from '../data/cep';
import { getServices, professionalLinkChanges, saveService, setCategories, setServiceActive, useServices } from '../data/servicesStore';
const getServicesNow = () => getServices().services;
import { activeServicesOf } from '../data/servicesStore';
import { isActiveMember, useTeam } from '../data/availability';
import { PASS_TO_TEAM, clinicAnswer, insuranceSummary, paymentErrors, paymentExceptions, serviceDifferences } from '../data/paymentRules';
import type { PayTopic } from '../data/paymentRules';
import { DepositFields, DiscountFields, ExceptionsBox, InstallmentFields } from '../components/atendente-ia/PaymentFields';
import { ServicoModal } from '../components/servicos/ServicoModal';
import { CategoriasModal } from '../components/servicos/CategoriasModal';
import { getAgendaState } from '../data/agendaLive';

/** Sequência para ids de links novos (dois cliques no mesmo milissegundo não repetem id). */
let linkSeq = 0;

type CepState = {tone: 'ok' | 'error' | 'idle';text: string;};

const PAY_TOPICS: {value: PayTopic;label: string;question: string;}[] = [
{ value: 'formas', label: 'Formas de pagamento', question: 'Quais formas de pagamento vocês aceitam?' },
{ value: 'parcelar', label: 'Dá para parcelar?', question: 'Dá para parcelar?' },
{ value: 'desconto', label: 'Tem desconto?', question: 'Tem desconto à vista?' },
{ value: 'sinal', label: 'Precisa de sinal?', question: 'Precisa pagar sinal para marcar?' },
{ value: 'convenio', label: 'Aceita convênio?', question: 'Vocês aceitam convênio?' }];

const YES_NO = [
{ value: 'nao', label: 'Não' },
{ value: 'sim', label: 'Sim' }];


function maskCep(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const one = (v: string | string[]) => Array.isArray(v) ? v[0] : v;
const many = (v: string | string[]) => Array.isArray(v) ? v : [v];

/** "segunda a sexta, 08:00 às 18:00" a partir do horário da clínica (Serviços e equipe › Funcionamento). */
function hoursSummary(hours: ClinicHoursDay[]) {
  // G3 (F-050): agrupa por todos os períodos do dia ("08:00 às 12:00 e 14:00 às 18:00").
  const open = hours.map((h, i) => ({ ...h, i, text: rangesText(clinicPeriods(h)).replace(/–/g, ' às ').replace(/, /g, ' e ') })).filter((h) => h.open);
  if (open.length === 0) return 'sem dias de atendimento';
  const name = (d: string) => d.replace('-feira', '').toLowerCase();
  const groups: {first: string;last: string;text: string;lastI: number;}[] = [];
  open.forEach((h) => {
    const g = groups[groups.length - 1];
    if (g && g.lastI === h.i - 1 && g.text === h.text) {
      g.last = h.day;
      g.lastI = h.i;
    } else groups.push({ first: h.day, last: h.day, text: h.text, lastI: h.i });
  });
  return groups.map((g) => `${g.first === g.last ? name(g.first) : `${name(g.first)} a ${name(g.last)}`}, ${g.text}`).join('; ');
}

/** Erros que não cabem no `useDraft` (pagamento, links, Maps): calculados do rascunho depois da 1ª tentativa de salvar. */
function extraErrors(d: EmpresaConfig): Record<string, string> {
  const e: Record<string, string> = { ...paymentErrors(d), ...linkErrors(d.links) };
  if (d.mapsLink.trim() && !isMapsLink(d.mapsLink)) e['endereco-maps'] = 'Cole o link de Compartilhar do Google Maps.';
  return e;
}

export function AtendenteIaEmpresa() {
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const { services, categories } = useServices();
  const { hours, members } = useTeam();
  /** Ajustes do Lote F: serviço aberto por cima da Empresa (aba Pagamento), sem trocar de tela. */
  const [serviceOpen, setServiceOpen] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const openedService = services.find((s) => s.id === serviceOpen) ?? null;
  /** "Mudar o padrão" dentro da janela: volta à regra aqui mesmo (rola e põe o foco). */
  // G2 (F-034): campo inexistente avisa ("Campo não encontrado") em vez de não fazer nada.
  const goToField = (campo: string) =>
  focusField(campo, { onMissing: () => toast({ title: 'Campo não encontrado', description: 'O atalho aponta para um campo que não existe nesta tela. Nada foi alterado.', tone: 'warning' }) });
  const [submitted, setSubmitted] = useState(false);
  const form = useDraft<EmpresaConfig>('ia-empresa', empresaStore.get(), {
    reload: () => empresaStore.get(),
    validate: (d) => {
      setSubmitted(true);
      const errs: Partial<Record<keyof EmpresaConfig, string>> = {};
      if (!d.name.trim()) errs.name = `Informe o nome ${businessWords(d.segment).of}.`;
      // Os erros de pagamento, links e Maps aparecem no próprio campo; aqui só impedem o salvar.
      if (Object.keys(extraErrors(d)).length > 0) errs.payment = 'Confira os campos marcados.';
      if (Object.keys(errs).length > 0)
      window.setTimeout(() => {
        const el = document.querySelector('main [aria-invalid="true"], main [data-field-error]') as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus?.({ preventScroll: true });
      }, 50);
      return errs;
    },
    onSaved: (d) => {
      // G4 (F-062): mudar o segmento com serviços cadastrados não mexe neles; mostra o aviso das áreas.
      const before = empresaStore.get().segment;
      const count = activeServicesOf(getServicesNow()).length;
      // Lote F (F4): o aviso da conversão aparece só até o primeiro salvar.
      empresaStore.set({ ...d, paymentNotice: undefined });
      if (before !== d.segment && count > 0) segmentNoticeStore.set({ ...segmentNoticeStore.get(), changedServices: count });
      setSubmitted(false);
      toast({ title: 'Alterações salvas', tone: 'success' });
    }
  });
  const { draft, set, errors } = form;
  const err = submitted ? extraErrors(draft) : {};
  const [cepState, setCepState] = useState<CepState>({ tone: 'idle', text: '' });
  const [newInsurer, setNewInsurer] = useState('');
  const [payTopic, setPayTopic] = useState<PayTopic>('formas');
  // Lote D: as palavras seguem o segmento escolhido aqui (clínica · empresa), antes mesmo de salvar.
  const w = businessWords(draft.segment);

  const setPay = <K extends keyof PaymentDetails,>(key: K, value: PaymentDetails[K]) => set('payment', { ...draft.payment, [key]: value });
  const setLinks = (patch: Partial<ClinicLinks>) => set('links', { ...draft.links, ...patch });
  const activeServices = activeServicesOf(services);

  const changeSegment = (v: string) => {
    set('segment', v);
    if (!hasSpecialty(v)) set('specialty', '');else
    if (!draft.specialty) set('specialty', 'outra');
  };

  // G4 (F-064): a busca de CEP consulta de verdade (mesma consulta pública do Onboarding) e só preenche o que voltou.
  // Sem resposta ou CEP desconhecido: diz isso e deixa o preenchimento manual (antes devolvia sempre o mesmo endereço).
  const searchCep = async () => {
    const digits = draft.cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepState({ tone: 'error', text: 'Confira o CEP: são necessários 8 números.' });
      return;
    }
    setCepState({ tone: 'idle', text: 'Buscando o endereço…' });
    const r = await lookupCep(digits);
    if (r.kind === 'ok') {
      set('street', r.street);
      set('district', r.district);
      set('city', r.city);
      set('uf', r.uf);
      setCepState({ tone: 'ok', text: 'Endereço encontrado. Confira os campos e complete o número.' });
    } else setCepState({ tone: 'error', text: r.kind === 'not-found' ? 'CEP não encontrado. Confira o número ou digite o endereço.' : 'A busca de CEP não respondeu agora. Preencha o endereço abaixo ou tente de novo.' });
  };

  const addInsurer = (name: string) => {
    const n = name.trim();
    if (!n || draft.insurers.some((i) => i.toLowerCase() === n.toLowerCase())) return;
    set('insurers', [...draft.insurers, n]);
  };

  const address = formatAddress(draft);
  const mapsOk = Boolean(draft.mapsLink.trim()) && isMapsLink(draft.mapsLink);
  const p = draft.payment;
  const hasCredit = draft.payments.includes('credito');
  // G4 · fechamento: convênio só onde se aplica ou quando já há convênio salvo (nada salvo é apagado ao trocar o segmento).
  const showInsurance = insuranceApplies(draft.segment, draft.specialty, draft.acceptsInsurance === 'sim' || draft.insurers.length > 0);
  const payTopics = showInsurance ? PAY_TOPICS : PAY_TOPICS.filter((t) => t.value !== 'convenio');
  const shownTopic: PayTopic = payTopics.some((t) => t.value === payTopic) ? payTopic : 'formas';
  const payQuestion = PAY_TOPICS.find((t) => t.value === shownTopic)!;
  // Lote F (F3): o padrão vem do rascunho; as exceções, dos serviços salvos (uma função só: effectivePayment).
  const payAnswer = clinicAnswer(shownTopic, draft, services) ?? PASS_TO_TEAM;
  const payExceptions = paymentExceptions(services, draft);
  const insurance = insuranceSummary(services, draft);

  const pricedCount = activeServices.filter((s) => s.priceMode !== 'sob-consulta').length;
  const proCount = members.filter(isActiveMember).length;
  const alsoUses = [
  { label: `${pricedCount} ${pricedCount === 1 ? 'serviço com preço' : 'serviços com preço'}`, to: '/servicos-equipe?aba=servicos' },
  { label: `${proCount} ${proCount === 1 ? 'profissional' : 'profissionais'}`, to: '/servicos-equipe?aba=equipe' },
  { label: `Atendimento: ${hoursSummary(hours)}`, to: '/servicos-equipe?aba=funcionamento' }];


  const fixedLinks: {key: 'instagram' | 'facebook' | 'site';type: SocialIconType;label: string;placeholder: string;tip: string;}[] = [
  { key: 'instagram', type: 'instagram', label: 'Instagram', placeholder: 'instagram.com/seuperfil', tip: `A assistente envia quando o cliente quer conhecer o espaço ou ver o trabalho ${w.of}.` },
  { key: 'facebook', type: 'facebook', label: 'Facebook', placeholder: 'facebook.com/suapagina', tip: `A assistente envia quando o cliente quer conhecer o espaço ou ver o trabalho ${w.of}.` },
  { key: 'site', type: 'site', label: 'Site', placeholder: 'www.seusite.com.br', tip: 'A assistente envia quando o cliente pede mais informações.' }];


  return (
    <AtendenteIaLayout activeTab="empresa">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          form.save();
        }}
        className="flex flex-col gap-6">
        
        {/* 1. Sobre a clínica */}
        <SectionCard id="sobre" title={`Sobre ${w.the}`} purpose={`A assistente usa isto para se apresentar e explicar o que ${w.the} faz.`}>
          <SegmentNotices onReviewAreas={() => setCategoriesOpen(true)} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <FieldLabel
                htmlFor="empresa-nome"
                tip={`Nome que a assistente usa para falar ${w.of}. Ex.: “Sou a Marina, da ${draft.name.trim() || 'sua empresa'}”. O nome da assistente fica em Como atender, e o nome no topo da conversa do cliente vem do seu perfil do WhatsApp Business.`}>
                
                Nome {w.of}
              </FieldLabel>
              <Input id="empresa-nome" value={draft.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <FieldLabel tip="Diz à assistente que tipo de negócio é e ajusta as palavras e os exemplos das telas. Não muda seus serviços.">
                Segmento
              </FieldLabel>
              <Select ariaLabel="Segmento" value={draft.segment} onChange={changeSegment} options={SEGMENT_OPTIONS} />
            </div>
            {hasSpecialty(draft.segment) &&
            <div>
                <FieldLabel tip="Orienta as sugestões de perguntas e instruções nas outras abas. Não muda seus serviços.">Especialidade</FieldLabel>
                <Select ariaLabel="Especialidade" value={draft.specialty || 'outra'} onChange={(v: string) => set('specialty', v)} options={SPECIALTY_OPTIONS} />
              </div>
            }
          </div>
          <div>
            <FieldLabel htmlFor="empresa-descricao" tip="A assistente usa a descrição para se apresentar e responder “o que vocês fazem?”.">
              Descrição
            </FieldLabel>
            <ExampleHint text={descriptionExample(draft)} current={draft.description} onUse={() => set('description', descriptionExample(draft))} />
            <Textarea
              id="empresa-descricao"
              rows={2}
              maxLength={300}
              showCount
              value={draft.description}
              onChange={(e) => set('description', e.target.value)} />
            
          </div>
        </SectionCard>

        {/* 2. Endereço (mesmo bloco do Onboarding) */}
        <SectionCard
          id="endereco"
          title="Endereço"
          purpose={`A assistente usa isto quando o cliente pergunta onde fica ${w.the}.`}
          aside={
          <WhatsAppPreview
            clinicName={draft.name}
            messages={[
            { from: 'client', text: `Onde fica ${w.the}?`, time: NOW },
            {
              from: 'ai',
              time: NOW,
              text: address ? `Estamos na ${address}.${mapsOk ? ' Quer que eu envie a localização?' : ''}` : 'Vou confirmar o endereço com a equipe e já te retorno.'
            }]
            }
            caption={address ? undefined : 'Sem endereço, a assistente passa a pergunta para a sua equipe.'} />

          }>
          
          <div>
            <FieldLabel htmlFor="endereco-cep" tip="Digite o CEP e busque: rua, bairro, cidade e UF são preenchidos para você conferir.">
              CEP
            </FieldLabel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <Input
                id="endereco-cep"
                inputMode="numeric"
                placeholder="Ex.: 13025-002"
                value={draft.cep}
                onChange={(e) => {
                  set('cep', maskCep(e.target.value));
                  setCepState({ tone: 'idle', text: '' });
                }}
                containerClassName="sm:max-w-[200px]"
                error={cepState.tone === 'error' ? cepState.text : undefined} />
              
              <Button type="button" variant="secondary" size="md" leftIcon={<SearchIcon className="h-4 w-4" />} onClick={searchCep} disabled={cepState.text === 'Buscando o endereço…'}>
                {cepState.text === 'Buscando o endereço…' ? 'Buscando…' : 'Buscar endereço'}
              </Button>
            </div>
            {(cepState.tone === 'ok' || cepState.tone === 'idle' && cepState.text) &&
            <p className="mt-2 text-sm text-text-secondary" role="status">
                {cepState.text}
              </p>
            }
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Input id="endereco-rua" label="Logradouro" value={draft.street} onChange={(e) => set('street', e.target.value)} />
            <Input id="endereco-numero" label="Número" value={draft.number} onChange={(e) => set('number', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id="endereco-complemento" label="Complemento (opcional)" placeholder="Ex.: sala 54" value={draft.complement} onChange={(e) => set('complement', e.target.value)} />
            <Input id="endereco-bairro" label="Bairro" value={draft.district} onChange={(e) => set('district', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Input id="endereco-cidade" label="Cidade" value={draft.city} onChange={(e) => set('city', e.target.value)} />
            <div id="endereco-uf">
              <Select label="UF" value={draft.uf} onChange={(v: string) => set('uf', v)} options={UF_OPTIONS} />
            </div>
          </div>
          <Input
            id="endereco-maps"
            label="Link do Google Maps (opcional)"
            type="url"
            placeholder="https://maps.app.goo.gl/…"
            helperText="Abra a localização no Maps e use Compartilhar → Copiar link."
            error={err['endereco-maps']}
            value={draft.mapsLink}
            onChange={(e) => set('mapsLink', e.target.value)} />
          
        </SectionCard>

        {/* 3. Pagamento e convênio (Lote E, E6; Lote F: padrão da empresa + diferente neste serviço, decisões P1–P6) */}
        <SectionCard
          id="pagamento"
          title={showInsurance ? 'Pagamento e convênio' : 'Pagamento'}
          purpose={showInsurance ? `A assistente usa isto para responder como o cliente pode pagar e se ${w.the} atende pelo plano dele.` : 'A assistente usa isto para responder como o cliente pode pagar.'}
          aside={
          <div className="flex flex-col gap-3">
              <PillGroup
              label="Pergunta de exemplo"
              size="sm"
              options={payTopics.map((t) => ({ value: t.value, label: t.label }))}
              value={shownTopic}
              onChange={(v) => setPayTopic(one(v) as PayTopic)} />
            
              <WhatsAppPreview
              clinicName={draft.name}
              messages={[
              { from: 'client', text: payQuestion.question, time: '11:20' },
              { from: 'ai', time: '11:20', text: payAnswer }]
              }
              caption={payAnswer === PASS_TO_TEAM ? 'Sem esse dado preenchido, a assistente passa a pergunta para a sua equipe.' : undefined} />
            
            </div>
          }>
          
          {/* 3.1 Formas de pagamento (P6: Pix, crédito, débito e dinheiro) */}
          <div id="formas-pagamento">
            <FieldLabel tip="A assistente responde sobre pagamento só com o que estiver marcado e preenchido aqui.">Formas de pagamento</FieldLabel>
            <PillGroup multiple size="sm" options={paymentMethods} value={draft.payments} onChange={(value) => set('payments', many(value))} />
          </div>

          {/* 3.2 Regras que valem para todos os serviços (a exceção mora no serviço, aba Pagamento) */}
          <div className="flex flex-col gap-5 border-t border-border pt-5">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Regras que valem para todos os serviços</h3>
              <p className="mt-0.5 text-sm text-text-secondary">Você pode mudar em cada serviço, na aba Pagamento.</p>
            </div>

            {hasCredit &&
            <div className="flex flex-col gap-4">
                <div>
                  <FieldLabel tip="A assistente informa estas condições quando o cliente pergunta se dá para parcelar.">Parcela no cartão de crédito?</FieldLabel>
                  <PillGroup size="sm" options={YES_NO} value={p.installments} onChange={(v) => setPay('installments', one(v) as 'sim' | 'nao')} />
                </div>
                {p.installments === 'sim' &&
              <InstallmentFields
                idPrefix="pagamento"
                rule={{ installments: p.installments, maxInstallments: p.maxInstallments, interestFreeUpTo: p.interestFreeUpTo }}
                error={err['pagamento-vezes']}
                onChange={(r) => set('payment', { ...p, ...r })} />

              }
              </div>
            }

            <div className="flex flex-col gap-4">
              <div>
                <FieldLabel>Dá desconto para pagamento à vista?</FieldLabel>
                <PillGroup size="sm" options={YES_NO} value={p.discount} onChange={(v) => setPay('discount', one(v) as 'sim' | 'nao')} />
              </div>
              {p.discount === 'sim' &&
              <DiscountFields
                idPrefix="pagamento"
                payments={draft.payments}
                rule={{ discount: p.discount, discountPercent: p.discountPercent, discountMethods: p.discountMethods }}
                error={err['pagamento-desconto']}
                onChange={(r) => set('payment', { ...p, ...r })} />

              }
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <FieldLabel tip="A assistente só informa esta regra. Ela não cobra, não manda chave Pix sozinha e não confirma pagamento: isso é com a sua equipe.">
                  Pede sinal para reservar o horário?
                </FieldLabel>
                <PillGroup size="sm" options={YES_NO} value={p.deposit} onChange={(v) => setPay('deposit', one(v) as 'sim' | 'nao')} />
              </div>
              {p.deposit === 'sim' &&
              <DepositFields
                idPrefix="pagamento"
                rule={{ deposit: p.deposit, depositKind: p.depositKind, depositValue: p.depositValue }}
                error={err['pagamento-sinal']}
                onChange={(r) => set('payment', { ...p, ...r })} />

              }
            </div>

            {/* Ajustes do Lote F: quadro com o que muda em cada serviço; a linha abre o serviço POR CIMA desta tela. */}
            <ExceptionsBox
              title={`Serviços com regra diferente (${payExceptions.length})`}
              description="Estes serviços não seguem as regras acima. Clique para ver ou mudar no serviço."
              rows={payExceptions.map((s) => ({ id: s.id, name: s.name, detail: serviceDifferences(s, draft).join(' · ') }))}
              empty="Todos os serviços seguem estas regras."
              onOpen={setServiceOpen} />
            
          </div>

          {/* 3.3 Como o cliente paga (P4: um campo só) */}
          <div className="border-t border-border pt-5">
            <FieldLabel htmlFor="pagamento-como" optional tip="Como o pagamento acontece na prática: onde paga, quando e como a equipe combina o sinal.">
              Como o cliente paga
            </FieldLabel>
            <ExampleHint text={HOW_TO_PAY_EXAMPLE} current={draft.payment.howToPay} onUse={() => setPay('howToPay', HOW_TO_PAY_EXAMPLE)} />
            <Textarea
              id="pagamento-como"
              rows={2}
              maxLength={HOW_TO_PAY_MAX}
              showCount
              value={p.howToPay}
              helperText={draft.paymentNotice}
              onChange={(e) => setPay('howToPay', e.target.value)} />
            
            <p className="mt-2 text-sm text-text-secondary">A assistente explica as regras. Ela não cobra, não manda chave Pix sozinha e não confirma pagamento: isso é com a sua equipe.</p>
          </div>

          {/* 3.4 Convênio (P5: lista e padrão aqui; exceção no serviço). G4 (F-062): só onde se aplica (Clínica, Consultório) ou
               quando já existe convênio salvo; trocar o segmento nunca apaga a lista. */}
          {showInsurance &&
          <div id="convenio" className="flex flex-col gap-5 border-t border-border pt-5">
            <div>
              <FieldLabel tip="Convênio é quem paga o atendimento, não uma forma de pagamento. A assistente só confirma convênios desta lista.">
                {capitalize(w.the)} atende convênio?
              </FieldLabel>
              <PillGroup size="sm" options={YES_NO} value={draft.acceptsInsurance} onChange={(v) => set('acceptsInsurance', one(v) as 'sim' | 'nao')} />
            </div>
            {draft.acceptsInsurance === 'sim' &&
            <>
                <div>
                  <FieldLabel htmlFor="convenio-novo" tip="A assistente responde sobre convênio com base nesta lista. Para tirar um convênio, clique nele.">
                    Quais convênios?
                  </FieldLabel>
                  {draft.insurers.length > 0 &&
                <div className="mb-3 flex flex-wrap gap-2">
                      {draft.insurers.map((name) =>
                  <Pill key={name} size="sm" selected aria-label={`Remover ${name}`} onClick={() => set('insurers', draft.insurers.filter((i) => i !== name))}>
                          {name}
                        </Pill>
                  )}
                    </div>
                }
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <Input
                    id="convenio-novo"
                    placeholder="Nome do convênio"
                    value={newInsurer}
                    onChange={(e) => setNewInsurer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addInsurer(newInsurer);
                        setNewInsurer('');
                      }
                    }}
                    containerClassName="sm:max-w-xs" />
                  
                    <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      addInsurer(newInsurer);
                      setNewInsurer('');
                    }}>
                    
                      Adicionar
                    </Button>
                  </div>
                  {INSURER_SUGGESTIONS.some((s) => !draft.insurers.includes(s)) &&
                <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-text-muted">Exemplos:</span>
                      {INSURER_SUGGESTIONS.filter((s) => !draft.insurers.includes(s)).map((s) =>
                  <Pill key={s} size="sm" addable onClick={() => addInsurer(s)}>
                          {s}
                        </Pill>
                  )}
                    </div>
                }
                </div>
                <div>
                  <FieldLabel tip="Vale para todo serviço novo. Em cada serviço você pode mudar na aba Pagamento.">Por padrão, os serviços atendem convênio?</FieldLabel>
                  <PillGroup
                  size="sm"
                  options={[
                  { value: 'todos', label: 'Sim, todos' },
                  { value: 'marcados', label: 'Não, só os que eu marcar no serviço' }]
                  }
                  value={p.insuranceDefault}
                  onChange={(v) => setPay('insuranceDefault', one(v) as 'todos' | 'marcados')} />
                
                </div>
                <ExceptionsBox
                title={`Atendem convênio: ${insurance.attending} de ${insurance.total} ${insurance.total === 1 ? 'serviço' : 'serviços'}`}
                description="Estes serviços não seguem o padrão de convênio. Clique para ver ou mudar no serviço."
                rows={insurance.exceptions.map((s) => ({ id: s.id, name: s.name, detail: serviceDifferences(s, draft, ['insurance']).join(' · ') }))}
                empty={`Atendem convênio: ${insurance.attending} de ${insurance.total} ${insurance.total === 1 ? 'serviço' : 'serviços'}. Todos seguem o padrão.`}
                onOpen={setServiceOpen} />
              
                <p className="text-sm text-text-secondary">A assistente diz que atende o convênio, mas não promete cobertura: quem confirma é a equipe.</p>
              </>
            }
          </div>
          }
        </SectionCard>

        {/* 4. Regras da clínica */}
        <SectionCard
          id="regras"
          title={`Regras ${w.of}`}
          purpose="A assistente usa isto quando o cliente quer cancelar, remarcar ou pergunta o que acontece se faltar."
          aside={
          <WhatsAppPreview
            clinicName={draft.name}
            messages={[
            { from: 'client', text: 'Posso cancelar amanhã?', time: '15:40' },
            {
              from: 'ai',
              time: '15:40',
              text: draft.cancellationPolicy.trim() ?
              `Pode sim. ${draft.cancellationPolicy.trim()} Quer que eu cancele ou prefere remarcar?` :
              'Vou confirmar a regra de cancelamento com a equipe e já te retorno.'
            },
            // G1 subetapa 4 (F-012): a prévia lê a política de falta; sem ela, a assistente não inventa multa e passa para a equipe.
            { from: 'client', text: 'Faltei, e agora?', time: '15:42' },
            {
              from: 'ai',
              time: '15:42',
              text: draft.noShowPolicy.trim() ?
              `${draft.noShowPolicy.trim()} Quer que eu veja um novo horário?` :
              'Vou confirmar com a equipe o que acontece nesse caso e já te retorno. Quer que eu veja um novo horário?'
            }]
            } />

          }>
          
          <div>
            <FieldLabel htmlFor="politica-cancelamento" tip="A assistente informa esta regra quando o cliente quer cancelar ou remarcar.">
              Política de cancelamento
            </FieldLabel>
            <Textarea id="politica-cancelamento" rows={2} value={draft.cancellationPolicy} onChange={(e) => set('cancellationPolicy', e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="politica-falta" optional tip="O que acontece quando o cliente falta sem avisar. A assistente só fala disso se estiver escrito aqui.">
              Política de falta
            </FieldLabel>
            <ExampleHint text={NO_SHOW_EXAMPLE} current={draft.noShowPolicy} onUse={() => set('noShowPolicy', NO_SHOW_EXAMPLE)} />
            <Textarea id="politica-falta" rows={2} value={draft.noShowPolicy} onChange={(e) => set('noShowPolicy', e.target.value)} />
          </div>
        </SectionCard>

        {/* 5. Links da clínica (Lote E, E5, decisão D4). Ajustes do Lote F (22/10/2026): "Público atendido" saiu de vez
             (decisão do Christian); o cartão ficou só com os links. */}
        <SectionCard
          id="links"
          title={`Links ${w.of}`}
          purpose="A assistente usa isto para mandar o cliente que quer conhecer mais."
          aside={
          <WhatsAppPreview
            clinicName={draft.name}
            messages={[
            { from: 'client', text: 'Vocês têm Instagram?', time: '16:02' },
            {
              from: 'ai',
              time: '16:02',
              text: draft.links.instagram.trim() ? `Temos sim: ${normalizeInstagram(draft.links.instagram)}` : 'Vou pedir para a equipe te mandar.'
            }]
            } />

          }>
          
          <fieldset className="flex flex-col gap-4">
            <legend className="sr-only">Links {w.of}</legend>
            {fixedLinks.map((l) =>
            <div key={l.key}>
                <FieldLabel htmlFor={`link-${l.key}`} tip={l.tip}>
                  {l.label}
                </FieldLabel>
                <div className="flex items-start gap-3">
                  <span className="flex h-11 shrink-0 items-center">
                    <SocialIcon type={l.type} />
                  </span>
                  <Input
                  id={`link-${l.key}`}
                  containerClassName="min-w-0 flex-1"
                  placeholder={l.placeholder}
                  value={draft.links[l.key]}
                  error={err[`link-${l.key}`]}
                  onChange={(e) => setLinks({ [l.key]: e.target.value } as Partial<ClinicLinks>)}
                  onBlur={l.key === 'instagram' ? () => setLinks({ instagram: draft.links.instagram.trim() ? normalizeInstagram(draft.links.instagram) : '' }) : undefined} />
                
                </div>
              </div>
            )}

            <div>
              <FieldLabel optional tip="Dê um nome que diga o que tem no link. A assistente usa o nome para saber quando enviar.">
                Outros links
              </FieldLabel>
              {draft.links.custom.length > 0 &&
              <ul className="flex flex-col gap-3">
                  {draft.links.custom.map((c, i) =>
                <li key={c.id} className="flex items-start gap-3">
                      <span className="flex h-11 shrink-0 items-center">
                        <SocialIcon type="link" />
                      </span>
                      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                        <Input
                      id={`link-${c.id}-nome`}
                      aria-label={`Nome do link ${i + 1}`}
                      placeholder="Nome (ex.: Tabela de pacotes)"
                      maxLength={40}
                      value={c.label}
                      error={err[`link-${c.id}-nome`]}
                      onChange={(e) => setLinks({ custom: draft.links.custom.map((x) => x.id === c.id ? { ...x, label: e.target.value } : x) })} />
                    
                        <Input
                      id={`link-${c.id}-url`}
                      aria-label={`Endereço do link ${i + 1}`}
                      placeholder="Endereço do link"
                      value={c.url}
                      error={err[`link-${c.id}-url`]}
                      onChange={(e) => setLinks({ custom: draft.links.custom.map((x) => x.id === c.id ? { ...x, url: e.target.value } : x) })} />
                    
                      </div>
                      <span className="flex h-11 shrink-0 items-center">
                        <Button
                      type="button"
                      size="sm"
                      variant="neutral"
                      aria-label={`Remover o link ${c.label.trim() || i + 1}`}
                      className="px-2"
                      onClick={() => setLinks({ custom: draft.links.custom.filter((x) => x.id !== c.id) })}>
                      
                          <Trash2Icon className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </span>
                    </li>
                )}
                </ul>
              }
              <div className={`flex flex-col gap-2 sm:flex-row sm:items-center ${draft.links.custom.length > 0 ? 'mt-3' : ''}`}>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  leftIcon={<PlusIcon className="h-4 w-4" />}
                  disabled={draft.links.custom.length >= MAX_CUSTOM_LINKS}
                  aria-describedby={draft.links.custom.length >= MAX_CUSTOM_LINKS ? 'links-limite' : undefined}
                  onClick={() => setLinks({ custom: [...draft.links.custom, { id: `l${Date.now().toString(36)}${(linkSeq++).toString(36)}`, label: '', url: '' }] })}>
                  
                  Adicionar link
                </Button>
                {draft.links.custom.length >= MAX_CUSTOM_LINKS &&
                <span id="links-limite" className="text-sm text-text-secondary">
                    Máximo de {MAX_CUSTOM_LINKS} links.
                  </span>
                }
              </div>
            </div>
          </fieldset>
        </SectionCard>

        {/* 6. O que a assistente também usa (somente leitura, calculado de Serviços e equipe; Lote E, E8) */}
        <Card variant="muted" padding="lg" as="section" aria-labelledby="tambem-usa-titulo">
          <CardTitle as="h2" id="tambem-usa-titulo">
            O que a assistente também usa
          </CardTitle>
          <CardDescription>Serviços, preços, profissionais e horários vêm de Serviços e equipe. Não precisa repetir aqui.</CardDescription>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {alsoUses.map((x) =>
            <li key={x.to}>
                <button type="button" className={clickableRowClass} onClick={() => navigate(x.to)}>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-text-primary">{x.label}</span>
                  <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                </button>
              </li>
            )}
          </ul>
        </Card>
      </form>

      {/* G1 (F-055): o aviso geral da validação agora aparece de fato. */}
      <StickySaveBar onSave={() => form.save()} error={errors.payment ?? errors.name} saveError={form.saveError} />

      <ServicoModal
        open={!!openedService}
        onClose={() => setServiceOpen(null)}
        editing={openedService}
        initialTab="pagamento"
        categories={categories}
        services={services}
        members={members}
        hasHistory={(id) => {
          const name = services.find((s) => s.id === id)?.name ?? '';
          return Object.values(getAgendaState().appointments).some((list) => list.some((a) => a.service === name));
        }}
        onManageCategories={() => setCategoriesOpen(true)}
        onSave={(s) => {
          const prosChanged = professionalLinkChanges(s);
          saveService(s);
          markConfigured('servico', s.id);
          prosChanged.forEach((id) => markConfigured('profissional', id));
          toast({ title: 'Serviço atualizado', description: 'As regras de pagamento deste serviço já valem para a assistente.' });
        }}
        onArchive={(id, active) => {
          setServiceActive(id, active);
          markConfigured('servico', id);
          toast({ title: active ? 'Serviço reativado' : 'Serviço arquivado', tone: 'info' });
        }}
        onGoDefault={goToField} />
      
      <CategoriasModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        categories={categories}
        services={services}
        onSave={(list) => {
          setCategories(list);
          toast({ title: 'Categorias salvas' });
        }} />
      
    </AtendenteIaLayout>);

}