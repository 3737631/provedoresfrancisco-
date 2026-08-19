import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";

// POST /api/suppliers/manual - crear proveedor manualmente (sin contacto)
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");
  if (!body.company) return fail("La empresa es obligatoria");

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      user_id: user.id,
      company: body.company,
      product_name: body.product_name || null,
      contact_email: body.contact_email || null,
      status: "pendiente",
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok({ supplier: data });
}