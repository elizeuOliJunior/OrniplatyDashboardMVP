import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOutIcon } from 'lucide-react';
import { Card, CardTitle, InfoTip, Modal } from '../Card';
import { Logo } from '../Logo';
import { Input } from '../Input';
import { Button } from '../Button';
import { setAccountEmail, setAccountPhone, useAccountContacts, setAccountOwnerName } from '../../data/accountStore';
import { useToast } from '../ui/Toast';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { useDirtyForm } from '../../data/dirtyGuard';
import { AlterarSenhaModal } from './ConfigModals';
import { VerificarContatoModal } from './VerificarContatoModal';
import type { ContactKind } from './VerificarContatoModal';

/**
 * L24b (18/11/2026, pedido 5 do Christian): o dado fica numa caixa de leitura do MESMO tamanho e jeito da caixa "Nome do
 * responsável" (`Input` do DS, `readOnly`, largura `sm:max-w-md`), com o botão "Trocar…" na mesma linha, à direita.
 * Embaixo, uma frase; o resto no "i" (`InfoTip`). O DS 6.2 não tem um visual próprio de "só leitura": `disabled` fica
 * cinza e apagado (parece travado), então a caixa usa o visual normal do `Input` com `readOnly` (o mais próximo). O texto
 * não pode ser editado ali; quem troca é o botão.
 */
function DataRow({ label, value, sentence, more, action, onAction }: {label: string;value: string;sentence?: string;more?: string;action: string;onAction: () => void;}) {
  const noteId = useId();
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Input label={label} value={value} readOnly aria-describedby={sentence ? noteId : undefined} containerClassName="sm:max-w-md" />
        <Button size="md" variant="neutral" className="w-full shrink-0 sm:mb-1 sm:w-auto" onClick={onAction}>
          {action}
        </Button>
      </div>
      {sentence &&
      <p id={noteId} className="inline-flex flex-wrap items-center gap-x-1 text-sm text-text-secondary">
          <span>{sentence}</span>
          {more && <InfoTip label={label} content={more} />}
        </p>
      }
    </div>);

}

/**
 * Conta (20/10/2026): cada botão fica ao lado do dado que ele muda. Sem "Salvar" no rodapé.
 * W6 (11/11/2026, A5-15): diz que o dono também é avisado quando a assistente para sozinha (limite ou WhatsApp).
 * Por qual número sai o aviso quando o WhatsApp da clínica está fora é regra em aberto para o Elizeu (relatório W6).
 * L19 (17/11/2026, pedido do Christian): "Sair da conta" no fim de "Seus dados de acesso" → confirmação (`Modal` do DS)
 * → tela "Você saiu da sua conta" com "Entrar de novo". No produto, encerrar a sessão é do backend (lista do Elizeu).
 * L22b (17/11/2026, pedido do Christian): o botão "Sair da conta" usa `Button variant="dangerSoft"` (vermelho claro do DS 6.1).
 * L24b (18/11/2026, pedido 5): e-mail, WhatsApp e senha em caixas de leitura (ver `DataRow`).
 */
