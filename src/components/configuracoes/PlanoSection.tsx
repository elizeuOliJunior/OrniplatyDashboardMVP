import React, { useState } from 'react';
import { Card, CardTitle, InfoTip, StatusBadge } from '../Card';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { ProgressBar } from '../ProgressBar';
import { Toggle } from '../Toggle';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { EXTRA_CHARGE_TEXT, LIMIT_RULE_TEXT, dm, setExtraEnabled, subView, usageForecastText, usageKey, usageResetDm, usageView, useSettings } from '../../data/settingsStore';
import { NoticeActionButton } from './SettingsParts';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { useGuardedNavigate } from '../ui/UnsavedChanges';

const barTone = { normal: 'primary', perto: 'warning', 'limite-desligado': 'error', 'limite-ligado': 'primary', 'cartao-recusou': 'error', 'sem-limite': 'primary' } as const;

/** Primeira frase de um texto e o resto (para o "i"). */
const splitFirst = (t: string): [string, string] => {
  const m = t.match(/^(.+?[.!?])\s+(.+)$/);
  return m ? [m[1], m[2]] : [t, ''];
};

/**
 * Plano e pagamento (20/10/2026). Sem preço (decisão 5 A) e sem troca de plano dentro do app: tudo o que é
 * cobrança abre a página segura de pagamento (portal do provedor). Uso em % do limite (decisão 6 A).
 * "Continuar depois do limite" mora aqui (decisão 7 A).
 * G4 (F-064): "Gerenciar assinatura" abre uma janela que explica onde isso acontece e que a página segura ainda não está
 * disponível, com o caminho do suporte.
 * W6 (11/11/2026): previsão em data, nunca em "atendimentos" (A5-11); o que para no limite (G19, A5-10); uso extra
 * "cobrado conforme o seu contrato" no lugar de "preço a definir" (G25, A5-12 — pendência comercial).
 * L11 (meta 7): com o limite do mês atingido e o uso extra desligado, o cartão "Uso da assistente neste mês" vem antes
 * da Assinatura e a primeira coisa dele é "Continuar depois do limite", com uma frase do que ligar faz; a explicação
 * longa fica no "i". Nomes nesta tela: "limite do mês" (o limite) e "Continuar depois do limite" (o liga/desliga).
 */
