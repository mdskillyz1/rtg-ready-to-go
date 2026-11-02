import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Session } from "./types";
import { assertSandbox } from "./errors";

export const SESSION_COOKIE = "rtg_sandbox_session";
const globalSecret = globalThis as typeof globalThis & { rtgSessionSecret?: string };
function secret() {
  const configured = process.env.RTG_SESSION_SECRET;
  if (configured && configured.length < 32) throw new Error("RTG_SESSION_SECRET must be at least 32 characters.");
  return configured || (globalSecret.rtgSessionSecret ??= randomBytes(48).toString("base64url"));
}
const signature = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");
export function signScopedToken(value: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyScopedToken(token: string): Record<string, unknown> | null {
  if (token.length > 8192) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
  const expected = signature(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return null; }
}
export function signSession(session: Session, expiresAt = Date.now() + 8 * 60 * 60 * 1000): string {
  assertSandbox();
  const payload = Buffer.from(JSON.stringify({ ...session, expiresAt })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifySession(token?: string): Session | null {
  assertSandbox();
  if (!token || token.length > 4096) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
  const expected = signature(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof value.expiresAt !== "number" || value.expiresAt <= Date.now()) return null;
    if (!["ADMIN", "MANAGER", "STAFF", "VIEWER"].includes(value.role) || !value.userId || !value.tenantId || !value.locationId || !value.name) return null;
    const { userId, tenantId, locationId, name, role } = value;
    return { userId, tenantId, locationId, name, role };
  } catch { return null; }
}
