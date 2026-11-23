import React, { useEffect, useState } from 'react';
import { Button } from '../Button';
import { PillGroup } from '../Pill';
import { WhatsAppPreview } from '../atendente-ia/WhatsAppPreview';
import { DepositFields, DiscountFields, InstallmentFields } from '../atendente-ia/PaymentFields';
import { blankInstallmentRule, businessWordsOf } from '../../data/empresa';
import { insuranceApplies } from '../../data/segment';
import type { EmpresaConfig } from '../../data/empresa';
import {
  PASS_TO_TEAM,
  RULE_KEYS,
  RULE_TITLE,
  acceptsInsurance,
  defaultDeposit,
  defaultDiscount,
  defaultInstallments,
  defaultSummary,
  hasCredit,
  serviceAnswer,
  serviceQuestion } from
'../../data/paymentRules';
import type { InsuranceOverride, PayTopic, RuleKey, ServicePayment } from '../../data/paymentRules';
import type { ServiceItem } from '../../data/servicesStore';

/**
 * Serviços e equipe › serviço › aba "Pagamento" (Lote F, F2, decisões P1–P5 do Christian, 22/10/2026).
 * Quatro blocos iguais (Parcelamento · Desconto à vista · Sinal · Convênio): "Igual ao padrão" mostra o padrão em texto;
 * "Diferente neste serviço" mostra os MESMOS campos da Empresa, só para este serviço. O padrão nunca é editado aqui
 * (edição não duplicada): "Mudar o padrão" leva a IA Orniplaty › Empresa. Casos que bloqueiam mostram o motivo em texto.
 * Chegando pela pílula-link da Empresa (`?secao=pagamento`), destaca por 2,5 s o 1º bloco diferente (DS v3.13/v3.16).
 */
const YES_NO = [
{ value: 'nao', label: 'Não' },
{ value: 'sim', label: 'Sim' }];

const SAME_DIFF = [
{ value: 'padrao', label: 'Igual ao padrão' },
{ value: 'diferente', label: 'Diferente neste serviço' }];

const INSURANCE_DIFF = [
{ value: 'particular', label: 'Só particular' },
{ value: 'todos', label: 'Todos os convênios' },
{ value: 'alguns', label: 'Só alguns' }];

const TOPICS: {value: PayTopic;label: string;}[] = [
{ value: 'parcelar', label: 'Dá para parcelar?' },
{ value: 'desconto', label: 'Tem desconto?' },
{ value: 'sinal', label: 'Precisa de sinal?' },
{ value: 'convenio', label: 'Aceita convênio?' }];

