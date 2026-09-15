import type { ClientReport } from './reportAggregation.js';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Cents → "$1,500.00". This is the ONLY place money leaves integer-cents form. */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** 3 → "3.00x" */
export function formatRoas(roas: number): string {
  return `${roas.toFixed(2)}x`;
}

export interface SlackMessagePayload {
  text: string;
  blocks: unknown[];
}

/**
 * Renders a report as Slack Block Kit JSON.
 *
 * `text` is the notification fallback — it is what shows in the sidebar and in
 * mobile push, and Slack warns when it is missing, so it is not optional.
 */
export function buildReportMessage(report: {
  name: string;
  spend_cents: number;
  revenue_cents: number;
  roas: number;
  report_date: string;
}): SlackMessagePayload {
  const spend = formatCents(report.spend_cents);
  const revenue = formatCents(report.revenue_cents);
  const roas = formatRoas(report.roas);

  return {
    text: `Daily Attribution Report — ${report.name} — ${report.report_date} — ROAS ${roas}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Daily Attribution Report — BooleanMaths', emoji: true },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `*${report.name}*  •  Date: ${report.report_date}` }],
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total Ad Spend:*\n${spend}` },
          { type: 'mrkdwn', text: `*Total Revenue:*\n${revenue}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*ROAS:*  ${roas}` },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_Generated automatically by BooleanMaths_' }],
      },
    ],
  };
}
