import React from 'react';
import { ZapIcon } from 'lucide-react';
import { StatusIcon } from '../Card';
import { useToast } from '../ui/Toast';
import { useBusinessWords } from '../../data/empresa';
import type { BusinessWords } from '../../data/segment';
import { hasActiveGroupService, useServices } from '../../data/servicesStore';

/** Mesma hachura da grade do Dia (pausa, fora do horário, folga, bloqueio). */
export const AGENDA_HATCH = 'repeating-linear-gradient(135deg, rgba(122,149,147,0.18) 0 6px, transparent 6px 12px)';

const swatch = 'h-3 w-3 shrink-0 rounded-sm';
const dot = 'h-2 w-2 shrink-0 rounded-full';

/**
 * A-34 (10/11/2026, Christian): as explicações da legenda da Agenda são um grupo só no aviso rápido do DS v4.2
 * (`replace`): abrir uma fecha a anterior, em vez de empilhar até 3.
 */
export const AGENDA_EXPLAIN = 'agenda-explicacao';

type LegendItem = {label: string;swatch: React.ReactNode;title: string;text: string | ((w: BusinessWords) => string);};

/**
 * Textos da legenda (decisão do Christian, 16/10/2026: opção A). Cada item reage ao mouse e, ao clicar, explica a cor
 * com o mesmo aviso usado na faixa de intervalo. Os textos descrevem o que a grade do Dia realmente desenha.
 * W3 (11/11/2026, Christian, G4/A1-10): as bolinhas dos cartões ("A confirmar" laranja, "Concluído" verde) e o alerta
 * de conflito entraram na legenda. Encaixe excepcional sem "dono ou administrador" (um só tipo de usuário).
 */
const ITEMS: LegendItem[] = [
{
  label: 'Livre',
  swatch: <span aria-hidden="true" className={`${swatch} border border-border-strong bg-white`} />,
  title: 'Livre',
  text: 'Horário disponível para agendar. Na visão Dia, clique no espaço livre para criar um agendamento com o profissional e o horário já preenchidos.'
},
{
  label: 'Pausa / fora do horário / folga',
  swatch: <span aria-hidden="true" className={`${swatch} border border-border-strong`} style={{ backgroundColor: 'var(--disabled-surface)', backgroundImage: AGENDA_HATCH }} />,
  title: 'Pausa, fora do horário ou folga',
  text: (w) => `O profissional não atende nesse horário: é pausa, fora do horário dele ou ${w.of}, ou dia de folga. Para mudar, edite o profissional em Serviços e equipe › Equipe ou o horário ${w.of} em Serviços e equipe › Funcionamento.`
},
{
  label: 'Bloqueado',
  swatch: <span aria-hidden="true" className={`${swatch} border border-dashed border-disabled-text`} style={{ backgroundColor: 'var(--surface-muted)', backgroundImage: AGENDA_HATCH }} />,
  title: 'Bloqueado',
  text: 'Horário bloqueado: ninguém consegue agendar aqui. Vem do botão “Bloquear horário ou folga” da Agenda ou de um bloqueio parcial nas exceções do profissional (Serviços e equipe › Equipe).'
},
{
  label: 'Intervalo entre atendimentos',
  swatch: <span aria-hidden="true" className={`${swatch} border border-border bg-background`} />,
  title: 'Intervalo entre atendimentos',
  text: 'Tempo que o profissional precisa entre um atendimento e outro. Nesse espaço não dá para começar nem terminar um atendimento. Para mudar, edite o profissional em Serviços e equipe › Equipe.'
},
{
  label: 'Agendado',
  swatch: <span aria-hidden="true" className={`${swatch} border-l-4 border-primary bg-primary-soft`} />,
  title: 'Agendado',
  text: 'Horário ocupado por um atendimento; clique no card para ver os detalhes. Ícone de lista = veio da lista de espera; nome riscado = cancelado ou faltou.'
},
{
  label: 'A confirmar',
  swatch: <span aria-hidden="true" className={dot} style={{ backgroundColor: 'var(--warning-icon)' }} />,
  title: 'A confirmar',
  text: 'Bolinha laranja no card: o cliente ainda não confirmou o horário. Para ver só esses, use o filtro “Só A confirmar” no Dia ou na Semana.'
},
{
  label: 'Concluído',
  swatch: <span aria-hidden="true" className={dot} style={{ backgroundColor: 'var(--success)' }} />,
  title: 'Concluído',
  text: 'Bolinha verde no card: o atendimento foi fechado como compareceu.'
},
{
  label: 'Conflito',
  swatch: <StatusIcon tone="warning" size={16} />,
  title: 'Conflito',
  text: 'Contorno laranja com alerta: o horário caiu numa folga, pausa, bloqueio ou fora do horário. Nada é cancelado nem movido; o caso fica em Notificações da agenda até alguém remarcar ou cancelar e avisar o cliente.'
},
{
  label: 'Encaixe excepcional',
  swatch: <ZapIcon className="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />,
  title: 'Encaixe excepcional',
  text: 'Atendimento marcado fora da disponibilidade normal (fora do horário ou sem o intervalo), com motivo escrito. Fica registrado e não aparece como conflito.'
}];


