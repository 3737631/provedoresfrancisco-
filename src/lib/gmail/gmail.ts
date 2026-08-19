import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { GmailMessage } from "@/lib/types";
import { htmlToText } from "@/lib/utils";

// ============================================================
//  Operaciones con Gmail API
// ============================================================

const gmail = () => google.gmail({ version: "v1" });

export function makeRawMessage(to: string, subject: string, body: string): string {
  const mime = [
    `To: ${to}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body,
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

export async function sendEmail(
  auth: OAuth2Client,
  to: string,
  subject: string,
  body: string
): Promise<{ id?: string; threadId?: string }> {
  const raw = makeRawMessage(to, subject, body);
  const res = await gmail().users.messages.send({
    auth,
    userId: "me",
    requestBody: { raw },
  });
  return { id: res.data.id || undefined, threadId: res.data.threadId || undefined };
}

export async function getProfile(auth: OAuth2Client): Promise<{ email: string }> {
  const res = await gmail().users.getProfile({ auth, userId: "me" });
  return { email: res.data.emailAddress || "" };
}

export async function listRecentMessages(auth: OAuth2Client, maxResults = 20): Promise<string[]> {
  const res = await gmail().users.messages.list({
    auth,
    userId: "me",
    maxResults,
    q: "in:inbox newer_than:30d",
  });
  return (res.data.messages || []).map((m) => m.id!).filter(Boolean);
}

export async function getMessage(auth: OAuth2Client, id: string): Promise<GmailMessage> {
  const res = await gmail().users.messages.get({
    auth,
    userId: "me",
    id,
    format: "full",
  });
  const msg = res.data;
  const headers = (msg.payload?.headers || []).reduce<Record<string, string>>((acc, h) => {
    if (h.name) acc[h.name.toLowerCase()] = h.value || "";
    return acc;
  }, {});

  const bodyText = extractBody(msg.payload || {});
  const from = headers["from"] || "";
  const fromMatch = from.match(/^(.*?)\s*<([^>]+)>/);
  const fromName = fromMatch?.[1]?.trim() || from;
  const fromEmail = fromMatch?.[2]?.trim() || from;

  return {
    id,
    threadId: msg.threadId || "",
    from,
    fromName,
    fromEmail,
    to: headers["to"] || "",
    subject: headers["subject"] || "(sin asunto)",
    date: headers["date"] || new Date().toISOString(),
    bodyText,
    references: headers["references"],
    inReplyTo: headers["in-reply-to"],
  };
}

function extractBody(payload: {
  mimeType?: string | null;
  body?: { data?: string | null; size?: number | null };
  parts?: Array<{
    mimeType?: string | null;
    body?: { data?: string | null; size?: number | null };
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null; size?: number | null };
    }>;
  }>;
}): string {
  // busca el mejor texto: plain preferido sobre html
  let plain = "";
  let html = "";
  const walk = (p: {
    mimeType?: string | null;
    body?: { data?: string | null; size?: number | null };
    parts?: Array<any>;
  }) => {
    const mime = (p.mimeType || "").toLowerCase();
    const data = p.body?.data;
    if (data) {
      const decoded = Buffer.from(data, "base64url").toString("utf8");
      if (mime === "text/plain") plain = plain || decoded;
      else if (mime === "text/html") html = html || decoded;
    }
    if (p.parts) p.parts.forEach(walk);
  };
  walk(payload as any);
  if (plain) return plain;
  if (html) return htmlToText(html);
  return "";
}

export async function watchInbox(auth: OAuth2Client): Promise<{ expiration: string | null; historyId: string | null }> {
  const res = await gmail().users.watch({
    auth,
    userId: "me",
    requestBody: {
      labelIds: ["INBOX"],
      topicName: process.env.GMAIL_PUBSUB_TOPIC, // opcional
    },
  });
  return {
    expiration: res.data.expiration || null,
    historyId: res.data.historyId || null,
  };
}

export async function getHistoryMessages(
  auth: OAuth2Client,
  startHistoryId: string
): Promise<{ historyId: string; messages: string[] }> {
  const res = await gmail().users.history.list({
    auth,
    userId: "me",
    startHistoryId,
    historyTypes: ["messageAdded"],
  });
  const messages: string[] = [];
  for (const h of res.data.history || []) {
    for (const m of h.messagesAdded || []) {
      if (m.message?.id) messages.push(m.message.id);
    }
  }
  return { historyId: res.data.historyId || startHistoryId, messages };
}