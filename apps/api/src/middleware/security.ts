import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env";
import { AppError } from "../lib/errors";

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(incoming)
      ? incoming
      : crypto.randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

/**
 * Defence-in-depth CSRF guard. Session cookies are SameSite=Lax, CORS is an
 * allowlist, and every state-changing browser call must carry a custom header
 * that a cross-site form cannot set.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  const safe = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (safe) return next();
  const usingCookie = Boolean(req.cookies?.fg_access || req.cookies?.fg_refresh);
  if (usingCookie && req.headers["x-frostguard-csrf"] !== "1") {
    return next(AppError.forbidden("Missing CSRF header"));
  }
  next();
}

export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "unknown")}:${String((req.body as { email?: string })?.email ?? "")}`,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." } },
});

export const telemetryLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.isTest,
  // This limiter runs before device authentication; keying by a supplied key
  // would let attackers mint a fresh bucket for every fake credential.
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
});
