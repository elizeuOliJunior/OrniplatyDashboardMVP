/**
 * W8 (12/11/2026): feriado, para a opção "Enviar também em feriados" das campanhas (data/sendWindows.ts).
 * Decisão do Christian (12/11, item A do plano): feriado é a data cadastrada em Serviços e equipe › Funcionamento ›
 * "Feriados e datas especiais" com o "Tipo de data" Nacional, Estadual ou Municipal (data/clinicCalendar.ts). Uma data
 * "Da clínica" (recesso, reforma, sábado de mutirão) NÃO segura a campanha. Vale a repetição anual (`exceptionOn`).
 * Não depende do que acontece na data (fechada, horário reduzido ou abertura): o que conta é o tipo.
 * BACKEND: a exceção de clínica (`kind=holiday`) não guarda abrangência nem repetição anual (contrato novo, já registrado).
 */
import { getTeam } from './availability';
import { getClinicDateMeta } from './clinicCalendar';
import { exceptionOn } from './schedule';

const HOLIDAY_SCOPES = ['nacional', 'estadual', 'municipal'];

/** A data é um feriado cadastrado pela clínica? */
export function isClinicHoliday(iso: string): boolean {
  const meta = getClinicDateMeta();
  return getTeam().blocks.some((b) => exceptionOn(b, iso) && HOLIDAY_SCOPES.includes(meta[b.id]?.scope ?? ''));
}