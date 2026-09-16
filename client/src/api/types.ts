export interface Client {
  _id: string;
  name: string;
  slack_notifications_enabled: boolean;
  slack_webhook_url: string;
}

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface NotificationLog {
  _id: string;
  client_id: string;
  client_name: string;
  report_date: string;
  status: NotificationStatus;
  attempts: number;
  rate_limit_hits: number;
  spend_cents: number;
  revenue_cents: number;
  roas: number;
  target: 'slack' | 'mock';
  last_error: string | null;
  sent_at: string | null;
  updatedAt: string;
}

export interface DispatchResult {
  report_date: string;
  enqueued: number;
  clients: string[];
  target: 'slack' | 'mock';
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface Health {
  ok: boolean;
  use_mock_slack: boolean;
  mock_429_rate: number;
}

export interface RuntimeSettings {
  use_mock_slack: boolean;
  mock_429_rate: number;
  mock_retry_after_seconds: number;
  defaults: {
    use_mock_slack: boolean;
    mock_429_rate: number;
    mock_retry_after_seconds: number;
  };
}
