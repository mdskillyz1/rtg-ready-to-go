import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() { return NextResponse.json({ error: "Live Uber Eats webhooks are disabled pending official credentials, signature validation and approval. Use the authenticated sandbox fixture endpoint for local testing." }, { status: 503 }); }
