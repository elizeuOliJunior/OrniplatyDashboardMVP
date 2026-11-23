import { createSavedStore } from './iaConfigStore';
import { DEFAULT_MODEL_LIBRARY } from './followUpModels';
import type { ModelLibrary } from './followUpModels';
import { automationsStopped, stoppedByUsage, usageResetDm, waKey, whatsappStopped } from './settingsStore';
import type { SettingsState, Tone } from './settingsStore';
import { DEFAULT_SEND_WINDOWS, windowText } from './sendWindows';
import type { SendWindow, SendWindows } from './sendWindows';
import { LIST_BADGE_TEXT } from './contactPreferences';

/** `min`: menor valor aceito ao salvar (G1, F-055: zero é recusado nas regras numéricas). */
export type RuleSegment = string | {id: string;value: number;label: string;options?: number[];min?: number;};

/** Mesma classificação do onboarding (FD2/Q1/P01). */
export type AutomationKind = 'transacional' | 'pedido' | 'campanha';

/** Modo de envio das campanhas (P01). Automático só vale após opt-in explícito da clínica; nada é ativado por padrão. */
export type AutomationMode = 'automatico' | 'supervisionado' | 'pausado';

export type AutomationExample = {text: string;buttons?: string[];contact: string;};

export type Automation = {
  id: string;
  /** Nome em linguagem de dono de clínica (19/10/2026). */
  name: string;
  kind: AutomationKind;
  enabled: boolean;
  defaultOpen?: boolean;
  /** O que faz, em uma frase. */
  what: string;
  /** Quando acontece. */
  when: string;
  /** Quem recebe. */
  who: string;
  rule: RuleSegment[];
  /** Mensagem de exemplo; `{assistente}` vira o nome atual da assistente. */
  example: AutomationExample;
  /** Ajustes do Lote B (21/10/2026): "Quando acontece" com os valores salvos (ex.: "24 horas antes de cada horário marcado"). */
  whenFor?: (values: Record<string, number>) => string;
  /** Lote E (E3): texto do exemplo com o valor escolhido (ex.: 12 h → "hoje", 48 h → "depois de amanhã"). */
  exampleFor?: (values: Record<string, number>) => string;
  /** Mantido por compatibilidade com telas antigas. */
  previewMessage?: string;
  pendingApproval?: {badge: string;reason: string;};
  /**
   * Situação da mensagem desta automação no WhatsApp (20/10/2026: rótulos Liberada / Em análise / Recusada / Não enviada,
   * os mesmos de Configurações › WhatsApp). A confirmação na véspera lê o "Lembrete da véspera" de data/settingsStore.ts.
   */
  messageStatus?: 'liberada' | 'em-analise' | 'recusada' | 'nao-enviada';
};

/**
 * Regras de segurança das campanhas (C7, 19/10/2026; revistas no Lote B, 20/10/2026).
 * Saiu "No máximo 2 mensagens automáticas por cliente por mês" (F2d): cada serviço segue o limite do seu modelo.
 * Ajustes do Lote B (21/10/2026, B6): a janela 9h–20h vale para campanhas (mensagens que a clínica começa).
 * G18 (11/11/2026, Christian): a CONFIRMAÇÃO do horário também só sai das 9h às 20h; se a antecedência escolhida cair fora
 * dessa faixa, ela sai ANTES (nunca depois). Revê a decisão de 21/10 ("a qualquer hora"). BACKEND: hoje sem janela
 * (notifications/service.py); ver o relatório W6 (correcao-W6) para o Elizeu.
 * W8 (12/11/2026, Christian, 11/11 às 21h40 em diante): os dias e a faixa de horário passam a ser ESCOLHA DA CLÍNICA, em
 * duas escolhas (mensagens de horário marcado e campanhas), salvas em `AutomationsForm.send` (regras em data/sendWindows.ts).
 * Segunda a sábado, das 9h às 20h, é só o valor inicial. Toda frase que cita dias ou horas de envio lê `savedSendWindows()`.
 */
