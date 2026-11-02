import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { AppError, assertSandbox } from "./errors";
import { adapters, integrations } from "./providers";
import type { AuditEvent, DashboardData, Evidence, EvidenceStage, Location, Order, OrderStatus, Restaurant, Session } from "./types";

export const restaurants: Restaurant[] = [
  { id: "restaurant-riverside", name: "Riverside Kitchen" },
  { id: "restaurant-olive", name: "Olive & Grain" },
];
export const locations: Location[] = [
  { id: "loc-soho", restaurantId: "restaurant-riverside", name: "Soho", address: "18 Broadwick Street, London" },
  { id: "loc-camden", restaurantId: "restaurant-riverside", name: "Camden", address: "42 Camden High Street, London" },
  { id: "loc-shoreditch", restaurantId: "restaurant-olive", name: "Shoreditch", address: "7 Redchurch Street, London" },
];
type Receipt = { key: string; orderId: string };
type State = { version: 1; orders: Order[]; audit: AuditEvent[]; receipts: Receipt[]; disconnected?: string[] };
const globalStore = globalThis as typeof globalThis & { rtgStoreQueue?: Promise<unknown> };
export function dataDirectory() { return path.resolve(/* turbopackIgnore: true */ process.env.RTG_DATA_DIR || ".data"); }
const statePath = () => path.join(dataDirectory(), "state.json");
const filePath = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new AppError(404, "Evidence not found.");
  return path.join(dataDirectory(), "files", id);
};
export function ensureScope(session: Session) {
  assertSandbox();
  if (session.tenantId !== "tenant-demo" || !locations.some(l => l.id === session.locationId)) throw new AppError(403, "This workspace is not available.");
}
export function requireWrite(session: Session) {
  ensureScope(session);
  if (session.role === "VIEWER") throw new AppError(403, "Viewers cannot change orders or evidence.");
}
function audit(state: State, session: Session, action: string, detail: string, orderId?: string) {
  state.audit.push({ id: randomUUID(), tenantId: session.tenantId, locationId: session.locationId, orderId, action, actor: session.name, createdAt: new Date().toISOString(), detail });
}
function seed(): State {
  const menu = [
    [{ name: "Crispy chicken burger", quantity: 2 }, { name: "Skin-on fries", quantity: 1 }],
    [{ name: "Grilled halloumi bowl", quantity: 1 }, { name: "House lemonade", quantity: 1 }],
    [{ name: "Smoky BBQ burger", quantity: 1 }, { name: "Sweet potato fries", quantity: 2 }],
    [{ name: "Roasted vegetable wrap", quantity: 2 }],
  ];
  const statuses: OrderStatus[] = ["NEW", "NEW", "PACKING", "PACKING", "READY", "READY", "COLLECTED", "COLLECTED", "COLLECTED"];
  const orders: Order[] = Array.from({ length: 13 }, (_, i) => {
    const placedAt = new Date(Date.now() - (i * 4 + 2) * 60_000).toISOString();
    return { id: randomUUID(), tenantId: "tenant-demo", locationId: i < 9 ? "loc-soho" : i < 11 ? "loc-camden" : "loc-shoreditch", reference: ["UE", "DL", "RTG"][i % 3] + "-" + (1048 - i), provider: (["UBER_EATS", "DELIVEROO", "MANUAL"] as const)[i % 3], providerOrderId: i % 3 === 2 ? undefined : `fixture-${randomUUID()}`, providerCreatedAt: placedAt, receivedAt: placedAt, status: statuses[i % 9], items: menu[i % 4], notes: i === 0 ? "No pickles. Keep sauces separate." : i === 3 ? "Cut wraps in half." : "", placedAt, updatedAt: placedAt, evidence: [], source: "fixture" };
  });
  return { version: 1, orders, receipts: [], audit: orders.map(order => ({ id: randomUUID(), tenantId: order.tenantId, locationId: order.locationId, orderId: order.id, action: "FIXTURE_LOADED", actor: "RTG sandbox", createdAt: order.placedAt, detail: `Demonstration order ${order.reference} loaded from local fixtures.` })) };
}
async function loadState(): Promise<State> {
  await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
  try { return JSON.parse(await readFile(statePath(), "utf8")) as State; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new AppError(500, "Sandbox data could not be read. Restore the local data file before continuing.");
    const state = seed(); await saveState(state); return state;
  }
}
async function saveState(state: State) {
  const temporary = `${statePath()}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(temporary, statePath());
}
async function transaction<T>(work: (state: State) => Promise<T> | T, write = false): Promise<T> {
  const previous = globalStore.rtgStoreQueue ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    assertSandbox(); const state = await loadState(); const result = await work(state);
    if (write) await saveState(state);
    return structuredClone(result);
  });
  globalStore.rtgStoreQueue = task.catch(() => {});
  return task;
}
function scopedOrder(state: State, session: Session, id: string) {
  ensureScope(session);
  const order = state.orders.find(o => o.id === id && o.tenantId === session.tenantId && o.locationId === session.locationId);
  if (!order) throw new AppError(404, "Order not found in this location.");
  return order;
}
export async function getDashboard(session: Session): Promise<DashboardData> {
  ensureScope(session);
  return transaction(state => ({ mode: "sandbox" as const, user: session, activeLocationId: session.locationId, restaurants, locations, orders: state.orders.filter(o => o.tenantId === session.tenantId && o.locationId === session.locationId).sort((a,b) => b.placedAt.localeCompare(a.placedAt)), audit: state.audit.filter(a => a.tenantId === session.tenantId && a.locationId === session.locationId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100), integrations }));
}
export const orderInputSchema = z.object({
  reference: z.string().trim().min(2).max(64),
  provider: z.enum(["MANUAL", "UBER_EATS", "DELIVEROO"]).default("MANUAL"),
  items: z.array(z.object({ name: z.string().trim().min(1).max(140), quantity: z.number().int().min(1).max(99) })).min(1).max(30),
  notes: z.string().trim().max(2000).default(""),
}).strict();
export async function createOrder(session: Session, input: unknown): Promise<Order> {
  requireWrite(session); const parsed = orderInputSchema.parse(input);
  return transaction(state => {
    const now = new Date().toISOString();
    const order: Order = { ...parsed, id: randomUUID(), tenantId: session.tenantId, locationId: session.locationId, status: "NEW", placedAt: now, receivedAt: now, updatedAt: now, evidence: [], source: "manual" };
    state.orders.push(order); audit(state, session, "ORDER_CREATED", `Manual entry created for ${order.reference}.`, order.id); return order;
  }, true);
}
const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = { NEW: "PACKING", PACKING: "READY", READY: "COLLECTED" };
export async function transitionOrder(session: Session, id: string, status: OrderStatus): Promise<Order> {
  requireWrite(session);
  return transaction(state => {
    const order = scopedOrder(state, session, id);
    if (nextStatus[order.status] !== status) throw new AppError(409, "Orders must move from New to Packing to Ready to Collected.");
    const before = order.status; order.status = status; order.updatedAt = new Date().toISOString();
    audit(state, session, "STATUS_CHANGED", `${before} → ${status}`, order.id); return order;
  }, true);
}
export type EvidenceInput = { bytes: Uint8Array; filename: string; mimeType: string; stage: EvidenceStage; note: string; deviceCapturedAt?: string; clientCaptureId?: string; sealId?: string; handoverNote?: string };
export async function validatePhoto(bytes: Uint8Array): Promise<"image/jpeg" | "image/png"> {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new AppError(400, "Choose a JPEG or PNG photo under 10 MB.");
  const isPng = bytes.length > 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!isPng && !isJpeg) throw new AppError(400, "The uploaded file must contain a real JPEG or PNG image.");
  if (isPng) {
    if (bytes.length < 24) throw new AppError(400, "The PNG photo is incomplete.");
    const header = Buffer.from(bytes);
    if (header.readUInt32BE(16) * header.readUInt32BE(20) > 40_000_000) throw new AppError(400, "The image dimensions exceed 40 megapixels.");
  }
  if (isJpeg && (bytes.at(-2) !== 255 || bytes.at(-1) !== 217)) throw new AppError(400, "The JPEG photo is incomplete.");
  try {
    // Parse before accepting so corrupt images cannot break later bundle generation.
    const pdf = await PDFDocument.create();
    const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    if (image.width * image.height > 40_000_000 || image.width < 1 || image.height < 1) throw new Error("Image dimensions unsupported");
  } catch { throw new AppError(400, "The photo is corrupt or too large to process. Choose another JPEG or PNG."); }
  return isPng ? "image/png" : "image/jpeg";
}
export async function attachEvidence(session: Session, id: string, input: EvidenceInput): Promise<Evidence> {
  requireWrite(session);
  const stage = z.enum(["PACKED", "SEALED", "HANDOFF"]).parse(input.stage);
  const note = z.string().trim().max(1000).parse(input.note ?? "");
  const deviceCapturedAt = input.deviceCapturedAt ? z.iso.datetime().parse(input.deviceCapturedAt) : undefined;
  const clientCaptureId = input.clientCaptureId ? z.uuid().parse(input.clientCaptureId) : undefined;
  const sealId = z.string().trim().max(100).parse(input.sealId || "");
  const handoverNote = z.string().trim().max(1000).parse(input.handoverNote || "");
  const mimeType = await validatePhoto(input.bytes);
  return transaction(async state => {
    const order = scopedOrder(state, session, id);
    if (clientCaptureId) {
      const existing = order.evidence.find(e => e.clientCaptureId === clientCaptureId);
      if (existing) {
        const digest = createHash("sha256").update(input.bytes).digest("hex");
        if (existing.sha256 !== digest) throw new AppError(409, "This capture ID already belongs to a different photo.");
        return existing;
      }
    }
    if (order.evidence.length >= 30) throw new AppError(400, "This order already has 30 evidence photos.");
    const retentionDays = Number(process.env.RTG_RETENTION_DAYS || 30);
    const evidence: Evidence = { id: randomUUID(), orderId: id, tenantId: session.tenantId, filename: path.basename(input.filename).replace(/[^\w. -]/g, "_").slice(0, 100) || "photo", mimeType, size: input.bytes.length, sha256: createHash("sha256").update(input.bytes).digest("hex"), createdAt: new Date().toISOString(), capturedBy: session.name, stage, note, deviceCapturedAt, clientCaptureId, sealId, handoverNote, retentionUntil: new Date(Date.now() + (Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 30) * 86400000).toISOString() };
    await mkdir(path.join(dataDirectory(), "files"), { recursive: true, mode: 0o700 });
    await writeFile(filePath(evidence.id), input.bytes, { mode: 0o600, flag: "wx" });
    order.evidence.push(evidence); order.updatedAt = evidence.createdAt;
    audit(state, session, "EVIDENCE_CAPTURED", `${stage} photo saved; SHA-256 ${evidence.sha256}`, id);
    return evidence;
  }, true);
}
async function verifiedBytes(evidence: Evidence) {
  let bytes: Buffer;
  try { bytes = await readFile(filePath(evidence.id)); }
  catch { throw new AppError(409, "Evidence file is missing. The bundle cannot be verified."); }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(evidence.sha256) || !timingSafeEqual(Buffer.from(digest), Buffer.from(evidence.sha256))) throw new AppError(409, "Evidence integrity check failed. Export has been stopped.");
  return bytes;
}
export async function readEvidence(session: Session, id: string): Promise<{ evidence: Evidence; bytes: Uint8Array }> {
  ensureScope(session);
  const evidence = await transaction(state => {
    const order = state.orders.find(o => o.tenantId === session.tenantId && o.locationId === session.locationId && o.evidence.some(e => e.id === id));
    if (!order) throw new AppError(404, "Evidence not found in this location.");
    return order.evidence.find(e => e.id === id)!;
  });
  return { evidence, bytes: await verifiedBytes(evidence) };
}
export async function getOrderBundleData(session: Session, id: string) {
  ensureScope(session);
  const data = await transaction(state => {
    const order = scopedOrder(state, session, id);
    return { order, location: locations.find(l => l.id === order.locationId)!, restaurant: restaurants.find(r => r.id === locations.find(l => l.id === order.locationId)!.restaurantId)!, audit: state.audit.filter(a => a.orderId === id && a.tenantId === session.tenantId && a.locationId === session.locationId) };
  });
  const photos = await Promise.all(data.order.evidence.map(async evidence => ({ evidence, bytes: await verifiedBytes(evidence) })));
  return { ...data, photos };
}
export async function recordBundleExport(session: Session, id: string) {
  ensureScope(session);
  await transaction(state => { scopedOrder(state, session, id); audit(state, session, "BUNDLE_EXPORTED", "PDF evidence bundle generated after SHA-256 verification.", id); }, true);
}
export const webhookInputSchema = z.object({ provider: z.enum(["UBER_EATS", "DELIVEROO"]), eventId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), fixture: z.literal("order.created") }).strict();
export async function processSandboxWebhook(session: Session, input: unknown): Promise<{ order: Order; duplicate: boolean }> {
  requireWrite(session); const parsed = webhookInputSchema.parse(input);
  return transaction(state => {
    const key = `${session.tenantId}:${session.locationId}:${parsed.provider}:${parsed.eventId}`;
    if (state.disconnected?.includes(`${session.locationId}:${parsed.provider}`)) throw new AppError(409, "This fixture connection has been disconnected. Live access remains disabled.");
    const receipt = state.receipts.find(r => r.key === key);
    if (receipt) return { order: scopedOrder(state, session, receipt.orderId), duplicate: true };
    const fixture = adapters[parsed.provider].fixture(parsed.eventId);
    const now = new Date().toISOString();
    const order: Order = { ...fixture, id: randomUUID(), tenantId: session.tenantId, locationId: session.locationId, provider: parsed.provider, providerOrderId: `fixture-${parsed.eventId}`, providerCreatedAt: now, receivedAt: now, status: "NEW", evidence: [], placedAt: now, updatedAt: now, source: "fixture" };
    state.orders.push(order); state.receipts.push({ key, orderId: order.id });
    audit(state, session, "SANDBOX_WEBHOOK", `${parsed.provider} fixture event ${parsed.eventId} processed.`, order.id);
    return { order, duplicate: false };
  }, true);
}
export async function disconnectProvider(session: Session, provider: "UBER_EATS" | "DELIVEROO") {
  requireWrite(session);
  if (!["ADMIN", "MANAGER"].includes(session.role)) throw new AppError(403, "Only an admin or manager can disconnect integrations.");
  return transaction(state => {
    state.disconnected ??= [];
    const key = `${session.locationId}:${provider}`;
    if (!state.disconnected.includes(key)) { state.disconnected.push(key); audit(state, session, "PROVIDER_DISCONNECTED", `${provider} fixture ingestion revoked. No live provider connection existed.`); }
    return { provider, connected: false, liveEnabled: false, mode: "sandbox" };
  }, true);
}
export async function providerStatus(session: Session, provider: "UBER_EATS" | "DELIVEROO") {
  ensureScope(session);
  return transaction(state => ({ ...integrations.find(i => i.provider === provider)!, fixtureEnabled: !state.disconnected?.includes(`${session.locationId}:${provider}`), connected: false, capabilities: adapters[provider].capabilities(), approvalRequired: true }));
}
