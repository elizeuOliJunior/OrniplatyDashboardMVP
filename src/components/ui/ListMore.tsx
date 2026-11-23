import React, { useEffect, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Pagination } from '../Pagination';

/**
 * Listas laterais (decisão do Christian, 16/10/2026): mostram TODOS os itens, com até 5 visíveis e rolagem interna a
 * partir do 6º (`ScrollList`). Não existe mais "+N · Ver todos" na Lista de espera, nas Vagas liberadas nem em
 * Fechamentos pendentes do Início.
 */
export { VISIBLE_BEFORE_SCROLL, ScrollList } from '../Card';

/**
 * How many items each list shows before collapsing the rest.
 * One place, so every card in the dashboard follows the same rule.
 * (waitlist, freedSlots e pendingClosures saíram em 16/10/2026: usam `VISIBLE_BEFORE_SCROLL` + `ScrollList`.)
 */
export const LIST_LIMITS = {
  todayAppointments: 5,
  /** Appointments inside one day of the week view */
  weekDay: 4,
  /** Lists inside a page: items per page (page numbers below, like Clientes) */
  visits: 5,
  knowledge: 5,
  documents: 4,
  blocks: 4,
  opportunities: 8
} as const;

/** `ScrollList` vem do design system ORNIPLATY (v2.1): 5 itens visíveis, rolagem a partir do 6º. */

/**
 * Last item of a side-card list when more items are hidden: says how many are left and opens the full list.
 * SEM USO desde 16/10/2026 (Lista de espera, Vagas liberadas e Fechamentos pendentes passaram para `ScrollList`).
 * Mantido exportado para não quebrar cópias antigas; não usar em tela nova.
 */
export function MoreCard({ count, label, onClick }: {count: number;label: string;onClick: () => void;}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-inner border border-dashed border-border-strong px-3.5 py-2.5 text-left transition-all duration-150 hover:border-primary hover:bg-primary-soft hover:shadow-sm active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      
      <span className="text-sm text-text-secondary">
        <span className="font-bold tabular-nums text-text-primary">+{count}</span> {label}
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-bold text-primary">
        Ver todos
        <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>);

}

/**
 * Splits a long list into pages. Used by every list whose job is to show everything
 * (nothing stays hidden behind a "ver mais"): you move through it page by page.
 */
export function usePaged<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  return {
    page: current,
    setPage,
    totalPages,
    pageItems: items.slice((current - 1) * pageSize, current * pageSize),
    /** Position of the first item of this page in the full list (0-based) */
    offset: (current - 1) * pageSize
  };
}

/** Page numbers under a list, only when the list is longer than one page. */
export function ListPagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  itemLabel







}: {page: number;totalPages: number;onPageChange: (page: number) => void;totalItems: number;pageSize: number;itemLabel: string;}) {
  if (totalItems <= pageSize) return null;
  return (
    <div className="mt-4">
      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} totalItems={totalItems} pageSize={pageSize} itemLabel={itemLabel} />
    </div>);

}