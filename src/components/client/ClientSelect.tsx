import React from 'react';
import { Select } from '../Select';
import { clientIdOfRecordedName, clientPhone, useClientsVersion } from '../../data/api/clientes';

/**
 * L24c (19/11/2026, pedido 3a do Christian; DS 6.2, `Select searchable` + `leadingAction`): o campo ÚNICO para escolher um
 * cliente, em toda janela que escolhe cliente de uma lista (Novo agendamento, Lista de espera, Vender pacote). Filtra enquanto
 * digita (sem acento e sem maiúscula, pelo nome); cada opção mostra o WhatsApp do cadastro embaixo do nome; "Cadastrar
 * cliente" é a primeira linha da lista e recebe o que foi digitado (quem usa abre a janela Novo cliente com esse nome).
 * Sem `onCreate`, a linha "Cadastrar cliente" não aparece (ex.: Remarcar, Editar pedido). Só monta a peça do DS: nenhum
 * estilo próprio. O valor de cada opção continua o de antes em cada janela (nome na agenda e na lista de espera; id no pacote).
 */
export const CLIENT_FIELD_LABEL = 'Cliente';
export const CLIENT_FIELD_PLACEHOLDER = 'Digite o nome do cliente';
export const CLIENT_CREATE_LABEL = 'Cadastrar cliente';
export const CLIENT_NO_RESULTS = 'Nenhum cliente com esse nome';

type ClientOption = {value: string;label: string;};

export function ClientSelect({
  options,
  value,
  onChange,
  onCreate,
  required,
  disabled,
  error,
  helperText










}: {options: ClientOption[];value: string;onChange: (value: string) => void; /** Recebe o texto digitado; sem ele, não há "Cadastrar cliente". */onCreate?: (typed: string) => void;required?: boolean;disabled?: boolean;error?: string;helperText?: string;}) {
  // O telefone acompanha o cadastro (criar, editar).
  useClientsVersion();
  const withPhone = options.map((o) => {
    const phone = clientPhone(clientIdOfRecordedName(o.label) ?? '');
    return phone ? { ...o, description: phone } : o;
  });
  return (
    <Select
      label={CLIENT_FIELD_LABEL}
      placeholder={CLIENT_FIELD_PLACEHOLDER}
      searchable
      noResultsText={CLIENT_NO_RESULTS}
      required={required}
      disabled={disabled}
      options={withPhone}
      value={value || undefined}
      onChange={onChange}
      error={error}
      helperText={helperText}
      leadingAction={onCreate ? { label: CLIENT_CREATE_LABEL, onSelect: (typed: string) => onCreate(typed.trim()) } : undefined} />);


}