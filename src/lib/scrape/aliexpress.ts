import * as cheerio from "cheerio";
import type { ExtractedProduct } from "@/lib/types";
import { cleanText, extractEmails, extractPhones, extractUrls } from "@/lib/utils";

// ============================================================
//  Parser de AliExpress.
//  Busca datos en varias capas:
//   1. window.runParams / __INITIAL_STATE__ (JSON embebido)
//   2. <script type="application/ld+json">
//   3. meta tags / <title>
//   4. texto visible (info de conformidad, direcciones, emails)
// ============================================================

function extractJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function findWindowObject(html: string, varName: string): Record<string, unknown> | null {
  const patterns = [
    new RegExp(`${varName}\\s*=\\s*(\\{)`, "i"),
    new RegExp(`"${varName}"\\s*:\\s*(\\{)`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m.index !== undefined) {
      const start = m.index + (m[0].indexOf("{") as number);
      const json = extractJsonObject(html, start);
      if (json) {
        try {
          return JSON.parse(json);
        } catch {
          /* seguir con el siguiente patron */
        }
      }
    }
  }
  return null;
}

function findAssignedJson(html: string, pattern: RegExp): Record<string, unknown> | null {
  const m = pattern.exec(html);
  if (m && m.index !== undefined) {
    const start = m.index + (m[0].length - 1);
    const json = extractJsonObject(html, start);
    if (json) {
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
      return undefined;
    }, obj);
}

function firstDefined(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    const s = typeof v === "string" ? cleanText(v) : "";
    if (s) return s;
  }
  return undefined;
}

function extractSellerInfo(html: string, $: cheerio.CheerioAPI): { name?: string; storeUrl?: string } {
  // De runParams.data.store
  const out: { name?: string; storeUrl?: string } = {};

  // Intentar con cheerio: enlaces de tienda del vendedor
  const storeLinks: string[] = [];
  $("a[href*='store']").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (/store\/(\d+)/i.test(href) || /_?p/.test(href)) storeLinks.push(href);
  });

  const sellerSel = [
    ".store-name",
    "[class*='store-name']",
    ".seller-name",
    "[class*='sellerName']",
    "[class*='storeName']",
  ];
  for (const sel of sellerSel) {
    const t = cleanText($(sel).first().text());
    if (t) {
      out.name = t;
      break;
    }
  }

  // runParams.data.store y data.seller = cuenta/vendedor de AliExpress.
  // (OJO: data.sellerCompanyInfo NO es el vendedor, es la empresa legal.)
  const rp = findWindowObject(html, "runParams");
  if (rp) {
    const data = getByPath(rp, "data") as Record<string, unknown> | undefined;
    const store = data?.store as Record<string, unknown> | undefined;
    if (store) {
      out.name =
        firstDefined(
          store.storeName,
          store.name,
          store.sellerName,
          store.displayName
        ) || out.name;
      if (store.storeUrl) out.storeUrl = store.storeUrl as string;
    }
    const seller = data?.seller as Record<string, unknown> | undefined;
    if (seller) {
      out.name =
        firstDefined(
          seller.sellerName,
          seller.name,
          seller.displayName,
          seller.loginId
        ) || out.name;
    }
  }

  if (storeLinks.length && !out.storeUrl) {
    out.storeUrl = storeLinks[0];
  }

  return out;
}

function extractComplianceContacts($: cheerio.CheerioAPI): Array<{
  company?: string;
  address?: string;
  email?: string;
  phone?: string;
}> {
  const results: Array<{ company?: string; address?: string; email?: string; phone?: string }> = [];

  // Texto completo de la pagina (puede contener info de conformidad)
  const bodyText = cleanText($("body").text());

  // Buscar bloques que mencionen informacion de conformidad / contacto del fabricante
  const keywords = /conformity|responsible|manufacturer|importer|supplier|company information|contact information|seller information|legal/i;
  const sections = bodyText.split(/\n+/).filter((line) => line.length > 10);

  let current: { company?: string; address?: string; email?: string; phone?: string } | null = null;

  for (const line of sections) {
    if (keywords.test(line) && line.length < 400) {
      // Inicio de una posible seccion de contacto
      if (current) results.push(current);
      current = {};
      // extraer email en la misma linea
      const emails = extractEmails(line);
      const phones = extractPhones(line);
      if (emails.length) current.email = emails[0];
      if (phones.length) current.phone = phones[0];
      current.company = line.slice(0, 120);
      continue;
    }
    if (current) {
      const emails = extractEmails(line);
      const phones = extractPhones(line);
      if (emails.length) {
        current.email = emails[0];
        continue;
      }
      if (phones.length) {
        current.phone = phones[0];
        continue;
      }
      if (/^(https?:\/\/)/i.test(line)) continue;
      // acumular como posible direccion/compania
      current.company = current.company ? `${current.company} | ${line.slice(0, 200)}` : line.slice(0, 200);
    }
  }
  if (current) results.push(current);

  // Patron clasico de "Contact information" en AliExpress mobile: nombre de empresa + direccion + email
  const emailBlock = /([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&\-]{2,80}?(?:Co\.,?\s*Ltd|Corp\.?|Limited|Inc\.?|GmbH|S\.L\.?|Co\.,?\s*Ltd\.?))\s*([^\n]{0,300}?)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const m = emailBlock.exec(bodyText);
  if (m && m[3]) {
    const existing = results.some((r) => r.email === m[3]);
    if (!existing) {
      results.push({
        company: m[1],
        address: cleanText(m[2]).slice(0, 300),
        email: m[3],
      });
    }
  }

  return results.slice(0, 5);
}

