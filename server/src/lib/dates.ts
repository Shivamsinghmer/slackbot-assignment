/** Formats a Date as YYYY-MM-DD in UTC. */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Midnight UTC of the day containing `d`. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface ReportWindow {
  /** Inclusive lower bound — midnight UTC of the report day. */
  start: Date;
  /** Exclusive upper bound — midnight UTC of the following day. */
  end: Date;
  /** The report day as YYYY-MM-DD. */
  dateKey: string;
}

/**
 * The "previous 24 hours" window the report covers.
 *
 * Called with no argument (the 09:00 cron case) this is yesterday 00:00 UTC →
 * today 00:00 UTC. Pass a YYYY-MM-DD string to re-run an arbitrary day, which is
 * what the dashboard's "Send Now" button uses.
 */
export function getReportWindow(dateKey?: string, now: Date = new Date()): ReportWindow {
  const day = dateKey
    ? new Date(`${dateKey}T00:00:00.000Z`)
    : new Date(startOfUtcDay(now).getTime() - 24 * 60 * 60 * 1000);

  if (Number.isNaN(day.getTime())) {
    throw new Error(`Invalid report date "${dateKey}" — expected YYYY-MM-DD`);
  }

  const start = startOfUtcDay(day);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, dateKey: toDateKey(start) };
}
