import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { MenuIcon, XIcon } from 'lucide-react';
import { AppSidebarNav as SidebarNav, defaultSidebarNavItems, type SidebarNavPlanUsage } from './AppSidebarNav';
import { TopBar } from './TopBar';
import { PageHeader } from '../PageHeader';
import { Logo } from '../Logo';
import { IconButton, PageHeaderControlsProvider, PageMotion } from '../Card';
import { UnsavedChangesHost } from '../ui/UnsavedChanges';
import { BookingHost } from '../modals/BookingHost';
import { requestLeave } from '../../data/dirtyGuard';
import { sidebarRoutes } from '../../data/dashboardScreens';
import { pendingItems, sidebarPlan, useSettings } from '../../data/settingsStore';
import { conversations, waitingCount } from '../../data/conversas';
import { useConversations } from '../../data/conversasThreads';
import type { SidebarItemId } from '../../types/dashboard';

type DashboardLayoutProps = {
  firstAccessUsage?: SidebarNavPlanUsage;
  firstAccess?: boolean;
  activeId: SidebarItemId;
  title: string;
  subtitle?: string;
  /**
   * L18: ações da página na linha do topo, à direita, antes dos controles da moldura (`PageHeader actions`). Hoje nenhuma
   * tela usa: Conversas passou a `indicators` e o "Resumo semanal no WhatsApp" de Resultados foi para a linha do período.
   */
  actions?: React.ReactNode;
  /** L18: indicadores pequenos no meio da linha do topo (`PageHeader indicators`): Conversas (StatChip) e Início (etiqueta da assistente). */
  indicators?: React.ReactNode;
  /**
   * Etiqueta que ficava abaixo do subtítulo (Início e Primeiro acesso, 11/11/2026). L18: vai para o meio da linha do topo,
   * junto com os `indicators` (o título saiu da linha própria; a etiqueta acompanha o título).
   */
  belowSubtitle?: React.ReactNode;
  /** Linha acima da linha do topo (ex.: "← Clientes" da ficha não encontrada). */
  beforeTitle?: React.ReactNode;
  /** The page draws its own heading (e.g. the client profile identity block) */
  hidePageHeader?: boolean;
  /** Tela sem os controles da moldura (Ficha do cliente, decisão do Christian de 11/11/2026). */
  hideTopBar?: boolean;
  children?: React.ReactNode;
};

/**
 * Keeps the desktop menu open or collapsed while moving between pages (prototype only).
 * T1 1i (05/11/2026): virou um estado compartilhado (`setSidebarCollapsed` / `useSidebarCollapsed`) para uma tela poder
 * recolher o menu. Uso: em Conversas, abrir a coluna da ficha resumida recolhe o menu para caber na tela.
 */
let sidebarCollapsed = false;
const sidebarListeners = new Set<() => void>();
export function setSidebarCollapsed(next: boolean) {
  if (sidebarCollapsed === next) return;
  sidebarCollapsed = next;
  sidebarListeners.forEach((l) => l());
}
export function useSidebarCollapsed(): boolean {
  const [value, setValue] = useState(sidebarCollapsed);
  useEffect(() => {
    const on = () => setValue(sidebarCollapsed);
    sidebarListeners.add(on);
    on();
    return () => {
      sidebarListeners.delete(on);
    };
  }, []);
  return value;
}

/**
 * Largura da área do título abaixo da qual os indicadores não cabem na mesma linha do título e dos controles (título
 * ~200 px + indicadores de Conversas ~330 px + controles ~420 px + espaços). O `PageHeader` do DS decide pela largura da
 * TELA (1024 px); no Painel o menu lateral come 232 px, então entre 1024 e ~1200 px a área é mais estreita do que o DS
 * supõe e o título ficava com quase nada de largura.
 */
const ROW_MIN = 900;

/**
 * Moldura do Painel.
 * L18 (17/11/2026, pedido do Christian; DS 5.1, `rules/ui-patterns.md` › Linha do topo e `rules/findability.md` › Movimento):
 * - LINHA DO TOPO: título e subtítulo da página à esquerda, indicadores no meio e os controles da moldura (clínica aberta,
 *   tema, sino, "+ Novo") à direita, numa linha só: `PageHeader placement="topbar"`. A moldura passa os controles UMA vez
 *   com `PageHeaderControlsProvider`. 640–1023 px: indicadores embaixo do título; abaixo de 640 px tudo empilha.
 *   A partir de 1024 px, se a área do título tiver menos de `ROW_MIN` (menu lateral aberto), os indicadores descem para
 *   logo abaixo da linha, como o DS faz entre 640 e 1023 px.
 *   Substitui a faixa do topo (`TopBar`) acima ou ao lado do título grande (rodada de 11/11/2026).
 * - MOVIMENTO: só o conteúdo principal entra com `PageMotion` (esmaece e sobe 4 px, 220 ms) ao trocar de rota
 *   (`routeKey` = caminho; trocar só `?secao=`/`?aba=` não anima). Menu lateral e linha do topo nunca se movem. Substitui o
 *   esmaecimento da T1 1d (framer, título + corpo). Com "reduzir movimento", nada anima (`PageMotion` confere sozinho;
 *   `MotionConfig reducedMotion="user"` desliga deslocamentos das peças locais feitas com framer: janelas `AppModal`,
 *   menu do celular, painel do sino).
 * - Ficha do cliente: continua sem controles da moldura e sem título de página (`hidePageHeader` + `hideTopBar`, decisão
 *   de 11/11/2026); a linha "← Clientes · ⋯ · Agendar" já é a primeira linha da tela.
 */
