import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { store } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;

  try {
    const email = await store.getEmail(auth.userId, id);
    if (!email) return fail("Email no encontrado", 404);
    return ok({ email });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");

  const allowed = new Set(["to_email", "subject", "body", "status"]);
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) return fail("Sin campos validos");

  try {
    const email = await store.updateEmail(auth.userId, id, updates);
    return ok({ email });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;

  try {
    await store.deleteEmail(auth.userId, id);
    return ok({ ok: true });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}