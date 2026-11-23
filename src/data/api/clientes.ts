/**
 * SIMULAÇÃO DO BACKEND DE CLIENTES / CRM (protótipo, sem rede).
 *
 * Espelha `agenda-plus-api` (branch main):
 *   GET /api/clients · GET /api/clients/{id} · GET /api/clients/{id}/profile
 *   POST /api/clients · PUT /api/clients/{id} · GET /api/clients/tags · GET /api/clients/origins
 *
 * ATENÇÃO — itens que o backend real (main) AINDA NÃO TEM e que aqui são só simulação de protótipo:
 *   · excluir uma tag para todos (o real só renomeia e desativa: `PATCH /clients/tags/{id}`, sem DELETE);
 *   · arquivar/restaurar cliente (o real só tem `DELETE /clients/{id}`, exclusão permanente LGPD em cascata);
 *   · recomendação de retorno completa (o real guarda só `next_return_on`, uma data).
 *
 * `ClientResponse` e `ClientProfileResponse` têm os mesmos campos da API. A ficha, como no
 * backend (crm/client_profile.py), é COMPOSTA a partir da agenda, do financeiro e das conversas —
 * nada de contador guardado (`total_spent_cents` e `total_appointments` estão deprecados lá e
 * não aparecem aqui).
 *
 * G1 (23/10/2026, F-001): este é o ÚNICO cadastro de clientes do Painel. O legado `data/clientes.ts` ficou só com tipos.
 * Oportunidades, opt-out, Select de agendamento/lista de espera e assistente da Agenda leem daqui (`clientById`,
 * `clientPhone`, `allClientsForSelect`, `useClientOptions`). Quem aparece na Agenda ou nas conversas de exemplo tem cadastro
 * aqui (Larissa, Otávio, Mariana, Juliana Prado, Lucas, Priscila, Rodrigo). "Pacote" e "não quer mensagens" não são campos
 * do cliente: vêm de data/api/pacotes.ts e data/contactPreferences.ts.
 */
import { useSyncExternalStore } from 'react';
import { NOW, TODAY_ISO, nowIso } from '../agendaStore';
import type { CalAppointment } from '../agendaStore';
import { useAgendaData } from '../agendaLive';
import { agendaProfessionalOf } from '../availability';
import { conversations } from '../conversas';
import { conversationThreads, setConversationIdentity } from '../conversasThreads';
import { clientIdFromName, contactBlockOf } from '../contactPreferences';
import { financialRecordsOf, useBackendVersion } from './pacotes';
import type { FinancialRecord } from './pacotes';

export type ClientTagRef = {id: string;name: string;slug: string | null;is_active: boolean;};
export type ClientOriginRef = {id: string;name: string;};

export type ClientResponse = {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  cpf: string | null;
  birth_date: string | null;
  gender: 'female' | 'male' | 'other' | 'not_informed' | null;
  occupation: string | null;
  landline_phone: string | null;
  next_return_on: string | null;
  zip_code: string | null;
  street: string | null;
  address_number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  notes: string | null;
  tag_items: ClientTagRef[];
  origin: ClientOriginRef | null;
  first_contact_at: string | null;
  last_contact_at: string | null;
  completed_appointments: number;
  last_completed_at: string | null;
  consent_given_at: string | null;
  consent_source: string | null;
  created_at: string;
  /** SÓ PROTÓTIPO: arquivamento ainda não existe no backend. */
  archived_at: string | null;
};

export type AppointmentResponse = {
  id: string;
  date: string;
  start_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  service: {name: string;} | null;
  professional: {name: string;color: string;} | null;
  /** Ligação com a agenda do protótipo, para abrir o mesmo card de agendamento */
  cal?: {iso: string;appt: CalAppointment;};
};

export type ProcedimentoRealizado = {id: string;service_name: string;appointment_id: string;date: string;professional_name: string | null;};

/** SÓ PROTÓTIPO: o backend real guarda só a data (`next_return_on`). */
export type FollowUpStatus = 'recommended' | 'contacted' | 'done' | 'dismissed';
export type ClientFollowUp = {
  date: string | null;
  /** valor de `catalogServices` (ex.: 'limpeza') */
  service_value: string | null;
  /** valor de `catalogProfessionals` (ex.: 'carolina') ou 'any' */
  professional_id: string | null;
  reason: string | null;
  status: FollowUpStatus;
};
export const FOLLOW_UP_STATUS: Record<FollowUpStatus, {label: string;tone: 'info' | 'violet' | 'success' | 'muted';}> = {
  recommended: { label: 'Recomendado', tone: 'info' },
  contacted: { label: 'Cliente avisado', tone: 'violet' },
  done: { label: 'Concluído', tone: 'success' },
  dismissed: { label: 'Dispensado', tone: 'muted' }
};

