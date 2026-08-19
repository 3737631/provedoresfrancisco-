import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail(error.message, 500);
  return ok({ products: data || [] });
}

// Creacion manual de producto (cuando la extraccion no es posible)
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");

  const { data, error } = await supabase
    .from("products")
    .insert({
      user_id: user.id,
      url: body.url || null,
      product_id: body.product_id || null,
      name: body.name || null,
      image_url: body.image_url || null,
      seller_name: body.seller_name || null,
      manufacturer_name: body.manufacturer_name || null,
      manufacturer_address: body.manufacturer_address || null,
      manufacturer_email: body.manufacturer_email || null,
      manufacturer_phone: body.manufacturer_phone || null,
      eu_responsible: body.eu_responsible || null,
      price: body.price || null,
      currency: body.currency || null,
      variants: body.variants || [],
      shipping_info: body.shipping_info || null,
      extraction_method: "manual",
      extraction_status: "manual",
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok({ product: data });
}