/**
 * L24e (19/11/2026): frases de "não receber" iguais às do dicionário (data/contactPreferences.ts). Nenhuma regra mudou.
 *  - `STOPPED_AUTOMATION_NOTE` vai no "Quem recebe" das automações que respeitam um tipo (lembretes, aviso de vaga,
 *    avisos de retorno). NÃO vai em "Avisar mudança de horário", que nunca é bloqueada (decisão do Christian, 18/11, 23h51).
 *  - `NEWS_ONLY_YES_NOTE` é para campanha de Novidades da clínica. Hoje não há nenhuma nesta lista.
 */
export const STOPPED_AUTOMATION_NOTE = 'Quem parou este aviso não recebe.';
export const NEWS_ONLY_YES_NOTE = 'Só vai para quem disse que sim.';

export const automationGeneralRules = [
'Envios só nos dias e horários que a clínica escolheu',
'Quem parou um aviso não recebe esse aviso; o aviso de mudança de horário sempre sai',
'Mensagens do mesmo dia para o mesmo cliente viram uma só',
// G1 subetapa 2 (F-024): regra aprovada. Uma mensagem fica sem resposta no fim da faixa do dia de envio seguinte.
'Duas mensagens seguidas sem resposta: o cliente vai para "Precisa de você" e nada mais sai sozinho'];


/**
 * B6: linhas fixas do cartão de dias e horários (components/atendente-ia/SendWindowsCard.tsx).
 * W8 (12/11/2026): saiu a linha "Campanhas só saem de segunda a sábado, das 9h às 20h." (remoção aprovada pelo Christian
 * em 12/11): os campos do cartão dizem os dias e o horário.
 * I1 (11/11/2026, integração, item 9). L24e: o selo é o da lista de Clientes (`LIST_BADGE_TEXT`, data/contactPreferences.ts).
 */
export const campaignHoursLines = [
'Se o cliente não responder a duas mensagens seguidas (contando todos os serviços dele), ele aparece para você em Oportunidades e nada mais sai sozinho.',
`Quem parou os avisos de retorno não recebe estas campanhas. Na lista de Clientes, aparece como “${LIST_BADGE_TEXT.retorno}” ou “${LIST_BADGE_TEXT.ambos}”.`];

/** W8 (substitui `campaignHoursNote`, W6): o que NÃO segue os dias e horários escolhidos (decisões de 11/11, ponto 4, e I1-2) + G19. */
export const SEND_WINDOWS_NOTE =
'O que não segue esses horários: a assistente responde a qualquer hora quem escreveu para a clínica, e o aviso de mudança de horário sai na hora. Se o limite do mês acabar, as campanhas param; lembretes de horário e ofertas de vaga continuam saindo.';

/** Como as mensagens se juntam: frase curta dentro de "Lembrar o cliente de voltar" › Ajustar (B6). */
export const automationMergeText =
'Se duas mensagens caírem no mesmo dia para o mesmo cliente, sai uma só, citando os serviços (ex.: "sua Limpeza de pele e sua Drenagem linfática").';

/** Compatibilidade: a nota de "valores de exemplo" saiu da interface (C2). */
export const automationGeneralRulesNote = '';

/**
 * Modo inicial das campanhas: Pausado (decisão do Christian, 11/10/2026).
 * Vale só para campanhas; os lembretes sobre agendamentos têm configuração própria e independente.
 */
export const DEFAULT_AUTOMATION_MODE: AutomationMode = 'pausado';

