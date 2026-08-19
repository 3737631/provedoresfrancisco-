import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!product) return fail("Producto no encontrado", 404);

  const [contacts, sources] = await Promise.all([
    supabase.from("contacts").select("*").eq("product_id", id).eq("user_id", user.id),
    supabase
      .from("manufacturer_sources")
      .select("*")
      .eq("product_id", id)
      .eq("user_id", user.id),
  ]);

  return ok({
    product,
    contacts: contacts.data || [],
    sources: sources.data || [],
  });
}