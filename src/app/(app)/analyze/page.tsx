"use client";

import { useState, useEffect } from "react";
import CopyButton from "@/components/CopyButton";

interface MarketResult {
  competition: "baja" | "media" | "alta";
  competitorCount: number;
  marketplaces: string[];
  retailPriceRange: string;
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
  error?: string;
}

const CONTACT_LABEL: Record<string, string> = {
  fabricante: "Fabricante",
  proveedor: "Proveedor",
  vendedor: "Vendedor",
  eu_responsible: "Responsable UE",
};

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Boton de captura (bookmarklet): se pincha en la barra de marcadores, se abre
  // el producto de AliExpress delante del cliente y el boton envia el HTML
  // (cargado con la IP del usuario, sin captcha) a esta misma web.
  const bookmarkletHref =
    origin &&
    `javascript:(function(){var u=location.href,h=document.documentElement.outerHTML,o=${JSON.stringify(origin)};fetch(o+"/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:u,html:h})}).then(function(r){return r.json()}).then(function(d){if(d&&d.product&&d.product.id){location.href=o+"/product/"+d.product.id}else{alert("No se pudo extraer el producto")}}).catch(function(){alert("Error de red")})})();`;

  function openProduct() {
    if (!url.trim()) return;
    window.open(url.trim(), "_blank");
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "No se pudo analizar.");
        return;
      }
      if (!d.success) {
        setError(
          d.analysis?.warnings?.join(" ") || "No se pudo extraer el producto."
        );
        return;
      }
      setData(d);
    } catch {
      setError("Error de red. Revisa que el servidor esté funcionando.");
    } finally {
      setLoading(false);
    }
  }

  const a = data?.analysis;
  const email = data?.email;
  const market = data?.market;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold">AliExpress</h1>
        <p className="text-slate-500 mt-1">
          Pega el enlace del producto y te doy qué es, el contacto del fabricante,
          un mensaje listo para copiar y el beneficio estimado.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="card p-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            required
            className="input flex-1"
            placeholder="https://es.aliexpress.com/item/1005001234567890.html"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary whitespace-nowrap justify-center"
            disabled={loading}
          >
            {loading ? "Analizando…" : "Analizar"}
          </button>
          <button
            type="button"
            onClick={openProduct}
            disabled={!url.trim()}
            className="btn whitespace-nowrap justify-center"
          >
            Abrir producto
          </button>
        </div>
        {loading && (
          <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
            <span className="w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            Buscando el producto y calculando beneficios (tarda ~1 min)…
          </div>
        )}
        {error && <div className="mt-4 text-sm text-rose-600">{error}</div>}
      </form>

      {bookmarkletHref && (
        <section className="card p-5 bg-brand-50 border-brand-200">
          <h2 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Botón de captura (cuando AliExpress bloquea el análisis)
          </h2>
          <p className="text-sm text-slate-600">
            Añade este botón a la barra de marcadores de tu navegador (arrástralo o
            pínchalo con el botón derecho). Abre el producto de AliExpress delante
            del cliente y pulsa el botón: te abre aquí mismo el análisis con sus
            datos.
          </p>
          <a
            href={bookmarkletHref}
            className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
          >
            ⭐ Capturar producto
          </a>
        </section>
      )}

      {a && (
        <div className="space-y-5">
          {/* QUE ES */}
          <section className="card p-5">
            <h2 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">
              Qué es
            </h2>
            <div className="flex gap-4">
              {a.image_url && (
                <img
                  src={a.image_url}
                  alt={a.name}
                  className="w-24 h-24 object-contain rounded-lg border border-slate-200 bg-white shrink-0"
                />
              )}
              <div className="min-w-0">
                <div className="font-semibold leading-snug">{a.name}</div>
                <div className="flex flex-wrap gap-2 mt-2 text-sm">
                  {a.price && (
                    <span className="badge bg-emerald-50 text-emerald-700 text-base font-bold">
                      {a.price}
                    </span>
                  )}
                  {a.seller_name && (
                    <span className="badge bg-slate-100 text-slate-600">
                      Vendido por {a.seller_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* CONTACTO */}
          <section className="bg-brand-600 rounded-2xl p-6 text-white shadow-sm">
            <h2 className="text-xs uppercase tracking-wider text-brand-100 font-semibold mb-3">
              Contacto del fabricante
            </h2>
            {(a.contacts || []).filter((c) => c.email).length > 0 ? (
              <div className="space-y-3">
                {(a.contacts || [])
                  .filter((c) => c.email)
                  .slice(0, 2)
                  .map((c, i) => (
                    <div key={i} className="bg-white rounded-xl p-4 text-slate-800">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">
                          {c.company || CONTACT_LABEL[c.contact_type] || "Contacto"}
                        </span>
                        <span className="badge bg-brand-100 text-brand-700">
                          {CONTACT_LABEL[c.contact_type] || c.contact_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className="font-mono text-lg font-bold text-brand-700 break-all">
                          {c.email}
                        </span>
                        <CopyButton text={c.email || ""} label="Copiar email" />
                      </div>
                      {(c.phone || c.address) && (
                        <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                          {c.phone && <span>☎ {c.phone}</span>}
                          {c.address && <span>📍 {c.address}</span>}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="bg-white/10 rounded-xl p-4 text-sm">
                No se encontró email del fabricante.
                {a.seller_name && (
                  <div className="mt-1 font-medium">{a.seller_name} (vía mensaje de AliExpress)</div>
                )}
              </div>
            )}
          </section>

          {/* MENSAJE */}
          {email && (
            <section className="card p-5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Mensaje personalizado
                </h2>
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
                <h2 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Beneficio estimado
                </h2>
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
            </section>
          )}
        </div>
      )}
    </div>
  );
}