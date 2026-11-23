/**
 * P1 (13/11/2026, etapa de facilidade de uso): todos os cartões de destaque do Início têm a MESMA estrutura:
 * rótulo em cima, número (`text-kpi`), UMA linha de apoio dizendo o que o número conta, e a ação no mesmo lugar.
 */
export type InicioHighlight = {
  id: string;
  /** Rótulo em cima do número (sempre presente). */
  label: string;
  value: string;
  /** Uma linha: o que o número conta. */
  support: string;
  path: string;
  /** Texto do botão (só visual; o cartão inteiro é o link). */
  actionLabel: string;
  accent?: boolean;
};

/** Rota da Agenda que já abre rolada até a Lista de espera (lida em pages/Agenda.tsx). */
export const AGENDA_WAITLIST_PATH = '/agenda?secao=lista-espera';

/**
 * W9b (12/11/2026, J-04, decisão G1): rota da Agenda que abre "Notificações da agenda" e rola até a lista (Falta resolver,
 * Falta avisar, Resolvidos hoje). Usada pelo aviso "Falta avisar" do Início e do sino (lida em pages/Agenda.tsx).
 */
export const AGENDA_NOTIFICATIONS_PATH = '/agenda?secao=notificacoes';

/*
 * G1 (23/10/2026, F-005): os destaques do Início NÃO têm número escrito à mão. `pages/Inicio.tsx` calcula:
 *  - Conversas = conversas "Aguardando você" (`handler === 'voce'`, data/conversasThreads.ts);
 *  - Oportunidades = "Precisa de você" (data/followUp.ts, via HighlightCard);
 *  - Lista de espera = pedidos em `agendaStore.waitlist` (data/agendaLive.ts);
 *  - Retornos = cartões de Oportunidades › Retorno em "Precisa de você".
 * D4: o destaque "A IA gerou R$ ..." saiu do Início até existir metodologia validada de atribuição.
 * P1: o que saiu das linhas de apoio já aparece na tela de destino (espera de cada conversa em Conversas; "Trouxe de
 * volta" no cartão Resolvidos de Oportunidades; vagas oferecidas em Agenda › Vagas liberadas; "Envios pausados" e
 * "Programados" em Oportunidades).
 */