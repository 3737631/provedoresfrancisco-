import { sleep } from "@/lib/utils";

// ============================================================
//  Fetcher robusto con multiples estrategias.
//  No saltamos CAPTCHAs ni anti-bots: si todo falla, devolvemos
//  null y la UI ofrece entrada manual.
//  Estrategias: directo -> reintento -> Jina Reader -> navegador
//  real (Edge/Chrome instalado) para paginas que cargan por JS
//  (AliExpress renderiza la info de conformidad por JavaScript).
// ============================================================

interface FetchResult {
  html: string;
  method: string;
  finalUrl?: string;
  extra?: Record<string, string>;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Detecta paginas de captcha de forma segura: mirando el TITULO (las paginas
// de captcha de AliExpress se llaman "CAPTCHA Verification") y, en paginas muy
// pequenas, por marcadores. NO se descartan paginas grandes: la pagina real del
// producto (250-400KB) contiene "captcha"/"verify"/"punish" en su codigo JS.
export function isCaptchaPage(html: string): boolean {
  const title = (
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ||
    html.match(/og:title[^>]*content="([^"]+)"/i)?.[1] ||
    ""
  ).toLowerCase();
  if (/captcha|verify|just a moment|unusual traffic|punish/i.test(title)) return true;
  if (html.length < 30000 && /captcha|verify|unusual traffic|punish/i.test(html)) return true;
  return false;
}

async function tryDirect(url: string): Promise<FetchResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      // AliExpress suele devolver 403/503 a bots
      return null;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return null;
    }
    const html = await res.text();
    if (html.length < 200) return null;
    if (isCaptchaPage(html)) return null;
    return { html, method: "direct", finalUrl: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryJina(url: string): Promise<FetchResult | null> {
  const key = process.env.JINA_API_KEY;
  const target = key ? `https://r.jina.ai/${url}` : `https://r.jina.ai/${url}`;
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,text/plain",
  };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(target, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 200) return null;
    // Jina devuelve markdown/plain; lo envolvemos en <pre> para tratarlo como HTML
    return { html: `<pre>${escapeHtml(text)}</pre>`, method: "jina", finalUrl: url };
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function tryScraperAPI(url: string): Promise<FetchResult | null> {
  const key = process.env.SCRAPERAPI_KEY;
  if (!key) return null;
  try {
    // ScraperAPI: IP residencial, rotacion de proxies y gestion de captchas.
    // Plan gratis: ~5.000 creditos/mes. render=true renderiza el JS (precio
    // del producto via JSON-LD). No se usa sin clave.
    const target = `https://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent(url)}&country=es&render=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(target, { headers: { "User-Agent": UA }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length < 200 || isCaptchaPage(html)) return null;
    return { html, method: "proxy", finalUrl: url };
  } catch {
    return null;
  }
}

export async function fetchPage(url: string): Promise<FetchResult | null> {
  // 1) Directo
  const direct = await tryDirect(url);
  if (direct) return direct;

  // 2) Vuelta a intentar con espera (algunos sitios bloquean la 1a request)
  await sleep(400);
  const direct2 = await tryDirect(url);
  if (direct2) return direct2;

  // 2b) ScraperAPI (IP residencial + captcha handling) si hay clave
  const proxy = await tryScraperAPI(url);
  if (proxy) return proxy;

  // 3) Jina Reader (proxy de lectura publica)
  const jina = await tryJina(url);
  if (jina) return jina;

  // 4) Navegador real (JS renderizado)
  const browser = await tryBrowser(url);
  if (browser) return browser;

  return null;
}

// Renderiza la pagina con un navegador real (Edge/Chrome instalado).
// Util para sitios que cargan todo por JavaScript (AliExpress).
export async function fetchRenderedPage(url: string): Promise<FetchResult | null> {
  return tryBrowser(url);
}

const CANDIDATE_BROWSERS = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
].filter(Boolean) as string[];

async function tryBrowser(url: string): Promise<FetchResult | null> {
  const executablePath = CANDIDATE_BROWSERS.find((p) => p && fsExists(p));
  if (!executablePath) return null;
  try {
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1280,1400"],
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent(UA);
      await page.setExtraHTTPHeaders({ "Accept-Language": "es-ES,es;q=0.9" });

      // Capturar la API interna de AliExpress que trae la informacion de
      // conformidad del producto (fabricante, direccion, email, telefono).
      const mtopBodies: string[] = [];
      page.on("response", async (res) => {
        try {
          const u = res.url();
          if (u.length > 4000 || !u.includes("mtop.aliexpress.pdp.pc.query")) return;
          const body = await res.text();
          if (body.length > 200 && body.length < 4000000) mtopBodies.push(body);
        } catch {
          /* ignorar */
        }
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      clearTimeout(timer);
      // Esperar a que el contenido se renderice (hasta 30s)
      for (let i = 0; i < 30; i++) {
        await sleep(1000);
        const ready = await page.evaluate(() => {
          const t = (document.body ? document.body.innerText : "") || "";
          return t.length > 800 && !/just a moment|enable javascript|captcha/i.test(t);
        });
        if (ready) break;
      }

      // Expandir la seccion de conformidad del producto (puede estar plegada)
      try {
        await page.evaluate(() => {
          const els = Array.from(
            document.querySelectorAll("div,span,button,h2,h3,h4,section,[role='button']")
          ) as HTMLElement[];
          const target = els.find((el) => {
            const t = (el.textContent || "").trim();
            return (
              t.length < 120 &&
              (t.toLowerCase().includes("información sobre conformidad") ||
                t.toLowerCase().includes("informacion sobre conformidad") ||
                t.toLowerCase().includes("product compliance") ||
                t.toLowerCase().includes("compliance information") ||
                t.toLowerCase().includes("información del vendedor") ||
                t.toLowerCase().includes("seller information"))
            );
          });
          if (target) target.click();
        });
        await sleep(2500);
      } catch {
        // no es critico
      }

      const html = await page.content();
      if (!html || html.length < 400) return null;

      const extra: Record<string, string> = {};
      for (const body of mtopBodies) {
        const popText = extractAliExpressCompliancePopText(body);
        if (popText) {
          extra.aliexpress_compliance = popText;
          break;
        }
      }

      return { html, method: "browser", finalUrl: page.url(), ...(Object.keys(extra).length ? { extra } : {}) };
    } finally {
      await browser.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

// La API mtop.aliexpress.pdp.pc.query devuelve (JSONP) el popup
// "product_compliance_information" con la informacion de conformidad:
// fabricante (nombre/direccion/email/telefono) y responsable en la UE.
function extractAliExpressCompliancePopText(jsonp: string): string | null {
  const m = jsonp.match(/^[^(]+\((.*)\)\s*;?\s*$/s);
  if (!m) return null;
  let json: unknown;
  try {
    json = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const popup = findPopupById(json, "product_compliance_information");
  if (!popup || typeof popup.popText !== "string") return null;
  return popup.popText;
}

function findPopupById(obj: unknown, id: string): { popText?: unknown } | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.popId === "string" && rec.popId === id) return rec as { popText?: unknown };
  for (const key of Object.keys(rec)) {
    const found = findPopupById(rec[key], id);
    if (found) return found;
  }
  return null;
}

function fsExists(p: string): boolean {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    return fs.existsSync(p);
  } catch {
    return false;
  }
}