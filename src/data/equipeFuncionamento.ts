import { clinicExceptionLabel, migrateLegacySchedule } from './schedule';
import type { ClinicException, ClinicHoursDay, ProfessionalSchedule } from './schedule';

/** Formato antigo (texto por dia). Mantido só para a migração e para leitores antigos. */
export type WorkDay = {day: string;hours: string | null;};

/**
 * Profissional com jornada INDIVIDUAL (data/schedule.ts): 7 dias independentes, vários períodos, pausas por dia,
 * exceções por data e intervalo entre atendimentos (0/5/10/15/30). A configuração viva fica em data/availability.ts.
 */
export type TeamMember = {
  id: string;
  name: string;
  color: string;
  services: string[];
  /** Dados do profissional (Serviços e equipe › Equipe › Dados). Opcional para não quebrar o handoff do Onboarding. */
  profile?: ProfessionalProfile;
  /** existe: is_active. `false` = arquivado (sai das listas de escolha; nada é cancelado). */
  active?: boolean;
} & ProfessionalSchedule;

/**
 * Backend lido (origin/main API 3186399, app/modules/booking/models.py:202-295): name, practice_area (120), phone E.164
 * (obrigatório na API; usado no aviso por WhatsApp de agendamento criado/cancelado/remarcado — professional_alert.py:204),
 * email (opcional; nenhum consumidor no app), specialties (JSONB; a IA lê "nome (especialidades: …)"), color (8 tokens),
 * is_active, user_id. CONTRATO NOVO: council/councilNumber/councilUf, bio, photo.
 */
export type ProfessionalProfile = {
  role: string;
  specialties: string[];
  /** só dígitos, com DDD (ex.: 19987002201) */
  phone: string;
  email: string;
  /** CONTRATO NOVO */
  council: string;
  councilNumber: string;
  councilUf: string;
  bio: string;
  /** CONTRATO NOVO: no protótipo é um endereço local da imagem escolhida (não sai do navegador) */
  photo: string;
};

export const blankProfile = (): ProfessionalProfile => ({ role: '', specialties: [], phone: '', email: '', council: '', councilNumber: '', councilUf: '', bio: '', photo: '' });

/** Áreas de atuação da clínica (backend: tabela professional_area por clínica). Exemplo. */
/**
 * G4 (F-073): áreas de atuação NEUTRAS (área, não cargo no feminino ou masculino). Valores já salvos fora da lista (ex.:
 * "Médica", "Esteticista" da amostra) continuam na lista, no topo, até alguém trocar. W2 (11/11/2026, remoção aprovada pelo
 * Christian): sem o complemento "(valor atual)".
 */
export const PRACTICE_AREAS = ['Medicina', 'Estética', 'Biomedicina', 'Odontologia', 'Psicologia', 'Psiquiatria', 'Fisioterapia', 'Nutrição', 'Enfermagem', 'Cabelo', 'Barba', 'Atendimento', 'Recepção'];
/** Áreas sugeridas primeiro pelo segmento, depois as demais; o valor salvo nunca some. */
export function practiceAreaOptions(segmentRoles: string[], saved?: string) {
  const list = [...segmentRoles, ...PRACTICE_AREAS.filter((a) => !segmentRoles.includes(a))];
  const opts = list.map((a) => ({ value: a, label: a }));
  return saved && !list.includes(saved) ? [{ value: saved, label: saved }, ...opts] : opts;
}

/** Conselhos mais comuns em clínica (CONTRATO NOVO). */
export const COUNCILS = ['CRM', 'CRO', 'CRP', 'CRBM', 'COREN', 'CREFITO', 'CRN', 'Outro'];
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

/**
 * Paleta de cor do profissional = os 8 tokens do backend (app/shared/enums.py:117) com o hex do front da main
 * (src/lib/professionalColors.ts). Cores antigas fora da lista continuam aparecendo como "cor atual" até alguém trocar.
 * L24b (18/11/2026): "Cor na agenda" passou a usar as 14 cores `PROFESSIONAL_COLORS` do design system 6.2 (os 8 tokens
 * abaixo, com o mesmo id e o mesmo hex, mais 6 novas). Esta lista fica como referência dos tokens que o backend já tem.
 */
export const PROFESSIONAL_COLOR_TOKENS: {token: string;label: string;hex: string;}[] = [
{ token: 'teal', label: 'Verde-azulado', hex: '#0E7490' },
{ token: 'blue', label: 'Azul', hex: '#1D4ED8' },
{ token: 'violet', label: 'Violeta', hex: '#7C3AED' },
{ token: 'fuchsia', label: 'Magenta', hex: '#A21CAF' },
{ token: 'rose', label: 'Vermelho', hex: '#BE123C' },
{ token: 'amber', label: 'Âmbar', hex: '#B45309' },
{ token: 'emerald', label: 'Verde', hex: '#047857' },
{ token: 'slate', label: 'Grafite', hex: '#475569' }];


/** (19) 98700-2201 */
export function formatPhone(digits: string) {
  const d = digits.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const weekdays = (hours: string | null, except: Record<string, string | null> = {}): WorkDay[] =>
['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => ({
  day,
  hours: day in except ? except[day] : day === 'Sáb' || day === 'Dom' ? null : hours
}));

