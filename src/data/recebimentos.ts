/** Sample data for the "Recebimentos" tab of Resultados (setembro de 2026). */
export const receiptKpis = [
{ id: 'faturamento', label: 'Faturamento realizado', value: 18450, format: 'currency' as const },
{ id: 'agendado', label: 'Valor agendado', value: 21300, format: 'currency' as const },
{ id: 'presenca', label: 'Taxa de presença', value: 92, format: 'percent' as const, decimals: 0 },
{ id: 'ticket', label: 'Ticket médio', value: 236, format: 'currency' as const }];


/** Amount received per working day in September (in R$). Sums to R$ 18.450,00. */
export const dailyReceipts: {day: string;value: number;}[] = [
{ day: '01/09', value: 720 },
{ day: '02/09', value: 910 },
{ day: '03/09', value: 640 },
{ day: '04/09', value: 1080 },
{ day: '05/09', value: 860 },
{ day: '08/09', value: 780 },
{ day: '09/09', value: 950 },
{ day: '10/09', value: 690 },
{ day: '11/09', value: 1240 },
{ day: '12/09', value: 830 },
{ day: '15/09', value: 760 },
{ day: '16/09', value: 1020 },
{ day: '17/09', value: 580 },
{ day: '18/09', value: 1150 },
{ day: '19/09', value: 900 },
{ day: '22/09', value: 670 },
{ day: '23/09', value: 980 },
{ day: '24/09', value: 740 },
{ day: '25/09', value: 1090 },
{ day: '26/09', value: 860 },
{ day: '29/09', value: 610 },
{ day: '30/09', value: 390 }];


export const topServices: {id: string;name: string;count: number;value: number;}[] = [
{ id: 'limpeza', name: 'Limpeza de pele', count: 35, value: 6300 },
{ id: 'toxina', name: 'Toxina botulínica', count: 6, value: 5400 },
{ id: 'drenagem', name: 'Drenagem linfática', count: 30, value: 4500 },
{ id: 'peeling', name: 'Peeling químico', count: 9, value: 2250 }];