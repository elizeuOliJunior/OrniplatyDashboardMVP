import { wordsNow } from '../../data/segment';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { ConflictNotice } from '../ui/Notice';
import { Button } from '../Button';
import { Select } from '../Select';
import { Checkbox } from '../Checkbox';
import { InfoTip } from '../Card';
import { professionalOptions, shortDate } from '../../data/catalogo';
import { DateField } from '../ui/DateField';
import { TimeField } from '../ui/TimeField';
import { useAgendaData } from '../../data/agendaLive';
import { clinicDay, getTeam, saveMember } from '../../data/availability';
import type { CalBlock } from '../../data/agendaStore';
import { newId } from '../../data/schedule';
import { toMinutes } from '../../utils/time';
import { aulaChangeMessage, aulasOn, cancelAula, cancelGivesMakeup, useAulasVersion } from '../../data/aulas';
import { noteAulaChange } from '../../data/conflictCases';

const reasons = [
{ value: 'almoco', label: 'Almoço' },
{ value: 'folga', label: 'Folga' },
{ value: 'compromisso', label: 'Compromisso pessoal' },
{ value: 'manutencao', label: 'Manutenção da sala' },
{ value: 'outro', label: 'Outro motivo' }];


/** G2 (F-038, AGE-24): `who` e `affected` saíram do objeto salvo (eram gravados e descartados pela Agenda); o nome e a
 * contagem continuam só no aviso desta janela. */
export type HorarioBloqueado = {whoId: string;date: string;from: string;to: string;reason: string; /** G2 (F-036): id do bloqueio editado */id?: string;previousDate?: string;};

/** Motivo gravado no rótulo ("Bloqueado · almoço") de volta para a opção da lista; desconhecido = "Outro motivo". */
export const reasonValueOfLabel = (label: string) => reasons.find((r) => label === `Bloqueado · ${r.label.toLowerCase()}`)?.value ?? 'outro';

type BloquearHorarioModalProps = {
  open: boolean;
  onClose: () => void;
  /** ISO date to prefill (defaults to 2026-10-01) */
  defaultDate?: string;
  onSaved?: (block: HorarioBloqueado) => void;
  /** G2 (F-036): bloqueio manual existente a editar (mesmo formulário, mesmas validações). */
  editing?: {date: string;block: CalBlock;} | null;
};

/**
 * W3 (11/11/2026, Christian):
 *  - A1-16: o motivo começa VAZIO e é obrigatório (saiu o "Compromisso pessoal" pré-escolhido).
 *  - G2 / A1-04: "Folga" grava uma AUSÊNCIA do profissional, a mesma da aba Ausências de Serviços e equipe (exceção por data
 *    do cadastro do profissional: `off` no dia inteiro, `block` só no período; motivo interno vazio, para o cabeçalho dizer
 *    só "Folga"). Um fato, um registro: cabeçalho da coluna, marcador de conflito, Ausências e "Próxima ausência" mostram a
 *    mesma coisa. Folga pede UM profissional (para a clínica inteira, o caminho é Serviços e equipe › Funcionamento › datas
 *    especiais) e tem "Dia inteiro" (marcado por padrão). Na edição de um bloqueio já existente, "Folga" não aparece.
 * L3 (16/11/2026, etapa de facilidade de uso, só visual):
 *  - A janela fica parada: no computador ela fica presa no alto da tela (não centraliza de novo quando campos aparecem).
 *  - A data vem primeiro, sozinha na linha (para ninguém registrar a folga de amanhã no dia de hoje). Data padrão e campos iguais.
 *  - O aviso de onde a folga fica (Serviços e equipe › Equipe › Ausências) foi para o "i" ao lado de "Dia inteiro"; saiu do toast.
 *  - Toast com conflito: título + uma frase (com "Nada foi cancelado nem movido") e o botão "Ver quem falta resolver", que abre
 *    Notificações da agenda (`/agenda?secao=notificacoes`). Antes: "Veja em Notificações da agenda" escrito no texto.
 * L13 (17/11/2026): "presa no alto" agora é a prop `anchor="top"` (mesmas medidas do `Modal anchor="top"` do DS 4.9) em vez
 *  das classes feitas à mão. Mesma posição no computador (64px do topo); no celular continua embaixo.
 */
