import { useToneDemoContext } from '../data/toneDemoContext';
import React, { useState } from 'react';
import { NOW, greeting } from '../data/agendaStore';
import { BellRingIcon, MessageSquareIcon, UsersIcon } from 'lucide-react';
import { AtendenteIaLayout } from '../components/dashboard/AtendenteIaLayout';
import { Card, CardTitle, OrniMarkIcon } from '../components/Card';
import { Alert } from '../components/Alert';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { Pill, PillGroup } from '../components/Pill';
import { Button } from '../components/Button';
import { VoiceTonePicker } from '../components/atendente-ia/VoiceTonePicker';
import { FieldLabel, SectionCard, StickySaveBar } from '../components/atendente-ia/FormParts';
import { WhatsAppPreview } from '../components/atendente-ia/WhatsAppPreview';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { useDraft } from '../components/ui/useDraft';
import { useSavedStore } from '../data/iaConfigStore';
import { empresaStore } from '../data/empresa';
import { paymentInstructions } from '../data/paymentRules';
import { getServices } from '../data/servicesStore';
import { businessWords, suggestionKey, suggestionLabel } from '../data/segment';
import {
  CAN_DO_OPTIONS,
  CANNOT_DO_OPTIONS,
  HANDOFF_CLIENT_MESSAGE,
  HANDOFF_OPTIONS,
  INSTRUCTION_SUGGESTIONS,
  atendimentoStore,
  effectiveGreeting,
  suggestedGreeting } from
'../data/comoAtender';
import type { AtendimentoConfig } from '../data/comoAtender';
import { DEFAULT_ASSISTANT_NAME } from '../data/assistantIdentity';
import { useAccountContacts } from '../data/accountStore';
import { useGuardedNavigate } from '../components/ui/UnsavedChanges';

const MAX = 2500;

const asArray = (v: string | string[]) => Array.isArray(v) ? v : [v];
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** L20 (17/11/2026, DS 5.1): o ícone de brilho do "Gerar sugestão com base no seu cadastro" virou a marca da Orniplaty em
 *  cinza (`OrniMarkIcon tone="neutral"`): nenhum brilho representa a assistente. Mesmo botão, mesma ação. */
