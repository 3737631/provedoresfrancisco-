import { ok, fail, requireUser } from "@/lib/api-helpers";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const q = supabase.from("products").select("id").eq("user_id", user.id);
  const [products, contacts, emails, suppliers, responses, notifications] = await Promise.all([
    q,
    supabase.from("contacts").select("id").eq("user_id", user.id),
    supabase.from("emails").select("id,status").eq("user_id", user.id),
    supabase.from("suppliers").select("id,status").eq("user_id", user.id),
    supabase
      .from("responses")
      .select("id,is_read")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("id,is_read,title,body,created_at")
      .eq("user_id", user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (products.error) return fail(products.error.message, 500);

  const suppliersList = suppliers.data || [];
  const byStatus: Record<string, number> = {};
  for (const s of suppliersList) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  }

  const responded = (responses.data || []).length;
  const unreadResponses = (responses.data || []).filter((r) => !r.is_read).length;

  return ok({
    products: products.data?.length || 0,
    contacts: contacts.data?.length || 0,
    emails: emails.data?.length || 0,
    emailed: (emails.data || []).filter((e) => e.status === "sent").length,
    contacted: suppliersList.filter((s) => s.status === "contactado").length,
    pendingResponses: unreadResponses,
    responded,
    byStatus,
    notifications: notifications.data || [],
  });
}