import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getOAuthClient } from "./oauth";
import { getHistoryMessages, getMessage, listRecentMessages } from "./gmail";
import { decrypt } from "@/lib/crypto";
import { analyzeResponse } from "@/lib/email/analysis";

// ============================================================
//  Sincronizacion de respuestas de proveedores.
//  Lee SOLO los emails necesarios para detectar respuestas.
// ============================================================

const sbAdmin = () =>
  createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export function normalizeEmail(e?: string | null): string {
  if (!e) return "";
  return e.trim().toLowerCase();
}

interface AccountRow {
  user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  history_id?: string | null;
}

async function loadAccounts(): Promise<Array<AccountRow & { tokens: { access_token: string; refresh_token: string } }>> {
  const { data, error } = await sbAdmin()
    .from("gmail_accounts")
    .select("user_id, access_token_enc, refresh_token_enc, history_id");
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    tokens: {
      access_token: decrypt(row.access_token_enc),
      refresh_token: decrypt(row.refresh_token_enc),
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

async function syncAccount(acc: AccountRow & { tokens: { access_token: string; refresh_token: string } }) {
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
    // primera vez o fallo de history: leer los recientes
    messageIds = await listRecentMessages(auth, 25);
  }

  // Guardar history id para la proxima vez
  if (newHistoryId) {
    await sbAdmin()
      .from("gmail_accounts")
      .update({ history_id: newHistoryId })
      .eq("user_id", acc.user_id);
  }

  // Cargar contactos/proveedores del usuario
  const { data: suppliers } = await sbAdmin()
    .from("suppliers")
    .select("id, company, contact_email, last_message")
    .eq("user_id", acc.user_id);

  const emailToSupplier = new Map<string, { id: string; company: string; last_message?: string | null }>();
  for (const s of suppliers || []) {
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

      // evita duplicados
      const { data: existing } = await sbAdmin()
        .from("responses")
        .select("id")
        .eq("gmail_message_id", msg.id)
        .maybeSingle();
      if (existing) continue;

      const analysis = await analyzeResponse(msg.bodyText, supplier.last_message || "");
      await sbAdmin().from("responses").insert({
        user_id: acc.user_id,
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

      await sbAdmin()
        .from("suppliers")
        .update({ status: "respondido", last_message: msg.bodyText.slice(0, 3000) })
        .eq("id", supplier.id);

      synced++;
    } catch {
      // email concreto que falla no debe tumbar el resto
      continue;
    }
  }
  return synced;
}

// Export util para webhook: sincronizar todos los usuarios
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