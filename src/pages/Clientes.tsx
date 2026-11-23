import { LoadErrorGate } from '../components/ui/LoadErrorGate';
import React, { useMemo, useRef, useState } from 'react';
import { ArchiveRestoreIcon, SearchIcon, TagsIcon } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Button } from '../components/Button';
import { Card, EmptyState, KpiStatCard, ProfessionalTag } from '../components/Card';
import { Input } from '../components/Input';
import { Pill } from '../components/Pill';
import { ClientsTable } from '../components/clientes/ClientsTable';
import { ClientesTabs } from '../components/clientes/ClientesTabs';
import { ClientesHeaderActions } from '../components/clientes/ClientesHeaderActions';
import { NovoAgendamentoModal } from '../components/modals/NovoAgendamentoModal';
import { TagManagerModal } from '../components/client/TagManagerModal';
import { PickerPopover } from '../components/ui/PickerPopover';
import { FilterButton } from '../components/ui/FilterButton';
import { toolbarClass } from '../components/ui/styles';
import { useToast } from '../components/ui/Toast';
import { restoreClient, useClients, useTagCatalog } from '../data/api/clientes';
import type { ClientResponse } from '../data/api/clientes';
import { tryAddAppointment, useAgendaData } from '../data/agendaLive';
import { useAgendaProfessionals } from '../data/availability';
import { useFinanceEntries } from '../data/convenios';
import { TODAY_ISO } from '../data/agendaStore';
import { addDays, deltaPct, dm } from '../data/resultadosDemo';

type Payer = 'particular' | 'convenio';

/** Janela dos indicadores: últimos 30 dias pelo relógio único, comparados com os 30 dias anteriores. */
const WINDOW_DAYS = 30;
const COMPARE_LABEL = 'vs. 30 dias anteriores';

/**
 * Rodada de 11/11/2026 (pedido do Christian, referência: lista de pacientes do Tend): resumo de clientes no topo da aba.
 * Segue os indicadores de Resultados em tudo: mesma peça (`KpiStatCard`), "i" com a definição, etiqueta de comparação
 * (`deltaPct`, a mesma de Resultados) e sem texto abaixo do número. Período fixo: últimos 30 dias contra os 30 anteriores
 * (a aba não tem seletor de período). Decisão do Christian (11/11): só entram cartões que TÊM comparação de verdade;
 * "Retornos" (sem histórico da situação) e "Não recebem mensagens" (sem base no período anterior) ficaram de fora.
 * L7 (16/11/2026, etapa de facilidade de uso): tamanho compacto do DS (`size="sm"`) na grade de indicadores do DS
 * (`sm:grid-cols-2 lg:grid-cols-4`), em vez de dois cartões esticados até metade da tela cada.
 */
function ClientesResumo() {
  const ativos = useClients();
  const from = addDays(TODAY_ISO, -WINDOW_DAYS);
  const prevFrom = addDays(from, -WINDOW_DAYS);
  const created = (c: ClientResponse) => c.created_at.slice(0, 10);

  const total = ativos.length;
  const totalAntes = ativos.filter((c) => created(c) < from).length;
  const novos = ativos.filter((c) => created(c) >= from).length;
  const novosAntes = ativos.filter((c) => created(c) >= prevFrom && created(c) < from).length;

  return (
    <section aria-label="Resumo dos clientes" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiStatCard
        size="sm"
        className="min-w-0"
        label="Clientes"
        value={total}
        format="number"
        delta={deltaPct(total, totalAntes)}
        deltaLabel={COMPARE_LABEL}
        info={`Clientes ativos no cadastro (arquivados não entram). A comparação usa quantos já estavam cadastrados em ${dm(from)}: ${totalAntes}.`} />
      
      <KpiStatCard
        size="sm"
        className="min-w-0"
        label="Novos em 30 dias"
        value={novos}
        format="number"
        delta={deltaPct(novos, novosAntes)}
        deltaLabel={COMPARE_LABEL}
        info={`Clientes cadastrados desde ${dm(from)}: pela primeira mensagem no WhatsApp, à mão ou por planilha. Nos 30 dias anteriores foram ${novosAntes}.`} />
      
    </section>);

}