export type ClientProfileResponse = {
  client: ClientResponse;
  ultimo_atendimento: AppointmentResponse | null;
  proximo_retorno: string | null;
  /** Recomendação de retorno completa (protótipo). Não é um agendamento. */
  retorno: ClientFollowUp | null;
  proximo_agendamento: AppointmentResponse | null;
  atendimentos: AppointmentResponse[];
  atendimentos_total: number;
  procedimentos: ProcedimentoRealizado[];
  procedimentos_total: number;
  financeiro: {em_aberto_cents: number;pendencias_sem_valor: number;tem_registros: boolean;registros: FinancialRecord[];total: number;};
  /** G4 (F-069): `mensagens` = mensagens registradas na conversa (a tela mostra o número real, não só "tem/não tem"). */
  conversas: {conversation_id: string | null;ultimo_contato_em: string | null;canal: string | null;total: number;mensagens: number;};
};

// ── catálogos da clínica ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Catálogo de tags da clínica. Padrões genéricos, úteis para qualquer clínica.
 * "Pele sensível" continua aqui só porque já está em uso por uma cliente (nada se perde em silêncio);
 * as demais sugestões de nicho ficam em `suggestedTagNames`, fora do padrão.
 * O array é mutável de propósito (os componentes releem via `useTagCatalog`).
 */
export const tagCatalog: ClientTagRef[] = [
{ id: 't-vip', name: 'VIP', slug: 'vip', is_active: true },
{ id: 't-novo', name: 'Novo cliente', slug: 'novo-cliente', is_active: true },
{ id: 't-recorrente', name: 'Recorrente', slug: 'recorrente', is_active: true },
{ id: 't-inativo', name: 'Inativo', slug: 'inativo', is_active: true },
{ id: 't-sensivel', name: 'Pele sensível', slug: 'pele-sensivel', is_active: true }];

/** Sugestões opcionais por tipo de clínica. Nada disso é criado sem a clínica pedir. */
export const suggestedTagNames = ['Pele sensível', 'Pós-operatório', 'Gestante', 'Alergia a produtos'];
export const originCatalog: ClientOriginRef[] = [
{ id: 'o-indicacao', name: 'Indicação' },
{ id: 'o-instagram', name: 'Instagram' },
{ id: 'o-google', name: 'Google' },
{ id: 'o-passou', name: 'Passou na frente' },
{ id: 'o-outro', name: 'Outro' }];

const tag = (id: string) => tagCatalog.filter((t) => t.id === id);
const origin = (id: string) => originCatalog.find((o) => o.id === id) ?? null;

// ── amostra (dados de exemplo) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const base = {
  email: null, cpf: null, birth_date: null, gender: null, occupation: null, landline_phone: null, next_return_on: null,
  zip_code: null, street: null, address_number: null, complement: null, district: null, city: null, state: null,
  emergency_contact_name: null, emergency_contact_phone: null, emergency_contact_relation: null, notes: null,
  consent_given_at: null, consent_source: null, archived_at: null
} as const;

/**
 * I3 (11/11/2026, decisão I1-4b do Christian): "Primeiro contato por" (`consent_source`) preenchido para TODA a amostra.
 * WhatsApp: Bruno, Carla, Diego, Fernanda, Helena, Priscila, Rodrigo (quem tem conversa de exemplo). Cadastro pela equipe
 * ('manual'): Ana, Gabriela e os clientes sem conversa (Igor, Larissa, Otávio, Mariana, Juliana Prado, Lucas). Nenhum
 * cliente da amostra mostra "Não informado" nessa linha da Ficha.
 */
