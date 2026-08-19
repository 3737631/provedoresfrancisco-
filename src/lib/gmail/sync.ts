import { getOAuthClient } from "./oauth";
import { getHistoryMessages, getMessage, listRecentMessages } from "./gmail";
import { decrypt } from "@/lib/crypto";
import { analyzeResponse } from "@/lib/email/analysis";
import { store } from "@/lib/store";

// ============================================================
//  Sincronizacion de respuestas de proveedores.
//  Lee SOLO los emails necesarios para detectar respuestas.
// ============================================================

interface AccountRow {
  user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  history_id?: string | null;
}

export function normalizeEmail(e?: string | null): string {
  if (!e) return "";
  return e.trim().toLowerCase();
}

async function loadAccounts(): Promise<
  Array<AccountRow & { tokens: { access_token: string; refresh_token: string } }>
> {
  const rows = await store.getAllGmailAccounts();
  return (rows as any[]).map((row) => ({
    user_id: String(row.user_id),
    access_token_enc: String(row.access_token_enc),
    refresh_token_enc: String(row.refresh_token_enc),
    history_id: (row.history_id as string | null) ?? null,
    tokens: {
      access_token: decrypt(String(row.access_token_enc)),
      refresh_token: decrypt(String(row.refresh_token_enc)),
    },
  }));
}

export async function syncUserInbox(userId: string): Promise<number> {
  const accounts = (await loadAccounts()).filter((a) => a.user_id === userId);
  let count = 0;
  for (const acc of accounts) {
    count += await syncAccount(acc);
  }
  return count;
}

async function syncAccount(
  acc: AccountRow & { tokens: { access_token: string; refresh_token: string } }
) {
  const auth = getOAuthClient();
  auth.setCredentials({
    access_token: acc.tokens.access_token,
    refresh_token: acc.tokens.refresh_token,
    expiry_date: Date.now() + 3600 * 1000,
  });

  let messageIds: string[] = [];
  let newHistoryId: string | null = null;

  if (acc.history_id) {
    try {
      const h = await getHistoryMessages(auth, acc.history_id);
      messageIds = h.messages;
      newHistoryId = h.historyId;
    } catch {
      messageIds = [];
    }
  }
  if (messageIds.length === 0) {
    messageIds = await listRecentMessages(auth, 25);
  }

  if (newHistoryId) {
    await store.updateGmailHistory(acc.user_id, newHistoryId);
  }

  const suppliers = await store.getAllSuppliersBasic(acc.user_id);
  const emailToSupplier = new Map<
    string,
    { id: string; company: string; last_message?: string | null }
  >();
  for (const s of suppliers as any[]) {
    const key = normalizeEmail(s.contact_email);
    if (key) emailToSupplier.set(key, s);
  }

  let synced = 0;
  for (const id of messageIds) {
    try {
      const msg = await getMessage(auth, id);
      const fromKey = normalizeEmail(msg.fromEmail);
      const supplier = emailToSupplier.get(fromKey);
      if (!supplier) continue;

      const existing = await store.findResponseByGmailId(acc.user_id, msg.id);
      if (existing) continue;

      const analysis = await analyzeResponse(msg.bodyText, supplier.last_message || "");
      await store.insertResponse(acc.user_id, {
        supplier_id: supplier.id,
        gmail_message_id: msg.id,
        thread_id: msg.threadId,
        from_email: msg.fromEmail,
        from_name: msg.fromName,
        subject: msg.subject,
        body: msg.bodyText.slice(0, 20000),
        received_at: new Date(msg.date).toISOString(),
        summary: analysis.summary,
        classification: analysis.classification,
        suggested_reply: analysis.suggested_reply,
      });

      await store.updateSupplier(acc.user_id, supplier.id, {
        status: "respondido",
        last_message: msg.bodyText.slice(0, 3000),
      });

      synced++;
    } catch {
      continue;
    }
  }
  return synced;
}

// Sincronizar todos los usuarios (para webhook / modo local)
export async function syncAllUsers(): Promise<number> {
  const accounts = await loadAccounts();
  const unique = Array.from(new Set(accounts.map((a) => a.user_id)));
  let total = 0;
  for (const uid of unique) {
    try {
      total += await syncUserInbox(uid);
    } catch {
      continue;
    }
  }
  return total;
}