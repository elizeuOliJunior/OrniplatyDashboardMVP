import { currentWords } from '../../data/empresa';
import React, { useState } from 'react';
import { CalendarClockIcon, ChevronRightIcon, ClockIcon } from 'lucide-react';
import { Alert, Avatar, ProfessionalTag, StatusBadge, clickableCardClass, clickableChevronClass } from '../Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../Table';
import { Button } from '../Button';
import { PillGroup } from '../Pill';
import { EmptyState } from '../EmptyState';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import type { TeamMember } from '../../data/equipeFuncionamento';
import { formatPhone } from '../../data/equipeFuncionamento';
import { TODAY_ISO } from '../../data/agendaStore';
import { effectiveDay } from '../../data/availability';
import { WEEKDAY_SHORT, bufferLabel, describeDay, describeOverride, dmy, rangesText } from '../../data/schedule';
import type { DaySchedule } from '../../data/schedule';
import type { ServiceItem } from '../../data/servicesStore';

/**
 * Resume a semana em grupos de dias CONSECUTIVOS com a mesma descrição (describeDay).
 * Ex.: ["Seg a Sex 08:00–18:00 · pausa 12:00–13:00", "Sáb e Dom: folga"].
 */
export function weekSummary(week: DaySchedule[]): string[] {
  const groups: {start: number;end: number;text: string;}[] = [];
  week.forEach((d, i) => {
    const text = describeDay(d);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.end = i;else
    groups.push({ start: i, end: i, text });
  });
  return groups.map(({ start, end, text }) => {
    const n = end - start + 1;
    const first = WEEKDAY_SHORT[start];
    const last = WEEKDAY_SHORT[end];
    const label = n === 1 ? first : n === 2 ? `${first} e ${last}` : `${first} a ${last}`;
    return text === 'Folga' ? `${label}: folga` : `${label} ${text}`;
  });
}

type Today = {tone: 'success' | 'neutral' | 'warning' | 'muted';label: string;detail: string;};

/** Situação de hoje (relógio do protótipo), pela MESMA regra da agenda (effectiveDay). */
export function todayOf(m: TeamMember): Today {
  if (m.active === false) return { tone: 'muted', label: 'Arquivado', detail: 'Não recebe agendamentos' };
  const d = effectiveDay(m, TODAY_ISO);
  if (!d.clinic.open) return { tone: 'neutral', label: 'Fechado', detail: `${currentWords().Noun} ${currentWords().closed} hoje` };
  if (!d.working) {
    const o = d.override;
    if (o && o.kind === 'off') return { tone: 'neutral', label: 'Ausente', detail: `${o.reason.trim() || 'Folga'} até ${dmy(o.to)}` };
    return { tone: 'neutral', label: 'Folga', detail: 'Não atende hoje' };
  }
  if (d.windows.length === 0) return { tone: 'neutral', label: 'Folga', detail: `Fora do horário ${currentWords().of}` };
  // W2 (A3-20): a pausa aparece no mesmo formato do cabeçalho da Agenda ("08:00–12:00 · pausa 12:00–13:00").
  return { tone: 'success', label: 'Atende', detail: `${rangesText(d.windows)}${d.breaks.length ? ` · pausa ${rangesText(d.breaks)}` : ''}` };
}

export const nextAbsence = (m: TeamMember) => m.overrides.filter((o) => o.kind === 'off' && o.to >= TODAY_ISO).sort((a, b) => a.from.localeCompare(b.from))[0];

type EquipeTabProps = {
  members: TeamMember[];
  services: ServiceItem[];
  /** `focusPhone` (W2, A3-09): abre na aba Dados com o cursor no WhatsApp. */
  onOpen: (member: TeamMember, tab?: string, focusPhone?: boolean) => void;
  /** Botão à direita da barra da lista ("+ Novo profissional"), como "+ Novo serviço" na aba Serviços. */
  action?: React.ReactNode;
};

