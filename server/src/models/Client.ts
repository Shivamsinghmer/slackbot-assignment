import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Collection: clients
 * _id is a human-readable string ("client_1") rather than an ObjectId, so client
 * records stay readable in logs and Slack payloads.
 */
const clientSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    slack_notifications_enabled: { type: Boolean, required: true, default: true },
    slack_webhook_url: { type: String, default: '', trim: true },
  },
  { collection: 'clients', timestamps: true, _id: false, versionKey: false },
);

export type ClientDoc = HydratedDocument<InferSchemaType<typeof clientSchema>>;
export const Client = model('Client', clientSchema);
