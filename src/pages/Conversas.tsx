import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BotIcon, CircleUserRoundIcon } from 'lucide-react';
import { LoadErrorGate } from '../components/ui/LoadErrorGate';
import { DashboardLayout, setSidebarCollapsed, useSidebarCollapsed } from '../components/dashboard/DashboardLayout';
import * as DesignSystem from '../components/Card';
import { Modal } from '../components/Card';
import { ConversationList } from '../components/conversas/ConversationList';
import { ConversationThread } from '../components/conversas/ConversationThread';
import { ClientSummaryPanel } from '../components/conversas/ClientSummaryPanel';
import { NoConversationSelected, WaitingPanel } from '../components/conversas/NoConversationSelected';
import { StatChip, StatChipGroup, useToast } from '../components/Card';
import { conversations, waitingCount, withAssistant } from '../data/conversas';
import type { Conversation, ConversationFilter } from '../data/conversas';
import { checkHolds, conversationSummaries, conversationThreads, ensureConversation, handBack, patchConversation, sendTeamMessage, takeOver, takeReturned, useConversations } from '../data/conversasThreads';
import { clientById } from '../data/api/clientes';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { useAssistantPower } from '../components/atendente-ia/AssistantPower';
import { useAccountSummary, useSettings } from '../data/settingsStore';
import { assistantStopNotice } from '../data/assistantStopNotice';
import { useGuardedNavigate } from '../components/ui/UnsavedChanges';
import { NOW } from '../data/agendaStore';

/**
 * T1 1e (05/11, Christian): o indicador "Com a assistente" usa o ícone da Orniplaty, o MESMO do item "IA Orniplaty" do
 * menu (`OrniMarkIcon` do DS; cai no BotIcon só se o pacote do DS não tiver a peça, igual ao menu).
 * T1 1f (05/11, Christian: "um pouco menor"): 12 px em vez dos 14 px dos outros ícones dos indicadores, porque a silhueta
 * do ornitorrinco ocupa a caixa inteira e parecia maior que os outros.
 */
const OrniIcon: React.ElementType = (DesignSystem as unknown as {OrniMarkIcon?: React.ElementType;}).OrniMarkIcon ?? BotIcon;
const ORNI_CHIP_ICON = { width: 12, height: 12 };

/** `(max-width: …)` ou `(min-width: …)` acompanhando a tela. */
function useMedia(q: string) {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  const [v, setV] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(q);
    const on = () => setV(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return v;
}

/**
 * T1 1d (05/11, Christian: "o box não desce até o rodapé"): a grade ocupa a tela até o fim, medida pela posição real dela
 * (avisos, título que quebra linha e indicadores mudam essa posição). Sobra só o respiro de baixo da página.
 * L6 (16/11/2026): respiro de baixo de 16 px (antes 28 no computador e 24 no celular), para a conversa ganhar altura.
 */
function useFillHeight(ref: React.RefObject<HTMLElement>, deps: unknown[]) {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const bottom = 16;
      setH(Math.max(480, Math.floor(window.innerHeight - top - bottom)));
    };
    measure();
    const t = window.setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return h;
}

/**
 * Largura real da grade (muda ao recolher/abrir o menu lateral, não só com a tela).
 * A-11 (auditoria parte 2, 05/11/2026): na prévia do editor, ao chegar em Conversas pelo menu lateral, a primeira medida
 * vinha 0 e nada media de novo até a largura mudar (a lista ocupava tudo e a conversa sumia). Agora mede de novo no quadro
 * seguinte, depois de 120 ms e de 400 ms, e também no `resize` da janela, além do `ResizeObserver`.
 */
function useWidth(ref: React.RefObject<HTMLElement>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const raf = window.requestAnimationFrame(measure);
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [ref]);
  return w;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const GAP = 16;
/** Diferença de largura entre o menu aberto (232 px) e recolhido (76 px). */
const SIDEBAR_DELTA = 232 - 76;
/**
 * Largura mínima da conversa ao lado da ficha. T1 1h (05/11, Christian): 586 px = o seletor de mensagens aprovadas
 * (conversa − 26 px de margem) fica com ≥ 560 px e mostra LISTA + PRÉVIA lado a lado, como com o menu aberto.
 */
const THREAD_MIN = 586;
/** T1 1i: quando a pessoa ABRE a ficha pelo botão, a conversa pode ficar mais estreita (até 480 px). */
const THREAD_FORCED_MIN = 480;

type FichaPref = 'auto' | 'open' | 'closed';