export const automationModes: {id: AutomationMode;label: string;description: string;practice: string;}[] = [
{
  id: 'pausado',
  label: 'Pausado',
  description: 'Nada sai sozinho.',
  practice: 'Em Oportunidades, a mensagem fica pronta para você mandar e marcar quem foi chamado.'
},
{
  id: 'supervisionado',
  label: 'Supervisionado',
  description: 'A Orniplaty prepara cada mensagem e espera você aprovar.',
  practice: 'Em Oportunidades, você aprova os envios dos próximos 3 dias.'
},
{
  id: 'automatico',
  label: 'Automático',
  description: 'A Orniplaty manda sozinha, no horário das campanhas. Para ligar, você autoriza uma vez.',
  practice: 'Em Oportunidades, só aparece quem precisa de você.'
}];


export const automationAutomaticConsent =
'Ao ativar o modo Automático, você autoriza que as campanhas ligadas sejam enviadas sem aprovação caso a caso, respeitando a preferência de contato de cada cliente. Você pode voltar para Supervisionado ou Pausado a qualquer momento.';

/** Ajustes do Lote B (B7, 21/10/2026): 2 grupos. Lembretes = confirmação + lista de espera; Chamar de volta = as 5 campanhas. */
export const automationGroups: {id: 'lembretes' | 'chamar';kinds: AutomationKind[];title: string;description: string;}[] = [
{
  id: 'lembretes',
  kinds: ['transacional', 'pedido'],
  title: 'Lembretes de horário marcado',
  description: 'Mensagens sobre um horário. Não dependem do modo de envio e continuam saindo quando o limite do mês acaba.'
},
{
  id: 'chamar',
  kinds: ['campanha'],
  title: 'Chamar clientes de volta',
  description: 'Mensagens que você manda para chamar o cliente de volta. Seguem o modo de envio e o horário das campanhas, e param quando o limite do mês acaba. Se o cliente não responder, ele aparece para você em Oportunidades.'
}];


/**
 * W1 (11/11/2026, Christian, decisão 18 + confirmações): prazo da oferta de vaga com a automação "Lista de espera" LIGADA.
 * Quem define é a clínica, em dois campos de opções (mesmo padrão da antecedência do lembrete, 12/24/48 h):
 *  - `prazo-hoje`: vaga de HOJE, em minutos (15, 30 ou 60; inicial 30);
 *  - `prazo-outro-dia`: vaga de OUTRO dia, em horas (1, 2 ou 4; inicial 2).
 * W8 (12/11/2026): o prazo só conta nos dias e horários que a clínica escolheu para as mensagens de horário marcado
 * (`send.appointments`; inicial: segunda a sábado, das 9h às 20h) e nunca passa do início da vaga. Fora desses dias e
 * horários a oferta não sai: a vaga aparece para a equipe chamar. Vencido o prazo, a oferta fecha como "Sem resposta" e a
 * vaga passa para a próxima pessoa.
 * PROTÓTIPO: a automação vem desligada e não há cronômetro; a regra fica escrita aqui, na tela e no contrato.
 * Substitui o campo livre "minutos para aceitar" (`minutos`), que saiu.
 * W9c (12/11/2026): J-02 (opção b) — só as vagas que abrem DEPOIS de ligar; as que já estavam abertas continuam com a
 * equipe. J-08 (decisão I1-3) — o cartão diz que, se o cliente aceitar e o horário continuar livre, a assistente marca
 * sozinha e avisa a equipe no sino.
 */
const waitlistDeadlines = (v: Record<string, number>) => {
  const h = v['prazo-outro-dia'] ?? 2;
  return `vaga de hoje, ${v['prazo-hoje'] ?? 30} minutos; vaga de outro dia, ${h} ${h === 1 ? 'hora' : 'horas'}`;
};

/** W8: "Quando acontece" da confirmação, com os dias e o horário das mensagens de horário marcado (revê a G18 do W6). */
const confirmationWhen = (h: number, w: SendWindow = DEFAULT_SEND_WINDOWS.appointments) => `${h} horas antes de cada horário marcado. Só sai ${windowText(w)}; se cair fora, sai antes.`;

