import React, { useEffect, useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { Textarea } from '../Textarea';
import { Checkbox } from '../Checkbox';
import { PillGroup } from '../Pill';
import { ChoiceCards, RecordRow, ScrollList } from '../Card';
import { ModalActions } from '../ui/ModalActions';
import { NoticeInline } from '../ui/Notice';
import { useToast } from '../ui/Toast';
import { StatusPill } from '../ui/StatusPill';
import { smallButton } from '../ui/styles';
import { ClaimModal, ClaimStatusChip, payerLine } from '../convenios/ConvenioPanel';
import { METHODS, brl, clientMethodOptions, closeFinance, getDeposits, methodLabel, methodWithInstallments, moneyInput, parseMoney, receivedParts, registerOpenPayment, useDeposits } from '../../data/convenios';
import { originalMethodOf } from '../../data/financeReaders';
import type { FinanceEntry } from '../../data/convenios';
import { MIN_REASON, addCorrection, addRefund, correctionsOf, refundedCents, refundedOf, refundsOf, useLegado } from '../../data/legado';
import type { RefundComponent } from '../../data/legado';
import { consumeSession, packageServiceName, reverseConsumption, usablePackagesFor, useBackendVersion } from '../../data/api/pacotes';
import { patchAppointment } from '../../data/agendaLive';
import { TODAY_ISO } from '../../data/agendaStore';
import { serviceByLabel } from '../../data/catalogo';
import { empresaStore } from '../../data/empresa';
import { useSavedStore } from '../../data/iaConfigStore';
import { dataBR } from '../../data/fichaLib';

const summary = (e: FinanceEntry) =>
e.packageSaleId ?
`sessão do pacote de ${packageServiceName(e.packageSaleId)} (R$ 0,00)` :
e.payer === 'convenio' ?
`${brl(e.totalCents)} (convênio ${e.insurer || '—'} cobre ${brl(e.coveredCents)}, coparticipação ${brl(e.copayCents)})` :
`${brl(e.totalCents)}${e.particularOpen ? ' em aberto' : ` via ${methodWithInstallments(e.method, e.installments) || '—'}`}`;
/** Chave do atendimento no razão do pacote (a mesma do fechamento). */
const apptKeyOf = (e: FinanceEntry) => e.appointmentId ?? e.id;

type PackageChoice = 'manter' | 'trocar' | 'tirar';

/**
 * Corrigir fechamento (G3, F-059 e F-052):
 *  - valor coberto ou cobrado mudou → a coparticipação REGISTRADA não muda sozinha: recalcular só com marcação explícita;
 *    coparticipação já paga fica travada (para devolver, use o reembolso);
 *  - convênio escolhido da lista da Empresa (o valor atual fica disponível, marcado);
 *  - sessão de pacote: manter, trocar (estorna e usa o outro, uma vez) ou tirar (estorna e cobra a sessão, editável).
 * Toda correção exige motivo e fica no histórico; salvar de novo não consome nem devolve sessão a mais.
 */
function CorrigirModal({ entry, onClose }: {entry: FinanceEntry | null;onClose: () => void;}) {
  const toast = useToast();
  const empresa = useSavedStore(empresaStore);
  useBackendVersion();
  const [total, setTotal] = useState('');
  const [covered, setCovered] = useState('');
  const [insurer, setInsurer] = useState('');
  const [recalcCopay, setRecalcCopay] = useState(false);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pkgChoice, setPkgChoice] = useState<PackageChoice>('manter');
  const [newPkg, setNewPkg] = useState('');
  const [chargeNow, setChargeNow] = useState<'sim' | 'nao'>('sim');
  const [method, setMethod] = useState('pix');
  const [error, setError] = useState<string | null>(null);
  const methodOptions = clientMethodOptions(empresa.payments.length ? empresa.payments : ['pix', 'credito', 'debito', 'dinheiro']);
  useEffect(() => {
    if (entry) {
      setTotal(entry.packageSaleId ? moneyInput((serviceByLabel(entry.service)?.price ?? 0) * 100) : moneyInput(entry.totalCents));
      setCovered(moneyInput(entry.coveredCents));
      setInsurer(entry.insurer);
      setRecalcCopay(false);
      setReason('');
      setSubmitted(false);
      setPkgChoice('manter');
      setNewPkg('');
      setChargeNow('sim');
      // W5 (A4-06): a correção também corrige a forma de pagamento; começa na forma registrada.
      setMethod(!entry.packageSaleId && entry.payer === 'particular' && entry.method ? entry.method : methodOptions[0]?.value ?? 'pix');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);
  if (!entry) return null;

  const isPkg = !!entry.packageSaleId;
  /** W5 (A4-06): particular já recebido (não pacote, não em aberto) pode trocar a forma de pagamento. */
  const canFixMethod = !isPkg && entry.payer === 'particular' && !entry.particularOpen;
  const methodChoices = canFixMethod && entry.method && !methodOptions.some((o) => o.value === entry.method) ? [...methodOptions, { value: entry.method, label: `${methodLabel(entry.method)} (valor atual)` }] : methodOptions;
  const receivedBefore = !isPkg && entry.payer === 'particular' && !entry.particularOpen ? entry.totalCents : 0;
  const others = isPkg ? usablePackagesFor(entry.clientId ?? null, entry.service, entry.iso).filter((p) => p.id !== entry.packageSaleId) : [];
  const totalCents = parseMoney(total);
  const coveredCents = entry.payer === 'convenio' ? parseMoney(covered) : 0;
  const deposit = entry.depositCents ?? 0;
  // Convênio: a lista da Empresa + o valor atual (registro antigo pode ter um nome fora da lista).
  const insurerOptions = [...new Set([...(empresa.acceptsInsurance === 'sim' ? empresa.insurers : []), ...(entry.insurer ? [entry.insurer] : [])])].map((i) => ({
    value: i,
    label: empresa.insurers.includes(i) && empresa.acceptsInsurance === 'sim' ? i : `${i} (valor atual)`
  }));
  const copayPaidLocked = entry.payer === 'convenio' && entry.copayPaid && entry.copayCents > 0;
  const newCopay = Math.max(0, totalCents - coveredCents);
  const copayMismatch = entry.payer === 'convenio' && newCopay !== entry.copayCents;
  const copayAfter = copayMismatch && recalcCopay && !copayPaidLocked ? newCopay : entry.copayCents;

  const errors = {
    total:
    (!isPkg || pkgChoice === 'tirar') && totalCents <= 0 ?
    'Informe o valor cobrado.' :
    !isPkg && entry.payer === 'particular' && totalCents < deposit ?
    `O valor não pode ficar abaixo do sinal já recebido (${brl(deposit)}).` :
    undefined,
    covered: !isPkg && entry.payer === 'convenio' && (coveredCents <= 0 || coveredCents > totalCents) ? 'O valor coberto precisa ser maior que zero e não passar do valor cobrado.' : undefined,
    copay:
    !isPkg && copayMismatch && copayPaidLocked ?
    `A coparticipação já foi paga (${brl(entry.copayCents)}). Para a conta fechar, o valor cobrado precisa ser coberto + coparticipação = ${brl(coveredCents + entry.copayCents)}. Para devolver dinheiro, use Reembolsar.` :
    !isPkg && copayMismatch && !recalcCopay ?
    `A coparticipação registrada é ${brl(entry.copayCents)}. Com estes valores ela seria ${brl(newCopay)}: marque a opção para recalcular ou ajuste os valores.` :
    undefined,
    insurer: !isPkg && entry.payer === 'convenio' && !insurer ? 'Escolha o convênio.' : undefined,
    newPkg: isPkg && pkgChoice === 'trocar' && !others.some((p) => p.id === newPkg) ? 'Escolha o pacote.' : undefined,
    reason: reason.trim().length < MIN_REASON ? `Explique o motivo (mínimo ${MIN_REASON} caracteres).` : undefined
  };
  const unchanged = isPkg ?
  pkgChoice === 'manter' :
  totalCents === entry.totalCents && coveredCents === entry.coveredCents && insurer === entry.insurer && (!canFixMethod || method === entry.method);
  /** W5 (A4-06): valor novo menor que o recebido — a diferença NÃO volta para o cliente (contrato CT-11: correção não é reembolso). */
  const lowerBy = receivedBefore > 0 && totalCents > 0 && totalCents < receivedBefore ? receivedBefore - totalCents : 0;
  const save = () => {
    setSubmitted(true);
    setError(null);
    if (Object.values(errors).some(Boolean) || unchanged) return;
    const before = summary(entry);
    let next: FinanceEntry;
    if (isPkg) {
      const key = apptKeyOf(entry);
      const reversal = entry.packageEntryId ? reverseConsumption(entry.packageSaleId!, entry.packageEntryId, reason.trim()) : null;
      if (pkgChoice === 'trocar') {
        try {
          const used = consumeSession(newPkg, key, entry.iso, entry.clientId ?? null, entry.service);
          next = { ...entry, packageSaleId: newPkg, packageEntryId: used.id };
        } catch (err) {
          // Não deixa o atendimento sem pacote nem cobrança: volta a usar o pacote original.
          if (reversal) consumeSession(entry.packageSaleId!, key, entry.iso, entry.clientId ?? null, entry.service);
          setError((err as Error).message);
          return;
        }
      } else {
        const paid = chargeNow === 'sim';
        next = {
          ...entry,
          packageSaleId: null,
          packageEntryId: null,
          payer: 'particular',
          totalCents,
          grossCents: totalCents,
          discountCents: 0,
          method: paid ? method : null,
          installments: null,
          receivedCents: paid ? totalCents : 0,
          particularOpen: !paid,
          // Sessão tirada e paga agora: o dinheiro entra HOJE (data real), não na data do fechamento original.
          paidIso: paid ? TODAY_ISO : null
        };
      }
    } else {
      next = {
        ...entry,
        totalCents,
        grossCents: entry.payer === 'particular' ? totalCents + (entry.discountCents ?? 0) : totalCents,
        coveredCents,
        insurer: entry.payer === 'convenio' ? insurer : entry.insurer,
        copayCents: entry.payer === 'convenio' ? copayAfter : 0,
        copayPaid: entry.payer === 'convenio' ? copayAfter === 0 ? true : entry.copayPaid : true,
        receivedCents: entry.payer === 'particular' ? entry.particularOpen ? 0 : totalCents : entry.receivedCents,
        method: canFixMethod ? method : entry.method,
        // Trocar para uma forma sem parcelas zera as parcelas ("Crédito em 3x" → "Pix").
        installments: canFixMethod && method !== 'credito' ? null : entry.installments
      };
    }
    addCorrection(entry.id, reason.trim(), before, summary(next));
    const { id: _id, ...rest } = next;
    closeFinance(rest);
    if (isPkg && entry.appointmentId) patchAppointment(entry.iso, entry.appointmentId, { packageSaleId: next.packageSaleId ?? null });
    toast({
      title: 'Fechamento corrigido',
      description: isPkg ?
      pkgChoice === 'trocar' ?
      'A sessão voltou para o pacote anterior e foi usada no pacote escolhido. A versão anterior continua no histórico.' :
      `A sessão voltou para o pacote. ${chargeNow === 'sim' ? `${brl(totalCents)} recebido hoje.` : `${brl(totalCents)} fica em aberto.`}` :
      'A versão anterior continua no histórico.'
    });
    onClose();
  };
  return (
    <AppModal
      open
      onClose={onClose}
      size="md"
      title="Corrigir fechamento"
      description={`${entry.clientName} · ${entry.service} · ${dataBR(entry.iso)}`}
      footer={
      <ModalActions equal={2}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar correção</Button>
        </ModalActions>
      }>
      
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">Atual: {summary(entry)}. A correção não apaga o fechamento: a versão anterior fica no histórico, com motivo, autor e data.</p>
        {isPkg ?
        <>
            <ChoiceCards
            label="Pacote"
            columns={1}
            options={[
            { value: 'manter', title: 'Manter a sessão do pacote', description: `Continua usando o pacote de ${packageServiceName(entry.packageSaleId!)}.` },
            { value: 'trocar', title: 'Usar outro pacote', description: others.length ? 'A sessão volta para o pacote atual e é usada no pacote escolhido.' : 'Este cliente não tem outro pacote que cubra este serviço.', disabled: others.length === 0 },
            { value: 'tirar', title: 'Tirar o pacote e cobrar a sessão', description: 'A sessão volta para o pacote e o atendimento passa a ser cobrado como particular.' }]
            }
            value={pkgChoice}
            onChange={(v) => setPkgChoice(v as PackageChoice)} />
          
            {pkgChoice === 'trocar' &&
          <Select
            label="Pacote"
            placeholder="Escolha o pacote"
            options={others.map((p) => ({ value: p.id, label: `${p.service_name_snapshot} · ${p.saldo} ${p.saldo === 1 ? 'restante' : 'restantes'}` }))}
            value={newPkg || undefined}
            onChange={setNewPkg}
            error={submitted ? errors.newPkg : undefined} />

          }
            {pkgChoice === 'tirar' &&
          <>
                <Input label="Valor da sessão" prefix="R$" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} error={submitted ? errors.total : undefined} helperText="Vem com o preço do serviço; pode ser editado." />
                <PillGroup
              label="Pagamento"
              size="sm"
              options={[
              { value: 'sim', label: 'Recebido agora' },
              { value: 'nao', label: 'Ainda não pagou' }]
              }
              value={chargeNow}
              onChange={(v) => typeof v === 'string' && setChargeNow(v as 'sim' | 'nao')} />
            
                {chargeNow === 'sim' && <PillGroup label="Forma de pagamento" size="sm" options={methodOptions} value={method} onChange={(v) => typeof v === 'string' && setMethod(v)} />}
              </>
          }
          </> :

        <>
            <Input label="Valor cobrado" prefix="R$" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} error={submitted ? errors.total : undefined} helperText={deposit > 0 ? `Inclui o sinal de ${brl(deposit)} já recebido.` : undefined} />
            {lowerBy > 0 &&
          <NoticeInline tone="warning" title={`A diferença de ${brl(lowerBy)} não volta para o cliente`}>
                A correção só acerta o registro. Se você devolveu dinheiro, cancele e use Reembolsar.
              </NoticeInline>
          }
            {canFixMethod && <PillGroup label="Forma de pagamento" size="sm" options={methodChoices} value={method} onChange={(v) => typeof v === 'string' && setMethod(v)} />}
            {entry.payer === 'convenio' &&
          <>
                <Select label="Convênio" options={insurerOptions} value={insurer || undefined} onChange={setInsurer} error={submitted ? errors.insurer : undefined} helperText="Lista salva em IA Orniplaty › Empresa › Convênio." />
                <Input label="Valor coberto pelo convênio" prefix="R$" inputMode="decimal" value={covered} onChange={(e) => setCovered(e.target.value)} error={submitted ? errors.covered : undefined} />
                <div>
                  <p className="text-sm font-medium text-text-primary">Coparticipação registrada</p>
                  <p className="mt-1 text-sm tabular-nums text-text-secondary">
                    {brl(entry.copayCents)} · {entry.copayCents === 0 ? 'cliente não paga nada' : entry.copayPaid ? 'já recebida' : 'em aberto'}
                  </p>
                  {copayMismatch && !copayPaidLocked &&
              <Checkbox
                className="mt-2"
                checked={recalcCopay}
                onChange={(v: boolean) => setRecalcCopay(v)}
                label={`Recalcular a coparticipação para ${brl(newCopay)}`}
                description="Sem esta marcação, a coparticipação registrada não muda." />

              }
                  {submitted && errors.copay && <p className="mt-1.5 text-sm text-error">{errors.copay}</p>}
                </div>
              </>
          }
          </>
        }
        <Textarea label="Motivo da correção" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={submitted ? errors.reason : undefined} />
        {submitted && unchanged && <p className="text-sm text-error">Altere ao menos um valor para corrigir.</p>}
        {error &&
        <NoticeInline tone="error" role="alert" title="Não foi possível corrigir">
            {error}
          </NoticeInline>
        }
      </div>
    </AppModal>);

}

