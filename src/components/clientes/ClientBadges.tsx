import React from 'react';
import { StatusBadge } from '../StatusBadge';
import { StatusPill } from '../ui/StatusPill';
import type { Client } from '../../data/clientes';
import { LIST_BADGE_TEXT, listBadgeDetail, listBadgeOf, useContactBlocks } from '../../data/contactPreferences';

export function packageLabel(client: Client): string {
  if (!client.package) return '—';
  return `${client.package.service} ${client.package.used}/${client.package.total} sessões`;
}

export function ClientTags({ tags }: {tags: string[];}) {
  if (tags.length === 0) return <span className="text-text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) =>
      <StatusBadge key={tag} status="neutral" label={tag} size="sm" showDot={false} />
      )}
    </div>);

}

/** Selo antigo (formato `Client['messages']`): "Não recebe mensagens" virou "Não recebe avisos" (L24a, dicionário). */
export function ClientMessagesBadge({ status }: {status: Client['messages'];}) {
  return status === 'recebe' ?
  <StatusBadge status="success" label="Recebe" size="sm" /> :

  <StatusBadge status="warning" label={LIST_BADGE_TEXT.ambos} size="sm" />;

}

export function ClientInactiveBadge({ days }: {days?: number;}) {
  if (!days) return null;
  return <StatusBadge status="warning" label={`Inativa há ${days} dias`} size="sm" />;
}

/**
 * L24a (18/11/2026, pedido 1a do Christian): selo de contato da lista de Clientes, lido do dicionário único
 * (`listBadgeOf`): "Não recebe retorno", "Não recebe lembretes" ou, com os dois parados, "Não recebe avisos". Sem selo
 * quando nada está parado; Novidades e Aviso de vaga não geram selo. Mesmo tom e tamanho do selo de antes.
 */
export function ContactListBadge({ clientId }: {clientId: string;}) {
  useContactBlocks();
  const label = listBadgeOf(clientId);
  if (!label) return null;
  return (
    <span title={listBadgeDetail(clientId)} className="mt-1 inline-block">
      <StatusPill tone="warning" label={label} minWidth="lg" />
    </span>);

}