import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { apiError, boundedBody, checkOrigin, jsonResponse, requireSession } from "@/lib/http";
import { putUpload } from "@/lib/uploads";
export const runtime = "nodejs";
export async function PUT(request: NextRequest) { try { checkOrigin(request); const session = requireSession(request); const token = request.nextUrl.searchParams.get("token"); if (!token) throw new AppError(400, "An upload token is required."); return jsonResponse(await putUpload(session, token, await boundedBody(request, 10 * 1024 * 1024))); } catch (e) { return apiError(e); } }