/**
 * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): a legenda já lista tipos de cartão (Agendado, Encaixe excepcional), então
 * a aula ganha UMA entrada, com o mesmo desenho de "Agendado" (o cartão da aula é o mesmo). Só aparece com um serviço em
 * grupo ativo, como a aba Turmas.
 */
const AULA_ITEM: LegendItem = {
  // G5 (aulas em grupo, 23/11/2026): texto neutro (vale para todos os serviços do tipo Turma).
  label: 'Turma',
  swatch: <span aria-hidden="true" className={`${swatch} border-l-4 border-primary bg-primary-soft`} />,
  title: 'Turma',
  text: 'Cada dia de uma turma aparece como um cartão só, na coluna do profissional, com quantas vagas estão ocupadas (ex.: 3 de 4) ou “Lotada”. Clique no cartão para ver os clientes, fazer a chamada, mudar o horário ou cancelar aquele dia.'
};

/**
 * Legenda ÚNICA da Agenda: mesmo lugar e mesma ordem em Dia, Semana e Mês, para a troca de visualização nunca
 * deslocar o cabeçalho. Em telas estreitas vira uma grade fixa de 2 colunas.
 * O fundo de hover usa margem negativa igual ao padding: o layout não se mexe. Cursor normal (seta), como no intervalo.
 * A-24 (10/11/2026): cada item pega o clique/toque numa faixa de 32px de altura (área invisível `before:`); o desenho
 * continua com ~20px.
 * P2 (13/11/2026, facilidade de uso): a legenda passou a ficar recolhida atrás do botão "Legenda" (`neutral sm`,
 * `aria-expanded`) da barra da Agenda (AgendaToolbar). Nenhum item saiu; ordem e textos iguais.
 */
export function AgendaLegend({ className = '', id }: {className?: string;id?: string;}) {
  const toast = useToast();
  const w = useBusinessWords();
  const items = hasActiveGroupService(useServices().services) ? [...ITEMS, AULA_ITEM] : ITEMS;
  return (
    <ul id={id} aria-label="Legenda da agenda" className={`grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-semibold text-text-secondary sm:flex sm:flex-wrap sm:gap-x-5 ${className}`}>
      {items.map((it) =>
      <li key={it.label} className="flex min-w-0">
          <button
          type="button"
          aria-label={`${it.label}: ver o que significa`}
          onClick={() => toast({ title: it.title, description: typeof it.text === 'function' ? it.text(w) : it.text, tone: 'info', duration: 8000, replace: AGENDA_EXPLAIN })}
          className="relative -mx-1.5 -my-0.5 inline-flex min-w-0 cursor-default before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-active-surface hover:text-text-primary focus:outline-none focus-visible:bg-active-surface focus-visible:text-text-primary focus-visible:ring-2 focus-visible:ring-primary">
          
            {it.swatch}
            <span className="min-w-0">{it.label}</span>
          </button>
        </li>
      )}
    </ul>);

}