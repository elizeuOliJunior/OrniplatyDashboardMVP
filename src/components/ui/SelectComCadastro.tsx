import React from 'react';
import { Select } from '../Select';
import type { SelectProps } from '../Select';
import { useToast } from './Toast';

/**
 * CONTRATO NOVO (seletor com cadastro, 23/11/2026; lote SC2a): a peça ÚNICA do Painel para um seletor de formulário de
 * criar/editar cuja lista é um cadastro (cliente, categoria, serviço, profissional, área de atuação…). É o `Select` do
 * design system com `leadingAction` (DS 6.2): a primeira linha da lista aberta é "Cadastrar ‹item›" (ícone + em
 * verde-azulado, separada das opções), igual ao "Cadastrar cliente" da Novo agendamento. Nenhum estilo próprio.
 *
 * Como usar: `<SelectComCadastro label="Serviço" createLabel="Cadastrar serviço" onCreate={(digitado) => abrir(digitado)} … />`.
 * - `createLabel` é o texto da linha (sem "+"). Padrão do Painel: "Cadastrar ‹item›"; exceção: "Nova categoria".
 * - `onCreate` recebe o texto digitado (só com `searchable`; sem ele chega `''`). Sem `onCreate`, a linha não aparece.
 * - Quem usa abre a janela de cadastro POR CIMA do formulário e, ao salvar, escolhe o item novo; ao cancelar, nada muda.
 * - Nome repetido: `sameName(lista, nome)` acha o que já existe (sem maiúscula e sem acento) e `useSameNameNotice()` dá o
 *   aviso (toast `info`). Quem usa escolhe o existente em vez de criar outro.
 */
export type SelectComCadastroProps = SelectProps & {
  createLabel: string;
  onCreate?: (typed: string) => void;
};

export function SelectComCadastro({ createLabel, onCreate, ...props }: SelectComCadastroProps) {
  return <Select {...props} leadingAction={onCreate ? { label: createLabel, onSelect: (typed: string) => onCreate((typed ?? '').trim()) } : undefined} />;
}

/** Mesma comparação da busca do `Select` (sem acento, sem maiúscula, sem espaços nas pontas). */
export const sameNameKey = (t: string) =>
t.
normalize('NFD').
replace(/[̀-ͯ]/g, '').
toLowerCase().
replace(/\s+/g, ' ').
trim();

/** O item da lista com o mesmo nome (ignorando maiúsculas e acentos), se houver. */
export function sameName<T extends {label: string;}>(list: T[], name: string): T | undefined {
  const k = sameNameKey(name);
  return k ? list.find((o) => sameNameKey(o.label) === k) : undefined;
}

/** Aviso de nome repetido: o item que já existia foi escolhido. */
export function useSameNameNotice() {
  const toast = useToast();
  return (name: string) => toast({ title: `“${name}” já está cadastrado`, description: 'Escolhemos o que já existia, em vez de criar outro igual.', tone: 'info' });
}