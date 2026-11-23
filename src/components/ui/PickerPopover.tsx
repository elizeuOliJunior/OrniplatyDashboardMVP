import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type PickerPopoverProps = {
  open: boolean;
  /** Field the popover is attached to */
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  children: React.ReactNode;
  /** Popover width in px */
  width: number;
  /** Accessible name of the popover */
  label: string;
  /** ARIA role of the panel (dialog by default; listbox for Select) */
  role?: 'dialog' | 'listbox';
  /** Inner padding classes (`true` = p-4) */
  padding?: string | boolean;
  /** id of the panel (for aria-controls) */
  panelId?: string;
};

/**
 * Floating panel shared by every dropdown / date / time picker of the dashboard.
 * Rendered in a portal (no dialog or scroll container clips it), placed on the side with more
 * room (below by default, above when it does not fit), limited to the free viewport height with
 * its own scroll, kept inside the horizontal viewport. Closes on outside click, Escape, resize
 * or when something else scrolls; the field keeps its value.
 * G5 P8: arquivo IDÊNTICO no Painel e no Onboarding, só tokens do design system v3.18.
 */
export function PickerPopover({ open, anchorRef, onClose, children, width, label, role = 'dialog', padding = 'p-3', panelId }: PickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{top: number;left: number;maxHeight: number;w: number;} | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pad = padding === true ? 'p-4' : padding === false ? '' : padding;

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const margin = 8;
    const w = Math.min(width, window.innerWidth - margin * 2);
    const natural = panel?.scrollHeight ?? 320;
    const spaceBelow = window.innerHeight - r.bottom - margin - 6;
    const spaceAbove = r.top - margin - 6;
    const placeBelow = natural <= spaceBelow || spaceBelow >= spaceAbove;
    const space = Math.max(120, placeBelow ? spaceBelow : spaceAbove);
    const h = Math.min(natural, space);
    const top = placeBelow ? r.bottom + 6 : r.top - h - 6;
    const left = Math.min(Math.max(margin, r.left), Math.max(margin, window.innerWidth - w - margin));
    setPos({ top: Math.max(margin, top), left, maxHeight: space, w });
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onCloseRef.current();
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        anchorRef.current?.focus();
      }
    };
    const onResize = () => onCloseRef.current();
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role={role}
      aria-label={label}
      className={`fixed z-[80] overflow-y-auto overscroll-contain rounded-xl border border-border bg-white shadow-xl ${pad}`}
      style={{
        width: pos?.w ?? Math.min(width, 9999),
        maxWidth: 'calc(100vw - 16px)',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        maxHeight: pos?.maxHeight,
        fontFamily: 'Manrope, system-ui, sans-serif'
      }}>
      
      {children}
    </div>,
    document.body
  );
}

/** Trigger that looks exactly like the design system Input field. */
export const PickerTrigger = React.forwardRef<
  HTMLButtonElement,
  {
    id: string;
    value: string;
    placeholder: string;
    icon: React.ReactNode;
    open: boolean;
    error?: boolean;
    disabled?: boolean;
    onClick: () => void;
    describedBy?: string;
    ariaLabel?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
    haspopup?: 'dialog' | 'listbox';
    controls?: string;
    activeDescendant?: string;
    tabular?: boolean;
  }>(
  function PickerTrigger(
  { id, value, placeholder, icon, open, error, disabled, onClick, describedBy, ariaLabel, onKeyDown, haspopup = 'dialog', controls, activeDescendant, tabular = true },
  ref)
  {
    const state = error ?
    'border-error ring-error-background' :
    open ?
    'border-primary ring-4 ring-primary-soft' :
    'border-border-strong focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary-soft';
    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role={haspopup === 'listbox' ? 'combobox' : undefined}
        disabled={disabled}
        aria-haspopup={haspopup}
        aria-expanded={open}
        aria-controls={open ? controls : undefined}
        aria-activedescendant={open ? activeDescendant : undefined}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={`flex min-h-[var(--size-button-min-height)] w-full items-center justify-between gap-2 rounded-button border bg-white px-3.5 text-left text-sm transition-colors duration-150 focus:outline-none ${state} ${
        disabled ? 'cursor-not-allowed bg-background opacity-60' : ''}`
        }>
        
      <span className={`min-w-0 flex-1 truncate ${tabular ? 'tabular-nums' : ''} ${value ? 'text-text-primary' : 'text-text-muted'}`}>{value || placeholder}</span>
      <span className="shrink-0 text-text-muted" aria-hidden="true">
        {icon}
      </span>
    </button>);

  });

/** Label + message wrapper matching the design system Input. */
export function FieldShell({
  id,
  label,
  required,
  message,
  error,
  className = '',
  children








}: {id: string;label?: string;required?: boolean;message?: string;error?: boolean;className?: string;children: React.ReactNode;}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label &&
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
          {required &&
        <span className="ml-0.5 text-error" aria-hidden="true">
              *
            </span>
        }
        </label>
      }
      {children}
      {message &&
      <p id={`${id}-message`} role={error ? 'alert' : undefined} className={`text-xs ${error ? 'text-error' : 'text-text-secondary'}`}>
          {message}
        </p>
      }
    </div>);

}