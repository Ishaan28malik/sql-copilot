/**
 * Application error with a stable machine-readable code and an HTTP status,
 * thrown by service code and translated to a JSON body by the API layer.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthorized = (message = 'Not authenticated') => new AppError('UNAUTHORIZED', message, 401);
export const forbidden = (message = 'Not allowed') => new AppError('FORBIDDEN', message, 403);
export const notFound = (message = 'Not found') => new AppError('NOT_FOUND', message, 404);
export const badRequest = (message: string) => new AppError('BAD_REQUEST', message, 400);
export const upstreamError = (message: string) => new AppError('UPSTREAM_ERROR', message, 502);
