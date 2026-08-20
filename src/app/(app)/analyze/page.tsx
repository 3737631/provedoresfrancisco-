"use client";

import { useState, useEffect } from "react";
import CopyButton from "@/components/CopyButton";

interface Report {
  success: boolean;
  url: string;
  product_id?: string;
  title?: string;
  image_url?: string;
  price?: string;
  currency?: string;
  store?: string;
  seller: { name?: string; email?: string; store_url?: string; confidence: string };
  brand: { name?: string; confidence: string };
  manufacturer: {
    name?: string;
    legal_name?: string;
    email?: string;
    address?: string;
    country?: string;
    phone?: string;
    verified: boolean;
    confidence: string;
  };
  compliance: { available: boolean; source?: string; text?: string; eu_responsible?: string };
  sources: Array<{ type: string; url?: string; title?: string; confidence: string }>;
  warnings: string[];
}

interface MarketResult {
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

interface AnalyzeData {
  analysis: {
    name?: string;
    image_url?: string;
    price?: string;
    seller_name?: string;
    manufacturer_name?: string;
    manufacturer_email?: string;
    manufacturer_phone?: string;
    manufacturer_address?: string;
    contacts?: Array<{
      company?: string;
      contact_type: string;
      email?: string;
      phone?: string;
      address?: string;
      source?: string;
    }>;
  };
  email?: {
    to_email: string | null;
    to_company: string | null;
    subject: string;
    body: string;
  };
  market?: MarketResult | null;
  report?: Report;
  error?: string;
}

const LOADING_STEPS = [
  "Analizando producto...",
  "Buscando información del fabricante...",
  "Verificando datos...",
  "Calculando beneficio...",
];

const SOURCE_LABEL: Record<string, string> = {
  pagina_aliexpress: "Página oficial de AliExpress",
  conformidad_aliexpress: "Información de conformidad (AliExpress)",
  api_producto: "API de datos de producto",
  busqueda_web: "Búsqueda web pública",
  busqueda_fabricante: "Localización del fabricante",
  pagina_web: "Página web del producto",
  captura_navegador: "Captura del navegador",
};

const CONF_STYLE: Record<string, string> = {
  alta: "bg-emerald-50 text-emerald-700 border-emerald-200",
  media: "bg-amber-50 text-amber-700 border-amber-200",
  baja: "bg-slate-100 text-slate-500 border-slate-200",
};

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    brand: "bg-brand-100 text-brand-700",
    rose: "bg-rose-50 text-rose-600",
  };
  return <span className={`badge ${tones[tone] || tones.slate}`}>{children}</span>;
}

