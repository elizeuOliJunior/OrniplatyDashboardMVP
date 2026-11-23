import React, { useState } from 'react';
import { HistoryIcon, PackagePlusIcon } from 'lucide-react';
import { Card, ProfessionalTag, RecordRow, ScrollList } from '../Card';
import { Tabs, TabsList, TabsTrigger } from '../Tabs';
import { ScrollableTabs } from '../ui/ScrollableTabs';
import { cardButton, tabListNoScroll } from '../ui/styles';
import { AppointmentStatusChip } from '../ui/StatusChip';
import { StatusPill } from '../ui/StatusPill';
import { PackageSummaryCard } from '../pacotes/PackageSummaryCard';
import { PaymentBadge } from '../pacotes/PackageDetailModal';
import { FechamentosLista } from './FechamentosLista';
import type { AppointmentResponse, ClientProfileResponse } from '../../data/api/clientes';
import { clientIdOfRecordedName } from '../../data/api/clientes';
import type { FinancialRecord, PackageSale } from '../../data/api/pacotes';
import { packageDeletions, useBackendVersion } from '../../data/api/pacotes';
import { VAZIO, dataBR, resumoFinanceiro, temPendenciaFinanceira } from '../../data/fichaLib';
import { formatarValor, rotuloForma } from '../../data/pacotesLib';
import { awaitingFromInsurers, brl, copayOpen, particularOpenCents, receivedParts, useFinanceEntries } from '../../data/convenios';
import type { FinanceEntry } from '../../data/convenios';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { isPendingClosure, refundedCents, thirdPartyLabel, thirdPartyOf, useLegado } from '../../data/legado';

/*
 * Rodada 5 (11/11/2026, Christian, DS v4.5):
 * - As 3 abas do Histórico usam o MESMO item (`RecordRow`): data à esquerda (data + hora), nome e detalhe no meio,
 *   etiqueta/valor e seta à direita. Antes cada aba tinha um formato.
 * - Sem paginação: as listas rolam por dentro do cartão (`ScrollList`, 5 visíveis). Pacotes: 3 visíveis (cartões altos).
 * - Abas ocupam a largura toda do cartão (`Tabs fullWidth`), divididas por igual.
 * Rodada 7 (12/11/2026, Christian): no Financeiro, o pagamento que NÃO é de pacote (dinheiro, Pix, cartão…) também abre:
 * abre o MESMO detalhe do atendimento das abas Atendimentos/Procedimentos (`AppointmentDetailsModal`). Vale para os
 * lançamentos avulsos e para os atendimentos fechados. Pagamento de pacote continua abrindo o pacote.
 */

const Vazio = ({ texto }: {texto: string;}) => <p className="text-sm text-text-muted">{texto}</p>;

/** Profissional (bolinha + nome, `ProfessionalTag` sm) e o rótulo de terceiro, quando houver. */
function Quem({ pro, extra }: {pro?: {name: string;color?: string;} | null;extra?: string | null;}) {
  if (!pro && !extra) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {pro && <ProfessionalTag name={pro.name} color={pro.color} size="sm" />}
      {extra && <span className="font-semibold text-primary">{extra}</span>}
    </span>);

}

