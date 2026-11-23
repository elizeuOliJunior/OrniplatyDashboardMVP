import type { DashboardScreen, SidebarItemId } from '../types/dashboard';

export const dashboardScreens: DashboardScreen[] = [
{ id: 'inicio', path: '/inicio', label: 'Início' },
{ id: 'inicio-primeiro-acesso', path: '/inicio-primeiro-acesso', label: 'Início · primeiro acesso' },
{ id: 'agenda', path: '/agenda', label: 'Agenda' },
{ id: 'conversas', path: '/conversas', label: 'Conversas' },
{ id: 'clientes', path: '/clientes', label: 'Clientes' },
{ id: 'ficha-cliente', path: '/clientes/ana-ribeiro', label: 'Ficha do cliente' },
{ id: 'clientes-pacotes', path: '/clientes/pacotes', label: 'Clientes · Pacotes' },
{ id: 'oportunidades', path: '/oportunidades', label: 'Oportunidades' },
{ id: 'resultados', path: '/resultados', label: 'Resultados' },
{ id: 'atendente-ia-empresa', path: '/atendente-ia/empresa', label: 'IA Orniplaty · Empresa' },
{ id: 'atendente-ia-como-atender', path: '/atendente-ia/como-atender', label: 'IA Orniplaty · Como atender' },
{ id: 'atendente-ia-conhecimento', path: '/atendente-ia/conhecimento', label: 'IA Orniplaty · Conhecimento' },
{ id: 'atendente-ia-automacoes', path: '/atendente-ia/automacoes', label: 'IA Orniplaty · Automações' },
{ id: 'servicos-equipe', path: '/servicos-equipe', label: 'Serviços e equipe' },
{ id: 'configuracoes', path: '/configuracoes', label: 'Configurações' }];


/** O menu "IA Orniplaty" abre sempre em Empresa (decisão de 19/10/2026). */
export const sidebarRoutes: Record<SidebarItemId, string> = {
  inicio: '/inicio',
  agenda: '/agenda',
  conversas: '/conversas',
  clientes: '/clientes',
  oportunidades: '/oportunidades',
  resultados: '/resultados',
  'atendente-ia': '/atendente-ia/empresa',
  'servicos-equipe': '/servicos-equipe',
  configuracoes: '/configuracoes'
};

/** Uso do plano no rodapé do menu: fonte única em data/settingsStore.ts (`sidebarPlan`). */