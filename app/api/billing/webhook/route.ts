import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() { return NextResponse.json({ error: "Billing webhooks are disabled until Stripe signing credentials and a verified billing implementation exist." }, { status: 503 }); }