/** W8: "Quando acontece" da oferta de vaga, com os dias e o horário das mensagens de horário marcado. W9c (J-02): só vagas novas. */
const waitlistWhen = (v: Record<string, number>, w: SendWindow = DEFAULT_SEND_WINDOWS.appointments) =>
`Assim que a vaga abre, hoje ou em qualquer data futura. Vale para as vagas que abrem depois de ligar a automação; as que já estavam abertas continuam com a equipe, na Agenda. Tempo para aceitar: ${waitlistDeadlines(v)}. O prazo só conta ${windowText(w)}, e nunca passa do início da vaga. Fora desses dias e horários a oferta não sai e a vaga aparece na Agenda para a equipe chamar. Sem resposta no prazo, a vaga passa para a próxima pessoa.`;

export const automations: Automation[] = [
{
  id: 'confirmacao',
  messageStatus: 'liberada',
  name: 'Confirmar o horário',
  kind: 'transacional',
  enabled: true,
  what: 'Pede ao cliente para confirmar, remarcar ou cancelar o horário.',
  when: confirmationWhen(24),
  whenFor: (v) => confirmationWhen(v.horas ?? 24, savedSendWindows().appointments),
  who: `Todos os clientes com horário marcado. ${STOPPED_AUTOMATION_NOTE}`,
  rule: ['Enviar', { id: 'horas', value: 24, label: 'Horas antes do horário', options: [12, 24, 48] }, 'horas antes do horário'],
  example: {
    contact: 'Ana Ribeiro',
    text: 'Oi, Ana! Passando para lembrar da sua Limpeza de pele amanhã, 14:30, com a Dra. Carolina. Posso confirmar?',
    buttons: ['Confirmar', 'Remarcar', 'Cancelar']
  },
  exampleFor: (v) => {
    const h = v.horas ?? 24;
    const when = h <= 12 ? 'hoje' : h >= 48 ? 'depois de amanhã' : 'amanhã';
    return `Oi, Ana! Passando para lembrar da sua Limpeza de pele ${when}, 14:30, com a Dra. Carolina. Posso confirmar?`;
  }
},
{
  id: 'lista-espera',
  // W1 (11/11/2026, Christian, resposta 2-A): a mensagem "Vaga na lista de espera" aparece como aprovada na amostra.
  messageStatus: 'liberada',
  name: 'Oferecer vaga para a lista de espera',
  kind: 'pedido',
  enabled: false,
  what: 'Quando um horário é cancelado ou remarcado, oferece a vaga para quem pediu para ser avisado: primeiro quem pediu um horário como aquele, depois a ordem da lista. Se o cliente aceitar e o horário continuar livre, a assistente marca sozinha e avisa a equipe no sino. Desligada, é a equipe que chama o cliente, pela Agenda.',
  when: waitlistWhen({}),
  whenFor: (v) => waitlistWhen(v, savedSendWindows().appointments),
  who: `Só quem pediu para entrar na lista. ${STOPPED_AUTOMATION_NOTE}`,
  rule: [
  'Vaga de hoje: esperar',
  { id: 'prazo-hoje', value: 30, label: 'Minutos para aceitar uma vaga de hoje', options: [15, 30, 60] },
  'minutos. Vaga de outro dia: esperar',
  { id: 'prazo-outro-dia', value: 2, label: 'Horas para aceitar uma vaga de outro dia', options: [1, 2, 4] },
  'horas. Depois disso, a vaga passa para a próxima pessoa'],

  example: {
    contact: 'Carla Mendes',
    text: 'Oi, Carla! Abriu uma vaga para Drenagem linfática hoje, às 15:00, com a Juliana. Quer ficar com ela? Ela fica reservada para você por 30 minutos.',
    buttons: ['Quero', 'Não, obrigado']
  },
  exampleFor: (v) =>
  `Oi, Carla! Abriu uma vaga para Drenagem linfática hoje, às 15:00, com a Juliana. Quer ficar com ela? Ela fica reservada para você por ${v['prazo-hoje'] ?? 30} minutos.`
},
{
  /*
   * I1 (11/11/2026, integração, B3; decisão G1 do Christian): "Avisar mudança de horário". Mesma regra da lista de espera:
   * LIGADA, a mensagem sai sozinha quando a clínica remarca ou cancela o horário do cliente; DESLIGADA (padrão), a equipe
   * avisa pela Agenda ("Falta avisar", data/conflictCases.ts), com a mensagem pronta. O id é o que a Agenda já lia
   * (`CHANGE_AUTOMATION_ID`). Mensagem "Não enviada": ao ligar e salvar, a Orniplaty manda para o WhatsApp aprovar (G17);
   * enquanto não for aprovada, a situação do cartão é "Aguardando aprovação" e a equipe continua avisando.
   * O exemplo usa o MESMO texto da mensagem pronta da Agenda (`changeMessage`, data/conflictCases.ts).
   * Decisão I1-2 (Christian, 11/11): o aviso sai NA HORA, a qualquer hora; não segue os dias e horários de envio (W8).
   * BACKEND: automação e modelo de mensagem novos (não existem).
   */
  id: 'avisar-mudanca-horario',
  messageStatus: 'nao-enviada',
  name: 'Avisar mudança de horário',
  kind: 'transacional',
  enabled: false,
  what: 'Avisa o cliente quando a clínica muda ou cancela o horário dele (profissional ausente, feriado, bloqueio na agenda). Desligada, é a equipe que avisa, pela Agenda, com a mensagem pronta.',
  when: 'Assim que a equipe remarca ou cancela o horário pelo painel. Sai na hora, a qualquer hora do dia.',
  who: 'O cliente do horário que a clínica mudou ou cancelou. Quando é o cliente que cancela, nada sai.',
  rule: ['Enviar assim que a mudança for salva'],
  example: {
    contact: 'Fernanda Lima',
    text: 'Oi, Fernanda! Precisamos mudar o seu horário de Toxina botulínica: era quinta, 01/10, às 14:00, com Dra. Carolina e passou para sexta, 02/10, às 14:00, com Dra. Carolina. Se esse horário não der para você, responda aqui que vemos outro.'
  }
},
{
  id: 'retorno',
  messageStatus: 'nao-enviada',
  name: 'Lembrar o cliente de voltar',
  kind: 'campanha',
  enabled: true,
  what: 'Chama o cliente quando chega a hora de voltar para o serviço.',
  when: 'Perto da data de volta de cada serviço (você define em Serviços e equipe).',
  who: `Quem fez um serviço com retorno e saiu sem horário marcado. Sessões de pacote seguem só a campanha de pacote. ${STOPPED_AUTOMATION_NOTE}`,
  rule: ['A data de volta de cada serviço fica em Serviços e equipe'],
  example: {
    contact: 'Carla Mendes',
    text: 'Oi, Carla! Está chegando a hora do seu retorno de limpeza de pele com a Juliana. Quer que eu veja um horário para você?',
    buttons: ['Quero agendar', 'Agora não']
  }
},
{
  id: 'faltou',
  messageStatus: 'nao-enviada',
  name: 'Chamar quem faltou',
  kind: 'campanha',
  enabled: true,
  what: 'Oferece um novo horário para quem faltou.',
  when: 'No mesmo dia da falta e, se não responder, no dia seguinte.',
  who: `Quem teve a falta registrada na Agenda ou no Fechar atendimento. ${STOPPED_AUTOMATION_NOTE}`,
  rule: ['Primeira mensagem no mesmo dia da falta; segunda no dia seguinte'],
  example: {
    contact: 'Otávio Reis',
    text: 'Oi, Otávio! Sentimos sua falta no seu peeling químico. Quer remarcar? Tenho horários com a Dra. Carolina nos próximos dias.',
    buttons: ['Quero remarcar', 'Agora não']
  }
},
{
  id: 'retomada',
  messageStatus: 'nao-enviada',
  name: 'Retomar quem pediu preço',
  kind: 'campanha',
  enabled: true,
  what: 'Volta a falar com quem pediu preço ou horário e não marcou.',
  when: '1 dia depois do pedido e, se não responder, 2 dias depois.',
  who: `Quem conversou com a assistente e não marcou horário. ${STOPPED_AUTOMATION_NOTE}`,
  rule: ['Primeira mensagem 1 dia depois do pedido; segunda, 2 dias depois. Para na primeira resposta'],
  example: {
    contact: 'Bruno Costa',
    text: 'Oi, Bruno! Ficou alguma dúvida sobre a Drenagem linfática? Se quiser, vejo um horário pra você.'
  }
},
{
  id: 'pacotes',
  name: 'Lembrar sessões de pacote',
  kind: 'campanha',
  enabled: true,
  what: 'Lembra quem tem sessões do pacote sem agendar.',
  when: 'Depois de 30 dias sem agendar uma sessão; outra mensagem 7 dias depois.',
  whenFor: (v) => `Depois de ${v['dias-pacote'] ?? 30} dias sem agendar uma sessão; outra mensagem 7 dias depois.`,
  who: `Clientes com sessões de pacote em aberto. ${STOPPED_AUTOMATION_NOTE}`,
  rule: ['Lembrar após', { id: 'dias-pacote', value: 30, label: 'Dias sem agendar uma sessão', min: 1 }, 'dias sem agendar uma sessão; segunda mensagem 7 dias depois'],
  example: {
    contact: 'Fernanda Lima',
    // W8 (12/11/2026, passo 8): o exemplo é igual à mensagem de verdade escrita pelo I3 (`packagePhrase`, data/followUp.ts).
    text: 'Oi, Fernanda! Você ainda tem 4 de 6 sessões de limpeza de pele no seu pacote, que vence em 10/11. Quer agendar a próxima?',
    buttons: ['Quero agendar', 'Agora não']
  },
  messageStatus: 'em-analise'
},
{
  id: 'reativacao',
  messageStatus: 'nao-enviada',
  name: 'Chamar quem sumiu',
  kind: 'campanha',
  enabled: true,
  what: 'Convida para voltar quem não aparece há um tempo.',
  when: 'Depois de 60 dias sem visita; outra mensagem 7 dias depois.',
  whenFor: (v) => `Depois de ${v.dias ?? 60} dias sem visita; outra mensagem 7 dias depois.`,
  who: `Clientes sem visita no período. ${STOPPED_AUTOMATION_NOTE}`,
  rule: ['Considerar sumido após', { id: 'dias', value: 60, label: 'Dias sem visita', min: 1 }, 'dias sem visita; segunda mensagem 7 dias depois'],
  example: {
    contact: 'Ana Ribeiro',
    // `{assistente}` e `{empresa}` são trocados na tela pelo nome da assistente (Como atender) e pelo nome salvo em Empresa (G1, F-004).
    text: 'Oi, Ana! Aqui é a {assistente}, da {empresa}. Faz um tempinho que você não vem. Quer agendar sua Limpeza de pele? Tenho horários nesta semana.',
    buttons: ['Quero agendar', 'Agora não']
  },
  previewMessage:
  'Oi, Ana! Faz um tempinho que você não vem à {empresa}. Quer agendar sua Limpeza de pele? Tenho horários nesta semana.'
}];