/**
 * Colunas decididas pela LARGURA REAL da grade (T1 1e), com laterais mais estreitas (T1 1h):
 * - 3 colunas sozinhas (`auto`) quando cabem lista 25 % (280–330) + conversa ≥ 586 + ficha 23 % (280–320).
 * - T1 1i: aberta pelo botão (`open`) e sem espaço para isso, a ficha entra assim mesmo se couber lista 22 % (260–330) +
 *   conversa ≥ 480 + ficha 22 % (280–320). Fechada pelo botão (`closed`): nunca aparece.
 * - Senão, 2 colunas: lista 32 % (320–340).
 * - Abaixo de 768 px: lista e conversa em telas separadas.
 * - A-11: largura ainda não medida (0) acima de 768 px → 2 colunas com lista de 300 px.
 * L6 (16/11/2026): com 2 colunas a lista tem no mínimo 320 px (antes 280), para a etiqueta de espera ("há 20 min",
 * "há 1h10") caber inteira. Com 3 colunas a largura não mudou: alargar a lista ali tira a ficha da tela a 1512 px
 * (ponto para o Christian no relatório do L6).
 */
function columnsFor(width: number, belowMd: boolean, pref: FichaPref) {
  if (belowMd) return { listW: undefined as number | undefined, asideW: 0, showAside: false };
  // A-11: sem medida ainda (0), fora do celular, usa 2 colunas (lista 300 px) em vez de deixar a lista ocupar tudo.
  if (width <= 0) return { listW: 300 as number | undefined, asideW: 0, showAside: false };
  const list3 = clamp(Math.round(width * 0.25), 280, 330);
  const aside3 = clamp(Math.round(width * 0.23), 280, 320);
  if (pref !== 'closed' && width >= list3 + THREAD_MIN + aside3 + GAP * 2) return { listW: list3, asideW: aside3, showAside: true };
  const listF = clamp(Math.round(width * 0.22), 260, 330);
  const asideF = clamp(Math.round(width * 0.22), 280, 320);
  if (pref === 'open' && width >= listF + THREAD_FORCED_MIN + asideF + GAP * 2) return { listW: listF, asideW: asideF, showAside: true };
  return { listW: clamp(Math.round(width * 0.32), 320, 340), asideW: 0, showAside: false };
}

/** Foco está num campo de texto (ou em algo que usa as setas)? Então as setas não andam pela lista. */
const typingIn = (el: Element | null) => !!el && (el.matches('input, textarea, select, [contenteditable="true"], [role="tab"], [role="slider"], [role="listbox"] *, [role="menu"] *') || !!el.closest('[role="dialog"]'));

/**
 * T1 1b (04/11/2026) · Conversas remodelada com a caixa de entrada da Tend como BASE ESTRUTURAL e a identidade Orniplaty
 * (revisão `claude/tend-t1-revisao-conversas-2026-11-04.md`). Peças de Conversas vêm do DS ORNIPLATY v4.0 (`components/Card`); a pasta `components/v319` ficou obsoleta em 06/11/2026.
 * - Cabeçalho: título + faixa de 4 indicadores (os 2 primeiros aplicam o filtro). L18: só os 2 que filtram, na linha do topo
 *   (ver `chips`).
 * - Grade: ver `columnsFor` (T1 1e / 1h / 1i).
 * - Abaixo de 768 px: lista e conversa em telas separadas, com "Voltar"; na conversa o título e os indicadores saem para o
 *   compositor ficar visível.
 * T1 1c: conversa mais enxuta (ver ConversationThread) e mensagens aprovadas (O-13).
 * T1 1d: troca de conversa com transição suave; a grade desce até o rodapé.
 * T1 1i (05/11, Christian): o botão da ficha no cabeçalho ABRE E FECHA A COLUNA da ficha à direita (ver `toggleFicha`).
 * T1 1l (05/11, Christian): "Marcar como resolvida" SAIU (só Devolver); abaixo de 768 px o botão da ficha abre por cima.
 * T1 1n (05/11, Christian, referência Tend):
 * - Abrir Conversas SEM `?cliente=` não escolhe conversa nenhuma: o centro explica o que acontece ("Escolha uma conversa")
 *   e a coluna da direita mostra quem está aguardando você (`NoConversationSelected` / `WaitingPanel`).
 * - Com a página em foco e nada sendo digitado, ↑ ↓ levam o foco para a lista (e andam nela); Enter abre.
 * - Mais altura para a conversa: a grade cola no cabeçalho da página (sem o espaço extra de 24 px) e o aviso do
 *   compositor só aparece enquanto você escreve (ver Composer).
 * L6 (16/11/2026, só visual): grade 8 px mais perto do título e 16 px do rodapé; aviso de assistente parada/desligada
 * compacto (título + uma frase); "Devolver" passa o resultado para a conversa mostrar a linha "Devolvida para a assistente".
 * L18 (17/11/2026): a grade fica 16 px abaixo da linha do topo (o título não tem mais o respiro de 24 px embaixo).
 */
