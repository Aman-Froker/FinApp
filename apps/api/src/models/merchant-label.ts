import { model, Schema } from 'mongoose';

import { CATEGORIES } from '@finapp/shared';

// One device's name for one UPI ID, as a vote. The shared map serves a name only once enough
// different devices agree, so one user's label never names anyone else's payee.
const merchantLabelSchema = new Schema(
  {
    vpaHash: { type: String, required: true },
    deviceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    // Lower-cased, so "Swiggy" and "SWIGGY" count as the same vote.
    nameKey: { type: String, required: true },
    category: { type: String, required: true, enum: CATEGORIES },
  },
  { timestamps: true },
);
merchantLabelSchema.index({ vpaHash: 1, deviceId: 1 }, { unique: true });

export const MerchantLabelModel = model('MerchantLabel', merchantLabelSchema);
