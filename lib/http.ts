import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, assertSandbox } from "./errors";
import { SESSION_COOKIE, verifySession } from "./session";
import { ensureScope } from "./store";
import type { Session } from "./types";

export function requireSession(request: NextRequest): Session {
  assertSandbox();
  const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw new AppError(401, "Open the sandbox workspace to continue.");
  ensureScope(session); return session;
}
export function checkOrigin(request: NextRequest) {
  assertSandbox();
  if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024) throw new AppError(413, "Request is too large.");
  const expectedOrigin = localRequestOrigin(request);
  const origin = request.headers.get("origin");
  if (origin && origin !== expectedOrigin) throw new AppError(403, "Cross-origin changes are not allowed.");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) throw new AppError(403, "Cross-origin changes are not allowed.");
  rateLimit(request);
}
function localRequestOrigin(request: NextRequest): string {
  const internal = new URL(request.url);
  const host = request.headers.get("host") || internal.host;
  let external: URL;
  try { external = new URL(`${internal.protocol}//${host}`); }
  catch { throw new AppError(403, "Sandbox sessions are available on loopback only."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"];
  if (!["http:", "https:"].includes(internal.protocol) || !loopback.includes(internal.hostname) || !loopback.includes(external.hostname) || host.trim() !== host || external.username || external.password || external.pathname !== "/" || external.search || external.hash) {
    throw new AppError(403, "Sandbox sessions are available on loopback only.");
  }
  // Next can canonicalise request.url to localhost. Host retains the browser's
  // exact authority. Forwarded host/protocol headers are deliberately ignored.
  return external.origin;
}
const globalLimits = globalThis as typeof globalThis & { rtgRateLimits?: Map<string, { count: number; resetAt: number }> };
function rateLimit(request: NextRequest) {
  const limits = globalLimits.rtgRateLimits ??= new Map();
  const now = Date.now();
  // Local, single-process sandbox limit; production needs a distributed limiter.
  const key = request.cookies.get(SESSION_COOKIE)?.value?.slice(-43) || "anonymous-local";
  const current = limits.get(key);
  if (!current || current.resetAt <= now) { limits.set(key, { count: 1, resetAt: now + 60_000 }); }
  else if (++current.count > 120) throw new AppError(429, "Too many changes. Wait a minute before retrying.");
  if (limits.size > 1000) for (const [k, v] of limits) if (v.resetAt <= now) limits.delete(k);
}
export function requireLocalRequest(request: NextRequest) {
  localRequestOrigin(request);
}
export async function jsonBody(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 64 * 1024) throw new AppError(413, "Request is too large.");
  const bytes = await boundedBody(request, 64 * 1024);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AppError(400, "Send valid JSON."); }
}
export async function boundedBody(request: NextRequest, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new AppError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new AppError(413, "Request is too large."); }
    chunks.push(value);
  }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export function apiError(error: unknown): NextResponse {
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "Input"}: ${i.message}`).join("; ") }, { status: 400 });
  console.error("RTG request failed", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
}
export function jsonResponse(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } }); }