export type AutomationsForm = {
  mode: AutomationMode;
  enabled: Record<string, boolean>;
  values: Record<string, number>;
  /** Biblioteca de modelos de acompanhamento (Lote B): máximo de mensagens e passos padrão de cada modelo. */
  models: ModelLibrary;
  /** W8: dias e horários em que as mensagens automáticas saem (mensagens de horário marcado e campanhas). */
  send: SendWindows;
};

/** Campanha que cuida de cada motivo de Oportunidades (desligar tira os clientes desse motivo da tela). */
export const MOTIVE_AUTOMATION: Record<'faltou' | 'pediu-preco' | 'retorno' | 'pacote' | 'sumiu', string> = {
  retorno: 'retorno',
  faltou: 'faltou',
  'pediu-preco': 'retomada',
  pacote: 'pacotes',
  sumiu: 'reativacao'
};

function initialAutomations(): AutomationsForm {
  const enabled: Record<string, boolean> = {};
  const values: Record<string, number> = {};
  automations.forEach((a) => {
    enabled[a.id] = a.enabled;
    a.rule.forEach((s) => {
      if (typeof s !== 'string') values[s.id] = s.value;
    });
  });
  return { mode: DEFAULT_AUTOMATION_MODE, enabled, values, models: DEFAULT_MODEL_LIBRARY, send: DEFAULT_SEND_WINDOWS };
}

