import { NextRequest } from "next/server";
import { apiError, jsonResponse, requireSession } from "@/lib/http";
import { parseProvider } from "@/lib/integrations";
import { providerStatus } from "@/lib/store";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) { try { const { provider } = await context.params; return jsonResponse(await providerStatus(requireSession(request), parseProvider(provider))); } catch (e) { return apiError(e); } }
