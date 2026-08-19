import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";

// PATCH /api/suppliers/[id] - actualizar estado, notas, seguimiento
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");

  const allowed = new Set([
    "company",
    "product_name",
    "contact_email",
    "status",
    "notes",
    "first_contact_date",
    "last_message",
    "next_follow_up",
  ]);
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) return fail("Sin campos validos");

  const { data, error } = await supabase
    .from("suppliers")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok({ supplier: data });
}

// DELETE /api/suppliers/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return fail(error.message, 500);
  return ok({ ok: true });
}