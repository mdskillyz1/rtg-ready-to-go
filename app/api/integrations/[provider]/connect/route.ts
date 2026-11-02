import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { apiError, checkOrigin, requireSession } from "@/lib/http";
import { parseProvider } from "@/lib/integrations";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) { try { checkOrigin(request); const session = requireSession(request); const { provider } = await context.params; parseProvider(provider); if (!["ADMIN", "MANAGER"].includes(session.role)) throw new AppError(403, "Only an admin or manager can manage integrations."); throw new AppError(409, "Official API approval, credentials, store mapping and verified webhooks are required before a provider can be connected. This build is sandbox only."); } catch (e) { return apiError(e); } }