/**
 * G1 (F-055): erros das regras numéricas (campo → mensagem). Zero ou vazio é recusado; o mínimo vem de `min` (1).
 * Não confundir com o intervalo entre agendamentos, cujo padrão aprovado continua 0 ("Sem intervalo").
 */
export function ruleErrors(values: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  automations.forEach((a) =>
  a.rule.forEach((seg) => {
    if (typeof seg === 'string' || seg.options) return;
    const min = seg.min ?? 1;
    const v = values[seg.id] ?? seg.value;
    if (!(v >= min)) out[seg.id] = `Use ${min} ou mais.`;
  })
  );
  return out;
}

/** Liga/desliga e regras SALVOS (o modo salvo também fica em data/automationMode.ts para Oportunidades e Retornos). */
export const automacoesStore = createSavedStore<AutomationsForm>(initialAutomations());

/** W8: dias e horários de envio SALVOS (rascunho não vale). Leitura para Agenda, Oportunidades, avisos e a assistente. */
export const savedSendWindows = (): SendWindows => automacoesStore.get().send ?? DEFAULT_SEND_WINDOWS;

/** W6 (A5-08): a automação "Oferecer vaga para a lista de espera" está ligada (SALVO)? Leitura para Agenda e Conversas. */
export const waitlistAutomationOn = () => automacoesStore.get().enabled['lista-espera'] === true;

