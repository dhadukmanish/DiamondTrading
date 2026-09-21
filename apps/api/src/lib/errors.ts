export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code = 'APP_ERROR', public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = 'Record') => new AppError(404, `${what} not found`, 'NOT_FOUND');
export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Unauthorized') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'Forbidden') => new AppError(403, msg, 'FORBIDDEN');
export const conflict = (msg: string) => new AppError(409, msg, 'CONFLICT');
