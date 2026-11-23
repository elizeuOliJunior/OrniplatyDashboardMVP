import React, { useMemo } from 'react';
import { KpiStatCard } from '../Card';
import { useAgendaData } from '../../data/agendaLive';
import { aulasOn, useAulasVersion } from '../../data/aulas';
import { addDaysIso, weekdayIndex } from './AgendaDateNav';
import type { AgendaView } from './AgendaDateNav';

/** Dias do período mostrado: o dia (Dia), segunda a domingo (Semana) ou o mês inteiro (Mês). */
export function periodIsos(view: AgendaView, iso: string): string[] {
  if (view === 'dia') return [iso];
  if (view === 'semana') {
    const monday = addDaysIso(iso, -weekdayIndex(iso));
    return [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysIso(monday, i));
  }
  const month = iso.slice(0, 7);
  const out: string[] = [];
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

const PERIOD_WORD: Record<AgendaView, string> = { dia: 'neste dia', semana: 'nesta semana', mes: 'neste mês' };

type Props = {
  view: AgendaView;
  currentIso: string;
  /** Profissionais marcados no filtro da barra (mesma lista do calendário). */
  professionalIds: string[];
};

/**
 * Números do período escolhido na Agenda (pedido do Christian, ponto 2). Só leitura. Contam os agendamentos que já estão na
 * agenda do protótipo (`useAgendaData`), no período da visão (Dia, Semana de segunda a domingo, Mês inteiro; dias fechados
 * escondidos continuam contando) e só dos profissionais marcados no filtro. O filtro "Só A confirmar" não muda os números.
 * - Agendamentos: todos menos os cancelados (Confirmado, A confirmar, Concluído e Faltou entram).
 * - Confirmados: N = Confirmado, "de M" = Confirmado + A confirmar (Concluído e Faltou já passaram da confirmação).
 * - Cancelados: status Cancelado (pela clínica ou pelo cliente).
 * L18, 2ª rodada (17/11/2026, Christian: "o card está torto, quadrado e feio"; quer os números ACIMA da barra da agenda):
 * a faixa fina dentro do cartão (`StatStrip compact`) virou três cartões compactos soltos, acima do cartão do calendário,
 * com a mesma peça dos cartões de Clientes (`KpiStatCard size="sm"`, "i" com a definição). Sem etiqueta de comparação
 * (calcular o período anterior seria conta nova); a linha de apoio diz o período e, em Confirmados, "de M · N a confirmar".
 */
export function AgendaPeriodNumbers({ view, currentIso, professionalIds }: Props) {
  const { appointments } = useAgendaData();
  const aulasVersion = useAulasVersion();
  const key = professionalIds.join(',');
  const n = useMemo(() => {
    const pros = new Set(professionalIds);
    let total = 0;
    let confirmed = 0;
    let pending = 0;
    let cancelled = 0;
    periodIsos(view, currentIso).forEach((iso) => {
      ;(appointments[iso] ?? []).forEach((a) => {
        if (!pros.has(a.professionalId)) return;
        if (a.status === 'cancelled') {
          cancelled += 1;
          return;
        }
        total += 1;
        if (a.status === 'confirmed') confirmed += 1;else
        if (a.status === 'pending_confirmation') pending += 1;
      });
      // G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): cada aula conta UMA vez (não um por cliente). Entra em
      // Agendamentos e em Cancelados; não entra em Confirmados (aula não tem confirmação do cliente).
      aulasOn(iso).forEach((a) => {
        if (!pros.has(a.professionalId)) return;
        if (a.cancelled) cancelled += 1;else
        total += 1;
      });
    });
    return { total, confirmed, pending, cancelled };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentIso, appointments, key, aulasVersion]);
  const toConfirm = n.confirmed + n.pending;
  const when = PERIOD_WORD[view];
  return (
    <section aria-label="Números do período" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <KpiStatCard
        size="sm"
        className="min-w-0"
        label="Agendamentos"
        value={n.total}
        format="number"
        description={when}
        info="Horários marcados no período e nos profissionais escolhidos na barra da agenda, menos os cancelados. Concluídos e faltas entram. Cada aula em grupo conta uma vez." />
      
      <KpiStatCard
        size="sm"
        className="min-w-0"
        label="Confirmados"
        value={n.confirmed}
        format="number"
        description={toConfirm === 0 ? `nada a confirmar ${when}` : `de ${toConfirm} · ${n.pending > 0 ? `${n.pending} a confirmar` : 'nada a confirmar'}`}
        info="Quantos já confirmaram, entre os que precisam de confirmação (Confirmado e A confirmar). Concluídos e faltas não entram." />
      
      <KpiStatCard
        size="sm"
        className="min-w-0"
        label="Cancelados"
        value={n.cancelled}
        format="number"
        description={when}
        info="Horários cancelados no período, pela clínica ou pelo cliente." />
      
    </section>);

}