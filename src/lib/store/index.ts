import { isLocalMode, LOCAL_USER_ID } from "@/lib/config";
import { localDb } from "./sqlite";

// ============================================================
//  Store unificado.
//  - MODO LOCAL:  SQLite (node:sqlite) en data/app.db.
//  - MODO NUBE:   Supabase (misma API, misma forma de datos).
//  Las rutas de la API usan SIEMPRE este store, asi la app
//  funciona igual con o sin Supabase.
// ============================================================

// Las filas vienen de BD (SQLite o Supabase) y no tienen tipo estricto.
type Row = any;

// ---------------- Supabase (nube) ----------------
let cloudClient: (() => Promise<any>) | null = null;

function setCloudClient(fn: () => Promise<any>) {
  cloudClient = fn;
}

async function supabaseOrThrow(): Promise<any> {
  if (!cloudClient) throw new Error("Supabase no configurado en modo nube");
  return cloudClient();
}

// ---------------- Store ----------------
export const store = {
  // ================== PRODUCTOS ==================
  async insertProduct(userId: string, data: Record<string, unknown>): Promise<Row> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data: row, error } = await sb
        .from("products")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const id = localDb.uid();
    const t = localDb.now();
    const row = localDb.insert("products", {
      id,
      user_id: userId,
      url: data.url || "",
      product_id: data.product_id ?? null,
      name: data.name ?? null,
      image_url: data.image_url ?? null,
      seller_name: data.seller_name ?? null,
      seller_store_url: data.seller_store_url ?? null,
      manufacturer_name: data.manufacturer_name ?? null,
      manufacturer_address: data.manufacturer_address ?? null,
      manufacturer_email: data.manufacturer_email ?? null,
      manufacturer_phone: data.manufacturer_phone ?? null,
      eu_responsible: data.eu_responsible ?? null,
      price: data.price ?? null,
      currency: data.currency ?? null,
      variants: data.variants ?? [],
      shipping_info: data.shipping_info ?? null,
      compliance_contacts: data.compliance_contacts ?? [],
      raw_analysis: data.raw_analysis ?? {},
      extraction_method: data.extraction_method ?? null,
      extraction_status: data.extraction_status ?? "pending",
      created_at: t,
      updated_at: t,
    });
    return row;
  },

  async listProducts(userId: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("products").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return data || [];
    }
    return localDb.raw(
      "SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      userId
    );
  },

  async getProduct(userId: string, id: string): Promise<Row | null> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("products").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
    const row = localDb.rawGet("SELECT * FROM products WHERE id = ? AND user_id = ?", id, userId);
    return row && Object.keys(row).length ? row : null;
  },

  async getProductWithDetails(userId: string, id: string): Promise<{
    product: Row | null; contacts: Row[]; sources: Row[];
  }> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data: product } = await sb
        .from("products").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      const { data: contacts } = await sb
        .from("contacts").select("*").eq("product_id", id).eq("user_id", userId);
      const { data: sources } = await sb
        .from("manufacturer_sources").select("*").eq("product_id", id).eq("user_id", userId);
      return { product, contacts: contacts || [], sources: sources || [] };
    }
    const product = await store.getProduct(userId, id);
    const contacts = localDb.raw(
      "SELECT * FROM contacts WHERE product_id = ? AND user_id = ?", id, userId
    );
    const sources = localDb.raw(
      "SELECT * FROM manufacturer_sources WHERE product_id = ? AND user_id = ?", id, userId
    );
    return { product, contacts, sources };
  },

  // ================== CONTACTOS ==================
  async insertContacts(userId: string, rows: Record<string, unknown>[]): Promise<void> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const mapped = rows.map((r) => ({ ...r, user_id: userId }));
      const { error } = await sb.from("contacts").insert(mapped);
      if (error) throw new Error(error.message);
      return;
    }
    for (const r of rows) {
      localDb.insert("contacts", {
        id: localDb.uid(),
        user_id: userId,
        product_id: r.product_id ?? null,
        company: r.company ?? null,
        contact_type: r.contact_type || "proveedor",
        email: r.email ?? null,
        website: r.website ?? null,
        phone: r.phone ?? null,
        source: r.source ?? null,
        confidence: r.confidence ?? "media",
        metadata: r.metadata ?? {},
        created_at: localDb.now(),
      });
    }
  },

  async insertContact(userId: string, data: Record<string, unknown>): Promise<Row> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data: row, error } = await sb
        .from("contacts").insert({ ...data, user_id: userId }).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    return localDb.insert("contacts", {
      id: localDb.uid(),
      user_id: userId,
      product_id: data.product_id ?? null,
      company: data.company ?? null,
      contact_type: data.contact_type || "proveedor",
      email: data.email ?? null,
      website: data.website ?? null,
      phone: data.phone ?? null,
      source: data.source ?? null,
      confidence: data.confidence ?? "media",
      metadata: data.metadata ?? {},
      created_at: localDb.now(),
    });
  },

  async getContact(userId: string, id: string): Promise<Row | null> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("contacts").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
    const row = localDb.rawGet("SELECT * FROM contacts WHERE id = ? AND user_id = ?", id, userId);
    return row && Object.keys(row).length ? row : null;
  },

  async listContactsByProduct(userId: string, productId: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("contacts").select("*").eq("product_id", productId).eq("user_id", userId);
      if (error) throw new Error(error.message);
      return data || [];
    }
    return localDb.raw("SELECT * FROM contacts WHERE product_id = ? AND user_id = ?", productId, userId);
  },

  // ================== FUENTES ==================
  async insertSources(userId: string, rows: Record<string, unknown>[]): Promise<void> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const mapped = rows.map((r) => ({ ...r, user_id: userId }));
      const { error } = await sb.from("manufacturer_sources").insert(mapped);
      if (error) throw new Error(error.message);
      return;
    }
    for (const r of rows) {
      localDb.insert("manufacturer_sources", {
        id: localDb.uid(),
        user_id: userId,
        product_id: r.product_id ?? null,
        manufacturer_name: r.manufacturer_name ?? null,
        title: r.title ?? null,
        url: r.url ?? null,
        kind: r.kind ?? "web",
        snippet: r.snippet ?? null,
        email: r.email ?? null,
        created_at: localDb.now(),
      });
    }
  },

  // ================== PROVEEDORES ==================
  async insertSupplier(userId: string, data: Record<string, unknown>): Promise<Row> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data: row, error } = await sb
        .from("suppliers").insert({ ...data, user_id: userId }).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const t = localDb.now();
    return localDb.insert("suppliers", {
      id: localDb.uid(),
      user_id: userId,
      product_id: data.product_id ?? null,
      contact_id: data.contact_id ?? null,
      company: data.company ?? null,
      product_name: data.product_name ?? null,
      contact_email: data.contact_email ?? null,
      contact_type: data.contact_type ?? null,
      status: data.status || "pendiente",
      notes: data.notes ?? null,
      first_contact_date: data.first_contact_date ?? null,
      last_message: data.last_message ?? null,
      next_follow_up: data.next_follow_up ?? null,
      created_at: t,
      updated_at: t,
    });
  },

  async listSuppliers(userId: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("suppliers").select("*, products(name, url, image_url)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return data || [];
    }
    return localDb.raw(
      "SELECT * FROM suppliers WHERE user_id = ? ORDER BY created_at DESC LIMIT 200",
      userId
    );
  },

  async getSupplier(userId: string, id: string): Promise<Row | null> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("suppliers").select("*, products(name, url), contacts(*)")
        .eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
    const row = localDb.rawGet("SELECT * FROM suppliers WHERE id = ? AND user_id = ?", id, userId);
    if (!row || !Object.keys(row).length) return null;
    const product = localDb.rawGet("SELECT name, url FROM products WHERE id = ?", row.product_id);
    const contact = localDb.rawGet("SELECT * FROM contacts WHERE id = ?", row.contact_id);
    return { ...row, products: product && Object.keys(product).length ? product : null, contacts: contact && Object.keys(contact).length ? contact : null };
  },

  async updateSupplier(userId: string, id: string, fields: Record<string, unknown>): Promise<Row> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("suppliers").update(fields).eq("id", id).eq("user_id", userId).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
    return localDb.update("suppliers", id, { ...fields, updated_at: localDb.now() });
  },

  async deleteSupplier(userId: string, id: string): Promise<void> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { error } = await sb
        .from("suppliers").delete().eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
      return;
    }
    localDb.remove("suppliers", id);
  },

  // ================== EMAILS ==================
  async insertEmail(userId: string, data: Record<string, unknown>): Promise<Row> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data: row, error } = await sb
        .from("emails").insert({ ...data, user_id: userId }).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const t = localDb.now();
    return localDb.insert("emails", {
      id: localDb.uid(),
      user_id: userId,
      product_id: data.product_id ?? null,
      contact_id: data.contact_id ?? null,
      supplier_id: data.supplier_id ?? null,
      to_email: data.to_email ?? null,
      to_company: data.to_company ?? null,
      subject: data.subject ?? "",
      body: data.body ?? "",
      status: data.status || "draft",
      gmail_message_id: data.gmail_message_id ?? null,
      sent_at: data.sent_at ?? null,
      created_at: t,
      updated_at: t,
    });
  },

  async listEmails(userId: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("emails").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return data || [];
    }
    return localDb.raw("SELECT * FROM emails WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", userId);
  },

  async getEmail(userId: string, id: string): Promise<Row | null> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("emails").select("*, contacts(*), suppliers(*), products(*)")
        .eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
    const row = localDb.rawGet("SELECT * FROM emails WHERE id = ? AND user_id = ?", id, userId);
    if (!row || !Object.keys(row).length) return null;
    const contact = localDb.rawGet("SELECT * FROM contacts WHERE id = ?", row.contact_id);
    const supplier = localDb.rawGet("SELECT * FROM suppliers WHERE id = ?", row.supplier_id);
    const product = localDb.rawGet("SELECT * FROM products WHERE id = ?", row.product_id);
    return {
      ...row,
      contacts: contact && Object.keys(contact).length ? contact : null,
      suppliers: supplier && Object.keys(supplier).length ? supplier : null,
      products: product && Object.keys(product).length ? product : null,
    };
  },

  async findEmailBySupplier(userId: string, supplierId: string): Promise<Row | null> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("emails").select("*").eq("supplier_id", supplierId).eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
    const row = localDb.rawGet(
      "SELECT * FROM emails WHERE supplier_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
      supplierId, userId
    );
    return row && Object.keys(row).length ? row : null;
  },

  async updateEmail(userId: string, id: string, fields: Record<string, unknown>): Promise<Row> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("emails").update(fields).eq("id", id).eq("user_id", userId).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
    return localDb.update("emails", id, { ...fields, updated_at: localDb.now() });
  },

  async deleteEmail(userId: string, id: string): Promise<void> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { error } = await sb
        .from("emails").delete().eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
      return;
    }
    localDb.remove("emails", id);
  },

  // ================== RESPUESTAS ==================
  async listResponses(userId: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("responses").select("*, suppliers(company, product_name)")
        .eq("user_id", userId).order("received_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return data || [];
    }
    const rows = localDb.raw(
      "SELECT * FROM responses WHERE user_id = ? ORDER BY received_at DESC LIMIT 100", userId
    );
    return rows.map((r) => {
      const supplier = localDb.rawGet(
        "SELECT company, product_name FROM suppliers WHERE id = ?", r.supplier_id
      );
      return {
        ...r,
        suppliers: supplier && Object.keys(supplier).length ? supplier : null,
      };
    });
  },

  async insertResponse(userId: string, data: Record<string, unknown>): Promise<Row> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data: row, error } = await sb
        .from("responses").insert({ ...data, user_id: userId }).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const row = localDb.insert("responses", {
      id: localDb.uid(),
      user_id: userId,
      supplier_id: data.supplier_id ?? null,
      gmail_message_id: data.gmail_message_id ?? null,
      thread_id: data.thread_id ?? null,
      from_email: data.from_email ?? null,
      from_name: data.from_name ?? null,
      subject: data.subject ?? null,
      body: data.body ?? null,
      received_at: data.received_at ?? null,
      summary: data.summary ?? null,
      classification: data.classification ?? {},
      suggested_reply: data.suggested_reply ?? null,
      is_read: data.is_read ?? 0,
      created_at: localDb.now(),
    });
    // notificacion local
    localDb.insert("notifications", {
      id: localDb.uid(),
      user_id: userId,
      title: "Respuesta recibida",
      body: `${data.from_name || data.from_email || "Un proveedor"} ha respondido.`,
      link: "/crm",
      is_read: 0,
      created_at: localDb.now(),
    });
    return row;
  },

  async findResponseByGmailId(userId: string, gmailId: string): Promise<Row | null> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data } = await sb
        .from("responses").select("id").eq("gmail_message_id", gmailId).eq("user_id", userId).maybeSingle();
      return data;
    }
    const row = localDb.rawGet("SELECT id FROM responses WHERE gmail_message_id = ?", gmailId);
    return row && Object.keys(row).length ? row : null;
  },

  async getSuppliersByEmail(userId: string, email: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data } = await sb
        .from("suppliers").select("id, company, contact_email, last_message")
        .eq("user_id", userId).ilike("contact_email", email);
      return data || [];
    }
    return localDb.raw(
      "SELECT id, company, contact_email, last_message FROM suppliers WHERE user_id = ? AND lower(contact_email) = lower(?)",
      userId, email
    );
  },

  async getAllSuppliersBasic(userId: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data } = await sb
        .from("suppliers").select("id, company, contact_email, last_message").eq("user_id", userId);
      return data || [];
    }
    return localDb.raw(
      "SELECT id, company, contact_email, last_message FROM suppliers WHERE user_id = ?",
      userId
    );
  },

  // ================== NOTIFICACIONES ==================
  async listNotifications(userId: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data, error } = await sb
        .from("notifications").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return data || [];
    }
    return localDb.raw(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", userId
    );
  },

  async markNotificationRead(userId: string, id: string): Promise<void> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      await sb.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", userId);
      return;
    }
    localDb.rawRun("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", id, userId);
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      await sb.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
      return;
    }
    localDb.rawRun("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", userId);
  },

  async unreadNotifications(userId: string): Promise<Row[]> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data } = await sb
        .from("notifications").select("*").eq("user_id", userId).eq("is_read", false)
        .order("created_at", { ascending: false }).limit(5);
      return data || [];
    }
    return localDb.raw(
      "SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 5",
      userId
    );
  },

  // ================== GMAIL ==================
  async getGmailAccount(userId: string): Promise<Row | null> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const { data } = await sb
        .from("gmail_accounts").select("access_token_enc, refresh_token_enc, expires_at, gmail_user_email, watch_expiration")
        .eq("user_id", userId).maybeSingle();
      return data;
    }
    const row = localDb.rawGet("SELECT * FROM gmail_accounts WHERE user_id = ?", userId);
    return row && Object.keys(row).length ? row : null;
  },

  async upsertGmailAccount(userId: string, data: Record<string, unknown>): Promise<void> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      await sb.from("gmail_accounts").upsert(
        { user_id: userId, ...data }, { onConflict: "user_id" }
      );
      return;
    }
    const existing = localDb.rawGet("SELECT * FROM gmail_accounts WHERE user_id = ?", userId);
    const t = localDb.now();
    if (existing && Object.keys(existing).length) {
      localDb.rawRun(
        `UPDATE gmail_accounts SET gmail_user_email = ?, access_token_enc = ?, refresh_token_enc = ?,
         expires_at = ?, watch_expiration = ?, history_id = ?, updated_at = ? WHERE user_id = ?`,
        data.gmail_user_email ?? null,
        data.access_token_enc ?? null,
        data.refresh_token_enc ?? null,
        data.expires_at ?? null,
        data.watch_expiration ?? null,
        data.history_id ?? null,
        t,
        userId
      );
    } else {
      localDb.insert("gmail_accounts", {
        id: localDb.uid(),
        user_id: userId,
        gmail_user_email: data.gmail_user_email ?? null,
        access_token_enc: data.access_token_enc ?? null,
        refresh_token_enc: data.refresh_token_enc ?? null,
        expires_at: data.expires_at ?? null,
        watch_expiration: data.watch_expiration ?? null,
        history_id: data.history_id ?? null,
        created_at: t,
        updated_at: t,
      });
    }
  },

  async getAllGmailAccounts(): Promise<Row[]> {
    if (!isLocalMode) {
      // usa el cliente de servicio (admin)
      const { getServiceClient } = await import("@/lib/supabase/service");
      const sb: any = await getServiceClient();
      const { data } = await sb
        .from("gmail_accounts").select("user_id, access_token_enc, refresh_token_enc, history_id");
      return data || [];
    }
    return localDb.raw("SELECT user_id, access_token_enc, refresh_token_enc, history_id FROM gmail_accounts");
  },

  async updateGmailHistory(userId: string, historyId: string): Promise<void> {
    if (!isLocalMode) {
      const { getServiceClient } = await import("@/lib/supabase/service");
      const sb: any = await getServiceClient();
      await sb.from("gmail_accounts").update({ history_id: historyId }).eq("user_id", userId);
      return;
    }
    localDb.rawRun("UPDATE gmail_accounts SET history_id = ? WHERE user_id = ?", historyId, userId);
  },

  // ================== DASHBOARD ==================
  async getStats(userId: string): Promise<Record<string, unknown>> {
    if (!isLocalMode) {
      const sb = await supabaseOrThrow();
      const [products, contacts, emails, suppliers, responses, notifications] = await Promise.all([
        sb.from("products").select("id").eq("user_id", userId),
        sb.from("contacts").select("id").eq("user_id", userId),
        sb.from("emails").select("id,status").eq("user_id", userId),
        sb.from("suppliers").select("id,status").eq("user_id", userId),
        sb.from("responses").select("id,is_read").eq("user_id", userId).order("received_at", { ascending: false }),
        sb.from("notifications").select("id,is_read,title,body,created_at").eq("user_id", userId).eq("is_read", false).order("created_at", { ascending: false }).limit(5),
      ]);
      return buildStats(products.data || [], contacts.data || [], emails.data || [], suppliers.data || [], responses.data || [], notifications.data || []);
    }
    const products = localDb.raw("SELECT id FROM products WHERE user_id = ?", userId);
    const contacts = localDb.raw("SELECT id FROM contacts WHERE user_id = ?", userId);
    const emails = localDb.raw("SELECT id, status FROM emails WHERE user_id = ?", userId);
    const suppliers = localDb.raw("SELECT id, status FROM suppliers WHERE user_id = ?", userId);
    const responses = localDb.raw("SELECT id, is_read FROM responses WHERE user_id = ? ORDER BY received_at DESC", userId);
    const notifications = localDb.raw("SELECT id, is_read, title, body, created_at FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 5", userId);
    return buildStats(products, contacts, emails, suppliers, responses, notifications);
  },