/**
 * Registrar reembolso (G3, F-054): só de dinheiro RECEBIDO, escolhendo de qual parte saiu (proveniência) e para quem
 * volta. Limite de cada parte = recebido nela − reembolsos anteriores dela. Pagador e destinatário não mudam.
 */
function ReembolsoModal({ entry, onClose }: {entry: FinanceEntry | null;onClose: () => void;}) {
  const toast = useToast();
  const empresa = useSavedStore(empresaStore);
  useDeposits();
  const [component, setComponent] = useState<RefundComponent | ''>('');
  const [amount, setAmount] = useState('');
  /** W5 (G15): forma pela qual o dinheiro volta. Começa na forma do pagamento original; pode ser trocada. */
  const [method, setMethod] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const parts = entry ? receivedParts(entry).map((p) => ({ ...p, left: p.cents - refundedOf(entry.id, p.component) })).filter((p) => p.left > 0) : [];
  useEffect(() => {
    if (entry) {
      const first = receivedParts(entry).map((p) => ({ ...p, left: p.cents - refundedOf(entry.id, p.component) })).find((p) => p.left > 0);
      setComponent(first?.component ?? '');
      // W5 (A4-07): o valor começa VAZIO; "Disponível para reembolso" fica como referência embaixo do campo.
      setAmount('');
      setMethod(originalMethodOf(entry, first?.component) ?? '');
      setReason('');
      setSubmitted(false);
    }
  }, [entry]);
  if (!entry) return null;
  const part = parts.find((p) => p.component === component);
  const left = part?.left ?? 0;
  const cents = parseMoney(amount);
  const to = component === 'repasse' ? `Convênio ${entry.insurer}` : entry.clientName;
  const original = originalMethodOf(entry, component || undefined);
  // Formas do cliente (Empresa) + a forma original, se ela não estiver mais na lista. Repasse volta para a operadora.
  const baseOptions = clientMethodOptions(empresa.payments.length ? empresa.payments : ['pix', 'credito', 'debito', 'dinheiro']);
  const refundMethodOptions =
  original && original !== 'convenio' && !baseOptions.some((o) => o.value === original) ?
  [...baseOptions, { value: original, label: methodLabel(original) || METHODS.find((m) => m.value === original)?.label || original }] :
  baseOptions;
  const errors = {
    component: !part ? 'Escolha de qual valor recebido sai o reembolso.' : undefined,
    amount: cents <= 0 || cents > left ? `Informe um valor entre R$ 0,01 e ${brl(left)}.` : undefined,
    reason: reason.trim().length < MIN_REASON ? `Explique o motivo (mínimo ${MIN_REASON} caracteres).` : undefined,
    method: component !== 'repasse' && !method ? 'Escolha por onde o dinheiro volta.' : undefined
  };
  const save = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean) || !part) return;
    const refundMethod = component === 'repasse' ? 'convenio' : method;
    addRefund(entry.id, cents, reason.trim(), part.component, to, refundMethod);
    toast({
      title: 'Reembolso registrado',
      description: `${brl(cents)} para ${to}${component === 'repasse' ? '' : ` por ${methodLabel(refundMethod)}`}. A devolução do dinheiro é feita pela sua equipe.`
    });
    onClose();
  };
  return (
    <AppModal
      open
      onClose={onClose}
      size="md"
      title="Registrar reembolso"
      description={`${entry.clientName} · ${entry.service} · ${dataBR(entry.iso)}`}
      footer={
      <ModalActions equal={2}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Registrar reembolso</Button>
        </ModalActions>
      }>
      
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          Aqui você registra a devolução; o dinheiro é devolvido pela sua equipe. Só dá para reembolsar dinheiro que foi recebido. O reembolso aparece em Resultados como saída na data de hoje e reduz o valor deste atendimento nos indicadores (ticket médio, gerado pela IA e clientes trazidos de volta).
        </p>
        {parts.length > 1 ?
        <ChoiceCards
          label="De qual valor recebido?"
          columns={1}
          options={parts.map((p) => ({ value: p.component, title: p.label, description: `Recebido ${brl(p.cents)} · disponível para reembolso ${brl(p.left)}` }))}
          value={component || undefined}
          onChange={(v) => {
            setComponent(v as RefundComponent);
            setAmount('');
            setMethod(originalMethodOf(entry, v as RefundComponent) ?? '');
          }} /> :

        part ?
        <p className="text-sm text-text-primary">
            {part.label}: {brl(part.cents)}.
          </p> :
        null}
        {submitted && errors.component && <p className="text-sm text-error">{errors.component}</p>}
        <Input label="Valor a reembolsar" prefix="R$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={submitted ? errors.amount : undefined} helperText={part ? `Disponível para reembolso: ${brl(left)} · volta para ${to}` : undefined} />
        {component === 'repasse' ?
        <p className="text-sm text-text-secondary">Devolvido ao convênio {entry.insurer}: sai da linha Convênio em Resultados › Formas de pagamento.</p> :

        <div>
            <PillGroup label="Devolvido por" size="sm" options={refundMethodOptions} value={method} onChange={(v) => typeof v === 'string' && setMethod(v)} />
            <p className="mt-1.5 text-sm text-text-secondary">
              {original && method === original ? `Mesma forma do pagamento (${methodLabel(original)}). Pode trocar se devolveu de outro jeito.` : original ? `O pagamento foi em ${methodLabel(original)}.` : 'Escolha por onde o dinheiro volta.'}
            </p>
            {submitted && errors.method && <p className="mt-1 text-sm text-error">{errors.method}</p>}
          </div>
        }
        <Textarea label="Motivo" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={submitted ? errors.reason : undefined} />
      </div>
    </AppModal>);

}