export function DashboardLayout({ activeId, title, subtitle, actions, indicators, belowSubtitle, beforeTitle, hidePageHeader, hideTopBar, children, firstAccessUsage, firstAccess }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSidebarCollapsed();
  // Fonte única (data/settingsStore.ts): uso do plano no rodapé e número de pendências no item Configurações
  const settings = useSettings();
  const planUsage = sidebarPlan(settings);
  const pending = pendingItems(settings).length;
  // G1 (F-005): o número de Conversas é derivado da fonte única (conversas "Aguardando você"), nunca escrito à mão.
  // T1 (O-02): a fila é `waitingCount` (quem espera a equipe agora), a mesma regra do filtro e do Início.
  useConversations();
  const waiting = waitingCount(conversations);
  const navItems = (firstAccess ? defaultSidebarNavItems.map((item) => ({ ...item, badge: undefined })) : defaultSidebarNavItems).map((item) => {
    if (firstAccess) return item;
    if (item.id === 'configuracoes') return { ...item, badge: pending > 0 ? pending : undefined, badgeLabel: `${pending} ${pending === 1 ? 'pendência' : 'pendências'}` };
    if (item.id === 'conversas') return { ...item, badge: waiting > 0 ? waiting : undefined, badgeLabel: `${waiting} ${waiting === 1 ? 'conversa aguardando você' : 'conversas aguardando você'}` };
    return item;
  });
  const openPlan = () => {
    setMobileOpen(false);
    requestLeave(() => navigate('/configuracoes?secao=plano'));
  };

  const handleNavigate = (id: string) => {
    const path = sidebarRoutes[id as SidebarItemId];
    setMobileOpen(false);
    if (path) requestLeave(() => navigate(firstAccess && id === 'inicio' ? '/inicio-primeiro-acesso' : path));
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // L18: a partir de 1024 px, com a área do título estreita (menu lateral aberto), os indicadores descem para baixo da linha.
  const headRef = useRef<HTMLDivElement>(null);
  const [narrowRow, setNarrowRow] = useState(false);
  useLayoutEffect(() => {
    const el = headRef.current;
    if (!el || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const measure = () => setNarrowRow(mq.matches && el.clientWidth < ROW_MIN);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    mq.addEventListener?.('change', measure);
    return () => {
      ro?.disconnect();
      mq.removeEventListener?.('change', measure);
    };
  }, []);

  // Controles da moldura (mesmos de antes, sem a margem da faixa antiga). `flex-wrap`: no celular quebram linha.
  const controls = hideTopBar ? null : <TopBar className="mb-0 flex-wrap md:mb-0" />;
  const middle =
  indicators || belowSubtitle ?
  <>
        {belowSubtitle}
        {indicators}
      </> :
  undefined;
  // L18: menu do celular desliza em 200 ms, ease-out (antes: mola); nada com "reduzir movimento".
  const drawerTransition = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen w-full bg-background">
        {/* Desktop sidebar */}
        <div className="sticky top-0 hidden h-screen shrink-0 lg:block">
          <SidebarNav
            activeId={activeId}
            onNavigate={handleNavigate}
            planUsage={firstAccessUsage ?? planUsage}
            onPlanClick={firstAccess ? undefined : openPlan}
            items={navItems}
            collapsed={collapsed}
            onCollapsedChange={setSidebarCollapsed}
            className="h-full" />
          
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen &&
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <motion.div
              className="absolute inset-0 bg-overlay/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={drawerTransition}
              onClick={() => setMobileOpen(false)} />
            
              <motion.div
              className="absolute inset-y-0 left-0 flex"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={drawerTransition}>
              
                <SidebarNav
                activeId={activeId}
                onNavigate={handleNavigate}
                planUsage={firstAccessUsage ?? planUsage}
                onPlanClick={firstAccess ? undefined : openPlan}
                items={navItems}
                collapsible={false}
                className="h-full" />
              
                {/* Botão branco sobre o fundo escuro do menu: não é o IconButton (sem fundo) do DS. */}
                <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="ml-2 mt-4 flex h-10 w-10 items-center justify-center rounded-button bg-white text-text-primary shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                
                  <XIcon className="h-5 w-5" />
                </button>
              </motion.div>
            </div>
          }
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
            <Logo variant="full" height={28} />
            <IconButton aria-label="Abrir menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} icon={<MenuIcon className="h-5 w-5" />} className="text-text-primary" />
          </div>

          <div className="flex-1 px-4 py-6 md:px-8 md:py-7">
            <PageHeaderControlsProvider controls={controls}>
              <div ref={headRef}>
                {beforeTitle && <div className="mb-3">{beforeTitle}</div>}
                {!hidePageHeader ?
                <>
                    <PageHeader placement="topbar" title={title} subtitle={subtitle} indicators={narrowRow ? undefined : middle} actions={actions} />
                    {narrowRow && middle && <div className="mt-2 flex flex-wrap items-center gap-2">{middle}</div>}
                  </> :

                controls && <div className="flex flex-wrap items-center justify-end gap-2">{controls}</div>
                }
              </div>
              <PageMotion routeKey={location.pathname}>
                <main>{children}</main>
              </PageMotion>
            </PageHeaderControlsProvider>
          </div>
        </div>

        {/* Aviso de alterações não salvas (compartilhado por todas as telas) */}
        <UnsavedChangesHost />
        {/* Novo agendamento pedido por outra tela (ex.: Fechar atendimento › Retorno "Já marcado") */}
        <BookingHost />
      </div>
    </MotionConfig>);

}