import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-helpers";
import { getAuthUrl, hasGmailConfig } from "@/lib/gmail/oauth";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  if (!hasGmailConfig()) {
    return NextResponse.json(
      { error: "Gmail no configurado. Revisa GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET en .env.local" },
      { status: 500 }
    );
  }

  const url = getAuthUrl(auth.user.id);
  return NextResponse.json({ url });
}