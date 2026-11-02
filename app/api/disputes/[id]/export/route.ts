import { NextRequest } from "next/server";
import { apiError, checkOrigin, jsonResponse, requireSession } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); requireSession(request);
    return jsonResponse({ error: "Dispute-case persistence is not implemented in this milestone. Download an order evidence PDF from its order detail screen. No claim is submitted to a provider." }, 501);
  } catch (error) { return apiError(error); }
}