function ConfBadge({ c }: { c: string }) {
  const map: Record<string, string> = {
    alta: "Confianza: ALTA",
    media: "Confianza: MEDIA",
    baja: "Confianza: BAJA",
  };
  return (
    <span className={`badge border ${CONF_STYLE[c] || CONF_STYLE.baja}`}>
      {map[c] || "Confianza: —"}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">{children}</div>;
}

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [step, setStep] = useState(0);

  async function run(urlInput: string) {
    if (!urlInput.trim() || loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 5000);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "No se pudo analizar.");
        return;
      }
      if (!d.success) {
        setError(
          d.analysis?.warnings?.join(" ") || d.report?.warnings?.join(" ") || "No se pudo extraer el producto."
        );
        return;
      }
      setData(d);
    } catch {
      setError("Error de red. Revisa que el servidor esté funcionando.");
    } finally {
      setLoading(false);
      clearInterval(timer);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(url);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("url");
    if (q) {
      setUrl(q);
      void run(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const a = data?.analysis;
  const email = data?.email;
  const market = data?.market;
  const report = data?.report;
  const mfg = report?.manufacturer;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold">AliExpress</h1>
        <p className="text-slate-500 mt-1">
          Pega el enlace del producto y pulsa «Buscar proveedor». Te devuelvo el fabricante, el
          vendedor y el beneficio estimado.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            required
            className="input flex-1"
            placeholder="Pega aquí el enlace de AliExpress"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary whitespace-nowrap justify-center text-base px-8"
            disabled={loading}
          >
            {loading ? "Buscando…" : "BUSCAR PROVEEDOR"}
          </button>
        </div>
        {loading && (
          <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
            <span className="w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            {LOADING_STEPS[step]}
          </div>
        )}
        {error && <div className="mt-4 text-sm text-rose-600">{error}</div>}
      </form>

      {a && report && (
        <div className="space-y-5">
          {/* QUE ES */}
          <section className="card p-5">
            <Label>Qué es</Label>
            <div className="flex gap-4">
              {a.image_url && (
                <img
                  src={a.image_url}
                  alt={a.name}
                  className="w-24 h-24 object-contain rounded-lg border border-slate-200 bg-white shrink-0"
                />
              )}
              <div className="min-w-0">
                <div className="font-semibold leading-snug">{report.title || a.name}</div>
                <div className="flex flex-wrap gap-2 mt-2 text-sm">
                  {report.price && (
                    <Badge tone="green">
                      {report.price}
                      {report.currency ? ` ${report.currency}` : ""}
                    </Badge>
                  )}
                  {report.store && <Badge>Tienda: {report.store}</Badge>}
                </div>
              </div>
            </div>
          </section>

          {/* FABRICANTE */}
          <section className="bg-brand-600 rounded-2xl p-6 text-white shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h2 className="text-xs uppercase tracking-wider text-brand-100 font-semibold">
                Fabricante
              </h2>
              <ConfBadge c={mfg?.confidence || "baja"} />
            </div>

            {mfg?.verified || mfg?.name ? (
              <div className="space-y-3">
                {mfg.verified && (
                  <div className="badge bg-white text-emerald-700 font-bold">VERIFICADO ✓</div>
                )}
                {mfg.name && (
                  <div className="bg-white rounded-xl p-4 text-slate-800">
                    <div className="text-sm text-slate-500">Nombre</div>
                    <div className="text-lg font-bold break-words">{mfg.name}</div>
                    {mfg.legal_name && mfg.legal_name !== mfg.name && (
                      <div className="text-xs text-slate-500 mt-1">
                        Nombre legal: {mfg.legal_name}
                      </div>
                    )}
                    {mfg.email && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-brand-700 font-bold break-all">{mfg.email}</span>
                        <CopyButton text={mfg.email} label="Copiar email" />
                      </div>
                    )}
                    {(mfg.address || mfg.country) && (
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                        {mfg.address && <span>📍 {mfg.address}</span>}
                        {mfg.country && <span>🌍 {mfg.country}</span>}
                        {mfg.phone && <span>☎ {mfg.phone}</span>}
                      </div>
                    )}
                  </div>
                )}
                {report.warnings
                  .filter((w) => /verificad/i.test(w))
                  .map((w, i) => (
                    <div key={i} className="text-xs text-white/80">
                      {w}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="bg-white/10 rounded-xl p-4 text-sm space-y-2">
                <div className="font-bold text-white">Fabricante no verificado</div>
                <div className="text-white/90">
                  No se ha podido confirmar quién fabrica este producto con las fuentes
                  disponibles. Lo que sí se encontró:
                </div>
                <ul className="text-white/90 list-disc list-inside space-y-0.5 text-xs">
                  {report.store && <li>Vendedor: {report.store}</li>}
                  {report.brand?.name && <li>Marca: {report.brand.name}</li>}
                  {report.product_id && <li>ID de producto: {report.product_id}</li>}
                  {report.warnings
                    .filter((w) => !/verificad/i.test(w))
                    .map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                </ul>
              </div>
            )}
          </section>

          {/* VENDEDOR */}
          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Label>Vendedor (tienda AliExpress)</Label>
              <ConfBadge c={report.seller.confidence} />
            </div>
            <div className="text-base font-semibold">{report.seller.name || "—"}</div>
            {report.seller.store_url && (
              <a
                href={report.seller.store_url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 text-sm underline break-all"
              >
                {report.seller.store_url}
              </a>
            )}
            {report.seller.email && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-slate-700 break-all">{report.seller.email}</span>
                <CopyButton text={report.seller.email} label="Copiar" />
              </div>
            )}
            <div className="text-xs text-slate-400 mt-1">
              El vendedor es la tienda que vende en AliExpress; puede no ser el fabricante.
            </div>
          </section>

          {/* MARCA */}
          {report.brand?.name && (
            <section className="card p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Label>Marca</Label>
                <ConfBadge c={report.brand.confidence} />
              </div>
              <div className="text-base font-semibold">{report.brand.name}</div>
            </section>
          )}

          {/* CONFORMIDAD */}
          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Label>Información de conformidad</Label>
              {report.compliance.available ? (
                <Badge tone="green">Disponible</Badge>
              ) : (
                <Badge>No disponible</Badge>
              )}
            </div>
            {report.compliance.eu_responsible && (
              <div className="text-sm">
                <span className="text-slate-500">Responsable UE:</span>{" "}
                <span className="font-medium">{report.compliance.eu_responsible}</span>
              </div>
            )}
            {report.compliance.source && (
              <div className="text-xs text-slate-400 mt-1">Fuente: {report.compliance.source}</div>
            )}
            {report.compliance.text && (
              <details className="mt-2">
                <summary className="text-sm text-brand-600 cursor-pointer">Ver detalle</summary>
                <pre className="mt-2 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs leading-relaxed font-sans">
                  {report.compliance.text}
                </pre>
              </details>
            )}
            {!report.compliance.available && (
              <div className="text-xs text-slate-400">
                AliExpress no expone esta información en la página pública para servidores
                (bloqueo anti-bot). El fabricante mostrado arriba, si aparece, proviene de
                otras fuentes públicas.
              </div>
            )}
          </section>

          {/* FUENTES */}
          {report.sources.length > 0 && (
            <section className="card p-5">
              <Label>Fuentes de datos</Label>
              <ul className="space-y-2 text-sm">
                {report.sources.slice(0, 10).map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ConfBadge c={s.confidence} />
                    <div className="min-w-0">
                      <div className="font-medium">
                        {SOURCE_LABEL[s.type] || s.type}
                        {s.title ? ` — ${s.title}` : ""}
                      </div>
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 text-xs underline break-all"
                        >
                          {s.url}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* MENSAJE */}
          {email && (
            <section className="card p-5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <Label>Mensaje personalizado</Label>
                <CopyButton text={email.body} label="Copiar mensaje" />
              </div>
              <div className="text-xs text-slate-500 mb-2">
                Para: {email.to_email || email.to_company || "—"} · Asunto: {email.subject}
              </div>
              <pre className="whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm leading-relaxed font-sans">
                {email.body}
              </pre>
            </section>
          )}

          {/* BENEFICIO */}
          {market && (
            <section className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <Label>Beneficio estimado</Label>
                <span
                  className={`badge text-sm ${
                    market.competition === "alta"
                      ? "bg-rose-50 text-rose-600"
                      : market.competition === "media"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  Competencia {market.competition}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-xs uppercase text-slate-400 font-semibold">Coste (AliExpress)</div>
                  <div className="text-lg font-bold">
                    {market.costPriceEur ? `${market.costPriceEur.toFixed(2)}€` : "—"}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-xs uppercase text-slate-400 font-semibold">Venta estimada</div>
                  <div className="text-lg font-bold">{market.retailPriceRange || "—"}</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-emerald-50/50">
                  <div className="text-xs uppercase text-slate-400 font-semibold">Beneficio por unidad</div>
                  <div className="text-lg font-bold text-emerald-700">
                    {market.marginEur !== null ? `${market.marginEur.toFixed(2)}€` : "—"}
                    {market.marginPct !== null && (
                      <span className="text-sm text-emerald-600"> ({market.marginPct}%)</span>
                    )}
                  </div>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {market.notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-brand-500 shrink-0">•</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>

              {!market.retailPriceEur && report.title && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">
                    No lo encontró a la venta: búscalo tú para ver el valor:
                  </span>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(report.title + " buy")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn text-sm px-3 py-1.5"
                  >
                    Buscar en Google
                  </a>
                  <a
                    href={`https://www.bing.com/search?q=${encodeURIComponent(report.title + " site:myshopify.com OR /products/")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn text-sm px-3 py-1.5"
                  >
                    Buscar en Shopify
                  </a>
                  <a
                    href={`https://www.amazon.es/s?k=${encodeURIComponent(report.title)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn text-sm px-3 py-1.5"
                  >
                    Amazon
                  </a>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}