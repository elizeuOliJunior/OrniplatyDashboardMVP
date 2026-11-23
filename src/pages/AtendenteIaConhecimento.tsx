import type { DocStatus } from '../data/conhecimento';
import { isReadableDocument } from '../data/docReadable';
import { markConfigured } from '../data/exampleRecords';
import { currentWords } from '../data/empresa';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRightIcon, FileTextIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { AtendenteIaLayout } from '../components/dashboard/AtendenteIaLayout';
import { Alert } from '../components/Alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, EmptyState, IconButton, InfoTip, ScrollList, clickableRowClass, clickableChevronClass } from '../components/Card';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { Button } from '../components/Button';
import { Pill } from '../components/Pill';
import { StatusBadge } from '../components/StatusBadge';
import { AppModal } from '../components/ui/AppModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { useDraft } from '../components/ui/useDraft';
import { StickySaveBar } from '../components/atendente-ia/FormParts';
import { WhatsAppPreview } from '../components/atendente-ia/WhatsAppPreview';
import { useSavedStore } from '../data/iaConfigStore';
import { empresaStore } from '../data/empresa';
import { businessWords, insuranceApplies, suggestionKey, suggestionLabel } from '../data/segment';
import { atendimentoStore } from '../data/comoAtender';
import {
  DOC_GUIDE,
  DOC_STATUS,
  QUESTION_SUGGESTIONS,
  conhecimentoStore,
  knowledgeNotice } from
'../data/conhecimento';
import type { ConhecimentoConfig, KnowledgeDocument, KnowledgeEntry } from '../data/conhecimento';
import { useGuardedNavigate } from '../components/ui/UnsavedChanges';
import { ServicoModal } from '../components/servicos/ServicoModal';
import { CategoriasModal } from '../components/servicos/CategoriasModal';
import { professionalLinkChanges, saveService, setCategories, setServiceActive } from '../data/servicesStore';
import { getAgendaState } from '../data/agendaLive';
import { clickableCardClass } from '../components/Card';
import { kindLabel, knowledgeBadgeLabel, knowledgeStatus, useServices } from '../data/servicesStore';
import { activeServicesOf } from '../data/servicesStore';
import { Select } from '../components/Select';
import { formatAddress, isAddressComplete, paymentSentence } from '../data/empresa';
import { isActiveMember, useTeam } from '../data/availability';
import { NOW, TODAY_ISO } from '../data/agendaStore';
import { allClientsForSelect } from '../data/api/clientes';
import { useBackendVersion } from '../data/api/pacotes';
import { answerQuestion, funcionamentoConflict, registryTopicOf } from '../data/assistantAnswer';

/**
 * Conhecimento por serviço (19/10/2026): só o STATUS de cada serviço e o atalho para abrir. A edição fica em
 * Serviços e equipe › Serviços › O que a assistente explica (não duplicar).
 */
/**
 * G1 subetapa 4 (F-010): o que a assistente JÁ SABE pelos cadastros (não precisa virar pergunta do Conhecimento).
 * Só lê o que está salvo; cada linha leva ao lugar onde se edita.
 */
