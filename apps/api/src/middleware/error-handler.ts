import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

type BodyParserError = Error & { type?: string; status?: number };

// Central handler: one JSON shape, no stack traces in production.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id as string | undefined;

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  const parse = err as BodyParserError;
  if (parse?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON', requestId } });
    return;
  }
  if (parse?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body is too large', requestId } });
    return;
  }

  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: env.NODE_ENV === 'production' ? 'Something went wrong' : String((err as Error)?.message ?? err),
      requestId,
    },
  });
}
