import { Router } from "express";
import { loginSchema, refreshSchema } from "@frostguard/shared";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/auth";
import { loginLimiter } from "../../middleware/security";
import { env } from "../../config/env";
import { ok } from "../../lib/http";
import * as authService from "./auth.service";

export const authRouter: Router = Router();

const accessCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.cookieSecure,
  path: "/",
  maxAge: env.accessTtlMs,
};
const refreshCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.cookieSecure,
  path: "/api/v1/auth",
  maxAge: env.refreshTtlMs,
};

authRouter.post("/login", loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password, organizationSlug } = req.body;
    const result = await authService.login(email, password, organizationSlug, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.cookie("fg_access", result.tokens.accessToken, accessCookie);
    res.cookie("fg_refresh", result.tokens.refreshToken, refreshCookie);
    return ok(res, {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresAt: result.tokens.expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", validate(refreshSchema), async (req, res, next) => {
  try {
    const token = req.body.refreshToken ?? req.cookies?.fg_refresh;
    if (!token) return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "No refresh token" }, meta: { requestId: res.locals.requestId } });
    const tokens = await authService.rotateRefreshToken(token, { ip: req.ip, userAgent: req.headers["user-agent"] });
    res.cookie("fg_access", tokens.accessToken, accessCookie);
    res.cookie("fg_refresh", tokens.refreshToken, refreshCookie);
    return ok(res, { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt.toISOString() });
  } catch (err) {
    res.clearCookie("fg_access", { path: "/" });
    res.clearCookie("fg_refresh", { path: "/api/v1/auth" });
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    await authService.revokeSession(req.cookies?.fg_refresh ?? req.body?.refreshToken);
    res.clearCookie("fg_access", { path: "/" });
    res.clearCookie("fg_refresh", { path: "/api/v1/auth" });
    return ok(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await authService.getSessionUser(req.auth!.userId, req.auth!.orgId);
    return ok(res, user);
  } catch (err) {
    next(err);
  }
});
