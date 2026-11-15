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