/** G3: recebe um valor particular que estava em aberto (data = hoje, no relógio do protótipo). */
function PagamentoModal({ entry, onClose }: {entry: FinanceEntry | null;onClose: () => void;}) {
  const toast = useToast();
  const empresa = useSavedStore(empresaStore);
  const options = clientMethodOptions(empresa.payments.length ? empresa.payments : ['pix', 'credito', 'debito', 'dinheiro']);
  const [method, setMethod] = useState('pix');
  useEffect(() => {
    if (entry) setMethod(options[0]?.value ?? 'pix');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);
  if (!entry) return null;
  const open = Math.max(0, entry.totalCents - (entry.depositCents ?? 0));
  return (
    <AppModal
      open
      onClose={onClose}
      size="sm"
      unsavedGuard={false}
      title="Registrar pagamento"
      description={`${entry.clientName} · ${entry.service} · ${brl(open)} em aberto`}
      footer={
      <ModalActions equal={2}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
          onClick={() => {
            registerOpenPayment(entry.id, method);
            toast({ title: 'Pagamento registrado', description: `${brl(open)} recebido hoje via ${methodWithInstallments(method)}.` });
            onClose();
          }}>
          
            Registrar pagamento
          </Button>
        </ModalActions>
      }>
      
      <PillGroup label="Forma de pagamento" size="sm" options={options} value={method} onChange={(v) => typeof v === 'string' && setMethod(v)} />
    </AppModal>);

}

/**
 * Atendimentos fechados da Ficha, com correção de fechamento (histórico), reembolso e pagamento em aberto.
 * Rodada 4 (11/11/2026, Christian): cada atendimento é um cartão próprio. Rodada 5 (DS v4.5): o cartão é o MESMO
 * item das outras abas do Histórico (`RecordRow`: data e hora à esquerda, serviço e como foi pago no meio, valor e
 * situação à direita); detalhes e ações ficam embaixo, dentro do item. A lista rola por dentro (`ScrollList`).
 * Rodada 7 (12/11/2026, Christian): a parte de cima do item abre o detalhe do atendimento (`abrirAtendimento`, o mesmo
 * da aba Atendimentos); os botões Corrigir/Reembolsar continuam embaixo, fora da área clicável.
 */
export function FechamentosLista({ entries, abrirAtendimento }: {entries: FinanceEntry[];abrirAtendimento?: (e: FinanceEntry) => (() => void) | undefined;}) {
  useLegado();
  useBackendVersion();
  useDeposits();
  const [corrigir, setCorrigir] = useState<FinanceEntry | null>(null);
  const [reembolsar, setReembolsar] = useState<FinanceEntry | null>(null);
  const [pagar, setPagar] = useState<FinanceEntry | null>(null);
  // G4 (F-056): a cobrança do convênio também se atualiza daqui (antes só em Resultados › Recebimentos).
  const [cobranca, setCobranca] = useState<FinanceEntry | null>(null);
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Atendimentos fechados</h3>
      <ScrollList ariaLabel="Atendimentos fechados" className="flex flex-col gap-2">
        {entries.map((e) => {
          const cs = correctionsOf(e.id);
          const rs = refundsOf(e.id);
          const refunded = refundedCents(e.id);
          const received = receivedParts(e).reduce((t, p) => t + p.cents, 0);
          const refundable = receivedParts(e).some((p) => p.cents - refundedOf(e.id, p.component) > 0);
          const sinais = (e.depositIds ?? []).map((id) => getDeposits().find((d) => d.id === id)).filter(Boolean);
          const abrir = abrirAtendimento?.(e);
          return (
            <li key={e.id}>
              <RecordRow
                date={dataBR(e.iso)}
                dateDetail={e.time}
                title={e.service}
                subtitle={payerLine(e)}
                onClick={abrir}
                ariaLabel={abrir ? `${e.service}, ${dataBR(e.iso)} às ${e.time}. Ver o atendimento` : undefined}
                aside={
                <>
                    <span className="text-sm font-bold tabular-nums text-text-primary">{brl(e.totalCents)}</span>
                    {/* Etiqueta padrão: Recebido verde (G9, 11/11/2026: "Recebido" em todo lugar, no lugar de "Pago"); Reembolsado (valor inteiro devolvido) neutro. */}
                    {e.packageSaleId ?
                  <StatusPill tone="info" label="Pacote" minWidth="md" /> :
                  e.payer === 'convenio' ?
                  <ClaimStatusChip status={e.claimStatus} /> :
                  e.particularOpen ?
                  <StatusPill tone="warning" label="Em aberto" minWidth="md" /> :
                  received > 0 && refunded >= received ?
                  <StatusPill tone="neutral" label="Reembolsado" minWidth="md" /> :

                  <StatusPill tone="success" label="Recebido" minWidth="md" />
                  }
                  </>
                }>
                
                {(sinais.length > 0 || (e.discountCents ?? 0) > 0) &&
                <p className="text-xs tabular-nums text-text-secondary">
                    Serviço {brl(e.grossCents ?? e.totalCents)}
                    {(e.discountCents ?? 0) > 0 ? ` · desconto −${brl(e.discountCents ?? 0)}` : ''}
                    {sinais.map((d) => ` · sinal ${brl(d!.cents)} em ${dataBR(d!.iso)}`).join('')}
                    {!e.particularOpen && e.totalCents - (e.depositCents ?? 0) > 0 ? ` · restante ${brl(e.totalCents - (e.depositCents ?? 0))} em ${dataBR(e.paidIso ?? e.closedIso ?? e.iso)}` : ''}
                  </p>
                }
                {refunded > 0 &&
                <p className="mt-1 text-xs font-semibold text-warning">
                    {refunded >= received ? `Reembolso total: ${brl(refunded)}` : `Reembolso parcial: ${brl(refunded)} de ${brl(received)} recebidos`}
                  </p>
                }
                {/* W5 (A4-16): o dinheiro entra em Resultados no dia em que foi recebido; a linha diz isso quando é outro dia. */}
                {!e.packageSaleId && e.payer === 'particular' && !e.particularOpen && sinais.length === 0 && (e.paidIso ?? e.closedIso ?? e.iso) !== e.iso &&
                <p className="text-xs tabular-nums text-text-secondary">Recebido em {dataBR(e.paidIso ?? e.closedIso ?? e.iso)}</p>
                }
                {e.note && <p className="mt-1 whitespace-pre-line text-xs text-text-secondary">Observação: {e.note}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button type="button" className={smallButton} onClick={() => setCorrigir(e)}>
                    Corrigir fechamento
                  </button>
                  {refundable &&
                  <button type="button" className={smallButton} onClick={() => setReembolsar(e)}>
                      <RotateCcwIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Reembolsar
                    </button>
                  }
                  {e.payer === 'convenio' && !e.packageSaleId &&
                  <button type="button" className={smallButton} onClick={() => setCobranca(e)}>
                      Atualizar cobrança do convênio
                    </button>
                  }
                  {e.particularOpen && !e.packageSaleId &&
                  <button type="button" className={smallButton} onClick={() => setPagar(e)}>
                      Registrar pagamento
                    </button>
                  }
                </div>
                {rs.length > 0 &&
                <ul className="mt-2 text-xs text-warning">
                    {rs.map((r) =>
                  <li key={r.id}>
                        Reembolso de {brl(r.cents)} em {r.at}
                        {r.to ? ` para ${r.to}` : ''}
                        {r.method && r.method !== 'convenio' ? ` por ${methodLabel(r.method)}` : ''} · {r.by} · motivo: {r.reason}
                      </li>
                  )}
                  </ul>
                }
                {cs.length > 0 &&
                <details className="mt-2 text-xs text-text-secondary">
                    <summary className="cursor-pointer font-semibold text-text-primary">Histórico do fechamento ({cs.length} {cs.length === 1 ? 'correção' : 'correções'})</summary>
                    <ul className="mt-1 flex flex-col gap-1">
                      {cs.map((c) =>
                    <li key={c.id}>
                          {c.at} · {c.by}: {c.before} → {c.after}. Motivo: {c.reason}
                        </li>
                    )}
                    </ul>
                  </details>
                }
              </RecordRow>
            </li>);

        })}
      </ScrollList>
      {/* P4b: a legenda só aparece quando há fechamento sob convênio (pacote e particular não precisam dela). */}
      {entries.some((e) => !e.packageSaleId && e.payer === 'convenio') &&
      <p className="mt-1.5 text-xs text-text-muted">Fechado sob convênio não conta como pago: o status acompanha a cobrança à operadora.</p>
      }
      <CorrigirModal entry={corrigir} onClose={() => setCorrigir(null)} />
      <ReembolsoModal entry={reembolsar} onClose={() => setReembolsar(null)} />
      <PagamentoModal entry={pagar} onClose={() => setPagar(null)} />
      <ClaimModal entry={cobranca} onClose={() => setCobranca(null)} />
    </div>);

}