function extractVariants($: cheerio.CheerioAPI): Array<{ name?: string; price?: string }> {
  const variants: Array<{ name?: string; price?: string }> = [];
  // SKU en lista
  $("ul.sku-property-list li, [class*='sku'] [class*='item']").each((_, el) => {
    const t = cleanText($(el).text());
    if (t && t.length < 60) variants.push({ name: t });
  });
  return variants.slice(0, 20);
}

function extractPrice($: cheerio.CheerioAPI): string {
  const sels = [
    ".price--currentPriceText--V8_y_b5",
    "[class*='currentPriceText']",
    ".product-price-current",
    "[class*='product-price-value']",
    "[class*='price']",
  ];
  for (const sel of sels) {
    const t = cleanText($(sel).first().text());
    if (t && /\d/.test(t)) return t;
  }
  // meta
  const meta = $('meta[property="product:price:amount"]').attr("content");
  if (meta) return cleanText(meta);
  return "";
}

function extractShipping($: cheerio.CheerioAPI): string {
  const sels = [
    "[class*='shipping']",
    "[class*='logistics']",
    "[class*='delivery']",
    ".delivery-text",
  ];
  const texts: string[] = [];
  for (const sel of sels) {
    $(sel).each((_, el) => {
      const t = cleanText($(el).text());
      if (t && t.length < 160 && !texts.includes(t)) texts.push(t);
    });
    if (texts.length >= 3) break;
  }
  return texts.join(" | ").slice(0, 500);
}

