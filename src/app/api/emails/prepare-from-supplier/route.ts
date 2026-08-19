import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { generateEmail, pickBestContact } from "@/lib/email/message-generator";
import type { Contact } from "@/lib/types";

// POST /api/emails/prepare-from-supplier
// Genera (o recupera) un email draft para un proveedor existente.
// Body: { supplier_id }
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  if (!body?.supplier_id) return fail("Falta supplier_id");

  // Ya existe un email draft para este proveedor?
  const { data: existing } = await supabase
    .from("emails")
    .select("*")
    .eq("supplier_id", body.supplier_id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return ok({ email: existing, reused: true });

  // Cargar proveedor y su contacto/producto
  const { data: supplier, error: sErr } = await supabase
    .from("suppliers")
    .select("*, products(name, url), contacts(*)")
    .eq("id", body.supplier_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sErr) return fail(sErr.message, 500);
  if (!supplier) return fail("Proveedor no encontrado", 404);

  const contacts: Contact[] = supplier.contacts ? [supplier.contacts] : [];
  const contact =
    pickBestContact(contacts) ||
    ({
      company: supplier.company,
      contact_type: "proveedor",
      email: supplier.contact_email,
    } as Contact);

  const generated = generateEmail(contact, {
    productName: supplier.product_name || supplier.products?.name || undefined,
    productUrl: supplier.products?.url || undefined,
  });

  const { data: emailRow, error: eErr } = await supabase
    .from("emails")
    .insert({
      user_id: user.id,
      product_id: supplier.product_id || null,
      contact_id: supplier.contact_id || null,
      supplier_id: supplier.id,
      to_email: supplier.contact_email || contact.email || null,
      subject: generated.subject,
      body: generated.body,
      status: "draft",
    })
    .select()
    .single();
  if (eErr) return fail(eErr.message, 500);

  return ok({ email: emailRow, reused: false });
}