import { NextRequest } from "next/server";
import { apiError, jsonResponse, requireSession } from "@/lib/http";
import { getDashboard } from "@/lib/store";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { try { return jsonResponse(await getDashboard(requireSession(request))); } catch (e) { return apiError(e); } }
