import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { Card, ClientProcess, ProfessionalTag, SituationCards } from '../components/Card';
import { ClientesTabs } from '../components/clientes/ClientesTabs';
import { ReturnSendStatus } from '../components/retornos/ReturnSendStatus';
import { ListPagination, usePaged } from '../components/ui/ListMore';
import { OUTCOME_LABEL, processItems, proColor, proName, shortDate, useFollowUp } from '../data/followUp';
import type { FollowUpCase, Situation } from '../data/followUp';
import { formatBRL } from '../utils/currency';
import { automacoesStore } from '../data/automacoes';
import { useSavedStore } from '../data/iaConfigStore';

const PAGE = 8;

/** Celular × computador por JavaScript (cartões de situação compactos abaixo de 640px). */
function useNarrow() {
  const query = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}
/** Só o CLIQUE de um botão de dentro do cartão é barrado (teclas não: o Esc precisa chegar aos modais). */
const stopClick = (e: React.SyntheticEvent) => e.stopPropagation();

/** Linha curta do que está acontecendo com o cliente (texto visível, nada só em dica). */
function statusLine(c: FollowUpCase) {
  if (c.situation === 'precisa' && c.need) return c.need.title;
  if (c.situation === 'cuidando') return c.next ? `Próxima mensagem em ${shortDate(c.next.plannedIso)}` : 'A Orniplaty está cuidando';
  return c.outcome ? c.outcome.note : 'Resolvido';
}

/**
 * Clientes › Retornos (Lote C, 20/10/2026): SÓ CONSULTA, em todos os modos de envio.
 * Mostra quem fez um serviço com retorno e em que ponto está o acompanhamento (mesma fonte de Oportunidades:
 * `useFollowUp`, motivo Retorno). Clicar no cartão abre o processo inteiro (`ClientProcess`); a única ação é
 * "Abrir em Oportunidades". Sessão de pacote fica fora (D9). Aprovar, chamar, parar e agendar ficam em Oportunidades.
 * Lote A (21/10/2026): os cartões de número do topo são a troca da situação (`SituationCards`), como em Oportunidades.
 */
