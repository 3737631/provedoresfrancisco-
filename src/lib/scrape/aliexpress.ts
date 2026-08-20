import * as cheerio from "cheerio";
import type { ExtractedProduct } from "@/lib/types";
import { cleanText, htmlToText, extractEmails, extractPhones, extractUrls } from "@/lib/utils";

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

  // Fallback por texto: "Vendido por Shop1103847351 Store (Vendedor)"
  if (!out.name) {
    const t = htmlToText(stripScripts($.html() || ""));
    const m =
      t.match(/vendido\s+por\s*([^\n(]{2,80})/i) ||
      t.match(/sold\s+by\s*([^\n(]{2,80})/i);
    if (m && m[1]) {
      const name = cleanText(m[1]).replace(/\([^)]*\)/g, "").trim();
      if (name && !/aliexpress$/i.test(name)) out.name = name;
    }
  }

  if (storeLinks.length && !out.storeUrl) {
    out.storeUrl = storeLinks[0];
  }

  // limpiar sufijos tipo "(Vendedor)" de cualquier fuente
  if (out.name) out.name = out.name.replace(/\([^)]*\)/g, "").trim();

  return out;
}

function extractComplianceContacts($: cheerio.CheerioAPI): Array<{
  company?: string;
  address?: string;
  email?: string;
  phone?: string;
}> {
  const results: Array<{ company?: string; address?: string; email?: string; phone?: string }> = [];
  const rawHtml = $.html() || "";

  // Texto visible con saltos de linea conservados (sin scripts ni estilos)
  const bodyText = htmlToText(stripScripts(rawHtml));
  const lines = bodyText.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 1);

  // Localizar la seccion "Informacion sobre conformidad del producto" / "Product compliance information"
  const headingIdx = lines.findIndex((l) =>
    /conformidad del producto|product compliance|compliance information|seller information/i.test(l)
  );

  let block: string[] = [];
  if (headingIdx >= 0) {
    for (let i = headingIdx + 1; i < lines.length && block.length < 25; i++) {
      const l = lines[i];
      if (/^(mensajes|compromiso de aliexpress|pick[ .]?up|envio gratis|devoluciones?|entrega rapida)/i.test(l)) break;
      if (/^(descargo|aviso legal|en el caso de|si aliexpress|informacion sobre|para mas informacion)/i.test(l)) continue;
      block.push(l);
    }
  }
  const blockText = block.join("\n");

  // Empresa: "Vendido por <Tienda> (Vendedor)" (puede estar en dos lineas)
  const sold =
    blockText.match(/vendido\s+por\s*([^\n(]{2,80})/i) ||
    blockText.match(/sold\s+by\s*([^\n(]{2,80})/i);
  let company = sold && sold[1] ? cleanText(sold[1]).replace(/\([^)]*\)/g, "").trim() : undefined;

  // Razon social (Co., Ltd / Corp / GmbH ...) si no hay "Vendido por"
  if (!company) {
    const legal = blockText.match(
      /([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&\-]{2,70}(?:Co\.,?\s*Ltd|Corp\.?|Limited|Inc\.?|GmbH|S\.L\.?|S\.A\.?|LTDA))[^\n]{0,160}/i
    );
    if (legal && legal[1]) company = cleanText(legal[1]);
  }

  // Direccion: linea del bloque que contenga la empresa + datos, sin boilerplate
  let address: string | undefined;
  if (company) {
    const addrLine = block.find(
      (l) =>
        l.includes(company.slice(0, 30)) &&
        l.length > company.length + 10 &&
        l.length < 260 &&
        !/^(vendido|sold)|log[ií]stica por|^shop/i.test(l)
    );
    if (addrLine) {
      const rest = addrLine.replace(company, "");
      if (rest.length > 10 && !/log[ií]stica/i.test(rest)) address = cleanText(rest).slice(0, 220);
    }
  }
  if (!address) {
    const addrMatch =
      blockText.match(/(?:address|direcci[oó]n|domicilio|registro)[:\s]+([^\n]{10,220})/i) ||
      blockText.match(/(?:room|floor|building|distrito|street|calle|avenida|shenzhen|guangzhou|ningbo|yiwu|hong kong)\s*[^\n]{4,180}/i);
    if (addrMatch) address = cleanText(addrMatch[0]).slice(0, 220);
  }

  const emails = extractEmails(`${blockText}\n${bodyText}`);
  const phones = extractPhones(blockText).filter(plausiblePhone);

  const contact: { company?: string; address?: string; email?: string; phone?: string } = {};
  if (company) contact.company = company;
  if (address) contact.address = address;
  if (emails.length) contact.email = emails[0];
  if (phones.length) contact.phone = phones[0];
  if (company || emails.length || phones.length) results.push(contact);

  // Emails que puedan estar en otras partes de la pagina
  const seenEmails = new Set(emails);
  for (const e of extractEmails(bodyText)) {
    if (!seenEmails.has(e)) {
      seenEmails.add(e);
      results.push({ email: e });
    }
  }

  return results.slice(0, 6);
}

