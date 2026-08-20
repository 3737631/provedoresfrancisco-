import * as cheerio from "cheerio";
import type { Contact } from "@/lib/types";
import { cleanText, extractEmails } from "@/lib/utils";
import { sleep } from "@/lib/utils";

// ============================================================
//  Analisis de mercado: beneficio estimado y competencia.
//  Busca el producto en internet (DuckDuckGo), recopila precios
//  de reventa y calcula el margen frente al coste AliExpress.
// ============================================================

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface MarketAnalysis {
  competition: "baja" | "media" | "alta";
  competitorCount: number;
  marketplaces: string[];
  retailPriceRange: string;
  retailPriceEur: number | null;
  costPriceEur: number | null;
  marginEur: number | null;
  marginPct: number | null;
  notes: string[];
}

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

async function duckDuckGo(query: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": UA, Accept: "text/html" } }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchHit[] = [];
    $(".result").each((_, el) => {
      const title = cleanText($(el).find(".result__a").text());
      const href = $(el).find(".result__a").attr("href") || "";
      const snippet = cleanText($(el).find(".result__snippet").text());
      let realUrl = href;
      try {
        const u = new URL(href, "https://html.duckduckgo.com");
        if (u.hostname.includes("duckduckgo.com") && u.searchParams.has("uddg")) {
          realUrl = decodeURIComponent(u.searchParams.get("uddg")!);
        }
      } catch {
        /* mantener href */
      }
      if (title) results.push({ title, url: realUrl, snippet });
    });
    return results.slice(0, 8);
  } catch {
    return [];
  }
}

// Bing de redirige a traves de /ck/a; resolver el destino real.
async function resolveBingRedirect(url: string): Promise<string> {
  if (!url.includes("bing.com/ck/")) return url;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    const loc = res.headers.get("location");
    return loc || url;
  } catch {
    return url;
  }
}

