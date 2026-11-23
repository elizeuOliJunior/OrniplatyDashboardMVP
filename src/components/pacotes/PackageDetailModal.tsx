import React, { useState } from 'react';
import { BanIcon, BanknoteIcon, PencilIcon, SnowflakeIcon, Trash2Icon, Undo2Icon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { Textarea } from '../Textarea';
import { DateField } from '../ui/DateField';
import { StatusBadge } from '../StatusBadge';
import { ModalActions } from '../ui/ModalActions';
import { ActionMenu } from '../ui/ActionMenu';
import type { ActionMenuItem } from '../ui/ActionMenu';
import { useModalGuard } from '../ui/UnsavedChanges';
import { NoticeInline } from '../ui/Notice';
import { PackagePendingAlert, PackageStatusBadge } from './PackageSummaryCard';
import { PillGroup } from '../Pill';
import { ChoiceCards } from '../Card';
import {
  cancelPackage,
  deletePackage,
  freezePackage,
  getPackage,
  reactivatePackage,
  refundableOf,
  registerPayment,
  updatePackage,
  useBackendVersion } from
'../../data/api/pacotes';
import type { CancelDecision, FinancialRecord, PackageSaleDetail } from '../../data/api/pacotes';
import { parseBRLCents } from '../../utils/currency';
import {
  EXPLICACAO_CONDICAO,
  FORMAS,
  TEXTO_EDICAO_NAO_E_DINHEIRO,
  TEXTO_PREFERENCIA_NAO_E_EXECUTOR,
  TEXTO_SALDO_EM_PACOTE_VENCIDO,
  dataBR,
  formatarValor,
  quantidadeDoLancamento,
  rotuloCondicao,
  rotuloDoCampo,
  rotuloDoLancamento,
  rotuloForma,
  sessoesDoPacote,
  textoDisponiveis,
  textoValidade,
  valorDoHistorico } from
'../../data/pacotesLib';
import type { CondicaoPagamento } from '../../data/pacotesLib';
import { TODAY_ISO } from '../../data/agendaStore';
import { getTeam } from '../../data/availability';

type Action = 'cancelar' | 'congelar' | 'reativar' | 'editar' | 'excluir' | {pagar: FinancialRecord;};

const section = 'flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0';
const h3 = 'text-xs font-bold uppercase tracking-wide text-text-muted';

/**
 * Package detail (real `PackageDetailModal`): contract, money, sessions ledger and contract history,
 * with the same actions — cancel, freeze, reactivate, edit contract, delete and register payment.
 */
export function PackageDetailModal({ packageSaleId, nomeDoPaciente, onClose }: {packageSaleId: string | null;nomeDoPaciente?: string;onClose: () => void;}) {
  useBackendVersion();
  const toast = useToast();
  const [action, setAction] = useState<Action | null>(null);

  let p: PackageSaleDetail | null = null;
  try {
    p = packageSaleId ? getPackage(packageSaleId) : null;
  } catch {
    p = null;
  }

  const run = (fn: () => void, ok: string, tone: 'info' | undefined = undefined) => {
    try {
      fn();
      toast({ title: ok, tone });
      setAction(null);
      return true;
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Não foi possível concluir.', tone: 'warning' });
      return false;
    }
  };

  // Ações secundárias/destrutivas ficam no menu "Mais ações"; a condição de cada uma é a mesma de antes.
  const menuItems: ActionMenuItem[] = p ?
  [
  ...(!p.cancelled_at && !p.frozen_at ?
  [{ key: 'congelar', label: 'Congelar pacote', description: 'Pausa a validade e o uso das sessões', icon: <SnowflakeIcon className="h-4 w-4" />, onSelect: () => setAction('congelar') }] :
  []),
  ...(!p.cancelled_at ?
  [{ key: 'cancelar', label: 'Cancelar pacote', danger: true, icon: <BanIcon className="h-4 w-4" />, onSelect: () => setAction('cancelar') }] :
  []),
  ...(p.cancelled_at || p.edicao.pode_excluir ?
  [{ key: 'excluir', label: 'Excluir pacote', danger: true, icon: <Trash2Icon className="h-4 w-4" />, onSelect: () => setAction('excluir') }] :
  [])] :

  [];

  return (
    <>
      <AppModal
        open={!!p && !action}
        onClose={onClose}
        size="lg"
        title="Pacote"
        description={nomeDoPaciente}
        footer={
        p &&
        <ModalActions
          start={menuItems.length > 0 ? <ActionMenu label="Mais ações" items={menuItems} /> : null}>
          
              <Button variant="neutral" onClick={onClose}>
                Fechar
              </Button>
              {!p.cancelled_at &&
          <Button variant={p.frozen_at ? 'secondary' : 'primary'} leftIcon={<PencilIcon className="h-4 w-4" />} onClick={() => setAction('editar')} title={TEXTO_EDICAO_NAO_E_DINHEIRO}>
                  Editar contrato
                </Button>
          }
              {p.frozen_at &&
          <Button variant="primary" leftIcon={<Undo2Icon className="h-4 w-4" />} onClick={() => setAction('reativar')}>
                  Reativar pacote
                </Button>
          }
            </ModalActions>

        }>
        
        {p &&
        <div className="flex flex-col gap-5">
            <BlocoResumo p={p} />
            <BlocoFinanceiro p={p} onPagar={(r) => setAction({ pagar: r })} />
            <BlocoSessoes p={p} />
            <BlocoHistorico p={p} />
          </div>
        }
      </AppModal>

      {p && action === 'cancelar' &&
      <CancelModal
        p={p}
        onClose={() => setAction(null)}
        onConfirm={(reason, decision) =>
        run(
          () => cancelPackage(p!.id, reason, decision),
          decision.kind === 'reembolso' ? `Pacote cancelado. Reembolso de ${formatarValor(decision.amount_cents)} registrado.` : 'Pacote cancelado. O valor recebido foi mantido.',
          'info'
        )
        } />

      }
      {p && action === 'congelar' &&
      <ReasonModal
        title="Congelar pacote"
        description="Suspende o uso e as parcelas futuras. Créditos e valores recebidos ficam preservados, e o pacote pode ser reativado depois."
        placeholder="Ex.: cliente vai viajar por dois meses"
        confirmLabel="Congelar pacote"
        onClose={() => setAction(null)}
        onConfirm={(reason) => run(() => freezePackage(p!.id, reason), 'Pacote congelado. Créditos e valores recebidos foram preservados.', 'info')} />

      }
      {p && action === 'reativar' &&
      <ReasonModal
        title="Reativar pacote"
        description="O pacote volta a funcionar com o saldo que já tinha."
        placeholder="Ex.: cliente retomou o tratamento"
        confirmLabel="Reativar pacote"
        onClose={() => setAction(null)}
        onConfirm={(reason) => run(() => reactivatePackage(p!.id, reason), 'Pacote reativado. O pacote voltou a funcionar.')} />

      }
      {p && action === 'excluir' &&
      <ReasonModal
        title="Excluir pacote"
        description={
        p.cancelled_at ?
        'O pacote cancelado sai da lista. Os pagamentos recebidos e os reembolsos continuam em Resultados, cada um na sua data. A exclusão fica registrada com o motivo, a data e quem fez.' :
        'Este pacote ainda não teve sessão usada nem pagamento recebido, então pode sair da lista. A exclusão fica registrada com o motivo, a data e quem fez.'
        }
        placeholder="Ex.: venda registrada no cliente errado"
        confirmLabel="Excluir pacote"
        danger
        onClose={() => setAction(null)}
        onConfirm={(reason) => {
          // G3: o motivo é gravado no registro de auditoria (antes era descartado).
          if (run(() => deletePackage(p!.id, reason), 'Pacote excluído. A exclusão ficou registrada com o motivo.', 'info')) onClose();
        }} />

      }
      {p && action === 'editar' && <EditContractModal p={p} onClose={() => setAction(null)} onSave={(data, ok) => run(() => updatePackage(p!.id, data), ok)} />}
      {p && action && typeof action === 'object' &&
      <RegisterPaymentModal
        registro={action.pagar}
        onClose={() => setAction(null)}
        onSave={(data) => run(() => registerPayment(action.pagar.id, data), 'Pagamento registrado. A alteração ficou no histórico do lançamento.')} />

      }
    </>);

}

// ── 1. Resumo: o contrato e o saldo ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function BlocoResumo({ p }: {p: PackageSaleDetail;}) {
  const { contratadas, usadas, disponiveis } = sessoesDoPacote(p);
  return (
    <section className={section} aria-label="Contrato">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-text-primary">{p.service_name_snapshot}</h3>
        <PackageStatusBadge status={p.status} size="md" />
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dado rotulo="Contratadas" valor={String(contratadas)} />
        <Dado rotulo="Usadas" valor={String(usadas)} />
        <Dado rotulo="Disponíveis" valor={String(disponiveis)} destaque />
        <Dado rotulo="Validade" valor={textoValidade(p)} />
      </dl>
      <p className="text-sm text-text-secondary">
        Vendido em {dataBR(p.sold_at)} · {textoDisponiveis(p)}
      </p>
      {p.preferred_professional_id &&
      <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">Profissional preferido: {p.preferred_professional_name ?? '—'}</span>
          {p.preferred_professional_disponivel ? ` · ${TEXTO_PREFERENCIA_NAO_E_EXECUTOR}` : ' · indisponível para este serviço — não será sugerido'}
        </p>
      }
      {p.notes && <p className="text-sm text-text-secondary">Observações: {p.notes}</p>}
      {p.status === 'expired' && p.saldo > 0 && <Aviso>{TEXTO_SALDO_EM_PACOTE_VENCIDO}</Aviso>}
      {p.frozen_at && <Aviso tone="info">Congelado em {dataBR(p.frozen_at)}{p.freeze_reason ? ` · ${p.freeze_reason}` : ''}</Aviso>}
      {p.cancelled_at &&
      <Aviso tone="error">
          Pacote cancelado em {dataBR(p.cancelled_at)}
          {p.cancel_reason ? ` · Motivo do cancelamento: ${p.cancel_reason}` : ''}
        </Aviso>
      }
    </section>);

}

