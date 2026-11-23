/*
 * T1 1c (04/11/2026, Christian: "Completo, O-13 vai pro T2"). MENSAGENS APROVADAS PELA META, enviadas pela equipe dentro
 * da conversa (referência: seletor de modelos da Tend). Texto fixo aprovado + campos ({{1}}, {{2}}…) que a equipe edita.
 *
 * O QUE EXISTE HOJE NO BACKEND (main local de 22/10/2026, `notifications/templates.py`; não deu para atualizar o repositório):
 *  - `lembrete_confirmacao`: ÚNICO modelo para o cliente que o backend envia (lembrete automático). Corpo e botões abaixo são
 *    os do código, na mesma ordem de variáveis. Os cliques Confirmar/Remarcar/Cancelar são tratados por
 *    `notifications/confirmation.py` LIGADOS A UM AGENDAMENTO: enviado pela equipe, o envio precisa levar o agendamento.
 *  - `confirmacao_agendamento`: criado na Meta, mas nenhum código envia (órfão). O CORPO AQUI É PROPOSTA: o texto aprovado
 *    na Meta não está no código. Conferir na WABA antes de usar.
 *  - Os demais (`retomar_atendimento`, `remarcar_horario`, `retorno_recomendado`) NÃO EXISTEM: são propostas do protótipo e
 *    precisam ser criados e aprovados na Meta em CADA WABA (como `ensure_tenant_templates`).
 *  - O envio manual hoje (`POST /conversations/{id}/messages`) só aceita texto livre: enviar modelo pela equipe é contrato
 *    novo (O-13, adendo T2).
 * Na amostra, os aprovados aparecem como "aprovado" e o de Marketing como "em análise", para mostrar os dois estados.
 * W1 (11/11/2026, Christian, resposta 2-A): `vaga_lista_espera` ("Vaga na lista de espera") entra como APROVADA na amostra.
 * É a mensagem da oferta de vaga quando a conversa está parada há mais de 24 h. NÃO EXISTE no backend nem na Meta: precisa
 * ser criada e aprovada em cada WABA (proposta de categoria: Utilidade, porque responde a um pedido do próprio cliente).
 */

export type TemplateVarSource = 'nome' | 'clinica' | 'servico' | 'profissional' | 'data' | 'hora';

export type MessageTemplate = {
  /** Nome do modelo na Meta (minúsculas e _). */
  name: string;
  title: string;
  category: 'Utilidade' | 'Marketing';
  status: 'aprovado' | 'em-analise';
  /** Corpo com {{1}}, {{2}}… na ordem de `vars`. */
  body: string;
  vars: {label: string;source: TemplateVarSource;}[];
  buttons?: string[];
};

/** W1: nome da mensagem aprovada da oferta de vaga (usado pela Agenda › vaga › "Chamar no WhatsApp"). */
export const WAITLIST_TEMPLATE = 'vaga_lista_espera';

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
{
  name: 'lembrete_confirmacao',
  title: 'Lembrete de horário',
  category: 'Utilidade',
  status: 'aprovado',
  body: 'Olá {{1}}! Passando para lembrar do seu horário: {{2}} com {{3}} em {{4}} às {{5}}. Podemos confirmar sua presença?',
  vars: [
  { label: 'Nome', source: 'nome' },
  { label: 'Serviço', source: 'servico' },
  { label: 'Profissional', source: 'profissional' },
  { label: 'Data', source: 'data' },
  { label: 'Hora', source: 'hora' }],

  buttons: ['Confirmar', 'Remarcar', 'Cancelar']
},
{
  name: 'confirmacao_agendamento',
  title: 'Confirmação de agendamento',
  category: 'Utilidade',
  status: 'aprovado',
  body: 'Olá {{1}}! Seu horário está confirmado: {{2}} com {{3}} em {{4}} às {{5}}. Se precisar mudar, é só responder esta mensagem.',
  vars: [
  { label: 'Nome', source: 'nome' },
  { label: 'Serviço', source: 'servico' },
  { label: 'Profissional', source: 'profissional' },
  { label: 'Data', source: 'data' },
  { label: 'Hora', source: 'hora' }]

},
{
  name: WAITLIST_TEMPLATE,
  title: 'Vaga na lista de espera',
  category: 'Utilidade',
  status: 'aprovado',
  body: 'Oi, {{1}}! Abriu uma vaga para {{2}} no dia {{3}}, às {{4}}, com {{5}}. Quer ficar com ela?',
  vars: [
  { label: 'Nome', source: 'nome' },
  { label: 'Serviço', source: 'servico' },
  { label: 'Data', source: 'data' },
  { label: 'Hora', source: 'hora' },
  { label: 'Profissional', source: 'profissional' }],

  buttons: ['Quero', 'Não, obrigado']
},
{
  name: 'retomar_atendimento',
  title: 'Retomar o atendimento',
  category: 'Utilidade',
  status: 'aprovado',
  body: 'Olá {{1}}! Aqui é da {{2}}. A nossa conversa ficou parada e queremos continuar o seu atendimento. Podemos seguir por aqui?',
  vars: [
  { label: 'Nome', source: 'nome' },
  { label: 'Clínica', source: 'clinica' }],

  buttons: ['Pode seguir']
},
{
  name: 'remarcar_horario',
  title: 'Remarcar horário',
  category: 'Utilidade',
  status: 'aprovado',
  body: 'Olá {{1}}! Precisamos remarcar o seu horário de {{2}} em {{3}} às {{4}}. Responda esta mensagem que a gente encontra um novo horário com você.',
  vars: [
  { label: 'Nome', source: 'nome' },
  { label: 'Serviço', source: 'servico' },
  { label: 'Data', source: 'data' },
  { label: 'Hora', source: 'hora' }]

},
{
  name: 'retorno_recomendado',
  title: 'Hora do retorno',
  category: 'Marketing',
  status: 'em-analise',
  body: 'Olá {{1}}! Já está chegando a hora do seu retorno de {{2}}. Quer que a gente reserve um horário pra você?',
  vars: [
  { label: 'Nome', source: 'nome' },
  { label: 'Serviço', source: 'servico' }],

  buttons: ['Quero agendar']
}];


/** Campo da Meta: sem quebra de linha e curto. */
export const TEMPLATE_VAR_MAX = 60;

/** Texto final, com os campos preenchidos. */
export const fillTemplate = (body: string, values: string[]) => body.replace(/\{\{(\d+)\}\}/g, (_, n) => (values[Number(n) - 1] ?? '').trim());