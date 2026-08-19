import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { store } from "@/lib/store";

// PATCH /api/suppliers/[id] - actualizar estado, notas, seguimiento
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
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

  try {
    const supplier = await store.updateSupplier(auth.userId, id, updates);
    return ok({ supplier });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}

// DELETE /api/suppliers/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;

  try {
    await store.deleteSupplier(auth.userId, id);
    return ok({ ok: true });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}