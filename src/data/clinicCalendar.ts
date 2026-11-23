/**
 * Informações EXTRAS das datas especiais da clínica (só no Painel, para não mexer em data/schedule.ts, que é
 * compartilhado com o Onboarding): abrangência (nacional, estadual, municipal, da clínica), "repetir todo ano" e
 * origem (importado × cadastrado à mão). A regra de agenda continua lendo só `ClinicException` (data/schedule.ts).
 *
 * Backend lido (origin/main API 3186399): feriado = schedule_exception kind=holiday, cadastrado à mão. NÃO existe
 * importação de feriados nacionais nem recorrência anual (o board deixa os automáticos fora do escopo).
 * CONTRATO NOVO: importação, abrangência e repetição anual.
 * W8 (12/11/2026): `getClinicDateMeta` (leitura fora de componente) para a regra de feriado das campanhas (data/sendHolidays.ts).
 */
import { useSyncExternalStore } from 'react';

export type HolidayScope = 'nacional' | 'estadual' | 'municipal' | 'clinica';
export type ClinicDateMeta = {scope: HolidayScope;yearly: boolean;imported: boolean;};

export const scopeLabel: Record<HolidayScope, string> = { nacional: 'Nacional', estadual: 'Estadual', municipal: 'Municipal', clinica: 'Próprio' };

let meta: Record<string, ClinicDateMeta> = {
  b1: { scope: 'nacional', yearly: true, imported: false }
};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useClinicDateMeta = () => useSyncExternalStore(subscribe, () => meta);
/** W8: leitura fora de componente (regra de feriado das campanhas). */
export const getClinicDateMeta = () => meta;
export function setClinicDateMeta(id: string, m: ClinicDateMeta | null) {
  const next = { ...meta };
  if (m) next[id] = m;else
  delete next[id];
  meta = next;
  listeners.forEach((l) => l());
}

/**
 * Feriados nacionais (lista de EXEMPLO do protótipo para 2026–2027; datas móveis calculadas pela Páscoa).
 * Na integração a lista deve vir de uma fonte oficial. Carnaval e Corpus Christi são ponto facultativo:
 * vêm desmarcados.
 */
export type NationalHoliday = {date: string;name: string;optional?: boolean;};
export const NATIONAL_HOLIDAYS: NationalHoliday[] = [
{ date: '2026-01-01', name: 'Confraternização Universal' },
{ date: '2026-02-17', name: 'Carnaval', optional: true },
{ date: '2026-04-03', name: 'Sexta-feira Santa' },
{ date: '2026-04-21', name: 'Tiradentes' },
{ date: '2026-05-01', name: 'Dia do Trabalho' },
{ date: '2026-06-04', name: 'Corpus Christi', optional: true },
{ date: '2026-09-07', name: 'Independência do Brasil' },
{ date: '2026-10-12', name: 'Nossa Senhora Aparecida' },
{ date: '2026-11-02', name: 'Finados' },
{ date: '2026-11-15', name: 'Proclamação da República' },
{ date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' },
{ date: '2026-12-25', name: 'Natal' },
{ date: '2027-01-01', name: 'Confraternização Universal' },
{ date: '2027-02-09', name: 'Carnaval', optional: true },
{ date: '2027-03-26', name: 'Sexta-feira Santa' },
{ date: '2027-04-21', name: 'Tiradentes' },
{ date: '2027-05-01', name: 'Dia do Trabalho' },
{ date: '2027-05-27', name: 'Corpus Christi', optional: true },
{ date: '2027-09-07', name: 'Independência do Brasil' },
{ date: '2027-10-12', name: 'Nossa Senhora Aparecida' },
{ date: '2027-11-02', name: 'Finados' },
{ date: '2027-11-15', name: 'Proclamação da República' },
{ date: '2027-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' },
{ date: '2027-12-25', name: 'Natal' }];


/** Sugestões de feriados locais só como EXEMPLO (Campinas/SP). A clínica confirma a data a cada ano. */
export const LOCAL_SUGGESTIONS: {scope: HolidayScope;name: string;hint: string;}[] = [
{ scope: 'estadual', name: 'Revolução Constitucionalista (SP)', hint: 'Exemplo: 9 de julho' },
{ scope: 'municipal', name: 'Aniversário de Campinas', hint: 'Exemplo: 14 de julho' },
{ scope: 'municipal', name: 'Padroeira de Campinas (Imaculada Conceição)', hint: 'Exemplo: 8 de dezembro' }];


/**
 * G3 (F-049/F-058, D5): leva a repetição anual do cadastro para o próprio registro e dá NOME PÚBLICO só a feriado
 * nacional: o nome oficial do calendário para aquela data (nunca o texto livre que a clínica digitou no motivo).
 */
export function withCalendarInfo<T extends {id: string;date: string;kind: string;yearly?: boolean;publicLabel?: string;}>(blocks: T[]): T[] {
  return blocks.map((b) => {
    const m = meta[b.id];
    const official = m?.scope === 'nacional' && b.kind === 'closed' ? NATIONAL_HOLIDAYS.find((h) => h.date === b.date)?.name : undefined;
    return { ...b, yearly: b.yearly ?? m?.yearly ?? undefined, publicLabel: b.publicLabel ?? official };
  });
}