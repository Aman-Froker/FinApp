export type ErrorDetail = { path: string; message: string };

// One hierarchy. Every error the API returns on purpose is one of these.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: ErrorDetail[], message = 'Request validation failed') {
    super(400, 'validation_failed', message, details);
  }
}

export class AuthError extends AppError {
  constructor(code = 'unauthenticated', message = 'Authentication required') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super(404, 'not_found', `${entity} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}
