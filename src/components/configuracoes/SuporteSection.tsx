import { wordsNow } from '../../data/segment';
import React, { useState } from 'react';
import { Card, CardTitle } from '../Card';
import { Alert } from '../Alert';
import { Button, buttonClass } from '../Button';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { PillGroup } from '../Pill';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { supportSubjects } from '../../data/configuracoes';
import { useAccountContacts } from '../../data/accountStore';
import { SUPPORT_RESPONSE_TEXT, SUPPORT_WHATSAPP_URL, useSettings } from '../../data/settingsStore';
import type { SettingsSectionId } from '../../data/settingsStore';
import { LinkRow } from './SettingsParts';

const MAX_TITLE = 120;
const MIN_TEXT = 10;

/**
 * Ajuda (20/10/2026): resolver rápido, falar com a gente e abrir chamado (backend: POST /support/tickets, só e-mail).
 * W6 (11/11/2026, G21): prazo e horário do suporte (`SUPPORT_RESPONSE_TEXT`).
 */
export function AjudaSection({ onOpen }: {onOpen: (s: SettingsSectionId) => void;}) {
  const navigate = useGuardedNavigate();
  const { supportFails } = useSettings();
  const { email } = useAccountContacts();
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<null | 'ok' | 'erro'>(null);

  const quick = [
  { label: 'O WhatsApp parou de responder', go: () => onOpen('whatsapp') },
  { label: 'A assistente respondeu algo errado', go: () => navigate('/atendente-ia/conhecimento') },
  { label: 'Quero mudar o horário de atendimento', go: () => navigate('/servicos-equipe?aba=funcionamento') },
  { label: 'Problema com cobrança ou cartão', go: () => onOpen('plano') },
  { label: 'Um cliente pediu para não receber mensagens', go: () => navigate('/clientes') }];


  const hint = supportSubjects.find((x) => x.value === subject)?.hint;
  const subjectError = submitted && !subject ? 'Escolha sobre o que é.' : undefined;
  const textError = submitted && text.trim().length < MIN_TEXT ? 'Escreva pelo menos 10 caracteres.' : undefined;

  const whatsappLink =
  <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className={`${buttonClass('primary', { size: 'md' })} w-full sm:w-auto`}>
      Chamar no WhatsApp
    </a>;


  const reset = () => {
    setSubject('');
    setTitle('');
    setText('');
    setSubmitted(false);
    setResult(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" padding="lg" aria-labelledby="resolva-titulo">
        <CardTitle as="h2" id="resolva-titulo">
          Resolva rápido
        </CardTitle>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {quick.map((q) =>
          <li key={q.label}>
              <LinkRow label={q.label} onClick={q.go} />
            </li>
          )}
        </ul>
      </Card>

      <Card as="section" padding="lg" aria-labelledby="fale-titulo">
        <CardTitle as="h2" id="fale-titulo">
          Fale com a gente
        </CardTitle>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          {whatsappLink}
          <p className="text-sm text-text-secondary">Pelo WhatsApp do suporte ou pelo chamado abaixo. {SUPPORT_RESPONSE_TEXT}</p>
        </div>
      </Card>

      <Card as="section" padding="lg" aria-labelledby="chamado-titulo">
        <CardTitle as="h2" id="chamado-titulo">
          Abrir chamado
        </CardTitle>
        {result === 'ok' ?
        <div className="mt-4">
            <Alert
            variant="success"
            title="Chamado enviado"
            actions={
            <Button size="md" variant="neutral" onClick={reset}>
                  Abrir outro chamado
                </Button>
            }>
            
              Vamos responder no e-mail {email} em até 1 dia útil (segunda a sexta, das 9h às 18h). Se for urgente, chame no WhatsApp.
            </Alert>
          </div> :

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (!subject || text.trim().length < MIN_TEXT) return;
            setResult(supportFails ? 'erro' : 'ok');
          }}
          className="mt-4 flex flex-col gap-5">
          
            {result === 'erro' &&
          <Alert variant="error" title="Não conseguimos enviar agora" actions={whatsappLink}>
                Tente de novo em instantes ou chame no WhatsApp.
              </Alert>
          }
            <div>
              <PillGroup
              label="Sobre o que é?"
              size="sm"
              options={supportSubjects.map(({ value, label }) => ({ value, label }))}
              value={subject}
              onChange={(v) => typeof v === 'string' && setSubject(v)} />
            
              {hint && <p className="mt-2 text-sm text-text-secondary">{hint}</p>}
              {subjectError &&
            <p role="alert" className="mt-2 text-sm font-semibold text-error">
                  {subjectError}
                </p>
            }
            </div>
            <Input label="Assunto (opcional)" value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} helperText={`${title.length} / ${MAX_TITLE}`} />
            <Textarea
            label="Descreva o problema"
            required
            rows={5}
            placeholder="O que aconteceu? Se puder, diga em qual tela e o que você tentou fazer."
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={textError} />
          
            <p className="text-sm text-text-muted">Junto com a mensagem, enviamos o nome {wordsNow().of}, seu e-mail e a data e hora.</p>
            <div className="flex justify-end border-t border-border pt-5">
              <Button type="submit" size="md" className="w-full sm:w-auto">
                Enviar chamado
              </Button>
            </div>
          </form>
        }
      </Card>
    </div>);

}

/** Compatibilidade com o nome antigo da seção. */
export const SuporteSection = AjudaSection;