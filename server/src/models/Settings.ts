import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const SETTINGS_ID = 'runtime';

/**
 * Collection: settings — a single document holding operator-editable runtime
 * configuration.
 *
 * Environment variables seed the defaults; this document overrides them once an
 * operator changes something in the dashboard. That split exists because a
 * deployed instance has no editable .env, so delivery mode and the mock's
 * behaviour have to be changeable from the UI.
 */
const settingsSchema = new Schema(
  {
    _id: { type: String, required: true, default: SETTINGS_ID },
    use_mock_slack: { type: Boolean, required: true },
    mock_429_rate: { type: Number, required: true, min: 0, max: 1 },
    mock_retry_after_seconds: { type: Number, required: true, min: 1, max: 60 },
  },
  { collection: 'settings', timestamps: true, _id: false, versionKey: false },
);

export type SettingsDoc = HydratedDocument<InferSchemaType<typeof settingsSchema>>;
export const Settings = model('Settings', settingsSchema);
