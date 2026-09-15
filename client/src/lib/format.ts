const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCents = (cents: number) => usd.format(cents / 100);
export const formatRoas = (roas: number) => `${roas.toFixed(2)}x`;

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Hides the secret path segment of a webhook URL while leaving it recognisable. */
export function maskWebhook(url: string): string {
  if (!url) return '';
  const parts = url.split('/');
  if (parts.length < 3) return url;
  const tail = parts[parts.length - 1] ?? '';
  return `${parts.slice(0, -1).join('/')}/${'•'.repeat(Math.min(tail.length, 12))}`;
}
