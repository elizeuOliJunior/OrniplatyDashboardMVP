import { minutesLeftLabel, sessionElapsedMs } from '../../data/agendaStore';
import React, { useEffect, useState } from 'react';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { Alert } from '../Alert';
import { Button, buttonClass } from '../Button';
import { Input } from '../Input';
import { ModalActions } from '../ui/ModalActions';
import { DEMO_VERIFICATION_CODE } from '../../data/configuracoes';
import { SUPPORT_WHATSAPP_URL, useSettings } from '../../data/settingsStore';
import { maskPhoneBR } from '../../utils/masks';

export type ContactKind = 'email' | 'phone';
type Step = 'novo' | 'atual' | 'destino';

/**
 * Backend (histórico): no máximo 3 pedidos de código por hora (tenant/owner_contact.py).
 * G4 (F-064): a janela de 1 hora agora anda de verdade (tempo decorrido da sessão, `sessionElapsedMs`): cada pedido vale
 * 60 minutos e a mensagem diz quanto falta para o próximo. Antes só zerava recarregando a página.
 * L22 (17/11/2026): o campo "Novo número (com DDD)" ganhou a máscara ao digitar (`utils/masks.ts`, a mesma de todo o
 * Painel). O número continua sendo gravado como texto formatado, como antes acontecia quando a pessoa digitava formatado.
 */
const MAX_REQUESTS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;
let requestTimes: number[] = [];

const copy = {
  email: { title: 'Trocar e-mail', field: 'Novo e-mail', sameError: 'Esse já é o e-mail atual.', finish: 'Trocar e-mail', done: 'E-mail trocado' },
  phone: { title: 'Trocar WhatsApp para avisos', field: 'Novo número (com DDD)', sameError: 'Esse já é o número atual.', finish: 'Trocar número', done: 'Número trocado' }
};

function validate(kind: ContactKind, value: string, current: string): string | undefined {
  if (kind === 'email') {
    if (!/^\S+@\S+\.\S+$/.test(value.trim())) return 'Informe um e-mail válido.';
    if (value.trim().toLowerCase() === current.trim().toLowerCase()) return copy.email.sameError;
    return undefined;
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return 'Informe o número com DDD.';
  if (digits === current.replace(/\D/g, '')) return copy.phone.sameError;
  return undefined;
}

/**
 * Troca de e-mail ou do WhatsApp para avisos em 3 passos, como no backend:
 * (1) novo contato → (2) código no e-mail ATUAL → (3) código no novo e-mail, ou SMS no novo número.
 * Códigos valem 10 minutos; no máximo 3 pedidos por hora. Só o dono pode trocar.
 * Protótipo: o código aceito está só no CLAUDE.md (nunca na tela).
 */
export function VerificarContatoModal({
  open,
  onClose,
  kind,
  current,
  currentEmail,
  onVerified







}: {open: boolean;onClose: () => void;kind: ContactKind;current: string;currentEmail: string;onVerified: (value: string) => void;}) {
  const toast = useToast();
  const { smsAvailable } = useSettings();
  const c = copy[kind];
  const [step, setStep] = useState<Step>('novo');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setStep('novo');
      setValue('');
      setCode('');
      setError(undefined);
    }
  }, [open]);

  const smsBlocked = kind === 'phone' && !smsAvailable;
  const target = kind === 'phone' ? maskPhoneBR(value) : value.trim();

  /** Pede um código. Devolve false (com a mensagem de erro) quando passou do limite. */
  const request = () => {
    const now = sessionElapsedMs();
    requestTimes = requestTimes.filter((t) => now - t < HOUR_MS);
    if (requestTimes.length >= MAX_REQUESTS_PER_HOUR) {
      setError(`Muitos pedidos de código. Tente de novo em ${minutesLeftLabel(requestTimes[0] + HOUR_MS - now)}.`);
      return false;
    }
    requestTimes.push(now);
    return true;
  };

  const next = () => {
    if (step === 'novo') {
      const err = validate(kind, value, current);
      setError(err);
      if (err || !request()) return;
      setCode('');
      setStep('atual');
      return;
    }
    if (code.length !== 6 || code !== DEMO_VERIFICATION_CODE) {
      setError(code.length !== 6 ? 'O código tem 6 dígitos.' : 'Código incorreto. Confira e tente de novo.');
      return;
    }
    if (step === 'atual') {
      if (!request()) return;
      setCode('');
      setError(undefined);
      setStep('destino');
      return;
    }
    onVerified(value.trim());
    toast({ title: c.done });
    onClose();
  };

  const resend = () => {
    setCode('');
    setError(undefined);
    if (request()) toast({ title: 'Enviamos um novo código.', tone: 'info' });
  };

  const description =
  step === 'novo' ?
  'Para sua segurança, vamos pedir dois códigos: um no seu e-mail atual e outro no novo contato.' :
  step === 'atual' ?
  `Enviamos um código para o seu e-mail atual (${currentEmail}). Digite para confirmar que é você.` :
  kind === 'email' ?
  `Agora digite o código que enviamos para o novo e-mail (${target}).` :
  `Enviamos um SMS para ${target}. Digite o código para terminar.`;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="sm"
      title={c.title}
      description={smsBlocked ? undefined : description}
      footer={
      smsBlocked ?
      <Button variant="neutral" onClick={onClose} data-dismiss="">
            Fechar
          </Button> :

      <ModalActions equal={2}>
            <Button variant="neutral" onClick={onClose} data-dismiss="">
              Cancelar
            </Button>
            <Button onClick={next}>{step === 'novo' ? 'Continuar' : step === 'atual' ? 'Confirmar' : c.finish}</Button>
          </ModalActions>

      }>
      
      {smsBlocked ?
      <Alert
        compact
        variant="info"
        title="No momento não dá para trocar o número por aqui"
        actions={
        <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className={buttonClass('primary', { size: 'md' })}>
              Falar com o suporte
            </a>
        }>
        
          Fale com a gente no WhatsApp do suporte.
        </Alert> :
      step === 'novo' ?
      <Input
        label={c.field}
        type={kind === 'email' ? 'email' : 'text'}
        inputMode={kind === 'phone' ? 'tel' : undefined}
        placeholder={kind === 'phone' ? 'Ex.: (19) 99999-9999' : undefined}
        value={value}
        error={error}
        onChange={(e) => {
          setValue(kind === 'phone' ? maskPhoneBR(e.target.value) : e.target.value);
          setError(undefined);
        }}
        helperText={`Atual: ${current}`} /> :


      <div className="flex flex-col gap-3">
          <Input
          label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          error={error}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError(undefined);
          }}
          helperText="O código vale 10 minutos." />
        
          <div>
            <Button variant="neutral" size="md" onClick={resend}>
              Reenviar código
            </Button>
          </div>
        </div>
      }
    </AppModal>);

}