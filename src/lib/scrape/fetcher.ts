import { sleep } from "@/lib/utils";

// ============================================================
//  Fetcher robusto con multiples estrategias.
//  No saltamos CAPTCHAs ni anti-bots: si todo falla, devolvemos
//  null y la UI ofrece entrada manual.
// ============================================================

interface FetchResult {
  html: string;
  method: string;
  finalUrl?: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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
    if (html.includes("captcha") || html.includes("verify") || html.includes("Enable JavaScript and cookies")) {
      return null;
    }
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

export async function fetchPage(url: string): Promise<FetchResult | null> {
  // 1) Directo
  const direct = await tryDirect(url);
  if (direct) return direct;

  // 2) Vuelta a intentar con espera (algunos sitios bloquean la 1a request)
  await sleep(1200);
  const direct2 = await tryDirect(url);
  if (direct2) return direct2;

  // 3) Jina Reader (proxy de lectura publica)
  const jina = await tryJina(url);
  if (jina) return jina;

  // 4) Sin .com -> probar via texto con googleusercontent cache? no: devolvemos null
  return null;
}