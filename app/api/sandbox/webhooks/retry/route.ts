import { NextRequest } from "next/server";
import { apiError, checkOrigin, jsonResponse, requireSession } from "@/lib/http";
import { retrySandboxWebhooks } from "@/lib/webhooks";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { try { checkOrigin(request); return jsonResponse(await retrySandboxWebhooks(requireSession(request))); } catch (e) { return apiError(e); } }
