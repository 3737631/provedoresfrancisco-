import type { AnalysisResult, ExtractedProduct } from "@/lib/types";
import { isAliExpressUrl, normalizeUrl, extractAliExpressId } from "@/lib/utils";
import { fetchPage, fetchRenderedPage } from "./fetcher";
import { parseAliExpress, applyAliExpressCompliancePopup } from "./aliexpress";
import { parseGenericPage, makeProductFromGeneric } from "./generic";
import { searchManufacturer } from "./manufacturer";
import { findProductContacts } from "./market";
import { extractProductWithLLM } from "./llm";
import { extractEmails } from "@/lib/utils";

// ============================================================
//  Orquestador de extraccion.
//  Estrategias: AliExpress (JSON embebido + HTML) -> LLM -> generico
// ============================================================

export async function analyzeProductUrl(rawUrl: string): Promise<AnalysisResult> {
  const url = normalizeUrl(rawUrl);

  if (!/^https?:\/\//i.test(url)) {
    return { product: { url }, method: "none", success: false, error: "La URL no es valida." };
  }

  const host = safeHost(url);
  if (!host) {
    return { product: { url }, method: "none", success: false, error: "La URL no es valida." };
  }

  const product: ExtractedProduct = {
    url,
    product_id: extractAliExpressId(url) || undefined,
    extraction_method: isAliExpressUrl(url) ? "aliexpress" : "generic",
    warnings: [],
  };

  // 1) Intentar descargar la pagina
  const fetched = await fetchPage(url);
  if (!fetched) {
    const msg =
      "La pagina no pudo ser descargada automaticamente (bloqueo anti-bot o enlace no publico). Puedes introducir los datos manualmente.";
    product.warnings?.push(msg);
    product.extraction_method = "manual";
    return { product, method: "blocked", success: false, error: msg };
  }

  // 2) Parsear segun la plataforma
  let parsed: ExtractedProduct;
  if (isAliExpressUrl(url)) {
    parsed = parseAliExpress(fetched.html, url);
  } else {
    const generic = parseGenericPage(fetched.html, url);
    parsed = makeProductFromGeneric(url, generic);
  }
  parsed.extraction_method = fetched.method === "jina" ? `${parsed.extraction_method}+jina` : parsed.extraction_method;

  // 2a) AliExpress: la informacion de conformidad (fabricante, email,
  //     direccion, responsable UE) llega por la API mtop capturada por el
  //     navegador; aplicarla sobre el resultado.
  if (isAliExpressUrl(url) && fetched.extra?.aliexpress_compliance) {
    applyAliExpressCompliancePopup(parsed, fetched.extra.aliexpress_compliance);
  }

  // 2b) AliExpress: si el HTML inicial no trajo vendedor/conformidad (carga
  //     por JavaScript), renderizar con un navegador real y fusionar.
  const thinAliExpress =
    isAliExpressUrl(url) &&
    !parsed.seller_name &&
    (!parsed.compliance_contacts || parsed.compliance_contacts.length === 0) &&
    !parsed.manufacturer_name &&
    !(parsed.contacts && parsed.contacts.length > 0);
  if (thinAliExpress) {
    const rendered = await fetchRenderedPage(url);
    if (rendered) {
      const rich = parseAliExpress(rendered.html, rendered.finalUrl || url);
      if (rendered.extra?.aliexpress_compliance) {
        applyAliExpressCompliancePopup(rich, rendered.extra.aliexpress_compliance);
      }
      mergeParse(parsed, rich);
      parsed.extraction_method = `${parsed.extraction_method}+browser`;
      if (!parsed.seller_name && rich.seller_name) parsed.seller_name = rich.seller_name;
      if (!parsed.seller_store_url && rich.seller_store_url) parsed.seller_store_url = rich.seller_store_url;
    }
  }

  // 3) Enriquecer con LLM si esta disponible
  let llmData: Awaited<ReturnType<typeof extractProductWithLLM>> | null = null;
  if (fetched.method !== "jina") {
    llmData = await extractProductWithLLM(stripHtml(fetched.html), url);
    if (llmData) {
      mergeLLM(parsed, llmData);
    }
  }

  // 4) Buscar info publica del fabricante (directorios B2B, web oficial)
  const manufacturerName =
    parsed.manufacturer_name ||
    parsed.contacts?.find((c) => c.contact_type === "fabricante")?.company;
  const searchName = manufacturerName || parsed.seller_name;
  if (searchName && searchName.length > 3 && !isRetailName(searchName)) {
    try {
      const search = await searchManufacturer(searchName);
      parsed.manufacturer_sources = search.sources;
    } catch {
      // no es critico
    }
  }

  // 5) Buscar contactos del fabricante en internet (nombre del producto o
  //     fabricante) si aun no hay ningun contacto con email. Muy util cuando
  //     AliExpress bloquea la info de conformidad (p.ej. desde servidores cloud).
  const hasContactEmail = (parsed.contacts || []).some((c) => c.email);
  if (!hasContactEmail) {
    const searchName2 = parsed.manufacturer_name || parsed.seller_name || parsed.name;
    if (searchName2 && searchName2.length > 4) {
      try {
        const internetContacts = await findProductContacts(searchName2);
        for (const c of internetContacts) {
          const dup = (parsed.contacts || []).some(
            (p) => (c.email && p.email === c.email) || (c.website && p.website === c.website)
          );
          if (!dup) (parsed.contacts ||= []).push(c);
        }
      } catch {
        // no es critico
      }
    }
  }

  // 6) Fallback: si no hay nada util, informar
  const hasData = Boolean(
    parsed.name ||
      parsed.seller_name ||
      parsed.manufacturer_name ||
      (parsed.contacts?.length ?? 0) > 0
  );
  if (!hasData) {
    product.warnings?.push(
      "No se pudo extraer informacion del producto. Puedes copiar la informacion manualmente."
    );
    parsed.extraction_method = "manual";
  }

  return { product: parsed, method: fetched.method, success: hasData };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 14000);
}

