import { useEffect, useState } from 'react';
import type { Client } from '../api/types.ts';
import { maskWebhook } from '../lib/format.ts';

const WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

interface Props {
  client: Client;
  onSave: (patch: Partial<Client>) => Promise<void>;
}

export function ClientSettings({ client, onSave }: Props) {
  const [url, setUrl] = useState(client.slack_webhook_url);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setUrl(client.slack_webhook_url);
    setRevealed(false);
    setNote(null);
  }, [client._id, client.slack_webhook_url]);

  const dirty = url.trim() !== client.slack_webhook_url;
  const invalid = url.trim() !== '' && !WEBHOOK_PATTERN.test(url.trim());

  async function saveUrl() {
    if (invalid || !dirty) return;
    setSaving(true);
    setNote(null);
    try {
      await onSave({ slack_webhook_url: url.trim() });
      setNote({ kind: 'ok', text: 'Saved.' });
    } catch (err) {
      setNote({ kind: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(next: boolean) {
    setNote(null);
    try {
      await onSave({ slack_notifications_enabled: next });
    } catch (err) {
      setNote({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <div className="border-t border-line px-4 py-4">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
        {client.name} settings
      </h2>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="notif" className="text-[13px] text-ink">
          Daily reports
          <span className="mt-0.5 block text-[11px] text-ink-faint">
            {client.slack_notifications_enabled
              ? 'Included in every dispatch'
              : 'Excluded from dispatches'}
          </span>
        </label>
        <Toggle
          id="notif"
          checked={client.slack_notifications_enabled}
          onChange={toggle}
          label={`Daily reports for ${client.name}`}
        />
      </div>

      <label htmlFor="webhook" className="mt-5 block text-[12px] font-medium text-ink">
        Slack webhook URL
      </label>
      <input
        id="webhook"
        type="text"
        spellCheck={false}
        autoComplete="off"
        value={revealed || dirty ? url : maskWebhook(url)}
        onChange={(e) => setUrl(e.target.value)}
        onFocus={() => setRevealed(true)}
        onKeyDown={(e) => e.key === 'Enter' && void saveUrl()}
        placeholder="https://hooks.slack.com/services/…"
        aria-invalid={invalid}
        aria-describedby={invalid ? 'webhook-error' : undefined}
        className={`mt-1.5 w-full rounded border bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink transition-colors duration-150 outline-none ${
          invalid ? 'border-failed' : 'border-line hover:border-ink-faint'
        }`}
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={saveUrl}
          disabled={!dirty || invalid || saving}
          className="rounded bg-ink px-2.5 py-1 text-[12px] font-medium text-white transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {dirty && !saving && (
          <button
            type="button"
            onClick={() => setUrl(client.slack_webhook_url)}
            className="rounded px-2 py-1 text-[12px] text-ink-muted transition-colors duration-150 hover:text-ink"
          >
            Cancel
          </button>
        )}

        {invalid && (
          <span id="webhook-error" className="text-[11px] text-failed">
            Expects hooks.slack.com/services/…
          </span>
        )}
        {note && !invalid && (
          <span className={`text-[11px] ${note.kind === 'ok' ? 'text-sent' : 'text-failed'}`}>
            {note.text}
          </span>
        )}
      </div>

      {!client.slack_webhook_url && !dirty && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
          No webhook set. This client is skipped even when reports are on.
        </p>
      )}
    </div>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      /* Ink, not a state colour — on/off is configuration, not delivery status. */
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
        checked ? 'bg-ink' : 'bg-line'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-(--ease-out-quart) ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
