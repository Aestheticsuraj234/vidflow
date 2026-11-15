import type {ContentfulStatusCode} from 'hono/utils/http-status';

/**
 * Base class for errors the API turns into a JSON response. Anything that is
 * not an AppError becomes a generic 500, so internals never leak to callers.
 */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sign in to continue') {
    super(401, 'unauthorized', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

/** JSON shape of every error response. */
export interface ErrorBody {
  error: {code: string; message: string};
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'validation_failed', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'conflict', message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string) {
    super(413, 'payload_too_large', message);
  }
}
