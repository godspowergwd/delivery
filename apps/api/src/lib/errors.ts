/** Typed application errors with stable codes for the client. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Array<{ path: string; message: string }>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: Array<{ path: string; message: string }>) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'You need to sign in to continue.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'The requested resource was not found.') =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export const tooManyRequests = (message = 'Too many requests. Please slow down.') =>
  new AppError(429, 'RATE_LIMITED', message);