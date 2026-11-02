import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AppError } from "./errors";
import { attachEvidence, dataDirectory, getOrderBundleData, readEvidence, requireWrite } from "./store";
import { signScopedToken, verifyScopedToken } from "./session";
import type { Evidence, Session } from "./types";

type PendingUpload = { id: string; tenantId: string; locationId: string; orderId: string; filename: string; mimeType: string; size: number; sha256?: string; expiresAt: number; uploaded: boolean; completedEvidenceId?: string };
const globalUploads = globalThis as typeof globalThis & { rtgUploadQueue?: Promise<unknown> };
const pendingDirectory = () => path.join(dataDirectory(), "pending");
const pendingPath = (id: string) => path.join(pendingDirectory(), `${id}.json`);
const bytesPath = (id: string) => path.join(pendingDirectory(), `${id}.bin`);
async function serialized<T>(work: () => Promise<T>): Promise<T> {
  const task = (globalUploads.rtgUploadQueue ?? Promise.resolve()).catch(() => {}).then(work);
  globalUploads.rtgUploadQueue = task.catch(() => {}); return task;
}
async function save(pending: PendingUpload) {
  const temporary = `${pendingPath(pending.id)}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(pending), { mode: 0o600 });
  await rename(temporary, pendingPath(pending.id));
}
function checkToken(session: Session, token: string) {
  requireWrite(session);
  const claim = verifyScopedToken(token);
  if (!claim || claim.purpose !== "evidence-upload" || typeof claim.id !== "string" || !z.uuid().safeParse(claim.id).success || claim.tenantId !== session.tenantId || claim.locationId !== session.locationId) throw new AppError(403, "The upload token is invalid for this workspace.");
  if (typeof claim.expiresAt !== "number" || claim.expiresAt <= Date.now()) throw new AppError(410, "The upload link expired. Request a new one.");
  return claim as unknown as PendingUpload;
}
async function load(session: Session, token: string) {
  const claim = checkToken(session, token);
  let pending: PendingUpload;
  try { pending = JSON.parse(await readFile(pendingPath(claim.id), "utf8")); } catch { throw new AppError(404, "Pending upload not found."); }
  if (pending.tenantId !== session.tenantId || pending.locationId !== session.locationId || pending.orderId !== claim.orderId) throw new AppError(403, "The upload does not belong to this workspace.");
  if (pending.expiresAt <= Date.now()) throw new AppError(410, "The upload link expired. Request a new one.");
  await getOrderBundleData(session, pending.orderId);
  return pending;
}
const beginSchema = z.object({ orderId: z.string().min(1).max(100), filename: z.string().min(1).max(200), mimeType: z.enum(["image/jpeg", "image/png"]), size: z.number().int().min(1).max(10 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export async function beginUpload(session: Session, input: unknown) {
  requireWrite(session); const parsed = beginSchema.parse(input);
  await getOrderBundleData(session, parsed.orderId);
  const pending: PendingUpload = { ...parsed, id: randomUUID(), tenantId: session.tenantId, locationId: session.locationId, expiresAt: Date.now() + 5 * 60_000, uploaded: false };
  await mkdir(pendingDirectory(), { recursive: true, mode: 0o700 }); await save(pending);
  const uploadToken = signScopedToken({ ...pending, purpose: "evidence-upload" });
  return { uploadId: pending.id, uploadToken, uploadUrl: `/api/evidence/upload?token=${encodeURIComponent(uploadToken)}`, expiresAt: new Date(pending.expiresAt).toISOString(), method: "PUT", headers: { "Content-Type": parsed.mimeType } };
}
export async function putUpload(session: Session, token: string, bytes: Uint8Array) {
  return serialized(async () => {
    const pending = await load(session, token);
    if (pending.uploaded) throw new AppError(409, "This one-use upload URL has already been used.");
    if (bytes.length !== pending.size) throw new AppError(400, "Uploaded bytes do not match the declared file size.");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (pending.sha256 && pending.sha256 !== sha256) throw new AppError(409, "Uploaded bytes do not match the declared SHA-256 hash.");
    try {
      await writeFile(bytesPath(pending.id), bytes, { mode: 0o600, flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // A crash can leave the original bytes committed before uploaded=true is
      // saved. Recover only that exact upload; never overwrite conflicting bytes.
      const storedPath = bytesPath(pending.id);
      const metadata = await stat(storedPath);
      if (!metadata.isFile() || metadata.size !== pending.size) throw new AppError(409, "Stored upload bytes conflict with this upload. Request a new upload URL.");
      const stored = await readFile(storedPath);
      if (stored.length !== pending.size || createHash("sha256").update(stored).digest("hex") !== sha256) throw new AppError(409, "Stored upload bytes conflict with this upload. Request a new upload URL.");
    }
    pending.uploaded = true; pending.sha256 = sha256; await save(pending);
    return { uploadId: pending.id, uploaded: true, sha256 };
  });
}
const completeSchema = z.object({ orderId: z.string().min(1).max(100), uploadToken: z.string().min(1).max(8192), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), stage: z.enum(["PACKED", "SEALED", "HANDOFF"]).default("PACKED"), note: z.string().max(1000).default(""), deviceCapturedAt: z.iso.datetime().optional(), sealId: z.string().max(100).optional(), handoverNote: z.string().max(1000).optional() }).strict();
export async function completeUpload(session: Session, input: unknown): Promise<Evidence> {
  const parsed = completeSchema.parse(input);
  return serialized(async () => {
    const pending = await load(session, parsed.uploadToken);
    if (pending.orderId !== parsed.orderId) throw new AppError(403, "This upload belongs to another order.");
    if (pending.completedEvidenceId) return (await readEvidence(session, pending.completedEvidenceId)).evidence;
    if (!pending.uploaded) throw new AppError(409, "Upload the photo bytes before completing the evidence record.");
    const bytes = await readFile(bytesPath(pending.id));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== pending.sha256 || (parsed.sha256 && parsed.sha256 !== sha256)) throw new AppError(409, "Evidence hash verification failed.");
    const evidence = await attachEvidence(session, pending.orderId, { bytes, filename: pending.filename, mimeType: pending.mimeType, stage: parsed.stage, note: parsed.note, deviceCapturedAt: parsed.deviceCapturedAt, sealId: parsed.sealId, handoverNote: parsed.handoverNote, clientCaptureId: pending.id });
    pending.completedEvidenceId = evidence.id; await save(pending);
    await unlink(bytesPath(pending.id)).catch(() => {});
    return evidence;
  });
}
export async function signedEvidenceUrl(session: Session, id: string) {
  await readEvidence(session, id);
  const expiresAt = Date.now() + 5 * 60_000;
  const token = signScopedToken({ purpose: "evidence-read", id, tenantId: session.tenantId, locationId: session.locationId, expiresAt });
  return { url: `/api/evidence/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, expiresAt: new Date(expiresAt).toISOString(), authenticationRequired: true };
}
export function verifyEvidenceToken(session: Session, id: string, token: string) {
  const claim = verifyScopedToken(token);
  if (!claim || claim.purpose !== "evidence-read" || claim.id !== id || claim.tenantId !== session.tenantId || claim.locationId !== session.locationId || typeof claim.expiresAt !== "number" || claim.expiresAt <= Date.now()) throw new AppError(403, "The evidence link is invalid or expired.");
}