/**
 * A6-01 (W6): liga/desliga vindos do Onboarding. O que veio desligado fica desligado; automação que o Onboarding não
 * pergunta (hoje "Chamar quem faltou") fica DESLIGADA (decisão 1-a do Christian, 11/11/2026: nada sai para o cliente sem
 * a clínica ter escolhido). Devolve os ids ligados.
 */
export function applyOnboardingAutomations(received: Record<string, boolean>): string[] {
  const cur = automacoesStore.get();
  const enabled: Record<string, boolean> = {};
  automations.forEach((a) => {
    enabled[a.id] = received[a.id] === true;
  });
  automacoesStore.set({ ...cur, enabled });
  return automations.filter((a) => enabled[a.id]).map((a) => a.id);
}

/* ───────────── W6 (A5-07, A5-03, G17, G19): UMA situação por automação ───────────── */

/** Em qual lista do resumo de Automações a automação entra. */
export type SituationGroup = 'sai' | 'espera' | 'parado' | 'desligada';
export type AutomationSituation = {group: SituationGroup;tone: Tone;label: string;text: string; /** Mostrar "Ver clientes em Oportunidades". */toOpportunities: boolean;};

export const SITUATION_GROUP_TITLE: Record<SituationGroup, string> = {
  espera: 'Espera você',
  parado: 'Está parado',
  sai: 'Sai sozinho hoje',
  desligada: 'Desligadas'
};

/** Situação da mensagem da automação no WhatsApp (a confirmação lê a mensagem "lembrete" de Configurações › WhatsApp). */
export function messageStatusOf(a: Automation, s: SettingsState) {
  if (a.id === 'confirmacao') return s.templates.lembrete;
  return (s.campaignTemplates as Record<string, Automation['messageStatus']>)[a.id] ?? a.messageStatus ?? 'liberada';
}

