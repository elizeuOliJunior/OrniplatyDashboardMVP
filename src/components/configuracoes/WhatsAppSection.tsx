import { currentWords } from '../../data/empresa';
import React, { useState } from 'react';
import { Card, CardTitle, InfoTip, StatusBadge } from '../Card';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../Table';
import { AppModal } from '../ui/AppModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { WhatsAppBadge } from '../ui/WhatsAppIcon';
import { ConectarWhatsAppModal } from '../modals/ConectarWhatsAppModal';
import { messageTemplates, whatsappConnection } from '../../data/configuracoes';
import { useBusinessName } from '../../data/empresa';
import { checkWhatsAppNow, disconnectWhatsApp, dm, setTemplateStatus, useSettings, waKey, waView } from '../../data/settingsStore';
import type { TemplateStatus } from '../../data/settingsStore';
import { NoticeActionButton } from './SettingsParts';

const templateBadge: Record<TemplateStatus, {tone: 'success' | 'warning' | 'error' | 'neutral';label: string;}> = {
  liberada: { tone: 'success', label: 'Liberada' },
  'em-analise': { tone: 'warning', label: 'Em análise' },
  recusada: { tone: 'error', label: 'Recusada' },
  'nao-enviada': { tone: 'neutral', label: 'Não enviada' }
};

const AUTH_TIP =
'Por segurança, a ligação do WhatsApp com a Orniplaty precisa ser renovada de tempos em tempos. Avisamos por e-mail 14, 7 e 2 dias antes de vencer.';

type TemplateId = (typeof messageTemplates)[number]['id'];

/** G4 (F-063): motivo de recusa do exemplo (texto do retorno do WhatsApp), no lugar do antigo "[motivo informado pelo WhatsApp]". */
const TEMPLATE_REJECTION_REASON = 'O texto foi considerado promocional para a categoria Utilidade. Mensagens de lembrete não podem trazer ofertas.';

function TemplateActions({ id, status, onReason }: {id: TemplateId;status: TemplateStatus;onReason: () => void;}) {
  const toast = useToast();
  const resend = () => {
    setTemplateStatus(id, 'em-analise');
    toast({ title: 'Pedido de análise registrado', description: 'A mensagem aparece como “Em análise”. O WhatsApp costuma responder em minutos, às vezes em até 24 horas.' });
  };
  if (status === 'recusada')
  return (
    <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="neutral" onClick={onReason}>
          Ver motivo
        </Button>
        <Button size="sm" variant="neutral" onClick={resend}>
          Corrigir e enviar de novo
        </Button>
      </div>);

  if (status === 'nao-enviada')
  return (
    <Button size="sm" variant="neutral" onClick={resend}>
        Enviar para análise
      </Button>);

  if (status === 'em-analise') return <p className="text-xs text-text-muted">O WhatsApp está revisando. Costuma levar minutos, às vezes até 24 horas.</p>;
  return null;
}

