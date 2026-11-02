import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { NextRequest } from "next/server";
import { attachEvidence, createOrder, getDashboard, getOrderBundleData, readEvidence, transitionOrder, processSandboxWebhook, disconnectProvider } from "../lib/store";
import { generateEvidenceBundle } from "../lib/pdf";
import { signSession, verifySession, signScopedToken } from "../lib/session";
import { beginUpload, putUpload, completeUpload, verifyEvidenceToken } from "../lib/uploads";
import { signSandboxWebhook, verifySandboxWebhookSignature, enqueueSandboxWebhook, getSandboxInbox } from "../lib/webhooks";
import { assertSandbox } from "../lib/errors";
import { checkOrigin, requireSession } from "../lib/http";
import { adapters } from "../lib/providers";
import type { Session } from "../lib/types";

const admin: Session = { userId: "test-user", name: "Test staff (sandbox)", tenantId: "tenant-demo", locationId: "loc-soho", role: "ADMIN" };
const camden: Session = { ...admin, locationId: "loc-camden" };
const otherTenant: Session = { ...admin, tenantId: "tenant-other" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=", "base64");
let directory: string;
const originalData = process.env.RTG_DATA_DIR;
beforeAll(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "rtg-test-")); process.env.RTG_DATA_DIR = directory; process.env.RTG_MODE = "sandbox"; delete process.env.VERCEL; });
afterAll(async () => { process.env.RTG_DATA_DIR = originalData; await rm(directory, { recursive: true, force: true }); });

