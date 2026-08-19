export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

export function extractAliExpressId(url: string): string | null {
  const m = url.match(/item\/(\d+)\.html/i);
  if (m) return m[1];
  const m2 = url.match(/productId=(\d+)/i);
  if (m2) return m2[1];
  const m3 = url.match(/alibaba\.com\/product-detail\/([^/]+)_(\d+)\.html/i);
  if (m3) return m3[2];
  return null;
}

export function isAliExpressUrl(url: string): boolean {
  return /(^|\.)aliexpress\.(com|ru|us)\//i.test(url) || /ali\.pics|ali.pub/i.test(url);
}

export function extractEmails(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return Array.from(new Set(matches)).filter((e) => {
    // filtrar correos de ejemplo/no deseados
    const bad = ["example.com", "sentry", "wixpress", "@2x", "domain.com", "yourdomain", "@sentry.io", "@wix.com"];
    return !bad.some((b) => e.toLowerCase().includes(b));
  });
}

export function extractPhones(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\+?\d{1,4}[\s\-.]?\(?\d{2,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{2,9}/g) || [];
  return Array.from(new Set(matches)).slice(0, 5);
}

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s"'<>)\]]+/g) || [];
  return Array.from(new Set(matches));
}

export function cleanText(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\s+/g, " ").trim();
}

export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean);
    return seg[seg.length - 1]?.replace(/\.html?$/i, "").replace(/[-_]/g, " ") || u.hostname;
  } catch {
    return url;
  }
}