export function WhatsAppSection() {
  const companyName = useBusinessName();
  const s = useSettings();
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const view = waView(s);
  const key = waKey(s);
  const connected = s.wa.status === 'connected';
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [modal, setModal] = useState<null | 'connect' | 'renew'>(null);
  const [reasonFor, setReasonFor] = useState<TemplateId | null>(null);

  const runAction = () => {
    if (key === 'nao-conferido') {
      checkWhatsAppNow();
      toast({ title: 'WhatsApp conferido', description: 'Está tudo funcionando.' });
      return;
    }
    setModal(key === 'vence-em-breve' || key === 'vencida' ? 'renew' : 'connect');
  };

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" padding="lg" aria-labelledby="wa-titulo">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <WhatsAppBadge connected={connected && key !== 'vencida' && key !== 'cancelada'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="wa-titulo" className="text-lg font-bold text-text-primary">
                WhatsApp {currentWords().of}
              </h2>
              <StatusBadge status={view.badge.tone} label={view.badge.label} />
            </div>
            {key !== 'nunca' &&
            <>
                <p className="mt-1 text-xl font-extrabold tabular-nums text-text-primary">{whatsappConnection.number}</p>
                <p className="text-sm font-semibold text-text-primary">{companyName}</p>
              </>
            }
            <p className="mt-1 text-sm text-text-secondary">É o número em que seus clientes falam com {currentWords().the}. A assistente responde por ele quando está ligada. O nome que o cliente vê no topo vem do seu perfil do WhatsApp Business.</p>
            {key === 'em-dia' &&
            <p className="mt-2 flex items-center gap-1 text-sm text-text-secondary">
                Autorização do Facebook válida até {dm(s.wa.expiresOn)}.
                <InfoTip label="a validade da autorização" content={AUTH_TIP} />
              </p>
            }
          </div>
        </div>

        {view.notice &&
        <div className="mt-5">
            <Alert
            compact
            variant={view.notice.tone}
            title={view.notice.title}
            actions={view.notice.action && <NoticeActionButton action={view.notice.action} onClick={runAction} />}>
            
              {view.notice.text}
              {(key === 'vence-em-breve' || key === 'vencida') &&
            <span className="ml-1 inline-flex align-middle">
                  <InfoTip label="a validade da autorização" content={AUTH_TIP} />
                </span>
            }
            </Alert>
          </div>
        }
      </Card>

      <Card as="section" padding="lg" aria-labelledby="mensagens-titulo">
        <CardTitle as="h2" id="mensagens-titulo">
          Mensagens que {currentWords().the} envia
        </CardTitle>
        <p className="mt-1 text-sm text-text-secondary">
          Para {currentWords().the} iniciar uma conversa, o WhatsApp precisa aprovar o texto antes. Aqui você vê se cada mensagem está liberada.
        </p>
        <div className="mt-4 hidden md:block">
          <Table containerClassName="relative bg-surface" hoverable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Mensagem</TableHead>
                <TableHead>Para quem</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messageTemplates.map((t) => {
                const st = s.templates[t.id];
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-semibold text-text-primary">{t.name}</TableCell>
                    <TableCell className="text-text-secondary">{t.usage}</TableCell>
                    <TableCell>
                      <StatusBadge status={templateBadge[st].tone} label={templateBadge[st].label} />
                    </TableCell>
                    <TableCell>
                      <TemplateActions id={t.id} status={st} onReason={() => setReasonFor(t.id)} />
                    </TableCell>
                  </TableRow>);

              })}
            </TableBody>
          </Table>
        </div>
        <ul className="mt-3 divide-y divide-border md:hidden">
          {messageTemplates.map((t) => {
            const st = s.templates[t.id];
            return (
              <li key={t.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{t.name}</p>
                    <p className="text-xs text-text-secondary">{t.usage}</p>
                  </div>
                  <StatusBadge status={templateBadge[st].tone} label={templateBadge[st].label} />
                </div>
                <TemplateActions id={t.id} status={st} onReason={() => setReasonFor(t.id)} />
              </li>);

          })}
        </ul>
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">As mensagens das campanhas aparecem junto de cada campanha.</p>
          {/* L10 (16/11/2026): abre Automações na seção "Chamar clientes de volta", onde ficam as campanhas. */}
          <Button size="md" variant="neutral" className="w-full sm:w-auto" onClick={() => navigate('/atendente-ia/automacoes?secao=chamar')}>
            Ver Automações
          </Button>
        </div>
      </Card>

      {connected &&
      <Card as="section" padding="lg" aria-labelledby="outras-acoes-titulo">
          <CardTitle as="h2" id="outras-acoes-titulo">
            Outras ações
          </CardTitle>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text-primary">Desconectar o WhatsApp</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                Use só se for trocar de número ou parar de usar a Orniplaty neste número. Para parar só as respostas automáticas, desligue a assistente em IA Orniplaty.
              </p>
            </div>
            <Button size="md" variant="dangerSoft" className="w-full sm:w-auto" onClick={() => setConfirmDisconnect(true)}>
              Desconectar WhatsApp
            </Button>
          </div>
        </Card>
      }

      <ConfirmDialog
        open={confirmDisconnect}
        danger
        title="Desconectar o WhatsApp?"
        description="A Orniplaty para de enviar e receber mensagens neste número: a assistente não responde e os lembretes não saem. Para voltar, será preciso conectar de novo pelo Facebook, com o celular do número por perto."
        cancelLabel="Manter conectado"
        cancelVariant="neutral"
        focusCancel
        confirmLabel="Desconectar"
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          disconnectWhatsApp();
          toast({ title: 'WhatsApp desconectado', description: 'A assistente parou de atender neste número.', tone: 'warning' });
        }} />
      

      <ConectarWhatsAppModal
        open={modal !== null}
        mode={modal ?? 'connect'}
        onClose={() => setModal(null)}
        onConnected={(expiresOn) =>
        toast({ title: modal === 'renew' ? `Autorização renovada · válida até ${dm(expiresOn)}` : `WhatsApp conectado · autorização válida até ${dm(expiresOn)}` })
        } />
      

      <AppModal
        open={reasonFor !== null}
        onClose={() => setReasonFor(null)}
        unsavedGuard={false}
        title="Por que o WhatsApp recusou esta mensagem"
        description={`O WhatsApp confere cada mensagem que ${currentWords().the} inicia antes de liberar o envio.`}
        footer={
        <>
            <Button variant="neutral" onClick={() => setReasonFor(null)} data-dismiss="">
              Fechar
            </Button>
            <Button
            onClick={() => {
              if (reasonFor) setTemplateStatus(reasonFor, 'em-analise');
              setReasonFor(null);
              toast({ title: 'Pedido de nova análise registrado', description: 'A mensagem aparece como “Em análise”. O WhatsApp costuma responder em minutos, às vezes em até 24 horas.' });
            }}>
            
              Corrigir e enviar de novo
            </Button>
          </>
        }>
        
        <Alert compact variant="error" title="Motivo informado pelo WhatsApp">
          {TEMPLATE_REJECTION_REASON}
        </Alert>
        <p className="mt-3 text-sm text-text-secondary">Ao pedir de novo, o texto ajustado volta para análise. Enquanto isso, essa mensagem não sai.</p>
      </AppModal>
    </div>);

}