describe("local sandbox sessions and access boundaries", () => {
  it("accepts an authentic session and rejects tampering and expiry", () => {
    const token = signSession(admin); expect(verifySession(token)).toEqual(admin);
    expect(verifySession(token + "x")).toBeNull();
    expect(verifySession(signSession(admin, Date.now() - 1))).toBeNull();
    expect(verifySession("a." + "é".repeat(43))).toBeNull();
  });
  it("requires a session and rejects cross-origin mutations", () => {
    expect(() => requireSession(new NextRequest("http://localhost:3000/api/orders"))).toThrow(/sandbox workspace/);
    expect(() => checkOrigin(new NextRequest("http://localhost:3000/api/orders", { headers: { origin: "https://evil.example" } }))).toThrow(/Cross-origin/);
  });
  it("compares the browser Origin to an exact loopback Host despite Next URL canonicalisation", () => {
    expect(() => checkOrigin(new NextRequest("http://localhost:3000/api/session", { headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" } }))).not.toThrow();
    expect(() => checkOrigin(new NextRequest("http://localhost:3000/api/session", { headers: { host: "127.0.0.1:3000", origin: "http://localhost:3000" } }))).toThrow(/Cross-origin/);
    expect(() => checkOrigin(new NextRequest("http://localhost:3000/api/session", { headers: { host: "evil.example", origin: "http://evil.example" } }))).toThrow(/loopback/);
    expect(() => checkOrigin(new NextRequest("http://localhost:3000/api/session", { headers: { host: "127.0.0.1:3000", origin: "http://evil.example", "x-forwarded-host": "evil.example" } }))).toThrow(/Cross-origin/);
  });
  it("blocks unknown tenants and scopes all order reads to a location", async () => {
    const state = await getDashboard(admin);
    expect(state.orders.length).toBeGreaterThan(0);
    expect(state.orders.every(o => o.tenantId === admin.tenantId && o.locationId === admin.locationId)).toBe(true);
    await expect(getDashboard(otherTenant)).rejects.toThrow(/workspace/);
    await expect(getOrderBundleData(camden, state.orders[0].id)).rejects.toThrow(/not found/);
  });
  it("prevents a viewer writing and enforces the order lifecycle", async () => {
    const input = { reference: "DEMO-TEST", items: [{ name: "House burger", quantity: 2 }], notes: "No customer PII" };
    await expect(createOrder({ ...admin, role: "VIEWER" }, input)).rejects.toThrow(/Viewers/);
    const order = await createOrder(admin, input);
    await expect(transitionOrder(admin, order.id, "COLLECTED")).rejects.toThrow(/must move/);
    expect((await transitionOrder(admin, order.id, "PACKING")).status).toBe("PACKING");
    expect((await transitionOrder(admin, order.id, "READY")).status).toBe("READY");
    expect((await transitionOrder(admin, order.id, "COLLECTED")).status).toBe("COLLECTED");
  });
  it("does not use the human-facing code as a globally unique ID", async () => {
    const first = await createOrder(admin, { reference: "REPEATED-CODE", items: [{ name: "Fries", quantity: 1 }] });
    const second = await createOrder(admin, { reference: "REPEATED-CODE", items: [{ name: "Salad", quantity: 1 }] });
    expect(first.id).not.toBe(second.id);
  });
  it("fails closed for hosted or production runtime", () => {
    process.env.RTG_MODE = "production"; expect(() => assertSandbox()).toThrow(/local sandbox/);
    process.env.RTG_MODE = "sandbox"; process.env.VERCEL = "1"; expect(() => assertSandbox()).toThrow(/local sandbox/); delete process.env.VERCEL;
  });
});

describe("original photo evidence and export", () => {
  it("validates real images, records digests, and retries a capture safely", async () => {
    const order = await createOrder(admin, { reference: "PHOTO-TEST", items: [{ name: "Packed meal", quantity: 1 }] });
    const input = { bytes: png, filename: "sealed.png", mimeType: "image/png", stage: "SEALED" as const, note: "Bag sealed at pass", clientCaptureId: randomUUID(), deviceCapturedAt: new Date().toISOString(), sealId: "DEMO-SEAL" };
    const evidence = await attachEvidence(admin, order.id, input);
    expect(evidence.sha256).toBe(createHash("sha256").update(png).digest("hex"));
    expect((await attachEvidence(admin, order.id, input)).id).toBe(evidence.id);
    expect((await getOrderBundleData(admin, order.id)).photos).toHaveLength(1);
    expect(Buffer.from((await readEvidence(admin, evidence.id)).bytes)).toEqual(png);
    await expect(readEvidence(camden, evidence.id)).rejects.toThrow(/not found/);
    await expect(attachEvidence(admin, order.id, { ...input, bytes: Buffer.from("<script>not an image</script>") })).rejects.toThrow(/real JPEG or PNG/);
    await expect(attachEvidence(admin, order.id, { ...input, bytes: new Uint8Array(10 * 1024 * 1024 + 1) })).rejects.toThrow(/under 10 MB/);
  });
  it("exports the correct original asset and refuses tampered bytes", async () => {
    const order = await createOrder(admin, { reference: "PDF-테스트", items: [{ name: "Café bowl", quantity: 1 }] });
    const evidence = await attachEvidence(admin, order.id, { bytes: png, filename: "pack.png", mimeType: "image/png", stage: "PACKED", note: "Demo photo" });
    const bytes = await generateEvidenceBundle(admin, order.id);
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    await expect(generateEvidenceBundle(camden, order.id)).rejects.toThrow(/not found/);
    await writeFile(path.join(directory, "files", evidence.id), Buffer.from("tampered"));
    await expect(generateEvidenceBundle(admin, order.id)).rejects.toThrow(/integrity/);
    await writeFile(path.join(directory, "files", evidence.id), png);
  });
  it("binds uploads to an order, retries failed bytes, and completes idempotently", async () => {
    const order = await createOrder(admin, { reference: "TWO-STEP", items: [{ name: "Meal", quantity: 1 }] });
    const sha256 = createHash("sha256").update(png).digest("hex");
    const upload = await beginUpload(admin, { orderId: order.id, filename: "original.png", mimeType: "image/png", size: png.length, sha256 });
    await expect(putUpload(camden, upload.uploadToken, png)).rejects.toThrow(/workspace/);
    await expect(putUpload(admin, upload.uploadToken, Buffer.from("bad"))).rejects.toThrow(/declared file size/);
    await putUpload(admin, upload.uploadToken, png);
    await expect(putUpload(admin, upload.uploadToken, png)).rejects.toThrow(/one-use/);
    const evidence = await completeUpload(admin, { orderId: order.id, uploadToken: upload.uploadToken, stage: "SEALED", sha256 });
    expect((await completeUpload(admin, { orderId: order.id, uploadToken: upload.uploadToken })).id).toBe(evidence.id);
    const expired = signScopedToken({ purpose: "evidence-read", id: evidence.id, tenantId: admin.tenantId, locationId: admin.locationId, expiresAt: Date.now() - 1 });
    expect(() => verifyEvidenceToken(admin, evidence.id, expired)).toThrow(/expired/);
  });
});

describe("provider safety and durable local fixture idempotency", () => {
  it("concurrent duplicate fixture delivery creates one order", async () => {
    const event = { provider: "UBER_EATS", eventId: `event-${randomUUID()}`, fixture: "order.created" };
    const deliveries = await Promise.all(Array.from({ length: 8 }, () => processSandboxWebhook(admin, event)));
    expect(new Set(deliveries.map(r => r.order.id)).size).toBe(1);
    expect(deliveries.filter(r => !r.duplicate)).toHaveLength(1);
  });
  it("verifies sandbox raw signatures and persists the fixture inbox", async () => {
    const raw = '{"sandbox":true,"order":"fixture"}';
    const signature = signSandboxWebhook(raw);
    expect(verifySandboxWebhookSignature(raw, signature)).toBe(true);
    expect(verifySandboxWebhookSignature(raw + " ", signature)).toBe(false);
    expect(verifySandboxWebhookSignature(raw, "é".repeat(64))).toBe(false);
    const input = { provider: "UBER_EATS", eventId: randomUUID(), fixture: "order.created" };
    const first = await enqueueSandboxWebhook(admin, input);
    expect((await enqueueSandboxWebhook(admin, input)).order.id).toBe(first.order.id);
    expect((await getSandboxInbox(admin)).find(e => e.eventId === input.eventId)?.status).toBe("PROCESSED");
  });
  it("revocation prevents subsequent fixture ingestion", async () => {
    await disconnectProvider(camden, "DELIVEROO");
    await expect(processSandboxWebhook(camden, { provider: "DELIVEROO", eventId: randomUUID(), fixture: "order.created" })).rejects.toThrow(/disconnected/);
  });
  it("has no live fetch, acceptance, cancellation, fulfilment or dispute submission capability", () => {
    for (const adapter of Object.values(adapters)) {
      expect(adapter.capabilities()).toMatchObject({ readOrders: false, acceptOrders: false, cancelOrders: false, fulfillOrders: false });
      expect(() => adapter.fetchOrder("live-order")).toThrow(/disabled/);
      expect(() => adapter.validateWebhook("untrusted raw bytes", new Headers())).toThrow(/disabled/);
      expect(() => adapter.connectStore()).toThrow(/disabled/);
      expect(() => adapter.submitLiveEvidence()).toThrow(/disabled/);
      expect(() => adapter.parseEvent({ eventId: "pretend-live" })).toThrow(/labelled sandbox/);
    }
  });
});
