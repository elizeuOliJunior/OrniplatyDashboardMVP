import { useServices } from './servicesStore';
import { isActiveMember, useTeam } from './availability';
import { automacoesStore } from './automacoes';
import { useSavedStore } from './iaConfigStore';
import { useSegmentContent } from './empresa';
import { toneDemosFor } from './toneDemos';
import type { ToneDemoContext } from './toneDemos';

/**
 * G4 (F-062/F-073): contexto dos exemplos de tom pelo cadastro: 1º serviço ativo e quem faz (ou o exemplo do segmento quando
 * ainda não há) e a antecedência SALVA da confirmação (desligada = sem frase de lembrete). Nada é inventado: sem cadastro,
 * o exemplo do segmento.
 */
export function useToneDemoContext(): ToneDemoContext {
  const { services } = useServices();
  const team = useTeam();
  const auto = useSavedStore(automacoesStore);
  const content = useSegmentContent();
  const active = services.filter((s) => s.active);
  const svc = active[0];
  const members = team.members.filter(isActiveMember);
  const pro = svc ? members.find((m) => svc.professionalIds.includes(m.id)) ?? members[0] : members[0];
  return {
    service: svc?.name ?? content.exampleService,
    professional: pro?.name ?? content.teamExample.name,
    hoursBefore: auto.enabled.confirmacao ? auto.values.horas ?? 24 : null
  };
}

export const useToneDemos = () => toneDemosFor(useToneDemoContext());