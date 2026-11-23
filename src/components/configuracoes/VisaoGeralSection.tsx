import React from 'react';
import { Card, CardTitle, CardDescription, StatusIcon } from '../Card';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { accountSummary, assistantView, messagesView, subView, usageView, useSettings, waView } from '../../data/settingsStore';
import type { SettingsSectionId, View } from '../../data/settingsStore';
import { LinkRow, StateRow } from './SettingsParts';
import { useBusinessWords } from '../../data/empresa';
import type { BusinessWords } from '../../data/segment';

const shortcutsOf = (w: BusinessWords) => [
{ label: `Dados ${w.of} e endereço`, hint: 'IA Orniplaty › Empresa', to: '/atendente-ia/empresa' },
{ label: 'Horário de funcionamento e feriados', hint: 'Serviços e equipe › Funcionamento', to: '/servicos-equipe?aba=funcionamento' },
{ label: 'Serviços e preços', hint: 'Serviços e equipe › Serviços', to: '/servicos-equipe?aba=servicos' },
{ label: 'Equipe e horários de cada profissional', hint: 'Serviços e equipe › Equipe', to: '/servicos-equipe?aba=equipe' },
{ label: 'Mensagens automáticas e campanhas', hint: 'IA Orniplaty › Automações', to: '/atendente-ia/automacoes' },
{ label: 'Como a assistente atende', hint: 'IA Orniplaty › Como atender', to: '/atendente-ia/como-atender' }];


/** Linha da Visão geral que é a causa de cada parada da assistente. */
const CAUSE_ROW: Record<string, string> = { whatsapp: 'WhatsApp', limite: 'Uso da assistente', cartao: 'Uso da assistente' };

/** L11 (meta 8, DS v3.14 › lista de itens prontos e pendentes): `StatusIcon` de 20px — âmbar/vermelho nos pendentes, verde nos em dia. */
const rowIcon = (tone: string, pending: boolean) =>
<StatusIcon tone={pending ? tone === 'error' ? 'error' : 'warning' : tone === 'warning' || tone === 'error' ? 'warning' : tone === 'info' ? 'info' : 'success'} size={20} />;


/**
 * Visão geral: "Tudo certo" ou "N coisas precisam de você", com uma linha por assunto (mesma contagem do menu e do Início).
 * W6 (11/11/2026): linha "Mensagens do WhatsApp" (A5-05: mensagem recusada é pendência); com a assistente PARADA, a linha
 * "Assistente" sai, porque a causa já tem a sua linha, e a frase do topo diz qual linha resolver (A5-13).
 */
export function VisaoGeralSection({ onOpen }: {onOpen: (s: SettingsSectionId) => void;}) {
  const s = useSettings();
  const w = useBusinessWords();
  const navigate = useGuardedNavigate();
  // G4 (F-067): resumo único. "Tudo certo" só sem pendência E sem ponto de atenção (assistente desligada por você, uso
  // extra sendo cobrado, WhatsApp não conferido).
  const summary = accountSummary(s);
  const pending = summary.pending;
  const n = pending.length;
  const attention = summary.attention;
  const worst = pending[0]?.notice.tone;
  // G4 · fechamento: a frase segue o estado ATUAL da assistente (parada, desligada por você ou atendendo).
  const off = summary.assistant.key === 'desligada' || summary.assistant.key === 'desligada-tudo';
  const stopped = !summary.assistant.answering && !off;
  const cause = summary.assistant.reason ? CAUSE_ROW[summary.assistant.reason] : null;
  // R2 (06/11/2026, A-13): desligada por você, só pendência vermelha impede a assistente de voltar a atender.
  const resolveText = stopped ?
  `A assistente está parada. Resolva “${cause ?? 'a linha em vermelho'}” abaixo para ela voltar a atender.` :
  off ?
  worst === 'error' ?
  'Resolva abaixo antes de ligar a assistente de novo: sem isso, ela não volta a atender.' :
  'Resolva abaixo quando puder. Isso não impede ligar a assistente de novo.' :
  'Resolva abaixo para a assistente não parar.';
  const wa = waView(s);
  const msgs = messagesView(s);
  const sub = subView(s);
  const usage = usageView(s);
  const assistant = assistantView(s);
  // Lote E (E1/E2): linha "Assistente". Desligar de propósito não entra na contagem "precisa de você" (decisão do redator do
  // lote; o Christian pode trocar). As linhas que pedem ação vão primeiro, em cartões; as em dia depois, com divisória.
  const rows: {label: string;view: View;open: () => void;}[] = [
  { label: 'WhatsApp', view: wa, open: () => onOpen('whatsapp') },
  { label: 'Mensagens do WhatsApp', view: msgs, open: () => onOpen('whatsapp') },
  { label: 'Assinatura', view: sub, open: () => onOpen('plano') },
  { label: 'Uso da assistente', view: usage, open: () => onOpen('plano') },
  ...(stopped ? [] : [{ label: 'Assistente', view: assistant, open: () => navigate('/atendente-ia/empresa') }])];

  const needs = rows.filter((r) => r.view.pending);
  const fine = rows.filter((r) => !r.view.pending);

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" padding="lg" aria-labelledby="visao-geral-titulo">
        <div className="flex items-start gap-3">
          <StatusIcon tone={summary.allClear ? 'success' : n === 0 ? 'info' : worst === 'error' ? 'error' : worst === 'warning' ? 'warning' : 'info'} />
          <div className="min-w-0">
            <h2 id="visao-geral-titulo" className="text-lg font-bold text-text-primary">
              {summary.allClear ? 'Tudo certo' : n === 0 ? attention.length === 1 ? 'Nada pendente, 1 ponto de atenção' : `Nada pendente, ${attention.length} pontos de atenção` : n === 1 ? '1 coisa precisa de você' : `${n} coisas precisam de você`}
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              {summary.allClear ? 'O WhatsApp está conectado, as mensagens estão liberadas, a assinatura está em dia, o uso do mês está dentro do limite e a assistente está atendendo.' : n === 0 ? attention.join(' ') : resolveText}
            </p>
          </div>
        </div>
        {needs.length > 0 &&
        <section aria-labelledby="visao-precisa" className="mt-5">
            <h3 id="visao-precisa" className="text-sm font-bold text-text-primary">
              Precisa de você
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {needs.map((r) =>
            <li key={r.label}>
                  <StateRow card icon={rowIcon(r.view.badge.tone, true)} label={r.label} badge={r.view.badge} summary={r.view.summary} onClick={r.open} />
                </li>
            )}
            </ul>
          </section>
        }
        {fine.length > 0 &&
        <section aria-labelledby="visao-em-dia" className="mt-5">
            <h3 id="visao-em-dia" className="text-sm font-bold text-text-primary">
              Em dia
            </h3>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {fine.map((r) =>
            <li key={r.label}>
                  <StateRow icon={rowIcon(r.view.badge.tone, false)} label={r.label} badge={r.view.badge} summary={r.view.summary} onClick={r.open} />
                </li>
            )}
            </ul>
          </section>
        }
      </Card>

      <Card as="section" padding="lg" aria-labelledby="outros-ajustes-titulo">
        <CardTitle as="h2" id="outros-ajustes-titulo">
          Outros ajustes {w.of}
        </CardTitle>
        <CardDescription>Estes ficam em outras telas.</CardDescription>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {shortcutsOf(w).map((x) =>
          <li key={x.to}>
              <LinkRow label={x.label} hint={x.hint} onClick={() => navigate(x.to)} />
            </li>
          )}
        </ul>
      </Card>
    </div>);

}