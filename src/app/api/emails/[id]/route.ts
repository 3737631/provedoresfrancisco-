import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const { data, error } = await supabase
    .from("emails")
    .select("*, contacts(*), suppliers(*), products(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("Email no encontrado", 404);
  return ok({ email: data });
}

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

  const allowed = new Set(["to_email", "subject", "body", "status"]);
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) return fail("Sin campos validos");

  const { data, error } = await supabase
    .from("emails")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok({ email: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const { error } = await supabase
    .from("emails")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return fail(error.message, 500);
  return ok({ ok: true });
}