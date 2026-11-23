/**
 * Registros VIVOS lidos por Resultados (G1 subetapa 3, 25/10/2026). SÓ LÊ os stores que já existem; não guarda nada.
 * A conta fica em `data/resultadosDemo.ts` (`summarize`), que recebe estes registros prontos.
 */
import { useMemo } from 'react';
import { getAgendaState, useAgendaData } from './agendaLive';
import { clientIdOfRecordedName, historyVisits, useClientsVersion } from './api/clientes';
import { allOneOffReceipts, allPackageReceipts, allPackageRefunds, packageServiceName, useBackendVersion } from './api/pacotes';
import { appliedDepositIds, getDeposits, getFinanceEntries, useDeposits, useFinanceEntries } from './convenios';
import { useLegado } from './legado';
import { closurePayment } from './financeReaders';
import { serviceByName, useServices } from './servicesStore';
import { CONVERSATION_RECORDS_FROM, conversationThreads, useConversations } from './conversasThreads';
import type { LiveSources } from './resultadosDemo';

/** Motivo do caso pelo id estável (prefixo dos geradores de data/followUp.ts). */
const motiveOfCase = (caseId: string) =>
caseId.startsWith('fu-sumiu-') ? 'sumiu' : caseId.startsWith('fu-falta-') ? 'faltou' : caseId.startsWith('fu-preco-') ? 'pediu-preco' : caseId.startsWith('fu-pacote-') ? 'pacote' : 'retorno';

/** Registros vivos AGORA (leitura pura dos stores; também usada pelos testes de função). */
export function liveSourcesNow(): LiveSources {
  const { appointments } = getAgendaState();
  // G3: TODOS os recebimentos de pacote, inclusive de pacote excluído (o dinheiro não some de Resultados).
  const packageReceipts = allPackageReceipts().map((r) => ({ id: r.id, iso: r.received_date as string, cents: r.amount_cents ?? 0, method: r.method, service: packageServiceName(r.package_sale_id as string) }));
  // G3: reembolsos de pacote (saída na data do reembolso) e sinais ainda não usados por um fechamento (entrada na data real).
  const applied = appliedDepositIds();
  // W5 (A4-01, G10): lançamento avulso RECEBIDO entra em Resultados na data em que entrou, salvo quando o mesmo atendimento
  // tem fechamento (o fechamento é a única fonte do dinheiro de um atendimento). Mesma regra da ficha (`mesmoAtendimento`):
  // mesmo id de agendamento, ou mesmo cliente + mesmo dia + mesmo serviço.
  const entries = getFinanceEntries();
  const hasClosure = (r: {client_id: string;appointment_id: string | null;origin_date: string;description: string | null;}) =>
  entries.some(
    (e) =>
    !!r.appointment_id && e.appointmentId === r.appointment_id ||
    (e.clientId ?? clientIdOfRecordedName(e.clientName)) === r.client_id && e.iso === r.origin_date && e.service === r.description
  );
  const oneOff = allOneOffReceipts().
  filter((r) => !hasClosure(r)).
  map((r) => ({ id: `avulso:${r.id}`, iso: r.received_date as string, cents: r.amount_cents ?? 0, method: r.method, service: r.description ?? 'Lançamento avulso', kind: 'avulso' as const }));
  const otherCash = [
  ...oneOff,
  ...allPackageRefunds().map((r) => ({ id: `pkreemb:${r.id}`, iso: r.refund_date, cents: -r.amount_cents, method: r.method, service: r.service_name_snapshot, kind: 'reembolso' as const })),
  ...getDeposits().filter((d) => !applied.has(d.id)).map((d) => ({ id: `sinal:${d.id}`, iso: d.iso, cents: d.cents, method: d.method, service: d.service, kind: 'sinal' as const }))];

  return {
    appointments,
    history: historyVisits(),
    closures: entries.map((e) => closurePayment(e)),
    packageReceipts,
    otherCash,
    clientIdOf: clientIdOfRecordedName,
    priceOf: (service: string) => serviceByName(service)?.price ?? 0,
    motiveOfCase,
    assistantConversations: Object.entries(conversationThreads).
    filter(([, t]) => t.some((m) => m.sender === 'lia')).
    map(([id]) => ({ id, iso: CONVERSATION_RECORDS_FROM })),
    conversationsFrom: CONVERSATION_RECORDS_FROM
  };
}

export function useResultsSources(): LiveSources {
  const { appointments } = useAgendaData();
  const entries = useFinanceEntries();
  const deposits = useDeposits();
  const lv = useLegado();
  const pv = useBackendVersion();
  const cv = useClientsVersion();
  const { services } = useServices();
  useConversations();
  const conversationsKey = Object.values(conversationThreads).reduce((n, t) => n + t.length, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => liveSourcesNow(), [appointments, entries, deposits, lv, pv, cv, services, conversationsKey]);
}