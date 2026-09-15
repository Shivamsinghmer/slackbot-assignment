import type { Client, DispatchResult, Health, NotificationLog, QueueCounts } from './types.ts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>('/health'),

  listClients: () => request<Client[]>('/clients'),

  updateClient: (id: string, patch: Partial<Pick<Client, 'slack_webhook_url' | 'slack_notifications_enabled'>>) =>
    request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),

  listLogs: (limit = 50) => request<NotificationLog[]>(`/logs?limit=${limit}`),

  runDispatch: (opts: { useMock: boolean }) =>
    request<DispatchResult>('/dispatch/run', { method: 'POST', body: JSON.stringify(opts) }),

  queueStatus: () => request<QueueCounts>('/queue/status'),
};
