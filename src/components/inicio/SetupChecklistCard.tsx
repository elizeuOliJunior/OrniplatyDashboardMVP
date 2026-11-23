import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, InfoTip } from '../Card';
import { ReadinessList } from '../atendente-ia/ReadinessCard';
import type { ReadinessItem } from '../atendente-ia/ReadinessCard';

/** Um item do primeiro acesso: o clique é a ação que já existia para ele (abrir a tela, a etapa ou a confirmação). */
export type SetupItem = {id: string;label: string;detail?: string;note?: string;onOpen: () => void;};

type SetupChecklistCardProps = {
  title: string;
  /** UMA frase visível abaixo do título. */
  sentence?: React.ReactNode;
  /** O resto da explicação, no "i" ao lado do título. */
  info?: string;
  /** Barra de conclusão (opcional), entre a frase e a lista. */
  progress?: React.ReactNode;
  pending: SetupItem[];
  done: SetupItem[];
  id?: string;
};

/**
 * L15 (17/11/2026, etapa de facilidade de uso): cartão do que falta no primeiro acesso.
 * Regra do design system para itens prontos e pendentes (`rules/owner-config-screens.md`, v3.14): pendentes primeiro, cada
 * um em cartão com borda, `StatusIcon` âmbar, nome, o que falta numa linha e seta; prontos depois, em lista compacta com
 * divisória e `StatusIcon` verde. Usa a MESMA lista da IA Orniplaty (`ReadinessList`), para ter o mesmo visual.
 * Cada item guarda a ação que já tinha. (Antes, este arquivo era um cartão sem uso em nenhuma tela.)
 * L21 (17/11/2026, V5 §B10/T1: "7 de 10 itens prontos" ao lado de "Falta completar (5)" + "Já está pronto (9)"): esta lista
 * conta PASSOS para começar a atender (WhatsApp, ligar a assistente, os itens que a assistente precisa conhecer e as
 * etapas deixadas para depois), não os 10 itens da assistente. Os títulos dos grupos passam a dizer isso: "Passos que
 * faltam (N)" e "Passos prontos (N)". A barra acima continua contando os 10 itens da assistente (ver InicioPrimeiroAcesso).
 * Na IA Orniplaty os grupos continuam "Falta completar" / "Já está pronto" (lá a lista é só dos 10 itens).
 */
export const SETUP_PENDING_TITLE = (n: number) => `Passos que faltam (${n})`;
export const SETUP_DONE_TITLE = (n: number) => `Passos prontos (${n})`;

export function SetupChecklistCard({ title, sentence, info, progress, pending, done, id = 'primeiro-acesso-lista' }: SetupChecklistCardProps) {
  const all = [...pending, ...done];
  const toItem = (item: SetupItem, isDone: boolean): ReadinessItem => ({ id: item.id, label: item.label, done: isDone, to: item.id, detail: item.detail, note: item.note });
  const open = (key: string) => all.find((i) => i.id === key)?.onOpen();
  return (
    <Card as="section" padding="lg" aria-label={title}>
      <CardHeader>
        <CardTitle as="h2">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {title}
            {info && <InfoTip label="o que esta lista conta" ariaLabel="O que esta lista conta?" content={info} />}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sentence && <p className="text-sm text-text-secondary">{sentence}</p>}
        {progress && <div className="mt-3">{progress}</div>}
        <div className={sentence || progress ? 'mt-5' : ''}>
          <ReadinessList
            id={id}
            missing={pending.map((i) => toItem(i, false))}
            ready={done.map((i) => toItem(i, true))}
            onOpen={open}
            missingTitle={SETUP_PENDING_TITLE}
            readyTitle={SETUP_DONE_TITLE} />
          
        </div>
      </CardContent>
    </Card>);

}