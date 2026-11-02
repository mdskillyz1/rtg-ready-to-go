import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, checkOrigin, jsonBody, jsonResponse, requireSession } from "@/lib/http";
import { getOrderBundleData, transitionOrder } from "@/lib/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { try { const { id } = await context.params; return jsonResponse({ order: (await getOrderBundleData(requireSession(request), id)).order }); } catch (e) { return apiError(e); } }
export async function PATCH(request: NextRequest, context: Context) {
  try { checkOrigin(request); const session = requireSession(request); const { id } = await context.params; const { status } = z.object({ status: z.enum(["NEW", "PACKING", "READY", "COLLECTED"]) }).strict().parse(await jsonBody(request)); return jsonResponse({ order: await transitionOrder(session, id, status) }); } catch (e) { return apiError(e); }
}
