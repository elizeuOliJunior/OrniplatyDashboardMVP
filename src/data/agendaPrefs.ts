/**
 * Preferências de VISUALIZAÇÃO da Agenda, por clínica (estado do protótipo; não persiste ao recarregar).
 * Separado da disponibilidade: esconder um dia nunca altera expediente, jornada, exceções nem agendamentos.
 *
 * hideNonWorkingDays (Configurações › Agenda › "Ocultar dias sem atendimento"), padrão DESLIGADO:
 * - Semana: esconde os dias em que a CLÍNICA está fechada (semana + feriado/fechamento; abertura extraordinária conta
 *   como dia aberto). Dias escondidos com agendamentos aparecem como contador no botão "Mostrar dias fechados".
 * - Dia: as setas pulam datas fechadas; o calendário de datas continua permitindo abrir QUALQUER data.
 * - Mês: a grade continua com 7 colunas em ordem; datas fechadas viram células neutras, sem conteúdo.
 * Integração futura: preferência da clínica no backend (não existe hoje — item B).
 */
import { useSyncExternalStore } from 'react';

/**
 * G2 (F-038): também guarda a VISUALIZAÇÃO (Dia/Semana/Mês) e quem foi DESMARCADO no filtro de profissionais, para
 * que sair e voltar à Agenda na mesma sessão mantenha as escolhas. Só memória da sessão do protótipo: recarregar volta
 * ao padrão; não há persistência no backend nem entre aparelhos. Guardar os DESMARCADOS (e não os marcados) faz um
 * profissional novo aparecer e um arquivado sair na hora (G1, F-003).
 * Um link direto com data/profissional/item (`#/agenda?data=…`) vale só para aquela visita e NÃO grava aqui.
 */
export type AgendaPrefs = {hideNonWorkingDays: boolean;view?: 'dia' | 'semana' | 'mes';hiddenProIds: string[];};

let prefs: AgendaPrefs = { hideNonWorkingDays: false, hiddenProIds: [] };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getAgendaPrefs = () => prefs;
export const useAgendaPrefs = () => useSyncExternalStore(subscribe, () => prefs);
export function setAgendaPrefs(next: Partial<AgendaPrefs>) {
  prefs = { ...prefs, ...next };
  listeners.forEach((l) => l());
}