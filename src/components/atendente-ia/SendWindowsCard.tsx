/**
 * W8 (12/11/2026, decisões do Christian de 11/11 e OK do plano em 12/11): cartão "Dias e horários em que a Orniplaty manda
 * mensagens", em IA Orniplaty › Automações. Substitui o cartão só de texto "Quando a Orniplaty chama seus clientes".
 * Duas escolhas (mensagens de horário marcado e campanhas), cada uma com dias da semana + uma faixa de horário.
 * Peças (nenhuma nova): `Pill` sm para os dias e `TimeField` "Das"/"Até" (como em Pausas coletivas), `Toggle` com o texto
 * ao lado (como "Repetir todo ano"), `Alert` âmbar para o aviso das campanhas. O rascunho é o da própria tela: salva na
 * mesma barra "Salvar alterações". Regras e textos de erro: data/sendWindows.ts.
 * L10 (16/11/2026): as duas partes têm os nomes fixos dos grupos ("Lembretes de horário marcado" e "Chamar clientes de
 * volta"; "campanhas" só uma vez, como explicação). As frases de regra foram para o "i" de cada parte e do título; fica
 * à vista só a de quem pediu para não receber mensagens. "Ver feriados" no lugar do caminho escrito. Dias e horário na
 * mesma linha quando cabem (o dia de "Chamar clientes de volta" aparece sem rolar a 1512 × 861).
 */
import React from 'react';
import { ShieldCheckIcon } from 'lucide-react';
import { Card, CardDescription, CardTitle, InfoTip } from '../Card';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { Pill } from '../Pill';
import { Toggle } from '../Toggle';
import { TimeField } from '../ui/TimeField';
import { useGuardedNavigate } from '../ui/UnsavedChanges';
import { SEND_WINDOWS_NOTE, campaignHoursLines } from '../../data/automacoes';
import { SEND_DAY_LONG, SEND_DAY_SHORT, campaignWarnings, listText, windowErrors } from '../../data/sendWindows';
import type { SendWindow, SendWindows } from '../../data/sendWindows';

function WindowFields({ id, title, intro, tip, value, onChange, campaign, children }: {id: string;title: string;intro: string;tip: React.ReactNode;value: SendWindow;onChange: (w: SendWindow) => void;campaign: boolean;children?: React.ReactNode;}) {
  const errors = windowErrors(value, campaign);
  const toggleDay = (i: number) => onChange({ ...value, days: value.days.includes(i) ? value.days.filter((d) => d !== i) : [...value.days, i].sort((a, b) => a - b) });
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4 border-t border-border pt-5">
      <div>
        <h3 id={`${id}-titulo`} className="flex items-center gap-1.5 text-base font-bold text-text-primary">
          {title}
          <InfoTip label={`o que acontece fora destes horários (${title})`} content={tip} />
        </h3>
        <p className="mt-0.5 max-w-3xl text-sm text-text-secondary">{intro}</p>
      </div>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-text-primary">Dias</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Dias: ${title}`}>
            {SEND_DAY_SHORT.map((d, i) =>
            <Pill key={d} size="sm" selected={value.days.includes(i)} aria-label={SEND_DAY_LONG[i]} onClick={() => toggleDay(i)}>
                {d}
              </Pill>
            )}
          </div>
          {errors.days &&
          <p role="alert" className="mt-1.5 text-sm text-error">
              {errors.days}
            </p>
          }
        </div>
        <div className="grid w-full max-w-sm grid-cols-2 gap-4 sm:w-80">
          <TimeField label="Das" value={value.start} onChange={(v) => onChange({ ...value, start: v })} />
          <TimeField label="Até" value={value.end} onChange={(v) => onChange({ ...value, end: v })} />
        </div>
      </div>
      {errors.time &&
      <p role="alert" className="-mt-2 max-w-3xl text-sm text-error">
          {errors.time}
        </p>
      }
      {children}
    </section>);

}

const tipList = (lines: string[]) =>
<span className="flex flex-col gap-1.5">
    {lines.map((l) =>
  <span key={l} className="block">
        {l}
      </span>
  )}
  </span>;


export function SendWindowsCard({ value, onChange }: {value: SendWindows;onChange: (next: SendWindows) => void;}) {
  const warnings = campaignWarnings(value.campaigns);
  const navigate = useGuardedNavigate();
  // campaignHoursLines[0] = duas mensagens sem resposta; [1] = quem pediu para não receber (fica à vista).
  const [noAnswerLine, optOutLine] = campaignHoursLines;
  return (
    <Card as="section" padding="lg" aria-labelledby="horario-titulo">
      <CardTitle as="h2" id="horario-titulo" className="flex items-center gap-1.5">
        Dias e horários em que a Orniplaty manda mensagens
        <InfoTip label="o que não segue estes horários" content={tipList(['Fora desses dias e horários, as mensagens automáticas não saem sozinhas.', SEND_WINDOWS_NOTE])} />
      </CardTitle>
      <CardDescription>Você escolhe quando as mensagens automáticas podem sair.</CardDescription>
      <div className="mt-5 flex flex-col gap-5">
        <WindowFields
          id="envio-horario"
          title="Lembretes de horário marcado"
          intro="Confirmação do horário e oferta de vaga da lista de espera."
          tip={tipList([
          'Confirmação que cairia fora desses dias e horários sai antes, no último horário permitido.',
          'Oferta de vaga fora desses dias e horários não sai: a vaga aparece na Agenda para a equipe chamar o cliente. O prazo para o cliente aceitar só conta nesses dias e horários.']
          )}
          value={value.appointments}
          onChange={(w) => onChange({ ...value, appointments: w })}
          campaign={false} />
        
        <WindowFields
          id="envio-campanhas"
          title="Chamar clientes de volta"
          intro="Mensagens que chamam o cliente de volta (as campanhas), sempre entre 7h e 23h."
          tip={tipList(['Mensagem que cairia fora desses dias e horários espera o próximo dia e horário de envio.', noAnswerLine])}
          value={value.campaigns}
          onChange={(w) => onChange({ ...value, campaigns: w })}
          campaign>
          
          {warnings.length > 0 &&
          <Alert variant="warning" title={`Atenção com essa escolha: ${listText(warnings)}.`}>
              Nesses dias e horários, mais clientes bloqueiam ou denunciam o número. Isso diminui o alcance das mensagens da clínica no WhatsApp e pesa contra a clínica numa reclamação. Você pode manter a escolha.
            </Alert>
          }
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Toggle
              checked={value.campaignHolidays}
              onCheckedChange={(v: boolean) => onChange({ ...value, campaignHolidays: v })}
              labelPosition="right"
              label={<span className="text-sm font-semibold text-text-primary">Enviar também em feriados</span>}
              description={value.campaignHolidays ? 'Ligado: essas mensagens saem também nos feriados.' : 'Desligado: nos feriados cadastrados, essas mensagens esperam o próximo dia e horário de envio.'} />
            
            <Button size="sm" variant="neutral" className="shrink-0" onClick={() => navigate('/servicos-equipe?aba=funcionamento')}>
              Ver feriados
            </Button>
          </div>
        </WindowFields>
        <p className="flex items-start gap-2.5 border-t border-border pt-5 text-sm font-semibold text-text-primary">
          <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{optOutLine}</span>
        </p>
      </div>
    </Card>);

}