export function Conversas() {
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const account = useAccountSummary();
  const aiOff = account.assistant.key === 'desligada' || account.assistant.key === 'desligada-tudo';
  const stopped = account.assistant.key === 'parada';
  // W4 (combinado 6): textos únicos do aviso de assistente parada (limite e WhatsApp desconectado).
  const stopNotice = assistantStopNotice(useSettings());
  const navigate = useGuardedNavigate();
  const power = useAssistantPower();
  const belowMd = useMedia('(max-width: 767.98px)');
  const hasDesktopMenu = useMedia('(min-width: 1024px)');
  const menuCollapsed = useSidebarCollapsed();
  const [params] = useSearchParams();
  const wanted = params.get('cliente');
  const convVersion = useConversations();
  const known = (id: string | null) => !!id && (conversations.some((c) => c.id === id) || !!clientById(id));
  if (wanted && !conversations.some((c) => c.id === wanted)) {
    const client = clientById(wanted);
    if (client) ensureConversation(client.id, client.name);
  }
  const opened = known(wanted) ? wanted : null;
  const [mobileView, setMobileView] = useState<'list' | 'thread'>(opened ? 'thread' : 'list');
  const items: Conversation[] = [...conversations];
  const [selectedId, setSelectedId] = useState<string | null>(opened);
  const [filter, setFilter] = useState<ConversationFilter>('todas');
  const [orniOnly, setOrniOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [fichaPref, setFichaPref] = useState<FichaPref>('auto');
  /** O menu foi recolhido pela ficha (e não pela pessoa): ao fechar a ficha ou sair da tela, ele volta. */
  const menuCollapsedByFicha = useRef(false);
  const location = useLocation();
  useEffect(() => {
    if (!wanted) return;
    if (opened) {
      setSelectedId(opened);
      setMobileView('thread');
      return;
    }
    setSelectedId(null);
    setMobileView('list');
    toast({ title: 'Cliente não encontrado', description: 'O atalho aponta para um cliente que não está no cadastro. Escolha a conversa na lista.', tone: 'warning' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, location.key]);

  const selected = selectedId ? items.find((c) => c.id === selectedId) ?? null : null;
  const summary = selected ? conversationSummaries[selected.id] ?? { name: selected.name, phone: '', recordPath: '/clientes', fields: [] } : null;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    patchConversation(id, { unread: 0 });
    setMobileView('thread');
  };

  // W4 (G7): conversa com a equipe volta sozinha para a assistente depois de 2 h sem ação da equipe (nunca com ela parada).
  useEffect(() => {
    checkHolds();
  }, []);
  useEffect(() => {
    for (const r of takeReturned()) toast({ title: 'A conversa voltou para a assistente', description: `${r.name}: 2 horas sem resposta da equipe. A assistente volta a responder.`, tone: 'info' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convVersion]);

  // T1 1n: ↑ ↓ com nada sendo digitado levam o foco para a lista (a conversa aberta ou a primeira); dali, a lista anda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const active = document.activeElement;
      if (active?.closest('[aria-label="Conversas"][role="list"]') || typingIn(active)) return;
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Conversas"][role="list"] button[data-conv]')];
      if (!buttons.length) return;
      e.preventDefault();
      const current = buttons.find((b) => b.dataset.conv === selectedId);
      (current ?? (e.key === 'ArrowUp' ? buttons[buttons.length - 1] : buttons[0])).focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // W4 (G6, G7): Assumir = fica com a equipe até devolver; Devolver com mensagem do cliente sem resposta = a assistente responde na hora.
  // L6: devolve o resultado do "Devolver" para a conversa mostrar a mesma frase na faixa do topo.
  const toggleHandler = (): {answered?: boolean;} | void => {
    if (!selected) return;
    if (selected.handler === 'ia') {
      takeOver(selected.id);
      toast({ title: 'Você assumiu a conversa', description: `A assistente não responde ${selected.name} até você devolver.`, tone: 'info' });
      return;
    }
    const r = handBack(selected.id);
    toast(
      r.answered ?
      { title: 'Conversa devolvida para a assistente', description: `Ela respondeu ${selected.name} agora.` } :
      { title: 'Conversa devolvida para a assistente', description: `Ela volta a responder ${selected.name} a partir da próxima mensagem.` }
    );
    return { answered: !!r.answered };
  };

  const send = (text: string) => {
    if (!selected) return;
    const result = sendTeamMessage(selected.id, selected.name, text, NOW);
    if (!result.ok && result.reason === 'whatsapp') {
      toast({ title: 'Mensagem não enviada', description: 'O WhatsApp não está funcionando. Nenhuma mensagem sai daqui até reconectar.', tone: 'error' });
    }
    if (!result.ok && result.reason === 'fechou-durante') {
      toast({ title: 'Mensagem não enviada', description: `Passaram 24 h sem mensagem de ${selected.name} enquanto você escrevia. Agora, só mensagem aprovada até o cliente responder.`, tone: 'error' });
    }
  };

  const waiting = waitingCount(items);
  const withAi = items.filter(withAssistant).length;
  const toggleFilter = (f: ConversationFilter) => setFilter((cur) => cur === f ? 'todas' : f);

  /*
   * L18 (17/11/2026, ponto 4 do Christian): o cabeçalho de Conversas virou UMA linha (linha do topo do Painel): título e
   * subtítulo · "Aguardando você" e "Com a assistente" (os dois que filtram a lista) · controles da moldura.
   * 2ª rodada (17/11/2026, pedido explícito do Christian): o "i" com "Espera por você" e "Conversas hoje" saiu. Os dois
   * números não aparecem mais na tela (exclusão pedida por ele; antes eram dois indicadores, até 10/11). A espera de cada
   * conversa continua na lista. As funções que os calculam (`medianTeamWaitToday`, `conversationsTodayCount`) ficam em
   * data/conversasThreads.ts.
   */
  const chips =
  <StatChipGroup label="Indicadores de Conversas">
      <StatChip value={waiting} tone={waiting > 0 ? 'warning' : 'default'} label="Aguardando você" icon={<CircleUserRoundIcon />} onClick={() => toggleFilter('aguardando')} pressed={filter === 'aguardando'} />
      <StatChip value={withAi} label="Com a assistente" icon={<OrniIcon strokeWidth={1.75} style={ORNI_CHIP_ICON} />} onClick={() => toggleFilter('ia')} pressed={filter === 'ia'} />
    </StatChipGroup>;

  const compactThread = belowMd && mobileView === 'thread';
  const gridRef = useRef<HTMLDivElement>(null);
  const fill = useFillHeight(gridRef, [aiOff, stopped, compactThread]);
  const gridWidth = useWidth(gridRef);
  const cols = columnsFor(gridWidth, belowMd, fichaPref);

  // Se a ficha passou a aparecer na coluna, o painel por cima sobra: fecha.
  useEffect(() => {
    if (cols.showAside) setProfileOpen(false);
  }, [cols.showAside]);

  // A pessoa abriu o menu de novo com a ficha aberta pelo botão: os dois trocam de lugar (a ficha volta ao automático).
  const prevMenuCollapsed = useRef(menuCollapsed);
  useEffect(() => {
    const wasCollapsed = prevMenuCollapsed.current;
    prevMenuCollapsed.current = menuCollapsed;
    if (wasCollapsed && !menuCollapsed) {
      menuCollapsedByFicha.current = false;
      setFichaPref((p) => p === 'open' ? 'auto' : p);
    }
  }, [menuCollapsed]);

  // Saindo de Conversas, o menu volta como estava antes da ficha.
  useEffect(
    () => () => {
      if (menuCollapsedByFicha.current) setSidebarCollapsed(false);
    },
    []
  );

  const fichaVisible = cols.showAside || profileOpen;
  const toggleFicha = () => {
    // T1 1l: celular e tablet pequeno — a ficha abre e fecha por cima, em painel lateral.
    if (belowMd) {
      setProfileOpen((v) => !v);
      return;
    }
    if (cols.showAside) {
      setFichaPref('closed');
      if (menuCollapsedByFicha.current) {
        menuCollapsedByFicha.current = false;
        prevMenuCollapsed.current = false;
        setSidebarCollapsed(false);
      }
      return;
    }
    if (profileOpen) {
      setProfileOpen(false);
      return;
    }
    const willCollapse = hasDesktopMenu && !menuCollapsed;
    if (columnsFor(gridWidth, false, 'auto').showAside) {
      // Já cabe do jeito que está (tela grande): só mostra, sem mexer no menu.
      setFichaPref('open');
    } else if (willCollapse && columnsFor(gridWidth + SIDEBAR_DELTA, false, 'open').showAside) {
      // Recolhe o menu para caber (pedido do Christian).
      setFichaPref('open');
      menuCollapsedByFicha.current = true;
      setSidebarCollapsed(true);
    } else if (columnsFor(gridWidth, false, 'open').showAside) {
      setFichaPref('open');
    } else {
      // Nem com o menu recolhido cabe: abre por cima, em painel lateral.
      setProfileOpen(true);
    }
  };
  const fade = reduceMotion ? undefined : { opacity: 0, y: 6 };

  return (
    <DashboardLayout activeId="conversas" title="Conversas" subtitle="O que a assistente está conversando e onde você entra" indicators={chips} hidePageHeader={compactThread}>
      {/* R3 (06/11/2026, Christian, A-12): as conversas que estavam com ela também ficam com a equipe ("Aguardando você"). L6: aviso compacto. */}
      {aiOff && !compactThread &&
      <Alert
        className="mb-3 mt-4"
        compact
        variant="warning"
        title="A assistente está desligada. As conversas que estavam com ela e as novas ficam com a sua equipe."
        actions={
        <Button size="md" className="w-full sm:w-auto" onClick={() => power.openOn()}>
              Ligar a assistente
            </Button>
        } />

      }
      {stopped && stopNotice && !compactThread &&
      <Alert
        className={aiOff ? 'mb-3' : 'mb-3 mt-4'}
        compact
        variant="error"
        title={stopNotice.title}
        actions={
        stopNotice.action &&
        <Button size="md" className="w-full sm:w-auto" onClick={() => navigate(stopNotice.action!.to)}>
                {stopNotice.action.label}
              </Button>

        }>
        
          {/* L4 (16/11/2026): a mesma frase curta do Início; o texto inteiro fica em Configurações. */}
          {stopNotice.short}
        </Alert>
      }
      {power.modals}
      <div ref={gridRef} className={`flex min-h-[480px] gap-4 ${aiOff || stopped ? '' : 'mt-4'}`} style={{ height: fill ?? undefined }}>
        <section
          aria-label="Lista de conversas"
          style={cols.listW ? { width: cols.listW } : undefined}
          className={`${mobileView === 'list' ? 'flex' : 'hidden'} w-full min-w-0 flex-col overflow-hidden rounded-card border border-border bg-white transition-[width] duration-200 md:flex md:shrink-0`}>
          
          <LoadErrorGate k="conversas" what="as conversas" className="m-4">
            <ConversationList items={items} selectedId={selected?.id ?? ''} onSelect={handleSelect} filter={filter} onFilterChange={setFilter} orniOnly={orniOnly} onOrniOnlyChange={setOrniOnly} query={query} onQueryChange={setQuery} />
          </LoadErrorGate>
        </section>
        <section aria-label={selected ? `Conversa com ${selected.name}` : 'Nenhuma conversa aberta'} className={`${mobileView === 'thread' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-white md:flex`}>
          {selected && summary ?
          <motion.div key={selected.id} className="flex h-full min-h-0 flex-col" initial={fade} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
              <ConversationThread
              conversation={selected}
              summary={summary}
              messages={conversationThreads[selected.id] ?? []}
              onBack={() => setMobileView('list')}
              onToggleHandler={toggleHandler}
              onOpenProfile={toggleFicha}
              profileOpen={fichaVisible}
              onSend={send} />
            
            </motion.div> :

          <motion.div key="vazio" className="flex h-full min-h-0 flex-col" initial={reduceMotion ? undefined : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
              <NoConversationSelected showWaiting={!cols.showAside} onSelect={handleSelect} />
            </motion.div>
          }
        </section>
        {cols.showAside &&
        <motion.aside
          aria-label={selected ? 'Ficha resumida' : 'Aguardando você'}
          style={{ width: cols.asideW }}
          initial={reduceMotion ? undefined : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#C7DAD8]">
          
            <motion.div key={selected?.id ?? 'vazio'} initial={reduceMotion ? undefined : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, delay: reduceMotion ? 0 : 0.04 }}>
              {selected && summary ? <ClientSummaryPanel summary={summary} clientId={selected.id} /> : <WaitingPanel onSelect={handleSelect} />}
            </motion.div>
          </motion.aside>
        }
      </div>
      {selected && summary &&
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} placement="side" title={summary.name} description="Ficha resumida">
          <ClientSummaryPanel summary={summary} clientId={selected.id} />
        </Modal>
      }
    </DashboardLayout>);

}