/**
 * Equipe (19/10/2026): tabela com uma linha por profissional (nome e função, serviços, situação de hoje, WhatsApp e
 * status). A linha inteira abre o perfil; tudo o que é editável fica lá, em abas.
 * Rodada de 11/11/2026 (decisão do Christian): "+ Novo profissional" fica à direita da linha Ativos/Arquivados (igual à
 * aba Serviços); o aviso de profissional sem WhatsApp desceu para a linha de baixo.
 * L22e (18/11/2026, DS 6.1): o vazio da lista usa `EmptyState variant="dotted"` (antes "bordered"), como em Serviços.
 * L24b (18/11/2026, pedido 4; DS 6.2 › Profissional): o círculo das iniciais usa a cor do profissional (`Avatar color`),
 * na tabela e nos cartões do celular.
 */
export function EquipeTab({ members, services, onOpen, action }: EquipeTabProps) {
  const [show, setShow] = useState<'ativos' | 'arquivados'>('ativos');
  const list = members.filter((m) => show === 'ativos' ? m.active !== false : m.active === false);
  const archivedCount = members.filter((m) => m.active === false).length;
  const withoutPhone = members.filter((m) => m.active !== false && !m.profile?.phone);
  const missingPhone = withoutPhone.length;
  const countOf = (m: TeamMember) => services.filter((s) => s.active && s.professionalIds.includes(m.id)).length;

  const rowKey = (m: TeamMember) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(m);
    }
  };

  const Phone = ({ m, action = false }: {m: TeamMember;action?: boolean;}) =>
  m.profile?.phone ?
  <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-text-primary">
        <WhatsAppIcon className="h-4 w-4" />
        {formatPhone(m.profile.phone)}
      </span> :

  // W2 (A3-09): "Completar" ao lado da etiqueta, no padrão do "Ver" da coluna Serviços.
  <span className="flex flex-wrap items-center gap-2">
        <StatusBadge status="warning" label="Falta WhatsApp" />
        {action &&
    <Button
      size="sm"
      variant="neutral"
      aria-label={`Completar o WhatsApp de ${m.name}`}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(m, 'dados', true);
      }}>
      
            Completar
          </Button>
    }
      </span>;


  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PillGroup
          size="sm"
          options={[
          { value: 'ativos', label: 'Ativos' },
          { value: 'arquivados', label: archivedCount ? `Arquivados (${archivedCount})` : 'Arquivados' }]
          }
          value={show}
          onChange={(v) => (v === 'ativos' || v === 'arquivados') && setShow(v)} />
        
        {action}
      </div>
      {/* W2 (A3-09): aviso com ação (padrão Alert compact + botão md, como "Regras gerais…" na janela do serviço). */}
      {missingPhone > 0 && show === 'ativos' &&
      <Alert
        compact
        variant="warning"
        title={missingPhone === 1 ? '1 profissional sem WhatsApp' : `${missingPhone} profissionais sem WhatsApp`}
        actions={
        <Button size="md" variant="secondary" onClick={() => onOpen(withoutPhone[0], 'dados', true)}>
              Completar {withoutPhone[0].name}
            </Button>
        }>
        
          Sem ele, o profissional não recebe aviso de agendamento novo, cancelado ou remarcado.
        </Alert>
      }

      {list.length === 0 ?
      <EmptyState variant="dotted" title={show === 'arquivados' ? 'Nenhum profissional arquivado' : 'Nenhum profissional cadastrado'} description="Cada profissional tem jornada, serviços e contato próprios. A assistente só oferece horários de quem está ativo." /> :

      <>
          <div className="hidden md:block">
            <Table containerClassName="bg-surface">
              <TableHeader>
                <TableRow>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Serviços</TableHead>
                  <TableHead>Hoje</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead align="right">
                    <span className="sr-only">Abrir</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((m) => {
                const t = todayOf(m);
                const n = countOf(m);
                const abs = nextAbsence(m);
                return (
                  <TableRow key={m.id} tabIndex={0} role="button" aria-label={`Abrir ${m.name}`} onClick={() => onOpen(m)} onKeyDown={rowKey(m)} className="group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                      <TableCell>
                        <span className="flex items-center gap-3">
                          <Avatar name={m.name} src={m.profile?.photo || undefined} color={m.color} size="md" />
                          <span className="min-w-0">
                            <ProfessionalTag name={m.name} color={m.color} />
                            <span className="block text-xs text-text-secondary">{m.profile?.role || 'Área não informada'}</span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="text-sm tabular-nums text-text-primary">{n === 0 ? 'Nenhum' : n === 1 ? '1 serviço' : `${n} serviços`}</span>
                          <Button
                          size="sm"
                          variant="neutral"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(m, 'servicos');
                          }}>
                          
                            Ver
                          </Button>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-col items-start gap-1">
                          <StatusBadge status={t.tone} label={t.label} minWidth="md" />
                          <span className="text-xs tabular-nums text-text-secondary">{t.detail}</span>
                          {abs && t.label !== 'Ausente' && <span className="text-xs text-text-muted">Próxima ausência: {dmy(abs.from)}</span>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Phone m={m} action />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={m.active === false ? 'muted' : 'success'} label={m.active === false ? 'Arquivado' : 'Ativo'} minWidth="md" />
                      </TableCell>
                      <TableCell align="right">
                        <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                      </TableCell>
                    </TableRow>);

              })}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {list.map((m) => {
            const t = todayOf(m);
            const n = countOf(m);
            return (
              <li key={m.id}>
                  <button type="button" onClick={() => onOpen(m)} className={`${clickableCardClass} flex-col items-stretch`} aria-label={`Abrir ${m.name}`}>
                    <span className="flex items-center gap-3">
                      <Avatar name={m.name} src={m.profile?.photo || undefined} color={m.color} size="md" />
                      <span className="min-w-0 flex-1">
                        <ProfessionalTag name={m.name} color={m.color} />
                        <span className="block text-xs text-text-secondary">
                          {m.profile?.role || 'Área não informada'} · {n === 1 ? '1 serviço' : `${n} serviços`}
                        </span>
                      </span>
                      <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                    </span>
                    <span className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                      <span className="flex items-center gap-2">
                        <StatusBadge status={t.tone} label={t.label} />
                        <span className="text-xs tabular-nums text-text-secondary">{t.detail}</span>
                      </span>
                      <Phone m={m} />
                    </span>
                  </button>
                </li>);

          })}
          </ul>
        </>
      }
    </div>);

}

