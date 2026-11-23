import { LoadErrorGate } from '../components/ui/LoadErrorGate';
import { useLoadFailure } from '../data/failures';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchIcon, UsersIcon } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Alert, BulkActionBar, Checkbox, EmptyState, InfoTip, SituationCards, StatusIcon } from '../components/Card';
import { PillGroup } from '../components/Pill';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Button } from '../components/Button';
import { ImportarPlanilhaModal } from '../components/modals/ImportarPlanilhaModal';
import { CaringCard, CaseRows, ClientPanel, NeedCard } from '../components/oportunidades/FollowUpParts';
import { useFollowUpActions } from '../components/oportunidades/useFollowUpActions';
import { MOTIVES, MOTIVE_LABEL, SITUATIONS, cardsOf, useFollowUp } from '../data/followUp';
import type { FollowUpCase, Motive, Situation } from '../data/followUp';
import { MOTIVE_AUTOMATION, automacoesStore, automations, savedSendWindows } from '../data/automacoes';
import type { AutomationMode } from '../data/automacoes';
import { useSavedStore } from '../data/iaConfigStore';
import { windowText } from '../data/sendWindows';
import { assistantStopNotice } from '../data/assistantStopNotice';
import { useSettings } from '../data/settingsStore';
import { useContactBlocks } from '../data/contactPreferences';
import { professionalOptions } from '../data/catalogo';
import { useClients } from '../data/api/clientes';
import { formatBRL } from '../utils/currency';
import { useScreenInit } from '../useScreenInit.js';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const one = (v: string | string[]) => Array.isArray(v) ? v[0] : v;

