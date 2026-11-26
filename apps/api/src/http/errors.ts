import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ERROR_CODES, fieldErrors, type ApiErrorBody, type ErrorCode } from '@taskflow/core';
import { z } from 'zod';

/** An error the client is allowed to see. Anything else becomes a generic 500. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const unauthorized = (message = 'Please sign in again') =>
  new AppError(401, ERROR_CODES.unauthorized, message);

export const forbidden = (message = "You don't have permission to do that") =>
  new AppError(403, ERROR_CODES.forbidden, message);

export const notFoundError = (message: string) => new AppError(404, ERROR_CODES.notFound, message);

export const conflict = (message: string, fields?: Record<string, string>) =>
  new AppError(409, ERROR_CODES.conflict, message, fields);

/** Validate untrusted input at the boundary; throws a 400 with per-field messages. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, ERROR_CODES.validation, 'Please fix the highlighted fields', fieldErrors(result.error));
  }
  return result.data;
}

export const notFound: RequestHandler = (req) => {
  throw new AppError(404, ERROR_CODES.notFound, `No route for ${req.method} ${req.path}`);
};

const isBodyParseError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed';

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { error: { code: ERROR_CODES.internal, message: 'Something went wrong. Please try again.' } };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } };
  } else if (isBodyParseError(err)) {
    status = 400;
    body = { error: { code: ERROR_CODES.validation, message: 'Request body is not valid JSON' } };
  } else {
    console.error(err);
  }
  res.status(status).json(body);
};
