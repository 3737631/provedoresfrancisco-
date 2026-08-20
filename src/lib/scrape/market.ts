import * as cheerio from "cheerio";
import { cleanText } from "@/lib/utils";
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
    `"${name}" wholesale price`,
    `"${name}" competitors dropshipping`,
  ];

  const prices: number[] = [];
  const marketplaces = new Set<string>();
  const domains = new Set<string>();
  let hits = 0;

  for (const q of queries) {
    const results = await duckDuckGo(q);
    for (const r of results) {
      hits++;
      try {
        domains.add(new URL(r.url).hostname.replace(/^www\./, ""));
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