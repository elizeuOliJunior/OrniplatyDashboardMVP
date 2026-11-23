import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { PillGroup } from '../Pill';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { useToast } from '../ui/Toast';
import { smallButton } from '../ui/styles';
import { StatusPill } from '../ui/StatusPill';
import type { PillTone } from '../ui/StatusPill';
import { CLAIM_LABEL, CLAIM_ORDER, METHODS, awaitingFromInsurers, brl, methodWithInstallments, moneyInput, parseMoney, updateClaim, useFinanceEntries } from '../../data/convenios';
import { refundedOf } from '../../data/legado';
import type { ClaimStatus, FinanceEntry } from '../../data/convenios';
import { mediumDayLabel } from '../../data/agendaStore';
import { rangeLabel } from '../../data/receiptsPeriod';
import type { DateRange } from '../../data/receiptsPeriod';

const TONE: Record<ClaimStatus, PillTone> = { pending: 'warning', submitted: 'info', approved: 'info', denied: 'error', received: 'success' };

/** Status da cobrança à operadora. Mesmo tamanho em qualquer tela, rótulo completo. */
export function ClaimStatusChip({ status }: {status: ClaimStatus;}) {
  return <StatusPill tone={TONE[status]} label={CLAIM_LABEL[status]} minWidth="md" />;
}

/** Pagador + o que foi de fato pago, sem chamar convênio de "forma de pagamento". */
export function payerLine(e: FinanceEntry) {
  // G3: sessão de pacote (R$ 0), valor em aberto e crédito parcelado aparecem pelo que de fato aconteceu.
  if (e.packageSaleId) return 'Sessão do pacote · R$ 0,00 nesta sessão';
  if (e.payer === 'particular') {
    if (e.particularOpen) return `Particular · ${brl(Math.max(0, e.totalCents - (e.depositCents ?? 0)))} em aberto`;
    // W5 (G9): "Recebido" em todo lugar.
    return `Particular · recebido via ${methodWithInstallments(e.method, e.installments)}`;
  }
  return `Convênio ${e.insurer}${e.plan ? ` (${e.plan})` : ''} · cobre ${brl(e.coveredCents)} · cliente ${e.copayCents > 0 ? `${e.copayPaid ? 'pagou' : 'deve'} ${brl(e.copayCents)}` : 'não paga nada'}`;
}

export function ClaimModal({ entry, onClose }: {entry: FinanceEntry | null;onClose: () => void;}) {
  const toast = useToast();
  const [status, setStatus] = useState<ClaimStatus>('pending');
  const [received, setReceived] = useState('');
  const [method, setMethod] = useState('transferencia');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setStatus(entry.claimStatus);
    setReceived(moneyInput(entry.receivedCents || entry.coveredCents));
    setMethod(entry.claimMethod ?? 'transferencia');
    setSubmitted(false);
  }, [entry]);
  if (!entry) return null;

  const cents = parseMoney(received);
  // G3 (F-054): repasse já reembolsado em parte não pode deixar de ser "Recebido" nem ficar abaixo do reembolsado.
  const refundedRepasse = refundedOf(entry.id, 'repasse');
  const err =
  status === 'received' && cents <= 0 ?
  'Informe o valor recebido.' :
  refundedRepasse > 0 && (status !== 'received' || cents < refundedRepasse) ?
  `Já houve reembolso de ${brl(refundedRepasse)} deste repasse. O valor recebido não pode ficar abaixo disso.` :
  undefined;

  const save = () => {
    setSubmitted(true);
    if (err) return;
    updateClaim(entry.id, status === 'received' ? { claimStatus: status, receivedCents: cents, claimMethod: method } : { claimStatus: status, receivedCents: 0, claimMethod: null });
    toast({ title: 'Cobrança atualizada', description: `${entry.clientName} · ${CLAIM_LABEL[status]}. A cobrança à operadora continua com a sua equipe.` });
    onClose();
  };

  return (
    <AppModal
      open
      onClose={onClose}
      title="Atualizar cobrança do convênio"
      description={`${entry.clientName} · ${entry.service} · ${mediumDayLabel(entry.iso)} · ${entry.insurer}`}
      footer={
      <ModalActions equal={2}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar</Button>
        </ModalActions>
      }>
      
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">Coberto pelo convênio: <strong className="text-text-primary">{brl(entry.coveredCents)}</strong>. Só marque “Recebido” quando o repasse realmente entrou.</p>
        <Select label="Situação da cobrança" options={CLAIM_ORDER.map((s) => ({ value: s, label: CLAIM_LABEL[s] }))} value={status} onChange={(v) => setStatus(v as ClaimStatus)} />
        {status === 'received' &&
        <>
            <Input label="Valor recebido" prefix="R$" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} error={submitted ? err : undefined} />
            <PillGroup label="Como o repasse entrou" size="sm" options={METHODS} value={method} onChange={(v) => typeof v === 'string' && setMethod(v)} />
          </>
        }
      </div>
    </AppModal>);

}