/** Jornada individual (7 dias, períodos, pausas), intervalo e próximas exceções. Usado no resumo do profissional (Conversas). */
export function ProfessionalSchedule({ member: m, className = '', showMeta = true }: {member: TeamMember;className?: string;showMeta?: boolean;}) {
  const upcoming = m.overrides.filter((o) => o.to >= TODAY_ISO).sort((a, b) => a.from.localeCompare(b.from));
  return (
    <div className={className}>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Jornada semanal</h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={`Horários de ${m.name}`}>
        {m.week.map((d, i) => {
          const on = d.working && d.periods.length > 0;
          return (
            <li key={i} className={`flex min-w-0 items-start justify-between gap-3 rounded-button px-3 py-2.5 ${on ? 'bg-active-surface' : 'bg-background'}`}>
              <span className="w-9 shrink-0 text-sm font-bold text-text-primary">{WEEKDAY_SHORT[i]}</span>
              <div className="min-w-0 flex-1 text-right">
                {on ?
                <>
                    <p className="text-sm font-semibold tabular-nums text-text-primary">{rangesText(d.periods)}</p>
                    {d.breaks.length > 0 && <p className="mt-0.5 text-xs tabular-nums text-text-secondary">Pausa {rangesText(d.breaks)}</p>}
                  </> :

                <p className="text-sm text-text-secondary">Folga</p>
                }
              </div>
            </li>);

        })}
      </ul>

      {showMeta &&
      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-sm text-text-secondary">
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <ClockIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            Intervalo entre atendimentos: <span className="font-semibold text-text-primary">{bufferLabel(m.bufferMin)}</span>
          </span>
          <div className="flex items-start gap-1.5">
            <CalendarClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            {upcoming.length === 0 ?
          <span>Sem exceções futuras.</span> :

          <span className="min-w-0">
                Exceções:
                <ul className="mt-1 flex flex-col gap-1">
                  {upcoming.slice(0, 4).map((o) =>
              <li key={o.id} className="font-semibold text-text-primary">
                      {describeOverride(m, o)}
                    </li>
              )}
                  {upcoming.length > 4 && <li>+{upcoming.length - 4} outras</li>}
                </ul>
              </span>
          }
          </div>
        </div>
      }
    </div>);

}