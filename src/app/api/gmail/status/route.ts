import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-helpers";
import { hasGmailConfig } from "@/lib/gmail/oauth";
import { store } from "@/lib/store";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const data = await store.getGmailAccount(auth.userId);

  return NextResponse.json({
    configured: hasGmailConfig(),
    connected: Boolean(data?.gmail_user_email),
    email: data?.gmail_user_email || null,
    watch_expiration: data?.watch_expiration || null,
  });
}