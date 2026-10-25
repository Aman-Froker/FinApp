import { model, Schema } from 'mongoose';

// One row per fallback call: the per-device monthly cap counts these, and the masked text and the
// model's answer are kept so new parser rules can be written from them.
const fallbackRequestSchema = new Schema(
  {
    deviceId: { type: String, required: true },
    sender: { type: String, required: true },
    templateKey: { type: String, required: true, index: true },
    maskedText: { type: String, required: true },
    result: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

fallbackRequestSchema.index({ deviceId: 1, createdAt: -1 });

export const FallbackRequestModel = model('FallbackRequest', fallbackRequestSchema);