function ItemAtendimento({ a, onAbrir }: {a: AppointmentResponse;onAbrir: (a: AppointmentResponse) => void;}) {
  const apptId = a.cal?.appt.id ?? a.id;
  const terceiro = thirdPartyOf(apptId);
  // Passou do horário e ninguém registrou comparecimento nem falta (derivado, nunca presumido)
  const pendente = isPendingClosure(a.date, a.cal?.appt ?? { end: a.start_time, status: (a.status === 'scheduled' ? 'confirmed' : a.status) as never });
  const servico = a.service?.name ?? 'Sem procedimento registrado';
  // W9d (N-02, 12/11/2026): UM status por horário, o da Agenda. O perfil reduz "A confirmar" a `scheduled`, que a etiqueta não
  // conhece e mostrava como "Confirmado". Mesma leitura do cartão "Próximo agendamento" (`NextAppointmentCard`).
  const status = a.cal?.appt.status ?? (a.status === 'scheduled' ? 'pending_confirmation' : a.status);
  return (
    <RecordRow
      date={dataBR(a.date)}
      dateDetail={a.start_time}
      title={servico}
      subtitle={<Quem pro={a.professional} extra={terceiro ? thirdPartyLabel(terceiro) : null} />}
      aside={pendente ? <StatusPill tone="warning" label="A fechar" minWidth="lg" /> : <AppointmentStatusChip status={status} />}
      onClick={() => onAbrir(a)}
      ariaLabel={`${servico}, ${dataBR(a.date)} às ${a.start_time}. Ver detalhes`} />);


}

/**
 * Pacotes do cliente. A gestão de pacotes mora em Clientes › Pacotes (G4, F-056).
 * Ficha reorganizada (11/11/2026): o botão "Pacotes" do topo saiu (só rolava até aqui), decisão do Christian.
 * Rodada 4: o cartão não recolhe mais. Rodada 5: com mais de 3 pacotes a lista rola por dentro do cartão.
 */
export function PacotesCard({
  ficha,
  pacotes,
  onAbrirPacote,
  onVenderPacote






}: {ficha: ClientProfileResponse;pacotes: PackageSale[];onAbrirPacote: (id: string) => void; /** Ausente = sem venda (cliente arquivado, G4 F-069). */onVenderPacote?: () => void;}) {
  const go = useGuardedNavigate();
  useBackendVersion();
  // G3: pacotes excluídos deste cliente (registro de auditoria: motivo, autor e data).
  const excluidos = packageDeletions().filter((d) => d.client_id === ficha.client.id);
  return (
    <Card as="section" padding="lg" id="bloco-pacotes" aria-labelledby="pacotes-titulo" className="scroll-mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pacotes-titulo" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-base font-bold text-text-primary">Pacotes</span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-text-secondary">{pacotes.length}</span>
        </h2>
        <span className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => go(`/clientes/pacotes?cliente=${ficha.client.id}`)} className={cardButton}>
            Ver na aba Pacotes
          </button>
          {onVenderPacote &&
          <button type="button" onClick={onVenderPacote} className={cardButton}>
              <PackagePlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Vender pacote
            </button>
          }
        </span>
      </div>
      <div className="mt-4">
        {excluidos.length > 0 &&
        <ul className="mb-3 flex flex-col gap-1 text-xs text-text-secondary" aria-label="Pacotes excluídos">
            {excluidos.map((d) =>
          <li key={d.id}>
                Pacote excluído: {d.service_name_snapshot} ({d.total_sessions} sessões) em {dataBR(d.deleted_at)} · por {d.deleted_by_name} · motivo: {d.reason}
                {d.received_cents > 0 ? ` · recebidos ${brl(d.received_cents)} continuam em Resultados` : ''}
              </li>
          )}
          </ul>
        }
        {pacotes.length === 0 ?
        <Vazio texto="Este cliente ainda não tem nenhum pacote." /> :

        <ScrollList ariaLabel={`Pacotes de ${ficha.client.name}`} visible={3} className="flex flex-col gap-3">
            {pacotes.map((p) =>
          <li key={p.id}>
                <PackageSummaryCard pacote={p} onAbrir={(x) => onAbrirPacote(x.id)} />
              </li>
          )}
          </ScrollList>
        }
      </div>
    </Card>);

}

type Aba = 'atendimentos' | 'procedimentos' | 'financeiro';

