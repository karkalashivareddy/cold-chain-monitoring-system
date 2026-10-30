import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AccessClaims = {
  sub: string;
  org: string;
  role: string;
};

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: "frostguard",
    audience: "frostguard-web",
  });
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: "frostguard",
      audience: "frostguard-web",
    });
    if (typeof decoded === "string") return null;
    const { sub, org, role } = decoded as jwt.JwtPayload & AccessClaims;
    if (!sub || !org || !role) return null;
    return { sub, org, role };
  } catch {
    return null;
  }
}

export function generateRefreshToken(): { token: string; hash: string; familyId: string } {
  const token = crypto.randomBytes(48).toString("base64url");
  return { token, hash: sha256(token), familyId: crypto.randomBytes(16).toString("hex") };
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function randomApiKey(prefix = "fgs"): { key: string; prefix: string } {
  const secret = crypto.randomBytes(32).toString("base64url");
  return { key: `${prefix}_${secret}`, prefix: `${prefix}_${secret.slice(0, 6)}` };
}
