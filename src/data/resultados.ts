export type RevenueSource = {
  id: string;
  label: string;
  value: number;
  note?: string;
};

export type AvoidedNoShow = {
  id: string;
  text: string;
  value: number;
};

export type WeeklyRevenuePoint = {
  week: string;
  setembro: number;
  agosto: number;
};

export const resultadosMonthOptions = [
{ value: '2026-10', label: 'Outubro de 2026', description: 'mês atual, parcial' },
{ value: '2026-09', label: 'Setembro de 2026' },
{ value: '2026-08', label: 'Agosto de 2026' },
{ value: '2026-07', label: 'Julho de 2026' }];


/** Only this month has sample data in the prototype. */
export const resultadosSampleMonth = '2026-09';

/** Recebimentos primeiro (P04). */
export const resultadosTabs = [
{ value: 'recebimentos', label: 'Recebimentos' },
{ value: 'gerado-ia', label: 'Gerado pela IA' }];


/*
 * D4 (aprovada): os indicadores abaixo NÃO são mais exibidos até existir metodologia validada de atribuição.
 * Os dados ficam aqui só como histórico do protótipo; nenhuma tela os lê. Candidatos a remoção na Etapa 8 (arquivos órfãos).
 */
export const aiRevenueHighlight = {
  value: 4320,
  month: 'setembro',
  variation: '+18% em relação a agosto',
  support: '27 agendamentos que a assistente trouxe ou recuperou'
};

export const revenueSources: RevenueSource[] = [
{ id: 'novos', label: 'Novos agendamentos pela IA', value: 1890 },
{ id: 'fora-horario', label: 'Fora do horário comercial', value: 720 },
{ id: 'lista-espera', label: 'Vagas preenchidas pela lista de espera', value: 600 },
{ id: 'reativados', label: 'Clientes reativados', value: 540 },
{ id: 'retornos', label: 'Retornos no tempo certo', value: 330 },
{ id: 'retomadas', label: 'Retomadas', value: 240 },
{ id: 'renovacoes', label: 'Renovações de pacote', value: 0, note: 'Em liberação' }];


export const avoidedNoShows: AvoidedNoShow[] = [
{ id: 'confirmacoes', text: '11 confirmações que evitaram falta', value: 1650 },
{ id: 'vagas', text: '3 vagas reaproveitadas', value: 480 }];


export const weeklyRevenue: WeeklyRevenuePoint[] = [
{ week: 'Sem 1', setembro: 820, agosto: 760 },
{ week: 'Sem 2', setembro: 1050, agosto: 880 },
{ week: 'Sem 3', setembro: 1130, agosto: 950 },
{ week: 'Sem 4', setembro: 1320, agosto: 1070 }];