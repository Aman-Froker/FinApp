import { z } from 'zod';

export const registerDeviceBodySchema = z.object({
  platform: z.enum(['android', 'ios']),
  appVersion: z.string().min(1).max(32),
});

export const deviceResponseSchema = z.object({ deviceId: z.string(), token: z.string() });

// Event properties are flat primitives only, so nothing like a raw SMS body can ride along.
const eventSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  properties: z.record(z.string().max(64), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  occurredAt: z.iso.datetime(),
});

export const eventsBodySchema = z.object({ events: z.array(eventSchema).min(1).max(100) });

export type RegisterDeviceBody = z.infer<typeof registerDeviceBodySchema>;
export type DeviceResponse = z.infer<typeof deviceResponseSchema>;
export type ProductEvent = z.infer<typeof eventSchema>;
export type EventsBody = z.infer<typeof eventsBodySchema>;
