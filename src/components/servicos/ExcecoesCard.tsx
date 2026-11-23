import React from 'react';
import { ZapIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { ConflictNotice } from '../ui/Notice';
import { useAgendaData } from '../../data/agendaLive';
import { scheduleConflicts, useTeam, bufferMinutes } from '../../data/availability';
import { exceptionKindLabel, roleLabel, useExceptionLog, useRole } from '../../data/exceptions';
import { mediumDayLabel } from '../../data/agendaStore';
import { bufferLabel } from '../../data/schedule';

/**
 * Regras de intervalo e encaixe (O03 + intervalo configurável 0/5/10/15/30), conflitos atuais da configuração
 * (D6: visíveis, nada cancelado) e o registro de demonstração dos encaixes excepcionais.
 */
export function ExcecoesCard() {
  const data = useAgendaData();
  const { members } = useTeam();
  const log = useExceptionLog();
  const role = useRole();
  const conflicts = scheduleConflicts(data);

  return (
    <Card as="section" padding="lg">
      <CardHeader>
        <CardTitle as="h2">Intervalo, encaixes e conflitos</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm text-text-secondary">
          <li>
            <span className="font-semibold text-text-primary">Intervalo entre atendimentos (por profissional, aba Equipe):</span>{' '}
            {members.map((m) => `${m.name} ${bufferLabel(bufferMinutes(m)).toLowerCase()}`).join(' · ')}. Com “Sem intervalo”, um atendimento pode começar no mesmo minuto em que o anterior termina.
          </li>
          <li>
            <span className="font-semibold text-text-primary">Encaixe excepcional:</span> só dono ou administrador, com motivo e confirmação, para um horário fora do horário habitual em dia aberto ou sem o intervalo. Nunca pela assistente, pela lista de espera ou pelos retornos. Não vale para feriado ou fechamento do dia, folga, pausa (individual ou coletiva), bloqueio nem horário já ocupado. Perfil de demonstração agora: {roleLabel[role]}.
          </li>
        </ul>

        <ConflictNotice
          className="mt-5"
          max={5}
          title={`${conflicts.length} ${conflicts.length === 1 ? 'agendamento em conflito' : 'agendamentos em conflito'} com a configuração atual`}
          items={conflicts.map((c) => ({ key: c.appt.id, name: c.appt.clientName, when: `${mediumDayLabel(c.iso)} ${c.appt.start}–${c.appt.end}`, detail: c.message }))}
          footnote="Nada foi cancelado nem movido. Eles aparecem marcados na Agenda até você remarcar." />
        

        <div className="mt-5">
          <h3 className="text-sm font-bold text-text-primary">Encaixes excepcionais (registro de demonstração)</h3>
          {log.length === 0 ?
          <p className="mt-1 text-sm text-text-muted">Nenhum encaixe excepcional nesta sessão. No produto, o registro é gravado no servidor.</p> :

          <ul className="mt-2 flex flex-col gap-2">
              {log.map((e) =>
            <li key={e.id} className="flex items-start gap-3 rounded-[12px] border border-border px-4 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#FEF3C7] text-[#92400E]">
                    <ZapIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <p className="min-w-0 flex-1 text-sm text-text-primary">
                    <span className="font-bold">{e.client}</span> com {e.professional} · {mediumDayLabel(e.iso)} {e.start}–{e.end}
                    <span className="block text-text-secondary">
                      {e.kinds.map((k) => exceptionKindLabel[k]).join(' e ')} · motivo: {e.reason} · autorizado por {roleLabel[e.by].toLowerCase()} às {e.at}
                    </span>
                  </p>
                </li>
            )}
            </ul>
          }
        </div>
      </CardContent>
    </Card>);

}