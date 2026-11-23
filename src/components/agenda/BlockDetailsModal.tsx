import React, { useState } from 'react';
import { CalendarClockIcon, ClockIcon, LockIcon, PencilIcon, Trash2Icon, UserIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ModalActions } from '../ui/ModalActions';
import { Button } from '../Button';
import { labelValueIconClass, labelValueItemClass } from '../Card';
import { getTeam } from '../../data/availability';
import { longDayLabel } from '../../data/agendaStore';
import type { CalBlock } from '../../data/agendaStore';
import type { CalAppointment } from '../../data/agendaStore';
import { toMinutes } from '../../utils/time';

/** Agendamentos que já estão dentro do bloqueio (o bloqueio nunca cancela nem move nada). */
export function appointmentsUnderBlock(block: CalBlock, list: CalAppointment[]) {
  return list.filter(
    (a) =>
    a.status !== 'cancelled' &&
    a.status !== 'completed' &&
    a.status !== 'no_show' && (
    block.professionalId === null || a.professionalId === block.professionalId) &&
    toMinutes(a.start) < toMinutes(block.end) &&
    toMinutes(block.start) < toMinutes(a.end)
  );
}

type BlockDetailsModalProps = {
  target: {date: string;block: CalBlock;} | null;
  appointments: CalAppointment[];
  onClose: () => void;
  onEdit: (target: {date: string;block: CalBlock;}) => void;
  onRemove: (target: {date: string;block: CalBlock;}) => void;
};

/**
 * G2 (F-036): detalhes de um bloqueio manual da Agenda, com Editar e Remover. Remover pede confirmação e não mexe em
 * nenhum agendamento. Bloqueios que vêm da ausência do profissional (Serviços e equipe › Equipe) não abrem aqui.
 * RV13 (20/11/2026): cada item usa a receita de rótulo e valor do DS 6.5 (`labelValueItemClass`/`labelValueIconClass`).
 */
export function BlockDetailsModal({ target, appointments, onClose, onEdit, onRemove }: BlockDetailsModalProps) {
  const [confirming, setConfirming] = useState(false);
  const block = target?.block;
  const who = block ? block.professionalId ? getTeam().members.find((m) => m.id === block.professionalId)?.name ?? 'Profissional removido' : 'Toda a equipe' : '';
  const reason = block ? block.label.replace(/^Bloqueado · /, '') : '';
  const inside = block ? appointmentsUnderBlock(block, appointments) : [];
  const row = (icon: React.ReactNode, label: string, value: React.ReactNode) =>
  <div className={labelValueItemClass()}>
      <span className={`${labelValueIconClass()} text-text-muted`} aria-hidden="true">
        {icon}
      </span>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="break-words text-sm font-semibold text-text-primary">{value}</dd>
    </div>;

  return (
    <>
      <AppModal
        open={!!target && !confirming}
        onClose={onClose}
        unsavedGuard={false}
        title="Horário bloqueado"
        description="A assistente não oferece horários dentro deste período."
        footer={
        target &&
        <ModalActions equal={2}>
              <Button variant="dangerSoft" leftIcon={<Trash2Icon className="h-4 w-4" />} onClick={() => setConfirming(true)}>
                Remover bloqueio
              </Button>
              <Button leftIcon={<PencilIcon className="h-4 w-4" />} onClick={() => onEdit(target)}>
                Editar bloqueio
              </Button>
            </ModalActions>

        }>
        
        {target && block &&
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {row(<CalendarClockIcon className="h-4 w-4" />, 'Data', longDayLabel(target.date))}
            {row(<ClockIcon className="h-4 w-4" />, 'Horário', <span className="tabular-nums">{block.start} às {block.end}</span>)}
            {row(<UserIcon className="h-4 w-4" />, 'Para quem', who)}
            {row(<LockIcon className="h-4 w-4" />, 'Motivo', reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : '—')}
            {inside.length > 0 &&
          <p className="text-sm text-text-secondary sm:col-span-2">
                {inside.length === 1 ? '1 agendamento continua' : `${inside.length} agendamentos continuam`} dentro deste bloqueio ({inside.map((a) => `${a.start} ${a.clientName}`).join(', ')}). Nada foi cancelado nem movido.
              </p>
          }
          </dl>
        }
      </AppModal>
      <ConfirmDialog
        open={!!target && confirming}
        onClose={() => setConfirming(false)}
        danger
        focusCancel
        title="Remover este bloqueio?"
        description={target && block ? `${longDayLabel(target.date)}, das ${block.start} às ${block.end} (${who}). O período volta a ser oferecido pela agenda e pela assistente, se estiver dentro do horário.` : ''}
        confirmLabel="Remover bloqueio"
        onConfirm={() => {
          if (target) onRemove(target);
          setConfirming(false);
        }} />
      
    </>);

}