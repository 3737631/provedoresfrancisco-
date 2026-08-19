import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-helpers";
import { hasGmailConfig } from "@/lib/gmail/oauth";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data } = await supabase
    .from("gmail_accounts")
    .select("gmail_user_email, watch_expiration, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    configured: hasGmailConfig(),
    connected: Boolean(data?.gmail_user_email),
    email: data?.gmail_user_email || null,
    watch_expiration: data?.watch_expiration || null,
  });
}