/**
 * Uma frase só, calculada de: ligada ou não, modo de envio (campanhas), situação da mensagem no WhatsApp, WhatsApp da
 * clínica, limite do mês (só campanhas, G19) e "respostas e mensagens automáticas" desligadas. A ordem é a do que impede
 * primeiro: nada sai sem WhatsApp; depois o que a clínica decidiu; depois a aprovação da mensagem; depois o modo.
 */
export function automationSituation(a: Automation, enabled: boolean, mode: AutomationMode, s: SettingsState): AutomationSituation {
  const campaign = a.kind === 'campanha';
  const msg = messageStatusOf(a, s);
  const none = { toOpportunities: false };
  if (!enabled) return { ...none, group: 'desligada', tone: 'neutral', label: 'Desligada', text: campaign ? 'Nada sai desta campanha.' : 'Esta mensagem não sai.' };
  if (automationsStopped(s)) return { ...none, group: 'parado', tone: 'warning', label: 'Parada', text: 'Ligada · não sai: você desligou a assistente e as mensagens automáticas.' };
  if (whatsappStopped(s)) {
    const k = waKey(s);
    const why = k === 'desconectado' ? 'o WhatsApp está desconectado' : k === 'nunca' ? 'o WhatsApp ainda não foi conectado' : 'a autorização do WhatsApp não está valendo';
    return { ...none, group: 'parado', tone: 'error', label: 'Não sai', text: `Ligada · não sai: ${why}. Volta a sair quando o WhatsApp estiver funcionando.` };
  }
  if (campaign && stoppedByUsage(s)) return { ...none, group: 'parado', tone: 'error', label: 'Não sai', text: `Ligada · não sai: o limite do mês acabou. Volta a sair em ${usageResetDm(s)}, ou antes se você ligar “Continuar depois do limite”.` };
  if (msg === 'recusada')
  return campaign ?
  { group: 'espera', tone: 'error', label: 'Recusada', text: 'Ligada · não sai sozinha: o WhatsApp recusou a mensagem. Enquanto isso, os clientes aparecem para você em Oportunidades com a mensagem pronta.', toOpportunities: true } :
  { ...none, group: 'espera', tone: 'error', label: 'Recusada', text: 'Ligada · não sai: o WhatsApp recusou a mensagem. Veja o motivo e envie de novo em Configurações › WhatsApp.' };
  if (msg === 'em-analise' || msg === 'nao-enviada') {
    const pending = msg === 'nao-enviada' ? ' Ao salvar, a Orniplaty manda a mensagem para o WhatsApp aprovar.' : ' Costuma levar minutos, às vezes até 24 horas.';
    return campaign ?
    { group: 'parado', tone: 'warning', label: 'Aguardando aprovação', text: `Ligada · ainda não sai: esperando o WhatsApp aprovar.${pending} Enquanto isso, os clientes aparecem para você em Oportunidades com a mensagem pronta.`, toOpportunities: msg === 'em-analise' } :
    { ...none, group: 'parado', tone: 'warning', label: 'Aguardando aprovação', text: `Ligada · ainda não sai: esperando o WhatsApp aprovar.${pending}` };
  }
  if (campaign && mode === 'pausado') return { group: 'espera', tone: 'warning', label: 'Você manda', text: 'Ligada · não sai sozinha: modo Pausado. A mensagem fica pronta em Oportunidades para você mandar.', toOpportunities: true };
  if (campaign && mode === 'supervisionado') return { group: 'espera', tone: 'warning', label: 'Você aprova', text: 'Ligada · espera você aprovar: modo Supervisionado. Aprove os envios em Oportunidades.', toOpportunities: true };
  return { ...none, group: 'sai', tone: 'success', label: 'Sai sozinha', text: campaign ? 'Ligada · sai sozinha, no horário das campanhas.' : 'Ligada · sai sozinha.' };
}