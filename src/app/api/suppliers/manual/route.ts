import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { store } from "@/lib/store";

// POST /api/suppliers/manual - crear proveedor manualmente (sin contacto)
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");
  if (!body.company) return fail("La empresa es obligatoria");

  try {
    const supplier = await store.insertSupplier(auth.userId, {
      company: body.company,
      product_name: body.product_name || null,
      contact_email: body.contact_email || null,
      status: "pendiente",
    });
    return ok({ supplier });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}