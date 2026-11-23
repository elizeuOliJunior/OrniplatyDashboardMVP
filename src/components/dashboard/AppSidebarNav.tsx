import React, { useState } from 'react';
import {
  HouseIcon,
  CalendarDaysIcon,
  MessagesSquareIcon,
  UsersIcon,
  TargetIcon,
  ChartColumnIcon,
  BotIcon,
  ClipboardListIcon,
  SettingsIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ChevronRightIcon } from
'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useFollowUpTotals } from '../../data/followUp';
import { sidebarPlan, usageKey } from '../../data/settingsStore';
import * as DesignSystem from '../Card';
import { CountBadge, consumptionTone } from '../Card';

/**
 * Cores da barra de uso, por token do DS. P5 (28/10/2026): sobre o fundo escuro do menu, o tom "primary" usa `badge-count`
 * (#34D399, o verde do menu: selos e anéis de foco), porque `primary` (#0E7490) tem pouco contraste sobre #042F2E.
 * Âmbar (80–99 %) e vermelho (100 %) continuam os do `ProgressBar` do DS.
 */
const USAGE_FILL: Record<string, string> = { primary: 'bg-badge-count', success: 'bg-success', warning: 'bg-warning-icon', error: 'bg-error' };
/** Exceção do DS (ProgressBar › Context.md): com "Continuar depois do limite" ligado, 100 % fica verde-azulado (a assistente continua atendendo). */
const usageTone = (pct: number) => pct >= 100 && usageKey() === 'limite-ligado' ? 'primary' : consumptionTone(pct);

/*
 * Copy of the design system SidebarNav with two additions for the Painel:
 * the logo also expands/collapses the menu, and a soft animated glow sits behind the logo tile.
 * G5 P8 (27/10/2026): continua local. O `SidebarNav` do DS v3.18 já tem `logoToggles`, `logoGlow` e `onPlanClick`, mas
 * ainda não tem (1) a linha de consumo própria (`usageLabel`, ex.: "62% do limite do mês" / texto do primeiro acesso;
 * o DS escreve "310 de [cota] atendimentos"), (2) o texto do número para leitor de tela (`badgeLabel`, via CountBadge)
 * e (3) o número de Oportunidades calculado aqui. Trocar mudaria texto da tela. Proposta para o DS registrada no relatório P8.
 *
 * T1 1f (05/11/2026, pedido do Christian): os dois botões pequenos de recolher/expandir (setas duplas no topo e no rodapé)
 * saíram. No lugar, um item fixo logo abaixo de "Configurações", separado por uma linha fina, no mesmo formato dos itens
 * do menu (42 px de altura). Ele fica na MESMA altura com o menu aberto ou recolhido, porque o cabeçalho (64 px) e os
 * itens (42 px + 4 px) não mudam de tamanho. Aberto: ícone + "Recolher menu". Recolhido: só o ícone, com nome no title e
 * no aria-label. A logo continua recolhendo/expandindo também. Proposta para o SidebarNav do DS na v3.19.
 */
import { Logo } from '../Logo';
/** Brilho da logo: fonte ÚNICA em components/ui/OrniMark.tsx (o mesmo do símbolo da assistente). */
import { GLOW_CSS } from '../ui/OrniMark';

/**
 * Ícone do item "IA Orniplaty" = `OrniMarkIcon` do design system (v2.8, 19/10/2026: silhueta da logo oficial).
 * Repasse puro: enquanto o Painel estiver numa versão anterior à 2.8 (antes do "Update" no editor), cai no BotIcon.
 */
const IaIcon: React.ElementType = (DesignSystem as unknown as {OrniMarkIcon?: React.ElementType;}).OrniMarkIcon ?? BotIcon;

export type SidebarNavItemId =
'inicio' |
'agenda' |
'conversas' |
'clientes' |
'oportunidades' |
'resultados' |
'atendente-ia' |
'servicos-equipe' |
'configuracoes';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  badge?: string | number;
  /** Texto para leitor de tela do número (ex.: "1 pendência"). */
  badgeLabel?: string;
}

export interface SidebarNavPlanUsage {
  /** Plan name, e.g. "Essencial" */
  planName: string;
  /** AI level. Nível de IA está ADIADO (FD1/O07-C): não informe este campo enquanto nenhum nível existir. */
  aiLevel?: string;
  /** Attendances used this month */
  used: number;
  /** Monthly limit. Use the placeholder "[cota]" while the number is not defined. */
  limit: number | string;
  /** Texto próprio da linha de consumo (ex.: primeiro acesso, sem limite definido). Substitui "X de Y atendimentos". */
  usageLabel?: string;
  /** Percentage 0–100 for the bar. If omitted and limit is a number, it is computed. */
  percent?: number;
}

