import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BellIcon, CalendarXIcon, CalendarPlusIcon, MessagesSquareIcon, MoonIcon, PackagePlusIcon, PlusIcon, SettingsIcon, SunIcon, TargetIcon, TriangleAlertIcon, UserPlusIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { CountBadge, EmptyState, Tooltip } from '../Card';
import { ActionMenu } from '../ui/ActionMenu';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { NovoClienteModal } from '../modals/NovoClienteModal';
import { BloquearHorarioModal } from '../modals/BloquearHorarioModal';
import type { HorarioBloqueado } from '../modals/BloquearHorarioModal';
import { VendaDePacoteModal } from '../pacotes/VendaDePacoteModal';
import { NOW, TODAY_ISO } from '../../data/agendaStore';
import { setBlocks } from '../../data/agendaLive';
import { clinicDay, nextOpenIso, useTeam } from '../../data/availability';
import { wordsNow } from '../../data/segment';
import { requestBooking } from '../../data/bookingRequest';
import { toggleTheme, useTheme } from '../../data/theme';
import { markAllNotificationsRead, markNotificationRead, useNotifications } from '../../data/notifications';
import type { AppNotification, NotificationKind } from '../../data/notifications';

/**
 * T1 1k (05/11/2026, Christian, referência Tend): FAIXA DO TOPO, igual em todas as telas do Painel (acima do título).
 * 1. Horário + "Clínica aberta" com bolinha verde (cinza quando fechada). L19 (17/11/2026): a bolinha tinha parado.
 *    L22 (17/11/2026, decisão 2a do Christian; DS 6.1 `rules/findability.md` › Movimento: dois laços permitidos, a logo
 *    e esta bolinha): ABERTA = verde pulsando (`.orni-pulse` do index.css); FECHADA = cinza e parada (vermelho no painel
 *    quer dizer problema). Com "reduzir movimento", parada (regra do index.css). Fonte: horário da
 *    clínica + datas especiais (Serviços e equipe › Funcionamento). O horário é o RELÓGIO DO PROTÓTIPO (01/10, 09:20), o
 *    mesmo de todas as telas; no produto, relógio real no fuso da clínica (`tenant.business_hours` existe no backend).
 * 2. Modo noturno / claro (data/theme.ts).
 * 3. Notificações (data/notifications.ts): o que pede ação, com link para resolver.
 * 4. "+ Novo": Novo agendamento, Novo cliente e Vender pacote (escolha do Christian), abrindo os MESMOS formulários das
 *    telas (cada um já grava sozinho).
 * Tamanhos: 44 px (ações do topo da página, regra do DS). No celular a clínica mostra só a bolinha e a hora.
 * T1 1m (05/11, Christian): a faixa ROLA junto com a página (não fica fixa).
 * T1 1n (05/11, Christian): fechada hoje por data especial/feriado, a dica diz o MOTIVO ("Fechada hoje: Feriado
 * municipal. Abre amanhã às 08:00."). Motivo = o interno da data especial (a dica só aparece para a equipe) ou, sem ele, o
 * nome público do feriado. Horário reduzido ou abertura extra com motivo: o motivo vem entre parênteses no horário de hoje.
 * W4 (11/11/2026, A2-15): o sino mostra o NÚMERO de avisos novos (`CountBadge` do DS) e ganhou o tipo `agenda` (conflitos).
 * L3 (16/11/2026, facilidade de uso): "+ Novo" ganhou a quarta entrada "Bloquear horário ou folga", que abre a MESMA janela
 *    da Agenda (`BloquearHorarioModal`, data de hoje). O bloqueio entra na agenda pelo mesmo formato que a Agenda grava
 *    (`setBlocks`); a folga continua gravada pela própria janela (ausência do profissional). Caminho a mais, nada novo.
 * L22e (18/11/2026, DS 6.1): o vazio das notificações usa `EmptyState size="sm" variant="dotted"`; mesmo texto.
 */

const ROUND =
'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-xs transition-colors hover:bg-hover-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background [&>svg]:h-[18px] [&>svg]:w-[18px]';

/** Corta em 2 linhas sem depender do plugin de line-clamp do Tailwind. */
const TWO_LINES: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

