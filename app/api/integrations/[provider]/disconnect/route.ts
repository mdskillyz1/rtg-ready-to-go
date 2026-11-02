import { NextRequest } from "next/server";
import { apiError, checkOrigin, jsonResponse, requireSession } from "@/lib/http";
import { parseProvider } from "@/lib/integrations";
import { disconnectProvider } from "@/lib/store";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) { try { checkOrigin(request); const { provider } = await context.params; return jsonResponse(await disconnectProvider(requireSession(request), parseProvider(provider))); } catch (e) { return apiError(e); } }