export function parseAliExpress(html: string, url: string): ExtractedProduct {
  const $ = cheerio.load(html);
  const result: ExtractedProduct = {
    url,
    extraction_method: "aliexpress",
    warnings: [],
  };

  // ---- Nombre ----
  const title = cleanText($("title").first().text());
  const ogTitle = cleanText($('meta[property="og:title"]').attr("content"));
  result.name =
    firstDefined(ogTitle, title) || undefined;
  // quitar sufijo tipico de AliExpress
  if (result.name) result.name = result.name.replace(/\s*[-|]\s*(AliExpress|aliexpress)\s*\d+$/i, "").trim();

  // ---- Imagen ----
  result.image_url =
    cleanText($('meta[property="og:image"]').attr("content")) || undefined;

  // ---- runParams ----
  const rp = findWindowObject(html, "runParams");
  if (rp) {
    const data = getByPath(rp, "data") as Record<string, unknown> | undefined;
    if (data) {
      const item = data.productInfoComponent as Record<string, unknown> | undefined;
      if (item) {
        const discount = item.discountPrice as Record<string, unknown> | undefined;
        const defaultSku = item.defaultSku as Record<string, unknown> | undefined;
        result.product_id =
          firstDefined(item.id, item.productId, item.iid) || result.product_id;
        result.name =
          firstDefined(item.subject, item.name, item.title) || result.name;
        result.price =
          firstDefined(
            item.formatedPrice,
            item.price,
            discount?.formatedActivityPrice,
            defaultSku?.formatedActivityPrice,
            defaultSku?.formatedPrice
          ) || undefined;
        result.currency =
          firstDefined(
            (item as { currencyCode?: unknown }).currencyCode,
            (item as { currency?: unknown }).currency
          ) || undefined;
        if (Array.isArray(item.variations)) {
          result.variants = (item.variations as Array<Record<string, unknown>>)
            .map((v) => ({ name: firstDefined(v.name, v.variationName), price: firstDefined(v.formatedActivityPrice, v.formatedPrice) }))
            .filter((v) => v.name);
        }
      }
      const logistics = data.logisticsInfoComponent as Record<string, unknown> | undefined;
      if (logistics && Array.isArray(logistics.logisticsInfo)) {
        const first = (logistics.logisticsInfo as Array<Record<string, unknown>>)[0];
        if (first) {
          const freight = first.freightAmount as Record<string, unknown> | undefined;
          const delivery = firstDefined(first.deliveryTimeDesc, first.deliveryTime);
          const cost = freight?.formatedAmount || (first.shippingFee as string | undefined);
          result.shipping_info = [delivery, cost].filter(Boolean).join(" · ");
        }
      }
      const seller = getByPath(rp, "data.sellerCompanyInfo") as Record<string, unknown> | undefined;
      if (seller) {
        result.manufacturer_name = firstDefined(
          seller.companyName,
          seller.company_name,
          seller.legalCompanyName,
          seller.name
        );
        result.manufacturer_address = firstDefined(
          seller.registeredAddress,
          seller.address,
          seller.addressLine,
          seller.contactAddress
        );
        result.manufacturer_email = firstDefined(seller.email, seller.contactEmail, seller.companyEmail);
        result.manufacturer_phone = firstDefined(seller.phone, seller.telephone, seller.contactPhone);
      }
    }
  }

  // ---- Vendedor / tienda ----
  const sellerInfo = extractSellerInfo(html, $);
  result.seller_name = sellerInfo.name;
  result.seller_store_url = sellerInfo.storeUrl;

  // ---- Contactos de conformidad / compliance ----
  const compliance = extractComplianceContacts($);
  result.compliance_contacts = compliance.map((c) => ({
    company: c.company,
    contact_type: "fabricante" as const,
    email: c.email,
    phone: c.phone,
  }));
  // email y telefono globales de la pagina
  const bodyText = cleanText($("body").text());
  const emails = extractEmails(bodyText);
  const phones = extractPhones(bodyText);

  // Contacto "Responsable en la UE" si aparece texto de fabricante/importador en la UE
  const euMatch = bodyText.match(/responsible\s*(?:in|for)?\s*the\s*EU[^.]{0,200}/i) ||
    bodyText.match(/EU\s+representative[^.]{0,200}/i);
  if (euMatch) result.eu_responsible = cleanText(euMatch[0]);

  // ---- Variantes / precio / envio (fallbacks por selectores) ----
  if (!result.price) result.price = extractPrice($);
  if (!result.shipping_info) result.shipping_info = extractShipping($);
  if (!result.variants || result.variants.length === 0) result.variants = extractVariants($);

  // ---- Product ID desde URL ----
  if (!result.product_id) {
    const m = url.match(/item\/(\d+)\.html/i);
    if (m) result.product_id = m[1];
  }

  // ---- Construir lista de contactos ----
  const contacts = [];
  for (const c of compliance) {
    if (c.company || c.email || c.phone) {
      contacts.push({
        company: c.company,
        contact_type: "fabricante" as const,
        email: c.email,
        phone: c.phone,
        source: "Informacion de conformidad en AliExpress",
        confidence: c.email ? ("alta" as const) : ("media" as const),
      });
    }
  }
  if (result.manufacturer_name || result.manufacturer_email) {
    const dup = contacts.some(
      (c) => c.email && result.manufacturer_email && c.email === result.manufacturer_email
    );
    if (!dup) {
      contacts.push({
        company: result.manufacturer_name || "Fabricante (AliExpress)",
        contact_type: "fabricante" as const,
        email: result.manufacturer_email,
        website: extractUrls(bodyText).find((u) => !u.includes("aliexpress")) || undefined,
        phone: result.manufacturer_phone,
        source: "Informacion de la empresa en AliExpress",
        confidence: result.manufacturer_email ? ("alta" as const) : ("media" as const),
      });
    }
  }
  // contacto vendedor (el que responde en AliExpress)
  if (result.seller_name) {
    contacts.push({
      company: result.seller_name,
      contact_type: "vendedor" as const,
      email: undefined,
      website: result.seller_store_url,
      source: "Tienda del vendedor en AliExpress",
      confidence: "media" as const,
    });
  }
  result.contacts = contacts;

  // Emails sueltos que no esten en contactos -> proveedor potencial
  for (const e of emails) {
    if (!result.contacts?.some((c) => c.email === e)) {
      result.contacts?.push({
        company: undefined,
        contact_type: "proveedor" as const,
        email: e,
        source: "Email encontrado en la pagina del producto",
        confidence: "media" as const,
      });
    }
  }

  return result;
}