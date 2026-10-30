export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "DEVICE_AUTH_FAILED"
  | "IDEMPOTENT_REPLAY"
  | "UNPROCESSABLE";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown, expose = true) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "VALIDATION_ERROR", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new AppError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new AppError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Resource not found") {
    return new AppError(404, "NOT_FOUND", message);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(409, "CONFLICT", message, details);
  }
  static unprocessable(message: string, details?: unknown) {
    return new AppError(422, "UNPROCESSABLE", message, details);
  }
  static internal(message = "An unexpected error occurred") {
    return new AppError(500, "INTERNAL_ERROR", message, undefined, false);
  }
}
