export type SetupStepStatus = 'concluido' | 'pendente' | 'opcional';

export type SetupStep = {
  id: string;
  label: string;
  status: SetupStepStatus;
  actionLabel?: string;
  lockedHint?: string;
};

export const setupSteps: SetupStep[] = [
{ id: 'horarios', label: 'Horários, serviços e equipe', status: 'concluido' },
{ id: 'whatsapp', label: 'Conectar o WhatsApp', status: 'pendente', actionLabel: 'Conectar' },
{ id: 'perfil', label: 'Perfil da atendente', status: 'concluido' },
{ id: 'importar', label: 'Importar clientes', status: 'opcional', actionLabel: 'Importar' },
{ id: 'ligar-ia', label: 'Ligar a IA', status: 'pendente', lockedHint: 'Disponível após conectar o WhatsApp' }];


/**
 * L15 (17/11/2026, etapa de facilidade de uso): textos do primeiro acesso do Painel.
 * - `firstAccessList`: o cartão único do que falta (junta "Próximos passos" e "A assistente está pronta?").
 * - `firstAccessPreview`: os cartões vazios com a MESMA grade e as MESMAS peças do Início (`HighlightCard`), cada um com
 *   UMA linha dizendo o que vai aparecer ali. Os destinos são as mesmas rotas do Início.
 * Só texto; nenhuma regra.
 */
export const firstAccessList = {
  title: 'Para começar a atender',
  sentence: 'Comece pelo primeiro item: cada um abre o lugar onde se resolve.',
  info: 'Conta o que está salvo no painel agora, já com o que veio do onboarding, pelos mesmos critérios da IA Orniplaty. Enquanto um item falta, a assistente passa essas dúvidas para a sua equipe.'
};

export const firstAccessPreview = {
  heading: 'Depois dos primeiros atendimentos',
  conversas: { label: 'Conversas', support: 'as conversas do WhatsApp aparecem aqui', actionLabel: 'Abrir conversas' },
  oportunidades: { label: 'Oportunidades', supportEmpty: 'Importe sua base para preparar os próximos contatos.', supportImported: 'quem precisar de retorno aparece aqui', actionLabel: 'Ver oportunidades' },
  amanha: { label: 'Amanhã', support: 'as confirmações de amanhã aparecem aqui', actionLabel: 'Ver confirmações' },
  listaEspera: { label: 'Lista de espera', support: 'quem espera vaga aparece aqui', actionLabel: 'Ver lista de espera' },
  hoje: { title: 'Atendimentos de hoje', body: 'Os horários agendados aparecem aqui.' },
  resultado: { label: 'Resultado do mês', support: 'os resultados aparecem aqui', actionLabel: 'Ver resultados' }
};