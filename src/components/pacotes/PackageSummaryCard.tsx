import React from 'react';
import { AlertTriangleIcon, ChevronRightIcon } from 'lucide-react';
import { StatusBadge } from '../StatusBadge';
import { ProgressBar } from '../ProgressBar';
import { cardButton } from '../ui/styles';
import type { PackageSale } from '../../data/api/pacotes';
import { dataBR, formatarValor, rotuloCondicao, rotuloStatus, textoDisponiveis, textoPendencia, textoValidade } from '../../data/pacotesLib';

/** Same colors as the real `PackageStatusBadge`, drawn with the Orniplaty badge. */
export function PackageStatusBadge({ status, size = 'sm' }: {status: string;size?: 'sm' | 'md';}) {
  const tone = status === 'active' ? 'success' : status === 'expired' ? 'warning' : status === 'frozen' ? 'info' : status === 'cancelled' ? 'error' : 'neutral';
  return <StatusBadge status={tone} label={rotuloStatus(status)} size={size} />;
}

/** "Parcela vencida / pendente" warning (real `PackagePendingAlert`). Only a warning, never a block. */
export function PackagePendingAlert({ pacote }: {pacote: PackageSale;}) {
  const texto = textoPendencia(pacote);
  if (!texto) return null;
  const vencida = pacote.parcelas_vencidas > 0;
  return (
    <p className={`inline-flex items-center gap-1.5 text-xs font-semibold ${vencida ? 'text-error' : 'text-warning'}`}>
      <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {texto}
    </p>);

}

/**
 * Barra de sessões, direto de `saldo` e `total_sessions` da API.
 * W5 (A4-11, 11/11/2026): mostra as RESTANTES, com o mesmo texto da ficha ("2 de 6 restantes"); antes era "4/6" (usadas).
 */
export function SessionsBar({ pacote, className = '' }: {pacote: {saldo: number;total_sessions: number;};className?: string;}) {
  const restantes = Math.max(0, pacote.saldo);
  const texto = textoDisponiveis(pacote);
  return (
    <div className={`flex min-w-[120px] items-center gap-3 ${className}`}>
      <ProgressBar value={Math.round(restantes / pacote.total_sessions * 100)} size="xs" ariaLabel={`Sessões: ${texto}`} className="flex-1" />
      <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">{texto}</span>
    </div>);

}

/**
 * One package sold to a patient (real `PackageSummaryCard`).
 * Ficha rodada 4 (11/11/2026, Christian): "Ver detalhes" fica na mesma linha dos valores (alinhado embaixo, à direita),
 * em vez de numa linha só dele, para o cartão não ficar alto. O aviso de parcela/cancelamento continua embaixo.
 */
export function PackageSummaryCard({ pacote, onAbrir }: {pacote: PackageSale;onAbrir?: (p: PackageSale) => void;}) {
  const cancelado = pacote.status === 'cancelled';
  const pendencia = !cancelado && !!textoPendencia(pacote);
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-text-primary">{pacote.service_name_snapshot}</span>
        <PackageStatusBadge status={pacote.status} />
      </div>
      {!cancelado &&
      <p className="mt-0.5 text-xs text-text-secondary">
          {textoDisponiveis(pacote)} · {textoValidade(pacote)}
        </p>
      }
      <p className="text-xs text-text-muted">
        vendido em {dataBR(pacote.sold_at)} · {rotuloCondicao(pacote.payment_plan)}
        {pacote.card_installments ? ` em ${pacote.card_installments}×` : ''}
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums">
          <div>
            <dt className="text-xs text-text-muted">{cancelado ? 'Valor cancelado' : 'Contratado'}</dt>
            <dd className={`font-semibold ${cancelado ? 'text-error' : 'text-text-primary'}`}>{formatarValor(pacote.total_amount_cents)}</dd>
          </div>
          {!cancelado &&
          <>
              <div>
                <dt className="text-xs text-text-muted">Recebido</dt>
                <dd className="font-semibold text-success-text">{formatarValor(pacote.recebido_cents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">A receber</dt>
                <dd className="font-semibold text-text-primary">{formatarValor(pacote.a_receber_cents)}</dd>
              </div>
            </>
          }
        </dl>
        {onAbrir &&
        <button type="button" onClick={() => onAbrir(pacote)} aria-label={`Ver detalhes do pacote de ${pacote.service_name_snapshot}`} className={`${cardButton} ml-auto`}>
            Ver detalhes
            <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        }
      </div>

      {cancelado ?
      <p className="mt-2 text-xs text-text-muted">
          Cancelado em {dataBR(pacote.cancelled_at)}
          {pacote.cancel_reason ? ` · ${pacote.cancel_reason}` : ''}
        </p> :

      pendencia &&
      <div className="mt-2">
            <PackagePendingAlert pacote={pacote} />
          </div>

      }
    </div>);

}