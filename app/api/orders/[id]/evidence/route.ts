import { NextRequest } from "next/server";
import { apiError, boundedBody, checkOrigin, jsonResponse, requireSession } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { attachEvidence } from "@/lib/store";
import type { EvidenceStage } from "@/lib/types";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); const session = requireSession(request); const { id } = await context.params;
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024) throw new AppError(413, "Choose a photo under 10 MB.");
    const body = await boundedBody(request, 11 * 1024 * 1024);
    const form = await new Response(body as BodyInit, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); const photo = form.get("photo");
    if (!(photo instanceof File)) throw new AppError(400, "A photo is required.");
    const evidence = await attachEvidence(session, id, { bytes: new Uint8Array(await photo.arrayBuffer()), filename: photo.name, mimeType: photo.type, stage: String(form.get("stage") || "PACKED") as EvidenceStage, note: String(form.get("note") || ""), deviceCapturedAt: String(form.get("deviceCapturedAt") || "") || undefined, clientCaptureId: String(form.get("clientCaptureId") || request.headers.get("idempotency-key") || "") || undefined, sealId: String(form.get("sealId") || ""), handoverNote: String(form.get("handoverNote") || "") });
    return jsonResponse({ evidence }, 201);
  } catch (e) { return apiError(e); }
}
