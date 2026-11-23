import React, { useEffect, useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Input } from '../Input';
import { IconButton } from '../Card';
import { markPasswordChanged } from '../../data/accountStore';

/*
 * 20/10/2026: TrocarPlanoModal saiu (troca de plano é na página segura de pagamento) e MotivoRecusaModal saiu
 * ("Ver motivo" agora mora em WhatsAppSection, com AppModal + Alert error).
 */

function PasswordInput({ id, label, value, onChange, error, hint }: {id: string;label: string;value: string;onChange: (v: string) => void;error?: string;hint?: string;}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      {/* helperText do Input do design system: aparece sem erro e já vem ligado ao campo (o erro o substitui) */}
      <Input id={id} label={label} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} error={error} helperText={hint} autoComplete="new-password" />
      <IconButton size="sm" aria-label={show ? 'Esconder senha' : 'Mostrar senha'} onClick={() => setShow((s) => !s)} className="absolute right-2 top-[30px]" icon={show ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />} />
    </div>);

}

/**
 * Trocar senha (decisão 14 B de 20/10/2026): senha atual + nova + repetir. Depende de endpoint novo no backend.
 * Protótipo: a senha atual "confere" com 6 caracteres ou mais (regra só do protótipo, documentada no CLAUDE.md).
 */
export function AlterarSenhaModal({ open, onClose }: {open: boolean;onClose: () => void;}) {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ current: '', next: '', confirm: '' });
      setSubmitted(false);
    }
  }, [open]);

  const errors = {
    current: !form.current ? 'Informe a senha atual.' : form.current.length < 6 ? 'A senha atual não confere.' : undefined,
    next: form.next.length < 8 ? 'Use pelo menos 8 caracteres.' : undefined,
    confirm: form.confirm !== form.next ? 'As senhas não são iguais.' : undefined
  };

  const save = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    // G4 (F-064): fica registrado QUANDO a senha foi trocada (Conta mostra a data); a senha não é guardada.
    markPasswordChanged();
    toast({ title: 'Senha trocada', description: 'A data da troca aparece em Conta.' });
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="sm"
      title="Trocar senha"
      footer={
      <>
          <Button variant="neutral" onClick={onClose} data-dismiss="">
            Cancelar
          </Button>
          <Button onClick={save}>Salvar senha</Button>
        </>
      }>
      
      <div className="flex flex-col gap-4">
        <PasswordInput id="senha-atual" label="Senha atual" value={form.current} onChange={(v) => setForm((f) => ({ ...f, current: v }))} error={submitted ? errors.current : undefined} />
        {/* G4 (F-064): "Esqueci a senha atual" afirmava "Link enviado" sem enviar nada. Agora diz o caminho que existe. */}
        <p className="text-sm text-text-secondary">Esqueceu a senha atual? Fale com o suporte em Configurações › Ajuda.</p>
        <PasswordInput
          id="senha-nova"
          label="Nova senha"
          value={form.next}
          onChange={(v) => setForm((f) => ({ ...f, next: v }))}
          error={submitted ? errors.next : undefined}
          hint="Use pelo menos 8 caracteres." />
        
        <PasswordInput id="senha-repeticao" label="Repita a nova senha" value={form.confirm} onChange={(v) => setForm((f) => ({ ...f, confirm: v }))} error={submitted ? errors.confirm : undefined} />
      </div>
    </AppModal>);

}