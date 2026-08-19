import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { generateEmail, pickBestContact } from "@/lib/email/message-generator";
import { store } from "@/lib/store";
import type { Contact } from "@/lib/types";

// GET /api/suppliers - listar CRM
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const suppliers = await store.listSuppliers(auth.userId);
    return ok({ suppliers });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}

// POST /api/suppliers
// Crea el proveedor en el CRM y genera automaticamente el email de contacto.
// Body: { contact_id, product_id, override?: {company,email} }
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");

  const { contact_id, product_id } = body;
  if (!contact_id) return fail("Falta contact_id");

  try {
    const contact = await store.getContact(auth.userId, contact_id);
    if (!contact) return fail("Contacto no encontrado", 404);

    const product = await store.getProduct(auth.userId, product_id || "");

    const company = body.override?.company || contact.company || "Proveedor";
    const email = body.override?.email || contact.email;

    const supplier = await store.insertSupplier(auth.userId, {
      product_id: product_id || null,
      contact_id: contact_id || null,
      company,
      product_name: product?.name || null,
      contact_email: email || null,
      contact_type: contact.contact_type || null,
      status: "pendiente",
    });

    // Generar email
    const selected: Contact = {
      ...(contact as any),
      company,
      email,
    };
    const generated = generateEmail(selected, {
      productName: product?.name || undefined,
      productUrl: product?.url || undefined,
    });

    const emailRow = await store.insertEmail(auth.userId, {
      product_id: product_id || null,
      contact_id: contact_id || null,
      supplier_id: supplier.id,
      to_email: email || null,
      subject: generated.subject,
      body: generated.body,
      status: "draft",
    });

    return ok({ supplier, email: emailRow });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}