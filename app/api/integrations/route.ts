import { NextRequest } from "next/server";
import { apiError, jsonResponse, requireSession } from "@/lib/http";
import { providerStatus } from "@/lib/store";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { try { const session = requireSession(request); return jsonResponse({ integrations: await Promise.all([providerStatus(session, "UBER_EATS"), providerStatus(session, "DELIVEROO")]) }); } catch (e) { return apiError(e); } }
