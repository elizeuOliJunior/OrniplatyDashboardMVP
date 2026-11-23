import React from 'react';
import { ServicoModal } from './ServicoModal';
import { markConfigured } from '../../data/exampleRecords';
import { professionalLinkChanges, saveService, useServices } from '../../data/servicesStore';
import type { ServiceItem, ServiceKind } from '../../data/servicesStore';
import { useTeam } from '../../data/availability';
import { addServiceConflicts } from '../../data/serviceConflicts';
import { useToast } from '../ui/Toast';

/**
 * CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2a): a janela "Novo serviço" aberta POR CIMA de outro
 * formulário ("Cadastrar serviço" dos seletores de serviço). Mesmo molde do `NovoProfissionalHost`: é a mesma
 * `ServicoModal` da aba Serviços, em criação (com as etapas do SC1 e o tamanho único do SC1b), e salva no mesmo store
 * (`saveService`), então o serviço novo aparece no Painel inteiro. `initialName` = texto digitado no seletor;
 * `initialKind` = tipo já escolhido (ex.: "Turma" na janela da turma, "Avaliação" em "Qual avaliação"). `onCreated`
 * devolve o serviço para o formulário de baixo escolhê-lo. Cancelar só fecha.
 */
export function NovoServicoHost({
  open,
  onClose,
  initialName,
  initialKind,
  onCreated






}: {open: boolean;onClose: () => void;initialName?: string;initialKind?: ServiceKind;onCreated: (service: ServiceItem) => void;}) {
  const { services, categories } = useServices();
  const { members } = useTeam();
  const toast = useToast();
  return (
    <ServicoModal
      open={open}
      onClose={onClose}
      editing={null}
      categories={categories}
      services={services}
      members={members}
      hasHistory={() => false}
      initialKind={initialKind}
      initialName={initialName}
      onSave={(s, conflicts) => {
        const prosChanged = professionalLinkChanges(s);
        saveService(s);
        markConfigured('servico', s.id);
        prosChanged.forEach((id) => markConfigured('profissional', id));
        if (conflicts.length) addServiceConflicts(conflicts);
        toast({ title: 'Serviço adicionado', description: 'A agenda, os formulários e a assistente já usam o serviço.' });
        onCreated(s);
      }}
      onArchive={() => undefined} />);


}