function useNarrow() {
  const query = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/**
 * A7 (Lote A, 21/10/2026). W4 (11/11/2026, A2-14): o número é o MESMO do cartão “Programados” (antes contava só quem tinha
 * mensagem depois dos 3 dias e não batia com o cartão).
 */
function laterText(n: number) {
  if (n === 0) return '';
  return `${n === 1 ? '1 cliente está' : `${n} clientes estão`} em “Programados”.`;
}

/**
 * Aviso ÚNICO do modo de envio (salvo em IA Orniplaty › Automações).
 * W8 (12/11/2026, passo 7, decisão G19): com o limite do mês atingido e o uso extra desligado, nada sai sozinho. No lugar
 * do aviso do modo entra o MESMO aviso do Início e de Conversas (`assistantStopNotice`, assunto `uso`), no padrão de
 * Conversas (Alert de erro com o botão do aviso). A frase do Automático lê os dias e o horário das campanhas que a clínica
 * salvou (`savedSendWindows().campaigns`).
 * W9a (12/11/2026, conferência final, J-06 e A2-22): o mesmo vale para o WhatsApp parado (assunto `whatsapp`): nos três
 * modos de envio, o aviso da assistente parada entra no lugar do aviso do modo. Com o WhatsApp parado nada sai pelo painel,
 * então a frase do modo (“Você aprova cada mensagem antes de sair”, “Envios pausados”) não aparece.
 * L9 (16/11/2026, etapa de facilidade de uso): título + UMA frase + o botão; o número de “Programados” foi para o “i”.
 * O aviso da assistente parada ficou como o L4 deixou.
 * L10 (16/11/2026): "Ligar envios" e "Ver regras" abrem Automações na seção "Chamar clientes de volta" (onde fica o modo).
 */
function ModeNotice({ mode, later }: {mode: AutomationMode;later: number;}) {
  const navigate = useNavigate();
  const go = () => navigate('/atendente-ia/automacoes?secao=chamar');
  const stopNotice = assistantStopNotice(useSettings());
  const laterTip = (label: string) => later > 0 ? <InfoTip label={label} content={laterText(later)} /> : null;
  if (stopNotice) {
    return (
      <Alert
        variant="error"
        title={stopNotice.title}
        actions={
        stopNotice.action &&
        <Button size="md" className="w-full sm:w-auto" onClick={() => navigate(stopNotice.action!.to)}>
              {stopNotice.action.label}
            </Button>

        }>
        
        {/* L4 (16/11/2026): a mesma frase curta do Início; o texto inteiro fica em Configurações. */}
        {stopNotice.short}
      </Alert>);

  }
  if (mode === 'pausado') {
    return (
      <Alert
        variant="info"
        title="Envios pausados."
        actions={
        <Button size="md" variant="neutral" onClick={go}>
            Ligar envios
          </Button>
        }>
        
        <span className="inline-flex flex-wrap items-center gap-x-1">
          <span>A Orniplaty não manda mensagens: os envios dos próximos 3 dias aparecem aqui, com a mensagem pronta para copiar.</span>
          {laterTip('Envios pausados')}
        </span>
      </Alert>);

  }
  if (mode === 'supervisionado') {
    return (
      <Alert variant="info" title="Você aprova cada mensagem antes de sair.">
        <span className="inline-flex flex-wrap items-center gap-x-1">
          <span>Aqui aparecem os envios dos próximos 3 dias, para aprovar.</span>
          {laterTip('Envios para aprovar')}
        </span>
      </Alert>);

  }
  return (
    <Alert
      variant="info"
      title={`A Orniplaty manda as mensagens sozinha, ${windowText(savedSendWindows().campaigns)}.`}
      actions={
      <Button size="md" variant="neutral" onClick={go}>
          Ver regras
        </Button>
      }>
      
      Aqui ficam só os clientes que precisam de você.
    </Alert>);

}

export function Oportunidades() {
  const screenInit = useScreenInit() as {opportunityDemo?: 'sem-clientes';opportunitySituation?: Situation;};
  // G1 (F-001): um cadastro só — "sem clientes" vem do cadastro vivo.
  const registeredClients = useClients();
  // L9: a entrada “Cliente pediu para não receber mensagens” some quando o pedido é registrado.
  useContactBlocks();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const narrow = useNarrow();
  const { mode, all, by, broughtBack, withScheduled } = useFollowUp();
  // L9: com a assistente parada (WhatsApp ou limite do mês), o cartão “Programados” diz que nada sai.
  const stopNotice = assistantStopNotice(useSettings());
  // Painel do cliente: conversa ao lado (computador) ou aba "Conversa" (celular). Lote A, 21/10/2026.
  const [chat, setChat] = useState(false);
  const [tab, setTab] = useState('cliente');
  const [openId, setOpenId] = useState<string | null>(null);
  const openPanel = (id: string) => {
    setChat(false);
    setTab('cliente');
    setOpenId(id);
  };
  const actions = useFollowUpActions({
    openConversation: (c) => {
      setOpenId(c.id);
      setChat(true);
      setTab('conversa');
    }
  });

  const paramMotive = params.get('aba') as Motive | null;
  const motiveFromUrl = paramMotive && MOTIVES.includes(paramMotive) ? paramMotive : null;
  // C1 (ajustes do Lote C, 21/10/2026): chegando com ?aba=<motivo> (ex.: o antigo Clientes › Retornos), abre em "Precisam de você"
  // se houver alguém DESSE motivo lá; senão, em "Programados" (como a tela Retornos fazia).
  const [situation, setSituation] = useState<Situation>(
    () => screenInit.opportunitySituation ?? ((motiveFromUrl ? by.precisa.some((c) => c.motive === motiveFromUrl) : by.precisa.length > 0) ? 'precisa' : 'cuidando')
  );
  // Até a pessoa escolher uma situação, ela acompanha os casos que chegam depois da 1ª pintura (carregamento direto).
  const pickedSituation = useRef(!!screenInit.opportunitySituation);
  const [motive, setMotive] = useState<'todos' | Motive>(motiveFromUrl ?? 'todos');
  // O filtro segue o endereço também quando ?aba muda com a tela já aberta.
  useEffect(() => {
    if (motiveFromUrl) setMotive(motiveFromUrl);
  }, [motiveFromUrl]);
  // Decisão 5B (21/10/2026, substitui a escolha do Lote C de esconder a pílula): com a campanha de um motivo desligada em
  // Automações, a pílula continua visível com "(desligada)" e, ao ser escolhida, mostra o aviso com "Abrir Automações".
  const saved = useSavedStore(automacoesStore);
  const isOff = (m: Motive) => saved.enabled[MOTIVE_AUTOMATION[m]] === false;
  const offCampaign = motive !== 'todos' && isOff(motive) ? automations.find((a) => a.id === MOTIVE_AUTOMATION[motive]) : undefined;
  const [pro, setPro] = useState('todos');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // ?caso=<id> (exato) ou ?cliente=<id> abre o painel do cliente (Ficha › Acompanhamento, Lote C).
  // Tenta de novo quando a lista muda: num carregamento direto os retornos chegam depois da primeira pintura.
  // W9a (12/11/2026, A2-21): abre UMA vez por navegação, e não uma vez só por visita à tela. Antes, um aviso do sino clicado
  // com Oportunidades já aberta mudava o endereço para ?caso=… e não abria nada. `location.key` muda a cada navegação,
  // mesmo para o mesmo endereço (clicar duas vezes no mesmo aviso abre de novo).
  const caseParam = params.get('caso');
  const clientParam = params.get('cliente');
  const deepKey = caseParam || clientParam ? `${location.key}|${caseParam ?? ''}|${clientParam ?? ''}` : null;
  const deepLinked = useRef<string | null>(null);
  useEffect(() => {
    if (!deepKey || deepLinked.current === deepKey) return;
    // Com ?caso, só o caso exato; ?cliente sozinho abre o caso MAIS URGENTE dele (o do cartão, F-008).
    const hit = caseParam ? all.find((c) => c.id === caseParam) : cardsOf(all.filter((c) => c.clientId === clientParam))[0];
    if (hit) {
      deepLinked.current = deepKey;
      pickedSituation.current = true;
      setSelected([]);
      setSituation(hit.situation);
      openPanel(hit.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, deepKey]);

  const matches = (c: FollowUpCase) =>
  (motive === 'todos' || c.motive === motive) && (
  pro === 'todos' || c.professionalId === pro) && (
  query.trim().length < 2 || normalize(c.clientName).includes(normalize(query.trim())));
  // F-008: UM cartão por cliente, o caso mais urgente DENTRO dos filtros (situação, depois data).
  // G4 (F-066): erro recuperável da lista (seletor de telas › Falha ao carregar listas).
  const listLoad = useLoadFailure('oportunidades');
  // W4 (11/11/2026, A2-12): Resolvidos = um cartão por cliente ENTRE os casos resolvidos (mesma regra de `useFollowUp`), para
  // a lista bater com “Trouxe de volta” (antes, quem tinha outro caso em aberto sumia de Resolvidos).
  const filteredCards = useMemo(
    () => [...cardsOf(all.filter(matches)).filter((c) => c.situation !== 'resolvidos'), ...cardsOf(all.filter((c) => matches(c) && c.situation === 'resolvidos'))],
    [all, motive, pro, query] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const order = (s: Situation) => by[s].map((c) => c.clientId);
  const rows = useMemo(() => {
    const list = filteredCards.filter((c) => c.situation === situation);
    const pos = new Map(order(situation).map((id, i) => [id, i]));
    return list.sort((a, b) => (pos.get(a.clientId) ?? 999) - (pos.get(b.clientId) ?? 999));
  }, [filteredCards, situation, by]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries(SITUATIONS.map((s) => [s.value, filteredCards.filter((c) => c.situation === s.value).length])) as Record<Situation, number>, [filteredCards]);

  useEffect(() => {
    if (pickedSituation.current || !motiveFromUrl) return;
    const want: Situation = counts.precisa > 0 ? 'precisa' : 'cuidando';
    if (want !== situation) setSituation(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts.precisa]);

  const approvable = situation === 'precisa' ? rows.filter((c) => c.need?.kind === 'aprovacao') : [];
  const chosen = approvable.filter((c) => selected.includes(c.id));
  useEffect(() => {
    setSelected((s) => s.filter((id) => approvable.some((c) => c.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvable.map((c) => c.id).join('|')]);

  // O painel mostra o caso aberto e, em "Também acompanha", os outros casos do mesmo cliente.
  const openBase = all.find((c) => c.id === openId) ?? null;
  const openCase = openBase ? { ...openBase, others: all.filter((c) => c.clientId === openBase.clientId && c.id !== openBase.id) } : null;
  const noClients = registeredClients.length === 0 || screenInit.opportunityDemo === 'sem-clientes';
  const filtered = motive !== 'todos' || pro !== 'todos' || query.trim().length >= 2;
  /*
   * L12 (17/11/2026): as linhas de apoio de "Programados" e "Resolvidos" contam TODOS os clientes (não seguem a busca, o
   * motivo nem o profissional). Com algum filtro aplicado, a linha começa com "Sem os filtros:", para não parecer que fala
   * do número filtrado logo acima. Nada muda no que é contado.
   */
  const totalPrefix = filtered ? 'Sem os filtros: ' : '';

  // L22b (17/11/2026, pedido do Christian): a frase "Trouxe de volta…" saiu do cartão Resolvidos e do aviso do celular.
  // Os números continuam em `broughtBack` (useFollowUp); nada mudou no que é contado.
  // L9 (16/11/2026): cada número diz o que conta (clientes: um cartão por cliente, F-008).
  // L21 (17/11/2026, V5 T11): com a assistente parada (WhatsApp desconectado ou limite do mês), a linha não promete envio;
  // usa a MESMA fonte do aviso vermelho (`assistantStopNotice`), como a linha de “Programados”.
  const precisaText =
  mode === 'automatico' ?
  by.precisa.length === 0 ?
  'Nenhum cliente para decidir agora' :
  'Clientes que pedem uma decisão sua' :
  stopNotice ?
  `Clientes para decidir; nada sai ${stopNotice.subject === 'whatsapp' ? 'até conectar o WhatsApp' : 'porque o limite do mês acabou'}` :
  'Clientes para enviar nos próximos 3 dias ou decidir';
  /*
   * L12: o número grande conta os clientes em "Programados"; a linha conta quantos DELES têm mensagem programada. Coisas
   * diferentes, então a linha diz "N de M" (antes: "4 clientes com mensagem programada" embaixo do 5).
   */
  const scheduledText =
  withScheduled === 0 ?
  'nenhum cliente com mensagem programada agora' :
  withScheduled === by.cuidando.length ?
  `${by.cuidando.length === 1 ? 'o cliente tem' : `os ${by.cuidando.length} clientes têm`} mensagem programada` :
  `${withScheduled} de ${by.cuidando.length} clientes com mensagem programada`;
  const cuidandoText = stopNotice ?
  `Nada sai para estes clientes: ${stopNotice.subject === 'whatsapp' ? 'o WhatsApp não está conectado' : 'o limite do mês acabou'}` :
  // F-025: só diz "com mensagem programada" quando existem.
  `${totalPrefix}${filtered ? scheduledText : scheduledText.charAt(0).toUpperCase() + scheduledText.slice(1)}`;

  return (
    <DashboardLayout activeId="oportunidades" title="Oportunidades" subtitle="A Orniplaty chama de volta quem precisa voltar. Aqui ficam os clientes que precisam de você.">
      {noClients ?
      <div className="mt-6">
          <EmptyState
          variant="dotted"
          size="lg"
          icon={<UsersIcon />}
          title="Ainda não há clientes para acompanhar."
          description="Importe sua lista de clientes e a Orniplaty começa a cuidar de quem precisa voltar."
          primaryAction={{ label: 'Importar clientes', onClick: () => setImporting(true) }} />
        
          <ImportarPlanilhaModal open={importing} onClose={() => setImporting(false)} onImported={() => navigate('/clientes')} />
        </div> :

      <div className="mt-4 flex flex-col gap-4">
          <ModeNotice mode={mode} later={counts.cuidando} />

          {/* A2/A1 (Lote A, 21/10/2026; DS v3.10): os 3 cartões do topo SÃO a troca da lista. Números com os filtros. */}
          <SituationCards
          label="Situação"
          value={situation}
          onChange={(v: string) => {
            setSelected([]);
            pickedSituation.current = true;
            setSituation(v as Situation);
          }}
          compact={narrow}
          options={[
          { value: 'precisa', label: 'Precisam de você', shortLabel: 'Precisam de você', count: counts.precisa, description: precisaText },
          {
            value: 'cuidando',
            // W4 (11/11/2026, G8): “A Orniplaty está cuidando” passa a “Programados”; cada cartão diz quem age.
            label: 'Programados',
            shortLabel: 'Programados',
            count: counts.cuidando,
            description: cuidandoText
          },
          { value: 'resolvidos', label: 'Resolvidos', count: counts.resolvidos, description: 'Clientes resolvidos nos últimos 30 dias' }]
          } />
        

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Motivo">
              <PillGroup
              size="sm"
              value={motive}
              onChange={(v: string | string[]) => {
                pickedSituation.current = true;
                setMotive(one(v) as 'todos' | Motive);
              }}
              options={[{ value: 'todos', label: 'Todos' }, ...MOTIVES.map((m) => ({ value: m, label: isOff(m) ? `${MOTIVE_LABEL[m]} (desligada)` : MOTIVE_LABEL[m] }))]} />
            
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
              ariaLabel="Profissional"
              value={pro}
              onChange={(v: string) => setPro(v)}
              options={[{ value: 'todos', label: 'Todos os profissionais' }, ...professionalOptions]}
              containerClassName="w-full sm:w-60" />
            
              <div className="w-full sm:w-64">
                <Input
                aria-label="Buscar cliente"
                placeholder="Buscar cliente"
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                prefix={<SearchIcon className="h-4 w-4" aria-hidden="true" />} />
              
              </div>
            </div>
          </div>

          {offCampaign &&
        <Alert
          variant="info"
          title={`A campanha "${offCampaign.name}" está desligada.`}
          actions={
          <Button size="md" variant="neutral" onClick={() => navigate(`/atendente-ia/automacoes?campanha=${encodeURIComponent(offCampaign.id)}`)}>
                  Abrir Automações
                </Button>
          }>
          
              {/* L9: uma frase; o resto no “i”. */}
              <span className="inline-flex flex-wrap items-center gap-x-1">
                <span>A Orniplaty não chama clientes por este motivo enquanto ela estiver desligada.</span>
                <InfoTip label="Campanha desligada" content="Quem já foi resolvido continua em Resolvidos." />
              </span>
            </Alert>
        }

          {listLoad.failed ?
        <LoadErrorGate k="oportunidades" what="as oportunidades">
              {null}
            </LoadErrorGate> :
        rows.length === 0 ?
        offCampaign ? null : motive === 'retorno' && situation === 'cuidando' && pro === 'todos' && query.trim().length < 2 ?
        // C1 (21/10/2026): o vazio que só existia em Clientes › Retornos veio para cá (decisão do Christian).
        <EmptyState
          variant="dotted"
          title="Nenhum retorno em andamento."
          description="Os retornos começam quando um atendimento de serviço com retorno é fechado sem horário marcado."
          primaryAction={{ label: 'Ver retornos em Serviços e equipe', onClick: () => navigate('/servicos-equipe?aba=servicos') }} /> :

        filtered ?
        <EmptyState
          variant="dotted"
          title="Ninguém com esses filtros nesta situação."
          description="Troque o motivo, o profissional ou a busca."
          primaryAction={{
            label: 'Limpar filtros',
            onClick: () => {
              setMotive('todos');
              setPro('todos');
              setQuery('');
            }
          }} /> :

        situation === 'precisa' ?
        <EmptyState variant="dotted" title="Ninguém precisa de você agora." description="Quando a Orniplaty não conseguir resolver sozinha, o cliente aparece aqui." primaryAction={{ label: 'Ver Programados', onClick: () => setSituation('cuidando') }} /> :
        situation === 'cuidando' ?
        <EmptyState variant="dotted" title="Nenhum cliente em Programados agora." description="Quem sair de um atendimento sem retorno marcado aparece aqui, com as mensagens programadas e quem envia cada uma." /> :

        <EmptyState variant="dotted" title="Nenhum cliente resolvido nos últimos 30 dias." description="Quem voltar, agendar ou for encerrado aparece aqui." /> :

        situation === 'precisa' ?
        <div className={`flex flex-col gap-3 ${chosen.length > 0 ? 'pb-24 md:pb-0' : ''}`}>
              {approvable.length > 1 &&
          <Checkbox
            label="Selecionar todas as aprovações"
            checked={chosen.length === approvable.length}
            indeterminate={chosen.length > 0 && chosen.length < approvable.length}
            onChange={(v: boolean) => setSelected(v ? approvable.map((c) => c.id) : [])} />

          }
              {rows.map((c) =>
          <NeedCard
            key={c.id}
            c={c}
            mode={mode}
            actions={actions}
            onOpen={(x) => openPanel(x.id)}
            selectable={c.need?.kind === 'aprovacao'}
            selected={selected.includes(c.id)}
            onSelect={(v) => setSelected((s) => v ? [...s.filter((id) => id !== c.id), c.id] : s.filter((id) => id !== c.id))} />

          )}
            </div> :
        situation === 'cuidando' ?
        <div className="flex flex-col gap-3">
              {rows.map((c) =>
          <CaringCard key={c.id} c={c} mode={mode} actions={actions} onOpen={(x) => openPanel(x.id)} />
          )}
            </div> :

        <>
              <CaseRows rows={rows} mode={mode} actions={actions} onOpen={(x) => openPanel(x.id)} />
              <p className="text-sm text-text-muted">Ficam aqui por 30 dias. Depois, só na ficha do cliente.</p>
            </>
        }

          <BulkActionBar
          count={chosen.length}
          label={plural(chosen.length, 'aprovação selecionada', 'aprovações selecionadas')}
          actions={
          <>
                <Button size="md" variant="neutral" onClick={() => setSelected([])}>
                  Limpar
                </Button>
                <Button
              size="md"
              onClick={() => {
                actions.approve(chosen);
                setSelected([]);
              }}>
              
                  Aprovar selecionadas
                </Button>
              </>
          } />
        

          <ClientPanel
          c={openCase}
          mode={mode}
          actions={actions}
          onClose={() => setOpenId(null)}
          onOpenCase={(id) => setOpenId(id)}
          chat={chat}
          onChat={setChat}
          tab={tab}
          onTab={setTab}
          narrow={narrow} />
        
          {actions.modals}
        </div>
      }
    </DashboardLayout>);

}