// ================== CAPTURAS (bookmarklet) ==================
  async saveCapture(url: string, html: string): Promise<void> {
    if (isLocalMode) {
      localDb.rawRun(
        "INSERT INTO captures (url, html, created_at) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET html = excluded.html, created_at = excluded.created_at",
        url, html, new Date().toISOString()
      );
      return;
    }
    const sb = await supabaseOrThrow();
    await sb.from("captures").upsert({ url, html, created_at: new Date().toISOString() });
  },

  async getCapture(url: string): Promise<string | null> {
    if (isLocalMode) {
      const row = localDb.raw("SELECT html FROM captures WHERE url = ?", url)[0];
      return row ? (row.html as string) : null;
    }
    const sb = await supabaseOrThrow();
    const { data } = await sb.from("captures").select("html").eq("url", url).maybeSingle();
    return data?.html ? (data.html as string) : null;
  },
};

function buildStats(
  products: Row[], contacts: Row[], emails: Row[], suppliers: Row[],
  responses: Row[], notifications: Row[]
): Record<string, unknown> {
  const byStatus: Record<string, number> = {};
  for (const s of suppliers) {
    const st = String(s.status || "pendiente");
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  return {
    products: products.length,
    contacts: contacts.length,
    emails: emails.length,
    emailed: emails.filter((e) => e.status === "sent").length,
    contacted: suppliers.filter((s) => s.status === "contactado").length,
    pendingResponses: responses.filter((r) => !r.is_read).length,
    responded: responses.length,
    byStatus,
    notifications,
  };
}

// La pagina de producto y layout (server components) obtienen el store nube
// mediante una sesion; en modo local usan LOCAL_USER_ID.
export { LOCAL_USER_ID };

// Inicializar el modo nube con el cliente de sesion de Supabase
export async function initStore(cloudClientFactory: () => Promise<any>) {
  setCloudClient(cloudClientFactory);
}