import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { clickableChevronClass, clickableRowClass } from '../Card';
import { Input } from '../Input';
import { Select } from '../Select';
import { PillGroup } from '../Pill';
import { INSTALLMENT_OPTIONS, interestFreeOptions, paymentMethods } from '../../data/empresa';
import type { DepositRule, DiscountRule, InstallmentRule } from '../../data/empresa';
import { NO_PRICE_DEPOSIT } from '../../data/paymentRules';

/**
 * Campos das regras de pagamento (Lote F). Os MESMOS na IA Orniplaty › Empresa (padrão) e no serviço › Pagamento
 * (exceção), só com o valor de onde estão. Só peças do design system (Select, Input, PillGroup, linhas clicáveis do Card).
 * F5 (Lote F): campo de número sem placeholder (o prefixo R$ ou o sufixo % já mostram o formato); campo que depende de
 * uma escolha fica colado a ela (nada de grid que joga o campo para a borda direita).
 */
const one = (v: string | string[]) => Array.isArray(v) ? v[0] : v;
const many = (v: string | string[]) => Array.isArray(v) ? v : [v];
const numberOnly = (v: string) => v.replace(/[^\d,]/g, '');

export function InstallmentFields({ idPrefix, rule, error, onChange }: {idPrefix: string;rule: InstallmentRule;error?: string;onChange: (r: InstallmentRule) => void;}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Select
        id={`${idPrefix}-vezes`}
        label="Em até quantas vezes?"
        placeholder="Escolha"
        options={INSTALLMENT_OPTIONS}
        value={rule.maxInstallments || undefined}
        error={error}
        onChange={(v: string) => {
          const keep = rule.interestFreeUpTo === 'todas' || rule.interestFreeUpTo === 'nenhuma' || Number(rule.interestFreeUpTo) < Number(v);
          onChange({ ...rule, maxInstallments: v, interestFreeUpTo: keep ? rule.interestFreeUpTo : 'todas' });
        }} />
      
      <Select
        label="Sem juros até"
        options={interestFreeOptions(rule.maxInstallments)}
        value={rule.interestFreeUpTo}
        disabled={!rule.maxInstallments}
        onChange={(v: string) => onChange({ ...rule, interestFreeUpTo: v })} />
      
    </div>);

}

export function DiscountFields({
  idPrefix,
  payments,
  rule,
  error,
  onChange







}: {idPrefix: string; /** Formas marcadas na Empresa (o desconto nunca vale no crédito). */payments: string[];rule: DiscountRule;error?: string;onChange: (r: DiscountRule) => void;}) {
  const options = paymentMethods.filter((m) => m.value !== 'credito' && payments.includes(m.value));
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Input
        id={`${idPrefix}-desconto`}
        label="De quanto?"
        suffix="%"
        inputMode="decimal"
        value={rule.discountPercent}
        error={error}
        containerClassName="sm:w-36 sm:shrink-0"
        onChange={(e) => onChange({ ...rule, discountPercent: numberOnly(e.target.value).slice(0, 5) })} />
      
      {options.length > 0 ?
      <PillGroup
        label="Vale no"
        multiple
        size="sm"
        options={options}
        value={rule.discountMethods.filter((m) => options.some((o) => o.value === m))}
        onChange={(v) => onChange({ ...rule, discountMethods: many(v) })} /> :


      <p className="text-sm text-text-secondary sm:pt-8">Marque Pix, cartão de débito ou dinheiro em Formas de pagamento para o desconto valer.</p>
      }
    </div>);

}

export function DepositFields({
  idPrefix,
  rule,
  error,
  noPrice,
  onChange







}: {idPrefix: string;rule: DepositRule;error?: string; /** Serviço "Sob consulta": porcentagem desativada, com o motivo em texto. */noPrice?: boolean;onChange: (r: DepositRule) => void;}) {
  return (
    <div role="group" aria-labelledby={`${idPrefix}-sinal-rotulo`}>
      <p id={`${idPrefix}-sinal-rotulo`} className="mb-1.5 text-sm font-semibold text-text-primary">
        Valor do sinal
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="sm:pt-1.5">
          <PillGroup
            size="sm"
            options={[
            { value: 'fixo', label: 'Valor fixo' },
            { value: 'percentual', label: 'Porcentagem do valor do serviço', disabled: noPrice }]
            }
            value={rule.depositKind}
            onChange={(v) => onChange({ ...rule, depositKind: one(v) as 'fixo' | 'percentual' })} />
          
        </div>
        <Input
          id={`${idPrefix}-sinal`}
          aria-label={rule.depositKind === 'fixo' ? 'Valor do sinal em reais' : 'Porcentagem do sinal'}
          prefix={rule.depositKind === 'fixo' ? 'R$' : undefined}
          suffix={rule.depositKind === 'percentual' ? '%' : undefined}
          inputMode="decimal"
          value={rule.depositValue}
          error={error}
          containerClassName="sm:w-40 sm:shrink-0"
          onChange={(e) => onChange({ ...rule, depositValue: numberOnly(e.target.value) })} />
        
      </div>
      {noPrice && <p className="mt-2 text-sm text-text-secondary">{NO_PRICE_DEPOSIT}</p>}
    </div>);

}

/**
 * Quadro "Serviços com regra diferente" (ajustes do Lote F, decisão do Christian de 22/10/2026; substitui a linha com
 * pílulas-link): uma linha por serviço com tudo o que muda. Clicar abre a janela do serviço POR CIMA da tela atual, já na
 * aba Pagamento (quem chama decide, via `onOpen`). Só peças do DS: linhas com o hover único (`clickableRowClass`) e a seta.
 */
export function ExceptionsBox({
  title,
  description,
  rows,
  empty,
  onOpen







}: {title: string;description?: string;rows: {id: string;name: string;detail: string;}[]; /** Texto sem exceções (sem quadro). */empty?: string;onOpen: (id: string) => void;}) {
  if (rows.length === 0) return empty ? <p className="text-sm text-text-secondary">{empty}</p> : null;
  return (
    <section className="overflow-hidden rounded-xl border border-border" aria-label={title}>
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-bold text-text-primary">{title}</p>
        {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) =>
        <li key={r.id}>
            <button type="button" className={twMerge(clickableRowClass, 'flex-nowrap rounded-none px-4')} onClick={() => onOpen(r.id)} aria-label={`Abrir ${r.name}: ${r.detail}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text-primary">{r.name}</span>
                <span className="mt-0.5 block text-sm text-text-secondary">{r.detail}</span>
              </span>
              <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
    </section>);

}