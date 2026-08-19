import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("emails")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail(error.message, 500);
  return ok({ emails: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");

  const { data, error } = await supabase
    .from("emails")
    .insert({
      user_id: user.id,
      product_id: body.product_id || null,
      contact_id: body.contact_id || null,
      supplier_id: body.supplier_id || null,
      to_email: body.to_email || null,
      subject: body.subject || "",
      body: body.body || "",
      status: "draft",
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok({ email: data });
}