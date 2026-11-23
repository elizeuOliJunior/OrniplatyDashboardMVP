/** Week view of the Agenda (28/09 a 02/10). Thursday 01/10 matches the day view. */
export type WeekAppointment = {
  id: string;
  time: string;
  clientName: string;
  service: string;
  professionalId: 'carolina' | 'juliana' | 'rafael';
  fromWaitlist?: boolean;
};

export type WeekDay = {
  id: string;
  label: string;
  date: string;
  isToday?: boolean;
  appointments: WeekAppointment[];
};

export const weekLabel = 'Semana de 28/09 a 02/10';

/**
 * Amostra coerente com a regra única: cada atendimento cabe na jornada e fora do almoço do profissional e respeita o
 * intervalo de 10 min entre atendimentos (O6). Ajustados na Etapa 5: ter 16:30 (passava das 17:00 da Juliana),
 * qua 13:30 (dentro do almoço do Rafael) e sex 11:30 (dentro do almoço da Juliana).
 */
export const weekDays: WeekDay[] = [
{
  id: 'seg',
  label: 'Seg',
  date: '28/09',
  appointments: [
  { id: 's1', time: '09:00', clientName: 'Bruno Costa', service: 'Drenagem linfática', professionalId: 'juliana' },
  { id: 's2', time: '10:00', clientName: 'Helena Duarte', service: 'Peeling químico', professionalId: 'carolina' },
  { id: 's3', time: '15:00', clientName: 'Igor Matos', service: 'Limpeza de pele', professionalId: 'juliana' }]

},
{
  id: 'ter',
  label: 'Ter',
  date: '29/09',
  appointments: [
  { id: 't1', time: '08:30', clientName: 'Juliana Prado', service: 'Limpeza de pele', professionalId: 'carolina' },
  { id: 't2', time: '11:00', clientName: 'Mariana Teixeira', service: 'Drenagem linfática', professionalId: 'rafael' },
  { id: 't3', time: '14:00', clientName: 'Lucas Ferreira', service: 'Toxina botulínica', professionalId: 'carolina' },
  { id: 't4', time: '15:30', clientName: 'Diego Alves', service: 'Drenagem linfática', professionalId: 'juliana' }]

},
{
  id: 'qua',
  label: 'Qua',
  date: '30/09',
  appointments: [
  { id: 'q1', time: '09:30', clientName: 'Fernanda Lima', service: 'Limpeza de pele', professionalId: 'juliana' },
  { id: 'q2', time: '14:30', clientName: 'Gabriela Rocha', service: 'Peeling químico', professionalId: 'rafael', fromWaitlist: true }]

},
{
  id: 'qui',
  label: 'Qui',
  date: '01/10',
  isToday: true,
  appointments: [
  { id: 'h1', time: '08:00', clientName: 'Carla Mendes', service: 'Limpeza de pele', professionalId: 'juliana' },
  { id: 'h2', time: '09:00', clientName: 'Ana Ribeiro', service: 'Limpeza de pele', professionalId: 'carolina' },
  { id: 'h3', time: '10:30', clientName: 'Bruno Costa', service: 'Drenagem linfática', professionalId: 'juliana', fromWaitlist: true },
  { id: 'h4', time: '14:00', clientName: 'Fernanda Lima', service: 'Toxina botulínica', professionalId: 'carolina' },
  { id: 'h5', time: '15:30', clientName: 'Gabriela Rocha', service: 'Peeling químico', professionalId: 'rafael' }]

},
{
  id: 'sex',
  label: 'Sex',
  date: '02/10',
  appointments: [
  { id: 'f1', time: '09:00', clientName: 'Ana Ribeiro', service: 'Limpeza de pele', professionalId: 'carolina' },
  { id: 'f2', time: '10:30', clientName: 'Helena Duarte', service: 'Drenagem linfática', professionalId: 'juliana' },
  { id: 'f3', time: '16:00', clientName: 'Igor Matos', service: 'Peeling químico', professionalId: 'rafael' }]

}];