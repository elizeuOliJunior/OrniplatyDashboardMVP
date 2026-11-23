/**
 * Listas dos formulários (Novo agendamento, Lista de espera, Fechar atendimento, Pacotes, assistente da Agenda…).
 *
 * G1 (23/10/2026, F-016): este arquivo NÃO tem mais lista própria. Os arrays nascem da semente única de serviços
 * (data/servicesSeed.ts) e da equipe de exemplo (data/equipeFuncionamento.ts) pela MESMA conversão que os stores vivos
 * usam, e são atualizados NO LUGAR (mesma referência) por `syncCatalogServices` (data/servicesStore.ts) e
 * `syncCatalogProfessionals` (data/availability.ts). Clientes saíram daqui: a lista de escolha vem de
 * `useClientOptions` / `allClientsForSelect` em data/api/clientes.ts (um cadastro só, F-001).
 * Arquivados continuam nas listas de consulta (histórico) e saem só das listas de escolha.
 */
import { catalogEntryOf, seedServices } from './servicesSeed';
import { teamMembers } from './equipeFuncionamento';

type CatalogService = {value: string;label: string;minutes: number;price: number;active: boolean;};
type CatalogProfessional = {value: string;label: string;color: string;};

const seedServiceEntries = seedServices.map(catalogEntryOf);
const seedProfessionalEntries = teamMembers.map((m) => ({ value: m.id, label: m.name, color: m.color, active: m.active !== false }));

export const catalogServices: CatalogService[] = seedServiceEntries.map(({ value, label, minutes, price, active }) => ({ value, label, minutes, price, active }));
export const catalogProfessionals: CatalogProfessional[] = seedProfessionalEntries.map(({ value, label, color }) => ({ value, label, color }));

const serviceOption = (s: CatalogService) => ({
  value: s.value,
  label: s.label,
  description: `${s.minutes} min · ${s.price > 0 ? s.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'preço sob consulta'}`
});
export const serviceOptions = seedServiceEntries.filter((s) => s.active).map(serviceOption);
/** Lote A (21/10/2026): cada opção traz a cor do profissional (bolinha do `Select`, como o ProfessionalTag). */
export const professionalOptions = seedProfessionalEntries.filter((p) => p.active).map((p) => ({ value: p.value, label: p.label, color: p.color }));

export function syncCatalogServices(list: {value: string;label: string;minutes: number;price: number;active: boolean;}[]) {
  catalogServices.splice(0, catalogServices.length, ...list.map(({ value, label, minutes, price, active }) => ({ value, label, minutes, price, active })));
  serviceOptions.splice(0, serviceOptions.length, ...list.filter((s) => s.active).map(serviceOption));
}
export function syncCatalogProfessionals(list: {value: string;label: string;color: string;active: boolean;}[]) {
  catalogProfessionals.splice(0, catalogProfessionals.length, ...list.map(({ value, label, color }) => ({ value, label, color })));
  professionalOptions.splice(0, professionalOptions.length, ...list.filter((p) => p.active).map((p) => ({ value: p.value, label: p.label, color: p.color })));
}

/* ───────────── identidade do serviço (G3, revisão v3) ───────────── */

/** Accent marks (U+0300 to U+036F), montado por código para o arquivo ficar em ASCII aqui. */
const ACCENTS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const keyOf = (name: string) => name.trim().toLowerCase().normalize('NFD').replace(ACCENTS, '').replace(/\s+/g, ' ');

/**
 * Nomes ANTERIORES de cada serviço (nome normalizado → id). Agendamentos, lista de espera e mensagens guardam o NOME
 * do momento em que foram registrados e esse texto não é reescrito; renomear em Serviços e equipe grava aqui o nome
 * antigo (`recordFormerServiceName`, chamado por `saveService`) para o texto antigo continuar apontando para o MESMO
 * serviço. Sem registro de renomeação, um nome que não está no catálogo fica "não encontrado" (nunca é adivinhado).
 */
const formerNames = new Map<string, string>();
export function recordFormerServiceName(oldName: string, id: string) {
  const k = keyOf(oldName);
  if (k) formerNames.set(k, id);
}

/**
 * Resolução CANÔNICA de um nome de serviço gravado (agenda, lista de espera, assistente) contra o catálogo vivo:
 *  - `active`: o serviço existe e está ativo (pelo nome atual ou por um nome anterior do mesmo id);
 *  - `archived`: o serviço existe mas está arquivado (nada novo pode ser oferecido ou criado com ele);
 *  - `unknown`: o nome não está no catálogo nem nos nomes anteriores (não se inventa serviço nem duração);
 *  - `missing`: não há nome de serviço.
 * O nome ATUAL vence o nome antigo (um serviço novo pode reaproveitar um nome que outro usava).
 */
export type ServiceResolution =
{status: 'active' | 'archived';service: CatalogService;recordedName: string;renamed: boolean;} |
{status: 'unknown' | 'missing';recordedName: string;};

export function resolveService(name?: string | null): ServiceResolution {
  const recordedName = (name ?? '').trim();
  if (!recordedName) return { status: 'missing', recordedName };
  const k = keyOf(recordedName);
  const current = catalogServices.find((s) => keyOf(s.label) === k);
  const byFormer = current ? undefined : catalogServices.find((s) => s.value === formerNames.get(k));
  const service = current ?? byFormer;
  if (!service) return { status: 'unknown', recordedName };
  return { status: service.active ? 'active' : 'archived', service, recordedName, renamed: !current };
}

/**
 * Por que este serviço NÃO pode ser usado numa ação nova (proposta, oferta, agendamento). `null` = pode.
 * O texto é para a equipe (assistente da Agenda, lista de espera): diz o que está errado e o que fazer.
 */
export function serviceUseIssue(name?: string | null): string | null {
  const r = resolveService(name);
  if (r.status === 'active') return null;
  if (r.status === 'missing') return 'Falta dizer o serviço.';
  if (r.status === 'archived') return `${r.service.label} está arquivado em Serviços e equipe. Escolha um serviço ativo.`;
  return `O serviço "${r.recordedName}" não está mais no catálogo (Serviços e equipe). Escolha um serviço ativo.`;
}

/** Serviço ATIVO do nome gravado (nome atual ou anterior). Sem serviço ativo, `undefined`: nunca devolve duração inventada. */
export const activeServiceOf = (name?: string | null) => {
  const r = resolveService(name);
  return r.status === 'active' ? r.service : undefined;
};

/**
 * Serviço pelo nome gravado, ativo OU arquivado (consulta, histórico, duração de horário já marcado). Desde a revisão v3
 * também acha o serviço por um nome anterior registrado na renomeação.
 */
export function serviceByLabel(label: string) {
  const r = resolveService(label);
  return r.status === 'active' || r.status === 'archived' ? r.service : undefined;
}
export function serviceByValue(value: string) {
  return catalogServices.find((s) => s.value === value);
}
export function professionalByLabel(label: string) {
  return catalogProfessionals.find((p) => p.label === label);
}
/** Profissional (inclusive arquivado) pelo id — para histórico, detalhes e cores. */
export function professionalByValue(value: string) {
  return catalogProfessionals.find((p) => p.value === value);
}

/** Formats "2026-10-02" as "02/10". */
export function shortDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}