/**
 * Pagamento e convênio: "padrão da empresa + diferente neste serviço" (Lote F, 22/10/2026, decisões P1–P6 do Christian).
 *
 * - O PADRÃO mora em IA Orniplaty › Empresa (`EmpresaConfig.payment`, `payments`, `acceptsInsurance`, `insurers`).
 * - A EXCEÇÃO mora no serviço (`ServiceItem.payment`), regra por regra: 'padrao' ou o valor próprio.
 * - `effectivePayment(service, empresa)` é a ÚNICA função que diz a regra que vale para um serviço. Prévias da Empresa e do
 *   serviço, "Testar como cliente", "Gerar sugestão" (Como atender), resumos de exceção e prontidão usam só ela.
 *   Não calcular em outro lugar.
 * - A assistente explica as regras. Ela não cobra, não manda chave Pix sozinha e não confirma pagamento (no backend lido,
 *   origin/main 3186399, quem confirma que o dinheiro entrou é uma pessoa da equipe).
 *
 * CONTRATO NOVO: nada disto existe no backend. Hoje só `Tenant.formas_pagamento` (texto de 200) e o prompt lê só esse texto;
 * do serviço a IA lê só "nome: R$ preço (duração) — descrição".
 *
 * Este arquivo só IMPORTA TIPOS de servicesStore (servicesStore importa `blankServicePayment` daqui).
 */
import { blankDepositRule, blankDiscountRule, blankInstallmentRule, businessWordsOf, formatBRLValue, paymentMethods, paymentSentence, toNumberBR } from './empresa';
import type { DepositRule, DiscountRule, EmpresaConfig, InstallmentRule, PaymentDetails } from './empresa';
import type { ServiceItem } from './servicesStore';
import { activeServicesOf } from './activeServices';

/* ───────────── tipos ───────────── */

export type InsuranceOverride = 'padrao' | 'particular' | 'todos' | {insurers: string[];};

/** CONTRATO NOVO: exceções de pagamento do serviço. */
export type ServicePayment = {
  installments: 'padrao' | InstallmentRule;
  discount: 'padrao' | DiscountRule;
  deposit: 'padrao' | DepositRule;
  insurance: InsuranceOverride;
};

export const blankServicePayment = (): ServicePayment => ({ installments: 'padrao', discount: 'padrao', deposit: 'padrao', insurance: 'padrao' });

export type RuleKey = 'installments' | 'discount' | 'deposit' | 'insurance';
export const RULE_KEYS: RuleKey[] = ['installments', 'discount', 'deposit', 'insurance'];
export const RULE_TITLE: Record<RuleKey, string> = {
  installments: 'Parcelamento',
  discount: 'Desconto à vista',
  deposit: 'Sinal',
  insurance: 'Convênio'
};

/** Quanto do convênio vale de fato para um serviço. */
export type InsuranceMode = 'nao-atende' | 'particular' | 'todos' | 'alguns';
export type EffectiveInsurance = {mode: InsuranceMode;insurers: string[];};

export type EffectivePayment = {
  /** null = a empresa não aceita cartão de crédito (não existe parcelamento). */
  installments: InstallmentRule | null;
  discount: DiscountRule;
  deposit: DepositRule;
  insurance: EffectiveInsurance;
  /** De onde veio cada regra (só regras que se aplicam; bloqueadas contam como 'padrao'). */
  source: Record<RuleKey, 'padrao' | 'servico'>;
};

type Empresa = Pick<EmpresaConfig, 'payments' | 'payment' | 'acceptsInsurance' | 'insurers'>;
type Service = Pick<ServiceItem, 'id' | 'name' | 'priceMode' | 'price' | 'active' | 'payment'>;

/* ───────────── regra que vale (fonte única) ───────────── */

export const hasCredit = (e: Pick<EmpresaConfig, 'payments'>) => e.payments.includes('credito');
export const acceptsInsurance = (e: Pick<EmpresaConfig, 'acceptsInsurance' | 'insurers'>) => e.acceptsInsurance === 'sim';

