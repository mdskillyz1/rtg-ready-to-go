import type { Order, Role } from "@/lib/types";
export interface CaptureDraft {
  id: string; orderId: string; reference: string; locationId: string;
  file: File; stage: string; note: string; deviceCapturedAt: string; sealId: string;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("rtg-offline-captures", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("drafts")) request.result.createObjectStore("drafts", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("workspace")) request.result.createObjectStore("workspace");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Offline storage is unavailable in this browser."));
  });
}
export interface CaptureWorkspace { orders: Order[]; locationId: string; role: Role; savedAt: string; }
export async function cacheWorkspace(workspace: CaptureWorkspace) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite"); tx.objectStore("workspace").put(workspace, "last");
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); db.close();
}
export async function readCachedWorkspace(): Promise<CaptureWorkspace | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("workspace").objectStore("workspace").get("last");
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
export async function saveDraft(draft: CaptureDraft) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").put(draft);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); db.close();
}
export async function listDrafts(): Promise<CaptureDraft[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("drafts").objectStore("drafts").getAll();
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
export async function deleteDraft(id: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").delete(id);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); db.close();
}
export async function uploadDraft(draft: CaptureDraft) {
  const form = new FormData();
  form.set("photo", draft.file); form.set("stage", draft.stage); form.set("note", draft.note);
  form.set("deviceCapturedAt", draft.deviceCapturedAt); form.set("sealId", draft.sealId);
  form.set("clientCaptureId", draft.id);
  const response = await fetch(`/api/orders/${draft.orderId}/evidence`, {
    method: "POST", body: form, headers: { "Idempotency-Key": draft.id },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Upload failed. Your draft is saved on this device.");
  return result;
}