function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
}

// Un numero de 8-11 digitos sin separadores suele ser el numero de tienda, no un telefono.
function plausiblePhone(p: string): boolean {
  const digits = p.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  if (p.startsWith("+")) return true;
  // requiere al menos un separador para no confundir con IDs numericos
  return /[^+\d]/.test(p);
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

function cleanPriceText(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  // "2,49€", "€ 2,49", "$12.99" o con el simbolo despues
  const m = t.match(/([€$£¥])\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*([€$£¥])/);
  if (m) {
    if (m[1]) return `${m[1]}${m[2]}`;
    return `${m[3]}${m[4]}`;
  }
  return t.slice(0, 60);
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
    if (t && /\d/.test(t)) return cleanPriceText(t);
  }
  // meta
  const meta = $('meta[property="product:price:amount"]').attr("content");
  if (meta) return cleanPriceText(meta);
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
        // sellerCompanyInfo es la EMPRESA LEGAL DEL VENDEDOR (la tienda), no el
        // fabricante del producto. Se guarda como informacion del vendedor; el
        // fabricante se rellena solo desde la informacion de conformidad.
        const company = firstDefined(
          seller.companyName,
          seller.company_name,
          seller.legalCompanyName,
          seller.name
        );
        if (company && !result.seller_name) result.seller_name = String(company);
        result.seller_address = firstDefined(
          seller.registeredAddress,
          seller.address,
          seller.addressLine,
          seller.contactAddress
        );
        result.seller_email = firstDefined(seller.email, seller.contactEmail, seller.companyEmail);
        result.seller_phone = firstDefined(seller.phone, seller.telephone, seller.contactPhone);
        result.manufacturer_confidence = "media";
        result.manufacturer_verified = false;
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
    address: c.address,
  }));

  // ---- Fabricante / empresa desde la informacion de conformidad ----
  // La seccion "Informacion sobre conformidad del producto" contiene la
  // empresa legal detras del producto (vendedor/fabricante/importador).
  const comp = compliance[0];
  if (!result.manufacturer_name && comp?.company) {
    result.manufacturer_name = comp.company;
  }
  // La informacion de conformidad es la fuente autoritativa del fabricante.
  if (comp?.company) {
    result.manufacturer_verified = true;
    result.manufacturer_confidence = "alta";
  }
  if (!result.manufacturer_address && comp?.address) {
    result.manufacturer_address = comp.address;
  }
  if (!result.manufacturer_email && comp?.email) {
    result.manufacturer_email = comp.email;
  }
  if (!result.manufacturer_phone && comp?.phone) {
    result.manufacturer_phone = comp.phone;
  }
  const euMatchComp = compliance.find((c) => /responsab|importador|importador en la ue|eu/i.test(c.company || ""));
  if (!result.eu_responsible && euMatchComp) {
    result.eu_responsible = euMatchComp.company;
  }
  // email y telefono globales de la pagina
  const bodyText = htmlToText(stripScripts($.html() || ""));
  const emails = extractEmails(bodyText);
  const phones = extractPhones(bodyText);

  // Contacto "Responsable en la UE" si aparece texto de fabricante/importador en la UE
  const euMatch = bodyText.match(/responsible\s*(?:in|for)?\s*the\s*EU[^.]{0,200}/i) ||
    bodyText.match(/EU\s+representative[^.]{0,200}/i);
  if (euMatch) result.eu_responsible = cleanText(euMatch[0]);

  // ---- Variantes / precio / envio (fallbacks por selectores) ----
  if (result.price) result.price = cleanPriceText(result.price);
  if (!result.price) result.price = extractPrice($);
  // Precio desde el JSON-LD del producto en paginas renderizadas por JS
  // (presente tambien cuando la API interna esta bloqueada).
  if (!result.price) {
    const m = html.match(/"priceCurrency":"([A-Z]{3})"\s*,\s*"price":"([\d.,]+)"/);
    if (m) result.price = `${m[2]} ${m[1]}`;
    else {
      const m2 = html.match(/"price":"(\d{1,4}(?:[.,]\d{1,3}){0,2})"/);
      if (m2) result.price = m2[1];
    }
  }
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
      // si la conformidad solo repite el nombre de la tienda sin email, no duplicar
      if (
        !c.email &&
        c.company &&
        result.seller_name &&
        c.company.toLowerCase() === result.seller_name.toLowerCase()
      ) {
        continue;
      }
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

