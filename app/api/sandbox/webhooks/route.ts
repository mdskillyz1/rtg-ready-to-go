import { NextRequest } from "next/server";
import { apiError, boundedBody, checkOrigin, jsonResponse, requireSession } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { enqueueSandboxWebhook, getSandboxInbox, verifySandboxWebhookSignature } from "@/lib/webhooks";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { try { return jsonResponse({ inbox: await getSandboxInbox(requireSession(request)) }); } catch (e) { return apiError(e); } }
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); const session = requireSession(request); const rawBody = await boundedBody(request, 64 * 1024);
    const signature = request.headers.get("X-RTG-Sandbox-Signature");
    if (signature && !verifySandboxWebhookSignature(rawBody, signature)) throw new AppError(401, "Invalid sandbox fixture signature.");
    let payload: unknown; try { payload = JSON.parse(new TextDecoder().decode(rawBody)); } catch { throw new AppError(400, "Send valid JSON."); }
    return jsonResponse(await enqueueSandboxWebhook(session, payload), 201);
  } catch (e) { return apiError(e); }
}
