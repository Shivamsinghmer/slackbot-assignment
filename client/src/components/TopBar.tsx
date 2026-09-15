import type { QueueCounts } from '../api/types.ts';

interface Props {
  useMock: boolean;
  onUseMockChange: (next: boolean) => void;
  onDispatch: () => void;
  dispatching: boolean;
  queue: QueueCounts | null;
  apiReachable: boolean;
}

/**
 * Chrome, not content. Carries the three things an operator needs permanently
 * visible while a dispatch runs: where messages are going, how much work is
 * left, and the trigger.
 */
export function TopBar({
  useMock,
  onUseMockChange,
  onDispatch,
  dispatching,
  queue,
  apiReachable,
}: Props) {
  const inFlight = queue ? queue.waiting + queue.active + queue.delayed : 0;

  return (
    <header
      style={{ zIndex: 'var(--z-topbar)' }}
      className="sticky top-0 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-rail px-4"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold tracking-tight">Report Dispatch</span>
        <span className="hidden text-[11px] text-ink-faint sm:inline">Slack delivery</span>
      </div>

      {/* Delivery destination, stated outright. A mock message must never be
          mistakable for one that reached Slack. */}
      <button
        type="button"
        onClick={() => onUseMockChange(!useMock)}
        aria-pressed={useMock}
        title={
          useMock
            ? 'Mock mode: messages go to the local test endpoint. Click to switch to live Slack.'
            : 'Live mode: messages go to real Slack channels. Click to switch to the mock endpoint.'
        }
        className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[12px] font-medium transition-colors duration-150 ${
          useMock
            ? 'border-limited/30 bg-limited-bg text-limited hover:border-limited/50'
            : 'border-sent/30 bg-sent-bg text-sent hover:border-sent/50'
        }`}
      >
        <span aria-hidden className="text-[9px] leading-none">
          {useMock ? '▲' : '●'}
        </span>
        {useMock ? 'Mock endpoint' : 'Live Slack'}
      </button>

      <QueueMeter queue={queue} inFlight={inFlight} />

      <div className="ml-auto flex items-center gap-3">
        {!apiReachable && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-failed">
            <span aria-hidden className="text-[9px] leading-none">
              ■
            </span>
            API unreachable
          </span>
        )}
        <button
          type="button"
          onClick={onDispatch}
          disabled={dispatching || !apiReachable}
          className="rounded bg-ink px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {dispatching ? 'Queueing…' : 'Run dispatch'}
        </button>
      </div>
    </header>
  );
}

/**
 * Replaces the stat-tile row. Same information, in chrome rather than content,
 * and it reads as progress rather than as four unrelated numbers.
 */
function QueueMeter({ queue, inFlight }: { queue: QueueCounts | null; inFlight: number }) {
  if (!queue) return null;

  const done = queue.completed;
  const failed = queue.failed;
  const total = Math.max(inFlight + done + failed, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className="hidden items-center gap-2.5 md:flex">
      <div
        className="flex h-1.5 w-28 overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`Queue: ${inFlight} in flight, ${done} completed, ${failed} failed`}
      >
        <span
          className="bg-pending transition-[width] duration-300 ease-(--ease-out-quart)"
          style={{ width: pct(inFlight) }}
        />
        <span
          className="bg-sent transition-[width] duration-300 ease-(--ease-out-quart)"
          style={{ width: pct(done) }}
        />
        <span
          className="bg-failed transition-[width] duration-300 ease-(--ease-out-quart)"
          style={{ width: pct(failed) }}
        />
      </div>
      <span className="tnum text-[12px] text-ink-muted">
        {inFlight > 0 ? (
          <>
            <span className="font-medium text-ink">{inFlight}</span> in flight
          </>
        ) : (
          <>
            <span className="font-medium text-ink">{done}</span> delivered
          </>
        )}
        {failed > 0 && <span className="ml-1.5 text-failed">· {failed} failed</span>}
      </span>
    </div>
  );
}