let clients: Omit<ClientResponse, 'completed_appointments' | 'last_completed_at' | 'last_contact_at'>[] = [
{
  ...base, id: 'ana-ribeiro', name: 'Ana Ribeiro', phone: '(19) 99641-3378', email: 'ana.ribeiro@email.com', birth_date: '1991-04-18', gender: 'female',
  occupation: 'Arquiteta', zip_code: '13024-001', street: 'Rua Barão de Jaguara', address_number: '1200', complement: 'apto 52', district: 'Centro', city: 'Campinas', state: 'SP',
  emergency_contact_name: 'Paulo Ribeiro', emergency_contact_phone: '(19) 99712-0044', emergency_contact_relation: 'Cônjuge',
  notes: 'Prefere horários pela manhã. Pele sensível, evitar ácidos fortes.', tag_items: tag('t-vip'), origin: origin('o-indicacao'),
  first_contact_at: '2025-03-10T10:20:00', consent_given_at: '2025-03-10T10:20:00', consent_source: 'manual', created_at: '2025-03-10T10:20:00'
},
{ ...base, id: 'bruno-costa', name: 'Bruno Costa', phone: '(19) 99812-5530', tag_items: [], origin: origin('o-instagram'), first_contact_at: '2026-07-28T14:00:00', consent_source: 'whatsapp', created_at: '2026-07-28T14:00:00' },
{ ...base, id: 'carla-mendes', name: 'Carla Mendes', phone: '(19) 99723-0914', next_return_on: '2026-10-31', tag_items: tag('t-vip'), origin: origin('o-indicacao'), first_contact_at: '2025-11-02T09:00:00', consent_source: 'whatsapp', created_at: '2025-11-02T09:00:00' },
{ ...base, id: 'diego-alves', name: 'Diego Alves', phone: '(19) 99905-2271', tag_items: [], origin: origin('o-google'), first_contact_at: '2026-09-01T15:00:00', consent_source: 'whatsapp', created_at: '2026-09-01T15:00:00' },
{ ...base, id: 'fernanda-lima', name: 'Fernanda Lima', phone: '(19) 99134-6602', tag_items: tag('t-sensivel'), origin: origin('o-instagram'), first_contact_at: '2026-08-08T11:00:00', consent_source: 'whatsapp', created_at: '2026-08-08T11:00:00' },
{ ...base, id: 'gabriela-rocha', name: 'Gabriela Rocha', phone: '(19) 99287-4415', tag_items: [], origin: origin('o-passou'), first_contact_at: '2026-02-27T16:00:00', consent_source: 'manual', created_at: '2026-02-27T16:00:00' },
{ ...base, id: 'helena-duarte', name: 'Helena Duarte', phone: '(19) 99356-1180', tag_items: [], origin: origin('o-google'), first_contact_at: '2026-07-10T10:00:00', consent_source: 'whatsapp', created_at: '2026-07-10T10:00:00' },
{ ...base, id: 'igor-matos', name: 'Igor Matos', phone: '(19) 99478-9023', tag_items: [], origin: origin('o-instagram'), first_contact_at: '2026-08-20T13:00:00', consent_source: 'manual', created_at: '2026-08-20T13:00:00' },
// Oportunidades › Sumiu (Lote A): sem visita desde 15/07, sem nada marcado. Antes só existia no cadastro legado (F-001).
{ ...base, id: 'larissa-campos', name: 'Larissa Campos', phone: '(19) 99812-3307', tag_items: [], origin: origin('o-indicacao'), first_contact_at: '2026-03-02T10:00:00', consent_source: 'manual', created_at: '2026-03-02T10:00:00' },
// Agenda de exemplo: falta em 30/09 (Oportunidades › Faltou).
{ ...base, id: 'otavio-reis', name: 'Otávio Reis', phone: '(19) 99173-8821', tag_items: [], origin: origin('o-google'), first_contact_at: '2026-09-18T11:00:00', consent_source: 'manual', created_at: '2026-09-18T11:00:00' },
// Agenda de exemplo (semana e setembro).
{ ...base, id: 'mariana-teixeira', name: 'Mariana Teixeira', phone: '(19) 99260-4471', tag_items: tag('t-recorrente'), origin: origin('o-indicacao'), first_contact_at: '2026-04-15T09:00:00', consent_source: 'manual', created_at: '2026-04-15T09:00:00' },
{ ...base, id: 'juliana-prado', name: 'Juliana Prado', phone: '(19) 99318-7705', tag_items: [], origin: origin('o-instagram'), first_contact_at: '2026-09-10T14:00:00', consent_source: 'manual', created_at: '2026-09-10T14:00:00' },
{ ...base, id: 'lucas-ferreira', name: 'Lucas Ferreira', phone: '(19) 99704-1136', tag_items: [], origin: origin('o-google'), first_contact_at: '2026-09-12T16:00:00', consent_source: 'manual', created_at: '2026-09-12T16:00:00' },
// Conversas/Oportunidades › Pediu preço: chegaram pelo WhatsApp e ainda não têm atendimento (o backend cria o cliente ao receber a 1ª mensagem).
{ ...base, id: 'priscila-duarte', name: 'Priscila Duarte', phone: '(19) 99561-2047', tag_items: tag('t-novo'), origin: origin('o-instagram'), first_contact_at: '2026-09-15T14:20:00', consent_source: 'whatsapp', created_at: '2026-09-15T14:20:00' },
{ ...base, id: 'rodrigo-pires', name: 'Rodrigo Pires', phone: '(19) 99418-7752', tag_items: tag('t-novo'), origin: origin('o-outro'), first_contact_at: '2026-09-29T10:05:00', consent_source: 'whatsapp', created_at: '2026-09-29T10:05:00' }];


/**
 * W5 (A4-15): as 10 sessões do pacote de Drenagem da Gabriela (mesmas datas de `GABRIELA_DRENAGEM` em data/api/pacotes.ts;
 * repetidas aqui de propósito para não depender da ordem de carregamento dos dois arquivos).
 */
