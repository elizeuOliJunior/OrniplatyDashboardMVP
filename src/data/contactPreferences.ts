import { wordsNow } from './segment';
/**
 * Preferência de contato do cliente, fonte ÚNICA do Painel — SIMULAÇÃO de protótipo, só front-end.
 *
 * L23 (18/11/2026, decisões do Christian no chat do arquiteto): UMA situação por tipo de mensagem.
 *  - Tipos: "Lembretes de horário", "Avisos de retorno", "Novidades da clínica" e "Aviso de vaga" (este só aparece na
 *    Ficha quando o cliente tem pedido aberto na lista de espera).
 *  - Três situações e só três textos: "Recebe" (success), "Não recebe" (warning), "Ainda não perguntado" (neutral).
 *  - Padrões: lembretes, avisos de retorno e aviso de vaga = Recebe; novidades = Ainda não perguntado (a IA Orniplaty
 *    pergunta no fim de um agendamento; "Pode sim" = Recebe, "Não precisa" = Não recebe).
 *  - Parar: o próprio cliente (botão da mensagem no WhatsApp) ou a equipe ("Cliente pediu para parar" na Ficha).
 *    "Voltar a enviar" devolve o tipo ao padrão.
 *  - Regra que NÃO mudou: horário pedido pelo próprio cliente é sempre atendido.
 * L24a (18/11/2026, pedido A do Christian): DICIONÁRIO ÚNICO das frases de "não receber" (`stoppedTitle`, `stoppedLine`,
 *  `stoppedSentence`, `alwaysAnswersText`, `listBadgeOf`…). As telas leem as frases daqui; nenhuma regra mudou.
 *
 * COMPATIBILIDADE (para as telas que ainda leem o formato antigo; lista em claude/facilidade-de-uso/correcao-L23.md):
 *  - `contactBlockOf` = "Avisos de retorno" parados (era "Retornos e ofertas"). Retornos, Oportunidades e o
 *    acompanhamento continuam lendo este. `remindersBack` = os lembretes NÃO estão parados.
 *  - `remindersBlockedOf` = "Lembretes de horário" parados. `offersBlockedOf` = "Aviso de vaga" parado.
 *  - Seleção de campanha de novidades: não há leitor no Painel hoje; quando houver, usar `receivesNews` (só Recebe).
 * L24f (19/11/2026): saíram os textos antigos sem uso (`contactBlockLabel`, `describeBlock`, `CONTACT_BLOCK_HINT`,
 *  `optOutScopeNote`/`OPT_OUT_SCOPE_NOTE`, `OPT_OUT_EFFECT`, `OPT_OUT_REMINDER_RULE`, `CHOICE_REMINDERS`, `CHOICE_OFFERS`).
 *  Prova: o pacote compilado do Painel não usa nenhum deles (ver claude/facilidade-de-uso/correcao-L24f.md).
 *
 * IDENTIFICADOR: o vínculo correto é o ID estável do cliente (`client_id` do cadastro), nunca o nome.
 * `clientIdFromName` (slug do nome, o mesmo id de `data/api/clientes.ts`) é a ÚNICA ponte provisória do protótipo.
 * BACKEND: não verificado nesta etapa. Este arquivo só espelha o formato que a tela precisa; nada aqui grava ou envia nada.
 */
import { useSyncExternalStore } from 'react';

export type ContactKind = 'lembretes' | 'retorno' | 'novidades' | 'vaga';
export type KindStatus = 'recebe' | 'nao-recebe' | 'nao-perguntado';
/** Como a situação chegou: resposta à pergunta das novidades, botão do cliente no WhatsApp ou registro da equipe. */
export type KindHow = 'resposta-sim' | 'resposta-nao' | 'cliente' | 'equipe';
export type KindRecord = {status: KindStatus;how?: KindHow;since?: string;};

export const KIND_ORDER: ContactKind[] = ['lembretes', 'retorno', 'novidades', 'vaga'];

/** Textos ÚNICOS de cada tipo (Ficha, janela "Cliente pediu para parar", aviso rápido). */
export const KIND_TEXT: Record<ContactKind, {label: string;lower: string;clientStopButton?: string;}> = {
  lembretes: { label: 'Lembretes de horário', lower: 'lembretes de horário' },
  retorno: { label: 'Avisos de retorno', lower: 'avisos de retorno', clientStopButton: 'Parar avisos de retorno' },
  novidades: { label: 'Novidades da clínica', lower: 'novidades da clínica', clientStopButton: 'Parar novidades' },
  vaga: { label: 'Aviso de vaga', lower: 'aviso de vaga' }
};

/** Os três textos de etiqueta (e só eles). */
export const STATUS_TEXT: Record<KindStatus, {label: string;tone: 'success' | 'warning' | 'neutral';}> = {
  recebe: { label: 'Recebe', tone: 'success' },
  'nao-recebe': { label: 'Não recebe', tone: 'warning' },
  'nao-perguntado': { label: 'Ainda não perguntado', tone: 'neutral' }
};