/**
 * Cartão "Convênios" de Recebimentos: lista vazia até existir um atendimento fechado sob convênio.
 * Com `range`, mostra só os atendimentos (pela data do atendimento) do período escolhido na tela.
 */
export function ConvenioCard({ range }: {range?: DateRange;}) {
  const every = useFinanceEntries().filter((e) => e.payer === 'convenio');
  const all = range ? every.filter((e) => e.iso >= range.from && e.iso <= range.to) : every;
  const [filter, setFilter] = useState<'todos' | ClaimStatus>('todos');
  const [editing, setEditing] = useState<FinanceEntry | null>(null);
  const list = filter === 'todos' ? all : all.filter((e) => e.claimStatus === filter);
  const sum = (s: ClaimStatus) => all.filter((e) => e.claimStatus === s).reduce((t, e) => t + (s === 'received' ? e.receivedCents : e.coveredCents), 0);

  return (
    <Card as="section" padding="lg" aria-labelledby="convenios-titulo">
      <CardHeader>
        <CardTitle as="h2" id="convenios-titulo">Convênios{range ? ` · ${rangeLabel(range)}` : ''}</CardTitle>
      </CardHeader>
      <CardContent>
        {all.length === 0 ?
        <p className="text-sm text-text-secondary">
            {every.length > 0 ?
          `Nenhum atendimento sob convênio neste período (há ${every.length} em outras datas).` :
          'Nenhum atendimento foi fechado sob convênio ainda. Ao fechar um atendimento na Agenda, escolha “Convênio” como pagador: a cobrança aparece aqui como pendente, sem contar como recebida.'}
          </p> :

        <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
            ['A receber (pend./env./aprov.)', awaitingFromInsurers(all)],
            ['Negado', sum('denied')],
            ['Recebido de operadoras', sum('received')],
            ['Atendimentos', all.length]].
            map(([label, v]) =>
            <div key={String(label)} className="rounded-button bg-surface-muted px-3 py-2">
                  <dt className="text-xs font-semibold text-text-muted">{label}</dt>
                  <dd className="mt-0.5 text-base font-bold tabular-nums text-text-primary">{label === 'Atendimentos' ? v : brl(Number(v))}</dd>
                </div>
            )}
            </dl>
            <div className="mt-4 max-w-xs">
              <Select label="Filtrar por situação" options={[{ value: 'todos', label: 'Todas' }, ...CLAIM_ORDER.map((s) => ({ value: s, label: CLAIM_LABEL[s] }))]} value={filter} onChange={(v) => setFilter(v as 'todos' | ClaimStatus)} />
            </div>
            <ul className="mt-4 divide-y divide-border">
              {list.length === 0 && <li className="py-3 text-sm text-text-muted">Nenhum atendimento com essa situação.</li>}
              {list.map((e) =>
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-text-primary">{e.clientName} · {e.service}</span>
                    <span className="block text-xs text-text-secondary">{mediumDayLabel(e.iso)} · {payerLine(e)}</span>
                  </span>
                  <ClaimStatusChip status={e.claimStatus} />
                  <button type="button" className={smallButton} onClick={() => setEditing(e)}>
                    Atualizar
                  </button>
                </li>
            )}
            </ul>
          </>
        }
      </CardContent>
      {editing && <ClaimModal entry={all.find((x) => x.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </Card>);

}