// ============================================================
//  Informacion de conformidad del producto (popup oficial).
//  La API mtop.aliexpress.pdp.pc.query incluye un popup
//  "product_compliance_information" con HTML tipo:
//    <p><strong>Informacion del fabricante</strong><br>
//      Nombre:X<br>Direccion:Y<br>Email:Z<br>Telefono:P<br>
//    <p><strong>Informacion sobre la persona responsable en la UE</strong><br>
//      Nombre:W<br>Direccion:V<br>Email:U<br>Telefono:T
// ============================================================

interface ComplianceSection {
  type: "fabricante" | "eu_responsible";
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
}

export function parseCompliancePopup(popText: string): ComplianceSection[] {
  const $ = cheerio.load(`<div>${popText}</div>`);
  $("br").replaceWith("\n");
  $("p").append("\n");
  const text = $.text().replace(/&nbsp;/g, " ");
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: ComplianceSection[] = [];
  let cur: ComplianceSection | null = null;
  for (const line of lines) {
    if (/informaci[oó]n del fabricante|manufacturer information/i.test(line)) {
      cur = { type: "fabricante" };
      out.push(cur);
      continue;
    }
    if (/persona responsable en la ue|responsable.*ue|eu responsible|importador/i.test(line)) {
      cur = { type: "eu_responsible" };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const field =
      line.match(/^nombre\s*:\s*(.+)$/i) ||
      line.match(/^direcci[oó]n\s*:\s*(.+)$/i) ||
      line.match(/^email\s*:\s*(.+)$/i) ||
      line.match(/^tel[ée]fono\s*:\s*(.+)$/i);
    if (field) {
      const v = cleanText(field[1]);
      if (!v) continue;
      if (/^nombre/i.test(line)) cur.name = v;
      else if (/^direcci/i.test(line)) cur.address = v;
      else if (/^email/i.test(line)) cur.email = v;
      else cur.phone = v;
    } else if (cur.name && !cur.address && line.length < 260) {
      cur.address = cleanText(line);
    }
  }
  return out;
}

// Aplica la informacion de conformidad del popup sobre el resultado extraido.
export function applyAliExpressCompliancePopup(result: ExtractedProduct, popText: string) {
  const sections = parseCompliancePopup(popText);
  if (sections.length === 0) return;

  const mfg = sections.find((s) => s.type === "fabricante");
  const eu = sections.find((s) => s.type === "eu_responsible");

  const pushContact = (
    type: "fabricante" | "eu_responsible",
    company: string | undefined,
    email: string | undefined,
    phone: string | undefined,
    address: string | undefined
  ) => {
    if (!company && !email) return;
    const dup = (result.contacts || []).some((c) => c.email && email && c.email === email);
    if (dup) return;
    (result.contacts ||= []).push({
      company,
      contact_type: type,
      email,
      phone,
      address,
      source: "Información sobre conformidad del producto (AliExpress)",
      confidence: email ? ("alta" as const) : ("media" as const),
    });
  };

  if (mfg) {
    // La informacion oficial de conformidad es la fuente autoritativa:
    // sobrescribe cualquier placeholder (nombre de tienda) y rellena los vacios.
    result.manufacturer_verified = true;
    result.manufacturer_confidence = "alta";
    if (mfg.name) result.manufacturer_name = mfg.name;
    if (mfg.address) result.manufacturer_address = mfg.address;
    if (mfg.email) result.manufacturer_email = mfg.email;
    if (mfg.phone) result.manufacturer_phone = mfg.phone;
    // quitar fabricantes debiles (sin email) que eran solo el nombre de la tienda
    if (result.contacts) {
      result.contacts = result.contacts.filter((c) => !(c.contact_type === "fabricante" && !c.email));
    }
    if ((result.compliance_contacts || []).length === 0) {
      result.compliance_contacts = [
        {
          company: mfg.name,
          contact_type: "fabricante" as const,
          email: mfg.email,
          phone: mfg.phone,
          address: mfg.address,
        },
      ];
    }
    pushContact("fabricante", mfg.name, mfg.email, mfg.phone, mfg.address);
  }
  if (eu) {
    if (!result.eu_responsible && eu.name) result.eu_responsible = eu.name;
    pushContact("eu_responsible", eu.name, eu.email, eu.phone, eu.address);
  }
}