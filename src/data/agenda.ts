export type AgendaProfessional = {
  id: string;
  name: string;
  color: string;
};

export type AgendaAppointment = {
  id: string;
  professionalId: string;
  start: string;
  end: string;
  clientName: string;
  service: string;
  fromWaitlist?: boolean;
};

/** W1 (11/11/2026, Christian, decisão 15): período do dia pedido. Manhã até 12h · Tarde das 12h às 18h · Noite depois das 18h. */
export type WaitlistPeriod = 'manha' | 'tarde' | 'noite';

/**
 * Pedido na lista de espera. W1 (11/11/2026, Christian, decisões 15 e 16): a preferência virou CAMPOS (contrato CT-09,
 * `preferred_days/periods`) e ganhou uma janela de datas. A preferência ORDENA quem recebe a oferta e nunca exclui ninguém.
 */
export type AgendaWaitlistEntry = {
  id: string;
  clientName: string;
  service: string;
  professional: string;
  /** Texto legível da preferência (derivado dos campos por `preferenceLabel`, data/waitlistPrefs.ts). */
  preference: string;
  /** Dias da semana pedidos (0 = domingo … 6 = sábado). Vazio = qualquer dia. */
  days?: number[];
  /** Períodos pedidos. Vazio = qualquer horário. */
  periods?: WaitlistPeriod[];
  /** "A partir de" (AAAA-MM-DD). Padrão: o dia do pedido. */
  fromIso?: string;
  /** "Até" (AAAA-MM-DD), opcional. */
  untilIso?: string;
  /** Observação livre, opcional. */
  note?: string;
  /**
   * W3 (11/11/2026, Christian, decisão do pedido vencido = B): dia em que o pedido VENCEU (o dia seguinte ao "Até").
   * Só existe nos pedidos que saíram da fila e estão em "Pedidos vencidos".
   */
  expiredOn?: string;
};

export type AgendaFreedSlot = {
  id: string;
  /** W1: dia da vaga (hoje ou qualquer data futura). */
  iso: string;
  time: string;
  end: string;
  professional: string;
  professionalId: string;
  detail: string;
  status: 'success' | 'warning' | 'neutral';
  statusLabel: string;
  /** Quem recebeu a oferta desta vaga */
  offeredTo?: string;
  /** W1: de onde veio a vaga. */
  source: 'cancelamento' | 'remarcacao';
  /** W1: cliente que cancelou ou remarcou. */
  sourceClient: string;
  /** What happened with this slot, oldest first */
  events: {time: string;text: string;}[];
};

/*
 * G1 (23/10/2026, F-003): a lista fixa `agendaProfessionals` saiu daqui. Colunas, filtro e nomes/cores da Agenda vêm da
 * equipe viva: `useAgendaProfessionals()` / `agendaProfessionalOf(id)` em data/availability.ts (arquivar ou criar
 * profissional muda a Agenda na hora). Este arquivo guarda só os tipos e a amostra de agendamentos/lista de espera.
 */

export const agendaAppointments: AgendaAppointment[] = [
{ id: 'c1', professionalId: 'carolina', start: '09:00', end: '10:00', clientName: 'Ana Ribeiro', service: 'Limpeza de pele' },
{ id: 'c2', professionalId: 'carolina', start: '14:00', end: '14:45', clientName: 'Fernanda Lima', service: 'Toxina botulínica' },
{ id: 'j1', professionalId: 'juliana', start: '08:00', end: '09:00', clientName: 'Carla Mendes', service: 'Limpeza de pele' },
{ id: 'j2', professionalId: 'juliana', start: '10:30', end: '11:20', clientName: 'Bruno Costa', service: 'Drenagem linfática', fromWaitlist: true },
{ id: 'r1', professionalId: 'rafael', start: '15:30', end: '16:10', clientName: 'Gabriela Rocha', service: 'Peeling químico' }];


export const agendaBlockedRange = { start: '12:00', end: '13:00', label: 'Bloqueado · almoço' };

/**
 * Pedidos do próprio cliente. Cada pedido combina com o que o profissional faz (serviço e profissional existem na equipe).
 * R1 (06/11/2026, Christian, D1): a Fernanda SAIU da lista (aceitou sexta, 2/10, às 09:30 pela conversa; falta a equipe confirmar).
 * W1 (11/11/2026, Christian, decisão 19 e resposta 5-A): o Bruno SAIU da fila (o pedido dele foi atendido pela vaga das 10:30
 * de hoje e está no histórico daquela vaga). Entraram a Helena e a Carla, que podem receber a vaga das 15:00 de hoje:
 *  - Helena pediu a semana que vem, de manhã (conversa de 30/09): pode receber a vaga de hoje, mas fora da preferência;
 *  - Carla pediu drenagem com a Juliana, à tarde: combina com a vaga das 15:00 e é a sugerida, mesmo sendo a 4ª da fila.
 * A Gabriela fica de fora da vaga das 15:00 (já tem horário às 15:30) e o Diego por ter pedido para não receber mensagens.
 * W3 (11/11/2026, Christian, pedido vencido): FIXTURE DA AMOSTRA — Mariana Teixeira pediu Limpeza de pele até 30/09. O
 * relógio do protótipo está parado em 01/10, então o pedido já venceu: data/agendaLive.ts o tira da fila ao abrir e ele
 * aparece em "Pedidos vencidos". A fila viva continua com 4 pedidos.
 * ESTA LISTA É VIVA: data/agendaLive.ts espelha aqui cada mudança da fila (a assistente da Agenda lê este mesmo array).
 */
export const agendaWaitlist: AgendaWaitlistEntry[] = [
{ id: 'w1', clientName: 'Gabriela Rocha', service: 'Limpeza de pele', professional: 'qualquer profissional', preference: 'qualquer dia · tarde · só em 02/10', days: [], periods: ['tarde'], fromIso: '2026-10-02', untilIso: '2026-10-02' },
{ id: 'w2', clientName: 'Diego Alves', service: 'Toxina botulínica', professional: 'Dra. Carolina', preference: 'qualquer dia · qualquer horário · até 04/10', days: [], periods: [], fromIso: '2026-10-01', untilIso: '2026-10-04' },
{ id: 'w5', clientName: 'Helena Duarte', service: 'Peeling químico', professional: 'qualquer profissional', preference: 'qualquer dia · manhã · de 05/10 a 09/10', days: [], periods: ['manha'], fromIso: '2026-10-05', untilIso: '2026-10-09' },
{ id: 'w6', clientName: 'Carla Mendes', service: 'Drenagem linfática', professional: 'Juliana', preference: 'qualquer dia · tarde · a partir de 01/10', days: [], periods: ['tarde'], fromIso: '2026-10-01' },
{ id: 'w7', clientName: 'Mariana Teixeira', service: 'Limpeza de pele', professional: 'qualquer profissional', preference: 'qualquer dia · qualquer horário · de 21/09 a 30/09', days: [], periods: [], fromIso: '2026-09-21', untilIso: '2026-09-30' }];