const one = (v: string | string[]) => Array.isArray(v) ? v[0] : v;
const many = (v: string | string[]) => Array.isArray(v) ? v : [v];
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ServicePaymentTab({
  value,
  onChange,
  service,
  empresa,
  errors,
  arrival,
  onGoEmpresa











}: {value: ServicePayment;onChange: (v: ServicePayment) => void; /** O serviço como está no formulário (nome, preço e as exceções do rascunho). */service: ServiceItem; /** Empresa SALVA (o padrão). */empresa: EmpresaConfig;errors: Partial<Record<RuleKey, string>>; /** Chegou pela pílula-link (`?secao=pagamento`): destaca o 1º bloco diferente. */arrival?: boolean;onGoEmpresa: (campo: string) => void;}) {
  const w = businessWordsOf(empresa);
  const credit = hasCredit(empresa);
  const insurance = acceptsInsurance(empresa) && empresa.insurers.length > 0;
  // G4 · fechamento: no segmento sem convênio (ex.: Salão) o bloco e a pergunta somem, salvo se já há convênio salvo
  // (na empresa ou neste serviço): nada salvo é apagado.
  const showInsurance = insuranceApplies(empresa.segment, empresa.specialty, empresa.acceptsInsurance === 'sim' || empresa.insurers.length > 0 || value.insurance !== 'padrao');
  const topics = showInsurance ? TOPICS : TOPICS.filter((t) => t.value !== 'convenio');
  const noPrice = service.priceMode === 'sob-consulta';
  const [topic, setTopic] = useState<PayTopic>('parcelar');
  const [highlight, setHighlight] = useState<RuleKey | null>(null);

  const blocked = (k: RuleKey) => k === 'installments' && !credit || k === 'insurance' && !insurance;

  // Regra v3.13: rola até o bloco (centro), destaca 2,5 s e põe o foco no controle principal dele.
  useEffect(() => {
    if (!arrival) return;
    // Vindo da prontidão (regra com campo vazio): vai à regra com problema; senão, à 1ª regra diferente.
    const target =
    RULE_KEYS.find((k) => !blocked(k) && errors[k]) ?? RULE_KEYS.find((k) => !blocked(k) && value[k] !== 'padrao') ?? RULE_KEYS.find((k) => !blocked(k)) ?? 'installments';
    const t = window.setTimeout(() => {
      const el = document.getElementById(`sv-pag-${target}`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
      (el.querySelector('button:not([disabled])') as HTMLElement | null)?.focus({ preventScroll: true });
      setHighlight(target);
      window.setTimeout(() => setHighlight(null), 2500);
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival]);

  const set = <K extends RuleKey,>(k: K, v: ServicePayment[K]) => onChange({ ...value, [k]: v });

  /** "Diferente" começa com os valores do padrão (a pessoa muda só o que é diferente). Convênio começa no oposto do padrão. */
  const toggle = (k: RuleKey, diff: boolean) => {
    if (!diff) return set(k, 'padrao' as never);
    if (k === 'installments') set('installments', credit ? defaultInstallments(empresa.payment) : blankInstallmentRule());
    if (k === 'discount') set('discount', defaultDiscount(empresa.payment));
    if (k === 'deposit') set('deposit', { ...defaultDeposit(empresa.payment), depositKind: noPrice ? 'fixo' : empresa.payment.depositKind });
    if (k === 'insurance') set('insurance', empresa.payment.insuranceDefault === 'todos' ? 'particular' : 'todos');
  };

  const block = (k: RuleKey, body: React.ReactNode) => {
    if (k === 'insurance' && !showInsurance) return null;
    const isBlocked = blocked(k);
    const on = value[k] !== 'padrao';
    return (
      <section
        key={k}
        id={`sv-pag-${k}`}
        aria-label={RULE_TITLE[k]}
        className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors duration-300 motion-reduce:transition-none ${
        highlight === k ? 'border-primary bg-active-surface ring-1 ring-primary' : 'border-border bg-surface'}`
        }>
        
        {isBlocked ?
        <>
            <p className="text-sm font-semibold text-text-primary">{RULE_TITLE[k]}</p>
            <p className="text-sm text-text-secondary">
              {k === 'installments' ?
            `${capitalize(w.the)} não aceita cartão de crédito.` :
            acceptsInsurance(empresa) ?
            `${capitalize(w.the)} ainda não tem convênios na lista.` :
            `${capitalize(w.the)} não atende convênio.`}
            </p>
            <div>
              <Button size="sm" variant="neutral" onClick={() => onGoEmpresa(k === 'installments' ? 'formas-pagamento' : 'convenio')}>
                {k === 'installments' ? 'Ver formas de pagamento' : `Ver convênio ${w.of}`}
              </Button>
            </div>
          </> :

        <>
            <PillGroup label={RULE_TITLE[k]} size="sm" options={SAME_DIFF} value={on ? 'diferente' : 'padrao'} onChange={(v) => toggle(k, one(v) === 'diferente')} />
            {on ? body : <p className="text-sm text-text-secondary">{defaultSummary(k, empresa)}</p>}
            {on && errors[k] && k === 'insurance' &&
          <p role="alert" data-field-error="" className="text-sm font-semibold text-error">
                {errors[k]}
              </p>
          }
          </>
        }
      </section>);

  };

  const inst = value.installments === 'padrao' ? null : value.installments;
  const disc = value.discount === 'padrao' ? null : value.discount;
  const dep = value.deposit === 'padrao' ? null : value.deposit;
  const ins: InsuranceOverride = value.insurance;
  const insChoice = ins === 'padrao' ? null : typeof ins === 'object' ? 'alguns' : ins;

  const shownTopic: PayTopic = topics.some((t) => t.value === topic) ? topic : 'parcelar';
  const answer = serviceAnswer(shownTopic, { ...service, payment: value }, empresa) ?? PASS_TO_TEAM;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-secondary">Por padrão, este serviço segue as regras de pagamento {w.of}. Mude só o que for diferente.</p>
        <Button size="md" variant="secondary" className="shrink-0" onClick={() => onGoEmpresa('pagamento')}>
          Mudar o padrão
        </Button>
      </div>

      {block(
        'installments',
        inst &&
        <>
            <div>
              <p className="mb-2 text-sm font-semibold text-text-primary">Parcela no cartão de crédito?</p>
              <PillGroup size="sm" options={YES_NO} value={inst.installments} onChange={(v) => set('installments', { ...inst, installments: one(v) as 'sim' | 'nao' })} />
            </div>
            {inst.installments === 'sim' && <InstallmentFields idPrefix="sv-pag" rule={inst} error={errors.installments} onChange={(r) => set('installments', r)} />}
          </>

      )}

      {block(
        'discount',
        disc &&
        <>
            <div>
              <p className="mb-2 text-sm font-semibold text-text-primary">Dá desconto para pagamento à vista?</p>
              <PillGroup size="sm" options={YES_NO} value={disc.discount} onChange={(v) => set('discount', { ...disc, discount: one(v) as 'sim' | 'nao' })} />
            </div>
            {disc.discount === 'sim' && <DiscountFields idPrefix="sv-pag" payments={empresa.payments} rule={disc} error={errors.discount} onChange={(r) => set('discount', r)} />}
          </>

      )}

      {block(
        'deposit',
        dep &&
        <>
            <div>
              <p className="mb-2 text-sm font-semibold text-text-primary">Pede sinal para reservar o horário?</p>
              <PillGroup size="sm" options={YES_NO} value={dep.deposit} onChange={(v) => set('deposit', { ...dep, deposit: one(v) as 'sim' | 'nao' })} />
            </div>
            {dep.deposit === 'sim' && <DepositFields idPrefix="sv-pag" rule={dep} noPrice={noPrice} error={errors.deposit} onChange={(r) => set('deposit', r)} />}
          </>

      )}

      {block(
        'insurance',
        insChoice &&
        <>
            <PillGroup
            size="sm"
            label="Neste serviço"
            options={INSURANCE_DIFF}
            value={insChoice}
            onChange={(v) => {
              const c = one(v);
              set('insurance', c === 'alguns' ? { insurers: typeof ins === 'object' ? ins.insurers : [] } : c as 'particular' | 'todos');
            }} />
          
            {typeof ins === 'object' &&
          <PillGroup
            size="sm"
            label="Quais convênios?"
            multiple
            options={empresa.insurers.map((x) => ({ value: x, label: x }))}
            value={ins.insurers.filter((x) => empresa.insurers.includes(x))}
            onChange={(v) => set('insurance', { insurers: many(v) })} />

          }
          </>

      )}

      {/* Prévia: as perguntas citam o serviço e as respostas usam a regra que vale para ELE (effectivePayment). */}
      <div className="flex flex-col gap-3" data-guard-ignore="">
        <PillGroup label="Pergunta de exemplo" size="sm" options={topics} value={shownTopic} onChange={(v) => setTopic(one(v) as PayTopic)} />
        <div className="max-w-md">
          <WhatsAppPreview
            messages={[
            { from: 'client', text: serviceQuestion(shownTopic, service.name), time: '11:20' },
            { from: 'ai', time: '11:20', text: answer }]
            }
            caption={answer === PASS_TO_TEAM ? 'Sem esse dado preenchido, a assistente passa a pergunta para a sua equipe.' : undefined} />
          
        </div>
      </div>
    </div>);

}