import * as Sentry from '@sentry/node';

import { env } from '../config/env.js';

// Imported first in server.ts so Sentry can instrument Express and Mongoose.
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export const sentryEnabled = Boolean(env.SENTRY_DSN);
