import type { NotificationStatus } from '../api/types.ts';

/**
 * Delivery state, shown three ways at once: glyph, label, colour.
 *
 * The glyph is not decoration. Sent / rate-limited / failed sit on the exact
 * hues deuteranopia collapses, so shape carries the meaning and colour only
 * reinforces it.
 */
export type DeliveryState = NotificationStatus | 'limited';

const STATE: Record<
  DeliveryState,
  { glyph: string; label: string; fg: string; bg: string; pulse?: string }
> = {
  sent: { glyph: '●', label: 'Sent', fg: 'text-sent', bg: 'bg-sent-bg' },
  pending: {
    glyph: '◐',
    label: 'Pending',
    fg: 'text-pending',
    bg: 'bg-pending-bg',
    pulse: 'pulse-slow',
  },
  limited: {
    glyph: '▲',
    label: 'Rate limited',
    fg: 'text-limited',
    bg: 'bg-limited-bg',
    pulse: 'pulse-fast',
  },
  failed: { glyph: '■', label: 'Failed', fg: 'text-failed', bg: 'bg-failed-bg' },
};

export function StatusPill({ state, title }: { state: DeliveryState; title?: string }) {
  const s = STATE[state];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${s.bg} ${s.fg}`}
    >
      <span aria-hidden className={`text-[9px] leading-none ${s.pulse ?? ''}`}>
        {s.glyph}
      </span>
      {s.label}
    </span>
  );
}

/** Compact form for the client rail, where the label would not fit. */
export function StatusDot({ state }: { state: DeliveryState }) {
  const s = STATE[state];
  return (
    <span
      role="img"
      aria-label={s.label}
      title={s.label}
      className={`text-[9px] leading-none ${s.fg} ${s.pulse ?? ''}`}
    >
      {s.glyph}
    </span>
  );
}

export const stateTint: Record<DeliveryState, string> = {
  sent: 'var(--color-sent-bg)',
  pending: 'var(--color-pending-bg)',
  limited: 'var(--color-limited-bg)',
  failed: 'var(--color-failed-bg)',
};
