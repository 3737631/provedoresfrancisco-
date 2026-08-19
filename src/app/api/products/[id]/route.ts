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
    const { product, contacts, sources } = await store.getProductWithDetails(auth.userId, id);
    if (!product) return fail("Producto no encontrado", 404);
    return ok({ product, contacts, sources });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}