export function PlanoSection() {
  const s = useSettings();
  const toast = useToast();
  const [confirmExtra, setConfirmExtra] = useState(false);
  const sub = subView(s);
  const usage = usageView(s);
  const uKey = usageKey(s);
  const [portalOpen, setPortalOpen] = useState(false);
  const navigate = useGuardedNavigate();
  const openPortal = () => setPortalOpen(true);
  const end = dm(s.usage.periodEnd);
  const reset = usageResetDm(s);
  const cardEnd = s.sub.card.replace(/^.*final\s*/, '');
  const forecast = usageForecastText(s);
  const limitReached = uKey === 'limite-desligado';
  const [noticeFirst, noticeRest] = splitFirst(usage.notice?.text ?? '');

  const extraToggle =
  <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Toggle
        checked={s.usage.extraEnabled}
        onCheckedChange={(on: boolean) => {
          if (on) setConfirmExtra(true);else
          {
            setExtraEnabled(false);
            toast({ title: '“Continuar depois do limite” desligado', description: `No limite, a assistente e as campanhas param e voltam em ${reset}.`, tone: 'info' });
          }
        }}
        labelPosition="left"
        label={<span className="text-sm font-semibold text-text-primary">Continuar depois do limite</span>}
        description={
        limitReached ?
        `Ligue para a assistente e as campanhas voltarem agora; o que passar do limite é ${EXTRA_CHARGE_TEXT}.` :
        `Ligado: a assistente e as campanhas continuam depois de 100%, e o que passar do limite é ${EXTRA_CHARGE_TEXT}.`
        } />
      
      </div>
      <InfoTip
      label="Continuar depois do limite"
      content={`Ligado: a assistente e as campanhas continuam depois de 100%, e o uso extra é ${EXTRA_CHARGE_TEXT}. Desligado: até ${reset}, ela para de responder (a sua equipe responde) e as campanhas param. Lembretes de horário e ofertas de vaga continuam saindo nos dois casos.`} />
    
    </div>;


  const assinaturaCard =
  <Card as="section" padding="lg" aria-labelledby="assinatura-titulo">
      <CardTitle as="h2" id="assinatura-titulo">
        Assinatura
      </CardTitle>
      {s.sub.state !== 'none' &&
    <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-xl font-extrabold text-text-primary">Plano {s.sub.plan}</p>
            <StatusBadge status={sub.badge.tone} label={sub.badge.label} />
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
            <dt className="text-text-secondary">{s.sub.state === 'canceled' ? 'Acesso até:' : s.sub.state === 'pending' ? 'Cobrança em aberto:' : 'Próxima cobrança:'}</dt>
            <dd className="font-semibold text-text-primary">{dm(s.sub.nextCharge)}</dd>
            <dt className="text-text-secondary">Cartão:</dt>
            <dd className="font-semibold text-text-primary">{s.sub.card}</dd>
          </dl>
        </>
    }
      {sub.notice &&
    <div className="mt-4">
          <Alert compact variant={sub.notice.tone} title={sub.notice.title} actions={sub.notice.action && <NoticeActionButton action={sub.notice.action} onClick={openPortal} />}>
            {sub.notice.text}
          </Alert>
        </div>
    }
      {s.sub.state !== 'none' &&
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="md" variant={s.sub.state === 'active' ? 'primary' : 'neutral'} className="w-full shrink-0 sm:w-auto" onClick={openPortal}>
            Gerenciar assinatura
          </Button>
          <p className="text-sm text-text-secondary">Troca de plano, cartão, faturas e cancelamento ficam na página segura de pagamento.</p>
        </div>
    }
    </Card>;


  const usoCard =
  <Card as="section" padding="lg" aria-labelledby="uso-titulo">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CardTitle as="h2" id="uso-titulo">
          Uso da assistente neste mês
        </CardTitle>
        <InfoTip
        label="como o uso é contado"
        content={`Cada conversa que a assistente atende conta para o limite do mês; conversas mais longas contam mais. A contagem recomeça em ${reset}. ${LIMIT_RULE_TEXT}`} />
      
        <span className="text-sm text-text-muted">
          {dm(s.usage.periodStart)} a {end}
        </span>
      </div>

      {/* L11 (meta 7): limite acabou e uso extra desligado = a primeira coisa do cartão é o que traz a assistente de volta. */}
      {limitReached && <div className="mt-4 border-b border-border pb-5">{extraToggle}</div>}

      {uKey === 'sem-limite' ?
    <p className="mt-3 text-sm text-text-secondary">Seu plano não tem limite de uso da assistente.</p> :

    <>
          <div className="mt-4">
            <ProgressBar
          value={Math.min(100, s.usage.percent)}
          tone={barTone[uKey]}
          size="md"
          label={`${Math.min(100, s.usage.percent)}% do limite deste mês`}
          ariaLabel={`${Math.min(100, s.usage.percent)}% do limite deste mês`} />
        
          </div>
          {forecast && <p className="mt-2 text-sm text-text-secondary">{forecast}</p>}
          {usage.notice &&
      <div className="mt-4">
              <Alert compact variant={usage.notice.tone} title={usage.notice.title} actions={usage.notice.action && <NoticeActionButton action={usage.notice.action} onClick={openPortal} />}>
                {limitReached && noticeRest ?
          // L11: uma frase; o resto do texto único (`stopLimitText`) no "i".
          <span className="inline-flex flex-wrap items-center gap-1.5">
                    {noticeFirst}
                    <InfoTip label="o que acontece no limite" content={noticeRest} />
                  </span> :

          usage.notice.text
          }
              </Alert>
            </div>
      }
          {!limitReached && <div className="mt-5 border-t border-border pt-5">{extraToggle}</div>}
          <p className="mt-4 text-sm text-text-secondary">Avisamos no seu WhatsApp de avisos quando o uso chegar perto do limite e quando o limite acabar.</p>
        </>
    }
    </Card>;


  return (
    <div className="flex flex-col gap-6">
      {limitReached ?
      <>
          {usoCard}
          {assinaturaCard}
        </> :

      <>
          {assinaturaCard}
          {usoCard}
        </>
      }

      <ConfirmDialog
        open={confirmExtra}
        title="Ligar “Continuar depois do limite”?"
        description={`Depois de 100%, a assistente e as campanhas continuam. O que passar do limite é ${EXTRA_CHARGE_TEXT}, no cartão final ${cardEnd}. Você pode desligar quando quiser.`}
        cancelLabel="Cancelar"
        cancelVariant="neutral"
        confirmLabel="Ligar"
        onClose={() => setConfirmExtra(false)}
        onConfirm={() => {
          setExtraEnabled(true);
          toast({ title: '“Continuar depois do limite” ligado', description: 'A assistente e as campanhas continuam depois do limite.' });
        }} />
      
      <AppModal
        open={portalOpen}
        onClose={() => setPortalOpen(false)}
        size="sm"
        unsavedGuard={false}
        title="Página segura de pagamento"
        footer={
        <ModalActions equal={2}>
            <Button variant="neutral" onClick={() => setPortalOpen(false)}>
              Fechar
            </Button>
            <Button
            onClick={() => {
              setPortalOpen(false);
              navigate('/configuracoes?secao=ajuda');
            }}>
            
              Abrir Ajuda
            </Button>
          </ModalActions>
        }>
        
        <p className="text-sm text-text-secondary">Troca de plano, cartão, faturas e cancelamento ficam na página segura do provedor de pagamento.</p>
        <p className="mt-3 text-sm font-semibold text-text-primary">Essa página ainda não está disponível. Para mudar algo na assinatura agora, fale com o suporte.</p>
      </AppModal>
    </div>);

}