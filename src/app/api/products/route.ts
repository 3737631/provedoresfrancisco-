import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { store } from "@/lib/store";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const products = await store.listProducts(auth.userId);
    return ok({ products });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}

// Creacion manual de producto (cuando la extraccion no es posible)
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");

  try {
    const product = await store.insertProduct(auth.userId, {
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
    });
    return ok({ product });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}