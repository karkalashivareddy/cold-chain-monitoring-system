import crypto from "node:crypto";
import { sha256, timingSafeEqualHex } from "./tokens";

/**
 * Device credentials are high-entropy random keys, not human passwords, so a
 * fast SHA-256 digest is appropriate (and avoids Argon2 cost on every reading).
 * Only the digest is stored; the plaintext key is returned exactly once.
 */
export function hashDeviceKey(key: string): string {
  return sha256(key);
}

export function verifyDeviceKey(storedHash: string, presentedKey: string): boolean {
  return timingSafeEqualHex(storedHash, sha256(presentedKey));
}

export function issueDeviceKey(): { key: string; hash: string; prefix: string } {
  const secret = crypto.randomBytes(32).toString("base64url");
  const key = `fgd_${secret}`;
  return { key, hash: hashDeviceKey(key), prefix: key.slice(0, 12) };
}

/** Canonical payload signature for optional transport integrity (replay-resistant). */
export function signTelemetryPayload(
  body: { deviceId: string; temperature: number; recordedAt: string; bootId: string; sequenceNumber: number; nonce?: string },
  secret: string
): string {
  const canonical = [body.deviceId, body.temperature.toFixed(2), body.recordedAt, body.bootId, body.sequenceNumber, body.nonce ?? ""].join("|");
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

export function verifyTelemetrySignature(
  body: { deviceId: string; temperature: number; recordedAt: string; bootId: string; sequenceNumber: number; nonce?: string; signature?: string },
  secret: string
): boolean {
  if (!body.signature) return false;
  const expected = signTelemetryPayload(body, secret);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(body.signature, "hex"));
}
