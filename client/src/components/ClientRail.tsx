import type { Client, NotificationLog } from '../api/types.ts';
import { formatRoas } from '../lib/format.ts';
import { StatusDot, type DeliveryState } from './StatusPill.tsx';

interface Props {
  clients: Client[];
  logs: NotificationLog[];
  selectedId: string | null;
  filterId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

/** Latest known delivery state for a client, for the rail's status dot. */
function latestState(logs: NotificationLog[], clientId: string): DeliveryState | null {
  const log = logs.find((l) => l.client_id === clientId);
  if (!log) return null;
  if (log.status === 'pending' && log.rate_limit_hits > 0) return 'limited';
  return log.status;
}

export function ClientRail({ clients, logs, selectedId, filterId, onSelect, loading }: Props) {
  if (loading && clients.length === 0) {
    return (
      <ul className="space-y-px p-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="h-[52px] animate-pulse rounded bg-line-soft" />
        ))}
      </ul>
    );
  }

  return (
    <div>
      <h2 className="px-4 pt-4 pb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
        Clients
      </h2>

      <ul
        role="listbox"
        aria-label="Clients"
        className="flex gap-1 overflow-x-auto px-2 pb-2 lg:block lg:overflow-x-visible"
      >
        {clients.map((client) => {
          const selected = client._id === selectedId;
          const filtering = client._id === filterId;
          const state = latestState(logs, client._id);
          const log = logs.find((l) => l.client_id === client._id);

          return (
            <li key={client._id} className="shrink-0 lg:shrink">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(client._id)}
                title={
                  filtering
                    ? 'Showing only this client in the log — click again to show all'
                    : 'Open settings and filter the log to this client'
                }
                className={`w-full rounded px-2.5 py-2 text-left whitespace-nowrap transition-colors duration-150 lg:whitespace-normal ${
                  filtering
                    ? 'bg-focus-bg'
                    : selected
                      ? 'bg-line-soft'
                      : 'hover:bg-line-soft'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`truncate text-[13px] ${
                      client.slack_notifications_enabled
                        ? 'font-medium text-ink'
                        : 'text-ink-faint'
                    }`}
                  >
                    {client.name}
                  </span>

                  {!client.slack_notifications_enabled && (
                    <span className="rounded bg-line px-1 py-px text-[10px] font-medium text-ink-muted">
                      off
                    </span>
                  )}

                  <span className="ml-auto flex items-center gap-1.5">
                    {log && (
                      <span className="tnum text-[11px] text-ink-faint">
                        {formatRoas(log.roas)}
                      </span>
                    )}
                    {state && <StatusDot state={state} />}
                  </span>
                </span>

                <span className="mt-0.5 hidden truncate font-mono text-[11px] text-ink-faint lg:block">
                  {client._id}
                  {!client.slack_webhook_url && ' · no webhook'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
