import React from 'react';
import { StatusPill } from '../ui/StatusPill';
import { ClaimStatusChip, payerLine } from '../convenios/ConvenioPanel';
import { PaymentBadge } from '../pacotes/PackageDetailModal';
import { clientIdOfRecordedName } from '../../data/api/clientes';
import { financialRecordsOf, packageServiceName, useBackendVersion } from '../../data/api/pacotes';
import { brl, methodLabel, methodWithInstallments, receivedParts, useFinanceEntries } from '../../data/convenios';
import type { FinanceEntry } from '../../data/convenios';
import { formatarValor, rotuloForma } from '../../data/pacotesLib';
import { dataBR } from '../../data/fichaLib';
import { refundedCents, useLegado } from '../../data/legado';

/*
 * Rodada 8 (12/11/2026, Christian): o detalhe do atendimento mostra o PAGAMENTO (valor, forma, situação e data).
 * Só lê o que já está gravado, nas mesmas duas fontes do Financeiro da ficha:
 *  1. o fechamento do atendimento (`FinanceEntry`, data/convenios.ts): pelo id do agendamento; sem id, dia + hora + cliente;
 *  2. o lançamento avulso (`FinancialRecord`, data/api/pacotes.ts): pelo id do agendamento; sem id, dia + serviço + cliente.
 * O fechamento vence quando existem os dois (é a mesma regra do total da ficha, que não soma duas vezes).
 * Nada é calculado nem inventado: sem registro, aparece "Nenhum pagamento registrado" (só para atendimento concluído).
 * Vale para todo lugar que abre este detalhe (Ficha, Agenda, Conversas).
 * RV13 (20/11/2026, decisão do Christian): os 5 rótulos do quadro (Valor, Forma de pagamento, Recebido em, Quem paga,
 * Coparticipação) usam o mesmo estilo dos rótulos do topo da janela (maiúsculas, peso 600). No celular "FORMA DE
 * PAGAMENTO" pode ir para duas linhas (aceito).
 */

type Props = {
  appointmentId?: string;
  isoDate: string;
  time: string;
  clientName: string;
  service: string;
  /** Atendimento concluído: sem pagamento, mostra o aviso "Nenhum pagamento registrado". */
  completed: boolean;
  /** O detalhe já mostra o bloco "Pacote": a sessão de pacote não se repete aqui. */
  packageShown?: boolean;
};

const rotulo = 'text-xs font-semibold uppercase tracking-wide text-text-muted';
const valor = 'text-sm font-semibold text-text-primary';

function Linha({ label, children }: {label: string;children: React.ReactNode;}) {
  return (
    <div className="min-w-0">
      <dt className={rotulo}>{label}</dt>
      <dd className={`${valor} mt-0.5 break-words`}>{children}</dd>
    </div>);

}

function Caixa({ pill, children }: {pill?: React.ReactNode;children: React.ReactNode;}) {
  return (
    <div className="rounded-button border border-border px-3 py-2.5 sm:col-span-2" data-testid="pagamento-do-atendimento">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text-primary">Pagamento</p>
        {pill}
      </div>
      {children}
    </div>);

}

