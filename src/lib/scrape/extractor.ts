import type { AnalysisResult, ExtractedProduct } from "@/lib/types";
import { isAliExpressUrl, normalizeUrl, extractAliExpressId } from "@/lib/utils";
import { fetchPage } from "./fetcher";
import { parseAliExpress } from "./aliexpress";
import { parseGenericPage, makeProductFromGeneric } from "./generic";
import { searchManufacturer } from "./manufacturer";
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
  if (manufacturerName && manufacturerName.length > 3 && !isRetailName(manufacturerName)) {
    try {
      const search = await searchManufacturer(manufacturerName);
      parsed.manufacturer_sources = search.sources;
    } catch {
      // no es critico
    }
  }

  // 5) Fallback: si no hay nada util, informar
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