/**
 * DIVERGÊNCIA DA AMOSTRA (11/11/2026): o mesmo atendimento pode aparecer duas vezes, como lançamento avulso (amostra de
 * `data/api/pacotes.ts`, ex.: Carla 01/10) e como atendimento fechado (fixture de `data/convenios.ts`). Para o TOTAL não
 * somar o mesmo dinheiro duas vezes, o lançamento avulso com a mesma data e o mesmo serviço de um fechamento fica fora da
 * soma (continua na lista). Pendência: decidir qual das duas fontes vale (perguntar ao Christian).
 */
const mesmoAtendimento = (r: FinancialRecord, fechamentos: FinanceEntry[]) =>
!r.package_sale_id && fechamentos.some((e) => e.iso === r.origin_date && e.service === (r.description ?? ''));

/**
 * Histórico da ficha em UM cartão com abas (11/11/2026, Christian, referência: "Timeline" do Tend).
 * Rodada 4: a aba "Alterações" saiu da tela (a trilha continua gravada e sai na exportação); Financeiro com resumo no
 * topo (Total recebido · A receber). Rodada 5: mesmo item nas 3 abas, rolagem interna e abas na largura toda.
 * Rodada 7: pagamento avulso e atendimento fechado abrem o detalhe do atendimento.
 */
