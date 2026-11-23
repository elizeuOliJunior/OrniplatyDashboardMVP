/**
 * FIXTURE IDENTIFICADA do G3 (seletor de telas › "Exemplo do G3: convênio e sinal"). Desligada por padrão.
 *
 * Existe só para conferir na tela o que a configuração de exemplo não permite (a Empresa de exemplo não atende convênio
 * e nenhum sinal foi recebido). Ligar NÃO é uma configuração válida da clínica: o estado anterior é guardado e volta ao
 * desligar. Nada aqui inventa recebimento para enfeitar Resultados: o sinal de exemplo só existe com a fixture ligada.
 *
 * Ligada:
 *  - Empresa: aceita convênio, lista "Unimed (exemplo)" e "Bradesco Saúde (exemplo)", serviços atendem convênio por padrão;
 *  - Limpeza de pele: "só particular" neste serviço (para ver o convênio desligado com o motivo);
 *  - Agenda: Mariana Teixeira, Toxina botulínica, 30/09 às 16:00 com a Dra. Carolina, sem fechamento;
 *  - Sinal RECEBIDO desse atendimento: R$ 200,00 no Pix em 25/09 (Recebimentos de setembro).
 * Desligada: tudo volta, menos o que já foi usado (atendimento fechado e sinal descontado ficam, como registro da sessão).
 */
import { useSyncExternalStore } from 'react';
import { empresaStore } from './empresa';
import type { EmpresaConfig } from './empresa';
import { getServices, saveService } from './servicesStore';
import type { ServiceItem } from './servicesStore';
import { getAgendaState, setAppointments } from './agendaLive';
import { endFor } from './agendaStore';
import { appliedDepositIds, getDeposits, setDepositFixtures } from './convenios';

export const G3_SAMPLE_APPT = 'amostra-g3-sinal';
const SAMPLE_INSURERS = ['Unimed (exemplo)', 'Bradesco Saúde (exemplo)'];

let on = false;
let saved: {empresa: Pick<EmpresaConfig, 'acceptsInsurance' | 'insurers' | 'payment'>;limpeza: ServiceItem | null;} | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useG3Sample = () => useSyncExternalStore(subscribe, () => on);

export function setG3Sample(next: boolean) {
  if (next === on) return;
  if (next) {
    const e = empresaStore.get();
    const limpeza = getServices().services.find((s) => s.id === 'limpeza') ?? null;
    saved = { empresa: { acceptsInsurance: e.acceptsInsurance, insurers: [...e.insurers], payment: { ...e.payment } }, limpeza };
    empresaStore.set({ ...e, acceptsInsurance: 'sim', insurers: SAMPLE_INSURERS, payment: { ...e.payment, insuranceDefault: 'todos' } });
    if (limpeza) saveService({ ...limpeza, payment: { ...limpeza.payment, insurance: 'particular' } });
    setAppointments((map) => ({
      ...map,
      '2026-09-30': [
      ...(map['2026-09-30'] ?? []).filter((a) => a.id !== G3_SAMPLE_APPT),
      {
        id: G3_SAMPLE_APPT,
        professionalId: 'carolina',
        start: '16:00',
        end: endFor('Toxina botulínica', '16:00'),
        clientName: 'Mariana Teixeira',
        service: 'Toxina botulínica',
        status: 'confirmed',
        createdIso: '2026-09-20',
        source: 'painel',
        createdActorType: 'user',
        note: 'Amostra do G3: sinal de R$ 200,00 recebido em 25/09.'
      }]

    }));
    setDepositFixtures([
    { id: 'sinal-amostra-g3', appointmentId: G3_SAMPLE_APPT, clientId: 'mariana-teixeira', clientName: 'Mariana Teixeira', service: 'Toxina botulínica', iso: '2026-09-25', cents: 20000, method: 'pix', by: 'Amostra', at: '25/09 10:00', fixture: true }]
    );
  } else if (saved) {
    const e = empresaStore.get();
    empresaStore.set({ ...e, ...saved.empresa });
    if (saved.limpeza) {
      const cur = getServices().services.find((s) => s.id === 'limpeza');
      if (cur) saveService({ ...cur, payment: { ...cur.payment, insurance: saved.limpeza.payment.insurance } });
    }
    const appt = (getAgendaState().appointments['2026-09-30'] ?? []).find((a) => a.id === G3_SAMPLE_APPT);
    if (appt && appt.status === 'confirmed') setAppointments((map) => ({ ...map, '2026-09-30': (map['2026-09-30'] ?? []).filter((a) => a.id !== G3_SAMPLE_APPT) }));
    const used = appliedDepositIds();
    setDepositFixtures(getDeposits().filter((d) => d.fixture && used.has(d.id)));
    saved = null;
  }
  on = next;
  listeners.forEach((l) => l());
}