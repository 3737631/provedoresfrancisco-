import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { generateEmail, pickBestContact } from "@/lib/email/message-generator";
import type { Contact } from "@/lib/types";

// GET /api/suppliers - listar CRM
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("suppliers")
    .select("*, products(name, url, image_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return fail(error.message, 500);
  return ok({ suppliers: data || [] });
}

// POST /api/suppliers
// Crea el proveedor en el CRM y genera automaticamente el email de contacto.
// Body: { contact_id, product_id, override?: {company,email} }
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");

  const { contact_id, product_id } = body;

  // Cargar contacto
  const { data: contact, error: cErr } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contact_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (cErr) return fail(cErr.message, 500);
  if (!contact) return fail("Contacto no encontrado", 404);

  // Cargar producto
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", product_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const company = body.override?.company || contact.company || "Proveedor";
  const email = body.override?.email || contact.email;

  // Crear proveedor
  const { data: supplier, error: sErr } = await supabase
    .from("suppliers")
    .insert({
      user_id: user.id,
      product_id: product_id || null,
      contact_id: contact_id || null,
      company,
      product_name: product?.name || null,
      contact_email: email || null,
      contact_type: contact.contact_type || null,
      status: "pendiente",
    })
    .select()
    .single();
  if (sErr) return fail(sErr.message, 500);

  // Generar email
  const selected: Contact = {
    ...contact,
    company,
    email,
  };
  const generated = generateEmail(selected, {
    productName: product?.name || undefined,
    productUrl: product?.url || undefined,
  });

  const { data: emailRow, error: eErr } = await supabase
    .from("emails")
    .insert({
      user_id: user.id,
      product_id: product_id || null,
      contact_id: contact_id || null,
      supplier_id: supplier.id,
      to_email: email || null,
      subject: generated.subject,
      body: generated.body,
      status: "draft",
    })
    .select()
    .single();
  if (eErr) return fail(eErr.message, 500);

  return ok({ supplier, email: emailRow });
}