import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

// ============================================================
//  OAuth2 para Gmail. Los tokens se guardan ENCRIPTADOS en
//  Supabase (nunca en el frontend, nunca en texto plano).
// ============================================================

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function hasGmailConfig(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
}

function getRedirectUri(): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/gmail/callback`;
}

export function getOAuthClient(): OAuth2Client {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
  return client;
}

export function getAuthUrl(userId: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: Buffer.from(JSON.stringify({ uid: userId })).toString("base64url"),
  });
}

export function setTokens(client: OAuth2Client, tokens: { access_token?: string; refresh_token?: string; expiry_date?: number }) {
  client.setCredentials(tokens);
}

export { SCOPES };