const GABRIELA_DRENAGEM = Array.from({ length: 10 }, (_, i) => `2026-0${3 + Math.floor(i / 3)}-${String(2 + i % 3 * 9).padStart(2, '0')}`);

/** Atendimentos anteriores à semana da agenda (só leitura). */
const history: {client: string;appt: AppointmentResponse;}[] = [
{ client: 'Ana Ribeiro', appt: past('h-a1', '2026-07-12', '09:00', 'completed', 'Limpeza de pele', 'carolina') },
{ client: 'Ana Ribeiro', appt: past('h-a2', '2026-06-14', '10:00', 'completed', 'Limpeza de pele', 'carolina') },
{ client: 'Ana Ribeiro', appt: past('h-a3', '2026-05-20', '14:00', 'no_show', 'Drenagem linfática', 'juliana') },
{ client: 'Ana Ribeiro', appt: past('h-a4', '2026-05-03', '09:30', 'completed', 'Limpeza de pele', 'carolina') },
// G1 subetapa 2 (FIXTURE DA AMOSTRA): a última visita que o caso fixo da Larissa citava ("Sem visita desde 15/07").
{ client: 'Larissa Campos', appt: past('h-l1', '2026-07-15', '10:00', 'completed', 'Limpeza de pele', 'carolina') },
// W5 (A4-15, decisão do Christian de 11/11/2026, opção a): atendimentos passados que faltavam para as sessões de pacote já
// usadas na amostra (data/api/pacotes.ts). Cada sessão usada aponta para um destes atendimentos.
{ client: 'Fernanda Lima', appt: past('h-f1', '2026-08-10', '09:30', 'completed', 'Limpeza de pele', 'juliana') },
{ client: 'Bruno Costa', appt: past('h-b1', '2026-08-04', '09:00', 'completed', 'Drenagem linfática', 'juliana') },
{ client: 'Bruno Costa', appt: past('h-b2', '2026-08-18', '09:00', 'completed', 'Drenagem linfática', 'juliana') },
{ client: 'Bruno Costa', appt: past('h-b3', '2026-09-01', '09:00', 'completed', 'Drenagem linfática', 'juliana') },
{ client: 'Bruno Costa', appt: past('h-b4', '2026-09-08', '09:00', 'completed', 'Drenagem linfática', 'juliana') },
{ client: 'Helena Duarte', appt: past('h-h1', '2026-07-15', '10:00', 'completed', 'Peeling químico', 'carolina') },
{ client: 'Helena Duarte', appt: past('h-h2', '2026-08-15', '10:00', 'completed', 'Peeling químico', 'carolina') },
...GABRIELA_DRENAGEM.map((d, i) => ({ client: 'Gabriela Rocha', appt: past(`h-g${i}`, d, '16:00', 'completed', 'Drenagem linfática', 'juliana') }))];

/** Profissional (id) de cada atendimento do histórico, para quem precisa do id e não do nome (G1 subetapa 2). */
const historyPro: Record<string, string> = {
  'h-a1': 'carolina', 'h-a2': 'carolina', 'h-a3': 'juliana', 'h-a4': 'carolina', 'h-l1': 'carolina',
  'h-f1': 'juliana', 'h-b1': 'juliana', 'h-b2': 'juliana', 'h-b3': 'juliana', 'h-b4': 'juliana', 'h-h1': 'carolina', 'h-h2': 'carolina',
  ...Object.fromEntries(GABRIELA_DRENAGEM.map((_, i) => [`h-g${i}`, 'juliana']))
};
function past(id: string, date: string, time: string, status: AppointmentResponse['status'], service: string, pro: string): AppointmentResponse {
  const p = agendaProfessionalOf(pro);
  return { id, date, start_time: time, status, service: { name: service }, professional: p ? { name: p.name, color: p.color } : null };
}

/** Último contato pelo WhatsApp (amostra alinhada a Conversas). */
const lastContact: Record<string, string> = {
  'ana-ribeiro': '2026-10-01T09:16:00',
  'bruno-costa': '2026-10-01T09:04:00',
  'carla-mendes': '2026-10-01T09:14:00',
  'fernanda-lima': '2026-10-01T08:12:00',
  'gabriela-rocha': '2026-09-30T17:21:00',
  'diego-alves': '2026-09-30T15:42:00',
  'helena-duarte': '2026-09-30T18:12:00',
  'priscila-duarte': '2026-09-30T11:05:00'
};

// ── store ─────────────────────────────────────────────────────────────────────────────────────

let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const STATUS: Record<string, AppointmentResponse['status']> = {
  scheduled: 'scheduled',
  pending_confirmation: 'scheduled',
  confirmed: 'confirmed',
  completed: 'completed',
  cancelled: 'cancelled',
  no_show: 'no_show'
};

