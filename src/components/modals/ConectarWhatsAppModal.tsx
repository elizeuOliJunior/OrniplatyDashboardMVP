import { wordsNow } from '../../data/segment';
import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheckIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { Button } from '../Button';
import { NoticeInline } from '../ui/Notice';
import { WHATSAPP_GREEN, WhatsAppBadge, WhatsAppIcon } from '../ui/WhatsAppIcon';
import { whatsappConnection } from '../../data/configuracoes';
import { useBusinessName } from '../../data/empresa';
import { connectOrRenew, dm, whatsappStopped } from '../../data/settingsStore';

type ConectarWhatsAppModalProps = {
  open: boolean;
  onClose: () => void;
  /** Recebe a nova data de vencimento da autorização (já gravada em data/settingsStore.ts). */
  onConnected?: (expiresOn: string) => void;
  /** `renew` = refazer a autorização pelo Facebook (mesmo fluxo, outro título). */
  mode?: 'connect' | 'renew';
};

type Step = 'inicio' | 'conectando' | 'conectado';

/**
 * Conexão pelo Facebook (Embedded Signup no produto). No protótipo não há chamada real: ao concluir, a autorização
 * nova vai para a fonte única (connectOrRenew) e todas as telas passam a mostrar a mesma data.
 * W6 (11/11/2026, A5-17): diz quanto tempo leva; depois de reconectar um WhatsApp parado, diz que a assistente VOLTOU a
 * atender (antes: "continua", mesmo quando estava parada).
 */
export function ConectarWhatsAppModal({ open, onClose, onConnected, mode = 'connect' }: ConectarWhatsAppModalProps) {
  const companyName = useBusinessName();
  const [step, setStep] = useState<Step>('inicio');
  const [expiresOn, setExpiresOn] = useState('');
  const [wasStopped, setWasStopped] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    if (open) {
      setStep('inicio');
      setWasStopped(whatsappStopped());
    }
    return () => window.clearTimeout(timer.current);
  }, [open]);

  const connect = () => {
    setStep('conectando');
    timer.current = window.setTimeout(() => {
      const next = connectOrRenew();
      setExpiresOn(next);
      setStep('conectado');
      onConnected?.(next);
    }, 1400);
  };

  const renew = mode === 'renew';

  return (
    <AppModal
      open={open}
      onClose={onClose}
      unsavedGuard={false}
      hideCloseButton={step === 'conectando'}
      title={step === 'conectado' ? renew ? 'Autorização renovada' : 'WhatsApp conectado' : renew ? 'Renovar a autorização do Facebook' : `Conectar o WhatsApp ${wordsNow().of}`}
      description={
      step === 'conectado' ?
      wasStopped ?
      'A assistente voltou a receber e responder mensagens neste número.' :
      'A assistente continua recebendo e respondendo mensagens neste número.' :
      renew ?
      'Você entra de novo com o Facebook de quem administra a empresa. O número e as conversas não mudam. Leva cerca de 2 minutos.' :
      `Você entra com a conta do Facebook ${wordsNow().of} e escolhe o número que a assistente vai usar. Leva cerca de 2 minutos.`
      }
      footer={
      step === 'conectado' ?
      <Button onClick={onClose}>Concluir</Button> :

      <>
            <Button variant="neutral" onClick={onClose} disabled={step === 'conectando'} data-dismiss="">
              Agora não
            </Button>
            <Button onClick={connect} loading={step === 'conectando'}>
              {step === 'conectando' ? 'Conectando…' : 'Continuar com o Facebook'}
            </Button>
          </>

      }>
      
      {step === 'conectado' ?
      <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <WhatsAppBadge size={40} />
            <p className="text-sm font-bold text-text-primary">
              {companyName} · {whatsappConnection.number}
            </p>
          </div>
          <NoticeInline tone="success" role="status" title={renew ? 'Renovada agora' : 'Conectado agora'}>
            Autorização do Facebook válida até {expiresOn ? dm(expiresOn) : ''}.
          </NoticeInline>
        </div> :

      <ul className="flex flex-col gap-3">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0" style={{ color: WHATSAPP_GREEN }}>
              <WhatsAppIcon className="h-4 w-4" />
            </span>
            {/* R2 (06/11/2026, A-27): ao renovar, o número não muda. */}
            <p className="text-sm text-text-secondary">{renew ? `O número ${wordsNow().of} continua o mesmo.` : `Use o número oficial ${wordsNow().of}.`} As conversas continuam aparecendo para você em Conversas.</p>
          </li>
          <li className="flex items-start gap-3">
            <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-text-secondary">A conexão é feita pelo Facebook. A Orniplaty não vê a sua senha do Facebook.</p>
          </li>
          <li className="flex items-start gap-3">
            <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-text-secondary">Tenha o celular do número por perto: o WhatsApp pode pedir um código por SMS.</p>
          </li>
        </ul>
      }
    </AppModal>);

}