// Fusiona un parseo rico (navegador) sobre uno fino, rellenando
// solo los campos vacios y anadiendo contactos nuevos.
function mergeParse(target: ExtractedProduct, rich: ExtractedProduct) {
  const fill = (k: "name" | "price" | "currency" | "shipping_info" | "image_url") => {
    if (!target[k] && rich[k]) target[k] = rich[k];
  };
  fill("name");
  fill("price");
  fill("currency");
  fill("shipping_info");
  fill("image_url");
  if (!target.seller_name && rich.seller_name) target.seller_name = rich.seller_name;
  if (!target.seller_store_url && rich.seller_store_url) target.seller_store_url = rich.seller_store_url;
  if (!target.manufacturer_name && rich.manufacturer_name) target.manufacturer_name = rich.manufacturer_name;
  if (!target.manufacturer_email && rich.manufacturer_email) target.manufacturer_email = rich.manufacturer_email;
  if (!target.manufacturer_phone && rich.manufacturer_phone) target.manufacturer_phone = rich.manufacturer_phone;
  if (!target.manufacturer_address && rich.manufacturer_address) target.manufacturer_address = rich.manufacturer_address;
  if (!target.eu_responsible && rich.eu_responsible) target.eu_responsible = rich.eu_responsible;
  if ((target.variants || []).length === 0 && (rich.variants || []).length > 0) target.variants = rich.variants;
  if ((target.compliance_contacts || []).length === 0 && (rich.compliance_contacts || []).length > 0) {
    target.compliance_contacts = rich.compliance_contacts;
  }
  for (const c of rich.contacts || []) {
    const dup = (target.contacts || []).some(
      (p) => (p.email && p.email === c.email) || (p.company && p.company === c.company && p.contact_type === c.contact_type)
    );
    if (!dup) (target.contacts ||= []).push(c);
  }
  for (const w of rich.warnings || []) {
    if (!(target.warnings || []).includes(w)) target.warnings?.push(w);
  }
}

function mergeLLM(
  parsed: ExtractedProduct,
  llm: Awaited<ReturnType<typeof extractProductWithLLM>>
) {
  if (!llm) return;
  if (!parsed.name && llm.product_name) parsed.name = llm.product_name;
  if (!parsed.seller_name && llm.seller) parsed.seller_name = llm.seller;
  if (!parsed.manufacturer_name && llm.manufacturer) parsed.manufacturer_name = llm.manufacturer;
  if (!parsed.manufacturer_address && llm.manufacturer_address) parsed.manufacturer_address = llm.manufacturer_address;
  if (!parsed.manufacturer_email && llm.manufacturer_email) parsed.manufacturer_email = llm.manufacturer_email;
  if (!parsed.manufacturer_phone && llm.manufacturer_phone) parsed.manufacturer_phone = llm.manufacturer_phone;
  if (!parsed.eu_responsible && llm.eu_responsible) parsed.eu_responsible = llm.eu_responsible;
  if (!parsed.price && llm.price) parsed.price = llm.price;
  if (!parsed.currency && llm.currency) parsed.currency = llm.currency;
  if ((!parsed.variants || parsed.variants.length === 0) && llm.variants) parsed.variants = llm.variants;
  if (!parsed.shipping_info && llm.shipping_info) parsed.shipping_info = llm.shipping_info;

  for (const c of llm.contacts || []) {
    const type = (["fabricante", "proveedor", "vendedor", "eu_responsible"] as const).includes(
      (c.type || "") as never
    )
      ? (c.type as "fabricante" | "proveedor" | "vendedor" | "eu_responsible")
      : "proveedor";
    const dup = (parsed.contacts || []).some(
      (p) => p.email && p.email === c.email && p.contact_type === type
    );
    if (!dup) {
      (parsed.contacts ||= []).push({
        company: c.company,
        contact_type: type,
        email: c.email,
        website: c.website,
        phone: c.phone,
        source: "Analisis LLM de la pagina",
        confidence: c.email ? "alta" : "media",
      });
    }
  }

  if (llm.manufacturer_email && !(parsed.contacts || []).some((c) => c.email === llm.manufacturer_email)) {
    (parsed.contacts ||= []).push({
      company: llm.manufacturer || "Fabricante",
      contact_type: "fabricante",
      email: llm.manufacturer_email,
      source: "Analisis LLM de la pagina",
      confidence: "alta",
    });
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isRetailName(name: string): boolean {
  // nombres tipo "AliExpress Seller" o cadenas demasiado genericas
  if (/aliexpress|retail|seller|store/gi.test(name)) return false;
  const words = name.split(/\s+/);
  if (words.length === 1 && words[0].length < 4) return true;
  return false;
}