/**
 * G1 (F-001, v6): nomes que cada id já teve. A agenda, a lista de espera, as conversas e os casos guardam o nome como
 * TEXTO do momento em que foram registrados; este mapa liga esse texto antigo ao id estável depois de uma edição.
 */
const formerNames: Record<string, string[]> = {};

/**
 * Id do cadastro para um nome registrado (agenda, lista de espera, histórico): o cliente com esse nome hoje, ou o cliente
 * que já teve esse nome (`formerNames`). Só consulta o cadastro: nunca cria um id a partir do nome (v7). `null` quando o
 * cliente não está no cadastro (excluído).
 */
export function clientIdOfRecordedName(name: string): string | null {
  const now = clients.find((c) => c.name === name);
  if (now) return now.id;
  const before = clients.find((c) => formerNames[c.id]?.includes(name));
  return before ? before.id : null;
}

/**
 * G1 (F-001, v8): pedido de saída de quem aparece por NOME num registro (lista de espera, gerador de retornos), lido pelo
 * id do cadastro. Só quando o cliente não está no cadastro (excluído) fica a chave antiga pelo nome, para o pedido já
 * registrado continuar valendo.
 */
export const contactBlockOfRecordedName = (name: string) => contactBlockOf(clientIdOfRecordedName(name) ?? clientIdFromName(name));

function appointmentsOf(id: string, agenda: Record<string, CalAppointment[]>): AppointmentResponse[] {
  const live = Object.entries(agenda).flatMap(([iso, list]) =>
  list.
  filter((a) => clientIdOfRecordedName(a.clientName) === id).
  map((a): AppointmentResponse => {
    const p = agendaProfessionalOf(a.professionalId);
    return {
      id: a.id, date: iso, start_time: a.start, status: STATUS[a.status] ?? 'scheduled', service: { name: a.service },
      professional: p ? { name: p.name, color: p.color } : null, cal: { iso, appt: a }
    };
  })
  );
  return [...live, ...history.filter((h) => clientIdOfRecordedName(h.client) === id).map((h) => h.appt)].sort((x, y) =>
  (y.date + y.start_time).localeCompare(x.date + x.start_time)
  );
}

/**
 * G1 subetapa 2 (F-009, "Sumiu"): última visita CONCLUÍDA do cliente (agenda viva + histórico do cadastro) e se ele já tem
 * horário aberto no futuro. Só lê os registros que existem; quem nunca teve atendimento concluído não é "sumido".
 */
export function visitSummaryOf(id: string, agenda: Record<string, CalAppointment[]>): {last: {iso: string;service: string;professionalId: string;} | null;hasFuture: boolean;} {
  const all = appointmentsOf(id, agenda);
  const done = all.find((a) => a.status === 'completed');
  const hasFuture = all.some((a) => (a.status === 'scheduled' || a.status === 'confirmed') && isFuture(a));
  const last = done ? { iso: done.date, service: done.service?.name ?? '', professionalId: done.cal?.appt.professionalId ?? historyPro[done.id] ?? '' } : null;
  return { last, hasFuture };
}
/**
 * G1 subetapa 3: atendimentos do HISTÓRICO do cadastro (anteriores à agenda viva), com id estável, para Resultados contar
 * nos indicadores sem valor (atendimentos, presença, faltas). Não têm registro financeiro: não entram em recebimentos.
 */
export const historyVisits = () =>
history.map((h) => ({ id: h.appt.id, clientId: clientIdOfRecordedName(h.client), client: h.client, iso: h.appt.date, time: h.appt.start_time, status: h.appt.status, service: h.appt.service?.name ?? '', pro: historyPro[h.appt.id] ?? '' }));

/** Clientes do cadastro (ativos, não arquivados) para os geradores de Oportunidades. */
export const followUpCandidates = () => clients.filter((c) => !c.archived_at).map((c) => ({ id: c.id, name: c.name }));

const isFuture = (a: AppointmentResponse) => a.date > TODAY_ISO || a.date === TODAY_ISO && a.start_time >= NOW;

function withDerived(c: (typeof clients)[number], agenda: Record<string, CalAppointment[]>): ClientResponse {
  const done = appointmentsOf(c.id, agenda).filter((a) => a.status === 'completed');
  return { ...c, completed_appointments: done.length, last_completed_at: done[0]?.date ?? null, last_contact_at: lastContact[c.id] ?? null };
}

/** Relê o catálogo de tags quando ele muda (criar, renomear, desativar, excluir). */
export function useTagCatalog() {
  useSyncExternalStore(subscribe, () => version);
  return tagCatalog;
}

