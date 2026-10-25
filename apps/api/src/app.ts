import { randomUUID } from 'node:crypto';

import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { sentryEnabled } from './lib/sentry.js';
import { errorHandler } from './middleware/error-handler.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { devicesRouter } from './modules/devices/devices.routes.js';
import { anthropicExtractor, type Extractor } from './modules/fallback/extractor.js';
import { fallbackRouter } from './modules/fallback/fallback.routes.js';
import { inboundRouter, inboundWebhook } from './modules/inbound/inbound.routes.js';
import { merchantsRouter } from './modules/merchants/merchants.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { healthRouter } from './routes/health.js';

export function createApp({
  extractor = env.ANTHROPIC_API_KEY ? anthropicExtractor() : null,
}: { extractor?: Extractor | null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      // Empty list in development allows any origin; production must list origins.
      origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : env.NODE_ENV === 'production' ? false : true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      maxAge: 600,
    }),
  );
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  app.use((req, res, next) => {
    res.setHeader('x-request-id', String(req.id));
    next();
  });
  app.use('/v1/inbound/email', inboundWebhook);
  app.use(express.json({ limit: '100kb' }));
  app.use(globalLimiter);

  app.use(healthRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1', usersRouter);
  app.use('/v1', devicesRouter);
  app.use('/v1', fallbackRouter(extractor));
  app.use('/v1', merchantsRouter);
  app.use('/v1', inboundRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });

  if (sentryEnabled) Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);
  return app;
}
