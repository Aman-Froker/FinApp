import type { LearnedRuleDto } from '@finapp/shared';

import { LearnedRuleModel } from '../../models/learned-rule.js';

export const MIN_RULE_VOTES = 2;

export const rulesRepository = {
  vote: (deviceId: string, rules: LearnedRuleDto[]) =>
    LearnedRuleModel.bulkWrite(
      rules.map((r) => ({
        updateOne: { filter: { header: r.header, pattern: r.pattern, deviceId }, update: { $set: r }, upsert: true },
      })),
    ),

  // Rules at least MIN_RULE_VOTES devices agree on, fields and all.
  shared: async (): Promise<LearnedRuleDto[]> => {
    const rows = await LearnedRuleModel.aggregate<{ _id: LearnedRuleDto; votes: number }>([
      { $group: { _id: { header: '$header', pattern: '$pattern', groups: '$groups', type: '$type', instrument: '$instrument', status: '$status' }, votes: { $sum: 1 } } },
      { $match: { votes: { $gte: MIN_RULE_VOTES } } },
      { $sort: { votes: -1 } },
      { $limit: 2000 },
    ]);
    return rows.map((r) => r._id);
  },
};