/** GET /api/clients — busca por nome ou telefone e filtro por tags (o que a API aceita). Arquivados ficam de fora, salvo `archived: 'only'` (protótipo). */
export function useClients(params: {search?: string;tags?: string[];archived?: 'hide' | 'only';} = {}) {
  useSyncExternalStore(subscribe, () => version);
  const { appointments } = useAgendaData();
  const q = (params.search ?? '').trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const onlyArchived = params.archived === 'only';
  return clients.
  filter((c) => onlyArchived ? !!c.archived_at : !c.archived_at).
  filter((c) => !q || c.name.toLowerCase().includes(q) || digits && c.phone.replace(/\D/g, '').includes(digits)).
  filter((c) => !params.tags?.length || c.tag_items.some((t) => params.tags!.includes(t.id))).
  map((c) => withDerived(c, appointments));
}

// ── retorno recomendado (protótipo) ─────────────────────────────────────────────────────────

const followUps: Record<string, ClientFollowUp> = {};

/** Com só a data do backend real, o resto fica vazio: nada é inventado. */
function followUpOf(c: {id: string;next_return_on: string | null;}): ClientFollowUp | null {
  if (followUps[c.id]) return followUps[c.id];
  return c.next_return_on ? { date: c.next_return_on, service_value: null, professional_id: null, reason: null, status: 'recommended' } : null;
}

/** Salva a recomendação. NÃO cria agendamento: o horário só é reservado pela Agenda. */
export function saveFollowUp(id: string, data: ClientFollowUp) {
  followUps[id] = data;
  clients = clients.map((c) => c.id === id ? { ...c, next_return_on: data.date } : c);
  emit();
}

export function removeFollowUp(id: string) {
  delete followUps[id];
  clients = clients.map((c) => c.id === id ? { ...c, next_return_on: null } : c);
  emit();
}

/** GET /api/clients/{id}/profile — a ficha composta na hora. */
export function useClientProfile(id: string): ClientProfileResponse | null {
  useSyncExternalStore(subscribe, () => version);
  useBackendVersion();
  const { appointments } = useAgendaData();
  const c = clients.find((x) => x.id === id);
  if (!c) return null;
  const client = withDerived(c, appointments);
  const todos = appointmentsOf(c.id, appointments);
  const realizados = todos.filter((a) => a.status === 'completed');
  const futuros = todos.filter((a) => isFuture(a) && a.status !== 'cancelled' && a.status !== 'no_show' && a.status !== 'completed');
  const registros = financialRecordsOf(c.id);
  const conversa = conversations.find((x) => x.id === c.id);
  return {
    client,
    ultimo_atendimento: realizados[0] ?? null,
    proximo_retorno: c.next_return_on,
    retorno: followUpOf(c),
    proximo_agendamento: futuros[futuros.length - 1] ?? null,
    atendimentos: todos,
    atendimentos_total: todos.length,
    procedimentos: realizados.map((a) => ({ id: `p-${a.id}`, service_name: a.service?.name ?? '—', appointment_id: a.id, date: a.date, professional_name: a.professional?.name ?? null })),
    procedimentos_total: realizados.length,
    financeiro: {
      em_aberto_cents: registros.filter((r) => r.status === 'pending').reduce((t, r) => t + (r.amount_cents ?? 0), 0),
      pendencias_sem_valor: registros.filter((r) => r.status === 'pending' && r.amount_cents === null).length,
      tem_registros: registros.length > 0,
      registros,
      total: registros.length
    },
    conversas: { conversation_id: conversa?.id ?? null, ultimo_contato_em: lastContact[c.id] ?? null, canal: conversa ? 'whatsapp' : null, total: conversa ? 1 : 0, mensagens: conversationThreads[c.id]?.length ?? 0 }
  };
}

export type ClientCadastro = Partial<Omit<ClientResponse, 'id' | 'tag_items' | 'origin' | 'completed_appointments' | 'last_completed_at' | 'last_contact_at' | 'created_at'>> & {
  tag_ids?: string[];
  origin_id?: string | null;
};

/** PUT /api/clients/{id} */
export function updateClient(id: string, data: ClientCadastro) {
  const { tag_ids, origin_id, ...fields } = data;
  const before = clients.find((c) => c.id === id);
  const renamed = !!before && !!fields.name && fields.name !== before.name;
  if (renamed) formerNames[id] = [...(formerNames[id] ?? []), before.name];
  clients = clients.map((c) =>
  c.id === id ?
  {
    ...c,
    ...fields,
    ...(tag_ids ? { tag_items: tagCatalog.filter((t) => tag_ids.includes(t.id)) } : {}),
    ...(origin_id !== undefined ? { origin: origin_id ? origin(origin_id) : null } : {})
  } :
  c
  );
  // G1 (F-001, v6): a conversa mostra o nome atual (cabeçalho e ficha resumida); as mensagens não mudam.
  if (renamed) setConversationIdentity(id, fields.name as string);
  emit();
}

