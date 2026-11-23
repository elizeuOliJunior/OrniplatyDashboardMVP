import React from 'react';
import { MessageCircleIcon } from 'lucide-react';
import { AttentionRow } from '../ui/Notice';
import { StatusPill } from '../ui/StatusPill';
import { Button } from '../Button';
import { EnterMotion, ExpandMotion } from '../Card';
import { agendaProfessionalOf } from '../../data/availability';
import { TODAY_ISO } from '../../data/agendaStore';
import type { CalAppointment } from '../../data/agendaStore';
import { changeText } from '../../data/conflictCases';
import type { ConflictCase } from '../../data/conflictCases';

const dayMs = 86400000;
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();

/** "Hoje", "Ontem" ou dd/mm, pelo relógio do protótipo. W3: "Amanhã" para o dia seguinte. */
export function shortDay(iso: string) {
  const diff = Math.round((toDate(TODAY_ISO) - toDate(iso)) / dayMs);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff === -1) return 'Amanhã';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const proOf = (id: string) => agendaProfessionalOf(id);

/*
 * P1 (13/11/2026, facilidade de uso): o dia ("Ontem", "Hoje", dd/mm) sai de baixo do horário e vai para o começo da
 * linha de detalhe ("Ontem · Peeling químico · Rafael"). A coluna do horário fica só com a hora, igual a "Atendimentos
 * de hoje", e horário, nome, etiqueta e seta ficam numa linha só. Vale para as três linhas que usam `AttentionRow`
 * (fechamento, conflito, resolvido), para a lista "Notificações da agenda" continuar com um desenho só.
 */

/*
 * P2 (13/11/2026, facilidade de uso): movimento sutil de "Notificações da agenda" (regra da etapa: 150–200 ms,
 * ease-out, nada com "reduzir movimento").
 * L13 (17/11/2026): `ExpandMotion` e `EnterMotion` agora são as peças `Motion` do design system (v4.8, vindas deste
 * piloto, mesmas medidas). As cópias locais saíram; quem importa daqui continua importando os mesmos nomes.
 */
export { ExpandMotion, EnterMotion };

/** Fechamento pendente (fonte única: `pendingClosures` de data/legado.ts). Usado no Início e na Agenda. */
export function ClosureRow({ iso, appt, onOpen }: {iso: string;appt: CalAppointment;onOpen: () => void;}) {
  const pro = proOf(appt.professionalId);
  return (
    <AttentionRow
      time={appt.start}
      title={appt.clientName}
      meta={`${shortDay(iso)} · ${appt.service}${pro ? ` · ${pro.name}` : ''}`}
      dotColor={pro?.color}
      tone="warning"
      status="A fechar"
      onClick={onOpen}
      ariaLabel={`${appt.clientName}, ${shortDay(iso)} ${appt.start}, ${appt.service}: aguardando fechamento. Abrir atendimento`} />);


}

/** Agendamento em conflito com pausa, bloqueio, folga ou horário. W3 (G1): estado "Falta resolver". */
export function ConflictRow({ iso, appt, message, onOpen }: {iso: string;appt: CalAppointment;message: string;onOpen: () => void;}) {
  const pro = proOf(appt.professionalId);
  return (
    <AttentionRow
      time={appt.start}
      title={appt.clientName}
      meta={`${shortDay(iso)} · ${appt.service}${pro ? ` · ${pro.name}` : ''} · ${message}`}
      dotColor={pro?.color}
      tone="error"
      status="Falta resolver"
      onClick={onOpen}
      ariaLabel={`${appt.clientName}, ${shortDay(iso)} ${appt.start}: falta resolver o conflito. ${message} Abrir atendimento`} />);


}

/**
 * W3 (G1): caso "Falta avisar". Mesma linha das outras (horário, nome, detalhe, etiqueta), com as três ações da decisão:
 * "Chamar no WhatsApp" (conversa ao lado com a mensagem pronta), "Avisado" (fecha o caso) e "Não atendeu" (registra a
 * tentativa e mantém aberto). Botões `sm` (ações em linha de lista).
 * L3 (16/11/2026, facilidade de uso): o próximo passo é chamar o cliente, então "Chamar no WhatsApp" é o botão cheio
 * (`primary`: decisão do Christian de 11/11 para abrir conversa no WhatsApp; a variante `whatsapp` do DS está sem uso) e
 * "Avisado" virou `secondary`. "Não atendeu" continua `neutral`. O que cada botão faz não mudou.
 */
export function NotifyRow({ c, onOpen, onChat, onNotified, onNoAnswer }: {c: ConflictCase;onOpen: () => void;onChat: () => void;onNotified: () => void;onNoAnswer: () => void;}) {
  const pro = proOf(c.professionalId);
  return (
    <div className="flex flex-col gap-2 py-2">
      <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 rounded-button px-2 py-1 text-left transition-colors hover:bg-hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${c.client}: falta avisar. ${changeText(c)}. Abrir atendimento`}>
        {/* P2: igual às outras linhas (P1): a coluna do horário só tem a hora; o dia abre a linha de detalhe. */}
        <span className="w-12 shrink-0">
          <span className="block text-sm font-bold tabular-nums text-text-primary line-through decoration-border-strong">{c.start}</span>
        </span>
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate text-sm font-bold text-text-primary">{c.client}</span>
          <span className="flex items-start gap-1.5 text-sm text-text-secondary">
            {pro && <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pro.color }} aria-hidden="true" />}
            <span className="min-w-0">
              {shortDay(c.iso)} · {c.service} · {changeText(c)}. O cliente ainda não sabe.
              {c.attempts.length > 0 ? ` Tentativas sem resposta: ${c.attempts.join(', ')}.` : ''}
            </span>
          </span>
        </span>
        <StatusPill tone="warning" label="Falta avisar" />
      </button>
      <div className="flex flex-wrap gap-2 pl-2 sm:pl-[60px]">
        <Button size="sm" leftIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={onChat}>
          Chamar no WhatsApp
        </Button>
        <Button size="sm" variant="secondary" onClick={onNotified}>
          Avisado
        </Button>
        <Button size="sm" variant="neutral" onClick={onNoAnswer}>
          Não atendeu
        </Button>
      </div>
    </div>);

}

/** W3 (G1): caso resolvido hoje (fica visível no dia, com o motivo de ter fechado). */
export function ResolvedRow({ c, onOpen }: {c: ConflictCase;onOpen: () => void;}) {
  const pro = proOf(c.professionalId);
  const what = changeText(c);
  return (
    <AttentionRow
      time={c.start}
      title={c.client}
      meta={`${shortDay(c.iso)} · ${c.service}${what ? ` · ${what}` : ''} · ${c.outcome ?? ''}`}
      dotColor={pro?.color}
      tone="success"
      status="Resolvido"
      onClick={onOpen}
      ariaLabel={`${c.client}: resolvido. ${c.outcome ?? ''} Abrir atendimento`} />);


}