export function ContaSection() {
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const contacts = useAccountContacts();
  // G1 (F-014): nome do responsável salvo no store da conta (data/accountStore.ts), não numa variável do componente.
  const savedOwnerName = contacts.ownerName;
  const [name, setName] = useState(savedOwnerName);
  const [nameError, setNameError] = useState<string | undefined>();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [verify, setVerify] = useState<ContactKind | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const changed = name.trim() !== savedOwnerName;

  const saveName = () => {
    if (!name.trim()) {
      setNameError('Informe o nome do responsável.');
      return false;
    }
    setAccountOwnerName(name);
    setName(name.trim());
    toast({ title: 'Nome salvo' });
    return true;
  };
  useDirtyForm('settings-account-name', changed, { save: () => saveName(), discard: () => setName(savedOwnerName) });

  // L19: tela simples depois de sair, por cima de tudo (sem menu lateral e sem linha do topo).
  // Protótipo: não existe tela de entrar; "Entrar de novo" volta ao Início. Nada da amostra é apagado.
  if (signedOut && typeof document !== 'undefined') {
    return createPortal(
      <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background px-6 text-center" aria-labelledby="saiu-titulo">
        <Logo variant="full" height={32} />
        <h1 id="saiu-titulo" className="text-xl font-extrabold text-text-primary">
          Você saiu da sua conta
        </h1>
        <Button onClick={() => navigate('/inicio')}>Entrar de novo</Button>
      </main>,
      document.body
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" padding="lg" aria-labelledby="dados-acesso-titulo">
        <CardTitle as="h2" id="dados-acesso-titulo">
          Seus dados de acesso
        </CardTitle>
        <div className="mt-4 flex flex-col gap-5">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-start">
            
            <Input
              label="Nome do responsável"
              value={name}
              error={nameError}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(undefined);
              }}
              containerClassName="sm:max-w-md" />
            
            {changed &&
            <Button type="submit" size="md" className="w-full sm:mt-[30px] sm:w-auto">
                Salvar
              </Button>
            }
          </form>
          <DataRow
            label="E-mail de acesso"
            value={contacts.email}
            sentence="É com ele que você entra no painel."
            more="Os avisos sobre a conexão do WhatsApp também chegam aqui, inclusive quando ele desconecta."
            action="Trocar e-mail"
            onAction={() => setVerify('email')} />
          
          <DataRow
            label="WhatsApp para avisos"
            value={contacts.alertsPhone}
            sentence="A assistente chama você aqui quando precisa de alguém."
            more="Também avisamos aqui quando o uso do mês chega perto do limite e quando a assistente para sozinha (o limite do mês acabou ou o WhatsApp desconectou)."
            action="Trocar número"
            onAction={() => setVerify('phone')} />
          
          <DataRow
            label="Senha"
            value="••••••••"
            sentence={contacts.passwordChangedAt ? `Trocada em ${contacts.passwordChangedAt}.` : undefined}
            action="Trocar senha"
            onAction={() => setPasswordOpen(true)} />
          
          {/* L19: "Sair da conta". L22b: variante `dangerSoft` do DS (vermelho claro), tamanho `md` como os outros botões desta área. */}
          <div className="border-t border-border pt-5">
            <Button size="md" variant="dangerSoft" className="w-full sm:w-auto" leftIcon={<LogOutIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setLeaving(true)}>
              Sair da conta
            </Button>
          </div>
        </div>
        <Modal
          open={leaving}
          onClose={() => setLeaving(false)}
          size="sm"
          dismissToasts
          title="Sair da conta?"
          description="Para usar o painel de novo, você entra com seu e-mail e senha."
          footer={
          <>
              <Button variant="secondary" onClick={() => setLeaving(false)}>
                Cancelar
              </Button>
              <Button
              onClick={() => {
                setLeaving(false);
                setSignedOut(true);
              }}>
              
                Sair da conta
              </Button>
            </>
          } />
        
        <AlterarSenhaModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
        <VerificarContatoModal
          open={verify !== null}
          onClose={() => setVerify(null)}
          kind={verify ?? 'email'}
          current={verify === 'phone' ? contacts.alertsPhone : contacts.email}
          currentEmail={contacts.email}
          onVerified={(v) => verify === 'phone' ? setAccountPhone(v) : setAccountEmail(v)} />
        
      </Card>

      <Card as="section" padding="lg" aria-labelledby="lgpd-titulo">
        <CardTitle as="h2" id="lgpd-titulo">
          Dados dos clientes (LGPD)
        </CardTitle>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">Para baixar ou apagar os dados de um cliente, abra a ficha dele em Clientes e use o menu ⋯.</p>
          <Button size="md" variant="neutral" className="w-full shrink-0 sm:w-auto" onClick={() => navigate('/clientes')}>
            Abrir Clientes
          </Button>
        </div>
      </Card>
    </div>);

}