export const defaultInstallments = (p: PaymentDetails): InstallmentRule => ({ installments: p.installments, maxInstallments: p.maxInstallments, interestFreeUpTo: p.interestFreeUpTo });
export const defaultDiscount = (p: PaymentDetails): DiscountRule => ({ discount: p.discount, discountPercent: p.discountPercent, discountMethods: [...p.discountMethods] });
export const defaultDeposit = (p: PaymentDetails): DepositRule => ({ deposit: p.deposit, depositKind: p.depositKind, depositValue: p.depositValue });

function insuranceOf(o: InsuranceOverride, e: Empresa): EffectiveInsurance {
  if (!acceptsInsurance(e)) return { mode: 'nao-atende', insurers: [] };
  const all = e.insurers;
  const resolved: InsuranceOverride = o === 'padrao' ? e.payment.insuranceDefault === 'todos' ? 'todos' : 'particular' : o;
  if (resolved === 'particular') return { mode: 'particular', insurers: [] };
  if (resolved === 'todos') return all.length ? { mode: 'todos', insurers: [...all] } : { mode: 'particular', insurers: [] };
  // "Só alguns": só os que ainda estão na lista da Empresa
  const some = (resolved as {insurers: string[];}).insurers.filter((x) => all.includes(x));
  return some.length ? { mode: some.length === all.length ? 'todos' : 'alguns', insurers: some } : { mode: 'particular', insurers: [] };
}

export function effectivePayment(s: Pick<Service, 'payment'>, e: Empresa): EffectivePayment {
  const o = s.payment ?? blankServicePayment();
  const credit = hasCredit(e);
  const ins = acceptsInsurance(e);
  return {
    installments: credit ? o.installments === 'padrao' ? defaultInstallments(e.payment) : o.installments : null,
    discount: o.discount === 'padrao' ? defaultDiscount(e.payment) : o.discount,
    deposit: o.deposit === 'padrao' ? defaultDeposit(e.payment) : o.deposit,
    insurance: insuranceOf(o.insurance, e),
    source: {
      installments: credit && o.installments !== 'padrao' ? 'servico' : 'padrao',
      discount: o.discount !== 'padrao' ? 'servico' : 'padrao',
      deposit: o.deposit !== 'padrao' ? 'servico' : 'padrao',
      insurance: ins && o.insurance !== 'padrao' ? 'servico' : 'padrao'
    }
  };
}

/** Serviços ativos que têm a regra `key` diferente do padrão (bloqueadas não contam). */
export function exceptionsOf(key: RuleKey, services: Service[], e: Empresa) {
  return services.filter((s) => s.active && effectivePayment(s, e).source[key] === 'servico');
}

/** Serviços ativos que fogem de QUALQUER uma das 3 regras de pagamento (parcelamento, desconto, sinal), sem repetir. */
export function paymentExceptions(services: Service[], e: Empresa) {
  return services.filter((s) => s.active && (['installments', 'discount', 'deposit'] as RuleKey[]).some((k) => effectivePayment(s, e).source[k] === 'servico'));
}

/** Convênio: quantos serviços ativos atendem e quais fogem do padrão. */
export function insuranceSummary(services: Service[], e: Empresa) {
  const active = activeServicesOf(services);
  const attending = active.filter((s) => {
    const m = effectivePayment(s, e).insurance.mode;
    return m === 'todos' || m === 'alguns';
  });
  return { attending: attending.length, total: active.length, exceptions: exceptionsOf('insurance', services, e) };
}

/* ───────────── validação (Empresa e serviço usam as mesmas) ───────────── */

