import * as cheerio from "cheerio";
import type { ExtractedProduct } from "@/lib/types";
import { cleanText, extractEmails, extractPhones, extractUrls } from "@/lib/utils";

// ============================================================
//  Parser generico para cualquier pagina (web de fabricante,
//  Alibaba, Made-in-China, directorios B2B, ...).
// ============================================================

interface CompanyHints {
  emails: string[];
  phones: string[];
  urls: string[];
  title: string;
  metaDescription: string;
  h1s: string[];
  text: string;
}

function collectHints($: cheerio.CheerioAPI): CompanyHints {
  const emails = extractEmails($("body").text());
  const phones = extractPhones($("body").text());
  const urls = extractUrls($("body").text()).filter(
    (u) => !/\.(jpg|jpeg|png|gif|webp|svg|css|js)$/i.test(u)
  );
  const title = cleanText($("title").first().text());
  const metaDescription = cleanText($('meta[name="description"]').attr("content"));
  const h1s = $("h1")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean);
  const text = cleanText($("body").text()).slice(0, 12000);
  return { emails, phones, urls, title, metaDescription, h1s, text };
}

export interface GenericExtraction {
  title?: string;
  description?: string;
  emails: string[];
  phones: string[];
  urls: string[];
  text?: string;
  company?: string;
}

export function parseGenericPage(html: string, url: string): GenericExtraction {
  const $ = cheerio.load(html);
  const h = collectHints($);
  const out: GenericExtraction = {
    title: h.title || undefined,
    description: h.metaDescription || undefined,
    emails: h.emails,
    phones: h.phones,
    urls: h.urls,
    text: h.text,
  };

  const ogSiteName = cleanText($('meta[property="og:site_name"]').attr("content"));
  const orgName = cleanText($('[itemprop="name"], [itemprop="legalName"]').first().text());
  out.company = h.h1s[0] || ogSiteName || orgName || h.title || undefined;

  return out;
}

export function genericToContacts(
  g: GenericExtraction,
  source: string,
  type: "fabricante" | "proveedor" = "fabricante",
  company?: string
) {
  const contacts = [];
  for (const email of g.emails.slice(0, 3)) {
    contacts.push({
      company: company || g.company,
      contact_type: type,
      email,
      website: g.urls.find((u) => /^https?:\/\//i.test(u)),
      phone: g.phones[0],
      source,
      confidence: "alta" as const,
    });
  }
  return contacts;
}

export function makeProductFromGeneric(url: string, g: GenericExtraction): ExtractedProduct {
  return {
    url,
    name: g.title,
    extraction_method: "generic",
    contacts: genericToContacts(g, "Analisis de pagina web"),
    raw_html: g.text?.slice(0, 6000),
  };
}