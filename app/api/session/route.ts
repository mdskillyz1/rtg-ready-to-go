import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, checkOrigin, jsonBody, jsonResponse, requireLocalRequest, requireSession } from "@/lib/http";
import { locations } from "@/lib/store";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import type { Session } from "@/lib/types";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { try { return jsonResponse({ user: requireSession(request), mode: "sandbox" }); } catch (e) { return apiError(e); } }
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); requireLocalRequest(request);
    const parsed = z.object({ locationId: z.string().optional(), role: z.enum(["ADMIN", "MANAGER", "STAFF", "VIEWER"]).optional() }).strict().parse(await jsonBody(request));
    const locationId = parsed.locationId || locations[0].id;
    if (!locations.some(l => l.id === locationId)) throw new AppError(400, "Unknown location.");
    const session: Session = { userId: "sandbox-user", name: "Alex Morgan (sandbox)", tenantId: "tenant-demo", locationId, role: parsed.role || "ADMIN" };
    const response = jsonResponse({ user: session, mode: "sandbox" });
    response.cookies.set(SESSION_COOKIE, signSession(session), { httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: NextRequest) {
  try { checkOrigin(request); const response = jsonResponse({ ok: true }); response.cookies.delete(SESSION_COOKIE); return response; } catch (e) { return apiError(e); }
}
