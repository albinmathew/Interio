/**
 * A custom colour control for the finishes palettes: a swatch-sized button over a native
 * colour input. The pick is committed once, when the browser's picker closes (the native
 * `change` event), so dragging through colours is not an undo step per tick.
 */
import { Pipette } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '../../ui';

export function ColorPick({
  value,
  active,
  onPick,
  label = 'Custom colour',
  className,
  ...rest
}: {
  /** The current custom colour, if the finish is one. */
  value?: string;
  active: boolean;
  onPick: (hex: string) => void;
  label?: string;
  className?: string;
  'data-testid'?: string;
  'data-slot'?: string;
  'data-surface'?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onChange = () => pick.current(el.value.toLowerCase());
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (input.current && value) input.current.value = value;
  }, [value]);
  return (
    <label
      title={active && value ? `${label}: ${value}` : label}
      className={cn(
        'relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-md border bg-[conic-gradient(from_90deg,#e8b4a0,#e8dca0,#a8d8b0,#a0c4e8,#c8a8e0,#e8b4a0)]',
        active ? 'border-accent ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'border-line hover:ring-2 hover:ring-line',
        className,
      )}
      style={active && value ? { background: value } : undefined}
    >
      <Pipette className={cn('h-3 w-3', active ? 'text-white mix-blend-difference' : 'text-ink/70')} />
      <input
        ref={input}
        type="color"
        aria-label={label}
        defaultValue={value ?? '#c8b8a0'}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        {...rest}
      />
    </label>
  );
}
