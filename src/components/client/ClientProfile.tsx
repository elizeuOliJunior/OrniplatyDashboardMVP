import React, { useState } from 'react';
import { BriefcaseIcon, CakeIcon, CalendarCheckIcon, CalendarClockIcon, CalendarIcon, CalendarPlusIcon, ChevronDownIcon, CopyIcon, HeartPulseIcon, MailIcon, MapPinIcon, MegaphoneIcon, MessageCircleIcon, PencilIcon, PhoneIcon, TagIcon } from 'lucide-react';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { Card } from '../Card';
import { EmptyState } from '../EmptyState';
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_TONE,
  ContextOpenArea,
  ContextPanel,
  ContextSection,
  IconButton,
  ReminderStatusRow,
  StatStrip,
  StatStripItem,
  StatusBadge,
  useToast } from
'../Card';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { ContatoInfoTip, ContatoSection } from './ContatoCard';
import { TagBadge } from './ClientHeader';
import { NotesField } from './NotesField';
import type { AppointmentResponse, ClientProfileResponse } from '../../data/api/clientes';
import { firstContactChannelLabel } from '../../data/api/clientes';
import { VAZIO, contatos, dataBR } from '../../data/fichaLib';
import { brl, useFinanceEntries } from '../../data/convenios';
import { clientOpenAmount } from '../../data/financeReaders';
import { useClientIdentityLine } from '../../data/clientAge';
import { TODAY_ISO, mediumDayLabel } from '../../data/agendaStore';
import { setAppointmentStatus } from '../../data/agendaLive';
import { markConfirmedByTeam, reminderOf, reminderRow, useRemindersVersion } from '../../data/reminders';
import { conversationLink } from '../../data/deepLinks';
import { ARCHIVED_NO_BOOKING } from '../../data/archivedClients';
import { rollCallsOfClient, useAulasVersion } from '../../data/aulas';
import { remindersBlockedOf, useContactBlocks } from '../../data/contactPreferences';

