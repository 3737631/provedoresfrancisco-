import * as cheerio from "cheerio";
import type { ManufacturerSource } from "@/lib/types";
import { cleanText, extractEmails, extractUrls } from "@/lib/utils";
import { sleep } from "@/lib/utils";

// ============================================================
//  Busqueda de informacion publica del fabricante.
//  Usa DuckDuckGo HTML (sin API key). Si falla, devuelve
//  enlaces de busqueda directa en directorios B2B.
// ============================================================

const DIRECTORY_BASE: Record<string, (q: string) => string> = {
  Alibaba: (q) => `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}`,
  "Made-in-China": (q) => `https://www.made-in-china.com/multi-search/${encodeURIComponent(q)}/1.html`,
  "Global Sources": (q) => `https://www.globalsources.com/searchresult/${encodeURIComponent(q)}.html`,
  TradeWheel: (q) => `https://www.tradewheel.com/search/?q=${encodeURIComponent(q)}`,
  Google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  Bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface DDGResult {
  title: string;
  url: string;
  snippet: string;
}

async function duckDuckGo(query: string): Promise<DDGResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: DDGResult[] = [];
    $(".result").each((_, el) => {
      const title = cleanText($(el).find(".result__a").text());
      const href = $(el).find(".result__a").attr("href") || "";
      const snippet = cleanText($(el).find(".result__snippet").text());
      // DuckDuckGo redirige a traves de //duckduckgo.com/l/?uddg=...
      const realUrl = decodeUddg(href) || href;
      if (title) results.push({ title, url: realUrl, snippet });
    });
    return results.slice(0, 8);
  } catch {
    return [];
  }
}

function decodeUddg(href: string): string | null {
  try {
    const u = new URL(href, "https://html.duckduckgo.com");
    if (u.hostname.includes("duckduckgo.com") && u.searchParams.has("uddg")) {
      return decodeURIComponent(u.searchParams.get("uddg")!);
    }
    return href.startsWith("http") ? href : null;
  } catch {
    return null;
  }
}

export interface ManufacturerSearchResult {
  sources: ManufacturerSource[];
  queries: string[];
}

export async function searchManufacturer(name: string): Promise<ManufacturerSearchResult> {
  const queries = [
    `${name} official website`,
    `${name} manufacturer`,
    `${name} company email contact`,
    `${name} alibaba OR "made-in-china" OR "global sources" supplier`,
  ];

  const sources: ManufacturerSource[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    const results = await duckDuckGo(q);
    for (const r of results) {
      if (r.url.includes("duckduckgo.com") || r.url.includes("google.")) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      const emails = extractEmails(`${r.title} ${r.snippet} ${r.url}`);
      sources.push({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        kind: classifySource(r.url),
        email: emails[0],
      });
    }
    await sleep(700);
    if (sources.length >= 10) break;
  }

  // Anadir enlaces directos a directorios B2B
  for (const [label, builder] of Object.entries(DIRECTORY_BASE)) {
    sources.push({
      title: `Buscar "${name}" en ${label}`,
      url: builder(name),
      kind: "directorio",
      snippet: `Enlace de busqueda directo en ${label}`,
    });
  }

  return { sources, queries };
}

function classifySource(url: string): string {
  if (/alibaba\.com/i.test(url)) return "alibaba";
  if (/made-in-china\.com/i.test(url)) return "madeinchina";
  if (/globalsources\.com/i.test(url)) return "globalsources";
  if (/tradewheel\.com/i.test(url)) return "tradewheel";
  if (/aliexpress|alibaba/i.test(url)) return "marketplace";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.split(".").length <= 2) return "web";
    return "web";
  } catch {
    return "web";
  }
}

export { DIRECTORY_BASE, extractUrls };