export interface SidebarNavProps {
  /** Items to render. Defaults to the 9 official OrniPlaty menu items. */
  items?: SidebarNavItem[];
  /** Controlled active item id. */
  activeId?: string;
  /** Initial active id when uncontrolled. */
  defaultActiveId?: string;
  onNavigate?: (id: string) => void;
  /** Plan usage card shown at the bottom. Pass null to hide it. */
  planUsage?: SidebarNavPlanUsage | null;
  /** Cartão do plano clicável (leva a Configurações › Plano e pagamento). */
  onPlanClick?: () => void;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  collapsible?: boolean;
  className?: string;
}

/** Cartão do plano no rodapé: com `onClick` vira botão (leva a Configurações › Plano e pagamento). */
function PlanCard({ onClick, children }: {onClick?: () => void;children: React.ReactNode;}) {
  const base = 'm-3 block rounded-xl bg-sidebar-active p-3 text-left';
  if (!onClick) return <div className={base}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} group w-[calc(100%-1.5rem)] ring-1 ring-transparent transition-shadow duration-150 hover:ring-badge-count focus:outline-none focus-visible:ring-2 focus-visible:ring-badge-count`}>
      
      {children}
      <span className="sr-only">Abrir Configurações, Plano e pagamento</span>
    </button>);

}

/** Logo that also expands/collapses the menu, with the glow behind its tile. */
function LogoButton({ collapsed, onClick, clickable }: {collapsed: boolean;onClick: () => void;clickable: boolean;}) {
  const tile = collapsed ? 38 : 31;
  const logo = collapsed ? <Logo variant="mark" withTile height={30} /> : <Logo variant="full" tone="negative" height={32} />;
  const inner =
  <span className="relative inline-flex items-center">
      <span className="absolute left-0 top-1/2 -translate-y-1/2" style={{ width: tile, height: tile }} aria-hidden="true">
        <span className="orni-glow" />
      </span>
      <span className="relative z-[1] inline-flex">{logo}</span>
    </span>;

  if (!clickable) return inner;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      aria-expanded={!collapsed}
      className="rounded-button transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-badge-count focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-background">
      
      {inner}
    </button>);

}

/**
 * Official OrniPlaty menu, in this exact order. Os números são DERIVADOS: Oportunidades = "Precisa de você" (data/followUp.ts,
 * aqui); Conversas = conversas "Aguardando você" (`handler === 'voce'`, data/conversasThreads.ts, em DashboardLayout);
 * Configurações = pendências (data/settingsStore.ts, em DashboardLayout). `badge: 0` marca o item como dinâmico (G1, F-005).
 * 19/10/2026 (C6): o item da IA se chama "IA Orniplaty", com o ícone da marca (OrniMarkIcon).
 */
export const defaultSidebarNavItems: SidebarNavItem[] = [
{ id: 'inicio', label: 'Início', icon: HouseIcon },
{ id: 'agenda', label: 'Agenda', icon: CalendarDaysIcon },
{ id: 'conversas', label: 'Conversas', icon: MessagesSquareIcon, badge: 0 },
{ id: 'clientes', label: 'Clientes', icon: UsersIcon },
{ id: 'oportunidades', label: 'Oportunidades', icon: TargetIcon, badge: 0 },
{ id: 'resultados', label: 'Resultados', icon: ChartColumnIcon },
{ id: 'atendente-ia', label: 'IA Orniplaty', icon: IaIcon },
{ id: 'servicos-equipe', label: 'Serviços e equipe', icon: ClipboardListIcon },
{ id: 'configuracoes', label: 'Configurações', icon: SettingsIcon }];


/** Padrão só para uso isolado do componente: a MESMA leitura do Painel (`sidebarPlan()` de data/settingsStore.ts), sem número à mão (G1, F-005). */
export const defaultPlanUsage: SidebarNavPlanUsage = sidebarPlan();

export function AppSidebarNav({
  items = defaultSidebarNavItems,
  activeId,
  defaultActiveId,
  onNavigate,
  planUsage = defaultPlanUsage,
  onPlanClick,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  collapsible = true,
  className
}: SidebarNavProps) {
  const [internalActive, setInternalActive] = useState<string | undefined>(
    defaultActiveId ?? items[0]?.id
  );
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  // Oportunidades: o número do menu é "Precisa de você" (mesma fonte da tela, data/followUp.ts).
  const followUp = useFollowUpTotals();
  const navItems = items.map((item) =>
  item.id === 'oportunidades' && item.badge !== undefined ? { ...item, badge: followUp.precisa > 0 ? followUp.precisa : undefined } : item
  );
  const current = activeId ?? internalActive;
  const isCollapsed = collapsed ?? internalCollapsed;

  const handleSelect = (id: string) => {
    if (activeId === undefined) setInternalActive(id);
    onNavigate?.(id);
  };
  const toggleCollapsed = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  const percent =
  planUsage && (
  planUsage.percent ?? (
  typeof planUsage.limit === 'number' && planUsage.limit > 0 ?
  Math.round(planUsage.used / planUsage.limit * 100) :
  0));

  /** Mesmo formato dos itens do menu (42 px), para o botão de recolher/expandir parecer parte da lista. */
  const itemShape = (collapsedState: boolean) =>
  twMerge(
    'relative flex w-full items-center gap-3 rounded-button text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-badge-count focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-background',
    collapsedState ? 'mx-auto h-[42px] w-[42px] justify-center' : 'h-[42px] px-3'
  );

  const renderItem = (item: SidebarNavItem) => {
    const Icon = item.icon;
    const active = item.id === current;
    const cls = twMerge(
      itemShape(isCollapsed),
      active ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-active hover:text-white'
    );
    const content =
    <>
        <Icon className="h-icon-md w-icon-md shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {!isCollapsed && <span className="truncate">{item.label}</span>}
        {!isCollapsed && item.badge !== undefined &&
      <CountBadge count={Number(item.badge)} ariaLabel={item.badgeLabel} className="ml-auto" />
      }
        {isCollapsed && item.badge !== undefined &&
      <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-badge-count" />
      }
      </>;

    const common = {
      className: cls,
      'aria-current': active ? 'page' as const : undefined,
      title: isCollapsed ? item.label : undefined,
      'aria-label': isCollapsed ? item.label : undefined
    };
    return (
      <li key={item.id}>
        {item.href ?
        <a
          href={item.href}
          {...common}
          onClick={(e) => {
            if (onNavigate) e.preventDefault();
            handleSelect(item.id);
          }}>
          
            {content}
          </a> :

        <button type="button" {...common} onClick={() => handleSelect(item.id)}>
            {content}
          </button>
        }
      </li>);

  };

  const ToggleIcon = isCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
  const toggleLabel = isCollapsed ? 'Expandir menu' : 'Recolher menu';

  return (
    <aside
      className={twMerge(
        'flex h-full min-h-[600px] flex-col bg-sidebar-background text-sidebar-text transition-[width] duration-200',
        isCollapsed ? 'w-[76px]' : 'w-[232px]',
        className
      )}>
      
      <div
        className={twMerge(
          'flex h-16 items-center',
          isCollapsed ? 'justify-center px-2' : 'pl-4 pr-3'
        )}>
        
        <style>{GLOW_CSS}</style>
        <LogoButton collapsed={isCollapsed} onClick={toggleCollapsed} clickable={collapsible} />
      </div>

      <nav aria-label="Navegação principal" className="flex flex-1 flex-col px-3 py-3">
        <ul className="flex flex-col gap-1">{navItems.map(renderItem)}</ul>
        {collapsible &&
        <div className="mt-2 border-t border-white/10 pt-2">
            <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? toggleLabel : undefined}
            title={toggleLabel}
            className={twMerge(itemShape(isCollapsed), 'text-sidebar-text hover:bg-sidebar-active hover:text-white')}>
            
              <ToggleIcon className="h-icon-md w-icon-md shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {!isCollapsed && <span className="truncate">{toggleLabel}</span>}
            </button>
          </div>
        }
      </nav>

      {planUsage && !isCollapsed &&
      <PlanCard onClick={onPlanClick}>
          <p className="flex items-center justify-between gap-2 text-xs font-semibold text-white">
            <span>
              Plano {planUsage.planName}
              {planUsage.aiLevel ? ` · ${planUsage.aiLevel}` : ''}
            </span>
            {onPlanClick && <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-sidebar-text transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true" />}
          </p>
          <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sidebar-background"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? 0}
          aria-label="Uso do limite do mês">
          
            {/* P4b (decisão do Christian, 28/10/2026): cor do CONSUMO do DS (`consumptionTone`): verde até 79 % (P5: `badge-count` sobre o menu escuro), âmbar de 80 % a 99 %, vermelho no limite (100 %). */}
            <div className={`h-full rounded-full ${USAGE_FILL[usageTone(percent ?? 0)]}`} style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-sidebar-text">
            {planUsage.usageLabel ?? `${percent ?? 0}% do limite do mês`}
          </p>
        </PlanCard>
      }
    </aside>);

}