/**
 * Lista de clientes. Busca por nome ou telefone e tags são o que GET /api/clients aceita; "profissional" e "particular
 * x convênio" são filtros do protótipo calculados só com dados que existem aqui (agenda e atendimentos fechados).
 * Rodada de 11/11/2026 (faixa do topo na linha do título, decisão do Christian): "Importar planilha" e "Novo cliente"
 * saíram da direita do título e ficam na barra da lista, à direita (mesmo jeito de Clientes › Pacotes com "Vender pacote").
 * L22e (18/11/2026, DS 6.1): "Arquivados" sem nenhum cliente usa `EmptyState size="sm" variant="dotted"` (antes, texto
 * dentro de um cartão vazio); mesmo texto. Com clientes, a lista continua no mesmo cartão.
 * L24b (18/11/2026, pedido 2 do Christian; DS 6.2 › Profissional): em Filtros › Profissional e no filtro ativo, cada
 * profissional aparece com a bolinha da cor dele (`ProfessionalTag size="sm"`, a mesma peça de toda a Agenda). A pílula,
 * o ✓ e o filtro não mudaram.
 */
export function Clientes() {
  const toast = useToast();
  const catalog = useTagCatalog();
  // G1 (F-003): filtro de profissional lê a equipe viva (todos, inclusive arquivados: o histórico do cliente pode citá-los).
  const pros_ = useAgendaProfessionals();
  const { appointments } = useAgendaData();
  const finance = useFinanceEntries();
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [pros, setPros] = useState<string[]>([]);
  const [payer, setPayer] = useState<Payer | null>(null);
  const [panel, setPanel] = useState(false);
  const [mostrar, setMostrar] = useState<'ativos' | 'arquivados'>('ativos');
  const [gerenciar, setGerenciar] = useState(false);
  const [agendando, setAgendando] = useState<ClientResponse | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);

  const validTags = tags.filter((id) => catalog.some((t) => t.id === id));
  const base = useClients({ search: query, tags: validTags, archived: mostrar === 'arquivados' ? 'only' : 'hide' });
  const arquivadosTotal = useClients({ archived: 'only' }).length;

  // profissional: quem tem agendamento (não cancelado) com o cliente na agenda
  const prosByClient = useMemo(() => {
    const m = new Map<string, Set<string>>();
    Object.values(appointments).forEach((list) =>
    list.forEach((a) => {
      if (a.status === 'cancelled') return;
      if (!m.has(a.clientName)) m.set(a.clientName, new Set());
      m.get(a.clientName)!.add(a.professionalId);
    })
    );
    return m;
  }, [appointments]);
  // pagador: só de atendimentos fechados; cliente sem fechamento não entra em nenhum dos dois
  const payersByClient = useMemo(() => {
    const m = new Map<string, Set<Payer>>();
    finance.forEach((e) => {
      if (!m.has(e.clientName)) m.set(e.clientName, new Set());
      m.get(e.clientName)!.add(e.payer);
    });
    return m;
  }, [finance]);

  const rows = base.filter((c) => (pros.length === 0 || pros.some((p) => prosByClient.get(c.name)?.has(p))) && (!payer || payersByClient.get(c.name)?.has(payer)));
  // L19: sem paginação (DS 5.1). Total de clientes ativos para a linha de contagem "{n} de {N} clientes".
  const totalAtivos = useClients().length;
  const activeCount = validTags.length + pros.length + (payer ? 1 : 0);
  const reset = () => {
    setTags([]);
    setPros([]);
    setPayer(null);
  };
  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, v: T) => {
    set((l) => l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  };
  const tagName = (id: string) => catalog.find((t) => t.id === id)?.name ?? id;
  const proName = (id: string) => pros_.byId(id)?.name ?? id;
  const proColor = (id: string) => pros_.byId(id)?.color;
  const payerName = (p: Payer) => p === 'particular' ? 'Particular' : 'Convênio';
  const hasFinance = finance.length > 0;

  // L24b: `content` = o que a pílula mostra (no filtro de profissional, com a bolinha); `label` continua sendo o texto
  // lido pelo leitor de tela no X ("Remover filtro Profissional: Rafael").
  const chips: {key: string;label: string;content?: React.ReactNode;remove: () => void;}[] = [
  ...validTags.map((id) => ({ key: `t${id}`, label: `Tag: ${tagName(id)}`, remove: () => toggle(setTags, id) })),
  ...pros.map((id) => ({
    key: `p${id}`,
    label: `Profissional: ${proName(id)}`,
    content:
    <span className="inline-flex items-center gap-1">
          Profissional: <ProfessionalTag name={proName(id)} color={proColor(id)} size="sm" />
        </span>,

    remove: () => toggle(setPros, id)
  })),
  ...(payer ? [{ key: 'pay', label: `Pagador: ${payerName(payer)}`, remove: () => setPayer(null) }] : [])];


  const group = (title: string, children: React.ReactNode, hint?: string) =>
  <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </fieldset>;


  return (
    <DashboardLayout activeId="clientes" title="Clientes" subtitle="Quem são seus clientes e o histórico de cada um">
      <div className="mt-4 flex flex-col gap-5">
        <ClientesTabs active="clientes" />

        <ClientesResumo />

        {/* Barra padrão: busca + Filtros + Gerenciar tags juntos (40px); "Limpar filtros" só aparece com filtro ativo.
             À direita: Importar planilha + Novo cliente (rodada de 11/11/2026, padrão de Clientes › Pacotes). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            aria-label="Buscar por nome ou telefone"
            placeholder="Buscar por nome ou telefone"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            prefix={<SearchIcon className="h-4 w-4 text-text-muted" />}
            containerClassName="w-full sm:max-w-sm sm:flex-1" />
          
          <div className={toolbarClass}>
            <FilterButton ref={anchor} count={activeCount} open={panel} onClick={() => setPanel((v) => !v)} />
            <Button variant="secondary" leftIcon={<TagsIcon className="h-4 w-4" />} onClick={() => setGerenciar(true)}>
              Gerenciar tags
            </Button>
            {activeCount > 0 &&
            <Button variant="ghost" onClick={reset}>
                Limpar filtros
              </Button>
            }
          </div>
          <div className="sm:ml-auto">
            <ClientesHeaderActions />
          </div>
        </div>

        <PickerPopover open={panel} anchorRef={anchor} onClose={() => setPanel(false)} width={360} label="Filtros de clientes" role="dialog" padding>
          <div className="flex flex-col gap-5">
            {group(
              'Tags (uma ou mais)',
              catalog.filter((t) => t.is_active).length === 0 ? <p className="text-sm text-text-muted">Nenhuma tag ativa.</p> : catalog.filter((t) => t.is_active).map((t) =>
              <Pill key={t.id} size="sm" selected={validTags.includes(t.id)} onClick={() => toggle(setTags, t.id)}>
                  {t.name}
                </Pill>
              )
            )}
            {group(
              'Profissional',
              pros_.all.map((p) =>
              <Pill key={p.id} size="sm" selected={pros.includes(p.id)} onClick={() => toggle(setPros, p.id)}>
                  <ProfessionalTag name={p.name} color={p.color} size="sm" />
                </Pill>
              ),
              'Clientes com agendamento ou atendimento com o profissional.'
            )}
            {group(
              'Pagador',
              (['particular', 'convenio'] as Payer[]).map((p) =>
              <Pill key={p} size="sm" selected={payer === p} onClick={() => setPayer(payer === p ? null : p)}>
                  {payerName(p)}
                </Pill>
              ),
              hasFinance ? 'Considera os atendimentos já fechados.' : 'Ainda não há atendimentos fechados: o filtro só passa a encontrar clientes depois do primeiro fechamento.'
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-sm text-text-secondary" aria-live="polite">{rows.length} {rows.length === 1 ? 'cliente' : 'clientes'}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="neutral" disabled={activeCount === 0} onClick={reset}>
                  Limpar
                </Button>
                <Button size="sm" onClick={() => setPanel(false)}>
                  Ver resultados
                </Button>
              </div>
            </div>
          </div>
        </PickerPopover>

        {chips.length > 0 &&
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
            {chips.map((c) =>
          // G5 P8: filtro ativo = Pill removível do DS v3.18 (X de 32×32, aria "Remover filtro <rótulo>").
          <Pill key={c.key} size="sm" selected onRemove={c.remove} removeLabel={`filtro ${c.label}`}>
                {c.content ?? c.label}
              </Pill>
          )}
          </div>
        }

        {(arquivadosTotal > 0 || mostrar === 'arquivados') &&
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mostrar clientes">
            <Pill size="sm" selected={mostrar === 'ativos'} onClick={() => setMostrar('ativos')}>
              Ativos
            </Pill>
            <Pill size="sm" selected={mostrar === 'arquivados'} onClick={() => setMostrar('arquivados')}>
              Arquivados ({arquivadosTotal})
            </Pill>
          </div>
        }

        {mostrar === 'arquivados' ?
        rows.length === 0 ?
        <EmptyState size="sm" variant="dotted" title="Nenhum cliente arquivado." /> :

        <Card padding="none">
              <ul className="divide-y divide-border" aria-label="Clientes arquivados">
                {rows.map((c) =>
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-text-primary">{c.name}</p>
                      <p className="text-xs tabular-nums text-text-secondary">{c.phone}</p>
                    </div>
                    <Button
                size="sm"
                variant="secondary"
                leftIcon={<ArchiveRestoreIcon className="h-4 w-4" />}
                onClick={() => {
                  restoreClient(c.id);
                  toast({ title: `${c.name} foi restaurado` });
                }}>
                
                      Restaurar
                    </Button>
                  </li>
            )}
              </ul>
            </Card> :


        <>
            <LoadErrorGate k="clientes" what="a lista de clientes">
              {/* L19 (17/11/2026, pedido do Christian; DS 5.1 › Listas de registros): a lista inteira, sem números de página;
                 a página rola e o cabeçalho da tabela fica preso. A contagem que ficava na paginação ("Mostrando 1–8 de 15
                 clientes") vem para cima da lista: "15 clientes"; com busca ou filtro, "{n} de {N} clientes".
                 RV10 (20/11/2026): a contagem e a tabela formam um grupo, a 8 px uma da outra; a barra fica a 20 px da contagem. */}
              <div className="flex flex-col gap-2">
              <p className="text-sm text-text-secondary" aria-live="polite">
                {query.trim() || activeCount > 0 ?
                <>
                    <span className="font-semibold text-text-primary">{rows.length}</span> de <span className="font-semibold text-text-primary">{totalAtivos}</span> clientes
                  </> :

                <>
                    <span className="font-semibold text-text-primary">{rows.length}</span> {rows.length === 1 ? 'cliente' : 'clientes'}
                  </>
                }
              </p>
              <ClientsTable rows={rows} onAgendar={setAgendando} />
              </div>
            </LoadErrorGate>
          </>
        }
      </div>

      <TagManagerModal open={gerenciar} onClose={() => setGerenciar(false)} />
      <NovoAgendamentoModal open={!!agendando} onClose={() => setAgendando(null)} defaults={agendando ? { client: agendando.name } : undefined} onSaved={(data) => tryAddAppointment(data)} />
    </DashboardLayout>);

}