import { wordsNow } from '../../data/segment';
import React from 'react';
import { CalendarCheckIcon, CalendarClockIcon, ChevronRightIcon, HistoryIcon, PhoneIcon, TagIcon, WalletIcon } from 'lucide-react';
import { Avatar } from '../Avatar';
import { StatusBadge } from '../StatusBadge';
import { Card } from '../Card';
import { Button } from '../Button';
import type { AppointmentResponse, ClientProfileResponse, ClientTagRef } from '../../data/api/clientes';
import { clientIdOfRecordedName } from '../../data/api/clientes';
import { VAZIO, contatos, dataBR, dataHoraBR, resumoFinanceiro, temPendenciaFinanceira } from '../../data/fichaLib';
import { awaitingFromInsurers, brl, copayOpen, particularOpenCents, useFinanceEntries } from '../../data/convenios';

/** §3.F (regra única de etiquetas): tag do cliente = etiqueta CINZA neutra, sem bolinha; tag desativada = "muted". */
export function TagBadge({ tag }: {tag: ClientTagRef;}) {
  return (
    <span title={tag.is_active ? undefined : `Tag desativada no catálogo ${wordsNow().of}`}>
      <StatusBadge status={tag.is_active ? 'neutral' : 'muted'} label={tag.name} showDot={false} />
    </span>);

}

/**
 * Cartão-resumo. A borda é do cartão inteiro (não da área clicável), então uma ação extra
 * fica sempre DENTRO da borda, sem vazar para fora do cartão.
 */
function Dado({
  icon, rotulo, valor, detalhe, alerta, onClick, extra, ariaLabel
}: {icon: React.ReactNode;rotulo: string;valor: string;detalhe?: string | null;alerta?: boolean;onClick?: () => void;extra?: React.ReactNode;ariaLabel?: string;}) {
  const body =
  <>
      <span className="flex items-center gap-2 text-xs font-semibold text-text-muted">
        {icon}
        {rotulo}
      </span>
      <span className={`mt-1 block text-sm font-bold ${alerta ? 'text-warning' : 'text-text-primary'}`}>{valor}</span>
      {detalhe && <span className="mt-0.5 block text-xs text-text-secondary">{detalhe}</span>}
    </>;

  return (
    <div className={`flex min-h-[96px] min-w-0 flex-col rounded-2xl border border-border bg-white shadow-sm ${onClick ? 'transition-colors hover:border-primary' : ''}`}>
      {onClick ?
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `${rotulo}: ${valor}. Ver detalhes`}
        className="group flex w-full flex-1 cursor-pointer items-start justify-between gap-2 rounded-2xl p-4 text-left transition-colors hover:bg-hover-surface active:bg-active-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        
          <span className="min-w-0">{body}</span>
          <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted group-hover:text-primary" aria-hidden="true" />
        </button> :

      <div className="min-w-0 flex-1 p-4">{body}</div>
      }
      {extra && <div className="px-4 pb-4">{extra}</div>}
    </div>);

}

/**
 * Cabeçalho do cliente em duas colunas: identidade à esquerda (centralizada na vertical em relação aos quatro
 * cartões) e os quatro cartões-resumo à direita (2×2). Abaixo de 1024px as colunas empilham.
 * "Financeiro" soma o que ainda falta receber do convênio e a coparticipação em aberto.
 * Acompanhamento (Lote C, 20/10/2026): resumo do acompanhamento da Orniplaty (mesma fonte de Oportunidades). Clicar leva
 * ao cartão "Acompanhamento" da ficha; as ações ficam em Oportunidades (o antigo "Próximo retorno recomendado" saiu).
 */
