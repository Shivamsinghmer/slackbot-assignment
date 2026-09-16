import type {
  Client,
  DispatchResult,
  Health,
  NotificationLog,
  QueueCounts,
  RuntimeSettings,
} from './types.ts';

/**
 * Empty in development — Vite proxies /api to the backend. In a deployed build
 * the frontend is a static site on a different origin, so VITE_API_BASE points
 * at the API service.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
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

  getSettings: () => request<RuntimeSettings>('/settings'),

  updateSettings: (patch: Partial<Omit<RuntimeSettings, 'defaults'>>) =>
    request<RuntimeSettings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  resetSettings: () => request<RuntimeSettings>('/settings/reset', { method: 'POST' }),
};