export function installmentError(r: InstallmentRule): string | undefined {
  return r.installments === 'sim' && !r.maxInstallments ? 'Escolha em até quantas vezes.' : undefined;
}
export function discountError(r: DiscountRule): string | undefined {
  if (r.discount !== 'sim') return undefined;
  const n = toNumberBR(r.discountPercent);
  return !r.discountPercent.trim() || !(n >= 1 && n <= 50) ? 'Informe um desconto de 1% a 50%.' : undefined;
}
export const NO_PRICE_DEPOSIT = 'Sem preço definido: use valor fixo.';
export function depositError(r: DepositRule, priceMode?: ServiceItem['priceMode']): string | undefined {
  if (r.deposit !== 'sim') return undefined;
  if (r.depositKind === 'percentual' && priceMode === 'sob-consulta') return NO_PRICE_DEPOSIT;
  const n = toNumberBR(r.depositValue);
  return !r.depositValue.trim() || !(n > 0) || r.depositKind === 'percentual' && n > 100 ? 'Informe o valor do sinal.' : undefined;
}
/** "Só alguns" sem nenhum convênio que ainda esteja na lista da Empresa (ex.: o convênio foi tirado de lá depois). */
export function insuranceError(o: InsuranceOverride, insurers: string[]): string | undefined {
  return typeof o === 'object' && o.insurers.filter((x) => insurers.includes(x)).length === 0 ? 'Escolha ao menos um convênio.' : undefined;
}

/** Erros do PADRÃO por campo (aparecem só ao salvar). Desmarcar crédito tira o parcelamento da conta. */
export function paymentErrors(c: Pick<EmpresaConfig, 'payments' | 'payment'>): Record<string, string> {
  const e: Record<string, string> = {};
  const p = c.payment;
  const inst = hasCredit(c) ? installmentError(defaultInstallments(p)) : undefined;
  if (inst) e['pagamento-vezes'] = inst;
  const disc = discountError(defaultDiscount(p));
  if (disc) e['pagamento-desconto'] = disc;
  const dep = depositError(defaultDeposit(p));
  if (dep) e['pagamento-sinal'] = dep;
  return e;
}

/** Erros das EXCEÇÕES de um serviço, por regra (só as que se aplicam: parcelamento sem crédito e convênio sem convênio não contam). */
export function servicePaymentErrors(sp: ServicePayment, s: Pick<ServiceItem, 'priceMode'>, e: Empresa): Partial<Record<RuleKey, string>> {
  const out: Partial<Record<RuleKey, string>> = {};
  if (hasCredit(e) && sp.installments !== 'padrao') out.installments = installmentError(sp.installments);
  if (sp.discount !== 'padrao') out.discount = discountError(sp.discount);
  if (sp.deposit !== 'padrao') out.deposit = depositError(sp.deposit, s.priceMode);
  if (acceptsInsurance(e) && e.insurers.length > 0 && sp.insurance !== 'padrao') out.insurance = insuranceError(sp.insurance, e.insurers);
  Object.keys(out).forEach((k) => out[k as RuleKey] === undefined && delete out[k as RuleKey]);
  return out;
}

/**
 * Prontidão de "Formas de pagamento" (cartão de prontidão): ao menos uma forma e nenhum campo obrigatório vazio,
 * contando também as exceções dos serviços ativos. Devolve onde falta.
 */
export function paymentReadiness(e: EmpresaConfig, services: Service[]): {done: boolean;detail: string;to: string;} {
  const toEmpresa = '/atendente-ia/empresa?campo=formas-pagamento';
  if (e.payments.length === 0) return { done: false, detail: 'Nenhuma forma marcada', to: toEmpresa };
  if (Object.keys(paymentErrors(e)).length) return { done: false, detail: 'Falta completar parcelamento, desconto ou sinal', to: '/atendente-ia/empresa?campo=pagamento' };
  const bad = services.find((s) => s.active && Object.keys(servicePaymentErrors(s.payment ?? blankServicePayment(), s, e)).length);
  if (bad) return { done: false, detail: `Falta completar o pagamento de ${bad.name}`, to: serviceLink(bad.id) };
  return { done: true, detail: '', to: toEmpresa };
}

export const isPaymentReady = (e: EmpresaConfig, services: Service[]) => paymentReadiness(e, services).done;

/** Atalho para o serviço já na aba Pagamento (pílula-link v3.16 + regra v3.13). */
export const serviceLink = (id: string) => `/servicos-equipe?aba=servicos&servico=${encodeURIComponent(id)}&secao=pagamento`;

