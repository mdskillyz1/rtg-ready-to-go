import { NextRequest } from "next/server";
import { apiError, jsonResponse, requireSession } from "@/lib/http";
import { signedEvidenceUrl } from "@/lib/uploads";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; return jsonResponse(await signedEvidenceUrl(requireSession(request), id)); } catch (e) { return apiError(e); } }
