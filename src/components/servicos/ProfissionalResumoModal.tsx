import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDaysIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { requestLeave } from '../../data/dirtyGuard';
import { Button } from '../Button';
import { ProfessionalSchedule } from './EquipeTab';
import { agendaLink } from '../../data/deepLinks';
import { TODAY_ISO } from '../../data/agendaStore';
import type { TeamMember } from '../../data/equipeFuncionamento';

/** Read-only view of a professional: services and week hours, the same blocks shown in Serviços e equipe. */
export function ProfissionalResumoModal({ member, onClose }: {member: TeamMember | null;onClose: () => void;}) {
  const navigate = useNavigate();
  // G2 (F-031): com alteração não salva na tela de baixo (ex.: observações em Conversas), passa pelo aviso.
  const go = (path: string) =>
  requestLeave(() => {
    onClose();
    navigate(path);
  });
  return (
    <AppModal
      open={!!member}
      onClose={onClose}
      title={member?.name ?? ''}
      description={member ? member.services.length ? member.services.join(', ') : 'Nenhum serviço ainda' : undefined}
      footer={
      member &&
      <>
            <Button variant="secondary" onClick={() => go('/servicos-equipe?aba=equipe')}>
              Abrir em Serviços e equipe
            </Button>
            <Button leftIcon={<CalendarDaysIcon className="h-4 w-4" />} onClick={() => member && go(agendaLink({ date: TODAY_ISO, professionalId: member.id }))}>
              Ver agenda
            </Button>
          </>

      }>
      
      {member && <ProfessionalSchedule member={member} />}
    </AppModal>);

}