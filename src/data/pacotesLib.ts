/**
 * Textos e formatação de pacotes — cópia do `agenda-plus-front/src/lib/pacotes.ts` e de
 * `src/lib/financeiro.ts` (branch main). Só apresentação: nenhuma regra de negócio mora aqui.
 * Status, saldo e valores vêm prontos da resposta da API (no protótipo, de `pacotesApi.ts`).
 *
 * DIVERGÊNCIA DELIBERADA DO REPO REAL: o `FORMAS` da main inclui `insurance` ("Convênio"). No protótipo convênio
 * é PAGADOR, não forma de pagamento (ver data/convenios.ts), então ele não é mais oferecido ao registrar dinheiro
 * recebido. Registros antigos com `insurance` ainda são exibidos (rótulo legado).
 */
import { TODAY_ISO } from './agendaStore';

export const STATUS_PACOTE = {
  active: 'Ativo',
  completed: 'Concluído',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  frozen: 'Congelado'
} as const;
export type StatusPacote = keyof typeof STATUS_PACOTE;

export const CONDICOES_PAGAMENTO = {
  cash: 'À vista',
  card_installments: 'Parcelado no cartão',
  clinic_installments: 'Parcelado sem cartão'
} as const;
export type CondicaoPagamento = keyof typeof CONDICOES_PAGAMENTO;

export const EXPLICACAO_CONDICAO: Record<CondicaoPagamento, string> = {
  cash: 'Um recebimento, na data da venda.',
  card_installments:
  'O cliente fica quitado: quem parcela é a operadora do cartão. O número de vezes fica registrado como informação, e não vira parcela a receber dele.',
  clinic_installments: 'Uma parcela a receber por vez, na data de cada vencimento. A soma delas é exatamente o valor do pacote.'
};

/** Formas em que o dinheiro realmente entra (selecionáveis). Convênio é pagador, não forma. */
export const FORMAS = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit: 'Cartão de crédito',
  debit: 'Cartão de débito',
  transfer: 'Transferência',
  other: 'Outro'
} as const;
export type FormaPagamento = keyof typeof FORMAS;

export const rotuloForma = (forma: string | null | undefined) => forma === 'insurance' ? 'Convênio (registro antigo)' : FORMAS[forma as FormaPagamento] ?? '—';
export const rotuloStatus = (status: string | null | undefined) => STATUS_PACOTE[status as StatusPacote] ?? '—';
export const rotuloCondicao = (plano: string | null | undefined) => CONDICOES_PAGAMENTO[plano as CondicaoPagamento] ?? '—';

