/**
 * Nome da assistente — fonte ÚNICA do Painel (P06).
 * Até a clínica escolher um nome, a assistente se apresenta como "Assistente inteligente da Orniplaty".
 * Nenhuma tela deve escrever um nome fixo (ex.: "Lia"). Em frases corridas use o substantivo "a assistente";
 * quando o nome precisar aparecer, use `assistantDisplayName` (sem artigo) ou `assistantSubject` (com artigo).
 */
export const DEFAULT_ASSISTANT_NAME = 'Assistente inteligente da Orniplaty';

export function assistantDisplayName(name?: string | null) {
  const n = (name ?? '').trim();
  return n || DEFAULT_ASSISTANT_NAME;
}

/** `true` enquanto a clínica ainda não escolheu um nome próprio. */
export function isDefaultAssistantName(name?: string | null) {
  return !(name ?? '').trim();
}

/**
 * Nome para usar como sujeito/objeto de uma frase, já com a concordância certa:
 * o nome padrão leva artigo ("a Assistente inteligente da Orniplaty"); um nome escolhido (ex.: "Marina") não leva.
 */
export function assistantSubject(name?: string | null, capitalize = false) {
  const n = (name ?? '').trim();
  if (n) return n;
  return capitalize ? `A ${DEFAULT_ASSISTANT_NAME}` : `a ${DEFAULT_ASSISTANT_NAME}`;
}