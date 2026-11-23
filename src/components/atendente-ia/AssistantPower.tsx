import React, { useState } from 'react';
import { Card, ChoiceCards, Modal, StatusIcon } from '../Card';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { useToast } from '../ui/Toast';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { useReadiness } from './ReadinessCard';
import { accountSummary, assistantKey, turnAssistantOff, turnAssistantOn, usageView, useSettings } from '../../data/settingsStore';
import type { AiStopScope } from '../../data/settingsStore';
import { assistantStopNotice } from '../../data/assistantStopNotice';

/**
 * Liga/desliga da assistente (Lote E, E1, decisão D1 do Christian de 22/10/2026; DS v3.14 owner-config-screens):
 * cartão de estado + confirmação. Nenhum clique único liga ou desliga.
 * Estado em `data/settingsStore.ts` (`ai`), lido também por Configurações › Visão geral, Conversas, Automações e Início.
 * BACKEND: `tenant.ai_enabled` só silencia as respostas; parar também lembretes e campanhas ("tudo") NÃO existe.
 * I1 (11/11/2026, integração, item 16; regra do lote W4, A2-17 + A5-14): ao desligar, só vão para "Aguardando você" as
 * conversas dela em que o cliente está esperando resposta (e as novas). As outras ficam em "Com você". Os textos da janela
 * e do aviso diziam que TODAS as conversas em andamento iam para a fila.
 */
