import React from 'react';
import { ProfissionalModal } from './ProfissionalModal';
import type { SaveInfo } from './ProfissionalModal';
import { saveMember } from '../../data/availability';
import { markConfigured } from '../../data/exampleRecords';
import { setProfessionalServices, useServices } from '../../data/servicesStore';
import type { TeamMember } from '../../data/equipeFuncionamento';
import { useToast } from '../ui/Toast';

/**
 * CONTRATO NOVO (janela com etapas, 23/11/2026; seletor com cadastro, 23/11/2026): a janela "Novo profissional" aberta
 * POR CIMA de outro formulário (ex.: aba "Quem faz" do serviço, seletor de profissional). É a mesma `ProfissionalModal`
 * da aba Equipe, em criação (com as etapas), e salva no mesmo store que a aba Equipe usa (`saveMember` +
 * `setProfessionalServices`), então o profissional novo aparece no Painel inteiro. `onCreated` devolve o profissional
 * para o formulário de baixo marcá-lo. Cancelar só fecha: o formulário de baixo continua como estava.
 * SC2a (23/11/2026): `initialServiceIds` = serviços que já nascem marcados na aba Serviços (ex.: o serviço da turma).
 */
export function NovoProfissionalHost({
  open,
  onClose,
  initialName,
  initialServiceIds,
  onCreated








}: {open: boolean;onClose: () => void; /** Texto digitado no seletor: entra como nome. */initialName?: string; /** CONTRATO NOVO (seletor com cadastro, 23/11/2026): serviços já marcados ao abrir. */initialServiceIds?: string[];onCreated: (member: TeamMember) => void;}) {
  const { services } = useServices();
  const toast = useToast();
  return (
    <ProfissionalModal
      open={open}
      onClose={onClose}
      editing={null}
      initialName={initialName}
      initialServiceIds={initialServiceIds}
      services={services}
      onSave={(member: TeamMember, serviceIds: string[], _info: SaveInfo) => {
        saveMember(member);
        markConfigured('profissional', member.id);
        setProfessionalServices(member.id, serviceIds).forEach((id) => markConfigured('servico', id));
        toast({ title: 'Profissional adicionado', description: `${member.name} já aparece na agenda.` });
        onCreated(member);
      }}
      onArchive={() => undefined} />);


}