import { useState } from 'react';
import type { RuntimeSettings } from '../api/types.ts';

interface Props {
  settings: RuntimeSettings;
  onChange: (patch: Partial<Omit<RuntimeSettings, 'defaults'>>) => Promise<void>;
  onReset: () => Promise<void>;
}

/**
 * Runtime configuration, editable from the interface rather than from .env.
 *
 * A deployed instance has no editable environment file, so delivery mode and
 * the mock endpoint's behaviour have to be reachable from here — otherwise
 * demonstrating rate-limit recovery would mean a redeploy.
 */
export function DeliverySettings({ settings, onChange, onReset }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dirty =
    settings.use_mock_slack !== settings.defaults.use_mock_slack ||
    settings.mock_429_rate !== settings.defaults.mock_429_rate ||
    settings.mock_retry_after_seconds !== settings.defaults.mock_retry_after_seconds;

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      if (ok) setNote(ok);
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pct = Math.round(settings.mock_429_rate * 100);

  return (
    <div className="border-t border-line px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
          Delivery settings
        </h2>
        {dirty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onReset, 'Reset to deployed defaults.')}
            className="rounded px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors duration-150 hover:text-ink disabled:opacity-40"
          >
            Reset
          </button>
        )}
      </div>

      <fieldset disabled={busy} className="space-y-4">
        <div>
          <legend className="sr-only">Delivery target</legend>
          <div
            role="radiogroup"
            aria-label="Delivery target"
            className="grid grid-cols-2 gap-1 rounded border border-line bg-surface p-0.5"
          >
            {(
              [
                ['Live Slack', false],
                ['Mock endpoint', true],
              ] as const
            ).map(([label, mock]) => {
              const active = settings.use_mock_slack === mock;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => void run(() => onChange({ use_mock_slack: mock }))}
                  className={`rounded px-2 py-1 text-[12px] font-medium transition-colors duration-150 ${
                    active
                      ? mock
                        ? 'bg-limited-bg text-limited'
                        : 'bg-sent-bg text-sent'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
            {settings.use_mock_slack
              ? 'Reports go to this server’s test endpoint. Nothing reaches Slack.'
              : 'Reports go to each client’s real Slack webhook.'}
          </p>
        </div>

        {/* Only meaningful while the mock endpoint is the target. */}
        {settings.use_mock_slack && (
          <>
            <div>
              <label htmlFor="rate" className="flex items-baseline justify-between">
                <span className="text-[12px] font-medium text-ink">Reject with 429</span>
                <span className="tnum font-mono text-[12px] text-ink-muted">{pct}%</span>
              </label>
              <input
                id="rate"
                type="range"
                min={0}
                max={100}
                step={10}
                value={pct}
                onChange={(e) =>
                  void run(() => onChange({ mock_429_rate: Number(e.target.value) / 100 }))
                }
                className="mt-2 w-full accent-[var(--color-limited)]"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                Share of requests the mock rejects. Raise it to see the queue pause and retry.
              </p>
            </div>

            <div>
              <label htmlFor="retry" className="flex items-baseline justify-between">
                <span className="text-[12px] font-medium text-ink">Retry-After</span>
                <span className="tnum font-mono text-[12px] text-ink-muted">
                  {settings.mock_retry_after_seconds}s
                </span>
              </label>
              <input
                id="retry"
                type="range"
                min={1}
                max={10}
                step={1}
                value={settings.mock_retry_after_seconds}
                onChange={(e) =>
                  void run(() => onChange({ mock_retry_after_seconds: Number(e.target.value) }))
                }
                className="mt-2 w-full accent-[var(--color-limited)]"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                The header value the mock returns. The worker pauses for exactly this long.
              </p>
            </div>
          </>
        )}

        <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">
          Delivery is fixed at <span className="font-mono text-ink">1 message/second</span>. That is
          the guarantee the queue exists to provide, so it is not adjustable here.
        </p>
      </fieldset>

      {note && <p className="mt-2 text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}
