import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError, errorBody } from "../utils/apiError";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json(errorBody("NOT_FOUND", "The requested resource was not found."));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json(errorBody(err.code, err.message));
  }
  if (err instanceof ZodError) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", err.issues.map((i) => i.message).join("; ")));
  }
  // Never leak stack traces or internals to the client — log server-side only.
  console.error(err);
  return res.status(500).json(errorBody("INTERNAL_ERROR", "Something went wrong. Please try again."));
}

export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
