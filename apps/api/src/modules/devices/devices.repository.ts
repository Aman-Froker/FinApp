import type { ProductEvent, RegisterDeviceBody } from '@finapp/shared';

import { DeviceModel } from '../../models/device.js';
import { EventModel } from '../../models/event.js';
import { FallbackRequestModel } from '../../models/fallback-request.js';
import { InboundItemModel } from '../../models/inbound-item.js';
import { MerchantLabelModel } from '../../models/merchant-label.js';

export const devicesRepository = {
  create: (deviceId: string, body: RegisterDeviceBody) => DeviceModel.create({ deviceId, ...body }),
  exists: async (deviceId: string) => Boolean(await DeviceModel.exists({ deviceId })),
  addEvents: (deviceId: string, events: ProductEvent[]) =>
    EventModel.insertMany(events.map((e) => ({ deviceId, ...e, occurredAt: new Date(e.occurredAt) }))),
  // Everything the server holds for a device. Add each new per-device collection here.
  deleteAll: async (deviceId: string) => {
    await EventModel.deleteMany({ deviceId });
    await FallbackRequestModel.deleteMany({ deviceId });
    await MerchantLabelModel.deleteMany({ deviceId });
    await InboundItemModel.deleteMany({ deviceId });
    await DeviceModel.deleteOne({ deviceId });
  },
};
