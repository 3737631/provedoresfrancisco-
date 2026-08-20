import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-helpers";
import { analyzeProductHtml, normalizeAliExpressUrl } from "@/lib/scrape/extractor";
import { store } from "@/lib/store";

export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const CAPTURE_TOKEN = process.env.CAPTURE_TOKEN || "provedores";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let url = "";
  let html = "";
  let token = "";
  try {
    const body = await req.json();
    url = (body.url || "").toString();
    html = (body.html || "").toString();
    token = (body.token || "").toString();
  } catch {
    return fail("Cuerpo invalido");
  }
  if (token !== CAPTURE_TOKEN) {
    return fail("Token de captura invalido", 401);
  }
  if (!url || html.length < 1000) return fail("URL o HTML incompleto");

  const key = normalizeAliExpressUrl(url) || url;
  try {
    await store.saveCapture(key, html);
  } catch {
    // la captura no es critica
  }

  // Re-analizar el HTML capturado (contiene la info de conformidad ya renderizada)
  try {
    const analysis = await analyzeProductHtml(html, url, { method: "draft" });
    return ok(
      {
        ok: true,
        url,
        name: analysis.product.name || null,
        manufacturer_name: analysis.product.manufacturer_name || null,
        manufacturer_email: analysis.product.manufacturer_email || null,
        contacts: analysis.product.contacts || [],
        success: analysis.success,
      },
      { headers: CORS_HEADERS }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: `No se pudo analizar la captura: ${e?.message || "desconocido"}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}