/** POST /api/clients — nome e WhatsApp obrigatórios; o resto é opcional. */
let createdSeq = 0;
export function createClient(data: ClientCadastro & {name: string;phone: string;}) {
  // G4 (F-065): id único mesmo para várias linhas no mesmo milissegundo (importação); data pelo relógio do protótipo.
  createdSeq += 1;
  const id = `cli-${Date.now().toString(36)}-${createdSeq}`;
  const { tag_ids, origin_id, ...fields } = data;
  clients = [
  {
    ...base, ...fields, id, tag_items: tagCatalog.filter((t) => tag_ids?.includes(t.id)), origin: origin_id ? origin(origin_id) : null,
    first_contact_at: null, consent_given_at: null, consent_source: fields.consent_source ?? 'manual', created_at: nowIso()
  },
  ...clients];

  emit();
  return id;
}

export const clientById = (id: string) => clients.find((c) => c.id === id) ?? null;
/** G4 (F-065): todos os cadastros (inclusive arquivados) com telefone, para conferir duplicidade na importação. */
export const allClientsWithPhones = () => clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));

/**
 * W5 (G11, decisão do Christian de 11/11/2026): o antigo "Consentimento · Origem" é, na verdade, por onde o cliente fez o
 * PRIMEIRO CONTATO. Não é consentimento (AQ-01). Só leitura, no cartão, ao lado de "Primeiro contato".
 */
export const firstContactChannelLabel = (source: string | null | undefined) =>
source === 'whatsapp' ? 'WhatsApp' : source === 'importacao' ? 'Importação de planilha' : source === 'manual' ? 'Cadastro pela equipe' : null;

/** Só os dígitos do telefone, sem o 55 do país ("+55 (19) 99641-3378" e "(19) 99641-3378" são o mesmo número). */
export const phoneKey = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
};
/**
 * W5 (G13, 11/11/2026): o WhatsApp identifica a conversa, então é ÚNICO por clínica. Devolve o cliente (inclusive arquivado)
 * que já usa este número, ignorando `exceptId` (a própria ficha em edição). Novo cliente, Editar e Importar bloqueiam com ele.
 * BACKEND: unicidade de telefone por clínica (409 com o id do cliente existente).
 */
export function clientWithPhone(phone: string, exceptId?: string | null): {id: string;name: string;archived: boolean;} | null {
  const key = phoneKey(phone);
  if (key.length < 10) return null;
  const c = clients.find((x) => x.id !== exceptId && phoneKey(x.phone) === key);
  return c ? { id: c.id, name: c.name, archived: !!c.archived_at } : null;
}

/** G4 (F-069): UMA validação de e-mail para Novo cliente, ficha e importação. */
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
/** WhatsApp do cliente pelo id (vazio se não houver cadastro). */
export const clientPhone = (id: string) => clientById(id)?.phone ?? '';
/** Nome ATUAL do cliente pelo id; sem cadastro (excluído), fica o nome registrado. */
export const currentClientName = (id: string, recorded: string) => clientById(id)?.name ?? recorded;
/** Clientes que podem ser escolhidos (não arquivados). */
export const allClientsForSelect = () => clients.filter((c) => !c.archived_at).map((c) => ({ id: c.id, name: c.name }));
/** Opções do `Select` de cliente (Novo agendamento, Lista de espera). O valor é o NOME, como a agenda guarda. */
export const clientOptionsNow = () => allClientsForSelect().map((c) => ({ value: c.name, label: c.name }));
/** Hook: as opções do Select acompanham criar/arquivar/excluir cliente. */
export function useClientOptions() {
  useSyncExternalStore(subscribe, () => version);
  return clientOptionsNow();
}
/** Hook: redesenha quando o cadastro muda (para quem lê `clientById` fora do React). */
export const useClientsVersion = () => useSyncExternalStore(subscribe, () => version);

// ── tags da clínica (catálogo) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const slugify = (name: string) =>
Array.from(name.toLowerCase().normalize('NFD')).
filter((ch) => ch.charCodeAt(0) < 768 || ch.charCodeAt(0) > 879).
join('').
replace(/[^a-z0-9]+/g, '-').
replace(/^-+|-+$/g, '');
const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** Mensagem de erro, ou null se o nome serve. Nome repetido (ignorando maiúsculas) é 409 no backend real. */
export function validateTagName(name: string, exceptId?: string, pending: string[] = []): string | null {
  const n = cleanName(name);
  if (!n) return 'Informe o nome da tag.';
  if (n.length > 30) return 'Use até 30 caracteres.';
  if (tagCatalog.some((t) => t.id !== exceptId && t.name.toLowerCase() === n.toLowerCase())) return 'Já existe uma tag com esse nome.';
  if (pending.some((id) => id.toLowerCase() === pendingTagId(n).toLowerCase())) return 'Já existe uma tag com esse nome.';
  return null;
}

