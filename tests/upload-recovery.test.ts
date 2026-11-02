import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { attachEvidence, createOrder, getOrderBundleData } from "../lib/store";
import { beginUpload, completeUpload, putUpload } from "../lib/uploads";
import type { Session } from "../lib/types";

const admin: Session = { userId: "upload-test-user", name: "Upload test staff", tenantId: "tenant-demo", locationId: "loc-soho", role: "ADMIN" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=", "base64");
const sha256 = createHash("sha256").update(png).digest("hex");
const original = { data: process.env.RTG_DATA_DIR, mode: process.env.RTG_MODE, vercel: process.env.VERCEL };
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "rtg-upload-recovery-"));
  process.env.RTG_DATA_DIR = directory;
  process.env.RTG_MODE = "sandbox";
  delete process.env.VERCEL;
});
afterEach(async () => {
  for (const [key, value] of Object.entries({ RTG_DATA_DIR: original.data, RTG_MODE: original.mode, VERCEL: original.vercel })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await rm(directory, { recursive: true, force: true });
});

async function prepare() {
  const order = await createOrder(admin, { reference: "UPLOAD-RECOVERY", items: [{ name: "Demo meal", quantity: 1 }] });
  const upload = await beginUpload(admin, { orderId: order.id, filename: "original.png", mimeType: "image/png", size: png.length, sha256 });
  return { order, upload, storedPath: path.join(directory, "pending", `${upload.uploadId}.bin`), metadataPath: path.join(directory, "pending", `${upload.uploadId}.json`) };
}

describe("local upload crash recovery", () => {
  it("recovers matching bytes left before upload metadata was committed, then preserves one-use behaviour", async () => {
    const { order, upload, storedPath, metadataPath } = await prepare();
    // Reproduce a crash between writeFile(.bin) and saving uploaded=true.
    await writeFile(storedPath, png, { mode: 0o600 });
    expect(JSON.parse(await readFile(metadataPath, "utf8")).uploaded).toBe(false);
    expect(await putUpload(admin, upload.uploadToken, png)).toMatchObject({ uploaded: true, sha256 });
    expect(JSON.parse(await readFile(metadataPath, "utf8")).uploaded).toBe(true);
    expect(await readFile(storedPath)).toEqual(png);
    await expect(putUpload(admin, upload.uploadToken, png)).rejects.toThrow(/one-use/);
    expect((await completeUpload(admin, { orderId: order.id, uploadToken: upload.uploadToken })).sha256).toBe(sha256);
  });

  it.each(["different digest", "different length"])("rejects recovery for existing bytes with %s without overwriting them", async conflict => {
    const { upload, storedPath, metadataPath } = await prepare();
    const conflicting = conflict === "different length" ? png.subarray(0, png.length - 1) : Buffer.from(png);
    if (conflict === "different digest") conflicting[conflicting.length - 1] ^= 1;
    await writeFile(storedPath, conflicting, { mode: 0o600 });
    await expect(putUpload(admin, upload.uploadToken, png)).rejects.toThrow(/Stored upload bytes conflict/);
    expect(await readFile(storedPath)).toEqual(conflicting);
    expect(JSON.parse(await readFile(metadataPath, "utf8")).uploaded).toBe(false);
  });

  it("reuses the original evidence if a crash occurs before completion metadata is committed", async () => {
    const { order, upload, storedPath } = await prepare();
    await putUpload(admin, upload.uploadToken, png);
    // Reproduce attachEvidence succeeding before completedEvidenceId is saved.
    const originalEvidence = await attachEvidence(admin, order.id, { bytes: png, filename: "original.png", mimeType: "image/png", stage: "SEALED", note: "Original capture", clientCaptureId: upload.uploadId });
    const completed = await completeUpload(admin, { orderId: order.id, uploadToken: upload.uploadToken, stage: "PACKED", note: "Retry metadata" });
    expect(completed.id).toBe(originalEvidence.id);
    expect(completed.note).toBe("Original capture");
    expect((await getOrderBundleData(admin, order.id)).order.evidence).toHaveLength(1);
    expect((await completeUpload(admin, { orderId: order.id, uploadToken: upload.uploadToken })).id).toBe(originalEvidence.id);
    await expect(readFile(storedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
