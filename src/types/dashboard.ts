export type SidebarItemId =
'inicio' |
'agenda' |
'conversas' |
'clientes' |
'oportunidades' |
'resultados' |
'atendente-ia' |
'servicos-equipe' |
'configuracoes';

export type DashboardScreen = {
  id: string;
  path: string;
  label: string;
};