function ClinicStatus() {
  const team = useTeam();
  const w = wordsNow();
  const day = clinicDay(TODAY_ISO, { hours: team.hours, blocks: team.blocks });
  const openNow = day.open && day.windows.some((x) => x.start <= NOW && NOW < x.end);
  const label = `${w.Noun} ${openNow ? w.fem ? 'aberta' : 'aberto' : w.closed}`;
  const today = day.open ? day.windows.map((x) => `${x.start}–${x.end}`).join(' e ') : '';
  const reason = (day.why || day.publicWhy || '').trim();
  const specialNote = day.open && day.special && reason ? ` (${reason})` : '';
  let hint: string;
  if (openNow) hint = `Horário de hoje: ${today}${specialNote}.`;else
  if (day.open && NOW < day.start) hint = `Abre hoje às ${day.start}. Horário de hoje: ${today}${specialNote}.`;else
  {
    const next = nextOpenIso(day.open ? addDay(TODAY_ISO) : TODAY_ISO);
    const nd = next ? clinicDay(next, { hours: team.hours, blocks: team.blocks }) : null;
    const opens = next && nd?.open ? `Abre ${next === addDay(TODAY_ISO) ? 'amanhã' : `em ${next.slice(8, 10)}/${next.slice(5, 7)}`} às ${nd.start}.` : 'Sem próximo dia de atendimento nas próximas semanas.';
    const closedToday = !day.open ? `${w.fem ? 'Fechada' : 'Fechado'} hoje${reason ? `: ${reason}` : ''}. ` : day.special && reason ? `Hoje: ${reason}. ` : '';
    hint = `${closedToday}${opens}`;
  }
  return (
    <Tooltip content={`${hint} O horário vem de Serviços e equipe › Funcionamento.`} side="bottom" align="end" maxWidth={280}>
      <span
        tabIndex={0}
        aria-label={`Agora ${NOW}. ${label}. ${hint}`}
        className="inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full border border-border bg-surface px-3.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4">
        
        <span aria-hidden="true" data-clinic-dot={openNow ? 'open' : 'closed'} className="relative inline-flex h-2.5 w-2.5">
          {/* L22: anel que pulsa, só com a clínica aberta (o index.css o para com "reduzir movimento"). */}
          {openNow && <span className="orni-pulse absolute inset-0 rounded-full bg-success" />}
          <span className={twMerge('relative h-2.5 w-2.5 rounded-full', openNow ? 'bg-success' : 'bg-text-muted')} />
        </span>
        <span aria-hidden="true" className="font-bold tabular-nums text-text-primary">
          {NOW}
        </span>
        <span aria-hidden="true" className="hidden text-text-secondary sm:inline">
          {label}
        </span>
      </span>
    </Tooltip>);

}

function addDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

