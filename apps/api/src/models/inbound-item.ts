import { model, Schema } from 'mongoose';

// A parsed result from a forwarded email, waiting for the phone to collect it. The email itself is
// never stored, and the item is deleted once the phone acknowledges it.
const inboundItemSchema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    receivedAt: { type: Date, required: true },
  },
  { timestamps: true },
);
// The same email delivered twice is stored once.
inboundItemSchema.index({ deviceId: 1, messageId: 1 }, { unique: true });
// Uncollected items expire after 30 days.
inboundItemSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86_400 });

export const InboundItemModel = model('InboundItem', inboundItemSchema);
