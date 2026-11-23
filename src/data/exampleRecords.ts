/**
 * G4 · fechamento (27/10/2026): quais registros são EXEMPLO SUBSTITUÍVEL.
 *
 * Só os serviços e profissionais da amostra inicial (`data/servicesSeed.ts`, `data/equipeFuncionamento.ts`) nascem
 * marcados. Deixam de ser substituíveis quando alguém os edita, arquiva ou restaura na tela (viraram dado da empresa) ou
 * quando chegam na configuração do Onboarding. Registro criado na tela nunca é exemplo.
 *
 * A passagem do Onboarding (`data/receivedConfig.ts`) só arquiva automaticamente o que ainda é exemplo substituível;
 * serviços e profissionais configurados ficam como estão, com histórico, agendamentos e financeiro.
 */
export type ExampleKind = 'servico' | 'profissional';

const replaceable = new Set<string>();
const keyOf = (kind: ExampleKind, id: string) => `${kind}:${id}`;

/** Marca a amostra inicial (chamado uma vez por store, na criação). */
export function markExamples(kind: ExampleKind, ids: string[]) {
  ids.forEach((id) => replaceable.add(keyOf(kind, id)));
}

/** O registro passou a ser dado da empresa (edição, arquivamento, restauração ou configuração recebida). */
export function markConfigured(kind: ExampleKind, id: string) {
  replaceable.delete(keyOf(kind, id));
}

export const isReplaceableExample = (kind: ExampleKind, id: string) => replaceable.has(keyOf(kind, id));