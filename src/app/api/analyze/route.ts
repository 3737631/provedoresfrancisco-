import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { analyzeProductUrl } from "@/lib/scrape/extractor";
import { store } from "@/lib/store";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { userId } = auth;

  let url = "";
  try {
    const body = await req.json();
    url = (body.url || "").toString();
  } catch {
    return fail("Cuerpo invalido");
  }
  if (!url) return fail("Falta la URL del producto");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const analysis = await analyzeProductUrl(url);

  // Guardar producto
  let product;
  try {
    product = await store.insertProduct(userId, {
      url: analysis.product.url,
      product_id: analysis.product.product_id || null,
      name: analysis.product.name || null,
      image_url: analysis.product.image_url || null,
      seller_name: analysis.product.seller_name || null,
      seller_store_url: analysis.product.seller_store_url || null,
      manufacturer_name: analysis.product.manufacturer_name || null,
      manufacturer_address: analysis.product.manufacturer_address || null,
      manufacturer_email: analysis.product.manufacturer_email || null,
      manufacturer_phone: analysis.product.manufacturer_phone || null,
      eu_responsible: analysis.product.eu_responsible || null,
      price: analysis.product.price || null,
      currency: analysis.product.currency || null,
      variants: analysis.product.variants || [],
      shipping_info: analysis.product.shipping_info || null,
      compliance_contacts: analysis.product.compliance_contacts || [],
      raw_analysis: analysis.product,
      extraction_method: analysis.method,
      extraction_status: analysis.success ? "ok" : "partial",
    });
  } catch (e: any) {
    return fail(`No se pudo guardar el producto: ${e?.message || "desconocido"}`, 500);
  }

  // Guardar contactos
  const contacts = (analysis.product.contacts || []).map((c) => ({
    product_id: product.id,
    company: c.company || null,
    contact_type: c.contact_type,
    email: c.email || null,
    website: c.website || null,
    phone: c.phone || null,
    source: c.source || null,
    confidence: c.confidence || "media",
    metadata: c.metadata || {},
  }));
  if (contacts.length) {
    await store.insertContacts(userId, contacts);
  }

  // Guardar fuentes del fabricante
  const sources = (analysis.product.manufacturer_sources || []).map((s) => ({
    product_id: product.id,
    manufacturer_name: analysis.product.manufacturer_name || null,
    title: s.title || null,
    url: s.url || null,
    kind: s.kind || "web",
    snippet: s.snippet || null,
    email: s.email || null,
  }));
  if (sources.length) {
    await store.insertSources(userId, sources);
  }

  return ok({ product, analysis: analysis.product, success: analysis.success });
}