/* ───────────── textos ───────────── */

const pct = (v: string) => `${String(v).replace('.', ',')}%`;

/**
 * Artigo e "na/no" pelo nome do serviço (o protótipo não guarda o gênero). Feminino quando a 1ª palavra termina em
 * -a, -ção, -são, -gem, -dade ou -ite (Limpeza, Toxina, Drenagem, Avaliação); senão masculino (Peeling). CONTRATO NOVO se precisar.
 */
export function articleOf(name: string) {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const fem = /(a|ção|são|gem|dade|ite)$/.test(first);
  return { a: fem ? 'a' : 'o', na: fem ? 'na' : 'no', Na: fem ? 'Na' : 'No' };
}
const lower = (name: string) => name.trim().charAt(0).toLowerCase() + name.trim().slice(1);

export function installmentText(r: InstallmentRule): string {
  if (r.installments === 'nao') return 'só à vista no cartão de crédito';
  if (!r.maxInstallments) return 'parcela no cartão (falta escolher em até quantas vezes)';
  const free = r.interestFreeUpTo === 'todas' ? ', sem juros' : r.interestFreeUpTo === 'nenhuma' ? ', com juros' : `, sem juros até ${r.interestFreeUpTo}x`;
  return `em até ${r.maxInstallments}x${free}`;
}
export function discountText(r: DiscountRule, e: Pick<EmpresaConfig, 'payments'>): string {
  if (r.discount === 'nao') return 'sem desconto à vista';
  const where = paymentSentence(r.discountMethods.filter((m) => e.payments.includes(m) && m !== 'credito'));
  return r.discountPercent.trim() ? `${pct(r.discountPercent)} à vista${where ? ` no ${where}` : ''}` : 'desconto à vista (falta o percentual)';
}
export function depositText(r: DepositRule): string {
  if (r.deposit === 'nao') return 'não pede sinal';
  if (!r.depositValue.trim()) return 'pede sinal (falta o valor)';
  return r.depositKind === 'fixo' ? `sinal de ${formatBRLValue(r.depositValue)}` : `sinal de ${pct(r.depositValue)} do valor do serviço`;
}
export function insuranceText(i: EffectiveInsurance): string {
  if (i.mode === 'nao-atende' || i.mode === 'particular') return 'só particular';
  return `atende ${joinAnd(i.insurers)}`;
}
const joinAnd = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;

/** "Padrão: …" mostrado no serviço quando a regra está "Igual ao padrão". */
export function defaultSummary(key: RuleKey, e: EmpresaConfig): string {
  const p = e.payment;
  switch (key) {
    case 'installments':
      return p.installments === 'nao' ? 'Padrão: não parcela no cartão.' : `Padrão: ${installmentText(defaultInstallments(p))}.`;
    case 'discount':
      return `Padrão: ${discountText(defaultDiscount(p), e)}.`;
    case 'deposit':
      return `Padrão: ${depositText(defaultDeposit(p))}.`;
    case 'insurance':
      return p.insuranceDefault === 'todos' && e.insurers.length ?
      `Padrão: atende ${e.insurers.length === 1 ? 'o convênio' : 'todos os convênios'} ${businessWordsOf(e).of} (${joinAnd(e.insurers)}).` :
      'Padrão: só particular.';
  }
}

/**
 * O que muda neste serviço em relação ao padrão, em frases curtas (ajustes do Lote F: quadro "Serviços com regra diferente"
 * na Empresa). Só as regras que se aplicam (bloqueadas não entram).
 */