export function BloquearHorarioModal({ open, onClose, defaultDate = '2026-10-01', onSaved, editing }: BloquearHorarioModalProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const { appointments } = useAgendaData();
  const [form, setForm] = useState({ who: 'todos', date: '2026-10-01', from: '', to: '', reason: '' });
  const [wholeDay, setWholeDay] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        editing ?
        { who: editing.block.professionalId ?? 'todos', date: editing.date, from: editing.block.start, to: editing.block.end, reason: reasonValueOfLabel(editing.block.label) } :
        { who: 'todos', date: defaultDate, from: '', to: '', reason: '' }
      );
      setWholeDay(true);
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isFolga = form.reason === 'folga';
  const fullDay = isFolga && wholeDay;
  const reasonOptions = editing ? reasons.filter((r) => r.value !== 'folga') : reasons;
  const invalidRange = Boolean(!fullDay && form.from && form.to && form.to <= form.from);
  const missingTime = !fullDay && (!form.from || !form.to);
  const missingReason = !form.reason;
  const folgaNeedsPro = isFolga && form.who === 'todos';
  // G2 (F-036): mesma regra única da agenda. Dia em que a clínica não abre não precisa de bloqueio (nenhum horário é
  // oferecido); profissional arquivado não está mais na equipe ativa.
  const day = clinicDay(form.date);
  const closedDay = !day.open ? `${wordsNow().The} não abre em ${shortDate(form.date)}${day.why ? ` (${day.why})` : ''}. Não é preciso bloquear: nenhum horário é oferecido nesse dia.` : null;
  const archivedPro = form.who !== 'todos' && !professionalOptions.some((p) => p.value === form.who);
  const archivedName = archivedPro ? getTeam().members.find((m) => m.id === form.who)?.name ?? 'Este profissional' : '';
  const proError = archivedPro ? `${archivedName} está arquivado. Escolha um profissional ativo ou toda a equipe.` : null;
  const proName = form.who === 'todos' ? 'toda a equipe' : professionalOptions.find((p) => p.value === form.who)?.label ?? '';

  /** Agendamentos que ficariam dentro do período (ou do dia inteiro, na folga). Nada é cancelado nem movido. */
  const affected = useMemo(() => {
    if (folgaNeedsPro) return [];
    if (!fullDay && (!form.from || !form.to || invalidRange)) return [];
    const s = fullDay ? 0 : toMinutes(form.from);
    const e = fullDay ? 24 * 60 : toMinutes(form.to);
    return (appointments[form.date] ?? []).filter(
      (a) =>
      a.status !== 'cancelled' &&
      a.status !== 'completed' &&
      a.status !== 'no_show' && (
      form.who === 'todos' || a.professionalId === form.who) &&
      toMinutes(a.start) < e &&
      s < toMinutes(a.end)
    );
  }, [appointments, form.date, form.from, form.to, form.who, invalidRange, fullDay, folgaNeedsPro]);

  /**
   * G2 (aulas em grupo, 23/11/2026; CONTRATO NOVO): aulas dentro do bloqueio ou da folga, uma linha cada ("Pilates em grupo,
   * 17:00, 3 clientes"). Ao confirmar, cada uma é CANCELADA pelo mesmo caminho de "Cancelar esta aula" (os clientes são
   * avisados pela automação ou entram em "Falta avisar"). Bloquear o dia inteiro é como a empresa cancela as aulas de um dia.
   */
  useAulasVersion();
  const affectedAulas = useMemo(() => {
    if (folgaNeedsPro || closedDay) return [];
    if (!fullDay && (!form.from || !form.to || invalidRange)) return [];
    const s = fullDay ? 0 : toMinutes(form.from);
    const e = fullDay ? 24 * 60 : toMinutes(form.to);
    return aulasOn(form.date).filter((a) => !a.cancelled && !a.done && (form.who === 'todos' || a.professionalId === form.who) && toMinutes(a.start) < e && s < toMinutes(a.end));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, form.from, form.to, form.who, invalidRange, fullDay, folgaNeedsPro, closedDay, open]);
  const aulaReason = form.reason && form.reason !== 'outro' && form.reason !== 'folga' ? reasons.find((r) => r.value === form.reason)?.label : undefined;
  /** Cancela as aulas do bloqueio. Devolve a frase do aviso e o botão do próximo passo. */
  const cancelAulas = () => {
    let notify = false;
    let people = 0;
    affectedAulas.forEach((a) => {
      const warn = a.clients.filter((c) => c.state !== 'avisou');
      people += warn.length;
      const mode = noteAulaChange(
        { key: a.key, id: a.id, serviceName: a.serviceName, iso: a.iso, start: a.start, professionalId: a.professionalId },
        warn.map((c) => ({ clientId: c.clientId, name: c.name, message: aulaChangeMessage(c.name, a.serviceName, a.iso, a.start, null, aulaReason) })),
        { kind: 'cancelado' }
      );
      cancelAula(a.key, aulaReason);
      if (mode === 'avisar' && warn.length) notify = true;
    });
    const n = affectedAulas.length;
    const text = `${n === 1 ? '1 aula cancelada' : `${n} aulas canceladas`}: ${people === 0 ? 'não havia clientes para avisar' : notify ? `${people === 1 ? 'o cliente está' : `os ${people} clientes estão`} em Falta avisar` : `a assistente avisou ${people === 1 ? 'o cliente' : `os ${people} clientes`}`}.`;
    return { text, notify };
  };

  /** L3: com conflito, uma frase (com a frase de segurança) e o botão para a lista do que falta resolver. */
  const conflictLine = affected.length > 0 ? `${affected.length} ${affected.length === 1 ? 'agendamento ficou' : 'agendamentos ficaram'} em conflito. Nada foi cancelado nem movido.` : '';
  const conflictAction = affected.length > 0 ? { action: { label: 'Ver quem falta resolver', onClick: () => navigate('/agenda?secao=notificacoes') } } : {};
  /** G2: aula cancelada pelo bloqueio com clientes em "Falta avisar" → o mesmo destino (Notificações da agenda). */
  const notifyAction = { action: { label: 'Ver quem falta avisar', onClick: () => navigate('/agenda?secao=notificacoes') } };

  /** G2: folga = ausência do profissional (mesmo registro da aba Ausências). */
  const saveAbsence = () => {
    const member = getTeam().members.find((m) => m.id === form.who);
    if (!member) return;
    const what = `${member.name} · ${shortDate(form.date)}${fullDay ? ' · dia inteiro' : `, das ${form.from} às ${form.to}`}`;
    // G2: as aulas da folga são canceladas (avisando os clientes) ANTES de gravar a ausência.
    const aulas = affectedAulas.length ? cancelAulas() : null;
    saveMember({
      ...member,
      overrides: [
      ...member.overrides,
      { id: newId('ov'), from: form.date, to: form.date, kind: fullDay ? 'off' : 'block', ranges: fullDay ? [] : [{ start: form.from, end: form.to }], reason: fullDay ? '' : 'Folga' }]

    });
    toast({
      title: 'Folga registrada',
      description: `${conflictLine ? `${what}: ${conflictLine.charAt(0).toLowerCase()}${conflictLine.slice(1)}` : `${what}.`}${aulas ? ` ${aulas.text}` : ''}`,
      duration: 8000,
      ...(conflictLine ? conflictAction : aulas?.notify ? notifyAction : {})
    });
  };

  const save = () => {
    setSubmitted(true);
    if (missingTime || invalidRange || missingReason || closedDay || proError || folgaNeedsPro) return;
    if (isFolga) {
      saveAbsence();
      onClose();
      return;
    }
    onSaved?.({
      whoId: form.who,
      date: form.date,
      from: form.from,
      to: form.to,
      reason: reasons.find((r) => r.value === form.reason)?.label ?? '',
      ...(editing ? { id: editing.block.id, previousDate: editing.date } : {})
    });
    const what = `${shortDate(form.date)}, das ${form.from} às ${form.to}, para ${proName}`;
    // G2: aulas dentro do bloqueio são canceladas, avisando os clientes.
    const aulas = affectedAulas.length ? cancelAulas() : null;
    toast({
      title: editing ? 'Bloqueio atualizado' : 'Horário bloqueado',
      description: `${conflictLine ? `${what}: ${conflictLine.charAt(0).toLowerCase()}${conflictLine.slice(1)}` : `${what}.${aulas ? '' : ' A assistente não oferece esse período.'}`}${aulas ? ` ${aulas.text}` : ''}`,
      ...(conflictLine || aulas ? { duration: 8000 } : {}),
      ...(conflictLine ? conflictAction : aulas?.notify ? notifyAction : {})
    });
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="md"
      // L3/L13: presa no alto da tela no computador (não pula quando aparecem campos). No celular continua embaixo.
      anchor="top"
      title={editing ? 'Editar bloqueio' : 'Bloquear horário ou folga'}
      description="A assistente não oferece horários dentro do período bloqueado."
      footer={
      <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>{editing ? 'Salvar bloqueio' : isFolga ? 'Registrar folga' : 'Bloquear'}</Button>
        </>
      }>
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* L3: a data primeiro, sozinha na linha. */}
        <div className="sm:col-span-2">
          <DateField label="Data" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} error={closedDay ?? undefined} />
        </div>
        <Select
          label="Motivo"
          required
          placeholder="Escolha o motivo"
          options={reasonOptions}
          value={form.reason || undefined}
          onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
          error={submitted && missingReason ? 'Escolha o motivo.' : undefined} />
        
        <Select
          label="Para quem"
          options={[...(isFolga ? [] : [{ value: 'todos', label: 'Toda a equipe' }]), ...professionalOptions, ...(archivedPro ? [{ value: form.who, label: `${archivedName} (arquivado)` }] : [])]}
          value={isFolga && form.who === 'todos' ? undefined : form.who}
          placeholder="Escolha o profissional"
          onChange={(v) => setForm((f) => ({ ...f, who: v }))}
          error={submitted && folgaNeedsPro ? 'Folga é de um profissional. Escolha quem vai faltar.' : undefined} />
        
        {proError &&
        <p role="alert" className="text-sm text-error sm:col-span-2">
            {proError}
          </p>
        }
        {isFolga &&
        <div className="flex items-center gap-1 sm:col-span-2">
            <Checkbox size="sm" label={<span className="font-semibold">Dia inteiro</span>} checked={wholeDay} onChange={(v: boolean) => setWholeDay(v)} />
            {/* L3: antes era um aviso fixo nesta janela e uma frase no toast; agora fica no "i". */}
            <InfoTip
            label="a folga"
            content={`A folga fica no cadastro do profissional, em Serviços e equipe › Equipe › Ausências, a mesma usada por toda a agenda. Para fechar a ${wordsNow().noun} inteira num dia, use Serviços e equipe › Funcionamento.`} />
          
          </div>
        }
        {!fullDay &&
        <>
            <TimeField label="Das" value={form.from} onChange={(v) => setForm((f) => ({ ...f, from: v }))} error={submitted && !form.from ? 'Informe o início.' : undefined} />
            <TimeField
            label="Às"
            value={form.to}
            onChange={(v) => setForm((f) => ({ ...f, to: v }))}
            error={submitted && !form.to ? 'Informe o fim.' : invalidRange ? 'O fim precisa ser depois do início.' : undefined} />
          
          </>
        }
        {affectedAulas.length > 0 &&
        <ConflictNotice
          className="sm:col-span-2"
          title={`${affectedAulas.length} ${affectedAulas.length === 1 ? 'aula fica' : 'aulas ficam'} dentro ${isFolga ? 'desta folga' : 'deste bloqueio'}`}
          items={affectedAulas.map((a) => {
            const n = a.clients.filter((c) => c.state !== 'avisou').length;
            return { key: a.key, name: a.serviceName, when: `${a.start}, ${n} ${n === 1 ? 'cliente' : 'clientes'}` };
          })}
          footnote={`Ao confirmar, ${affectedAulas.length === 1 ? 'esta aula é cancelada' : 'estas aulas são canceladas'} e os clientes são avisados.${cancelGivesMakeup() ? ' Os clientes ganham reposição.' : ''}`} />

        }
        <ConflictNotice
          className="sm:col-span-2"
          title={`${affected.length} ${affected.length === 1 ? 'agendamento fica' : 'agendamentos ficam'} dentro ${isFolga ? 'desta folga' : 'deste bloqueio'}`}
          items={affected.map((a) => ({ key: a.id, name: a.clientName, when: `${a.start}–${a.end}` }))}
          footnote="Nada será cancelado nem movido. Eles ficam em Notificações da agenda › Falta resolver até você remarcar ou cancelar; depois, falta avisar o cliente." />
        
      </div>
    </AppModal>);

}