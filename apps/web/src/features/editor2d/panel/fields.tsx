/**
 * Inputs that commit once, on Enter or blur, so each change is one undo step
 * (the UI kit's inputs report every keystroke). They also commit when they
 * unmount, so a value typed just before clicking elsewhere is not lost.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn, Field } from '../../../ui';

const INPUT = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink placeholder:text-ink-faint';

function useCommit<T>(value: T, parse: (text: string) => T | null, onCommit: (value: T) => void) {
  const [text, setText] = useState<string | null>(null);
  const latest = useRef({ text, value, parse, onCommit });
  latest.current = { text, value, parse, onCommit };
  const commit = () => {
    const cur = latest.current;
    if (cur.text === null) return;
    latest.current = { ...cur, text: null };
    setText(null);
    const next = cur.parse(cur.text);
    if (next !== null && next !== cur.value) cur.onCommit(next);
  };
  useEffect(() => () => {
    const cur = latest.current;
    if (cur.text === null) return;
    const next = cur.parse(cur.text);
    if (next !== null && next !== cur.value) cur.onCommit(next);
  }, []);
  const cancel = () => {
    latest.current = { ...latest.current, text: null };
    setText(null);
  };
  return { text, setText, commit, cancel };
}

export interface CommitNumberProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Arrow-key step (Shift multiplies by 10). */
  step?: number;
  unit?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
}

export function CommitNumber({ value, onCommit, min = 0, max = 1_000_000, step = 10, unit, ariaLabel, id, disabled }: CommitNumberProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const parse = (text: string): number | null => {
    const n = Number(text.trim().replace(',', '.'));
    return text.trim() !== '' && Number.isFinite(n) ? clamp(Math.round(n)) : null;
  };
  const { text, setText, commit, cancel } = useCommit(value, parse, onCommit);
  return (
    <span className="relative block">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(INPUT, unit && 'pr-9', 'tabular-nums disabled:bg-sunken disabled:text-ink-soft')}
        value={text ?? String(Math.round(value))}
        onChange={(e) => setText(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            cancel();
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = parse(text ?? String(value)) ?? value;
            const next = clamp(base + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
            cancel();
            if (next !== value) onCommit(next);
          }
        }}
      />
      {unit && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ink-faint">{unit}</span>}
    </span>
  );
}

export function NumField({ label, hint, ...rest }: CommitNumberProps & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <CommitNumber {...rest} />
    </Field>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  hint?: string;
  /** Allow committing an empty value (clearing an optional field). */
  allowEmpty?: boolean;
}

export function TextField({ label, value, onCommit, placeholder, hint, allowEmpty }: TextFieldProps) {
  const { text, setText, commit, cancel } = useCommit<string>(value, (t) => (t.trim() || allowEmpty ? t.trim() : null), onCommit);
  return (
    <Field label={label} hint={hint}>
      <input
        type="text"
        className={INPUT}
        placeholder={placeholder}
        value={text ?? value}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            cancel();
            e.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

/** Label and value on one line: read-only facts. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium text-ink tabular-nums">{children}</span>
    </div>
  );
}

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3 p-3', className)}>{children}</div>;
}
