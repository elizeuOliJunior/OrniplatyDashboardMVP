import { wordsNow } from '../../data/segment';
import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { useToast } from '../ui/Toast';
import { ScheduleSwitch } from '../schedule/ScheduleEditor';
import { setAgendaPrefs, useAgendaPrefs } from '../../data/agendaPrefs';
import { useTeam } from '../../data/availability';

/**
 * Configurações › Agenda. Preferência de VISUALIZAÇÃO por clínica: nunca muda expediente, jornadas, exceções nem
 * agendamentos. Aplica na hora (sem botão salvar). Protótipo: vale enquanto a página estiver aberta.
 */
export function AgendaSection() {
  const toast = useToast();
  const { hideNonWorkingDays } = useAgendaPrefs();
  const { hours, blocks } = useTeam();
  const closedWeekdays = hours.filter((h) => !h.open).map((h) => h.day.replace('-feira', '').toLowerCase());
  const closures = blocks.filter((b) => b.kind === 'closed').length;
  const openings = blocks.filter((b) => b.kind === 'open').length;

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" padding="lg" aria-label="Exibição da agenda">
        <CardHeader>
          <CardTitle as="h2">
            Exibição da agenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleSwitch
            checked={hideNonWorkingDays}
            onChange={(v) => {
              setAgendaPrefs({ hideNonWorkingDays: v });
              toast({ title: v ? 'Dias sem atendimento ocultos' : 'Todos os dias visíveis', description: 'Só muda a exibição. Horários, folgas e agendamentos continuam iguais.', tone: 'info' });
            }}
            label="Ocultar dias sem atendimento" />
          
          <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-secondary">
            <li>
              <strong className="text-text-primary">Desligado (padrão):</strong> a agenda mostra sempre os 7 dias, de segunda a domingo. Dias em que {wordsNow().the} está {wordsNow().closed} aparecem destacados e não oferecem horários.
            </li>
            <li>
              <strong className="text-text-primary">Ligado:</strong> a visão Semana esconde os dias em que {wordsNow().the} está {wordsNow().closed} (dias fechados da semana, feriados e fechamentos). Aberturas extraordinárias continuam aparecendo. Na visão Dia, as setas pulam esses dias; o calendário continua abrindo qualquer data. A visão Mês mantém as 7 colunas e só destaca os dias fechados.
            </li>
            <li>Dias ocultos que tiverem agendamentos aparecem num aviso acima da semana, com atalho para abrir cada um. Nada é cancelado, movido nem apagado.</li>
            <li>A preferência vale para {wordsNow().the} {wordsNow().fem ? 'inteira' : 'inteiro'} e não muda a disponibilidade de nenhum profissional.</li>
          </ul>
          <p className="mt-4 rounded-[10px] bg-[#F4F8F8] px-3 py-2 text-sm text-text-secondary">
            Hoje: {closedWeekdays.length ? `fechado ${closedWeekdays.join(' e ')}` : 'aberto nos 7 dias da semana'}
            {closures ? ` · ${closures} ${closures === 1 ? 'data de fechamento' : 'datas de fechamento'}` : ''}
            {openings ? ` · ${openings} ${openings === 1 ? 'abertura extraordinária' : 'aberturas extraordinárias'}` : ''}.{' '}
            <Link to="/servicos-equipe" className="font-semibold text-primary underline-offset-2 hover:underline">
              Ajustar em Serviços e equipe
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>);

}