function RegistryKnowledgeCard() {
  // G2 (F-031): atalhos para outro cadastro passam pelo aviso de alterações não salvas.
  const navigate = useGuardedNavigate();
  const empresa = useSavedStore(empresaStore);
  const team = useTeam();
  const { services } = useServices();
  const activeServices = activeServicesOf(services);
  const activePros = team.members.filter(isActiveMember);
  const open = team.hours.filter((h) => h.open);
  const specials = team.blocks.filter((b) => b.date >= TODAY_ISO).length;
  const rows: {label: string;value: string;to: string;}[] = [
  { label: 'Funcionamento', value: open.length ? `${open.map((h) => h.day.slice(0, 3)).join(', ')} · ${specials} ${specials === 1 ? 'data especial' : 'datas especiais'} por vir` : 'Nenhum dia aberto', to: '/servicos-equipe?aba=funcionamento' },
  { label: 'Serviços', value: `${activeServices.length} ${activeServices.length === 1 ? 'ativo' : 'ativos'}, com preço, duração, quem faz, preparo e cuidados`, to: '/servicos-equipe?aba=servicos' },
  { label: 'Equipe', value: `${activePros.length} ${activePros.length === 1 ? 'profissional ativo' : 'profissionais ativos'} e os dias de cada um`, to: '/servicos-equipe?aba=equipe' },
  { label: 'Pagamento', value: paymentSentence(empresa.payments) || 'Nenhuma forma cadastrada', to: '/atendente-ia/empresa?campo=pagamento' },
  // G4 · fechamento: a linha de convênio só aparece onde se aplica ou com convênio salvo.
  ...(insuranceApplies(empresa.segment, empresa.specialty, empresa.acceptsInsurance === 'sim' || empresa.insurers.length > 0) ?
  [{ label: 'Convênio', value: empresa.acceptsInsurance === 'sim' && empresa.insurers.length ? empresa.insurers.join(', ') : 'Só particular', to: '/atendente-ia/empresa?campo=pagamento' }] :
  []),
  { label: 'Endereço', value: isAddressComplete(empresa) ? formatAddress(empresa) : 'Incompleto: a assistente passa para a equipe', to: '/atendente-ia/empresa?campo=endereco' },
  { label: `Regras ${currentWords().of}`, value: [empresa.cancellationPolicy.trim() ? 'cancelamento' : '', empresa.noShowPolicy.trim() ? 'falta' : ''].filter(Boolean).join(' e ') || 'Nenhuma regra escrita', to: '/atendente-ia/empresa?campo=politica-cancelamento' }];

  return (
    <Card as="section" padding="lg" id="ja-sabe" className="scroll-mt-6">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h2">O que a assistente já sabe pelo cadastro</CardTitle>
        <InfoTip label="O que a assistente já sabe pelo cadastro" content="A assistente responde estes assuntos pelos cadastros. Não precisa repetir aqui: mude no lugar de origem." />
      </div>
      <p className="mt-1 mb-3 text-sm text-text-secondary">Use as perguntas e respostas abaixo só para o que não está em outro cadastro.</p>
      <ul className="divide-y divide-border">
        {rows.map((r) =>
        <li key={r.label}>
            <button type="button" className={clickableRowClass} onClick={() => navigate(r.to)} aria-label={`Abrir ${r.label}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-text-primary">{r.label}</span>
                <span className="block text-sm text-text-secondary">{r.value}</span>
              </span>
              <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
    </Card>);

}

/**
 * G1 subetapa 4 (F-011): testar QUALQUER pergunta e ver de que fonte a resposta vem. "Testar como" simula o cliente identificado (saldo de pacote).
 * I3 (11/11/2026, A5-18): Enter envia (já enviava). Clicar numa sugestão troca o texto do campo, pergunta e deixa o texto
 * selecionado: o que a pessoa digitar em seguida SUBSTITUI a sugestão, em vez de se somar a ela.
 */
function AskTesterCard({ items }: {items: KnowledgeEntry[];}) {
  const empresa = useSavedStore(empresaStore);
  const atendimento = useSavedStore(atendimentoStore);
  const { services } = useServices();
  useTeam();
  useBackendVersion();
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [who, setWho] = useState('nenhum');
  const inputRef = useRef<HTMLInputElement>(null);
  const clients = allClientsForSelect();
  const answer = asked.trim() ? answerQuestion(asked, { empresa, services, knowledge: items, cannotDo: atendimento.cannotDo, clientId: who === 'nenhum' ? null : who }) : null;
  const ask = (q: string) => {
    setQuestion(q);
    setAsked(q);
    // I3 (A5-18): depois que o campo recebe a sugestão, o texto fica selecionado para a próxima digitação substituir.
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
  };
  return (
    <Card as="section" padding="lg" id="testar" className="scroll-mt-6" data-guard-ignore="">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h2">Testar uma pergunta</CardTitle>
        <InfoTip label="Testar uma pergunta" content="Mostra como a assistente responderia com o que está salvo e de onde ela tirou a resposta. Sem a informação, ela passa para a equipe." />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <Input
          ref={inputRef}
          aria-label="Pergunta do cliente"
          placeholder="Ex.: Atendem sábado? Quantas sessões do pacote eu tenho?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setAsked(question);
            }
          }} />
        
        <Button size="md" onClick={() => setAsked(question)} disabled={!question.trim()} className="sm:mt-1">
          Perguntar
        </Button>
      </div>
      <div className="mt-3 sm:max-w-xs">
        <Select
          label="Testar como"
          value={who}
          onChange={(v: string) => setWho(v)}
          options={[{ value: 'nenhum', label: 'Cliente não identificado' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />
        
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {['Atendem sábado?', 'Qual o horário?', 'Onde fica?', 'Tem horário amanhã à tarde com a Dra. Carolina?', 'Faltei, e agora?', 'Quantas sessões do pacote eu tenho?', 'Quanto custa o pacote de 10 drenagens?', 'Responde às 23h?'].map((q) =>
        <Pill key={q} size="sm" addable onClick={() => ask(q)}>
            {q}
          </Pill>
        )}
      </div>
      {answer &&
      <div className="mt-4 max-w-md" aria-live="polite">
          <WhatsAppPreview
          messages={[
          { from: 'client', text: asked, time: NOW },
          { from: 'ai', text: answer.text, time: NOW }]
          } />
        
          <p className="mt-2 text-sm text-text-secondary">
            Ela responde com base em: <strong className="font-semibold text-text-primary">{answer.source}</strong>
          </p>
        </div>
      }
    </Card>);

}

/**
 * G2 (F-031): o serviço abre POR CIMA de Conhecimento (mesmo padrão da Empresa no Lote F, `onGoDefault`): sem trocar de
 * tela, o rascunho de Conhecimento e a rolagem ficam; fechar devolve o foco à linha clicada. Repetir o atalho funciona.
 * I3 (11/11/2026, D-A3-3): o selo usa `knowledgeBadgeLabel` (data/servicesStore.ts), o mesmo de Serviços e equipe:
 * "Completo" ou "Falta a descrição". Saiu o "Faltam N", que não dizia N de quê.
 */
function ServiceKnowledgeCard({ onOpen }: {onOpen: (serviceId: string) => void;}) {
  const { services } = useServices();
  const active = activeServicesOf(services);
  const incomplete = active.filter((s) => !knowledgeStatus(s).complete).length;
  return (
    <Card as="section" padding="lg" id="conhecimento-por-servico" className="scroll-mt-6">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h2">Conhecimento por serviço</CardTitle>
        <InfoTip label="Conhecimento por serviço" content="O que a assistente sabe explicar de cada serviço: descrição, outros nomes, o que inclui, preparo, cuidados, quando não é indicado e perguntas frequentes. Edite em Serviços e equipe." />
      </div>
      <p className="mt-1 mb-3 text-sm text-text-secondary">
        {incomplete > 0 ? `${incomplete === 1 ? '1 serviço está incompleto' : `${incomplete} serviços estão incompletos`}. Abra para completar.` : 'Todos os serviços estão completos.'}
      </p>
      {/* Lote E (E2, DS v3.14): incompletos em cartões com borda; completos em linhas com divisória. */}
      {(() => {
        const row = (s: (typeof active)[number], card: boolean) => {
          const st = knowledgeStatus(s);
          return (
            <li key={s.id}>
              <button type="button" className={card ? clickableCardClass : clickableRowClass} onClick={() => onOpen(s.id)} aria-label={`Abrir ${s.name}: o que a assistente explica`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-text-primary">{s.name}</span>
                  <span className="block text-xs text-text-secondary">{st.complete ? `${kindLabel(s.kind)} · tudo preenchido` : `${kindLabel(s.kind)} · falta: ${st.missing.join(', ').toLowerCase()}`}</span>
                </span>
                <StatusBadge status={st.complete ? 'success' : 'warning'} label={knowledgeBadgeLabel(st)} minWidth="md" />
                <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
              </button>
            </li>);

        };
        const todo = active.filter((s) => !knowledgeStatus(s).complete);
        const done = active.filter((s) => knowledgeStatus(s).complete);
        return (
          <div className="flex flex-col gap-5">
            {todo.length > 0 &&
            <section aria-labelledby="conhecimento-falta">
                <h3 id="conhecimento-falta" className="text-sm font-bold text-text-primary">
                  Falta completar ({todo.length})
                </h3>
                <ul className="mt-2 flex flex-col gap-2">{todo.map((s) => row(s, true))}</ul>
              </section>
            }
            {done.length > 0 &&
            <section aria-labelledby="conhecimento-pronto">
                <h3 id="conhecimento-pronto" className="text-sm font-bold text-text-primary">
                  Já está pronto ({done.length})
                </h3>
                <ul className="mt-2 divide-y divide-border border-y border-border">{done.map((s) => row(s, false))}</ul>
              </section>
            }
          </div>);

      })()}
    </Card>);

}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

const MAX_BYTES = 10 * 1024 * 1024;

type EntryModalProps = {
  entry: KnowledgeEntry | null;
  open: boolean;
  assistantName: string;
  onClose: () => void;
  onSave: (question: string, answer: string) => void;
};

/** Editar pergunta + prévia no WhatsApp ao lado (abaixo no celular), atualizada ao digitar. */
function EntryModal({ entry, open, assistantName, onClose, onSave }: EntryModalProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setQuestion(entry?.question ?? '');
      setAnswer(entry?.answer ?? '');
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    setSubmitted(true);
    if (!question.trim() || !answer.trim()) return;
    onSave(question.trim(), answer.trim());
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="lg"
      title={entry?.answer ? 'Editar pergunta' : entry ? 'Responder pergunta' : 'Nova pergunta'}
      description="Escreva como o cliente costuma perguntar e a resposta que a assistente deve dar."
      footer={
      <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>{entry ? 'Salvar' : 'Adicionar'}</Button>
        </>
      }>
      
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Textarea
            label="Pergunta"
            required
            rows={2}
            placeholder="Ex.: Vocês aceitam cartão?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            error={submitted && !question.trim() ? 'Escreva a pergunta.' : undefined} />
          
          <Textarea
            label="Resposta"
            required
            rows={5}
            placeholder="Escreva como você responderia no WhatsApp."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            error={submitted && !answer.trim() ? 'Escreva a resposta.' : undefined} />
          
        </div>
        <div data-guard-ignore="">
          <WhatsAppPreview
            messages={[
            { from: 'client', text: question.trim() || 'Pergunta do cliente', time: '10:15' },
            { from: 'ai', text: answer.trim() || 'A resposta aparece aqui enquanto você escreve.', time: '10:15' }]
            } />
          
        </div>
      </div>
    </AppModal>);

}

export function AtendenteIaConhecimento() {
  const toast = useToast();
  const empresa = useSavedStore(empresaStore);
  const atendimento = useSavedStore(atendimentoStore);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useDraft<ConhecimentoConfig>('ia-conhecimento', conhecimentoStore.get(), {
    onSaved: (d) => {
      conhecimentoStore.set(d);
      toast({ title: 'Alterações salvas', tone: 'success' });
    }
  });
  const { draft, set } = form;
  const draftRef = useRef(draft);
  const svc = useServices();
  const team = useTeam();
  const [serviceOpen, setServiceOpen] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const openedService = svc.services.find((s) => s.id === serviceOpen) ?? null;
  draftRef.current = draft;

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [removing, setRemoving] = useState<KnowledgeEntry | null>(null);
  const [removingDoc, setRemovingDoc] = useState<KnowledgeDocument | null>(null);

  // Lote D: as sugestões seguem a especialidade (Clínica e Consultório); sem lista própria, usam as genéricas.
  const key = suggestionKey(empresa.segment, empresa.specialty);
  const segment = key in QUESTION_SUGGESTIONS ? key : 'outro';
  const segmentLabel = segment === key ? suggestionLabel(empresa.segment, empresa.specialty) : businessWords(empresa.segment).your;
  const existing = new Set(draft.items.map((i) => i.question.trim().toLowerCase()));
  // F-010: nada que já vem de outro cadastro (Funcionamento, Empresa, Serviços).
  const suggestions = QUESTION_SUGGESTIONS[segment].filter((q) => !existing.has(q.toLowerCase()) && !registryTopicOf(q));

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return draft.items;
    return draft.items.filter((e) => e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q));
  }, [query, draft.items]);

  // L20 (17/11/2026, escolha b do arquiteto sobre correcao-L19 §6.3): lista dentro de cartão = `ScrollList` do DS
  // (5 visíveis, rolagem interna a partir do 6º), no lugar dos números de página (5 por página). A contagem fica acima.
  // L22e (18/11/2026, DS 6.1): os vazios de Perguntas (lista ou busca) e de Documentos usam `EmptyState size="sm"
  // variant="dotted"`, com a lupa só na busca sem resultado; mesmos textos.
  const total = draft.items.length;
  const countLine = query.trim() ?
  <>
      <strong className="font-semibold text-text-primary">{entries.length}</strong> de <strong className="font-semibold text-text-primary">{total}</strong> {total === 1 ? 'pergunta' : 'perguntas'}
    </> :

  <>
      <strong className="font-semibold text-text-primary">{total}</strong> {total === 1 ? 'pergunta' : 'perguntas'}
    </>;


  const openEntry = (entry: KnowledgeEntry | null) => {
    setEditing(entry);
    setModalOpen(true);
  };

  const addSuggestion = (question: string) => {
    const entry = { id: `q-${Date.now()}`, question, answer: '' };
    set('items', [entry, ...draftRef.current.items]);
    openEntry(entry);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    if (file.size > MAX_BYTES) {
      toast({ title: 'Arquivo grande demais', description: 'Envie arquivos de até 10 MB.', tone: 'warning' });
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    // Lote E (E3): o backend lê só .txt, .pdf e .docx (ai/document_parser.py). ".doc" antigo não é aceito.
    if (!ext || !['pdf', 'docx', 'txt'].includes(ext)) {
      toast({ title: 'Formato não aceito', description: 'Envie PDF, Word (.docx) ou texto (.txt).', tone: 'warning' });
      return;
    }
    const type: KnowledgeDocument['type'] = ext === 'pdf' ? 'pdf' : ext === 'txt' ? 'txt' : 'docx';
    const id = `doc-${Date.now()}`;
    set('docs', [...draftRef.current.docs, { id, name: file.name, size: formatSize(file.size), type, status: 'lendo' }]);
    // G4 (F-066): lê o arquivo de verdade (sem atraso fixo). Sem texto (PDF escaneado, .txt vazio) → "Não lido".
    void isReadableDocument(file, type).then((ok) => {
      const status: DocStatus = ok ? 'pronto' : 'nao-lido';
      set(
        'docs',
        draftRef.current.docs.map((d) => d.id === id ? { ...d, status } : d)
      );
    });
  };

  return (
    <AtendenteIaLayout activeTab="conhecimento">
      <div className="flex flex-col gap-6">
        <Alert variant="info">{knowledgeNotice}</Alert>

        <RegistryKnowledgeCard />
        <AskTesterCard items={draft.items} />

        {/* Perguntas e respostas */}
        <Card as="section" padding="lg" id="perguntas" className="scroll-mt-6">
          <CardHeader>
            <div>
              <div className="flex items-center gap-1.5">
                <CardTitle as="h2">Perguntas e respostas</CardTitle>
                <InfoTip label="Perguntas e respostas" content="Escreva como o cliente pergunta. A assistente reconhece perguntas parecidas e usa a sua resposta." />
              </div>
              <CardDescription>Clique numa pergunta para ver como ela aparece no WhatsApp.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                aria-label="Buscar pergunta"
                placeholder="Buscar pergunta"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                prefix={<SearchIcon className="h-4 w-4 text-text-muted" />}
                containerClassName="sm:max-w-sm" />
              
              <Button size="md" leftIcon={<PlusIcon className="h-4 w-4" />} className="shrink-0" onClick={() => openEntry(null)}>
                Nova pergunta
              </Button>
            </div>

            <p className="mt-5 text-sm text-text-secondary">{countLine}</p>
            <div className="mt-2">
              <ScrollList ariaLabel="Perguntas e respostas" className="divide-y divide-border border-t border-border">
                {entries.length === 0 &&
                <li className="py-4">
                    <EmptyState size="sm" variant="dotted" icon={query ? <SearchIcon /> : undefined} title={query ? 'Nenhuma pergunta encontrada.' : 'Nenhuma pergunta cadastrada ainda.'} />
                  </li>
                }
                {entries.map((entry) => {
                  const unanswered = !entry.answer.trim();
                  return (
                    <li key={entry.id} className="flex items-center gap-2 py-1">
                      <button type="button" className={`${clickableRowClass} min-w-0 flex-1`} onClick={() => openEntry(entry)}>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-text-primary">{entry.question}</span>
                            {unanswered && <StatusBadge status="warning" label="Sem resposta" />}
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-text-secondary">
                            {unanswered ? 'Não é usada até você responder.' : entry.answer}
                          </span>
                          {(() => {
                            // F-010: pergunta sobre assunto que tem cadastro próprio aponta para ele; contradição é avisada.
                            const topic = registryTopicOf(entry.question);
                            if (!topic) return null;
                            const conflict = entry.answer.trim() ? funcionamentoConflict(entry.question, entry.answer) : null;
                            return (
                              <span className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-text-primary">
                                {conflict && <StatusBadge status="warning" label="Contradiz o cadastro" />}
                                <span>{conflict ?? `A assistente responde este assunto por ${topic.label}; esta resposta não muda o cadastro.`}</span>
                              </span>);

                          })()}
                        </span>
                        <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton size="sm" aria-label={`Editar: ${entry.question}`} onClick={() => openEntry(entry)} icon={<PencilIcon className="h-4 w-4" aria-hidden="true" />} />
                        <IconButton size="sm" tone="danger" aria-label={`Remover: ${entry.question}`} onClick={() => setRemoving(entry)} icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} />
                      </div>
                    </li>);

                })}
              </ScrollList>
            </div>

            {suggestions.length > 0 &&
            <div className="mt-6 border-t border-border pt-5">
                <p className="text-sm font-semibold text-text-primary">Perguntas comuns em {segmentLabel}</p>
                <p className="mt-0.5 text-xs text-text-muted">Clique para adicionar e escrever a resposta.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((q) =>
                <Pill key={q} size="sm" addable onClick={() => addSuggestion(q)}>
                      {q}
                    </Pill>
                )}
                </div>
              </div>
            }
          </CardContent>
        </Card>

        <ServiceKnowledgeCard onOpen={setServiceOpen} />

        {/* Documentos */}
        <Card as="section" padding="lg" id="documentos" className="scroll-mt-6">
          <div className="flex items-center gap-1.5">
            <CardTitle as="h2">Documentos</CardTitle>
            <InfoTip
              label="Documentos"
              content="A assistente lê o texto do arquivo. Fotos, imagens e PDFs escaneados não são lidos: prefira arquivos com texto selecionável." />
            
          </div>
          <CardDescription>Envie arquivos que a sua recepção consulta para responder clientes.</CardDescription>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {DOC_GUIDE.map((g) =>
            <Card key={g.title} variant="muted" padding="sm">
                <p className="text-sm font-bold text-text-primary">{g.title}</p>
                <p className="mt-1 text-xs text-text-secondary">{g.text}</p>
              </Card>
            )}
          </div>

          <ul className="mt-5 flex flex-col gap-3">
            {draft.docs.length === 0 &&
            <li>
                <EmptyState size="sm" variant="dotted" title="Nenhum documento enviado." />
              </li>
            }
            {draft.docs.map((doc) => {
              const st = DOC_STATUS[doc.status ?? 'pronto'];
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-button bg-surface-muted text-primary">
                    <FileTextIcon className="h-icon-md w-icon-md" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-semibold text-text-primary">{doc.name}</p>
                    <p className="text-xs text-text-secondary">
                      <span className="tabular-nums">{doc.size}</span> · {st.text}
                    </p>
                  </div>
                  <StatusBadge status={st.tone} label={st.label} />
                  <IconButton size="sm" tone="danger" aria-label={`Remover ${doc.name}`} onClick={() => setRemovingDoc(doc)} icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} />
                </li>);

            })}
          </ul>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="sr-only"
            aria-label="Escolher documento"
            onChange={(e) => onFile(e.target.files?.[0])} />
          
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="md" leftIcon={<UploadIcon className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Anexar documento
            </Button>
            <span className="text-xs text-text-muted">PDF, Word (.docx) ou texto (.txt), até 10 MB</span>
          </div>
        </Card>
      </div>

      <StickySaveBar onSave={() => form.save()} saveError={form.saveError} />

      <EntryModal
        open={modalOpen}
        entry={editing}
        assistantName={atendimento.name}
        onClose={() => setModalOpen(false)}
        onSave={(question, answer) => {
          if (editing) {
            set(
              'items',
              draftRef.current.items.map((e) => e.id === editing.id ? { ...e, question, answer } : e)
            );
          } else {
            set('items', [{ id: `q-${Date.now()}`, question, answer }, ...draftRef.current.items]);
          }
        }} />
      

      <ConfirmDialog
        open={!!removing}
        danger
        title="Remover esta pergunta?"
        description={removing?.question}
        confirmLabel="Remover"
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          set(
            'items',
            draftRef.current.items.filter((e) => e.id !== removing.id)
          );
        }} />
      

      <ConfirmDialog
        open={!!removingDoc}
        danger
        title="Remover este documento?"
        description={removingDoc ? `${removingDoc.name} sai da lista e a assistente deixa de usar o conteúdo.` : undefined}
        confirmLabel="Remover"
        onClose={() => setRemovingDoc(null)}
        onConfirm={() => {
          if (!removingDoc) return;
          set(
            'docs',
            draftRef.current.docs.filter((d) => d.id !== removingDoc.id)
          );
        }} />
      
      <ServicoModal
        open={!!openedService}
        onClose={() => setServiceOpen(null)}
        editing={openedService}
        initialTab="assistente"
        categories={svc.categories}
        services={svc.services}
        members={team.members}
        hasHistory={(id) => {
          const name = svc.services.find((s) => s.id === id)?.name ?? '';
          return Object.values(getAgendaState().appointments).some((list) => list.some((a) => a.service === name));
        }}
        onManageCategories={() => setCategoriesOpen(true)}
        onSave={(s) => {
          const prosChanged = professionalLinkChanges(s);
          saveService(s);
          markConfigured('servico', s.id);
          prosChanged.forEach((id) => markConfigured('profissional', id));
          toast({ title: 'Serviço atualizado', description: 'O que a assistente explica deste serviço já vale para as respostas.' });
        }}
        onArchive={(id, active) => {
          setServiceActive(id, active);
          markConfigured('servico', id);
          toast({ title: active ? 'Serviço reativado' : 'Serviço arquivado', tone: 'info' });
        }} />
      
      <CategoriasModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        categories={svc.categories}
        services={svc.services}
        onSave={(list) => {
          setCategories(list);
          toast({ title: 'Categorias salvas' });
        }} />
      
    </AtendenteIaLayout>);

}