export function serviceDifferences(s: Service, e: EmpresaConfig, keys: RuleKey[] = ['installments', 'discount', 'deposit']): string[] {
  const ef = effectivePayment(s, e);
  const out: string[] = [];
  keys.forEach((k) => {
    if (ef.source[k] !== 'servico') return;
    if (k === 'installments' && ef.installments)
    out.push(ef.installments.installments === 'nao' ? 'Não parcela no cartão' : `Parcelamento ${installmentText(ef.installments)}`);
    if (k === 'discount') out.push(ef.discount.discount === 'nao' ? 'Sem desconto à vista' : `Desconto de ${discountText(ef.discount, e)}`);
    if (k === 'deposit') out.push(ef.deposit.deposit === 'nao' ? 'Não pede sinal' : capital(depositText(ef.deposit)));
    if (k === 'insurance') {
      const i = ef.insurance;
      out.push(i.mode === 'particular' || i.mode === 'nao-atende' ? 'Só particular' : i.mode === 'todos' ? `Todos os convênios (${joinAnd(i.insurers)})` : `Só ${joinAnd(i.insurers)}`);
    }
  });
  return out;
}

/* ───────────── respostas da assistente (prévias, Testar como cliente) ───────────── */

export type PayTopic = 'formas' | 'parcelar' | 'desconto' | 'sinal' | 'convenio';
export const PASS_TO_TEAM = 'Vou confirmar com a equipe e já te retorno.';
const COVERAGE = 'Quem confirma a cobertura do seu plano é a equipe.';