/**
 * Equipe de exemplo no formato ANTIGO, convertida pela mesma migração usada em dados legados (nada se perde:
 * jornada e almoço continuam iguais; desde 16/10/2026 a equipe de exemplo começa "sem intervalo" entre atendimentos). Depois disso ganha exceções de exemplo, todas futuras e
 * sem atendimento marcado, para demonstrar férias, horário reduzido e abertura extraordinária.
 * L24b (18/11/2026, decisão do DS5): Rafael passou de #D97706 para #B45309 (Âmbar da paleta), porque as iniciais brancas
 * no círculo não liam no tom mais claro. É a única mudança de amostra do L24b.
 */
const legacySeed = [
// G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): "Pilates em grupo" (Quem faz: Juliana e Rafael, data/servicesSeed.ts)
// já nasce na lista de serviços deles; antes só entrava depois de salvar o serviço (correção 3 do G1).
{ id: 'carolina', name: 'Dra. Carolina', color: '#0E7490', services: ['Limpeza de pele', 'Peeling químico', 'Toxina botulínica'], schedule: weekdays('08:00 – 18:00'), lunch: '12:00 às 13:00', gap: 'sem intervalo' },
{ id: 'juliana', name: 'Juliana', color: '#7C3AED', services: ['Limpeza de pele', 'Drenagem linfática', 'Peeling químico', 'Pilates em grupo'], schedule: weekdays('08:00 – 17:00'), lunch: '12:00 às 13:00', gap: 'sem intervalo' },
{ id: 'rafael', name: 'Rafael', color: '#B45309', services: ['Peeling químico', 'Drenagem linfática', 'Pilates em grupo'], schedule: weekdays('10:00 – 18:00', { Seg: null }), lunch: '13:00 às 14:00', gap: 'sem intervalo' }];


const demoOverrides: Record<string, ProfessionalSchedule['overrides']> = {
  carolina: [{ id: 'ov-carol-0910', from: '2026-10-09', to: '2026-10-09', kind: 'hours', ranges: [{ start: '08:00', end: '12:00' }], reason: 'Congresso à tarde' }],
  juliana: [{ id: 'ov-ju-1010', from: '2026-10-10', to: '2026-10-10', kind: 'hours', ranges: [{ start: '08:00', end: '12:00' }], reason: 'Sábado de mutirão' }],
  rafael: [{ id: 'ov-rafa-ferias', from: '2026-10-19', to: '2026-10-23', kind: 'off', ranges: [], reason: 'Férias' }]
};

/** Dados de exemplo: só a Dra. Carolina tem telefone no conjunto oficial de exemplo; os outros ficam sem, de propósito. */
const demoProfiles: Record<string, Partial<ProfessionalProfile>> = {
  carolina: { role: 'Médica', specialties: ['Dermatologia estética', 'Injetáveis'], phone: '19987002201' },
  juliana: { role: 'Esteticista', specialties: ['Estética facial', 'Drenagem'] },
  rafael: { role: 'Esteticista', specialties: ['Estética corporal'] }
};

export const teamMembers: TeamMember[] = legacySeed.map(({ schedule, lunch, gap, ...m }) => {
  const migrated = migrateLegacySchedule({ schedule, lunch, gap });
  return { ...m, ...migrated, overrides: demoOverrides[m.id] ?? [], profile: { ...blankProfile(), ...demoProfiles[m.id] }, active: true };
});

export type BusinessDay = ClinicHoursDay;

/** Horário semanal da clínica. É o valor INICIAL: a configuração viva fica em data/availability.ts (useTeam). */
export const businessHours: BusinessDay[] = [
{ day: 'Segunda-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Terça-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Quarta-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Quinta-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Sexta-feira', open: true, from: '08:00', to: '18:00' },
{ day: 'Sábado', open: false, from: '08:00', to: '12:00' },
{ day: 'Domingo', open: false, from: '08:00', to: '12:00' }];


/** Formato antigo (texto solto). Mantido só por compatibilidade; a regra de agenda lê `clinicBlocksSeed`. */
export const businessBlocks = [
{ id: 'b1', date: '12/10', label: 'Feriado · fechado' },
{ id: 'b2', date: '24/12', label: 'Expediente até 13:00' }];


/**
 * Data especial da CLÍNICA inteira (feriado, recesso, expediente reduzido ou abertura extraordinária).
 * `date` é ISO. No backend real equivale a uma exceção de clínica (`professional_id` nulo). Protótipo: não persiste.
 */
export type ClinicBlock = ClinicException;

export const clinicBlocksSeed: ClinicBlock[] = [
{ id: 'b0', date: '2026-10-10', kind: 'open', from: '08:00', to: '12:00', reason: 'Sábado de mutirão' },
{ id: 'b1', date: '2026-10-12', kind: 'closed', reason: 'Feriado' },
{ id: 'b2', date: '2026-12-24', kind: 'reduced', until: '13:00', reason: '' }];


/** Texto de uma data especial para listas e avisos. */
export const clinicBlockLabel = clinicExceptionLabel;