const DEFAULTS: Record<ContactKind, KindRecord> = {
  lembretes: { status: 'recebe' },
  retorno: { status: 'recebe' },
  novidades: { status: 'nao-perguntado' },
  vaga: { status: 'recebe' }
};

/** Linha de motivo embaixo do tipo. `null` = sem linha (lembretes e retornos no padrão). */
export function kindReason(kind: ContactKind, r: KindRecord): string | null {
  const when = r.since ? ` em ${r.since}` : '';
  if (r.how === 'resposta-sim') return `Disse "Pode sim" no WhatsApp${when}`;
  if (r.how === 'resposta-nao') return `Disse "Não precisa" no WhatsApp${when}`;
  if (r.how === 'cliente') return `Tocou em "${KIND_TEXT[kind].clientStopButton ?? 'Parar'}"${when}`;
  if (r.how === 'equipe') return `A equipe registrou o pedido${when}`;
  if (kind === 'novidades') return 'A IA Orniplaty pergunta quando ele confirmar um horário';
  if (kind === 'vaga') return 'Pediu para entrar na lista de espera';
  return null;
}

/** "Voltar a enviar" só existe para tipo parado pelo cliente ou pela equipe (não para quem respondeu "Não precisa"). */
export const canResume = (r: KindRecord) => r.status === 'nao-recebe' && (r.how === 'cliente' || r.how === 'equipe');

/* ─────────── L24a: dicionário único das frases de "não receber" (as telas só leem daqui) ─────────── */

const lowerFirst = (s: string) => s ? `${s.charAt(0).toLowerCase()}${s.slice(1)}` : s;

/** Título curto de um tipo parado: "Não recebe aviso de vaga". */
export const stoppedTitle = (kind: ContactKind) => `Não recebe ${KIND_TEXT[kind].lower}`;

/** Motivo de um tipo parado, com minúscula (vai depois de dois-pontos). `null` = sem motivo registrado. */
export const stoppedReason = (kind: ContactKind, r: KindRecord): string | null => {
  const why = kindReason(kind, r);
  return why ? lowerFirst(why) : null;
};

/** "Não recebe aviso de vaga: a equipe registrou o pedido em 20/09" (sem ponto final). */
export const stoppedLine = (kind: ContactKind, r: KindRecord): string => {
  const why = stoppedReason(kind, r);
  return `${stoppedTitle(kind)}${why ? `: ${why}` : ''}`;
};

/** "Diego Alves não recebe aviso de vaga: a equipe registrou o pedido em 20/09" (sem ponto final). */
export const stoppedSentence = (name: string, kind: ContactKind, r: KindRecord): string => `${name} ${lowerFirst(stoppedLine(kind, r))}`;

/** Rodapé de sempre: "Se o cliente pedir um horário, a clínica sempre responde." (palavra do segmento). */
export const alwaysAnswersText = (the: string = wordsNow().the) => `Se o cliente pedir um horário, ${the} sempre responde.`;

/** Aviso rápido de "Voltar a enviar" em Novidades da clínica (volta para "Ainda não perguntado"). */
export const NEWS_RESUME_TOAST = 'A IA Orniplaty vai perguntar de novo no próximo agendamento.';

/** Descrição da entrada "Cliente pediu para parar" no menu "⋯" da Ficha (abre a escolha dos tipos). */
export const STOP_CHOICE_DESCRIPTION = 'Escolha o que parar.';

/** PONTE PROVISÓRIA do protótipo (nome → id). Ver o cabeçalho: na integração, usar o `client_id` real. */
export const clientIdFromName = (name: string) =>
Array.from(name.toLowerCase().normalize('NFD')).
filter((ch) => ch.charCodeAt(0) < 768 || ch.charCodeAt(0) > 879).
join('').
replace(/[^a-z0-9]+/g, '-').
replace(/^-+|-+$/g, '');

/**
 * Amostra L23 (ids reais de data/api/clientes.ts). Os outros clientes ficam no padrão.
 *  - Diego Alves: tudo "Não recebe", registrado pela equipe (data do pedido antigo, 20/09).
 *  - Carla Mendes: disse "Pode sim" às novidades em 12/11.
 *  - Igor Matos: tocou em "Parar avisos de retorno" em 10/11.
 * As datas 12/11 e 10/11 vêm do lote; o relógio do protótipo está em 01/10 (ver correcao-L23).
 */
let records: Record<string, Partial<Record<ContactKind, KindRecord>>> = {
  'diego-alves': {
    lembretes: { status: 'nao-recebe', how: 'equipe', since: '20/09' },
    retorno: { status: 'nao-recebe', how: 'equipe', since: '20/09' },
    novidades: { status: 'nao-recebe', how: 'equipe', since: '20/09' },
    vaga: { status: 'nao-recebe', how: 'equipe', since: '20/09' }
  },
  'carla-mendes': { novidades: { status: 'recebe', how: 'resposta-sim', since: '12/11' } },
  'igor-matos': { retorno: { status: 'nao-recebe', how: 'cliente', since: '10/11' } }
};

const listeners = new Set<() => void>();
let version = 0;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};

