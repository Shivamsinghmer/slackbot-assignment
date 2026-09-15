import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api/client.ts';
import type { Client, NotificationLog, QueueCounts } from './api/types.ts';
import { ClientRail } from './components/ClientRail.tsx';
import { ClientSettings } from './components/ClientSettings.tsx';
import { DeliveryLog } from './components/DeliveryLog.tsx';
import { TopBar } from './components/TopBar.tsx';

const POLL_INTERVAL_MS = 2000;

export default function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Filtering is a separate, opt-in concern from which client's settings are
  // open. The primary job is watching a whole dispatch land, so the log starts
  // unfiltered even though a client is selected for editing.
  const [filterId, setFilterId] = useState<string | null>(null);

  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [queue, setQueue] = useState<QueueCounts | null>(null);
  const [apiReachable, setApiReachable] = useState(true);

  // Null until the server reports its mode, so the control can never contradict
  // the backend's USE_MOCK_SLACK setting.
  const [useMock, setUseMock] = useState<boolean | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const selected = clients.find((c) => c._id === selectedId) ?? null;

  const loadClients = useCallback(async () => {
    try {
      const data = await api.listClients();
      setClients(data);
      setSelectedId((current) => current ?? data[0]?._id ?? null);
    } catch {
      /* the topbar surfaces reachability; no second error region */
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    api
      .health()
      .then((h) => setUseMock((current) => (current === null ? h.use_mock_slack : current)))
      .catch(() => setUseMock((current) => (current === null ? true : current)));
  }, []);

  // Poll so a running dispatch is visible: rows land about a second apart.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [nextLogs, nextQueue] = await Promise.all([api.listLogs(), api.queueStatus()]);
        if (cancelled) return;
        setLogs(nextLogs);
        setQueue(nextQueue);
        setLogsError(null);
        setApiReachable(true);
      } catch (err) {
        if (cancelled) return;
        setLogsError((err as Error).message);
        setApiReachable(false);
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    }

    void poll();
    timer.current = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  // Dismiss the dispatch notice on its own; it is confirmation, not a record.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  async function handleSave(patch: Partial<Client>) {
    if (!selected) return;
    const previous = clients;
    setClients((cs) => cs.map((c) => (c._id === selected._id ? { ...c, ...patch } : c)));
    try {
      const updated = await api.updateClient(selected._id, patch);
      setClients((cs) => cs.map((c) => (c._id === updated._id ? updated : c)));
    } catch (err) {
      setClients(previous);
      throw err;
    }
  }

  async function handleDispatch() {
    setDispatching(true);
    setNotice(null);
    try {
      const result = await api.runDispatch({ useMock: useMock ?? true });
      setNotice(
        result.enqueued === 0
          ? {
              kind: 'error',
              text: 'Nothing queued — no enabled client had data in the report window.',
            }
          : {
              kind: 'ok',
              text: `Queued ${result.enqueued} report${result.enqueued === 1 ? '' : 's'} for ${
                result.report_date
              } via ${result.target}.`,
            },
      );
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar
        useMock={useMock ?? true}
        onUseMockChange={setUseMock}
        onDispatch={handleDispatch}
        dispatching={dispatching}
        queue={queue}
        apiReachable={apiReachable}
      />

      {notice && (
        <div
          role="status"
          className={`shrink-0 border-b px-4 py-2 text-[12px] ${
            notice.kind === 'ok'
              ? 'border-line bg-sent-bg text-sent'
              : 'border-line bg-failed-bg text-failed'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Rail + log. Below 900px this stacks and the page scrolls normally. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex shrink-0 flex-col border-t border-line bg-rail lg:order-1 lg:w-[340px] lg:overflow-y-auto lg:border-t-0 lg:border-r">
          <ClientRail
            clients={clients}
            logs={logs}
            selectedId={selectedId}
            filterId={filterId}
            onSelect={(id) => {
              setSelectedId(id);
              setFilterId((current) => (current === id ? null : id));
            }}
            loading={clientsLoading}
          />
          {selected && <ClientSettings client={selected} onSave={handleSave} />}
        </aside>

        <main className="order-1 flex min-h-0 min-w-0 flex-col bg-surface lg:order-2 lg:flex-1">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-ink">Delivery log</h2>
            {filterId && (
              <button
                type="button"
                onClick={() => setFilterId(null)}
                title="Show every client again"
                className="rounded bg-focus-bg px-2 py-0.5 text-[11px] font-medium text-focus transition-opacity duration-150 hover:opacity-80"
              >
                {clients.find((c) => c._id === filterId)?.name ?? filterId} · clear filter
              </button>
            )}
            <span className="ml-auto text-[11px] text-ink-faint">
              Updates every {POLL_INTERVAL_MS / 1000}s
            </span>
          </div>

          <div className="min-h-0 flex-1 lg:overflow-y-auto">
            <DeliveryLog
              logs={logs}
              loading={logsLoading}
              error={logsError}
              filterId={filterId}
              onClearFilter={() => setFilterId(null)}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
