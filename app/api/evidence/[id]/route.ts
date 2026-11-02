import { NextRequest } from "next/server";
import { apiError, requireSession } from "@/lib/http";
import { readEvidence } from "@/lib/store";
import { verifyEvidenceToken } from "@/lib/uploads";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; const session = requireSession(request); const token = request.nextUrl.searchParams.get("token"); if (token) verifyEvidenceToken(session, id, token); const { bytes, evidence } = await readEvidence(session, id); return new Response(bytes as BodyInit, { headers: { "Content-Type": evidence.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename="${evidence.id}.${evidence.mimeType === "image/png" ? "png" : "jpg"}"` } }); } catch (e) { return apiError(e); }
}
