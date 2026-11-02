import { NextRequest } from "next/server";
import { apiError, requireSession } from "@/lib/http";
import { generateEvidenceBundle } from "@/lib/pdf";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; const bytes = await generateEvidenceBundle(requireSession(request), id); return new Response(bytes as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="rtg-evidence-${id}.pdf"`, "Cache-Control": "private, no-store" } }); } catch (e) { return apiError(e); }
}
