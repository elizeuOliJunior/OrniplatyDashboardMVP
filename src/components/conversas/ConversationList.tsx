import React, { useRef } from 'react';
import { ListFilterIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { ConversationListItem, Dropdown, EmptyState, Input, Pill, SkeletonList, Tabs, TabsList, TabsTrigger } from '../Card';
import type { StatusDotTone } from '../Card';
import { ScrollableTabs } from '../ui/ScrollableTabs';
import { byLongestWait, conversationFilters, inQueue, matchesFilter, waitMinutes, waitingOf, withAssistant, withTeam } from '../../data/conversas';
import { conversationSummaries, conversationThreads } from '../../data/conversasThreads';
import { agoLabel, reasonLine, replyWindow, useConversasScenario, waitBadge } from '../../data/replyWindow';
import { useAccountSummary } from '../../data/settingsStore';
import type { Conversation, ConversationFilter } from '../../data/conversas';

/** T1 1b · quem atende, curto, para a linha 3 do item (regra única de etiquetas, §3.F). */
export function listHandler(conv: Conversation, answering: boolean): {tone: StatusDotTone;label: string;} {
  if (conv.resolved) return { tone: 'off', label: 'Resolvida' };
  if (inQueue(conv)) return { tone: 'waiting', label: 'Aguardando você' };
  // W4 (G7): “Pausada” saiu; com a equipe (inclusive a conversa da assistente parada ou desligada) = “Com você”.
  if (withTeam(conv)) return { tone: 'team', label: 'Com você' };
  return answering ? { tone: 'assistant', label: 'Assistente' } : { tone: 'off', label: 'Assistente parada' };
}

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * L8 (17/11/2026, só visual): tempo de espera em forma curta na LISTA, para caber na linha de altura fixa a 1280, 1512 e
 * 390 px: "há 20 min" → "20 min"; "há 1h10" → "1h10"; "há 2 dias" → "2 dias"; "desde ontem, 11h01" → "ontem"
 * ("ontem, 11h01" ainda era cortado a 1512 px: a etiqueta tem ~70 px). A hora de início continua no painel da direita
 * ("Esperando desde ontem, 11h01") e na conversa. Mesmo número e mesma cor por urgência (`waitBadge`).
 */
const shortWait = (label: string) => {
  const since = label.match(/^desde ([^,]+),/);
  if (since) return since[1];
  return label.replace(/^há\s+/, '');
};

/**
 * L6 (16/11/2026, só visual): o texto de dentro da busca ficou mais curto ("Nome, telefone ou mensagem") para caber
 * inteiro a 390 px; o nome do campo para leitor de tela continua "Buscar conversas". A busca faz o mesmo de antes.
 * L21 (17/11/2026, V5 e L12 item 11): as abas de filtro quebravam linha em todas as larguras.
 * L22 (17/11/2026, decisão do arquiteto em 09-pedidos; desfaz parte do L21): a partir de 768 px as abas ficam numa linha
 * só, com a rolagem lateral do `ScrollableTabs` do DS (barra fina embaixo, desliza com o dedo); abaixo de 768 px quebram
 * linha, como no L21. Nada fica cortado sem como chegar.
 * L22 (DS 6.1): os vazios da lista usam `EmptyState variant="dotted"` (inclusive "busca sem resultado", antes texto solto).
 */
export function ConversationList({
  items,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  orniOnly,
  onOrniOnlyChange,
  query,
  onQueryChange










}: {items: Conversation[];selectedId: string;onSelect: (id: string) => void;filter: ConversationFilter;onFilterChange: (f: ConversationFilter) => void;orniOnly: boolean;onOrniOnlyChange: (v: boolean) => void;query: string;onQueryChange: (q: string) => void;}) {
  const answering = useAccountSummary().assistant.answering;
  const scenario = useConversasScenario();
  const offHours = scenario === 'fora-do-horario';
  const listRef = useRef<HTMLDivElement>(null);

  const q = norm(query.trim());
  const digits = query.replace(/\D/g, '');
  const matchesQuery = (c: Conversation) => {
    if (!q) return true;
    if (norm(c.name).includes(q) || norm(c.preview).includes(q)) return true;
    const phone = (conversationSummaries[c.id]?.phone ?? '').replace(/\D/g, '');
    if (digits.length >= 3 && phone.includes(digits)) return true;
    return (conversationThreads[c.id] ?? []).some((m) => m.text && norm(m.text).includes(q));
  };
  const base = items.filter((c) => matchesQuery(c) && (!orniOnly || c.fromAiOutreach));
  const count = (f: ConversationFilter) => base.filter((c) => matchesFilter(c, f)).length;
  const visible = base.filter((c) => matchesFilter(c, filter));
  const ordered = filter === 'aguardando' ? [...visible].sort(byLongestWait) : visible;

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-conv]') ?? [])];
    if (!buttons.length) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : e.key === 'ArrowDown' ? Math.min(buttons.length - 1, at + 1) : Math.max(0, at - 1);
    e.preventDefault();
    buttons[next]?.focus();
  };

  const empty =
  filter === 'aguardando' && !q ?
  <EmptyState size="sm" variant="dotted" icon={<UsersIcon />} title="Ninguém esperando por você agora." description="Quando a assistente pedir ajuda, não responder um cliente em 15 minutos ou estiver parada, ou quando um cliente escrever numa conversa que está com você, a conversa aparece aqui." /> :
  filter === 'comvoce' && !q ?
  <EmptyState size="sm" variant="dotted" icon={<UsersIcon />} title="Nenhuma conversa com a sua equipe agora." description="Quando alguém da equipe responde ou assume uma conversa, ela fica aqui até ser devolvida. Depois de 2 horas sem resposta da equipe, volta sozinha para a assistente." /> :
  filter === 'resolvidas' && !q ?
  <EmptyState size="sm" variant="dotted" icon={<UsersIcon />} title="Nenhuma conversa resolvida." description="Quando você resolver uma conversa da fila, ela aparece aqui." /> :

  <EmptyState size="sm" variant="dotted" icon={<SearchIcon />} title={q ? 'Nenhuma conversa encontrada para essa busca.' : 'Nenhuma conversa neste filtro.'} />;


  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <Input aria-label="Buscar conversas" placeholder="Nome, telefone ou mensagem" value={query} onChange={(e) => onQueryChange(e.target.value)} prefix={<SearchIcon className="h-4 w-4 text-text-muted" />} />
        <div className="flex items-start gap-1">
          <ScrollableTabs fade="surface" className="min-w-0 flex-1">
            <Tabs value={filter} onValueChange={(v) => onFilterChange(v as ConversationFilter)} variant="pills" size="sm">
              <TabsList aria-label="Filtrar conversas" className="flex-wrap md:w-max md:min-w-max md:flex-nowrap">
                {conversationFilters.map((f) =>
                <TabsTrigger key={f.value} value={f.value} count={count(f.value)}>
                    {f.label}
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
          </ScrollableTabs>
          <Dropdown
            triggerLabel="Filtrar"
            trigger={
            <>
                <ListFilterIcon className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Filtrar</span>
              </>
            }
            className="shrink-0 [&>button]:h-9 [&>button]:w-9 [&>button]:justify-center [&>button]:px-0"
            items={[
            { type: 'label', id: 'origem', label: 'Origem' },
            { id: 'todas-origens', label: 'Todas as conversas', description: orniOnly ? undefined : 'Filtro atual', onSelect: () => onOrniOnlyChange(false) },
            { id: 'orni', label: 'Iniciadas pela Orniplaty', description: orniOnly ? 'Filtro atual' : 'Reativação, retorno, lista de espera…', onSelect: () => onOrniOnlyChange(true) }]
            } />
          
        </div>
        {orniOnly &&
        <div>
            <Pill size="sm" selected onRemove={() => onOrniOnlyChange(false)}>
              Iniciadas pela Orniplaty
            </Pill>
          </div>
        }
      </div>

      {scenario === 'carregando' ?
      <div className="p-4">
          <SkeletonList rows={6} />
        </div> :

      <div ref={listRef} onKeyDown={onListKey} className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Conversas">
          {ordered.length === 0 && <div className="p-4">{empty}</div>}
          {ordered.map((conv) => {
          const queued = inQueue(conv);
          const mins = queued ? waitMinutes(conv) : 0;
          const fullBadge = queued ? waitBadge(mins, offHours) : null;
          // L8: forma curta só na lista; o tom (cor por urgência) é o mesmo.
          const badge = fullBadge ? { ...fullBadge, label: shortWait(fullBadge.label) } : null;
          const closed = replyWindow(conv.lastInboundAt, conv.windowClosed).band === 'fechada';
          // R3 (06/11/2026, Christian, A-12): a espera pode ser derivada (assistente desligada), por isso `waitingOf` e não `conv.waiting`.
          const w = queued ? waitingOf(conv) : undefined;
          const reason = w ? reasonLine(w.reason, w.kind) : '';
          const preview = conv.preview;
          const [prefix, rest] = /^(Você|Assistente):\s/.test(preview) ? [preview.slice(0, preview.indexOf(':') + 1), preview.slice(preview.indexOf(':') + 2)] : [undefined, preview];
          return (
            <div role="listitem" key={conv.id}>
                <ConversationListItem
                name={conv.name}
                time={conv.time}
                text={queued ? reason : rest}
                prefix={queued ? undefined : prefix}
                emphasis={queued}
                srPrefix={queued ? 'Aguardando você: ' : undefined}
                handler={listHandler(conv, answering)}
                wait={badge}
                waitText={queued && (!badge || offHours) ? shortWait(agoLabel(mins)) : undefined}
                windowClosed={closed}
                unread={conv.unread}
                selected={conv.id === selectedId}
                onClick={() => onSelect(conv.id)}
                buttonProps={{ 'data-conv': conv.id }} />
              
              </div>);

        })}
        </div>
      }
    </div>);

}

export { withAssistant };