import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail/oauth";
import { encrypt } from "@/lib/crypto";
import { getProfile } from "@/lib/gmail/gmail";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const backTo = `${base}/settings?gmail=`;

  if (error || !code) {
    return NextResponse.redirect(`${backTo}error`);
  }

  let uid: string | null = null;
  try {
    if (state) {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      uid = parsed.uid || null;
    }
  } catch {
    uid = null;
  }
  if (!uid) {
    return NextResponse.redirect(`${backTo}error`);
  }

  const client = getOAuthClient();
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const profile = await getProfile(client);

    const accessToken = tokens.access_token || "";
    const refreshToken = tokens.refresh_token || "";

    await store.upsertGmailAccount(uid, {
      gmail_user_email: profile.email,
      access_token_enc: encrypt(accessToken),
      refresh_token_enc: encrypt(refreshToken),
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      history_id: null,
    });

    return NextResponse.redirect(`${backTo}ok`);
  } catch (e) {
    console.error("OAuth callback error", e);
    return NextResponse.redirect(`${backTo}error`);
  }
}