/**
 * G4 (F-069): tag nova escolhida num formulário ainda NÃO salvo fica pendente (`new:<nome>`) e só entra no catálogo quando
 * o cliente é salvo (`resolvePendingTags`). Cancelar o formulário não cria tag nenhuma.
 */
export const PENDING_TAG_PREFIX = 'new:';
export const pendingTagId = (name: string) => `${PENDING_TAG_PREFIX}${cleanName(name)}`;
export const isPendingTag = (id: string) => id.startsWith(PENDING_TAG_PREFIX);
export function resolvePendingTags(ids: string[]): string[] {
  return ids.map((id) => {
    if (!isPendingTag(id)) return id;
    const name = id.slice(PENDING_TAG_PREFIX.length);
    const existing = tagCatalog.find((t) => t.name.toLowerCase() === name.toLowerCase());
    return existing ? existing.id : createTag(name).id;
  });
}

/** POST /api/clients/tags */
export function createTag(name: string): ClientTagRef {
  const n = cleanName(name);
  const t: ClientTagRef = { id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: n, slug: slugify(n), is_active: true };
  tagCatalog.push(t);
  emit();
  return t;
}

function replaceTag(id: string, patch: Partial<ClientTagRef>) {
  const i = tagCatalog.findIndex((t) => t.id === id);
  if (i < 0) return;
  tagCatalog[i] = { ...tagCatalog[i], ...patch };
  const next = tagCatalog[i];
  clients = clients.map((c) => ({ ...c, tag_items: c.tag_items.map((t) => t.id === id ? next : t) }));
  emit();
}

/** PATCH /api/clients/tags/{id} { name } — quem já tem a tag continua com ela, com o nome novo. */
export function renameTag(id: string, name: string) {
  const n = cleanName(name);
  replaceTag(id, { name: n, slug: slugify(n) });
}

/** PATCH /api/clients/tags/{id} { is_active } — desativar tira da seleção e preserva o histórico. */
export function setTagActive(id: string, active: boolean) {
  replaceTag(id, { is_active: active });
}

/** Quantos clientes (inclusive arquivados) têm a tag. */
export function tagUsage(id: string) {
  return clients.filter((c) => c.tag_items.some((t) => t.id === id)).length;
}

/** SÓ PROTÓTIPO: o backend real não tem DELETE de tag, de propósito. Remove a tag de todos os clientes. */
export function deleteTag(id: string) {
  const i = tagCatalog.findIndex((t) => t.id === id);
  if (i >= 0) tagCatalog.splice(i, 1);
  clients = clients.map((c) => ({ ...c, tag_items: c.tag_items.filter((t) => t.id !== id) }));
  emit();
}

// ── arquivar e excluir cliente ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** SÓ PROTÓTIPO: arquivar preserva tudo e tira o cliente das listas. */
export function archiveClient(id: string) {
  clients = clients.map((c) => c.id === id ? { ...c, archived_at: new Date().toISOString() } : c);
  emit();
}

export function restoreClient(id: string) {
  clients = clients.map((c) => c.id === id ? { ...c, archived_at: null } : c);
  emit();
}

/**
 * G4 (F-069): registro de quem foi excluído do cadastro nesta sessão. As telas de operação (Conversas, Pacotes,
 * Oportunidades, Lista de espera) escondem esses clientes; o histórico (agendamentos passados, fechamentos, recebimentos,
 * reembolsos, mensagens enviadas, auditoria e Resultados) continua guardado. Ver `data/clientDeletion.ts`.
 */
export type DeletedClient = {id: string;names: string[];deletedAt: string;};
const deletedClients: DeletedClient[] = [];
export const deletedClientsList = (): readonly DeletedClient[] => deletedClients;
/** `key` = id do cadastro ou chave antiga pelo nome (`clientIdFromName`) usada por casos e bloqueios de quem saiu. */
export const isDeletedClientKey = (key: string) =>
!clients.some((c) => c.id === key) && deletedClients.some((d) => d.id === key || d.names.some((n) => clientIdFromName(n) === key));
/** Nome gravado (agenda, lista de espera) de alguém que saiu do cadastro e que nenhum cliente atual usa. */
export const isDeletedRecordedName = (name: string) => clientIdOfRecordedName(name) === null && deletedClients.some((d) => d.names.includes(name));

/**
 * Simula `DELETE /api/clients/{id}`: tira o cliente do cadastro e registra a exclusão. Use `deleteClientWithEffects`
 * (data/clientDeletion.ts), que também limpa as telas de operação e cancela os horários futuros.
 */
export function deleteClientPermanently(id: string) {
  const c = clients.find((x) => x.id === id);
  if (c) deletedClients.push({ id, names: [c.name, ...(formerNames[id] ?? [])], deletedAt: nowIso() });
  clients = clients.filter((x) => x.id !== id);
  delete followUps[id];
  emit();
}