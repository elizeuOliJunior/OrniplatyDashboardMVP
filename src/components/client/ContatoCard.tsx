import React, { useEffect, useState } from 'react';
import { Card, InfoTip } from '../Card';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { StatusPill } from '../ui/StatusPill';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { useToast } from '../ui/Toast';
import {
  KIND_ORDER,
  KIND_TEXT,
  NEWS_RESUME_TOAST,
  STATUS_TEXT,
  alwaysAnswersText,
  canResume,
  clientIdFromName,
  kindOf,
  kindReason,
  resumeKind,
  stopKinds,
  useContactBlocks } from
'../../data/contactPreferences';
import type { ContactKind } from '../../data/contactPreferences';
import { clientIdOfRecordedName } from '../../data/api/clientes';
import { useAgendaData } from '../../data/agendaLive';
import { logChange } from '../../data/legado';
import { todayShort } from '../../data/agendaStore';
import { useFollowUp } from '../../data/followUp';
import { useBusinessWords } from '../../data/empresa';

/** L23 (18/11/2026): texto do botão que abre a escolha. O mesmo no menu "⋯" da Ficha e nos menus de Oportunidades. */
export const OPT_OUT_ACTION_LABEL = 'Cliente pediu para parar';

/** L23: texto do "i" ao lado do título (mais longo que o guia do DS: aprovado pelo Christian em 18/11/2026). */
export const CONTACT_PREF_TIP =
'Novidades da clínica só vão para quem disse que sim. No fim de um agendamento, a IA Orniplaty pergunta: "Posso te avisar por aqui quando a clínica tiver novidades?". Lembretes e avisos de retorno saem para todos, e cada aviso tem um botão para o cliente parar. Por quê: mensagem que o cliente não quer faz ele bloquear a clínica no WhatsApp, e muitos bloqueios fazem o WhatsApp limitar todas as mensagens da clínica.';

/** O "i" do título "Preferência de contato" (vai no `action` da `ContextSection`, na linha do título). */
export function ContatoInfoTip() {
  return <InfoTip label="Preferência de contato" ariaLabel="Como funciona a preferência de contato?" content={CONTACT_PREF_TIP} />;
}

/** "Aviso de vaga" só aparece com pedido aberto na lista de espera. */
export function useKindsShown(clientId: string): ContactKind[] {
  const { waitlist } = useAgendaData();
  const onWaitlist = waitlist.some((e) => (clientIdOfRecordedName(e.clientName) ?? clientIdFromName(e.clientName)) === clientId);
  return KIND_ORDER.filter((k) => k !== 'vaga' || onWaitlist);
}

/**
 * L24a (18/11/2026): tipos MOSTRADOS na Preferência de contato que ainda podem ser parados (não estão em "Não recebe").
 * O menu "⋯" da Ficha mostra "Cliente pediu para parar" sempre que esta lista não está vazia (mesma regra do botão do cartão).
 */
export function useStoppableKinds(clientId: string): ContactKind[] {
  useContactBlocks();
  const shown = useKindsShown(clientId);
  return shown.filter((k) => kindOf(clientId, k).status !== 'nao-recebe');
}

/**
 * Preferência de contato (L23, 18/11/2026, decisões do Christian). Uma linha por tipo de mensagem: nome + UMA etiqueta
 * ("Recebe", "Não recebe" ou "Ainda não perguntado") e, só quando há, uma linha de motivo. Tipo parado pelo cliente ou
 * pela equipe tem "Voltar a enviar" no fim do motivo. Embaixo, sempre: "Se o cliente pedir um horário, … sempre
 * responde." e o botão "Cliente pediu para parar" (abre a escolha dos tipos).
 * Saíram (pedido do Christian): "Sem pedido de saída", o bloco "Lembretes de horário / Retornos e ofertas", "Ver por
 * finalidade", "Definição jurídica pendente de validação", "Consentimento não registrado", "Automação desligada" e as
 * duas frases do fim.
 * Usa o MESMO registro de Clientes, Retornos, Oportunidades e Lista de espera. Simulação: nada é gravado nem enviado.
 * `registerSignal`: cada vez que o número muda (menu "⋯" da Ficha ou `?registrar=saida`), abre a mesma escolha.
 * L24a: rodapé pelo dicionário (`alwaysAnswersText`); "Voltar a enviar" em Novidades avisa "A IA Orniplaty vai perguntar
 * de novo no próximo agendamento." (o tipo volta a "Ainda não perguntado"); os outros tipos continuam com o aviso de antes.
 */
