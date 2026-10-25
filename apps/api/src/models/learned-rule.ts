import { model, Schema } from 'mongoose';

// One device's vote for a learned message shape. A rule is served to every phone only once two
// different devices sent the same one, so wording that names one user (a greeting with their name)
// never reaches anyone else.
const learnedRuleSchema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    header: { type: String, required: true },
    pattern: { type: String, required: true },
    groups: { type: [String], required: true },
    type: { type: String, required: true },
    instrument: { type: String, required: true },
    status: { type: String, required: true },
  },
  { timestamps: true },
);
learnedRuleSchema.index({ header: 1, pattern: 1, deviceId: 1 }, { unique: true });

export const LearnedRuleModel = model('LearnedRule', learnedRuleSchema);
