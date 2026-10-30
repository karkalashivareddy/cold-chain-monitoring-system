import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { env } from "../config/env";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = res.locals.requestId as string | undefined;

  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred";
  let details: unknown;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.expose ? err.message : "An unexpected error occurred";
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed";
    details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      status = 409;
      code = "CONFLICT";
      message = "A record with this unique value already exists";
      details = { target: err.meta?.target };
    } else if (err.code === "P2003") {
      status = 409;
      code = "CONFLICT";
      message = "Operation violates a related record constraint";
    } else if (err.code === "P2025") {
      status = 404;
      code = "NOT_FOUND";
      message = "Resource not found";
    } else if (err.code === "P2034") {
      status = 409;
      code = "CONFLICT";
      message = "The record changed concurrently. Please retry.";
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid query parameters";
  }

  if (status >= 500) {
    logger.error(
      { err, requestId, method: req.method, path: req.path },
      "Unhandled request error"
    );
  } else {
    logger.warn({ requestId, status, code, path: req.path }, "Request rejected");
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(!env.isProduction && status >= 500 && err instanceof Error
        ? { debug: { name: err.name, message: err.message } }
        : {}),
    },
    meta: { requestId },
  });
}
