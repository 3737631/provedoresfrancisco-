import * as cheerio from "cheerio";
import type { Confidence, DataSource, ExtractedProduct } from "@/lib/types";
import { cleanText, extractEmails } from "@/lib/utils";

// ============================================================
//  Fuentes de datos alternativas (legitimas, sin saltar captchas).
//  FUENTE 2: API/proveedor de datos de producto (por URL o ID).
//  FUENTE 3: busqueda web publica por ID / nombre / tienda.
//  FUENTE 4: localizar al fabricante en directorios B2B / web.
//  Si AliExpress bloquea (captcha/403/429/vacio/incompleto), se
//  activa automaticamente la siguiente fuente.
// ============================================================

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Proteccion anti-SSRF: solo URL https publicas (no localhost, ni IPs privadas,
// ni metadata de nube). Se usa antes de descargar cualquier pagina ajena.
export function isSafeRemoteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^[\d.]+$/.test(host)) {
      const p = host.split(".").map(Number);
      if (
        p[0] === 10 ||
        p[0] === 127 ||
        p[0] === 0 ||
        (p[0] === 100 && p[1] >= 64) ||
        (p[0] === 169 && p[1] === 254) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && p[1] === 168) ||
        (p[0] === 198 && p[1] === 18) ||
        p[0] === 224
      ) {
        return false;
      }
    }
    if (host.includes(":") && /^[0-9a-f:]+$/i.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchRemotePageText(url: string): Promise<string | null> {
  if (!isSafeRemoteUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9,en;q=0.8", Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length < 200) return null;
    const $ = cheerio.load(html);
    $("script,style,noscript,svg").remove();
    return cleanText($("body").text() || $("html").text());
  } catch {
    return null;
  }
}

// ============================================================
//  FUENTE 2: API de datos de producto por URL/ID.
//  Configurable por variables de entorno (nunca claves en el
//  frontend). Presets soportados:
//   - ALIEXPRESS_API_PROVIDER=piloterr (registro gratis, +500 creditos)
//       GET https://api.piloterr.com/v2/aliexpress/product?query={url}
//       Auth: Authorization: Bearer <ALIEXPRESS_API_KEY>
//   - ALIEXPRESS_API_PROVIDER=generic (cualquier API REST compatible)
//       ALIEXPRESS_API_URL   plantilla con {url} y/o {id}
//       ALIEXPRESS_API_KEY   clave
//       ALIEXPRESS_API_AUTH  "bearer" | "header:<Nombre>" | "query:<param>" | ""
//  Si no hay clave configurada, la fuente se omite (no falla).
// ============================================================

interface ApiProviderInput {
  url: string;
  productId?: string;
}

export interface SourceResult {
  data: Partial<ExtractedProduct>;
  source: DataSource;
}

export async function fetchProductFromApi(input: ApiProviderInput): Promise<SourceResult | null> {
  const provider = (process.env.ALIEXPRESS_API_PROVIDER || "").toLowerCase();
  const key = process.env.ALIEXPRESS_API_KEY;
  if (!provider || (!key && provider !== "generic" && !process.env.ALIEXPRESS_API_URL)) return null;

  const target = buildApiTarget(provider, input);
  if (!target) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (key) {
      if (provider === "piloterr") headers["Authorization"] = `Bearer ${key}`;
      else {
        const auth = (process.env.ALIEXPRESS_API_AUTH || "").trim();
        if (auth.startsWith("header:")) headers[auth.slice(7).trim()] = key;
        else if (auth === "bearer") headers["Authorization"] = `Bearer ${key}`;
      }
    }
    const res = await fetch(target.url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const data = normalizeApiResponse(json, input);
    if (!data) return null;
    return {
      data,
      source: {
        type: "api_producto",
        url: target.displayUrl,
        title: `API de producto (${provider})`,
        confidence: "media",
      },
    };
  } catch {
    return null;
  }
}

function buildApiTarget(
  provider: string,
  input: ApiProviderInput
): { url: string; displayUrl: string } | null {
  if (provider === "piloterr") {
    const url = `https://api.piloterr.com/v2/aliexpress/product?query=${encodeURIComponent(input.url)}`;
    return { url, displayUrl: "api.piloterr.com (AliExpress Product)" };
  }
  if (provider === "generic" && process.env.ALIEXPRESS_API_URL) {
    const template = process.env.ALIEXPRESS_API_URL;
    const url = template
      .replace(/\{url\}/g, encodeURIComponent(input.url))
      .replace(/\{id\}/g, input.productId || "");
    const auth = (process.env.ALIEXPRESS_API_AUTH || "").trim();
    const key = process.env.ALIEXPRESS_API_KEY;
    const withKey = url + (url.includes("?") ? "&" : "?") + encodeURIComponent(auth.startsWith("query:") ? auth.slice(6).trim() : "api_key") + "=" + encodeURIComponent(key || "");
    return { url: key ? withKey : url, displayUrl: "API de producto configurada" };
  }
  return null;
}

// Normaliza las respuestas mas comunes (piloterr, tmapi, shopapis, parse, json
// propios) a los campos del producto. Solo mapea datos presentes; nunca inventa.
function normalizeApiResponse(json: unknown, input: ApiProviderInput): Partial<ExtractedProduct> | null {
  const root = (json as Record<string, unknown>) || {};
  const result = root.result && typeof root.result === "object" ? (root.result as Record<string, unknown>) : root;
  const info = result.info && typeof result.info === "object" ? (result.info as Record<string, unknown>) : result;
  const pricing = result.pricing && typeof result.pricing === "object" ? (result.pricing as Record<string, unknown>) : {};

  const pick = (keys: string[], from: Record<string, unknown>): unknown => {
    for (const k of keys) {
      const v = from[k];
      if (v !== undefined && v !== null && String(v) !== "") return v;
    }
    return undefined;
  };

  const name = pick(["name", "title", "product_name", "subject"], info);
  const price = pick(["price", "min_price", "original_price"], pricing) ?? pick(["price"], info);
  const currency = pick(["price_currency", "currency"], pricing) ?? pick(["currency"], info);
  const sellerName = pick(["seller_name", "shop_title", "store_name", "seller_title"], info);
  const sellerId = pick(["seller_id", "store_id", "shop_id"], info);
  const productId = pick(["product_id", "item_id", "itemId"], info) ?? input.productId;
  const brand = pick(["brand", "brand_name"], info);
  const imageUrl = pick(["image", "main_image", "image_url", "thumbnail_url"], info);

  const data: Partial<ExtractedProduct> = {};
  if (name) data.name = String(name);
  if (price) data.price = cleanText(String(price));
  if (currency) data.currency = String(currency);
  if (sellerName) {
    data.seller_name = String(sellerName);
    data.seller_store_url = sellerId ? `https://es.aliexpress.com/store/${sellerId}` : undefined;
  }
  if (productId) data.product_id = String(productId);
  if (brand) data.brand = String(brand);
  if (imageUrl) data.image_url = String(imageUrl);
  data.url = input.url;

  return Object.keys(data).some((k) => k !== "url") ? data : null;
}

// ============================================================
//  FUENTE 3: busqueda web publica por ID / nombre / tienda.
//  Reutiliza los buscadores (DuckDuckGo + Bing en paralelo) y
//  visita paginas prometedoras (B2B, tiendas, web oficial) para
//  extraer fabricante, marca y email. Fuentes: alibaba,
//  made-in-china, global sources, tradewheel, webs de fabrica.
// ============================================================

const B2B_RE = /alibaba\.com|made-in-china\.com|globalsources\.com|tradewheel\.com|dnhglobal|dhgate\.com/i;

export interface WebFindings {
  data: Partial<ExtractedProduct>;
  sources: DataSource[];
}

export async function searchProductInfo(input: {
  productId?: string;
  name?: string;
  store?: string;
}): Promise<WebFindings | null> {
  const name = cleanText(input.name || "").slice(0, 70);
  const id = cleanText(input.productId || "");
  const store = cleanText(input.store || "").slice(0, 50);
  if (!name && !id) return null;

  const queries: string[] = [];
  if (id) queries.push(`"${id}" aliexpress product`);
  if (name) {
    queries.push(`"${name}" wholesale supplier`);
    queries.push(`"${name}" manufacturer brand`);
  }
  if (store && store !== name) queries.push(`"${store}" aliexpress store supplier`);

  const { searchEngine } = await import("./market");
  const data: Partial<ExtractedProduct> = {};
  const sources: DataSource[] = [];
  const seen = new Set<string>();
  const candidates: Array<{ url: string; title: string; snippet: string }> = [];

  for (const q of queries.slice(0, 3)) {
    let hits: Array<{ title: string; url: string; snippet: string }> = [];
    try {
      hits = await searchEngine(q);
    } catch {
      hits = [];
    }
    for (const h of hits) {
      const url = h.url;
      if (!url || seen.has(url) || /duckduckgo\.com|bing\.com/i.test(url)) continue;
      if (!isSafeRemoteUrl(url)) continue;
      seen.add(url);
      candidates.push(h);
      sources.push({
        type: "busqueda_web",
        url,
        title: cleanText(h.title).slice(0, 120),
        confidence: "media",
      });
      const txt = `${h.title} ${h.snippet}`;
      if (!data.brand) {
        const b = /brand\s*[:|]\s*([A-Za-z][\w\s-]{1,30}?)(?:[,|.]|$)/i.exec(txt)?.[1];
        if (b) data.brand = cleanText(b);
      }
      if (candidates.length >= 10) break;
    }
    if (candidates.length >= 10) break;
  }

  // Visitar paginas prometedoras para extraer fabricante/marca/email reales
  const prioritized = [...candidates].sort((a, b) => {
    const score = (u: string) =>
      (B2B_RE.test(u) ? 3 : 0) + (/\/products?\//i.test(u) ? 2 : 0) + (/manufactur|supplier|factory|f[aá]brica/i.test(u) ? 2 : 0);
    return score(b.url) - score(a.url);
  });

  for (const c of prioritized.slice(0, 3)) {
    const text = await fetchRemotePageText(c.url);
    if (!text || text.length < 100) continue;
    const lower = text.toLowerCase();

    if (!data.manufacturer_name || data.manufacturer_confidence !== "media") {
      const m =
        /(?:manufacturer|fabricante|manufactured by|made by|hecho por|company)\s*[:|]\s*([A-Za-zÁÉÍÓÚÑñ][\w\s.,&'-]{2,60}?)(?:[,|.]|$)/i.exec(text) ||
        /(?:brand|marca)\s*[:|]\s*([A-Za-z][\w\s-]{1,40}?)(?:[,|.]|$)/i.exec(text);
      if (m) {
        const v = cleanText(m[1]);
        if (v.length >= 3 && v.length <= 60 && !/aliexpress|dropshipping/i.test(v)) {
          data.manufacturer_name = v;
          data.manufacturer_confidence = "media";
        }
      }
    }
    const emails = extractEmails(text);
    if (emails.length && !data.manufacturer_email) data.manufacturer_email = emails[0];
    const addr = /(?:address|direcci[oó]n)\s*[:|]\s*([^\n,.]{5,120})/i.exec(text)?.[1];
    if (addr && !data.manufacturer_address) data.manufacturer_address = cleanText(addr);
    if (B2B_RE.test(c.url) && !data.manufacturer_verified) {
      data.manufacturer_confidence = "media";
    }
    if (sources.length < 12 && !sources.some((s) => s.url === c.url)) {
      sources.push({ type: "busqueda_fabricante", url: c.url, title: cleanText(c.title).slice(0, 120), confidence: "media" });
    }
  }

  if (candidates.length === 0 && sources.length === 0) return null;
  if (!data.brand && !data.manufacturer_name && !data.manufacturer_email) {
    return { data: {}, sources: sources.slice(0, 8) };
  }
  return { data, sources };
}

export { cleanText };