export function ClientHeader({
  ficha,
  followUp,
  onEditTags,
  onAbrirAtendimento,
  onAbrirFinanceiro,
  onOpenFollowUp









}: {ficha: ClientProfileResponse; /** Resumo do acompanhamento (nulo = nenhum). */followUp?: {valor: string;detalhe: string;alerta: boolean;} | null; /** Ausente = ficha só de consulta (cliente arquivado, G4 F-069). */onEditTags?: () => void;onAbrirAtendimento: (a: AppointmentResponse) => void;onAbrirFinanceiro: () => void;onOpenFollowUp: () => void;}) {
  const { client, ultimo_atendimento: ultimo, proximo_agendamento: proximo } = ficha;
  const tels = contatos(client.phone, client.landline_phone);
  const agendamento = proximo ? dataHoraBR(proximo.date, proximo.start_time) : null;
  // P4 (28/10/2026): mesmos fechamentos e mesmo valor particular em aberto do bloco Financeiro (ClientHistory), pelo id do cadastro.
  const fechamentos = useFinanceEntries().filter((e) => e.clientId ? e.clientId === client.id : clientIdOfRecordedName(e.clientName) === client.id);
  const aReceber = awaitingFromInsurers(fechamentos);
  const coparticipacao = copayOpen(fechamentos);
  const particularAberto = particularOpenCents(fechamentos);
  const semPendencia = !temPendenciaFinanceira(ficha.financeiro);
  const partes = [aReceber > 0 ? `${brl(aReceber)} a receber do convênio` : '', coparticipacao > 0 ? `${brl(coparticipacao)} de coparticipação em aberto` : '', particularAberto > 0 ? `${brl(particularAberto)} de atendimento em aberto` : ''].filter(Boolean);
  // "Sem valores em aberto" não convive com valores de convênio em aberto
  const substitui = semPendencia && partes.length > 0;
  // Só fechamentos da Agenda, todos quitados: o resumo não diz "nenhuma informação" ao lado de um fechamento pago.
  const finValor = substitui ? partes[0] : !ficha.financeiro.tem_registros && fechamentos.length > 0 ? 'Sem valores em aberto.' : resumoFinanceiro(ficha.financeiro);
  const finDetalhe = (substitui ? partes.slice(1) : partes).join(' · ') || null;
  const finAlerta = !semPendencia || partes.length > 0;

  return (
    <Card as="section" padding="lg" aria-label="Identificação e resumo do cliente">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={client.name} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="break-words text-2xl font-bold leading-tight text-text-primary">{client.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
              <PhoneIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
              {tels.map((c) =>
              <span key={c.rotulo} className="tabular-nums">
                  {c.rotulo === 'WhatsApp' ? c.valor : `${c.rotulo}: ${c.valor}`}
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Tags do cliente">
              {client.tag_items.map((t) =>
              <TagBadge key={t.id} tag={t} />
              )}
              {onEditTags &&
              <Button size="sm" variant="secondary" onClick={onEditTags} leftIcon={<TagIcon className="h-4 w-4" />}>
                {client.tag_items.length ? 'Editar tags' : 'Adicionar tags'}
              </Button>
              }
            </div>
            <p className="text-xs text-text-secondary">
              {[
              `Origem: ${client.origin?.name ?? VAZIO.origem}`,
              client.first_contact_at ? `Primeiro contato: ${dataBR(client.first_contact_at)}` : null,
              `${client.completed_appointments} ${client.completed_appointments === 1 ? 'atendimento realizado' : 'atendimentos realizados'}`].

              filter(Boolean).
              join(' · ')}
            </p>
          </div>
        </div>

        <section aria-label="Resumo do cliente" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dado
            icon={<HistoryIcon className="h-3.5 w-3.5" aria-hidden="true" />}
            rotulo="Último atendimento"
            valor={ultimo ? dataBR(ultimo.date)! : VAZIO.ultimoAtendimento}
            detalhe={ultimo ? `${ultimo.service?.name ?? 'Sem procedimento registrado'}${ultimo.professional ? ` · ${ultimo.professional.name}` : ''}` : null}
            onClick={ultimo ? () => onAbrirAtendimento(ultimo) : undefined} />
          
          <Dado
            icon={<WalletIcon className="h-3.5 w-3.5" aria-hidden="true" />}
            rotulo="Financeiro"
            valor={finValor}
            detalhe={finDetalhe}
            alerta={finAlerta}
            onClick={onAbrirFinanceiro} />
          
          <Dado
            icon={<CalendarClockIcon className="h-3.5 w-3.5" aria-hidden="true" />}
            rotulo="Acompanhamento"
            valor={followUp ? followUp.valor : 'Nenhum acompanhamento'}
            detalhe={followUp ? followUp.detalhe : 'Começa quando um atendimento com retorno é fechado sem horário marcado.'}
            alerta={followUp?.alerta}
            ariaLabel={followUp ? `Acompanhamento: ${followUp.valor}. Ver o processo` : undefined}
            onClick={followUp ? onOpenFollowUp : undefined} />
          
          <Dado
            icon={<CalendarCheckIcon className="h-3.5 w-3.5" aria-hidden="true" />}
            rotulo="Próximo agendamento"
            valor={agendamento ?? VAZIO.proximoAgendamento}
            detalhe={proximo ? `${proximo.service?.name ?? ''} · ${proximo.professional?.name ?? ''}` : null}
            onClick={proximo ? () => onAbrirAtendimento(proximo) : undefined} />
          
        </section>
      </div>
    </Card>);

}