/** Faz o componente reagir a mudanças de preferência (Ficha, Clientes, Oportunidades, Lista de espera…). */
export const useContactBlocks = () => useSyncExternalStore(subscribe, () => version);

/** Situação de UM tipo para um cliente (com o padrão quando nada foi registrado). */
export const kindOf = (clientId: string | null | undefined, kind: ContactKind): KindRecord => (clientId ? records[clientId]?.[kind] : undefined) ?? DEFAULTS[kind];
export const kindStopped = (clientId: string | null | undefined, kind: ContactKind) => kindOf(clientId, kind).status === 'nao-recebe';
/** Novidades da clínica só vão para quem disse que sim. */
export const receivesNews = (clientId: string | null | undefined) => kindOf(clientId, 'novidades').status === 'recebe';

/**
 * L24a (pedido 1a do Christian): selo da lista de Clientes. Só Avisos de retorno e Lembretes de horário geram selo;
 * Novidades e Aviso de vaga não. Sem selo quando nenhum dos dois está parado.
 */
export const LIST_BADGE_TEXT = { retorno: 'Não recebe retorno', lembretes: 'Não recebe lembretes', ambos: 'Não recebe avisos' } as const;
export const listBadgeOf = (clientId: string | null | undefined): string | null => {
  const retorno = kindStopped(clientId, 'retorno');
  const lembretes = kindStopped(clientId, 'lembretes');
  if (retorno && lembretes) return LIST_BADGE_TEXT.ambos;
  if (retorno) return LIST_BADGE_TEXT.retorno;
  if (lembretes) return LIST_BADGE_TEXT.lembretes;
  return null;
};
/** Texto ao passar o mouse no selo: as linhas dos tipos parados ("Não recebe avisos de retorno: …"). */
export const listBadgeDetail = (clientId: string | null | undefined): string =>
(['lembretes', 'retorno'] as ContactKind[]).
filter((k) => kindStopped(clientId, k)).
map((k) => stoppedLine(k, kindOf(clientId, k))).
join('. ');

/** A equipe registra que o cliente pediu para parar estes tipos. Simulação: nada é enviado ou gravado no servidor. */
export function stopKinds(clientId: string, kinds: ContactKind[], since: string) {
  if (kinds.length === 0) return;
  const mine = { ...(records[clientId] ?? {}) };
  kinds.forEach((k) => {
    mine[k] = { status: 'nao-recebe', how: 'equipe', since };
  });
  records = { ...records, [clientId]: mine };
  emit();
}

/** "Voltar a enviar": o tipo volta ao padrão. */
export function resumeKind(clientId: string, kind: ContactKind) {
  const { [kind]: _gone, ...rest } = records[clientId] ?? {};
  records = { ...records, [clientId]: rest };
  emit();
}

/* ─────────── Compatibilidade com o formato antigo (telas ainda não revistas no L23) ─────────── */

export type ContactBlock = {
  clientId: string;
  /** Texto curto para mostrar ao usuário */
  reason: string;
  /** dd/mm do pedido, quando conhecido */
  since?: string;
  /** Quem registrou: o próprio cliente ou a clínica */
  source: 'cliente' | 'clinica';
  /** Os lembretes de horário continuam saindo (o cliente parou só os avisos de retorno). */
  remindersBack?: boolean;
  remindersBackSince?: string;
};

/** L23: "pedido de saída" antigo = "Avisos de retorno" parados. */
export const contactBlockOf = (clientId?: string | null): ContactBlock | null => {
  if (!clientId) return null;
  const r = kindOf(clientId, 'retorno');
  if (r.status !== 'nao-recebe') return null;
  const remindersOn = !kindStopped(clientId, 'lembretes');
  return {
    clientId,
    reason: remindersOn ? 'Pediu para parar os avisos de retorno' : 'Pediu para parar de receber mensagens',
    since: r.since,
    source: r.how === 'cliente' ? 'cliente' : 'clinica',
    remindersBack: remindersOn
  };
};
export const contactBlockOfName = (name: string): ContactBlock | null => contactBlockOf(clientIdFromName(name));

export const offersBlockedOf = (clientId?: string | null): boolean => kindStopped(clientId, 'vaga');
export const remindersBlockedOf = (clientId?: string | null): boolean => kindStopped(clientId, 'lembretes');
export const remindersBlockedOfName = (name: string): boolean => remindersBlockedOf(clientIdFromName(name));

/** Formato antigo: lembretes de volta (ou parados de novo). */
export function setRemindersBack(clientId: string, on: boolean, since?: string) {
  if (on) resumeKind(clientId, 'lembretes');else
  stopKinds(clientId, ['lembretes'], since ?? '');
}

/** Formato antigo: a equipe registra que o cliente pediu para parar tudo. */
export function setContactBlock(clientId: string, since: string) {
  stopKinds(clientId, KIND_ORDER, since);
}

/** Formato antigo: volta tudo ao padrão. */
export function clearContactBlock(clientId: string) {
  records = { ...records, [clientId]: {} };
  emit();
}