/** Resposta usando a regra de UM serviço. `null` = falta dado: a assistente passa para a equipe. */
export function serviceAnswer(topic: PayTopic, s: Service, e: EmpresaConfig): string | null {
  const ef = effectivePayment(s, e);
  const forms = paymentSentence(e.payments);
  const how = e.payment.howToPay.trim();
  switch (topic) {
    case 'formas':
      return forms ? `Aceitamos ${forms}.${how ? ` ${how}` : ''}` : null;
    case 'parcelar':{
        const r = ef.installments;
        if (!r) return 'No momento não parcelamos: não aceitamos cartão de crédito.';
        if (r.installments === 'nao') return 'No cartão de crédito é só à vista, sem parcelamento.';
        if (!r.maxInstallments) return null;
        return `Sim, parcelamos no cartão ${installmentText(r)}.`;
      }
    case 'desconto':{
        const r = ef.discount;
        if (r.discount === 'nao')
        return ef.source.discount === 'servico' && s.name.trim() ?
        `${articleOf(s.name).Na} ${lower(s.name)} não temos desconto à vista.` :
        'No momento não temos desconto para pagamento à vista.';
        if (discountError(r)) return null;
        return `Sim: ${discountText(r, e).replace(' à vista', ' de desconto pagando à vista')}.`;
      }
    case 'sinal':{
        const r = ef.deposit;
        if (r.deposit === 'nao') return 'Não precisa de sinal: você paga no dia do atendimento.';
        if (!(toNumberBR(r.depositValue) > 0)) return null;
        let value = formatBRLValue(r.depositValue);
        if (r.depositKind === 'percentual') {
          const n = toNumberBR(r.depositValue);
          value =
          s.priceMode === 'sob-consulta' ?
          `${pct(r.depositValue)} do valor, que é definido na avaliação` :
          s.priceMode === 'fixo' && s.price > 0 ?
          `${pct(r.depositValue)} do valor (${formatBRLValue(s.price * n / 100)})` :
          `${pct(r.depositValue)} do valor do serviço`;
        }
        return `Sim, pedimos um sinal de ${value} para reservar o horário.${how ? ` ${how}` : ''}`;
      }
    case 'convenio':{
        const i = ef.insurance;
        if (i.mode === 'nao-atende') return `No momento atendemos só particular${forms ? `, com ${forms}` : ''}.`;
        const ref = s.name.trim() ? `${articleOf(s.name).a} ${lower(s.name)}` : 'este serviço';
        if (i.mode === 'particular') return `${capital(ref)} é só particular${forms ? `: aceitamos ${forms}` : ''}.`;
        return `Sim, atendemos ${joinAnd(i.insurers)} ${s.name.trim() ? `${articleOf(s.name).na} ${lower(s.name)}` : 'neste serviço'}. ${COVERAGE}`;
      }
  }
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Pergunta de exemplo citando o serviço ("Dá para parcelar a limpeza de pele?"). */
export function serviceQuestion(topic: PayTopic, name: string): string {
  const { a, na } = articleOf(name);
  const ref = name.trim() ? `${a} ${lower(name)}` : 'este serviço';
  const inRef = name.trim() ? `${na} ${lower(name)}` : 'neste serviço';
  switch (topic) {
    case 'formas':
      return 'Quais formas de pagamento vocês aceitam?';
    case 'parcelar':
      return `Dá para parcelar ${ref}?`;
    case 'desconto':
      return `Tem desconto à vista ${inRef}?`;
    case 'sinal':
      return `Precisa pagar sinal para marcar ${ref}?`;
    case 'convenio':
      return `Aceita convênio para ${ref}?`;
  }
}

/**
 * Resposta GERAL (o cliente não citou o serviço): o padrão + as exceções. Com mais de 2 serviços diferentes na mesma regra,
 * a assistente pergunta qual serviço. `null` = falta dado no padrão.
 */
export function clinicAnswer(topic: PayTopic, e: EmpresaConfig, services: Service[]): string | null {
  const forms = paymentSentence(e.payments);
  const how = e.payment.howToPay.trim();
  const ask = 'Depende do serviço. Qual você quer fazer?';
  const where = (s: Service) => `${articleOf(s.name).Na} ${lower(s.name)}`;
  switch (topic) {
    case 'formas':
      return forms ? `Aceitamos ${forms}.${how ? ` ${how}` : ''}` : null;
    case 'parcelar':{
        if (!hasCredit(e)) return 'No momento não parcelamos: não aceitamos cartão de crédito.';
        const d = defaultInstallments(e.payment);
        if (installmentError(d)) return null;
        const exc = exceptionsOf('installments', services, e).filter((s) => !installmentError(effectivePayment(s, e).installments!));
        if (exc.length > 2) return ask;
        const base = d.installments === 'nao' ? 'No cartão de crédito é só à vista, sem parcelamento.' : `Parcelamos no cartão ${installmentText(d)}.`;
        const extra = exc.map((s) => {
          const r = effectivePayment(s, e).installments!;
          return r.installments === 'nao' ? `${where(s)} não parcelamos.` : `${where(s)}, ${installmentText(r)}.`;
        });
        return [base, ...extra].join(' ');
      }
    case 'desconto':{
        const d = defaultDiscount(e.payment);
        if (discountError(d)) return null;
        const exc = exceptionsOf('discount', services, e).filter((s) => !discountError(effectivePayment(s, e).discount));
        if (exc.length > 2) return ask;
        const base = d.discount === 'nao' ? 'No momento não temos desconto para pagamento à vista.' : `Sim: ${discountText(d, e).replace(' à vista', ' de desconto pagando à vista')}.`;
        const extra = exc.map((s) => {
          const r = effectivePayment(s, e).discount;
          return r.discount === 'nao' ? `${where(s)} não tem desconto.` : `${where(s)}, o desconto é de ${discountText(r, e)}.`;
        });
        return [base, ...extra].join(' ');
      }
    case 'sinal':{
        const d = defaultDeposit(e.payment);
        if (depositError(d)) return null;
        const exc = exceptionsOf('deposit', services, e).filter((s) => !depositError(effectivePayment(s, e).deposit, s.priceMode));
        if (exc.length > 2) return ask;
        const base = d.deposit === 'nao' ? 'Não precisa de sinal: você paga no dia do atendimento.' : `Sim, pedimos um ${depositText(d)} para reservar o horário.`;
        const extra = exc.map((s) => {
          const r = effectivePayment(s, e).deposit;
          return r.deposit === 'nao' ? `${where(s)} não precisa de sinal.` : `${where(s)} pedimos um ${depositText(r)} para reservar o horário.`;
        });
        const anyDeposit = d.deposit === 'sim' || exc.some((s) => effectivePayment(s, e).deposit.deposit === 'sim');
        return [base, ...extra].join(' ') + (anyDeposit && how ? ` ${how}` : '');
      }
    case 'convenio':{
        if (!acceptsInsurance(e) || e.insurers.length === 0) return `No momento atendemos só particular${forms ? `, com ${forms}` : ''}.`;
        const exc = exceptionsOf('insurance', services, e);
        if (exc.length > 2) return ask;
        const byDefault = e.payment.insuranceDefault === 'todos';
        const lines = exc.map((s) => {
          const i = effectivePayment(s, e).insurance;
          if (i.mode === 'particular') return `${where(s)} o atendimento é só particular.`;
          if (byDefault && i.mode === 'alguns') return `${where(s)}, só ${joinAnd(i.insurers)}.`;
          return `Atendemos ${joinAnd(i.insurers)} ${articleOf(s.name).na} ${lower(s.name)}.`;
        });
        if (byDefault)
        return [`Atendemos ${joinAnd(e.insurers)}.`, ...lines, COVERAGE].join(' ');
        if (lines.length === 0) return `No momento atendemos só particular${forms ? `, com ${forms}` : ''}.`;
        return [...lines, `Nos outros serviços, o atendimento é só particular.`, COVERAGE].join(' ');
      }
  }
}

/** Pergunta do cliente → assunto de pagamento ("Testar como cliente"). `null` = não é sobre pagamento. */
export function paymentTopicOf(question: string): PayTopic | null {
  const q = question.
  toLowerCase().
  normalize('NFD').
  replace(/[̀-ͯ]/g, '');
  if (/(convenio|plano de saude|plano)/.test(q)) return 'convenio';
  if (/(parcel|vezes|\d+ ?x\b)/.test(q)) return 'parcelar';
  if (/(sinal|reservar|adiant|entrada)/.test(q)) return 'sinal';
  if (/(desconto|a vista)/.test(q)) return 'desconto';
  if (/(forma de pagamento|formas de pagamento|aceita pix|aceitam pix|cartao|dinheiro|debito|credito)/.test(q)) return 'formas';
  return null;
}

/* ───────────── "Gerar sugestão" (Como atender) ───────────── */

/** Linhas para o texto de instruções: o padrão e, abaixo, "Diferente em: {serviço}: {regra}". */
export function paymentInstructions(e: EmpresaConfig, services: Service[]): string[] {
  const out: string[] = [];
  const p = e.payment;
  // "Diferente em": uma entrada por serviço, com as regras dele juntas (na ordem da lista de serviços).
  const diffMap = new Map<string, string[]>();
  const diff = (s: Service, text: string) => diffMap.set(s.name, [...(diffMap.get(s.name) ?? []), text]);
  if (hasCredit(e)) {
    const d = defaultInstallments(p);
    if (!installmentError(d)) out.push(`Parcelamento: ${d.installments === 'nao' ? 'só à vista no cartão de crédito' : installmentText(d)}.`);
    exceptionsOf('installments', services, e).forEach((s) => diff(s, `parcelamento ${installmentText(effectivePayment(s, e).installments!)}`));
  }
  if (!discountError(defaultDiscount(p))) out.push(`Desconto: ${discountText(defaultDiscount(p), e)}.`);
  exceptionsOf('discount', services, e).forEach((s) => diff(s, discountText(effectivePayment(s, e).discount, e)));
  if (!depositError(defaultDeposit(p))) out.push(`Sinal: ${depositText(defaultDeposit(p))}.`);
  exceptionsOf('deposit', services, e).forEach((s) => diff(s, depositText(effectivePayment(s, e).deposit)));
  const insExc = acceptsInsurance(e) && e.insurers.length ? exceptionsOf('insurance', services, e) : [];
  if (acceptsInsurance(e) && e.insurers.length && (p.insuranceDefault === 'todos' || insExc.length)) {
    out.push(
      p.insuranceDefault === 'todos' ?
      `Convênio: atendemos ${joinAnd(e.insurers)}; qualquer outro, diga que não atendemos. Não prometa cobertura: quem confirma é a equipe.` :
      `Convênio: por padrão só particular; atendemos convênio só nos serviços citados em "Diferente em". Não prometa cobertura: quem confirma é a equipe.`
    );
    insExc.forEach((s) => diff(s, `convênio: ${insuranceText(effectivePayment(s, e).insurance)}`));
  } else out.push(`Convênio: ${businessWordsOf(e).the} atende só particular.`);
  const diffs = services.filter((s) => diffMap.has(s.name)).map((s) => `${s.name}: ${joinAnd(diffMap.get(s.name)!)}`);
  if (diffs.length) out.push(`Diferente em: ${diffs.join('; ')}.`);
  if (p.howToPay.trim()) out.push(`Como o cliente paga: ${p.howToPay.trim()}`);
  if (out.length) out.push('Você não cobra nem confirma pagamento: isso é com a equipe.');
  return out;
}

/* ───────────── conversão do formato antigo (Lote E → Lote F) ───────────── */

/** Formato salvo até o Lote E (22/10/2026). */
export type LegacyPaymentDetails = {
  installments: 'sim' | 'nao';
  maxInstallments: string;
  interestFreeUpTo: string;
  minInstallment?: string;
  discount: 'sim' | 'nao';
  discountPercent: string;
  discountMethods: string[];
  deposit: 'sim' | 'nao';
  depositKind: 'fixo' | 'percentual';
  depositValue: string;
  depositServices?: string[];
  depositHow?: string;
  note?: string;
};

export type PaymentMigration = {
  payment: PaymentDetails;
  /** Exceções a gravar nos serviços (id → regra). */
  serviceDeposit: Record<string, DepositRule>;
  droppedMinInstallment: string | null;
  truncated: boolean;
  /** Aviso para o campo "Como o cliente paga" (1ª abertura). */
  notice?: string;
};

/**
 * Converte o pagamento salvo no formato antigo (registrado no CLAUDE.md, Lote F):
 * - `depositServices` com serviços escolhidos → padrão "Não pede" + exceção "Pede" (mesmo valor) nesses serviços;
 *   'todos' (ou vazio) → padrão "Pede".
 * - `minInstallment` preenchido → descartado (devolvido em `droppedMinInstallment` para o relatório).
 * - `depositHow` + `note` → `howToPay`. Passou de 300 caracteres → corta e devolve o aviso para o campo.
 */
export function migrateLegacyPayment(old: LegacyPaymentDetails, insuranceDefault: PaymentDetails['insuranceDefault'] = 'marcados'): PaymentMigration {
  const chosen = (old.depositServices ?? ['todos']).filter((x) => x !== 'todos');
  const allServices = (old.depositServices ?? ['todos']).includes('todos') || chosen.length === 0;
  const dep: DepositRule = { deposit: old.deposit, depositKind: old.depositKind, depositValue: old.depositValue };
  const serviceDeposit: Record<string, DepositRule> = {};
  if (old.deposit === 'sim' && !allServices) chosen.forEach((id) => serviceDeposit[id] = { ...dep, deposit: 'sim' });
  const joined = [old.depositHow?.trim(), old.note?.trim()].filter(Boolean).join(' ');
  const truncated = joined.length > 300;
  const payment: PaymentDetails = {
    ...blankInstallmentRule(),
    ...blankDiscountRule(),
    ...blankDepositRule(),
    installments: old.installments,
    maxInstallments: old.maxInstallments,
    interestFreeUpTo: old.interestFreeUpTo,
    discount: old.discount,
    discountPercent: old.discountPercent,
    discountMethods: old.discountMethods.filter((m) => paymentMethods.some((p) => p.value === m) && m !== 'credito'),
    deposit: old.deposit === 'sim' && allServices ? 'sim' : 'nao',
    depositKind: old.depositKind,
    depositValue: old.deposit === 'sim' && allServices ? old.depositValue : '',
    howToPay: joined.slice(0, 300),
    insuranceDefault
  };
  return {
    payment,
    serviceDeposit,
    droppedMinInstallment: old.minInstallment && toNumberBR(old.minInstallment) > 0 ? old.minInstallment : null,
    truncated,
    notice: truncated ? 'O texto antigo passava de 300 caracteres e foi cortado. Confira o final.' : undefined
  };
}