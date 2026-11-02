import { NextRequest } from "next/server";
import { apiError, checkOrigin, jsonBody, jsonResponse, requireSession } from "@/lib/http";
import { createOrder, getDashboard } from "@/lib/store";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { try { return jsonResponse({ orders: (await getDashboard(requireSession(request))).orders }); } catch (e) { return apiError(e); } }
export async function POST(request: NextRequest) { try { checkOrigin(request); return jsonResponse({ order: await createOrder(requireSession(request), await jsonBody(request)) }, 201); } catch (e) { return apiError(e); } }
