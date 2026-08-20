import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { analyzeProductUrl, analyzeProductHtml, normalizeAliExpressUrl } from "@/lib/scrape/extractor";
import { analyzeMarket, parsePriceToEur } from "@/lib/scrape/market";
import { store } from "@/lib/store";
import { generateEmail, generateBody, generateSubject, pickBestContact } from "@/lib/email/message-generator";
import type { Contact } from "@/lib/types";

export const maxDuration = 120;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { userId } = auth;

  let url = "";
  let html: string | undefined;
  try {
    const body = await req.json();
    url = (body.url || "").toString();
    html = body.html ? body.html.toString() : undefined;
  } catch {
    return fail("Cuerpo invalido");
  }
  if (!url) return fail("Falta la URL del producto");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  // Si llega el HTML de la pagina (captura desde el navegador del cliente),
  // analizar ese HTML directamente; si no, descargar la pagina (best-effort).
  const analysis = html
    ? await analyzeProductHtml(html, url, { method: "draft" })
    : await analyzeProductUrl(url);

  // AliExpress da a los servidores una pagina "light" sin la informacion de
  // conformidad. Si falta el fabricante, usar la captura que hizo el usuario
  // con el boton de favoritos (su navegador, que no esta bloqueado).
  if (!analysis.product.manufacturer_name && !analysis.product.seller_name) {
    try {
      const key = normalizeAliExpressUrl(url) || url;
      const capturedHtml = await store.getCapture(key);
      if (capturedHtml) {
        const merged = await analyzeProductHtml(capturedHtml, url, { method: "draft" });
        for (const k of Object.keys(merged.product) as (keyof typeof merged.product)[]) {
          const v = merged.product[k];
          if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === "") continue;
          const cur = analysis.product[k];
          if (cur === undefined || cur === null || (Array.isArray(cur) && cur.length === 0) || cur === "") {
            (analysis.product as unknown as Record<string, unknown>)[k] = v;
          }
        }
        analysis.method = `${analysis.method}+captura`;
        analysis.success = true;
      }
    } catch {
      // la captura es opcional
    }
  }

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

  // Crear automaticamente el proveedor + mensaje personalizado con el mejor contacto
  let email_id: string | null = null;
  let emailData: { to_email: string | null; to_company: string | null; subject: string; body: string } | null = null;
  const savedContacts = await store.listContactsByProduct(userId, product.id);
  const best = pickBestContact(savedContacts as Contact[]);
  if (best) {
    try {
      const company = best.company || "Proveedor";
      const supplier = await store.insertSupplier(userId, {
        product_id: product.id,
        contact_id: best.id || null,
        company,
        product_name: analysis.product.name || null,
        contact_email: best.email || null,
        contact_type: best.contact_type || null,
        status: "pendiente",
      });
      const generated = generateEmail({ ...(best as any), company }, {
        productName: analysis.product.name || undefined,
        productUrl: analysis.product.url || undefined,
      });
      const emailRow = await store.insertEmail(userId, {
        product_id: product.id,
        contact_id: best.id || null,
        supplier_id: supplier.id,
        to_email: best.email || null,
        to_company: company,
        subject: generated.subject,
        body: generated.body,
        status: "draft",
      });
      email_id = emailRow.id;
      emailData = {
        to_email: best.email || null,
        to_company: company,
        subject: generated.subject,
        body: generated.body,
      };
    } catch {
      // la generacion automatica del email no es critica
    }
  }
  if (!emailData) {
    emailData = {
      to_email: best?.email || null,
      to_company: best?.company || null,
      subject: generateSubject(analysis.product.name || undefined),
      body: generateBody({
        productName: analysis.product.name || undefined,
        productUrl: analysis.product.url || undefined,
        companyName: best?.company,
      }),
    };
  }

  // Analisis de mercado: beneficio estimado y competencia
  const costPrice = parsePriceToEur(analysis.product.price);
  let market = null;
  try {
    market = await analyzeMarket(analysis.product.name || "", costPrice);
  } catch {
    market = null;
  }

  return ok(
    {
      product,
      analysis: analysis.product,
      success: analysis.success,
      email_id,
      email: emailData,
      market,
    },
    { headers: CORS_HEADERS }
  );
}