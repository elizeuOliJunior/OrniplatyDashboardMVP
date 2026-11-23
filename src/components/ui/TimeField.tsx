import React, { useEffect, useId, useRef, useState } from 'react';
import { ClockIcon } from 'lucide-react';
import { FieldShell, PickerPopover, PickerTrigger } from './PickerPopover';

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));

type TimeFieldProps = {
  label?: string;
  /** "HH:MM" or "" */
  value: string;
  onChange: (time: string) => void;
  required?: boolean;
  error?: string;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Passo dos minutos. PADRÃO DO PRODUTO: 5 (igual no Dashboard e no Onboarding). Não usar 15/30 para horários de agenda. */
  minuteStep?: number;
  /** Accessible name when there is no visible label */
  ariaLabel?: string;
  className?: string;
  /** Horários que não podem ser escolhidos (ocupado, pausa, bloqueado…) */
  isTimeDisabled?: (time: string) => boolean;
};

/**
 * Seletor de horário desenhado pelo próprio produto (mesma aparência em qualquer navegador). Arquivo IDÊNTICO no
 * Dashboard e no Onboarding: precisão de 5 min, Esc/clique fora fecham, foco volta ao campo, horários indisponíveis
 * aparecem riscados e desabilitados. G5 P8: só tokens do design system v3.18 (sem hex).
 */
export function TimeField({
  label,
  value,
  onChange,
  required,
  error,
  helperText,
  placeholder = '--:--',
  disabled,
  minuteStep = 5,
  ariaLabel,
  className,
  isTimeDisabled
}: TimeFieldProps) {
  const id = `time-${useId()}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hour, minute] = value ? value.split(':') : ['', ''];
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => pad(i * minuteStep));
  const off = (t: string) => Boolean(isTimeDisabled?.(t));
  const hourOff = (h: string) => minutes.every((m) => off(`${h}:${m}`));

  // Leva a hora e o minuto escolhidos para a área visível; sem valor, começa às 08 (ou no primeiro horário livre depois)
  useEffect(() => {
    if (!open) return;
    const id1 = requestAnimationFrame(() => {
      for (const list of [hourListRef.current, minuteListRef.current]) {
        const sel = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (list && sel) list.scrollTop = sel.offsetTop - list.clientHeight / 2 + sel.clientHeight / 2;else
        if (list === hourListRef.current && list) {
          const target = HOURS.slice(8).find((h) => !hourOff(h)) ?? HOURS.find((h) => !hourOff(h)) ?? '08';
          const el = list.querySelector<HTMLElement>(`[data-hour="${target}"]`);
          if (el) list.scrollTop = Math.max(0, el.offsetTop - 8);
        }
      }
    });
    return () => cancelAnimationFrame(id1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setHour = (h: string) => {
    // mantém o minuto atual se continuar válido; senão escolhe o primeiro minuto livre da hora
    const keep = minute && minutes.includes(minute) && !off(`${h}:${minute}`) ? minute : minutes.find((m) => !off(`${h}:${m}`)) ?? '00';
    onChange(`${h}:${keep}`);
  };
  const setMinute = (m: string) => {
    onChange(`${hour || '08'}:${m}`);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const item = (selected: boolean, dis: boolean) =>
  `flex h-9 w-full shrink-0 items-center justify-center rounded-xs text-sm tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
  dis ? 'cursor-not-allowed text-disabled-text line-through' : selected ? 'bg-primary font-bold text-white' : 'text-text-primary hover:bg-primary-soft'}`;


  const message = error ?? helperText;
  const name = label ?? ariaLabel ?? 'Horário';

  return (
    <FieldShell id={id} label={label} required={required} message={message} error={Boolean(error)} className={className}>
      <PickerTrigger
        ref={triggerRef}
        id={id}
        value={value}
        placeholder={placeholder}
        icon={<ClockIcon className="h-4 w-4" />}
        open={open}
        error={Boolean(error)}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        describedBy={message ? `${id}-message` : undefined}
        ariaLabel={label ? undefined : ariaLabel} />
      
      <PickerPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} width={196} label={label ? `Escolher ${label.toLowerCase()}` : ariaLabel ?? 'Escolher horário'}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="pb-1 text-center text-xs font-semibold text-text-muted">Hora</p>
            <div ref={hourListRef} className="flex h-56 flex-col gap-1 overflow-y-auto overscroll-contain pr-1" role="group" aria-label={`${name}: hora`}>
              {HOURS.map((h) =>
              <button key={h} type="button" data-hour={h} disabled={hourOff(h)} aria-pressed={h === hour} aria-label={`${h} horas`} onClick={() => setHour(h)} className={item(h === hour, hourOff(h))}>
                  {h}
                </button>
              )}
            </div>
          </div>
          <div>
            <p className="pb-1 text-center text-xs font-semibold text-text-muted">Min</p>
            <div ref={minuteListRef} className="flex h-56 flex-col gap-1 overflow-y-auto overscroll-contain pr-1" role="group" aria-label={`${name}: minutos`}>
              {minutes.map((m) => {
                const dis = off(`${hour || '08'}:${m}`);
                return (
                  <button key={m} type="button" disabled={dis} aria-pressed={m === minute} aria-label={`${m} minutos${dis ? ', indisponível' : ''}`} onClick={() => setMinute(m)} className={item(m === minute, dis)}>
                    {m}
                  </button>);

              })}
            </div>
          </div>
        </div>
        <p className="mt-2 border-t border-border pt-2 text-center text-xs text-text-muted">{isTimeDisabled ? 'Horários riscados estão indisponíveis' : 'Escolha a hora e depois os minutos'}</p>
      </PickerPopover>
    </FieldShell>);

}