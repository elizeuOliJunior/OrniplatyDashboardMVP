/**
 * Textos e formatação da ficha — cópia de `agenda-plus-front/src/lib/ficha.ts` (branch main).
 * Só apresentação: os números vêm de `GET /api/clients/{id}/profile`.
 */

export const VAZIO = {
  campo: 'Não informado.',
  ultimoAtendimento: 'Nenhum atendimento realizado ainda.',
  proximoRetorno: 'Nenhum retorno definido.',
  proximoAgendamento: 'Nenhum agendamento futuro.',
  atendimentos: 'Nenhum atendimento registrado ainda.',
  procedimentos: 'Nenhum procedimento registrado ainda.',
  financeiro: 'Nenhuma informação financeira registrada.',
  conversas: 'Nenhuma conversa registrada.',
  origem: 'Origem não informada.'
} as const;

export const RETORNO_SEM_AGENDAMENTO = 'Ainda não agendado';

export const campo = (valor: string | null | undefined) => (valor ?? '').trim() || VAZIO.campo;

const reais = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export function resumoFinanceiro(d: {em_aberto_cents: number;pendencias_sem_valor: number;tem_registros: boolean;}) {
  if (!d.tem_registros) return VAZIO.financeiro;
  const semValor = d.pendencias_sem_valor === 1 ? '1 pendência sem valor informado' : `${d.pendencias_sem_valor} pendências sem valor informado`;
  if (d.em_aberto_cents > 0 && d.pendencias_sem_valor > 0) return `${reais(d.em_aberto_cents)} em aberto + ${semValor}.`;
  if (d.em_aberto_cents > 0) return `${reais(d.em_aberto_cents)} em aberto`;
  if (d.pendencias_sem_valor > 0) return 'Pendência financeira — valor não informado.';
  return 'Sem valores em aberto.';
}
export const temPendenciaFinanceira = (d: {em_aberto_cents: number;pendencias_sem_valor: number;}) => d.em_aberto_cents > 0 || d.pendencias_sem_valor > 0;

export function dataBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : null;
}
export const dataOuVazio = (iso: string | null | undefined) => dataBR(iso) ?? VAZIO.campo;
export function dataHoraBR(data: string | null | undefined, hora: string | null | undefined) {
  const d = dataBR(data);
  if (!d) return null;
  const hhmm = (hora ?? '').slice(0, 5);
  return hhmm ? `${d} às ${hhmm}` : d;
}

export const GENEROS = [
{ value: 'female', label: 'Feminino' },
{ value: 'male', label: 'Masculino' },
{ value: 'other', label: 'Outro' },
{ value: 'not_informed', label: 'Prefere não informar' }] as
const;
export const rotuloGenero = (v: string | null | undefined) => v ? GENEROS.find((g) => g.value === v)?.label ?? v : VAZIO.campo;

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const digits = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '');
  return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
};
/** WhatsApp, and the landline only when it is a different number. */
export function contatos(whatsapp: string | null | undefined, telefone: string | null | undefined) {
  const lista: {rotulo: string;valor: string;}[] = [];
  if (whatsapp) lista.push({ rotulo: 'WhatsApp', valor: whatsapp });
  if (telefone && digits(telefone) !== digits(whatsapp)) lista.push({ rotulo: 'Telefone', valor: telefone });
  return lista;
}

export const ESTADO_ATENDIMENTO: Record<string, string> = {
  completed: 'Compareceu',
  no_show: 'Faltou',
  cancelled: 'Cancelado',
  confirmed: 'Confirmado',
  scheduled: 'Agendado'
};