function DoFechamento({ e }: {e: FinanceEntry;}) {
  const recebido = receivedParts(e).reduce((t, p) => t + p.cents, 0);
  const reembolsado = refundedCents(e.id);
  const desconto = e.discountCents ?? 0;
  const sinal = e.depositCents ?? 0;

  if (e.packageSaleId) {
    return (
      <Caixa pill={<StatusPill tone="info" label="Pacote" minWidth="md" />}>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          <Linha label="Valor">R$ 0,00</Linha>
          <Linha label="Forma de pagamento">Sessão do pacote de {packageServiceName(e.packageSaleId)}</Linha>
        </dl>
      </Caixa>);

  }

  const pill =
  e.payer === 'convenio' ?
  <ClaimStatusChip status={e.claimStatus} /> :
  e.particularOpen ?
  <StatusPill tone="warning" label="Em aberto" minWidth="md" /> :
  recebido > 0 && reembolsado >= recebido ?
  <StatusPill tone="neutral" label="Reembolsado" minWidth="md" /> :

  <StatusPill tone="success" label="Recebido" minWidth="md" />;


  return (
    <Caixa pill={pill}>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        <Linha label="Valor">
          <span className="text-base font-bold tabular-nums">{brl(e.totalCents)}</span>
        </Linha>
        {e.payer === 'convenio' ?
        <Linha label="Quem paga">{payerLine(e)}</Linha> :
        e.particularOpen ?
        <Linha label="Forma de pagamento">Ainda não recebido</Linha> :

        <Linha label="Forma de pagamento">{methodWithInstallments(e.method, e.installments) || '—'}</Linha>
        }
        {e.payer === 'particular' && !e.particularOpen &&
        <Linha label="Recebido em">
            <span className="tabular-nums">{dataBR(e.paidIso ?? e.closedIso ?? e.iso)}</span>
          </Linha>
        }
        {e.payer === 'convenio' && e.copayCents > 0 &&
        <Linha label="Coparticipação">
            <span className="tabular-nums">{brl(e.copayCents)}</span> · {e.copayPaid ? `paga${e.copayMethod ? ` via ${methodLabel(e.copayMethod)}` : ''}` : 'em aberto'}
          </Linha>
        }
      </dl>
      {(desconto > 0 || sinal > 0) &&
      <p className="mt-2 text-xs tabular-nums text-text-secondary">
          Serviço {brl(e.grossCents ?? e.totalCents + desconto)}
          {desconto > 0 ? ` · desconto −${brl(desconto)}` : ''}
          {sinal > 0 ? ` · sinal ${brl(sinal)}` : ''}
        </p>
      }
      {reembolsado > 0 &&
      <p className="mt-1 text-xs font-semibold text-warning">
          {reembolsado >= recebido ? `Reembolso total: ${brl(reembolsado)}` : `Reembolso parcial: ${brl(reembolsado)} de ${brl(recebido)} recebidos`}
        </p>
      }
    </Caixa>);

}

export function AppointmentPayment({ appointmentId, isoDate, time, clientName, service, completed, packageShown }: Props) {
  useLegado();
  useBackendVersion();
  const entries = useFinanceEntries();
  const clientId = clientIdOfRecordedName(clientName);
  const mesmoCliente = (e: FinanceEntry) => e.clientId ? e.clientId === clientId : clientId ? clientIdOfRecordedName(e.clientName) === clientId : e.clientName === clientName;

  const fechamento =
  (appointmentId ? entries.find((e) => e.appointmentId === appointmentId) : undefined) ??
  entries.find((e) => e.iso === isoDate && e.time === time && mesmoCliente(e));
  if (fechamento) {
    if (fechamento.packageSaleId && packageShown) return null;
    return <DoFechamento e={fechamento} />;
  }

  const lancamento = clientId ?
  financialRecordsOf(clientId).find((r) => !r.package_sale_id && (appointmentId && r.appointment_id === appointmentId || r.origin_date === isoDate && r.description === service)) :
  undefined;
  if (lancamento) {
    const recebido = lancamento.status === 'received';
    return (
      <Caixa pill={<PaymentBadge r={lancamento} />}>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          <Linha label="Valor">
            {lancamento.amount_cents !== null ? <span className="text-base font-bold tabular-nums">{formatarValor(lancamento.amount_cents)}</span> : 'Ainda não informado'}
          </Linha>
          <Linha label="Forma de pagamento">{recebido ? rotuloForma(lancamento.method) : 'Ainda não recebido'}</Linha>
          {recebido && lancamento.received_date &&
          <Linha label="Recebido em">
              <span className="tabular-nums">{dataBR(lancamento.received_date)}</span>
            </Linha>
          }
        </dl>
      </Caixa>);

  }

  if (!completed) return null;
  return (
    <Caixa>
      <p className="mt-1 text-sm text-text-secondary">Nenhum pagamento registrado para este atendimento.</p>
    </Caixa>);

}