export function HistoricoCard({
  ficha,
  onAbrirAtendimento,
  onAbrirPacote




}: {ficha: ClientProfileResponse;onAbrirAtendimento: (a: AppointmentResponse) => void;onAbrirPacote: (id: string) => void;}) {
  useLegado();
  const [aba, setAba] = useState<Aba>('atendimentos');
  const nome = ficha.client.name;

  /**
   * Rodada 7: o atendimento de um pagamento. 1º pelo id do agendamento gravado (`appointment_id` / `appointmentId`);
   * sem id, pela mesma data + mesmo serviço (ignorando cancelados). Sem atendimento na ficha = o cartão não abre nada
   * (nunca abre um atendimento "parecido" de outra data).
   */
  const atendimentoDoPagamento = (apptId: string | null | undefined, iso: string, servico: string | null | undefined) =>
  (apptId ? ficha.atendimentos.find((a) => a.cal?.appt.id === apptId || a.id === apptId) : undefined) ?? (
  servico ? ficha.atendimentos.find((a) => a.date === iso && a.service?.name === servico && a.status !== 'cancelled') : undefined);

  // Fechamentos feitos na Agenda para este cliente (particular ou convênio)
  const todas = useFinanceEntries();
  // G1: pelo id do cadastro gravado no fechamento (cliente renomeado continua vendo os próprios); sem id, o nome registrado.
  const fechamentos = todas.filter((e) => e.clientId ? e.clientId === ficha.client.id : clientIdOfRecordedName(e.clientName) === ficha.client.id);
  const aReceber = awaitingFromInsurers(fechamentos);
  const coparticipacao = copayOpen(fechamentos);
  // G3: valor particular em aberto (ex.: sessão tirada do pacote na correção) entra no mesmo resumo.
  const particularAberto = particularOpenCents(fechamentos);
  const extras = [
  aReceber > 0 ? `${brl(aReceber)} a receber do convênio` : '',
  coparticipacao > 0 ? `${brl(coparticipacao)} de coparticipação em aberto` : '',
  particularAberto > 0 ? `${brl(particularAberto)} de atendimento em aberto` : ''].
  filter(Boolean);
  const semPendencia = !temPendenciaFinanceira(ficha.financeiro);
  // "Sem valores em aberto" não convive com valores de convênio em aberto
  const base = ficha.financeiro.tem_registros && !(semPendencia && extras.length > 0) ? resumoFinanceiro(ficha.financeiro) : '';
  const resumo = [base, ...extras].filter(Boolean).join(' · ');
  const totalFin = ficha.financeiro.total + fechamentos.length;
  const temFin = ficha.financeiro.tem_registros || fechamentos.length > 0;

  // Rodada 4: total recebido = lançamentos recebidos + o que entrou nos atendimentos fechados (menos reembolsos).
  const recebidoLancamentos = ficha.financeiro.registros.
  filter((r) => r.status === 'received' && !mesmoAtendimento(r, fechamentos)).
  reduce((t, r) => t + (r.amount_cents ?? 0), 0);
  const recebidoFechamentos = fechamentos.reduce((t, e) => t + Math.max(0, receivedParts(e).reduce((s, p) => s + p.cents, 0) - refundedCents(e.id)), 0);
  const totalRecebido = recebidoLancamentos + recebidoFechamentos;
  // Mesma soma do número "Em aberto" do cartão de números.
  const totalAReceber = ficha.financeiro.em_aberto_cents + aReceber + coparticipacao + particularAberto;
  const semValor = ficha.financeiro.pendencias_sem_valor;
  const temReembolso = fechamentos.some((e) => refundedCents(e.id) > 0);

  /** Rodada 7: o que acontece ao clicar num lançamento (pacote → pacote; avulso → atendimento; sem vínculo → nada). */
  const aberturaDoLancamento = (r: FinancialRecord, titulo: string): {onClick?: () => void;ariaLabel?: string;} => {
    if (r.package_sale_id) return { onClick: () => onAbrirPacote(r.package_sale_id!), ariaLabel: `${titulo}, ${dataBR(r.origin_date)}. Abrir o pacote` };
    const a = atendimentoDoPagamento(r.appointment_id, r.origin_date, r.description);
    return a ? { onClick: () => onAbrirAtendimento(a), ariaLabel: `${titulo}, ${dataBR(r.origin_date)}. Ver o atendimento` } : {};
  };
  /** Rodada 7: atendimento fechado → o mesmo detalhe do atendimento. */
  const aberturaDoFechamento = (e: FinanceEntry) => {
    const a = atendimentoDoPagamento(e.appointmentId, e.iso, e.service);
    return a ? () => onAbrirAtendimento(a) : undefined;
  };

  return (
    <Card as="section" padding="lg" id="bloco-historico" aria-labelledby="historico-titulo" className="scroll-mt-6">
      <h2 id="historico-titulo" className="flex items-center gap-2 text-base font-bold text-text-primary">
        <HistoryIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        Histórico
      </h2>
      <ScrollableTabs className="mt-3">
        <Tabs value={aba} onValueChange={(v: string) => setAba(v as Aba)} fullWidth className="w-full min-w-max">
          <TabsList aria-label="Histórico do cliente" className={tabListNoScroll}>
            <TabsTrigger value="atendimentos" count={ficha.atendimentos_total}>
              Atendimentos
            </TabsTrigger>
            <TabsTrigger value="procedimentos" count={ficha.procedimentos_total}>
              Procedimentos
            </TabsTrigger>
            <TabsTrigger value="financeiro" count={totalFin}>
              Financeiro
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </ScrollableTabs>

      <div className="mt-4">
        {aba === 'atendimentos' && (
        ficha.atendimentos.length === 0 ?
        <Vazio texto={VAZIO.atendimentos} /> :

        <ScrollList ariaLabel={`Atendimentos de ${nome}`} className="flex flex-col gap-2">
              {ficha.atendimentos.map((a) =>
          <li key={a.id} data-testid="item-atendimento">
                  <ItemAtendimento a={a} onAbrir={onAbrirAtendimento} />
                </li>
          )}
            </ScrollList>)
        }

        {aba === 'procedimentos' && (
        ficha.procedimentos.length === 0 ?
        <Vazio texto={VAZIO.procedimentos} /> :

        <ScrollList ariaLabel={`Procedimentos de ${nome}`} className="flex flex-col gap-2">
              {ficha.procedimentos.map((p) => {
            const a = ficha.atendimentos.find((x) => x.id === p.appointment_id);
            return (
              <li key={p.id}>
                    <RecordRow
                  date={dataBR(p.date)}
                  dateDetail={a?.start_time}
                  title={p.service_name}
                  subtitle={<Quem pro={a?.professional ?? (p.professional_name ? { name: p.professional_name } : null)} />}
                  onClick={a ? () => onAbrirAtendimento(a) : undefined}
                  ariaLabel={a ? `${p.service_name}, ${dataBR(p.date)}. Ver detalhes` : undefined} />
                
                  </li>);

          })}
            </ScrollList>)
        }

        {aba === 'financeiro' && (
        !temFin ?
        <Vazio texto={VAZIO.financeiro} /> :

        <>
              {/* Resumo no topo (mesmo jeito dos valores do cartão de pacote): recebido em verde, a receber em alerta. */}
              <div className="mb-4 rounded-inner bg-surface-muted p-3">
                <dl className="flex flex-wrap gap-x-8 gap-y-2 tabular-nums">
                  <div>
                    <dt className="text-xs text-text-muted">Total recebido</dt>
                    <dd className="text-lg font-bold text-success-text">{brl(totalRecebido)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">A receber</dt>
                    <dd className={`text-lg font-bold ${totalAReceber > 0 ? 'text-warning' : 'text-text-primary'}`}>{brl(totalAReceber)}</dd>
                  </div>
                </dl>
                {(extras.length > 0 || semValor > 0) && resumo && <p className="mt-2 text-xs font-semibold text-warning">{resumo}</p>}
                {temReembolso && <p className="mt-1 text-xs text-text-muted">Total recebido já desconta os reembolsos registrados.</p>}
              </div>
              {fechamentos.length > 0 && <FechamentosLista entries={fechamentos} abrirAtendimento={aberturaDoFechamento} />}
              {ficha.financeiro.tem_registros &&
          <>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Lançamentos</h3>
                  <ScrollList ariaLabel={`Lançamentos de ${nome}`} className="flex flex-col gap-2">
                    {ficha.financeiro.registros.map((r) => {
                const titulo = r.package_description ?? r.description ?? 'Lançamento';
                const detalhe = [r.installment_number ? `Parcela ${r.installment_number}/${r.installment_total}` : null, r.method ? rotuloForma(r.method) : null].filter(Boolean).join(' · ');
                const abrir = aberturaDoLancamento(r, titulo);
                return (
                  <li key={r.id}>
                          <RecordRow
                      date={dataBR(r.origin_date)}
                      dateDetail={r.package_sale_id ? 'Pacote' : 'Avulso'}
                      title={titulo}
                      subtitle={detalhe || undefined}
                      aside={
                      <>
                                {r.amount_cents !== null && <span className="text-sm font-bold tabular-nums text-text-primary">{formatarValor(r.amount_cents)}</span>}
                                <PaymentBadge r={r} />
                              </>
                      }
                      onClick={abrir.onClick}
                      ariaLabel={abrir.ariaLabel} />
                    
                        </li>);

              })}
                  </ScrollList>
                </>
          }
            </>)
        }
      </div>
    </Card>);

}

/** Compatibilidade: pacotes + histórico, na ordem da ficha. */
export function ClientHistory({
  ficha,
  pacotes,
  onAbrirAtendimento,
  onAbrirPacote,
  onVenderPacote








}: {ficha: ClientProfileResponse;pacotes: PackageSale[];financeiroAberto?: boolean;onFinanceiroAbertoChange?: (v: boolean) => void;onAbrirAtendimento: (a: AppointmentResponse) => void;onAbrirPacote: (id: string) => void;onVenderPacote?: () => void;}) {
  return (
    <div className="flex flex-col gap-6">
      <PacotesCard ficha={ficha} pacotes={pacotes} onAbrirPacote={onAbrirPacote} onVenderPacote={onVenderPacote} />
      <HistoricoCard ficha={ficha} onAbrirAtendimento={onAbrirAtendimento} onAbrirPacote={onAbrirPacote} />
    </div>);

}