export function AtendenteIaComoAtender() {
  const toast = useToast();
  // G4 (F-062): exemplos com o serviço e o profissional do cadastro (ou o exemplo do segmento).
  const demoCtx = useToneDemoContext();
  const empresa = useSavedStore(empresaStore);
  const form = useDraft<AtendimentoConfig>('ia-como-atender', atendimentoStore.get(), {
    onSaved: (d) => {
      atendimentoStore.set(d);
      toast({ title: 'Alterações salvas', tone: 'success' });
    }
  });
  const { draft, set } = form;
  const [askRestore, setAskRestore] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { alertsPhone } = useAccountContacts();
  const navigate = useGuardedNavigate();

  // Lote D: palavras pelo segmento e sugestões pela especialidade (sem lista própria, usam as genéricas).
  const words = businessWords(empresa.segment);
  const key = suggestionKey(empresa.segment, empresa.specialty);
  const segment = key in INSTRUCTION_SUGGESTIONS ? key : 'outro';
  const segmentLabel = segment === key ? suggestionLabel(empresa.segment, empresa.specialty) : words.your;
  const suggestions = INSTRUCTION_SUGGESTIONS[segment].filter((s) => !draft.instructions.includes(s));

  const changeName = (name: string) => {
    set('name', name);
    if (!draft.greetingEdited) set('greeting', suggestedGreeting(name));
  };
  const changeGreeting = (text: string) => {
    set('greeting', text);
    set('greetingEdited', text !== suggestedGreeting(draft.name));
  };
  const restoreGreeting = () => {
    set('greeting', suggestedGreeting(draft.name));
    set('greetingEdited', false);
  };

  const appendInstruction = (text: string) => {
    const base = draft.instructions.trim();
    set('instructions', `${base ? `${base}\n` : ''}${text}`.slice(0, MAX));
  };

  const generate = () => {
    setGenerating(true);
    window.setTimeout(() => {
      const parts = [
      `Você atende a ${empresa.name}${empresa.district || empresa.city ? `, no ${[empresa.district, empresa.city].filter(Boolean).join(', ')}` : ''}.`,
      'Confirme sempre serviço, profissional e horário antes de marcar.',
      empresa.cancellationPolicy.trim() ? `Sobre cancelamento: ${empresa.cancellationPolicy.trim()}` : '',
      // G1 subetapa 4 (F-012): só entra se estiver salva; sem ela, nada de multa ou regra inventada.
      empresa.noShowPolicy.trim() ? `Sobre faltas: ${empresa.noShowPolicy.trim()}` : 'Se o cliente faltar e perguntar o que acontece, diga que vai confirmar com a equipe.',
      // Lote F (F3): o padrão e, abaixo, "Diferente em: {serviço}: {regra}" (effectivePayment), convênio incluído.
      ...paymentInstructions(empresa, getServices().services),
      ...INSTRUCTION_SUGGESTIONS[segment].slice(0, 2)].
      filter(Boolean);
      appendInstruction(parts.join('\n'));
      setGenerating(false);
      toast({ title: 'Sugestão pronta', description: 'Revise o texto e salve se estiver de acordo.', tone: 'info' });
    }, 1000);
  };

  const canLabels = CAN_DO_OPTIONS.filter((o) => draft.canDo.includes(o.value)).map((o) => o.label.toLowerCase());
  const cannotDiagnose = draft.cannotDo.includes('diagnostico') || draft.cannotDo.includes('resultado');

  return (
    <AtendenteIaLayout activeTab="como-atender">
      <div className="flex flex-col gap-6">
        {/* 1. Identidade */}
        <SectionCard
          id="identidade"
          title="Identidade"
          purpose="É assim que a assistente se apresenta na primeira mensagem de cada conversa."
          aside={
          <WhatsAppPreview
            assistantName={draft.name}
            messages={[
            { from: 'client', text: `Oi, ${greeting().toLowerCase()}`, time: NOW },
            { from: 'ai', text: effectiveGreeting(draft), time: NOW }]
            } />

          }>
          
          <div>
            <FieldLabel
              htmlFor="atendente-nome"
              optional
              tip="Nome com que a assistente se apresenta na conversa (ex.: “Sou a Marina…”). Não é o nome do contato: no topo da conversa o cliente vê o nome do seu perfil do WhatsApp Business.">
              
              Nome da assistente
            </FieldLabel>
            <Input
              id="atendente-nome"
              placeholder={DEFAULT_ASSISTANT_NAME}
              helperText={`Enquanto estiver vazio, usamos “${DEFAULT_ASSISTANT_NAME}”.`}
              maxLength={80}
              value={draft.name}
              onChange={(e) => changeName(e.target.value)} />
            
          </div>
          <div>
            <FieldLabel
              htmlFor="atendente-apresentacao"
              tip="Enquanto você não editar, este texto acompanha o nome da assistente sozinho.">
              
              Apresentação inicial
            </FieldLabel>
            <Textarea id="atendente-apresentacao" rows={3} maxLength={1000} value={effectiveGreeting(draft)} onChange={(e) => changeGreeting(e.target.value)} />
            {draft.greetingEdited &&
            <div className="mt-2">
                <Button type="button" variant="neutral" size="md" onClick={() => setAskRestore(true)}>
                  Restaurar texto sugerido
                </Button>
              </div>
            }
          </div>
        </SectionCard>

        {/* 2. Tom de voz */}
        <Card as="section" padding="lg" aria-labelledby="tom-titulo" id="tom">
          <CardTitle as="h2" id="tom-titulo">
            Tom de voz
          </CardTitle>
          <p className="mt-1 text-sm text-text-secondary">A assistente usa o tom escolhido em todas as respostas.</p>
          <div className="mt-5">
            <VoiceTonePicker hideLegend value={draft.tone} onChange={(id) => set('tone', id)} assistantName={draft.name} />
          </div>
        </Card>

        {/* 3. Limites */}
        <SectionCard
          id="limites"
          title="O que a assistente pode e não pode fazer"
          purpose="Estes limites evitam que a assistente invente informação ou fale de saúde sem um profissional."
          aside={
          <WhatsAppPreview
            assistantName={draft.name}
            messages={[
            { from: 'client', text: `${demoCtx.service} resolve o meu caso?`, time: '16:10' },
            {
              from: 'ai',
              time: '16:10',
              text: cannotDiagnose ?
              `Quem avalia o seu caso é ${demoCtx.professional}, no atendimento. Quer que eu veja um horário para você?` :
              `${demoCtx.service} costuma dar ótimo resultado. Quer agendar?`
            }]
            }
            caption={cannotDiagnose ? undefined : 'Sem o limite “Prometer resultado”, a assistente pode responder sobre resultados.'} />

          }>
          
          <div>
            <FieldLabel tip="Tudo que estiver marcado a assistente faz sozinha, sempre com os dados da sua agenda e do cadastro.">
              A assistente pode
            </FieldLabel>
            <PillGroup multiple size="sm" options={CAN_DO_OPTIONS} value={draft.canDo} onChange={(v) => set('canDo', asArray(v))} />
            <Textarea
              aria-label="Algo mais que a assistente pode fazer (opcional)"
              placeholder="Algo mais? (opcional)"
              rows={2}
              value={draft.canExtra}
              onChange={(e) => set('canExtra', e.target.value)}
              containerClassName="mt-3" />
            
          </div>
          <div>
            <FieldLabel tip="A assistente é orientada a não fazer o que estiver marcado, mesmo que o cliente insista, e a chamar uma pessoa quando precisar.">
              A assistente não pode
            </FieldLabel>
            <PillGroup multiple size="sm" options={CANNOT_DO_OPTIONS} value={draft.cannotDo} onChange={(v) => set('cannotDo', asArray(v))} />
            <Textarea
              aria-label="Algo mais que a assistente não pode fazer (opcional)"
              placeholder="Algo mais? (opcional)"
              rows={2}
              value={draft.cannotExtra}
              onChange={(e) => set('cannotExtra', e.target.value)}
              containerClassName="mt-3" />
            
          </div>
          {canLabels.length === 0 &&
          <Alert variant="warning" compact title="Nada marcado em “pode”">
              Sem nenhuma permissão, a assistente só cumprimenta e passa tudo para a equipe.
            </Alert>
          }
        </SectionCard>

        {/* 4. Quando chamar uma pessoa */}
        <SectionCard
          id="quando-chamar"
          title="Quando chamar uma pessoa"
          purpose="Nestes casos a assistente para de responder e passa a conversa para a sua equipe."
          aside={
          <WhatsAppPreview
            assistantName={draft.name}
            messages={[
            { from: 'client', text: `Quero falar com alguém ${words.of}`, time: '17:22' },
            { from: 'ai', text: HANDOFF_CLIENT_MESSAGE, time: '17:22' }]
            } />

          }>
          
          <div>
            <FieldLabel tip="Marque os casos em que você quer que alguém da equipe assuma a conversa.">Chamar uma pessoa quando</FieldLabel>
            <PillGroup multiple size="sm" options={HANDOFF_OPTIONS} value={draft.handoff} onChange={(v) => set('handoff', asArray(v))} />
            <Input
              aria-label="Outro caso (opcional)"
              placeholder="Outro caso (opcional)"
              value={draft.handoffOther}
              onChange={(e) => set('handoffOther', e.target.value)}
              containerClassName="mt-3" />
            
          </div>
          {draft.handoff.length === 0 && !draft.handoffOther.trim() &&
          <Alert variant="warning" compact title="Nenhum caso marcado">
              Sem nenhum caso marcado, a assistente tenta resolver tudo sozinha.
            </Alert>
          }
          {/* Só leitura (decisão 3 A, 20/10/2026): o número mora em Configurações › Conta e vem de data/accountStore.ts */}
          <div id="whatsapp-aviso" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <FieldLabel tip="Número que recebe o aviso quando a assistente chama alguém. É o mesmo que recebe os avisos de uso do mês.">WhatsApp para avisos</FieldLabel>
              <p className="text-base font-semibold text-text-primary">{alertsPhone || 'Nenhum número cadastrado'}</p>
            </div>
            <Button size="md" variant="neutral" className="w-full shrink-0 sm:w-auto" onClick={() => navigate('/configuracoes?secao=conta')}>
              Trocar em Conta
            </Button>
          </div>
          <Card variant="muted" padding="md">
            <p className="text-sm font-bold text-text-primary">O que acontece quando a assistente chama alguém</p>
            <ul className="mt-3 flex flex-col gap-3 text-sm text-text-secondary">
              <li className="flex items-start gap-2.5">
                <MessageSquareIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>O cliente recebe: “{HANDOFF_CLIENT_MESSAGE}”</span>
              </li>
              <li className="flex items-start gap-2.5">
                <BellRingIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Você recebe um aviso no WhatsApp {alertsPhone || 'informado acima'} com o nome do cliente e o motivo.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <UsersIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  A conversa vai para Conversas › Aguardando você. A assistente fica em silêncio nessa conversa até você devolver o atendimento para ela.
                </span>
              </li>
            </ul>
          </Card>
        </SectionCard>

        {/* 5. Instruções especiais */}
        <SectionCard
          id="instrucoes"
          title="Instruções especiais (opcional)"
          purpose={`Regras próprias ${words.fem ? 'da' : 'do'} ${words.your} que não cabem nos campos acima.`}>
          
          <div>
            <FieldLabel htmlFor="instrucoes-texto" tip="Escreva uma regra por linha, do jeito que você explicaria para uma recepcionista nova.">
              Instruções
            </FieldLabel>
            <Textarea
              id="instrucoes-texto"
              rows={6}
              maxLength={MAX}
              showCount
              placeholder={`Ex.: Pergunte se é a primeira vez ${words.in}.`}
              value={draft.instructions}
              onChange={(e) => set('instructions', e.target.value)} />
            
          </div>
          {suggestions.length > 0 &&
          <div>
              <p className="mb-2 text-sm font-semibold text-text-primary">Sugestões para {segmentLabel}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) =>
              <Pill key={s} size="sm" addable onClick={() => appendInstruction(s)}>
                    {s}
                  </Pill>
              )}
              </div>
            </div>
          }
          <div>
            <Button
              type="button"
              variant="secondary"
              size="md"
              loading={generating}
              leftIcon={<OrniMarkIcon tone="neutral" size={16} />}
              onClick={generate}>
              
              Gerar sugestão com base no seu cadastro
            </Button>
            <p className="mt-2 text-xs text-text-muted">A sugestão usa o que está em Empresa e entra no texto para você revisar. Nada é salvo sozinho.</p>
          </div>
        </SectionCard>
      </div>

      <StickySaveBar onSave={() => form.save()} saveError={form.saveError} />

      <ConfirmDialog
        open={askRestore}
        title="Restaurar o texto sugerido?"
        description="A apresentação volta ao texto padrão com o nome da assistente. O que você escreveu será substituído."
        confirmLabel="Restaurar"
        cancelLabel="Manter o meu"
        onClose={() => setAskRestore(false)}
        onConfirm={restoreGreeting} />
      
    </AtendenteIaLayout>);

}