import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { generateEmail, pickBestContact } from "@/lib/email/message-generator";
import { store } from "@/lib/store";
import type { Contact } from "@/lib/types";

// POST /api/emails/prepare-from-supplier
// Genera (o recupera) un email draft para un proveedor existente.
// Body: { supplier_id }
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.supplier_id) return fail("Falta supplier_id");

  try {
    // Ya existe un email draft para este proveedor?
    const existing = await store.findEmailBySupplier(auth.userId, body.supplier_id);
    if (existing) return ok({ email: existing, reused: true });

    const supplier = await store.getSupplier(auth.userId, body.supplier_id);
    if (!supplier) return fail("Proveedor no encontrado", 404);

    const contacts: Contact[] = supplier.contacts ? [supplier.contacts as any] : [];
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

    const emailRow = await store.insertEmail(auth.userId, {
      product_id: supplier.product_id || null,
      contact_id: supplier.contact_id || null,
      supplier_id: supplier.id,
      to_email: supplier.contact_email || contact.email || null,
      subject: generated.subject,
      body: generated.body,
      status: "draft",
    });

    return ok({ email: emailRow, reused: false });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}