function ThemeButton() {
  const theme = useTheme();
  const label = theme === 'dark' ? 'Usar modo claro' : 'Usar modo noturno';
  return (
    <Tooltip content={label} side="bottom">
      <button type="button" aria-label={label} aria-pressed={theme === 'dark'} onClick={toggleTheme} className={ROUND}>
        {theme === 'dark' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
      </button>
    </Tooltip>);

}

const KIND_ICON: Record<NotificationKind, React.ReactNode> = {
  conversa: <MessagesSquareIcon className="h-4 w-4" aria-hidden="true" />,
  oportunidade: <TargetIcon className="h-4 w-4" aria-hidden="true" />,
  lembrete: <TriangleAlertIcon className="h-4 w-4" aria-hidden="true" />,
  configuracao: <SettingsIcon className="h-4 w-4" aria-hidden="true" />,
  agenda: <CalendarXIcon className="h-4 w-4" aria-hidden="true" />
};
const TONE_ICON: Record<AppNotification['tone'], string> = {
  warning: 'bg-warning-background text-warning',
  error: 'bg-error-background text-error',
  info: 'bg-primary-soft text-primary'
};

function Notifications() {
  const navigate = useGuardedNavigate();
  const reduceMotion = useReducedMotion();
  const { items, isRead, unreadCount, unreadIds } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  const label = unreadCount ? `Notificações, ${unreadCount} ${unreadCount === 1 ? 'nova' : 'novas'}` : 'Notificações';
  const go = (n: AppNotification) => {
    markNotificationRead(n.id);
    setOpen(false);
    navigate(n.to);
  };
  return (
    <div ref={wrap} className="relative">
      <Tooltip content="Notificações" side="bottom" disabled={open}>
        <button ref={button} type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} className={ROUND}>
          <BellIcon aria-hidden="true" />
          {/* W4 (A2-15): o número de avisos novos (CountBadge do DS, mesmo contador do menu), no lugar do ponto vermelho. */}
          {unreadCount > 0 && <CountBadge count={unreadCount} size="sm" aria-hidden="true" className="absolute -right-0.5 -top-0.5" />}
        </button>
      </Tooltip>
      <AnimatePresence>
        {open &&
        <motion.div
          role="dialog"
          aria-label="Notificações"
          initial={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          style={{ transformOrigin: 'top right' }}
          className="absolute right-0 top-[calc(100%+8px)] z-50 flex max-h-[min(560px,calc(100vh-120px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-lg">
          
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="text-base font-bold text-text-primary">Notificações</p>
              <button
              type="button"
              disabled={unreadCount === 0}
              onClick={() => markAllNotificationsRead(unreadIds)}
              className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-hover-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent">
              
                Marcar todas como lidas
              </button>
            </div>
            {items.length === 0 ?
          <div className="p-3">
                <EmptyState size="sm" variant="dotted" title="Nada pedindo a sua atenção agora." />
              </div> :

          <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Avisos">
                {items.map((n) => {
              const unread = !isRead(n.id);
              return (
                <li key={n.id}>
                      <button
                    type="button"
                    onClick={() => go(n)}
                    className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    
                        <span className={twMerge('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE_ICON[n.tone])}>{KIND_ICON[n.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className={twMerge('block text-sm leading-5 text-text-primary', unread ? 'font-bold' : 'font-medium')}>
                            {n.title}
                            {unread && <span className="sr-only"> (nova)</span>}
                          </span>
                          {n.detail &&
                      <span className="mt-0.5 text-sm text-text-secondary" style={TWO_LINES} title={n.detail}>
                              {n.detail}
                            </span>
                      }
                          {n.when && <span className="mt-0.5 block text-xs text-text-muted">{n.when}</span>}
                        </span>
                        {unread && <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-error" />}
                      </button>
                    </li>);

            })}
              </ul>
          }
          </motion.div>
        }
      </AnimatePresence>
    </div>);

}

/** L3: mesmo formato de bloqueio que a Agenda grava (`addBlock` de pages/Agenda.tsx). */
const addBlockFromMenu = (b: HorarioBloqueado) =>
setBlocks((map) => ({
  ...map,
  [b.date]: [
  ...(map[b.date] ?? []),
  { id: `b${Date.now()}`, professionalId: b.whoId === 'todos' ? null : b.whoId, start: b.from, end: b.to, label: `Bloqueado · ${b.reason.toLowerCase()}` }]

}));

function NewMenu() {
  const [client, setClient] = useState(false);
  const [pkg, setPkg] = useState(false);
  const [block, setBlock] = useState(false);
  return (
    <>
      <ActionMenu
        label="Novo"
        icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
        variant="primary"
        size="lg"
        items={[
        { key: 'agendamento', label: 'Novo agendamento', icon: <CalendarPlusIcon className="h-4 w-4" aria-hidden="true" />, onSelect: () => requestBooking({ date: TODAY_ISO }) },
        { key: 'cliente', label: 'Novo cliente', icon: <UserPlusIcon className="h-4 w-4" aria-hidden="true" />, onSelect: () => setClient(true) },
        { key: 'pacote', label: 'Vender pacote', icon: <PackagePlusIcon className="h-4 w-4" aria-hidden="true" />, onSelect: () => setPkg(true) },
        { key: 'bloqueio', label: 'Bloquear horário ou folga', icon: <CalendarXIcon className="h-4 w-4" aria-hidden="true" />, onSelect: () => setBlock(true) }]
        } />
      
      <NovoClienteModal open={client} onClose={() => setClient(false)} />
      <VendaDePacoteModal open={pkg} onClose={() => setPkg(false)} />
      <BloquearHorarioModal open={block} defaultDate={TODAY_ISO} onClose={() => setBlock(false)} onSaved={addBlockFromMenu} />
    </>);

}

export function TopBar({ className }: {className?: string;}) {
  return (
    <div className={twMerge('mb-4 flex items-center justify-end gap-2 md:mb-5', className)}>
      <ClinicStatus />
      <ThemeButton />
      <Notifications />
      <NewMenu />
    </div>);

}