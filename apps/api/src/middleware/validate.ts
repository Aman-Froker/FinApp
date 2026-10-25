import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

import { ValidationError } from '../lib/errors.js';

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

// Parses and replaces req.body / query / params so handlers only ever see typed, trimmed input.
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ['body', 'query', 'params'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        throw new ValidationError(
          result.error.issues.map((i) => ({ path: [key, ...i.path].join('.'), message: i.message })),
        );
      }
      if (key === 'body') req.body = result.data;
      else Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}
