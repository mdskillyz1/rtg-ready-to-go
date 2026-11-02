import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";
import { dataDirectory, processSandboxWebhook, requireWrite, webhookInputSchema } from "./store";
import type { Order, Session } from "./types";

export type SandboxInboxEntry = {
  id: string; tenantId: string; locationId: string; provider: "UBER_EATS" | "DELIVEROO";
  eventId: string; receivedAt: string; status: "PENDING" | "PROCESSED" | "RETRY" | "DEAD_LETTER";
  attempts: number; nextAttemptAt?: string; orderId?: string; lastError?: string;
  payload: { provider: "UBER_EATS" | "DELIVEROO"; eventId: string; fixture: "order.created" };
};
const state = globalThis as typeof globalThis & { rtgInboxQueue?: Promise<unknown>; rtgWebhookSecret?: string };
const inboxPath = () => path.join(dataDirectory(), "webhook-inbox.json");
function webhookSecret() { return process.env.RTG_SANDBOX_WEBHOOK_SECRET || (state.rtgWebhookSecret ??= randomBytes(32).toString("hex")); }
export function signSandboxWebhook(rawBody: Uint8Array | string) { return createHmac("sha256", webhookSecret()).update(rawBody).digest("hex"); }
export function verifySandboxWebhookSignature(rawBody: Uint8Array | string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(signSandboxWebhook(rawBody)));
}
async function loadInbox(): Promise<SandboxInboxEntry[]> {
  await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
  try { return JSON.parse(await readFile(inboxPath(), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw new AppError(500, "The sandbox webhook inbox could not be read."); }
}
async function saveInbox(inbox: SandboxInboxEntry[]) {
  const temporary = `${inboxPath()}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(inbox, null, 2), { mode: 0o600 }); await rename(temporary, inboxPath());
}
async function serialize<T>(work: () => Promise<T>): Promise<T> {
  const task = (state.rtgInboxQueue ?? Promise.resolve()).catch(() => {}).then(work);
  state.rtgInboxQueue = task.catch(() => {}); return task;
}
async function runEntry(session: Session, entry: SandboxInboxEntry): Promise<{ order: Order; duplicate: boolean }> {
  entry.attempts++;
  try {
    const result = await processSandboxWebhook(session, entry.payload);
    entry.status = "PROCESSED"; entry.orderId = result.order.id; delete entry.lastError; delete entry.nextAttemptAt;
    return result;
  } catch (error) {
    entry.status = entry.attempts >= 5 ? "DEAD_LETTER" : "RETRY";
    entry.lastError = error instanceof AppError ? error.message : "Fixture processing failed.";
    entry.nextAttemptAt = entry.status === "RETRY" ? new Date(Date.now() + Math.min(60_000, 2 ** entry.attempts * 1000)).toISOString() : undefined;
    throw error;
  }
}
export async function enqueueSandboxWebhook(session: Session, input: unknown) {
  requireWrite(session); const payload = webhookInputSchema.parse(input);
  return serialize(async () => {
    const inbox = await loadInbox();
    let entry = inbox.find(e => e.tenantId === session.tenantId && e.locationId === session.locationId && e.provider === payload.provider && e.eventId === payload.eventId);
    if (entry?.status === "DEAD_LETTER") throw new AppError(409, "This fixture event is in the dead-letter inbox and requires review.");
    if (!entry) {
      entry = { id: randomUUID(), tenantId: session.tenantId, locationId: session.locationId, provider: payload.provider, eventId: payload.eventId, receivedAt: new Date().toISOString(), status: "PENDING", attempts: 0, payload };
      inbox.push(entry); await saveInbox(inbox);
    }
    if (entry.status === "RETRY" && entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > Date.now()) throw new AppError(409, "This fixture event is waiting for its retry backoff.");
    try { return { ...await runEntry(session, entry), inboxId: entry.id }; }
    finally { await saveInbox(inbox); }
  });
}
export async function retrySandboxWebhooks(session: Session) {
  requireWrite(session);
  if (!["ADMIN", "MANAGER"].includes(session.role)) throw new AppError(403, "Only an admin or manager can retry inbox events.");
  return serialize(async () => {
    const inbox = await loadInbox();
    const due = inbox.filter(e => e.tenantId === session.tenantId && e.locationId === session.locationId && ["PENDING", "RETRY"].includes(e.status) && (!e.nextAttemptAt || Date.parse(e.nextAttemptAt) <= Date.now()));
    for (const entry of due) { try { await runEntry(session, entry); } catch { /* failure retained for review and later backoff */ } }
    await saveInbox(inbox);
    return { processed: due.filter(e => e.status === "PROCESSED").length, retry: due.filter(e => e.status === "RETRY").length, deadLetter: due.filter(e => e.status === "DEAD_LETTER").length };
  });
}
export async function getSandboxInbox(session: Session) {
  requireWrite(session);
  if (!["ADMIN", "MANAGER"].includes(session.role)) throw new AppError(403, "Only an admin or manager can view the inbox.");
  return serialize(async () => (await loadInbox()).filter(e => e.tenantId === session.tenantId && e.locationId === session.locationId));
}
