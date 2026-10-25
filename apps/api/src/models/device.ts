import { model, Schema } from 'mongoose';

// Anonymous install identity. Links to a user only once sign in exists for a later feature.
const deviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    platform: { type: String, required: true, enum: ['android', 'ios'] },
    appVersion: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // The local part of the device's forwarding address, made on first request.
    inboxToken: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

export const DeviceModel = model('Device', deviceSchema);
