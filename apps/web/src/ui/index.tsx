/**
 * Small shared UI kit. Features compose these instead of restyling raw elements,
 * so the product looks like one thing. Colours come from the tokens in index.css.
 */
import { clsx } from 'clsx';
import { FileUp, Loader2, X } from 'lucide-react';
import {
  Component,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ErrorInfo,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

export const cn = clsx;

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong disabled:bg-ink-faint',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunken disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink disabled:text-ink-faint',
  danger: 'bg-danger text-white hover:opacity-90 disabled:bg-ink-faint',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors select-none',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

export function IconButton({ label, active, size = 'md', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        active ? 'bg-accent-soft text-accent-strong' : 'text-ink-soft hover:bg-sunken hover:text-ink',
        'disabled:text-ink-faint disabled:hover:bg-transparent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A floating card: side panels, toolbars, popovers. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-panel)]', className)}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-line px-3">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink">{title}</h2>
      {actions}
    </div>
  );
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: SegmentedProps<T>) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-lg bg-sunken p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3 text-sm',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

const INPUT = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink placeholder:text-ink-faint';

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={cn(INPUT, className)} {...rest} />;
}

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  /** Shown after the value, e.g. "mm". */
  unit?: string;
}

export function NumberInput({ value, onChange, unit, className, ...rest }: NumberInputProps) {
  return (
    <span className="relative block">
      <input
        type="number"
        className={cn(INPUT, unit && 'pr-9', className)}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const n = e.currentTarget.valueAsNumber;
          if (Number.isFinite(n)) onChange(n);
        }}
        {...rest}
      />
      {unit && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ink-faint">{unit}</span>}
    </span>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(INPUT, 'pr-6', className)} {...rest}>
      {children}
    </select>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-ink-soft', className)} aria-label="Loading" />;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'warn' | 'danger'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-sunken text-ink-soft',
    accent: 'bg-accent-soft text-accent-strong',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  };
  return <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {body && <p className="max-w-sm text-sm text-ink-soft">{body}</p>}
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-sunken px-1 font-sans text-[11px] text-ink-soft">
      {children}
    </kbd>
  );
}

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** `lg` is for reading (help, guides); the default suits confirmations and short forms. */
  size?: 'md' | 'lg';
}

export function Dialog({ title, onClose, children, footer, size = 'md' }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Keyboard users land inside the dialog, and go back to where they were when it closes.
  useEffect(() => {
    const previous = document.activeElement;
    const root = panel.current;
    if (root && !root.contains(previous)) (root.querySelector<HTMLElement>('[data-autofocus]') ?? root).focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onMouseDown={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="outline-none" onMouseDown={(e) => e.stopPropagation()}>
        <Panel className={size === 'lg' ? 'w-[min(94vw,720px)]' : 'w-[min(92vw,440px)]'}>
          <PanelHeader
            title={title}
            actions={
              <IconButton label="Close" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            }
          />
          <div className="p-4 text-sm text-ink-soft">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line p-3">{footer}</div>}
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- error boundary */

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** What to show instead of the crashed subtree. `reset` renders the children again. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** The boundary clears itself when this value changes (a new route, another project). */
  resetKey?: unknown;
  onError?: (error: Error, info: ErrorInfo) => void;
}

/** Keeps a crash in one part of the app from blanking the whole page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.reset();
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}

/* ------------------------------------------------------------- file drops */

const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

/**
 * Accepts files dropped anywhere on the page. Returns whether a file is being
 * dragged over the window, for `DropOverlay`.
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true): boolean {
  const [over, setOver] = useState(false);
  const handler = useRef(onFiles);
  handler.current = onFiles;
  useEffect(() => {
    if (!enabled) {
      setOver(false);
      return;
    }
    // dragenter and dragleave fire for every element crossed: count them to know when the pointer left the window.
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    };
    const move = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length > 0) handler.current(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', move);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', move);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [enabled]);
  return over;
}

/** Full-page hint shown while a file is dragged over the window. */
export function DropOverlay({ visible, title, body }: { visible: boolean; title: string; body?: string }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-accent-soft/80 p-6" data-testid="drop-overlay">
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border-2 border-dashed border-accent bg-surface px-10 py-8 text-center shadow-[var(--shadow-panel)]">
        <FileUp className="h-8 w-8 text-accent" />
        <p className="text-base font-semibold text-ink">{title}</p>
        {body && <p className="max-w-xs text-sm text-ink-soft">{body}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ toasts */

interface Toast {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let toastId = 0;

function push(tone: Toast['tone'], message: string) {
  const id = ++toastId;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, tone, message }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
}

export const toast = {
  info: (message: string) => push('info', message),
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
};

/** Elements that cannot hold the toasts as children. */
const VOID_HOSTS = new Set(['CANVAS', 'VIDEO', 'IMG', 'IFRAME', 'OBJECT', 'EMBED']);

/**
 * Where toasts are mounted: the page body, or the element in browser fullscreen.
 * Only the fullscreen element and its descendants are drawn while it is up, so
 * toasts rendered anywhere else would be invisible there.
 */
function useToastHost(): Element | null {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const update = () => {
      const full = document.fullscreenElement;
      setHost(full && !VOID_HOSTS.has(full.tagName) ? full : document.body);
    };
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  return host;
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const host = useToastHost();
  if (!host) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite" data-testid="toaster">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          data-tone={t.tone}
          className={cn(
            'rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-[var(--shadow-panel)]',
            t.tone === 'error' ? 'bg-danger' : t.tone === 'success' ? 'bg-accent' : 'bg-ink',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>,
    host,
  );
}