// ── 2. Financeiro: o contrato ao lado do dinheiro ─────────────────────────────────────────────────────────────────────────────────────────────────────
function BlocoFinanceiro({ p, onPagar }: {p: PackageSaleDetail;onPagar: (r: FinancialRecord) => void;}) {
  const explicacao = EXPLICACAO_CONDICAO[p.payment_plan as CondicaoPagamento];
  return (
    <section className={section} aria-label="Financeiro">
      <h3 className={h3}>Financeiro</h3>
      <div className="rounded-xl bg-surface-muted px-4 py-3">
        <p className="text-xs font-semibold text-text-muted">Valor do contrato</p>
        <p className={`text-lg font-bold tabular-nums ${p.cancelled_at ? 'text-error' : 'text-text-primary'}`}>{formatarValor(p.total_amount_cents)}</p>
        <p className="mt-0.5 text-xs text-text-muted">Valor combinado com o cliente, não é receita. O Financeiro soma os pagamentos, não o contrato isolado.</p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Dado rotulo="Recebido" valor={formatarValor(p.recebido_cents)} />
        <Dado rotulo="A receber" valor={formatarValor(p.a_receber_cents)} />
      </dl>
      <p className="text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">
          {rotuloCondicao(p.payment_plan)}
          {p.card_installments ? ` em ${p.card_installments}×` : ''}
        </span>
        {explicacao ? ` — ${explicacao}` : ''}
      </p>
      {!p.cancelled_at && <PackagePendingAlert pacote={p} />}
      {p.cancelled_at && p.parcelas_pendentes > 0 &&
      <Aviso>Pagamentos suspensos enquanto o pacote estiver cancelado. Estes valores não entram nos totais do Financeiro e não podem ser registrados nem corrigidos.</Aviso>
      }
      {p.refunds.length > 0 &&
      <ul className="flex flex-col gap-1 text-sm text-warning">
          {p.refunds.map((r) =>
        <li key={r.id}>
              Reembolso de {formatarValor(r.amount_cents)} em {dataBR(r.refund_date)} · {rotuloForma(r.method)} · por {r.created_by_user_name} · motivo: {r.reason}
            </li>
        )}
        </ul>
      }
      {p.financial_records.length === 0 ?
      <p className="text-sm text-text-muted">Pacote de cortesia: não há lançamentos financeiros.</p> :

      <ul className="divide-y divide-border rounded-xl border border-border">
          {p.financial_records.map((r) =>
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                  {r.installment_number && r.installment_total ? `Parcela ${r.installment_number} de ${r.installment_total}` : 'Pagamento'}
                  <PaymentBadge r={r} />
                </p>
                <p className="text-xs text-text-secondary">
                  {r.status === 'received' ? `recebido em ${dataBR(r.received_date ?? r.origin_date)}` : `vence em ${dataBR(r.origin_date)}`}
                  {r.method ? ` · ${rotuloForma(r.method)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tabular-nums text-text-primary">{r.amount_cents === null ? 'Aguardando valor' : formatarValor(r.amount_cents)}</span>
                {!p.cancelled_at && r.status === 'pending' &&
            <Button size="sm" leftIcon={<BanknoteIcon className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => onPagar(r)} aria-label={`Registrar pagamento${r.installment_number ? ` da parcela ${r.installment_number} de ${r.installment_total}` : ''}`}>
                    Registrar pagamento
                  </Button>
            }
              </div>
            </li>
        )}
        </ul>
      }
    </section>);

}

export function PaymentBadge({ r }: {r: FinancialRecord;}) {
  if (r.status === 'received') return <StatusBadge status="success" label="Recebido" size="sm" />;
  if (r.amount_cents === null) return <StatusBadge status="neutral" label="Aguardando valor" size="sm" />;
  if (r.origin_date < TODAY_ISO) return <StatusBadge status="error" label="Vencido" size="sm" />;
  return <StatusBadge status="warning" label="Pendente" size="sm" />;
}

// ── 3. Sessões: o razão ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function BlocoSessoes({ p }: {p: PackageSaleDetail;}) {
  const linhas = [...p.ledger].sort((a, b) => a.created_at < b.created_at ? -1 : 1);
  return (
    <section className={section} aria-label="Sessões">
      <h3 className={h3}>Sessões</h3>
      <p className="text-xs text-text-muted">Movimentações em ordem cronológica. A soma da coluna à direita corresponde ao saldo.</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {linhas.map((l) =>
        <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">{rotuloDoLancamento(l.entry_type)}</p>
              <p className="text-xs text-text-secondary">
                {l.entry_type !== 'grant' && l.appointment_date ? `atendimento de ${dataBR(l.appointment_date)} · ` : ''}
                {dataBR(l.created_at)} · {l.created_by_user_name ? `por ${l.created_by_user_name}` : 'pelo sistema'}
              </p>
              {l.reason && <p className="text-xs text-text-muted">Motivo: {l.reason}</p>}
            </div>
            <span className={`shrink-0 text-sm font-bold tabular-nums ${l.quantity > 0 ? 'text-success-text' : 'text-text-primary'}`}>{quantidadeDoLancamento(l.quantity)}</span>
          </li>
        )}
      </ul>
    </section>);

}

// ── 4. Histórico do contrato ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function BlocoHistorico({ p }: {p: PackageSaleDetail;}) {
  return (
    <section className={section} aria-label="Histórico do contrato">
      <h3 className={h3}>Histórico do contrato</h3>
      <p className="text-xs text-text-muted">Alterações de validade, observações, preferência de profissional, congelamento e cancelamento. Ajustes de quantidade ficam no histórico de sessões.</p>
      {p.changes.length === 0 ?
      <p className="text-sm text-text-muted">Nenhuma alteração desde a venda.</p> :

      <ul className="flex flex-col gap-2">
          {p.changes.map((c) =>
        <li key={c.id} className="rounded-button bg-surface-muted px-3.5 py-2.5 text-sm">
              <p className="text-text-primary">
                <span className="font-semibold">{rotuloDoCampo(c.field)}</span>
                {c.old_value || c.field === 'expires_at' ? ` · ${valorDoHistorico(c.field, c.old_value)} → ` : ' · '}
                <span className="font-semibold">{valorDoHistorico(c.field, c.new_value)}</span>
              </p>
              <p className="text-xs text-text-muted">
                {dataBR(c.changed_at)} · {c.changed_by_name ? `por ${c.changed_by_name}` : 'pelo sistema'}
                {c.reason ? ` · Motivo: ${c.reason}` : ''}
              </p>
            </li>
        )}
        </ul>
      }
    </section>);

}

function Dado({ rotulo, valor, destaque }: {rotulo: string;valor: string;destaque?: boolean;}) {
  return (
    <div className={`rounded-button border px-3 py-2 ${destaque ? 'border-border-strong bg-primary-soft' : 'border-border'}`}>
      <dt className="text-xs font-semibold text-text-muted">{rotulo}</dt>
      <dd className={`text-sm font-bold tabular-nums ${destaque ? 'text-primary' : 'text-text-primary'}`}>{valor}</dd>
    </div>);

}

function Aviso({ children, tone = 'warning' }: {children: React.ReactNode;tone?: 'warning' | 'info' | 'error';}) {
  // Padrão único de avisos (components/ui/Notice.tsx): cartão branco, cor só no ícone
  return <NoticeInline tone={tone}>{children}</NoticeInline>;
}

// ── modais de ação ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * G3 (F-052): cancelar com a decisão financeira do legado. Manter o recebido ou registrar reembolso (valor real, forma);
 * o reembolso não passa do recebido menos reembolsos anteriores e vira saída em Recebimentos na data de hoje.
 */
function CancelModal({ p, onClose, onConfirm }: {p: PackageSaleDetail;onClose: () => void;onConfirm: (reason: string, decision: CancelDecision) => void;}) {
  const limite = refundableOf(p.id);
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState<'manter' | 'reembolso'>('manter');
  const [valor, setValor] = useState(limite > 0 ? (limite / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  const [forma, setForma] = useState<string>('pix');
  const [tried, setTried] = useState(false);
  const { close } = useModalGuard(true, { reason, kind, valor, forma }, onClose);
  const cents = parseBRLCents(valor);
  const erros = {
    reason: !reason.trim() ? 'O motivo é obrigatório. Ele fica no histórico, com a data e quem fez.' : undefined,
    valor: kind === 'reembolso' && (cents <= 0 || cents > limite) ? `Informe um valor entre R$ 0,01 e ${formatarValor(limite)}.` : undefined
  };
  return (
    <AppModal
      open
      onClose={close}
      title="Cancelar pacote"
      description="O saldo restante deixa de poder ser usado. As sessões, os pagamentos recebidos e o histórico ficam guardados; parcelas ainda não pagas ficam suspensas."
      tone="danger"
      footer={
      <>
          <Button variant="secondary" onClick={close}>
            Voltar
          </Button>
          <Button
          variant="danger"
          onClick={() => {
            setTried(true);
            if (erros.reason || erros.valor) return;
            onConfirm(reason.trim(), kind === 'reembolso' ? { kind: 'reembolso', amount_cents: cents, method: forma } : { kind: 'manter' });
          }}>
          
            Cancelar pacote
          </Button>
        </>
      }>
      
      <div className="flex flex-col gap-4">
        <ChoiceCards
          label="E o valor já recebido?"
          columns={2}
          options={[
          { value: 'manter', title: 'Manter o valor recebido', description: `${formatarValor(p.recebido_cents)} continua como recebido.` },
          {
            value: 'reembolso',
            title: 'Registrar reembolso',
            description: limite > 0 ? `Devolver ao cliente até ${formatarValor(limite)}. Entra como saída em Recebimentos hoje.` : 'Nada foi recebido deste pacote para devolver.',
            disabled: limite <= 0
          }]
          }
          value={kind}
          onChange={(v) => setKind(v as 'manter' | 'reembolso')} />
        
        {kind === 'reembolso' &&
        <>
            <Input label="Valor do reembolso" prefix="R$" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} error={tried ? erros.valor : undefined} helperText={`Disponível: ${formatarValor(limite)} (recebido menos reembolsos anteriores). A devolução do dinheiro é feita pela sua equipe.`} />
            <PillGroup
            label="Forma do reembolso"
            size="sm"
            options={(['pix', 'cash', 'credit', 'debit', 'transfer'] as const).map((k) => ({ value: k, label: FORMAS[k] }))}
            value={forma}
            onChange={(v) => typeof v === 'string' && setForma(v)} />
          
          </>
        }
        <Textarea label="Motivo" required placeholder="Ex.: cliente desistiu do tratamento" value={reason} onChange={(e) => setReason(e.target.value)} error={tried ? erros.reason : undefined} size="sm" />
      </div>
    </AppModal>);

}

function ReasonModal({
  title, description, placeholder, confirmLabel, danger, onClose, onConfirm
}: {title: string;description: string;placeholder: string;confirmLabel: string;danger?: boolean;onClose: () => void;onConfirm: (reason: string) => void;}) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { close } = useModalGuard(true, reason, onClose);
  return (
    <AppModal
      open
      onClose={close}
      title={title}
      description={description}
      tone={danger ? 'danger' : 'default'}
      footer={
      <>
          <Button variant="secondary" onClick={close}>
            Voltar
          </Button>
          <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            setTried(true);
            if (reason.trim()) onConfirm(reason.trim());
          }}>
          
            {confirmLabel}
          </Button>
        </>
      }>
      
      <Textarea label="Motivo" required placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} error={tried && !reason.trim() ? 'O motivo é obrigatório. Ele fica no histórico, com a data e quem fez.' : undefined} size="sm" />
    </AppModal>);

}

function EditContractModal({ p, onClose, onSave }: {p: PackageSaleDetail;onClose: () => void;onSave: (data: Parameters<typeof updatePackage>[1], ok: string) => void;}) {
  const [validade, setValidade] = useState(p.expires_at ?? '');
  const [sessoes, setSessoes] = useState(String(p.total_sessions));
  const [notas, setNotas] = useState(p.notes ?? '');
  const [prof, setProf] = useState(p.preferred_professional_id ?? '');
  const [motivo, setMotivo] = useState('');
  const { close } = useModalGuard(true, { validade, sessoes, notas, prof, motivo }, onClose);
  // G1 (F-003): equipe viva. O profissional já preferido continua na lista mesmo arquivado (nada se perde em silêncio).
  const opcoes = [{ value: '', label: 'Sem preferência' }, ...getTeam().members.filter((m) => m.services.includes(p.service_name_snapshot) && (m.active !== false || m.id === p.preferred_professional_id)).map((m) => ({ value: m.id, label: m.name, color: m.color }))];
  const mudouSessoes = Number(sessoes) !== p.total_sessions;
  const pendencia =
  validade && validade < p.sold_at ? 'A validade não pode ser anterior à data da venda.' : !(Number(sessoes) >= 1) ? 'Um pacote precisa de pelo menos uma sessão.' : mudouSessoes && !motivo.trim() ? 'Mudar a quantidade de sessões exige um motivo.' : null;
  return (
    <AppModal
      open
      onClose={close}
      title="Editar contrato"
      description={`${p.service_name_snapshot} · ${TEXTO_EDICAO_NAO_E_DINHEIRO}`}
      footer={
      <>
          <Button variant="secondary" onClick={close}>
            Voltar
          </Button>
          <Button
          disabled={!!pendencia}
          title={pendencia ?? undefined}
          onClick={() =>
          onSave(
            { expires_at: validade || null, total_sessions: Number(sessoes), notes: notas, preferred_professional_id: prof || null, reason: motivo.trim() || undefined },
            'Contrato atualizado. A alteração ficou no histórico.'
          )
          }>
          
            Salvar
          </Button>
        </>
      }>
      
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Sessões contratadas" type="number" min={1} value={sessoes} onChange={(e) => setSessoes(e.target.value)} helperText="Vira um ajuste no histórico de sessões." />
          <DateField label="Validade (opcional)" value={validade} onChange={setValidade} helperText="Sem validade, o pacote não vence." />
        </div>
        <Select label="Profissional preferido (opcional)" options={opcoes} value={prof} onChange={setProf} helperText={TEXTO_PREFERENCIA_NAO_E_EXECUTOR} />
        <Textarea label="Observações (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} size="sm" />
        <Textarea label={mudouSessoes ? 'Motivo' : 'Motivo (opcional)'} required={mudouSessoes} value={motivo} onChange={(e) => setMotivo(e.target.value)} size="sm" error={pendencia && mudouSessoes && !motivo.trim() ? pendencia : undefined} />
        {pendencia && !(mudouSessoes && !motivo.trim()) && <p className="text-sm text-error">{pendencia}</p>}
      </div>
    </AppModal>);

}

function RegisterPaymentModal({ registro, onClose, onSave }: {registro: FinancialRecord;onClose: () => void;onSave: (d: {amount_cents: number;received_date: string;method: string;}) => void;}) {
  const [valor, setValor] = useState(registro.amount_cents ? (registro.amount_cents / 100).toFixed(2).replace('.', ',') : '');
  const [data, setData] = useState(TODAY_ISO);
  const [forma, setForma] = useState('pix');
  const { close } = useModalGuard(true, { valor, data, forma }, onClose);
  const cents = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100);
  const pendencia = !(cents > 0) ? 'Informe o valor que entrou.' : !data ? 'Informe a data em que o dinheiro entrou.' : null;
  return (
    <AppModal
      open
      onClose={close}
      title="Registrar pagamento"
      description={registro.installment_number ? `Parcela ${registro.installment_number} de ${registro.installment_total} · vence em ${dataBR(registro.origin_date)}` : registro.package_description ?? undefined}
      footer={
      <>
          <Button variant="secondary" onClick={close}>
            Voltar
          </Button>
          <Button disabled={!!pendencia} title={pendencia ?? undefined} onClick={() => onSave({ amount_cents: cents, received_date: data, method: forma })}>
            Registrar pagamento
          </Button>
        </>
      }>
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Valor recebido" prefix="R$" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        <DateField label="Data do recebimento" value={data} onChange={setData} clearable={false} />
        <Select label="Forma de pagamento" options={Object.entries(FORMAS).map(([value, label]) => ({ value, label }))} value={forma} onChange={setForma} className="sm:col-span-2" />
      </div>
    </AppModal>);

}