import { wordsNow } from '../../data/segment';
import React, { useEffect, useRef, useState } from 'react';
import { CalendarPlusIcon, UserRoundIcon } from 'lucide-react';
import { Button } from '../Button';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_TONE, Avatar, ContextOpenArea, ContextPanel, ContextSection, ReminderStatusRow, StatusBadge, Textarea, useToast } from '../Card';
import { ClickableRow } from '../ui/ClickableRow';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { NovoAgendamentoModal } from '../modals/NovoAgendamentoModal';
import type { AgendamentoDefaults } from '../modals/NovoAgendamentoModal';
import { AppointmentDetailsModal } from '../modals/AppointmentDetailsModal';
import { calFromProfile, detailsFromCalendar } from '../modals/appointmentDetailsFromCalendar';
import { PackageDetailModal } from '../pacotes/PackageDetailModal';
import { WaitlistEntryModal } from '../agenda/WaitlistDetailsModals';
import { ClientTagsModal } from '../client/ClientTagsModal';
import { TagManagerModal } from '../client/TagManagerModal';
import type { ConversationSummary } from '../../data/conversasThreads';
import { NOW, TODAY_ISO, mediumDayLabel } from '../../data/agendaStore';
import type { CalAppointment } from '../../data/agendaStore';
import { moveAppointment, setAppointmentStatus, setWaitlist, tryAddAppointment, useAgendaData } from '../../data/agendaLive';
import { clientIdOfRecordedName, updateClient, useClientProfile } from '../../data/api/clientes';
import { ARCHIVED_NO_BOOKING } from '../../data/archivedClients';
import { listPackages, useBackendVersion } from '../../data/api/pacotes';
import { textoDisponiveis } from '../../data/pacotesLib';
import type { AgendaWaitlistEntry } from '../../data/agenda';
import { professionalByLabel, serviceByLabel, serviceByValue } from '../../data/catalogo';
import { agendaProfessionalOf } from '../../data/availability';
import { useFollowUp } from '../../data/followUp';
import { bookingConfirmationText, setReadyMessage } from '../../data/conversasThreads';
import { useDirtyForm } from '../../data/dirtyGuard';
import { markConfirmedByTeam, reminderOf, reminderRow, useRemindersVersion } from '../../data/reminders';
import { absMin } from '../../data/replyWindow';
import { alwaysAnswersText, listBadgeDetail, listBadgeOf, useContactBlocks } from '../../data/contactPreferences';
import { useClientIdentityLine } from '../../data/clientAge';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthYear = (iso: string | null | undefined) => iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}` : null;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
/** "Hoje, 01/10 · 10:30" · "Amanhã, 02/10 · 09:00" · "Sexta, 09/10 · 14:00" */
function whenLabel(iso: string, time: string) {
  const weekday = mediumDayLabel(iso).split(', ')[0];
  const day = iso === TODAY_ISO ? 'Hoje' : iso === addDays(TODAY_ISO, 1) ? 'Amanhã' : weekday.replace(/-feira$/i, '');
  return `${day}, ${dm(iso)} · ${time}`;
}

/** Profissional com a cor dele (mesmo ponto colorido da Agenda). */
function Professional({ p }: {p?: {name: string;color?: string;} | null;}) {
  if (!p) return null;
  return (
    <span className="mt-1 flex items-center gap-1.5 text-sm text-[#4B6866]">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
      {p.name}
    </span>);

}

/**
 * T1 1g (05/11, Christian, referência Tend): observações sem "Editar → Salvar". O campo fica sempre aberto e salva sozinho
 * ao sair dele (clicar fora ou Tab). Trocar de tela com texto não salvo continua passando pelo aviso de alterações.
 * Mesma gravação de antes (`updateClient` → `notes` do cadastro), então a ficha completa mostra o mesmo texto.
 */
function NotesSection({ clientId, notes }: {clientId: string;notes: string;}) {
  const [draft, setDraft] = useState(notes);
  const [savedAt, setSavedAt] = useState(false);
  const focused = useRef(false);
  // Texto mudou por fora (ficha completa) e o campo não está em uso: acompanha.
  useEffect(() => {
    if (!focused.current) setDraft(notes);
  }, [notes]);
  const dirty = draft.trim() !== notes.trim();
  const save = (): boolean => {
    if (!dirty) return true;
    updateClient(clientId, { notes: draft.trim() || null });
    setSavedAt(true);
    return true;
  };
  useDirtyForm(`conversa-observacoes-${clientId}`, dirty, { save, discard: () => setDraft(notes) });
  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(false), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);
  return (
    <ContextSection title="Observações">
      <Textarea
        aria-label="Observações do cliente"
        aria-describedby={`obs-ajuda-${clientId}`}
        rows={3}
        size="sm"
        value={draft}
        onFocus={() => focused.current = true}
        onChange={(e) => {
          setDraft(e.target.value);
          setSavedAt(false);
        }}
        onBlur={() => {
          focused.current = false;
          save();
        }}
        placeholder="Ex.: prefere horários pela manhã, pele sensível…" />
      
      <p id={`obs-ajuda-${clientId}`} aria-live="polite" className={`-mt-1.5 text-xs ${savedAt ? 'font-semibold text-[#0B6B4A]' : 'text-[#587371]'}`}>
        {savedAt ? 'Observação salva.' : 'Salva sozinha quando você sai do campo.'}
      </p>
    </ContextSection>);

}

type ProfileAppt = {id: string;date: string;start_time: string;status: string;service: {name: string;} | null;professional: {name: string;color?: string;} | null;cal?: {iso: string;appt: CalAppointment;} | null;};

/**
 * Ficha resumida ao lado da conversa.
 * T1 1b: dados ao vivo, ordem da revisão §3.E.
 * T1 1g (05/11, Christian, referência Tend): UM cartão com seções separadas por linha fina (`ContextPanel`), no lugar de
 * seis cartões empilhados.
 * - Topo (cliente): avatar, nome, "35 anos · Feminino" (só o que estiver no cadastro), telefone, "Cliente desde",
 *   etiquetas (com "Editar" na linha delas), pedido de saída e "Abrir ficha completa" (subiu do fim da lista para cá).
 *   T1 1h: "Editar" saiu da linha do nome para a linha das etiquetas (na coluna de 280 px ele espremia nome e telefone).
 * - Próximo agendamento: a área do horário abre o MESMO detalhe da Agenda (`AppointmentDetailsModal`: remarcar,
 *   cancelar, fechar, sinal, terceiro). Abaixo: linha do lembrete e "Ver na agenda". "Novo agendamento" virou o botão
 *   principal, logo abaixo do cartão do horário.
 * - Último atendimento: a área inteira abre o detalhe desse atendimento (mesmo componente; antigo = só consulta, como na
 *   ficha). Mostra também quantos atendimentos foram realizados.
 * - Observações: campo sempre aberto, salva ao sair.
 * R3 (06/11/2026, Christian, A-07/D5): com atendimento de hoje em andamento, a seção "Hoje · em atendimento" aparece
 *   acima do próximo agendamento (que continua sendo o seguinte, pela regra do perfil).
 * L24d (19/11/2026): o selo de preferência de contato é o MESMO da lista de Clientes (`listBadgeOf`: "Não recebe
 *   retorno / lembretes / avisos"), com as linhas do dicionário (`listBadgeDetail`) + `alwaysAnswersText`. Sai o selo
 *   antigo "Só recebe lembretes" e a frase `optOutScopeNote`.
 * Total de realizados: contado na lista de atendimentos da ficha. No backend (main de 22/10) a lista vem paginada e
 * `atendimentos_total` conta TODOS os agendamentos (inclusive cancelados e faltas); para o número exato de realizados o
 * perfil precisa de um campo próprio (anotado para o T2). A linha de faltas em 12 meses tem a mesma limitação.
 */
export function ClientSummaryPanel({ summary, clientId }: {summary: ConversationSummary;clientId: string;}) {
  const toast = useToast();
  const navigate = useGuardedNavigate();
  const { waitlist } = useAgendaData();
  const [scheduling, setScheduling] = useState<AgendamentoDefaults | null>(null);
  /*
   * W4 (11/11/2026, Christian):
   * - A2-12: agendar pela conversa liga o horário ao caso ABERTO de Oportunidades do mesmo cliente e serviço (ligação
   *   explícita `followUpCaseId`, a mesma do “Agendar” de Oportunidades): o caso vai para Resolvidos como “Agendou”.
   * - A2-09: o horário nasce “A confirmar” e a confirmação fica PRONTA no topo da conversa (texto aprovado em 11/11).
   */
  const followUp = useFollowUp();
  const bookFromConversation = (data: Parameters<typeof tryAddAppointment>[0]) => {
    const label = serviceByValue(data.service)?.label ?? data.service;
    const open = followUp.all.find((c) => c.clientId === clientId && c.situation !== 'resolvidos' && c.service.toLowerCase() === label.toLowerCase());
    const r = tryAddAppointment(data, open ? { followUpCaseId: open.id } : undefined);
    if (r.ok && r.appt.status !== 'confirmed') {
      const pro = agendaProfessionalOf(r.appt.professionalId)?.name ?? 'a equipe';
      setReadyMessage(clientId, {
        title: `Confirmação pronta para ${r.appt.clientName.split(' ')[0]}`,
        text: bookingConfirmationText(r.appt.clientName, r.appt.service, pro, data.date, r.appt.start),
        sendLabel: 'Enviar a confirmação'
      });
    }
    return r;
  };
  const [pkgOpen, setPkgOpen] = useState<string | null>(null);
  const [waitOpen, setWaitOpen] = useState<{entry: AgendaWaitlistEntry;position: number;} | null>(null);
  const [removing, setRemoving] = useState<AgendaWaitlistEntry | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [detail, setDetail] = useState<{iso: string;appt: CalAppointment;live: boolean;} | null>(null);
  useBackendVersion();
  useRemindersVersion();
  useContactBlocks();
  const ficha = useClientProfile(clientId);
  const identity = useClientIdentityLine(clientId);
  const pacotes = listPackages({ client_id: clientId }).filter((p) => p.status !== 'cancelled');
  // W4 (11/11/2026, nota do W1): TODOS os pedidos do cliente na lista de espera (antes só o primeiro), com a posição na fila.
  const waitingAll = waitlist.map((w, i) => ({ entry: w, position: i + 1 })).filter((x) => clientIdOfRecordedName(x.entry.clientName) === clientId);
  const client = ficha?.client;
  const name = client?.name ?? summary.name;
  const phone = client?.phone || summary.phone;
  const since = monthYear(client?.first_contact_at ?? client?.created_at);
  const tags = client?.tag_items ?? [];
  const archived = !!client?.archived_at;
  // L24d: o mesmo selo da lista de Clientes (dicionário).
  const listBadge = listBadgeOf(clientId);

  /** Abre o detalhe do agendamento: o registro vivo da Agenda quando existe; antigo = mesmo cartão, só consulta. */
  const openDetail = (a: ProfileAppt) => {
    if (a.cal) setDetail({ ...a.cal, live: true });else
    setDetail({ ...calFromProfile(a, name), live: false });
  };

  const next = (ficha?.proximo_agendamento ?? null) as (ProfileAppt & {cal?: {iso: string;appt: CalAppointment;} | null;}) | null;
  const recordedName = next?.cal?.appt.clientName ?? name;
  const rem = next ? reminderRow(reminderOf(next.date, recordedName, next.start_time), next.date) : null;
  const nextStatus = next ? next.cal?.appt.status ?? (next.status === 'scheduled' ? 'pending_confirmation' : next.status) : undefined;
  const confirmFromMessage = () => {
    if (!next?.cal) return;
    setAppointmentStatus(next.cal.iso, next.cal.appt.id, 'confirmed');
    markConfirmedByTeam(next.date, recordedName, next.start_time);
    toast({ title: 'Horário confirmado', description: `${name} · ${whenLabel(next.date, next.start_time)}. Nenhuma mensagem foi enviada ao cliente.` });
  };

  const last = (ficha?.ultimo_atendimento ?? null) as ProfileAppt | null;
  const all = (ficha?.atendimentos ?? []) as ProfileAppt[];
  const fromIso = addDays(TODAY_ISO, -365);
  const year = all.filter((a) => a.date >= fromIso && absMin(`${a.date}T00:00`) <= absMin(`${TODAY_ISO}T23:59`));
  const done = year.filter((a) => a.status === 'completed').length;
  const missed = year.filter((a) => a.status === 'no_show').length;
  const attendance = done + missed > 0 ? `Faltas: ${missed} em 12 meses · comparecimento ${Math.round(done / (done + missed) * 100)}%` : 'Sem atendimentos nos últimos 12 meses';
  const totalDone = all.filter((a) => a.status === 'completed').length;
  const totalText = totalDone === 1 ? `1 atendimento realizado ${wordsNow().in}` : `${totalDone} atendimentos realizados ${wordsNow().in}`;
  // R3 (06/11/2026, Christian, A-07/D5): atendimento de hoje em andamento = início ≤ agora < fim e ainda não fechado
  // (nem cancelado). A regra do "próximo agendamento" (perfil: só início ≥ agora) NÃO muda: o seletor de modelos (A-39) também a usa.
  const ongoing = all.find((a) => !!a.cal && a.date === TODAY_ISO && a.cal.appt.start <= NOW && NOW < a.cal.appt.end && !['completed', 'cancelled', 'no_show'].includes(a.cal.appt.status)) ?? null;
  const ongoingCal = ongoing?.cal ?? null;

  const scheduleNew = () => {
    if (archived) return;
    setScheduling({ client: name, date: TODAY_ISO });
  };

  return (
    <>
      <ContextPanel label={`Ficha resumida de ${name}`}>
        {/* Cliente */}
        <ContextSection>
          <div className="flex items-start gap-3">
            <Avatar name={name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-base font-bold leading-6">{name}</p>
              {identity && <p className="text-[#4B6866]">{identity}</p>}
              {phone && <p className="whitespace-nowrap text-[#4B6866]">{phone}</p>}
              {since && <p className="text-[#587371]">Cliente desde {since}</p>}
            </div>
          </div>
          {client &&
          <div className="flex items-start justify-between gap-2">
              {archived || tags.length > 0 ?
            <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Etiquetas do cliente">
                  {archived && <StatusBadge status="neutral" label="Arquivado" showDot={false} />}
                  {tags.map((t) =>
              <StatusBadge key={t.id} status={t.is_active ? 'neutral' : 'muted'} label={t.name} showDot={false} />
              )}
                </div> :

            <p className="py-1 text-[#587371]">Sem etiquetas.</p>
            }
              <Button size="sm" variant="neutral" aria-label="Editar etiquetas do cliente" className="shrink-0" onClick={() => setTagsOpen(true)}>
                Editar
              </Button>
            </div>
          }
          {listBadge &&
          <div className="flex flex-col items-start gap-1.5">
              <StatusBadge status="warning" label={listBadge} />
              <p className="text-[#4B6866]">
                {listBadgeDetail(clientId)}. {alwaysAnswersText()}
              </p>
            </div>
          }
          {client &&
          <Button size="md" variant="secondary" className="w-full" leftIcon={<UserRoundIcon className="h-4 w-4" />} onClick={() => navigate(`/clientes/${clientId}`)}>
              Abrir ficha completa
            </Button>
          }
        </ContextSection>

        {/* R3 (06/11/2026, Christian, A-07/D5): "Hoje · em atendimento" acima do próximo agendamento, com as mesmas peças dele. */}
        {ongoing && ongoingCal &&
        <ContextSection title="Hoje · em atendimento">
            <div className="flex flex-col gap-3 rounded-xl border border-[#E3EEED] bg-[#F7FBFA] px-3 pb-3 pt-1">
              <ContextOpenArea onOpen={() => openDetail(ongoing)} label={`Ver detalhes do atendimento em andamento: hoje, ${ongoingCal.appt.start}–${ongoingCal.appt.end}${ongoing.service ? `, ${ongoing.service.name}` : ''}`}>
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-base font-bold leading-6">
                      {ongoingCal.appt.start}–{ongoingCal.appt.end}
                    </span>
                    {ongoing.service && <span className="block text-[#4B6866]">{ongoing.service.name}</span>}
                    <Professional p={ongoing.professional} />
                  </span>
                  <StatusBadge status={APPOINTMENT_STATUS_TONE[ongoingCal.appt.status] ?? 'neutral'} label={APPOINTMENT_STATUS_LABEL[ongoingCal.appt.status] ?? ongoingCal.appt.status} />
                </span>
              </ContextOpenArea>
            </div>
          </ContextSection>
        }

        {/* Próximo agendamento */}
        <ContextSection title="Próximo agendamento">
          {next ?
          <div className="flex flex-col gap-3 rounded-xl border border-[#E3EEED] bg-[#F7FBFA] px-3 pb-3 pt-1">
              <ContextOpenArea onOpen={() => openDetail(next)} label={`Ver detalhes do agendamento: ${whenLabel(next.date, next.start_time)}${next.service ? `, ${next.service.name}` : ''}`}>
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-base font-bold leading-6">{whenLabel(next.date, next.start_time)}</span>
                    {next.service && <span className="block text-[#4B6866]">{next.service.name}</span>}
                    <Professional p={next.professional} />
                  </span>
                  {nextStatus && <StatusBadge status={APPOINTMENT_STATUS_TONE[nextStatus] ?? 'neutral'} label={APPOINTMENT_STATUS_LABEL[nextStatus] ?? nextStatus} />}
                </span>
              </ContextOpenArea>
              {rem &&
            <ReminderStatusRow
              className="border-[#E3EEED]"
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
              {next.cal &&
            <Button size="sm" variant="secondary" className="w-full" onClick={() => navigate(`/agenda?data=${next.cal!.iso}&agendamento=${next.cal!.appt.id}`)}>
                  Ver na agenda
                </Button>
            }
            </div> :

          <p className="text-[#4B6866]">Nenhum agendamento futuro.</p>
          }
          <Button size="md" className="w-full" leftIcon={<CalendarPlusIcon className="h-4 w-4" />} disabled={archived} aria-describedby={archived ? `arquivado-${clientId}` : undefined} onClick={scheduleNew}>
            Novo agendamento
          </Button>
          {archived &&
          <p id={`arquivado-${clientId}`} className="-mt-1.5 text-xs text-[#587371]">
              {ARCHIVED_NO_BOOKING}
            </p>
          }
        </ContextSection>

        {/* Último atendimento */}
        <ContextSection title="Último atendimento">
          {last ?
          <ContextOpenArea onOpen={() => openDetail(last)} label={`Ver detalhes do último atendimento: ${dmy(last.date)}${last.service ? `, ${last.service.name}` : ''}`} className="-my-1">
              <span className="block font-semibold">
                {dmy(last.date)} · {last.service?.name ?? 'Sem procedimento registrado'}
              </span>
              <Professional p={last.professional} />
              <span className="mt-1 block text-[#587371]">{totalText}</span>
              <span className="block text-[#587371]">{attendance}</span>
            </ContextOpenArea> :

          <p className="text-[#4B6866]">Nenhum atendimento realizado ainda.</p>
          }
        </ContextSection>

        {/* Pacote */}
        <ContextSection title="Pacote">
          {pacotes.length ?
          <div className="flex flex-col gap-2">
              {pacotes.map((p) =>
            <ClickableRow key={p.id} label={p.service_name_snapshot} value={textoDisponiveis(p)} onClick={() => setPkgOpen(p.id)} />
            )}
            </div> :

          <p className="text-[#4B6866]">Nenhum pacote.</p>
          }
        </ContextSection>

        {waitingAll.length > 0 &&
        <ContextSection title="Lista de espera">
            <div className="flex flex-col gap-2">
              {waitingAll.map((x) =>
            <ClickableRow key={x.entry.id} label={x.entry.service} value={x.entry.preference} onClick={() => setWaitOpen(x)} />
            )}
            </div>
          </ContextSection>
        }

        {client && <NotesSection key={clientId} clientId={clientId} notes={client.notes ?? ''} />}
      </ContextPanel>

      <AppointmentDetailsModal
        appointment={detail ? detailsFromCalendar(detail.iso, detail.appt) : null}
        onClose={() => setDetail(null)}
        onStatusChange={(status) => detail?.live && setAppointmentStatus(detail.iso, detail.appt.id, status)}
        onRescheduled={(data) => {
          if (!detail?.live) return { ok: false, message: 'Este atendimento é antigo e só pode ser consultado.' };
          return moveAppointment(detail.iso, detail.appt.id, data);
        }} />
      
      <ClientTagsModal
        open={tagsOpen}
        clientId={clientId}
        onClose={() => setTagsOpen(false)}
        onManage={() => {
          setTagsOpen(false);
          setManageOpen(true);
        }} />
      
      <TagManagerModal open={manageOpen} onClose={() => setManageOpen(false)} />
      <NovoAgendamentoModal open={!!scheduling} defaults={scheduling ?? undefined} onClose={() => setScheduling(null)} onSaved={bookFromConversation} />
      <PackageDetailModal packageSaleId={pkgOpen} nomeDoPaciente={name} onClose={() => setPkgOpen(null)} />
      <WaitlistEntryModal
        entry={waitOpen?.entry ?? null}
        position={waitOpen?.position ?? 1}
        onClose={() => setWaitOpen(null)}
        onConversation={() => setWaitOpen(null)}
        onRemove={(entry) => {
          setWaitOpen(null);
          setRemoving(entry);
        }}
        onSchedule={(entry) => {
          setWaitOpen(null);
          if (archived) {
            toast({ title: 'Não dá para agendar', description: ARCHIVED_NO_BOOKING, tone: 'warning' });
            return;
          }
          setScheduling({ client: entry.clientName, service: serviceByLabel(entry.service)?.value, professional: professionalByLabel(entry.professional)?.value, date: TODAY_ISO });
        }} />
      
      <ConfirmDialog
        open={!!removing}
        danger
        title="Remover da lista de espera?"
        description={removing ? `${removing.clientName} deixa de receber ofertas de horário para ${removing.service.toLowerCase()}.` : undefined}
        confirmLabel="Remover da lista"
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          setWaitlist((list) => list.filter((e) => e.id !== removing.id));
          toast({ title: 'Removida da lista de espera', description: removing.clientName, tone: 'info' });
        }} />
      
    </>);

}