export function formatarValor(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function sessoesDoPacote(p: {saldo: number;total_sessions: number;}) {
  return { contratadas: p.total_sessions, usadas: p.total_sessions - p.saldo, disponiveis: p.saldo };
}

/**
 * W5 (A4-11, 11/11/2026): sessões contadas de UM jeito em todo o Painel: "N de M restantes" (lista de Pacotes, ficha,
 * painel da conversa, detalhe do pacote). Antes: "2 disponíveis de 6" aqui e "4/6" (usadas) na lista.
 */
export function textoDisponiveis(p: {saldo: number;total_sessions: number;}): string {
  if (p.saldo <= 0) return `Nenhuma sessão restante de ${p.total_sessions}`;
  return `${p.saldo} de ${p.total_sessions} ${p.saldo === 1 ? 'restante' : 'restantes'}`;
}

/**
 * L8 (17/11/2026, só texto): data de validade que já passou (antes de hoje, relógio do protótipo) diz "venceu em", e não
 * "vence em". Hoje ou depois continua "vence em". Vale para todo lugar que usa este texto (tabela de Pacotes, detalhe do
 * pacote, ficha). Não muda o status do pacote nem nenhuma regra.
 */
export function textoValidade(p: {expires_at: string | null;}): string {
  if (!p.expires_at) return 'sem validade';
  return `${p.expires_at.slice(0, 10) < TODAY_ISO ? 'venceu em' : 'vence em'} ${dataBR(p.expires_at)}`;
}

export function textoPendencia(p: {parcelas_pendentes: number;parcelas_vencidas: number;proximo_vencimento: string | null;}): string | null {
  if (p.parcelas_pendentes <= 0) return null;
  const quando = p.proximo_vencimento ? ` (${dataBR(p.proximo_vencimento)})` : '';
  if (p.parcelas_vencidas > 0) return `${p.parcelas_vencidas} ${p.parcelas_vencidas === 1 ? 'parcela vencida' : 'parcelas vencidas'}${quando}`;
  return `${p.parcelas_pendentes} ${p.parcelas_pendentes === 1 ? 'parcela pendente' : 'parcelas pendentes'}${quando}`;
}

/** Mesmo cálculo de `gerarVencimentos` + `dividirEmParcelas` do front real (proposta editável, não regra). */
export function gerarParcelas(totalCents: number, quantidade: number, primeira: string) {
  const [ano, mes, dia] = primeira.slice(0, 10).split('-').map(Number);
  if (!ano || !mes || !dia || quantidade < 1) return [];
  const base = Math.floor(totalCents / quantidade);
  const resto = totalCents - base * quantidade;
  return Array.from({ length: quantidade }, (_, i) => {
    const totalMeses = mes - 1 + i;
    const anoAlvo = ano + Math.floor(totalMeses / 12);
    const mesAlvo = totalMeses % 12 + 1;
    const diaAlvo = Math.min(dia, new Date(anoAlvo, mesAlvo, 0).getDate());
    return {
      due_date: `${anoAlvo}-${String(mesAlvo).padStart(2, '0')}-${String(diaAlvo).padStart(2, '0')}`,
      amount_cents: i === 0 ? base + resto : base
    };
  });
}

export const TIPOS_DO_RAZAO = {
  grant: 'Sessões do pacote',
  consumption: 'Sessão usada',
  reversal: 'Sessão devolvida',
  adjustment: 'Ajuste de sessões'
} as const;
export const rotuloDoLancamento = (tipo: string) => TIPOS_DO_RAZAO[tipo as keyof typeof TIPOS_DO_RAZAO] ?? 'Lançamento';
export const quantidadeDoLancamento = (q: number) => q > 0 ? `+${q}` : `−${Math.abs(q)}`;

export const CAMPOS_DO_HISTORICO: Record<string, string> = {
  expires_at: 'Validade',
  notes: 'Observações',
  preferred_professional_id: 'Profissional preferido',
  cancelamento: 'Cancelamento',
  congelamento: 'Congelamento'
};
export const rotuloDoCampo = (campo: string) => CAMPOS_DO_HISTORICO[campo] ?? campo;
export function valorDoHistorico(campo: string, valor: string | null): string {
  if (valor === null || valor === '') return campo === 'expires_at' ? 'sem validade' : 'vazio';
  return campo === 'expires_at' ? dataBR(valor) : valor;
}

export const TEXTO_PREFERENCIA_NAO_E_EXECUTOR =
'É só uma sugestão para os próximos agendamentos: qualquer profissional pode atender e consumir sessões deste pacote.';
export const TEXTO_SALDO_EM_PACOTE_VENCIDO =
'Este pacote tem saldo, mas está vencido: a sessão não pode ser usada até que a validade seja estendida explicitamente.';
export const TEXTO_CONFIRMAR_CANCELAMENTO =
'O saldo restante deixa de poder ser usado. As sessões, os pagamentos e o histórico permanecem guardados, mas os valores deixam de aparecer nos totais do Financeiro e nenhum novo pagamento poderá ser registrado enquanto o pacote estiver cancelado.';
export const TEXTO_EDICAO_NAO_E_DINHEIRO = 'Valor e condição de pagamento se corrigem no lançamento financeiro, não aqui.';
export const TEXTO_SEM_PACOTE = 'Este cliente ainda não tem nenhum pacote.';
export const TEXTO_PENDENCIA_NAO_BLOQUEIA =
'Isto é um aviso: pendência financeira não impede agendar, atender nem usar as sessões do pacote.';