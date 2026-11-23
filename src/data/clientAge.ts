import { clientById, updateClient, useClientsVersion } from './api/clientes';
import { TODAY_ISO } from './agendaStore';
import { GENEROS } from './fichaLib';

/*
 * T1 1c (04/11/2026, Christian): idade abaixo do nome no cabeçalho da conversa (como a referência Tend).
 * Fonte: `birth_date` do cadastro do cliente (existe no backend: `crm/models.py`, campo opcional e dado pessoal
 * protegido; conferido na main local de 22/10). Sem data de nascimento, a tela mostra só o telefone.
 * FIXTURE DA AMOSTRA: datas de nascimento dos clientes das conversas de exemplo (a Ana já tinha). O Diego fica SEM data,
 * para mostrar o caso sem idade. Gravado uma vez, ao carregar, pelo mesmo `updateClient` do cadastro.
 *
 * T1 1g (05/11/2026): a ficha resumida mostra "35 anos · Feminino" abaixo do nome. Sexo/gênero vem de `gender` do
 * cadastro (existe no backend: `crm/models.py`, opcional, enum `Gender` em `shared/enums.py`; conferido na main local de
 * 22/10). "Prefere não informar" e campo vazio NÃO aparecem na linha (não é informação útil numa linha curta).
 * FIXTURE: sexo/gênero dos clientes de exemplo; o Diego fica sem, para mostrar o caso vazio.
 */
const SAMPLE_BIRTH_DATES: Record<string, string> = {
  'bruno-costa': '1988-11-23',
  'carla-mendes': '1979-06-05',
  'fernanda-lima': '1996-02-14',
  'gabriela-rocha': '2001-08-30',
  'helena-duarte': '1984-12-02',
  'priscila-duarte': '1999-03-09'
};
const SAMPLE_GENDERS: Record<string, string> = {
  'ana-ribeiro': 'female',
  'bruno-costa': 'male',
  'carla-mendes': 'female',
  'fernanda-lima': 'female',
  'gabriela-rocha': 'female',
  'helena-duarte': 'female',
  'priscila-duarte': 'female'
};
type ClientPatch = Parameters<typeof updateClient>[1];
for (const [id, birth] of Object.entries(SAMPLE_BIRTH_DATES)) {
  const c = clientById(id);
  if (c && !c.birth_date) updateClient(id, { birth_date: birth });
}
for (const [id, gender] of Object.entries(SAMPLE_GENDERS)) {
  const c = clientById(id) as ({gender?: string | null;} & object) | undefined;
  if (c && !c.gender) updateClient(id, { gender } as unknown as ClientPatch);
}

/** Idade completa em `TODAY_ISO` (relógio do protótipo). `null` sem data ou com data inválida. */
export function ageOf(birth: string | null | undefined): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = TODAY_ISO.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || tm === bm && td < bd) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const ageText = (age: number | null) => age === null ? undefined : age === 1 ? '1 ano' : `${age} anos`;

/** "34 anos" · "1 ano" · undefined (sem data). Acompanha edições do cadastro. */
export function useClientAgeLabel(id: string): string | undefined {
  useClientsVersion();
  return ageText(ageOf(clientById(id)?.birth_date));
}

/** "35 anos · Feminino" com o que estiver preenchido; undefined quando não há nenhum dos dois. */
export function useClientIdentityLine(id: string): string | undefined {
  useClientsVersion();
  const c = clientById(id) as ({birth_date?: string | null;gender?: string | null;} & object) | undefined;
  const gender = c?.gender && c.gender !== 'not_informed' ? GENEROS.find((g) => g.value === c.gender)?.label : undefined;
  const parts = [ageText(ageOf(c?.birth_date)), gender].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}