export function ContatoSection({
  clientId,
  clientName,
  archived = false,
  registerSignal = 0






}: {clientId: string;clientName: string;archived?: boolean; /** Muda para abrir a escolha de fora (menu "⋯" da Ficha). 0 = nunca. */registerSignal?: number;}) {
  useContactBlocks();
  const toast = useToast();
  const w = useBusinessWords();
  const followUp = useFollowUp();
  const shown = useKindsShown(clientId);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<ContactKind[]>([]);
  const first = clientName.split(' ')[0];
  const open = shown.filter((k) => kindOf(clientId, k).status !== 'nao-recebe');

  const openChoice = () => {
    setChosen([]);
    setChoosing(true);
  };

  useEffect(() => {
    if (registerSignal > 0 && open.length > 0) openChoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSignal]);

  const resume = (k: ContactKind) => {
    const before = STATUS_TEXT[kindOf(clientId, k).status].label;
    resumeKind(clientId, k);
    logChange(clientId, KIND_TEXT[k].label, before.toLowerCase(), STATUS_TEXT[kindOf(clientId, k).status].label.toLowerCase());
    toast({ title: k === 'novidades' ? NEWS_RESUME_TOAST : `Voltamos a enviar ${KIND_TEXT[k].lower} para ${first}.` });
  };

  const confirmStop = () => {
    const kinds = KIND_ORDER.filter((k) => chosen.includes(k));
    // F-025: parar os avisos de retorno leva o acompanhamento em andamento para Resolvidos.
    const active = kinds.includes('retorno') ? followUp.all.filter((c) => c.clientId === clientId && c.situation !== 'resolvidos').length : 0;
    kinds.forEach((k) => logChange(clientId, KIND_TEXT[k].label, STATUS_TEXT[kindOf(clientId, k).status].label.toLowerCase(), 'não recebe'));
    stopKinds(clientId, kinds, todayShort());
    setChoosing(false);
    const list = kinds.map((k) => KIND_TEXT[k].lower);
    const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : list[0];
    toast({
      title: `Paramos de enviar ${joined} para ${first}.`,
      description: active > 0 ? active === 1 ? 'O acompanhamento em andamento foi para Resolvidos.' : `Os ${active} acompanhamentos em andamento foram para Resolvidos.` : undefined
    });
  };

  return (
    <>
      <ul className="flex flex-col divide-y divide-border rounded-button border border-border" aria-label={`O que ${first} recebe`}>
        {shown.map((k) => {
          const r = kindOf(clientId, k);
          const s = STATUS_TEXT[r.status];
          const reason = kindReason(k, r);
          return (
            <li key={k} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 pt-1 text-sm font-semibold text-text-primary">{KIND_TEXT[k].label}</p>
                <span className="shrink-0">
                  <StatusPill tone={s.tone} label={s.label} />
                </span>
              </div>
              {/* Motivo na largura toda da linha (embaixo do nome e da etiqueta), com "Voltar a enviar" no fim. */}
              {reason &&
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-xs text-text-secondary">{reason}</p>
                  {canResume(r) && !archived &&
                <Button variant="neutral" size="sm" onClick={() => resume(k)} aria-label={`Voltar a enviar ${KIND_TEXT[k].lower} para ${first}`}>
                      Voltar a enviar
                    </Button>
                }
                </div>
              }
            </li>);

        })}
      </ul>
      <p className="text-xs text-text-secondary">{alwaysAnswersText(w.the)}</p>
      {open.length > 0 &&
      <Button variant="secondary" size="md" className="h-auto min-h-9 w-full whitespace-normal py-1.5 text-center" onClick={openChoice}>
          {OPT_OUT_ACTION_LABEL}
        </Button>
      }

      <AppModal
        open={choosing}
        onClose={() => setChoosing(false)}
        size="sm"
        title={`O que ${first} pediu para parar?`}
        description="Escolha o que deixa de ser enviado."
        unsavedGuard={false}
        footer={
        <ModalActions equal={2}>
            <Button variant="secondary" onClick={() => setChoosing(false)}>
              Voltar
            </Button>
            <Button variant="danger" disabled={chosen.length === 0} onClick={confirmStop}>
              Parar
            </Button>
          </ModalActions>
        }>
        
        <div className="flex flex-col gap-3">
          {shown.map((k) => {
            const already = kindOf(clientId, k).status === 'nao-recebe';
            return (
              <Checkbox
                key={k}
                label={KIND_TEXT[k].label}
                description={already ? 'Já não recebe.' : undefined}
                checked={already || chosen.includes(k)}
                disabled={already}
                onChange={(checked: boolean) => setChosen((list) => checked ? [...list, k] : list.filter((x) => x !== k))} />);


          })}
        </div>
      </AppModal>
    </>);

}

export function ContatoCard({ clientId, clientName, archived = false }: {clientId: string;clientName: string;archived?: boolean;}) {
  return (
    <Card as="section" padding="lg" aria-label="Preferência de contato" className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1 text-base font-bold text-text-primary">
        Preferência de contato <ContatoInfoTip />
      </h2>
      <ContatoSection clientId={clientId} clientName={clientName} archived={archived} />
    </Card>);

}