import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Collection: daily_stats
 * Money is stored as integer cents — never floats. Conversion to dollars happens
 * only at the formatting boundary (services/blockKit.ts and the React table).
 */
const dailyStatSchema = new Schema(
  {
    client_id: { type: String, required: true },
    date: { type: Date, required: true },
    channel: { type: String, required: true },
    spend_cents: { type: Number, required: true, min: 0 },
    revenue_cents: { type: Number, required: true, min: 0 },
  },
  { collection: 'daily_stats', versionKey: false },
);

// Supports the date-windowed $lookup sub-pipeline in reportAggregation.ts.
dailyStatSchema.index({ client_id: 1, date: 1 });

export type DailyStatDoc = HydratedDocument<InferSchemaType<typeof dailyStatSchema>>;
export const DailyStat = model('DailyStat', dailyStatSchema);
