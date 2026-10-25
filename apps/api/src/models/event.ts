import { model, Schema } from 'mongoose';

// Product analytics for the PRD success metrics. Flat properties only, no PII.
const eventSchema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    properties: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

eventSchema.index({ name: 1, occurredAt: -1 });

export const EventModel = model('Event', eventSchema);
