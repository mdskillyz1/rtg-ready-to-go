import { NextRequest } from "next/server";
import { apiError, checkOrigin, jsonBody, jsonResponse, requireSession } from "@/lib/http";
import { beginUpload } from "@/lib/uploads";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { try { checkOrigin(request); return jsonResponse(await beginUpload(requireSession(request), await jsonBody(request)), 201); } catch (e) { return apiError(e); } }