export function useAssistantPower() {
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const settings = useSettings();
  const readiness = useReadiness();
  const [askOff, setAskOff] = useState(false);
  const [askOn, setAskOn] = useState(false);
  const [scope, setScope] = useState<AiStopScope>('respostas');
  const wasAll = !settings.ai.enabled && settings.ai.stopScope === 'tudo';
  const onDone = React.useRef<(() => void) | null>(null);

  const openOff = () => {
    setScope('respostas');
    setAskOff(true);
  };
  const openOn = (done?: () => void) => {
    onDone.current = done ?? null;
    setAskOn(true);
  };
  const confirmOff = () => {
    turnAssistantOff(scope);
    setAskOff(false);
    toast({
      title: 'Assistente desligada',
      // I1 (item 16): só as conversas com mensagem do cliente sem resposta vão para "Aguardando você".
      description:
      scope === 'tudo' ?
      'Nenhuma resposta nem mensagem automática sai até você ligar de novo. As conversas dela em que o cliente espera resposta vão para Conversas › Aguardando você.' :
      'As conversas dela em que o cliente espera resposta, e as novas, vão para Conversas › Aguardando você. As outras ficam em “Com você”.',
      tone: 'warning'
    });
  };
  const confirmOn = () => {
    turnAssistantOn();
    setAskOn(false);
    onDone.current?.();
    onDone.current = null;
    toast({ title: 'Assistente ligada', tone: 'success' });
  };
  const { missing, total } = readiness;

  const modals =
  <>
      <Modal
      open={askOff}
      onClose={() => setAskOff(false)}
      size="sm"
      tone="danger"
      title="Desligar a assistente?"
      footer={
      <>
            <Button variant="secondary" onClick={() => setAskOff(false)}>
              Manter ligada
            </Button>
            <Button variant="danger" onClick={confirmOff}>
              Desligar
            </Button>
          </>
      }>
      
        <div className="flex flex-col gap-4">
          <ChoiceCards
          label="O que deve parar?"
          columns={1}
          value={scope}
          onChange={(v: string) => setScope(v as AiStopScope)}
          options={[
          {
            value: 'respostas',
            title: 'Só as respostas',
            badge: 'Sugerido',
            description: 'A assistente para de responder no WhatsApp. Lembretes de horário e campanhas continuam saindo.',
            example: 'a equipe vai atender pessoalmente hoje'
          },
          {
            value: 'tudo',
            title: 'Respostas e mensagens automáticas',
            description: 'Para também lembretes de horário, lista de espera e campanhas. Seus clientes não recebem nada automático até você ligar de novo.'
          }]
          } />
        
          {/* I1 (item 16, regra do W4): só as conversas com mensagem do cliente sem resposta vão para "Aguardando você". */}
          <p className="text-sm text-text-secondary">
            As conversas dela em que o cliente está esperando resposta, e as novas, vão para Conversas › Aguardando você. As outras ficam em “Com você”. Nada é apagado.
          </p>
        </div>
      </Modal>

      <Modal
      open={askOn}
      onClose={() => setAskOn(false)}
      size="sm"
      title="Ligar a assistente?"
      footer={
      missing.length > 0 ?
      <>
              <Button
          variant="secondary"
          onClick={() => {
            setAskOn(false);
            navigate(missing[0].to);
          }}>
          
                Completar antes
              </Button>
              <Button onClick={confirmOn}>Ligar mesmo assim</Button>
            </> :

      <>
              <Button variant="secondary" onClick={() => setAskOn(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmOn}>Ligar</Button>
            </>

      }>
      
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            {/* R3 (06/11/2026, Christian, A-12): as que foram para "Aguardando você" só porque ela estava desligada voltam para ela. */}
            Ela volta a responder seus clientes no WhatsApp{wasAll ? ' e as mensagens automáticas voltam a sair' : ''}, inclusive nas conversas que estavam com ela quando
            você desligou. Conversas que você assumiu continuam com a equipe até você devolver.
          </p>
          {missing.length > 0 &&
        <Alert variant="warning" compact title={`Ela ainda não sabe ${missing.length} de ${total} itens`}>
              {missing.map((m) => m.label).join(', ')}. Sobre esses assuntos, ela passa a pergunta para a sua equipe.
            </Alert>
        }
        </div>
      </Modal>
    </>;


  return { openOn, openOff, modals, key: assistantKey(settings) };
}

/** Cartão de estado no topo da IA Orniplaty (entre o cabeçalho e as abas). Substitui o Toggle do topo e o aviso de uso. */
export function AssistantStateCard({ onTurnOff, onTurnOn }: {onTurnOff: () => void;onTurnOn: () => void;}) {
  const settings = useSettings();
  const navigate = useGuardedNavigate();
  const key = assistantKey(settings);
  const usage = usageView(settings);

  const view = (() => {
    switch (key) {
      case 'ligada':
        return {
          tone: 'success' as const,
          title: 'A assistente está atendendo',
          // Uso perto do limite (ou uso extra) continua visível aqui, sem um segundo cartão.
          text: `Responde seus clientes no WhatsApp a qualquer hora.${usage.notice ? ` ${usage.notice.title}.` : ''}`,
          action:
          <Button size="md" variant="dangerSoft" className="w-full sm:w-auto" onClick={onTurnOff}>
              Desligar a assistente
            </Button>

        };
      case 'desligada':
        return {
          tone: 'warning' as const,
          title: 'A assistente está desligada',
          text: accountSummary(settings).assistant.text,
          action:
          <Button size="md" className="w-full sm:w-auto" onClick={onTurnOn}>
              Ligar a assistente
            </Button>

        };
      case 'desligada-tudo':
        return {
          tone: 'warning' as const,
          title: 'A assistente e as mensagens automáticas estão desligadas',
          text: accountSummary(settings).assistant.text,
          action:
          <Button size="md" className="w-full sm:w-auto" onClick={onTurnOn}>
              Ligar a assistente
            </Button>

        };
      case 'parada':{
          // G4 (F-067): motivo e caminho vêm do resumo único (WhatsApp sem funcionar, limite do mês ou cartão recusado).
          // L4 (16/11/2026): a mesma frase curta do Início, da Agenda, de Conversas e de Oportunidades
          // (`assistantStopNotice().short`); o texto inteiro fica em Configurações.
          const a = accountSummary(settings).assistant;
          return {
            tone: 'error' as const,
            title: a.title,
            text: assistantStopNotice(settings)?.short ?? a.text,
            action: a.action ?
            <Button size="md" className="w-full sm:w-auto" onClick={() => navigate(a.action!.to)}>
              {a.action.label}
            </Button> :
            null
          };
        }
    }
  })();

  return (
    <Card as="section" padding="lg" aria-labelledby="estado-assistente-titulo" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <StatusIcon tone={view.tone} />
        <div className="min-w-0 flex-1">
          <h2 id="estado-assistente-titulo" className="text-base font-bold text-text-primary">
            {view.title}
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">{view.text}</p>
        </div>
        <div className="shrink-0">{view.action}</div>
      </div>
    </Card>);

}