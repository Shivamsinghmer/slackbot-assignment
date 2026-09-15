import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/**
 * Collection: notification_logs
 * One row per (client, report_date) dispatch attempt. Backs the "Notification Logs"
 * table in the dashboard and records how many attempts a message needed — which is
 * how a 429 pause/retry becomes visible to the user.
 */
const notificationLogSchema = new Schema(
  {
    client_id: { type: String, required: true },
    client_name: { type: String, required: true },
    report_date: { type: String, required: true }, // YYYY-MM-DD
    status: { type: String, enum: NOTIFICATION_STATUSES, required: true, default: 'pending' },
    attempts: { type: Number, required: true, default: 0 },
    rate_limit_hits: { type: Number, required: true, default: 0 },
    spend_cents: { type: Number, required: true },
    revenue_cents: { type: Number, required: true },
    roas: { type: Number, required: true },
    target: { type: String, enum: ['slack', 'mock'], required: true },
    job_id: { type: String },
    last_error: { type: String, default: null },
    sent_at: { type: Date, default: null },
  },
  { collection: 'notification_logs', timestamps: true, versionKey: false },
);

notificationLogSchema.index({ client_id: 1, createdAt: -1 });
notificationLogSchema.index({ client_id: 1, report_date: 1 }, { unique: true });

export type NotificationLogDoc = HydratedDocument<InferSchemaType<typeof notificationLogSchema>>;
export const NotificationLog = model('NotificationLog', notificationLogSchema);