export function ClientesRetornos() {
  const navigate = useNavigate();
  const narrow = useNarrow();
  const { mode, all } = useFollowUp();
  const campaignOff = !(useSavedStore(automacoesStore).enabled.retorno ?? false);
  const cases = useMemo(() => all.filter((c) => c.motive === 'retorno'), [all]);
  const count = (s: Situation) => cases.filter((c) => c.situation === s).length;
  // Até a clínica escolher, abre em "Precisa de você" se houver alguém lá (os retornos podem chegar depois da 1ª pintura).
  const [chosen, setView] = useState<Situation | null>(null);
  const view: Situation = chosen ?? (count('precisa') > 0 ? 'precisa' : 'cuidando');
  const [expanded, setExpanded] = useState<string[]>([]);
  const rows = useMemo(() => {
    const list = cases.filter((c) => c.situation === view);
    if (view === 'cuidando') return list.slice().sort((a, b) => (a.next?.plannedIso ?? '9999').localeCompare(b.next?.plannedIso ?? '9999'));
    if (view === 'resolvidos') return list.slice().sort((a, b) => (b.outcome?.iso ?? '').localeCompare(a.outcome?.iso ?? ''));
    return list.slice().sort((a, b) => (a.need?.iso ?? '').localeCompare(b.need?.iso ?? ''));
  }, [cases, view]);
  const paged = usePaged(rows, PAGE);
  const back = cases.filter((c) => c.situation === 'resolvidos' && (c.outcome?.kind === 'voltou' || c.outcome?.kind === 'agendou')).length;

  const toggle = (id: string) => setExpanded((l) => l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const openInOpportunities = (c: FollowUpCase) => navigate(`/oportunidades?caso=${encodeURIComponent(c.id)}&cliente=${encodeURIComponent(c.clientId)}`);

  const renderCard = (c: FollowUpCase) => {
    const isOpen = expanded.includes(c.id);
    const o = c.outcome;
    return (
      <li key={c.id}>
        <Card
          as="article"
          variant="interactive"
          padding="md"
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Fechar' : 'Ver'} o processo de ${c.clientName}`}
          onClick={() => toggle(c.id)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              toggle(c.id);
            }
          }}
          className="cursor-pointer">
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-extrabold text-text-primary">{c.clientName}</h3>
                {c.situation === 'precisa' && <StatusBadge status="warning" label="Precisa de você" />}
                {c.situation === 'resolvidos' && o && <StatusBadge status={OUTCOME_LABEL[o.kind].tone} label={OUTCOME_LABEL[o.kind].label} />}
              </div>
              <p className="mt-1 text-sm font-semibold text-text-primary">{statusLine(c)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                <span>
                  {c.service} · {c.model} · {c.deadline}
                </span>
                <ProfessionalTag name={proName(c.professionalId)} color={proColor(c.professionalId)} size="sm" />
                <span className="font-semibold tabular-nums text-text-primary">{formatBRL(c.value)}</span>
              </div>
              <div className="mt-3 border-t border-border pt-3">
                {isOpen ? <ClientProcess title="Processo" items={processItems(c, mode)} /> : <ClientProcess compact items={processItems(c, mode)} />}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2" onClick={stopClick}>
              <Button variant="secondary" size="md" onClick={() => openInOpportunities(c)}>
                Abrir em Oportunidades
              </Button>
            </div>
          </div>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-text-muted">
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            {isOpen ? 'Fechar o processo' : 'Ver o processo inteiro'}
          </span>
        </Card>
      </li>);

  };

  const empty =
  campaignOff && view !== 'resolvidos' ?
  <EmptyState
    title="A campanha de retorno está desligada."
    description="Com ela desligada, a Orniplaty não acompanha nenhum retorno. Ligue em IA Orniplaty › Automações."
    primaryAction={{ label: 'Abrir Automações', onClick: () => navigate('/atendente-ia/automacoes') }} /> :

  view === 'precisa' ?
  <EmptyState title="Nenhum retorno precisa de você agora." description="Quando um cliente não responder ou a hora de chamar chegar com os envios pausados, ele aparece aqui e em Oportunidades." /> :
  view === 'cuidando' ?
  <EmptyState
    title="Nenhum retorno em andamento."
    description="Os retornos começam quando um atendimento de serviço com retorno é fechado sem horário marcado."
    primaryAction={{ label: 'Ver retornos em Serviços e equipe', onClick: () => navigate('/servicos-equipe?aba=servicos') }} /> :


  <EmptyState title="Nenhum retorno resolvido nos últimos 30 dias." />;


  return (
    <DashboardLayout activeId="clientes" title="Clientes" subtitle="Quem são seus clientes e o histórico de cada um">
      <div className="mt-4 flex flex-col gap-3 sm:gap-4">
        <ClientesTabs active="retornos" />

        <section aria-labelledby="retornos-titulo" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1 basis-72">
              <h2 id="retornos-titulo" className="text-lg font-extrabold text-text-primary">
                Retornos
              </h2>
              <p className="mt-0.5 text-sm text-text-secondary">Quem fez um serviço com retorno e em que ponto está o acompanhamento. Para agir, abra o cliente em Oportunidades.</p>
            </div>
          </div>
        </section>

        <ReturnSendStatus />

        {/* Lote A (21/10/2026; DS v3.10): os cartões de número SÃO a troca da situação (mesmo padrão de Oportunidades). */}
        <SituationCards
          label="Situação dos retornos"
          value={view}
          onChange={(v: string) => {
            setView(v as Situation);
            paged.setPage(1);
          }}
          compact={narrow}
          options={[
          { value: 'precisa', label: 'Precisam de você', shortLabel: 'Precisam de você', count: count('precisa'), description: count('precisa') === 1 ? 'cliente' : 'clientes' },
          { value: 'cuidando', label: 'A Orniplaty está cuidando', shortLabel: 'Está cuidando', count: count('cuidando'), description: count('cuidando') === 1 ? 'cliente' : 'clientes' },
          { value: 'resolvidos', label: 'Resolvidos', count: count('resolvidos'), description: `${back} ${back === 1 ? 'voltou ou agendou' : 'voltaram ou agendaram'} · últimos 30 dias` }]
          } />
        

        {rows.length === 0 ?
        empty :

        <ul className="flex flex-col gap-3" aria-label="Retornos">
            {paged.pageItems.map(renderCard)}
          </ul>
        }
        <ListPagination page={paged.page} totalPages={paged.totalPages} onPageChange={paged.setPage} totalItems={rows.length} pageSize={PAGE} itemLabel="retornos" />
      </div>
    </DashboardLayout>);

}