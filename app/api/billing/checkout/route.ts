import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() { return NextResponse.json({ error: "Billing is not enabled in this local sandbox. A reviewed Stripe integration and authorised pricing configuration are required." }, { status: 503 }); }
