import type { Merchant, MerchantLabelsBody } from '@finapp/shared';

import { MerchantLabelModel } from '../../models/merchant-label.js';

export const MIN_VOTES = 3;

export const merchantsRepository = {
  // A device relabelling a UPI ID replaces its own earlier vote.
  vote: (deviceId: string, labels: MerchantLabelsBody['labels']) =>
    MerchantLabelModel.bulkWrite(
      labels.map((l) => ({
        updateOne: {
          filter: { vpaHash: l.hash, deviceId },
          update: { $set: { name: l.name, nameKey: l.name.toLowerCase(), category: l.category } },
          upsert: true,
        },
      })),
    ),

  // The most agreed name per hash, if at least MIN_VOTES devices gave it.
  lookup: async (hashes: string[]): Promise<Merchant[]> => {
    const rows = await MerchantLabelModel.aggregate<{ _id: { hash: string; nameKey: string }; votes: number; name: string; category: Merchant['category'] }>([
      { $match: { vpaHash: { $in: hashes } } },
      { $group: { _id: { hash: '$vpaHash', nameKey: '$nameKey' }, votes: { $sum: 1 }, name: { $first: '$name' }, category: { $first: '$category' } } },
      { $match: { votes: { $gte: MIN_VOTES } } },
      { $sort: { votes: -1 } },
    ]);
    const best = new Map<string, Merchant>();
    for (const r of rows) if (!best.has(r._id.hash)) best.set(r._id.hash, { hash: r._id.hash, name: r.name, category: r.category });
    return [...best.values()];
  },
};