// Bing como buscador de respaldo (DuckDuckGo a veces bloquea o devuelve 202).
async function bingSearch(query: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=es`,
      {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          Accept: "text/html",
        },
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchHit[] = [];
    for (const el of Array.from($("li.b_algo").get()).slice(0, 8)) {
      const title = cleanText($(el).find("h2").text());
      const href = $(el).find("h2 a").attr("href") || "";
      const snippet = cleanText($(el).find(".b_caption p, .b_lineclamp2").text());
      if (!title || !href) continue;
      const realUrl = await resolveBingRedirect(href);
      results.push({ title, url: realUrl, snippet });
    }
    return results;
  } catch {
    return [];
  }
}

// Busca en DDG primero y, si no hay resultados, en Bing.
export async function searchEngine(query: string): Promise<SearchHit[]> {
  const ddg = await duckDuckGo(query);
  if (ddg.length > 0) return ddg;
  await sleep(300);
  return bingSearch(query);
}

const MARKETPLACE_RE =
  /(amazon|ebay|temu|walmart|etsy|shein|wish|shopify|mercadolibre|corte ingl|fnac|media[ -]?markt|aliexpress)/i;

function extractPrice(text: string): number | null {
  const m = text.match(/([\d]{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur|euros|usd|dollar|$)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (!isFinite(n) || n <= 0 || n > 100000) return null;
  return n;
}

export function parsePriceToEur(priceText: string | undefined): number | null {
  if (!priceText) return null;
  const m = priceText.match(/(\d{1,4}(?:[.,]\d{1,3})?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? n : null;
}

// Busca contactos del fabricante/proveedor en internet a partir del nombre del
// producto (util cuando AliExpress bloquea la info de conformidad, p.ej. desde
// servidores cloud). Extrae emails y sitios web de los resultados de busqueda.
export async function findProductContacts(productName: string): Promise<Contact[]> {
  const name = cleanText(productName || "").slice(0, 70);
  if (!name || name.length < 5) return [];

  const queries = [
    `"${name}" manufacturer company email`,
    `"${name}" supplier contact email`,
    `"${name}" dropshipping supplier company`,
    `"${name}" buy wholesale manufacturer`,
  ];

  const found: Contact[] = [];
  const seenEmails = new Set<string>();
  const seenUrls = new Set<string>();

  for (const q of queries) {
    const results = await searchEngine(q);
    for (const r of results) {
      if (r.url.includes("duckduckgo.com")) continue;
      const emails = extractEmails(`${r.title} ${r.snippet}`);
      if (!emails.length && seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      if (emails.length) {
        for (const e of emails) {
          if (seenEmails.has(e)) continue;
          seenEmails.add(e);
          const company =
            r.title
              .split(/[|—-]/)[0]
              .replace(new RegExp(`\\b${escapeRegExp(name.slice(0, 20))}\\b`, "i"), "")
              .trim() || undefined;
          found.push({
            company: company && company.length > 2 ? company : undefined,
            contact_type: "proveedor",
            email: e,
            website: r.url,
            source: "Busqueda en internet del nombre del producto",
            confidence: "media",
          });
        }
      } else if (r.url.length && found.length < 2) {
        found.push({
          company: r.title.split(/[|—-]/)[0].trim() || undefined,
          contact_type: "proveedor",
          website: r.url,
          source: "Busqueda en internet del nombre del producto",
          confidence: "baja",
        });
      }
      if (found.length >= 4) break;
    }
    if (found.length >= 4) break;
    await sleep(400);
  }

  return found.slice(0, 6);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Shopify y tiendas parecidas publican el precio en el HTML (meta og:price o
// JSON embebido). Navega a la pagina del producto y extrae el precio real.
async function fetchShopifyPrice(url: string): Promise<number | null> {
  if (!/myshopify\.com|\/products\//i.test(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9,en;q=0.8" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length < 300 || /captcha|verify/i.test(html.slice(0, 4000))) return null;

    const meta =
      html.match(/(?:og:price|product:price|product:price:amount)[^>]*content="([\d.,]+)"/i)?.[1] ||
      html.match(/"price"\s*:\s*"(\d{1,5}(?:[.,]\d{1,3}){0,2})"/i)?.[1] ||
      html.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>\s*([€$£]?\s*\d{1,5}(?:[.,]\d{1,3}){0,2})/i)?.[1];
    if (!meta) return null;
    const digits = meta.match(/\d{1,5}(?:[.,]\d{1,3}){0,2}/);
    if (!digits) return null;
    const n = parseFloat(digits[0].replace(/\./g, "").replace(",", "."));
    return isFinite(n) && n > 0.5 && n < 100000 ? n : null;
  } catch {
    return null;
  }
}

export async function analyzeMarket(
  productName: string,
  costPriceEur: number | null
): Promise<MarketAnalysis> {
  const name = cleanText(productName || "").slice(0, 60);
  const empty: MarketAnalysis = {
    competition: "baja",
    competitorCount: 0,
    marketplaces: [],
    retailPriceRange: "",
    retailPriceEur: null,
    costPriceEur,
    marginEur: null,
    marginPct: null,
    notes: [],
  };
  if (!name || name.length < 5) {
    empty.notes.push("No se pudo identificar el nombre del producto para buscar en internet.");
    return empty;
  }

  const queries = [
    `"${name}" price buy`,
    `"${name}" precio comprar`,
    `"${name}" amazon price`,
    `"${name}" shopify`,
    `"${name}" myshopify.com`,
    `"${name}" wholesale price`,
    `"${name}" competitors dropshipping`,
  ];

  const prices: number[] = [];
  const marketplaces = new Set<string>();
  const domains = new Set<string>();
  const productUrls: string[] = [];
  let hits = 0;

  for (const q of queries) {
    const results = await searchEngine(q);
    for (const r of results) {
      hits++;
      try {
        const host = new URL(r.url).hostname.replace(/^www\./, "");
        domains.add(host);
        if (/myshopify\.com|\/products\//i.test(r.url)) productUrls.push(r.url);
      } catch {
        /* ignorar */
      }
      const txt = `${r.title} ${r.snippet}`;
      if (MARKETPLACE_RE.test(r.url)) {
        const m = r.url.match(/^https?:\/\/([^/]+)/i);
        if (m) marketplaces.add(m[1].replace(/^www\./, ""));
      }
      const p = extractPrice(txt);
      if (p && p > 0.5 && p < 20000) prices.push(p);
    }
    await sleep(500);
  }

  // Precios REALES navegando a tiendas Shopify/productos encontrados
  for (const u of [...new Set(productUrls)].slice(0, 3)) {
    const sp = await fetchShopifyPrice(u);
    if (sp) {
      prices.push(sp);
      marketplaces.add("shopify");
    }
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n > 0
      ? n % 2 === 1
        ? sorted[(n - 1) / 2]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : null;

  let marginEur: number | null = null;
  let marginPct: number | null = null;
  if (median && costPriceEur && costPriceEur > 0) {
    marginEur = Math.round((median - costPriceEur) * 100) / 100;
    marginPct = Math.round((marginEur / costPriceEur) * 100);
  }

  const competitorCount = domains.size;
  const competition: "baja" | "media" | "alta" =
    competitorCount > 10 || marketplaces.size >= 3
      ? "alta"
      : competitorCount >= 4
        ? "media"
        : "baja";

  const notes: string[] = [];
  if (median && costPriceEur && costPriceEur > 0) {
    notes.push(
      `Precio de reventa estimado: entre ${(sorted[0]).toFixed(2)}€ y ${sorted[n - 1].toFixed(2)}€ (mediana ${median.toFixed(2)}€).`
    );
    notes.push(
      `Con un coste de ${costPriceEur.toFixed(2)}€, el beneficio estimado es de ${marginEur?.toFixed(2)}€ por unidad (${marginPct}%).`
    );
  } else if (median) {
    notes.push(
      `Precio de reventa estimado: mediana ${median.toFixed(2)}€, pero no se pudo calcular el margen sin el coste AliExpress.`
    );
  } else {
    notes.push(
      "No se encontraron precios de reventa en los resultados de búsqueda. Prueba a buscar el nombre exacto del producto."
    );
  }
  notes.push(
    competition === "alta"
      ? `Competencia alta: se encontraron ${marketplaces.size} marketplaces distintos vendiendo este producto.`
      : competition === "media"
        ? `Competencia media: ${marketplaces.size} marketplaces encontrados con el producto.`
        : `Competencia baja: pocos resultados de reventa encontrados.`
  );
  notes.push(
    "Recomendación: pide el precio por mayor (wholesale) al fabricante y compara con el precio de reventa para confirmar el margen."
  );

  return {
    competition,
    competitorCount,
    marketplaces: [...marketplaces],
    retailPriceRange:
      n >= 2
        ? `${sorted[0].toFixed(2)}€ – ${sorted[n - 1].toFixed(2)}€`
        : median
          ? `${median.toFixed(2)}€`
          : "",
    retailPriceEur: median,
    costPriceEur,
    marginEur,
    marginPct,
    notes,
  };
}