/*
 * Ficha do cliente reorganizada (11/11/2026, pedido do Christian, referência: ficha de paciente do Tend).
 * Peças do Painel/DS reaproveitadas: `ContextPanel`/`ContextSection` (cartão do cliente, como a ficha resumida de
 * Conversas), `ContextOpenArea`, `ReminderStatusRow`, `StatusBadge`, `IconButton` (copiar número), `EmptyState`.
 * Rodada 2: cartão do cliente como o do Tend (avatar, nome, copiar número, tags + Editar), data em barra lateral.
 * Rodada 3 (11/11, Christian): o cartão "WhatsApp" saiu; o botão "Abrir conversa no WhatsApp" fica logo abaixo do
 * número. O cartão Cadastro saiu: as informações principais do cadastro ficam à vista no cartão do cliente, as
 * observações também, e "Editar" (ao lado do nome) abre o cadastro inteiro. Sem próximo agendamento: aviso + "Agendar".
 * Rodada 4 (11/11, Christian): "Ver na agenda" fica logo abaixo da situação (Confirmado etc.), dentro do bloco do horário.
 * Rodada 5 (11/11, Christian, DS v4.5): os 4 números saíram do cabeçalho e viraram UM cartão dividido (`StatStrip`,
 * como o Tend), no alto da coluna da direita, com uma linha curta embaixo de cada número.
 * Rodada 6 (11/11, Christian, DS v4.7): sem o título com o nome no topo da página (o nome já está no cartão, que
 * agora é o h1 da página); "Primeiro contato" e "Origem" viraram linhas do cartão; "Abrir conversa no WhatsApp" voltou
 * ao azul (`primary`); cartão de números compacto e sem "i".
 * L7 (16/11/2026, etapa de facilidade de uso): "Preferência de contato" sobe para logo abaixo do WhatsApp; campos
 * "Não informado." ficam atrás de um botão `neutral sm` com `aria-expanded`; o "Agendar" do aviso sem próximo
 * agendamento vira `secondary` (o cheio é só o do topo da página). Nada foi apagado.
 * L8 (17/11/2026, só texto): sem próximo agendamento e com os lembretes bloqueados pelo pedido de saída
 * (`remindersBlockedOf`, o mesmo estado que "Preferência de contato" mostra como "Não recebe"), a frase "O lembrete sai
 * sozinho se estiver ligado." vira "{nome} não recebe lembretes de horário.". Com os lembretes de volta, a frase de antes.
 * L22 (17/11/2026, remoção pedida pelo Christian): saiu o botão "Agendar" do fim da coluna da esquerda. O "Agendar" do
 * topo da Ficha e o do aviso "Nenhum agendamento futuro" continuam. A prop `onAgendar` do cartão fica aceita (sem uso).
 * L22 (DS 6.1): o vazio "Nenhum agendamento futuro" usa `EmptyState variant="dotted"`.
 */

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
/** "Hoje, 01/10 · 10:30" · "Amanhã, 02/10 · 09:00" · "Sexta, 09/10 · 14:00" (mesmo texto da ficha resumida de Conversas). */
function whenLabel(iso: string, time: string) {
  const weekday = mediumDayLabel(iso).split(', ')[0];
  const day = iso === TODAY_ISO ? 'Hoje' : iso === addDays(TODAY_ISO, 1) ? 'Amanhã' : weekday.replace(/-feira$/i, '');
  return `${day}, ${dm(iso)} · ${time.slice(0, 5)}`;
}
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
function dateTile(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { mes: MESES[m - 1], dia: String(d), semana: SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

/** Profissional com a cor dele (mesmo ponto colorido da Agenda). */
function Professional({ p }: {p?: {name: string;color?: string;} | null;}) {
  if (!p) return null;
  return (
    <span className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
      {p.name}
    </span>);

}

/**
 * Soma do que falta receber deste cliente: lançamentos em aberto + convênio + coparticipação + atendimento particular.
 * W9f (12/11/2026): a conta mora em `clientOpenAmount` (data/financeReaders.ts), a mesma que "A receber de clientes" de
 * Resultados usa. A Ficha mostra `fichaCents` (com o que o convênio deve); Resultados mostra `clientCents` (sem ele).
 */
function useOpenAmount(ficha: ClientProfileResponse) {
  const open = clientOpenAmount(ficha.client.id, useFinanceEntries());
  return { cents: open.fichaCents, semValor: open.pendingNoValue };
}

/**
 * Rodada 5/6 (Christian, referência Tend): os 4 números num cartão só (`StatStrip`), no alto da coluna da direita.
 * Linha curta embaixo de cada número, sempre um fato dos dados (nada inventado). Sem "i" (decisão do Christian,
 * rodada 6): a linha de baixo explica o número.
 * Faltas em 12 meses: contadas na lista de atendimentos da ficha (mesma limitação anotada em Conversas para o T2).
 * "Em aberto" = lançamentos em aberto + convênio + coparticipação + atendimentos em aberto (detalhe no Financeiro).
 */
export function ClientNumbers({ ficha }: {ficha: ClientProfileResponse;}) {
  const { client } = ficha;
  const { cents, semValor } = useOpenAmount(ficha);
  // G4 (CONTRATO NOVO, aulas em grupo, 23/11/2026): cada Presente numa chamada é um atendimento e cada Faltou é uma falta
  // (mesma regra de Resultados, data/aulas.ts `rollCallAttendances`).
  useAulasVersion();
  const aulas = rollCallsOfClient(client.id);
  const aulasPresente = aulas.filter((x) => x.mark === 'presente');
  const fromIso = addDays(TODAY_ISO, -365);
  const faltasLista = [
  ...ficha.atendimentos.filter((a) => a.status === 'no_show').map((a) => a.date),
  ...aulas.filter((x) => x.mark === 'faltou').map((x) => x.aula.iso)].
  filter((d) => d >= fromIso && d <= TODAY_ISO);
  const faltas = faltasLista.length;
  const ultimaFalta = faltasLista.sort().pop();
  const ultimoAgenda = ficha.ultimo_atendimento;
  const ultimaAula = aulasPresente[0]?.aula;
  const ultimo =
  ultimaAula && (!ultimoAgenda || ultimaAula.iso + ultimaAula.start > ultimoAgenda.date + ultimoAgenda.start_time) ?
  { date: ultimaAula.iso, service: { name: ultimaAula.serviceName } } :
  ultimoAgenda;
  const atendimentos = client.completed_appointments + aulasPresente.length;
  const primeiroContato = client.first_contact_at;
  const pendente = cents > 0 || semValor > 0;
  const abertoDetalhe = cents > 0 ? 'Detalhe no Financeiro' : semValor > 0 ? semValor === 1 ? '1 pendência sem valor' : `${semValor} pendências sem valor` : 'Nada pendente';
  const atendDetalhe = atendimentos === 0 ? 'Nenhum realizado' : primeiroContato ? `Desde ${dataBR(primeiroContato)}` : 'Realizados';

  return (
    <StatStrip label={`Resumo de ${client.name}`}>
      <StatStripItem label="Atendimentos" value={atendimentos} detail={atendDetalhe} />
      <StatStripItem label="Faltas · 12 meses" value={faltas} detail={ultimaFalta ? `Última em ${dataBR(ultimaFalta)}` : 'Nenhuma falta'} />
      <StatStripItem
        label="Último atendimento"
        value={ultimo ? dataBR(ultimo.date) : '—'}
        unavailable={ultimo ? undefined : 'Nenhum atendimento'}
        detail={ultimo ? ultimo.service?.name ?? 'Sem procedimento registrado' : undefined} />
      
      <StatStripItem label="Em aberto" value={brl(cents)} tone={pendente ? 'warning' : 'default'} detail={abertoDetalhe} />
    </StatStrip>);

}

type Row = {key: string;icon: React.ReactNode;label: string;value: string;empty?: boolean;breakAll?: boolean;copy?: boolean;after?: React.ReactNode;};

/**
 * Cartão do cliente (coluna da esquerda), no padrão da ficha resumida de Conversas (`ContextPanel`), com a estrutura da
 * ficha do Tend. Rodada 3 (Christian): é também o cadastro.
 * - Topo: avatar 64 px + nome (h1 da página desde a rodada 6) + idade/sexo e "Editar" ao lado do nome.
 * - WhatsApp (copiar + "Abrir conversa no WhatsApp" logo abaixo, azul) e telefone (só se for outro número, com copiar).
 * - L7: "Preferência de contato" logo abaixo do WhatsApp (à vista sem rolar a 1440 × 800). L19 (17/11, Christian): volta
 *   para baixo do Cadastro ("Ver campos vazios" incluído).
 * - Demais informações do cadastro: e-mail, nascimento, profissão, cidade, contato de emergência, primeiro contato e
 *   origem. L7: as preenchidas ficam à vista; as "Não informado." ficam atrás de "Ver campos vazios · N".
 * - Tags + Editar · Observações (salvam sozinhas). L22: sem "Agendar" no fim (pedido do Christian).
 * Arquivado: só consulta (sem Editar e Editar tags; observações só leitura).
 */
export function ClientCard({
  ficha,
  archived,
  onEditTags,
  onEditarCadastro,
  registerSignal = 0









}: {ficha: ClientProfileResponse;archived: boolean;onEditTags?: () => void; /** L22: sem uso no cartão (o botão do fim saiu); aceito para não quebrar quem passa. */onAgendar?: () => void;onEditarCadastro?: () => void; /** L7: repassado à `ContatoSection` (menu "⋯" da Ficha abre o mesmo registro). */registerSignal?: number;}) {
  const navigate = useGuardedNavigate();
  const toast = useToast();
  const { client } = ficha;
  const identity = useClientIdentityLine(client.id);
  const tels = contatos(client.phone, client.landline_phone);
  const cidade = [client.city, client.state].filter(Boolean).join('/');
  const emergencia = client.emergency_contact_name ?
  [`${client.emergency_contact_name}${client.emergency_contact_relation ? ` (${client.emergency_contact_relation})` : ''}`, client.emergency_contact_phone].filter(Boolean).join(' · ') :
  '';
  const [vaziosAbertos, setVaziosAbertos] = useState(false);
  const vaziosId = `campos-vazios-${client.id}`;

  const copiar = async (numero: string) => {
    try {
      await navigator.clipboard.writeText(numero);
      toast({ title: 'Número copiado', description: numero, tone: 'success' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'O navegador bloqueou a cópia. Selecione o número e copie.', tone: 'warning' });
    }
  };
  const vazio = (v: string | null | undefined) => ({ value: v || VAZIO.campo, empty: !v });

  const phoneRows: Row[] = tels.map((t) => ({
    key: t.rotulo,
    icon: t.rotulo === 'WhatsApp' ? <WhatsAppIcon className="h-4 w-4" /> : <PhoneIcon className="h-4 w-4" aria-hidden="true" />,
    label: t.rotulo,
    value: t.valor,
    copy: true,
    after:
    t.rotulo === 'WhatsApp' ?
    <Button size="md" fullWidth leftIcon={<WhatsAppIcon className="h-4 w-4" />} onClick={() => navigate(conversationLink(client.id))}>
          Abrir conversa no WhatsApp
        </Button> :
    undefined
  }));
  const fieldRows: Row[] = [
  { key: 'email', icon: <MailIcon className="h-4 w-4" aria-hidden="true" />, label: 'E-mail', ...vazio(client.email), breakAll: !!client.email },
  { key: 'nascimento', icon: <CakeIcon className="h-4 w-4" aria-hidden="true" />, label: 'Nascimento', ...vazio(dataBR(client.birth_date)) },
  { key: 'profissao', icon: <BriefcaseIcon className="h-4 w-4" aria-hidden="true" />, label: 'Profissão', ...vazio(client.occupation) },
  { key: 'cidade', icon: <MapPinIcon className="h-4 w-4" aria-hidden="true" />, label: 'Cidade', ...vazio(cidade) },
  { key: 'emergencia', icon: <HeartPulseIcon className="h-4 w-4" aria-hidden="true" />, label: 'Emergência', ...vazio(emergencia) },
  { key: 'primeiro-contato', icon: <CalendarClockIcon className="h-4 w-4" aria-hidden="true" />, label: 'Primeiro contato', ...vazio(client.first_contact_at ? dataBR(client.first_contact_at) : null) },
  // W5 (G11): antigo "Consentimento · Origem" do formulário. É o canal do primeiro contato, só leitura; não é consentimento.
  { key: 'primeiro-contato-por', icon: <MessageCircleIcon className="h-4 w-4" aria-hidden="true" />, label: 'Primeiro contato por', ...vazio(firstContactChannelLabel(client.consent_source)) },
  { key: 'origem', icon: <MegaphoneIcon className="h-4 w-4" aria-hidden="true" />, label: 'Origem', ...vazio(client.origin?.name) }];

  const filled = fieldRows.filter((r) => !r.empty);
  const empty = fieldRows.filter((r) => r.empty);

  const renderRow = (r: Row) =>
  <div key={r.key} className="flex flex-col gap-2 py-1.5">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <dt className="flex shrink-0 items-center gap-2 text-text-secondary">
          <span className="text-text-muted" aria-hidden="true">
            {r.icon}
          </span>
          {r.label}
        </dt>
        <dd className="flex min-w-0 items-center justify-end gap-1">
          <span className={`min-w-0 text-right tabular-nums ${r.breakAll ? 'break-all' : 'break-words'} ${r.empty ? 'text-text-muted' : 'font-semibold text-text-primary'}`}>{r.value}</span>
          {r.copy && <IconButton size="sm" aria-label={`Copiar ${r.label === 'WhatsApp' ? 'número do WhatsApp' : 'telefone'} de ${client.name}`} icon={<CopyIcon className="h-4 w-4" />} onClick={() => copiar(r.value)} />}
        </dd>
      </div>
      {r.after && <div className="pb-1">{r.after}</div>}
    </div>;


  return (
    <ContextPanel label={`Cartão de ${client.name}`}>
      <ContextSection>
        <div className="flex items-start gap-4">
          <Avatar name={client.name} size="xl" />
          <div className="min-w-0 flex-1 self-center">
            <h1 className="break-words text-lg font-bold leading-tight text-text-primary">{client.name}</h1>
            {identity && <p className="mt-0.5 text-sm text-text-secondary">{identity}</p>}
          </div>
          {onEditarCadastro && !archived &&
          <Button size="sm" variant="neutral" className="shrink-0" leftIcon={<PencilIcon className="h-4 w-4" />} aria-label={`Editar cadastro de ${client.name}`} onClick={onEditarCadastro}>
              Editar
            </Button>
          }
        </div>
        {phoneRows.length > 0 && <dl className="mt-1 flex flex-col divide-y divide-border">{phoneRows.map(renderRow)}</dl>}
      </ContextSection>

      <ContextSection title="Cadastro">
        {filled.length > 0 && <dl className="flex flex-col divide-y divide-border">{filled.map(renderRow)}</dl>}
        {empty.length > 0 &&
        <div>
            <Button
            size="sm"
            variant="neutral"
            aria-expanded={vaziosAbertos}
            aria-controls={vaziosId}
            onClick={() => setVaziosAbertos((v) => !v)}
            rightIcon={<ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${vaziosAbertos ? 'rotate-180' : ''}`} aria-hidden="true" />}>
            
              {`Ver campos vazios · ${empty.length}`}
            </Button>
            {vaziosAbertos &&
          <dl id={vaziosId} className="mt-1 flex flex-col divide-y divide-border">
                {empty.map(renderRow)}
              </dl>
          }
          </div>
        }
      </ContextSection>

      {/* L19 (17/11/2026, pedido do Christian): "Preferência de contato" volta para baixo do Cadastro. Contraponto
           registrado: o L7 tinha subido este bloco porque "cliente não quer mensagens" foi tarefa em que as pessoas
           falharam em 12/11. O "⋯" da Ficha e os links de Oportunidades e Lista de espera continuam abrindo a confirmação. */}
      {/* L23 (18/11/2026): "i" do título na linha do título (o `title` da ContextSection só aceita texto; o "i" vai no `action`). */}
      <ContextSection title="Preferência de contato" action={<ContatoInfoTip />}>
        <ContatoSection clientId={client.id} clientName={client.name} archived={archived} registerSignal={registerSignal} />
      </ContextSection>

      <ContextSection
        title="Tags"
        action={
        onEditTags && !archived ?
        <Button size="sm" variant="neutral" leftIcon={<TagIcon className="h-4 w-4" />} aria-label={`Editar tags de ${client.name}`} onClick={onEditTags}>
              Editar
            </Button> :
        undefined
        }>
        
        {client.tag_items.length ?
        <div className="flex flex-wrap gap-1.5" aria-label="Tags do cliente">
            {client.tag_items.map((t) =>
          <TagBadge key={t.id} tag={t} />
          )}
          </div> :

        <p className="text-text-muted">Nenhuma tag.</p>
        }
      </ContextSection>

      <ContextSection title="Observações">
        <NotesField key={client.id} clientId={client.id} notes={client.notes ?? ''} readOnly={archived} />
      </ContextSection>
    </ContextPanel>);

}

/**
 * Próximo agendamento (rodada 2, Christian, referência Tend): a data fica numa barra lateral (mês · dia · dia da semana)
 * dentro do bloco do horário. A área do horário abre o MESMO detalhe da Agenda; a linha do lembrete fica no mesmo bloco.
 * Peça nova só desta tela (a barra da data); se for usada em outra tela, levar ao DS.
 * Rodada 3: sem próximo agendamento, `EmptyState` com ícone, frase e "Agendar" (como o Tend). Altura = conteúdo.
 * L7: esse "Agendar" é `secondaryAction` (contorno); o único "Agendar" cheio da Ficha é o do topo da página.
 * L8: com os lembretes bloqueados pelo pedido de saída, a frase do lembrete diz que o cliente não recebe lembretes.
 * Rodada 4: a situação (Confirmado etc.) e "Ver na agenda" ficam juntas: no computador, uma embaixo da outra à direita
 * do horário; no celular, lado a lado embaixo do horário. Fora da área clicável (um botão não pode ficar dentro de outro).
 */
export function NextAppointmentCard({ ficha, onAbrir, onAgendar }: {ficha: ClientProfileResponse;onAbrir: (a: AppointmentResponse) => void;onAgendar?: () => void;}) {
  useRemindersVersion();
  useContactBlocks();
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const next = ficha.proximo_agendamento;
  const name = ficha.client.name;
  const archived = !!ficha.client.archived_at;
  const recordedName = next?.cal?.appt.clientName ?? name;
  const rem = next ? reminderRow(reminderOf(next.date, recordedName, next.start_time), next.date) : null;
  const nextStatus = next ? next.cal?.appt.status ?? (next.status === 'scheduled' ? 'pending_confirmation' : next.status) : undefined;
  const confirmFromMessage = () => {
    if (!next?.cal) return;
    setAppointmentStatus(next.cal.iso, next.cal.appt.id, 'confirmed');
    markConfirmedByTeam(next.date, recordedName, next.start_time);
    toast({ title: 'Horário confirmado', description: `${name} · ${whenLabel(next.date, next.start_time)}. Nenhuma mensagem foi enviada ao cliente.` });
  };
  const tile = next ? dateTile(next.date) : null;
  const primeiroNome = name.split(' ')[0];
  // L8: mesmo estado do cartão "Preferência de contato" (Lembretes de horário · Não recebe).
  const remindersBlocked = remindersBlockedOf(ficha.client.id);
  const reminderSentence = remindersBlocked ? `${primeiroNome} não recebe lembretes de horário.` : 'O lembrete sai sozinho se estiver ligado.';

  return (
    <Card as="section" padding="lg" aria-labelledby="ficha-proximo-titulo" className="flex flex-col gap-3">
      <h2 id="ficha-proximo-titulo" className="flex items-center gap-2 text-base font-bold text-text-primary">
        <CalendarCheckIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        Próximo agendamento
      </h2>
      {next && tile ?
      <div className="flex min-w-0 gap-3 rounded-inner border border-border bg-surface p-2">
          <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xs bg-primary-soft py-2 text-primary" aria-hidden="true">
            <span className="text-xs font-bold tracking-wide">{tile.mes}</span>
            <span className="text-2xl font-extrabold leading-7 tabular-nums">{tile.dia}</span>
            <span className="text-xs font-bold tracking-wide">{tile.semana}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pr-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <ContextOpenArea onOpen={() => onAbrir(next)} label={`Ver detalhes do agendamento: ${whenLabel(next.date, next.start_time)}${next.service ? `, ${next.service.name}` : ''}`}>
                  <span className="block min-w-0">
                    <span className="block text-base font-bold leading-6 text-text-primary">{whenLabel(next.date, next.start_time)}</span>
                    {next.service && <span className="block text-sm text-text-secondary">{next.service.name}</span>}
                    <Professional p={next.professional} />
                  </span>
                </ContextOpenArea>
              </div>
              {(nextStatus || next.cal) &&
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:pt-1">
                  {nextStatus && <StatusBadge status={APPOINTMENT_STATUS_TONE[nextStatus] ?? 'neutral'} label={APPOINTMENT_STATUS_LABEL[nextStatus] ?? nextStatus} />}
                  {next.cal &&
              <Button size="sm" variant="secondary" onClick={() => navigate(`/agenda?data=${next.cal!.iso}&agendamento=${next.cal!.appt.id}`)}>
                      Ver na agenda
                    </Button>
              }
                </div>
            }
            </div>
            {rem &&
          <ReminderStatusRow
            state={rem.state}
            text={rem.text}
            detail={rem.detail}
            action={
            rem.canConfirm && next.cal && nextStatus !== 'confirmed' ?
            <Button size="sm" variant="secondary" onClick={confirmFromMessage}>
                      O cliente confirmou
                    </Button> :
            undefined
            } />

          }
          </div>
        </div> :

      <EmptyState
        variant="dotted"
        size="sm"
        icon={<CalendarIcon />}
        title="Nenhum agendamento futuro"
        description={archived ? ARCHIVED_NO_BOOKING : `Marque o próximo horário de ${primeiroNome}. ${reminderSentence}`}
        secondaryAction={!archived && onAgendar ? { label: 'Agendar', icon: <CalendarPlusIcon />, onClick: onAgendar } : undefined} />

      }
    </Card>);

}