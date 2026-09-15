import { useEffect, useRef, useState } from 'react';
import type { NotificationLog } from '../api/types.ts';
import { formatCents, formatRoas, formatTime } from '../lib/format.ts';
import { StatusPill, stateTint, type DeliveryState } from './StatusPill.tsx';

interface Props {
  logs: NotificationLog[];
  loading: boolean;
  error: string | null;
  filterId: string | null;
  onClearFilter: () => void;
}

function deliveryState(log: NotificationLog): DeliveryState {
  if (log.status === 'pending' && log.rate_limit_hits > 0) return 'limited';
  return log.status;
}

/**
 * The primary surface. Everything else on screen is in service of reading this
 * during a live dispatch, so: sticky header, hairline rows, no zebra striping,
 * and a one-off tint when a row changes state.
 */
export function DeliveryLog({ logs, loading, error, filterId, onClearFilter }: Props) {
  const visible = filterId ? logs.filter((l) => l.client_id === filterId) : logs;

  // Track which rows changed state since the last poll, so only those flash.
  const previous = useRef<Map<string, DeliveryState>>(new Map());
  const [changed, setChanged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = new Set<string>();
    for (const log of logs) {
      const state = deliveryState(log);
      const before = previous.current.get(log._id);
      if (before && before !== state) next.add(log._id);
      previous.current.set(log._id, state);
    }
    if (next.size > 0) {
      setChanged(next);
      const t = setTimeout(() => setChanged(new Set()), 650);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [logs]);

  if (error) {
    return (
      <Shell>
        <div className="px-4 py-10 text-center">
          <p className="text-[13px] font-medium text-failed">Could not load the delivery log</p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] text-ink-muted">{error}</p>
        </div>
      </Shell>
    );
  }

  if (loading && logs.length === 0) {
    return (
      <Shell>
        <table className="w-full">
          <Head />
          <tbody>
            {[0, 1, 2, 3, 4].map((i) => (
              <tr key={i} className="border-b border-line-soft">
                <td colSpan={8} className="px-4 py-2.5">
                  <span className="block h-4 animate-pulse rounded bg-line-soft" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Shell>
    );
  }

  if (visible.length === 0) {
    return (
      <Shell>
        <div className="px-6 py-16 text-center">
          <p className="text-[13px] font-medium text-ink">
            {filterId ? 'Nothing delivered for this client yet' : 'No dispatches recorded'}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-ink-muted">
            {filterId ? (
              <>
                Reports appear here once a dispatch runs.{' '}
                <button
                  type="button"
                  onClick={onClearFilter}
                  className="text-focus underline underline-offset-2"
                >
                  Show all clients
                </button>
              </>
            ) : (
              <>
                Run dispatch queues yesterday&rsquo;s report for every enabled client. The worker
                drains the queue at one message per second, so rows land roughly a second apart.
              </>
            )}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <table className="w-full min-w-[54rem] border-collapse">
        <Head />
        <tbody>
          {visible.map((log) => {
            const state = deliveryState(log);
            const flash = changed.has(log._id);

            return (
              <tr
                key={log._id}
                style={flash ? ({ '--flash': stateTint[state] } as React.CSSProperties) : undefined}
                className={`border-b border-line-soft transition-colors duration-150 hover:bg-bg ${
                  flash ? 'row-settle' : ''
                }`}
              >
                <td className="px-4 py-2.5">
                  <span className="block text-[13px] font-medium text-ink">{log.client_name}</span>
                  <span className="block font-mono text-[11px] text-ink-faint">
                    {log.client_id}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap text-ink-muted">
                  {log.report_date}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink-muted">
                  {formatCents(log.spend_cents)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink-muted">
                  {formatCents(log.revenue_cents)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[12px] font-medium text-ink">
                  {formatRoas(log.roas)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="tnum text-[12px] text-ink-muted">{log.attempts}</span>
                  {log.rate_limit_hits > 0 && (
                    <span
                      title={`Rate limited ${log.rate_limit_hits}× — the queue paused and retried`}
                      className="ml-1.5 rounded bg-limited-bg px-1 py-px font-mono text-[10px] font-medium text-limited"
                    >
                      429×{log.rate_limit_hits}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill state={state} title={log.last_error ?? undefined} />
                  {log.status === 'failed' && log.last_error && (
                    <span className="mt-1 block max-w-[20rem] truncate font-mono text-[11px] text-failed">
                      {log.last_error}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <span className="block font-mono text-[12px] text-ink-muted">
                    {formatTime(log.updatedAt)}
                  </span>
                  <span
                    className={`block text-[11px] ${
                      log.target === 'mock' ? 'text-limited' : 'text-ink-faint'
                    }`}
                  >
                    {log.target === 'mock' ? 'mock' : 'slack'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

function Head() {
  const cell =
    'px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint whitespace-nowrap';
  return (
    <thead style={{ zIndex: 'var(--z-sticky)' }} className="sticky top-0 bg-surface">
      <tr className="border-b border-line">
        <th className={`${cell} px-4 text-left`}>Client</th>
        <th className={`${cell} text-left`}>Report date</th>
        <th className={`${cell} text-right`}>Spend</th>
        <th className={`${cell} text-right`}>Revenue</th>
        <th className={`${cell} text-right`}>ROAS</th>
        <th className={`${cell} text-center`}>Attempts</th>
        <th className={`${cell} text-left`}>Status</th>
        <th className={`${cell} px-4 text-right`}>Updated</th>
      </tr>
    </thead>
  );
}
