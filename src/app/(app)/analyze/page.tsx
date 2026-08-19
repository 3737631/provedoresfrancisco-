"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ManualProductForm from "@/components/ManualProductForm";

type Step = "idle" | "analyzing" | "done" | "manual";

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const router = useRouter();

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setWarning(null);
    setStep("analyzing");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStep("done");
        setError(data.error || "No se pudo analizar el producto.");
        setWarning(
          "Puedes introducir la información manualmente con el formulario de abajo."
        );
        setStep("manual");
        return;
      }

      if (data.success) {
        if (data.email_id) {
          router.push(`/email/${data.email_id}`);
        } else {
          router.push(`/product/${data.product.id}`);
        }
      } else {
        setStep("manual");
        setWarning(
          data.analysis?.warnings?.join(" ") ||
            "No se pudieron extraer los datos. Introdúcelos manualmente."
        );
      }
    } catch {
      setStep("manual");
      setWarning("Error de red. Revisa que el servidor esté funcionando.");
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analizar producto</h1>
        <p className="text-slate-500 text-sm mt-1">
          Pega la URL de un producto de AliExpress y obtén el fabricante, los
          contactos y un mensaje profesional.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="card p-6">
        <label className="label">URL del producto</label>
        <div className="flex gap-3">
          <input
            type="url"
            required
            className="input"
            placeholder="https://es.aliexpress.com/item/1005001234567890.html"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" className="btn-primary whitespace-nowrap" disabled={step === "analyzing"}>
            {step === "analyzing" ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Analizando...
              </span>
            ) : (
              "Analizar producto"
            )}
          </button>
        </div>

        {step === "analyzing" && (
          <div className="mt-4 space-y-2 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
              Descargando página del producto...
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
              Extrayendo fabricante, contactos y precios...
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
              Buscando información pública del fabricante...
            </div>
          </div>
        )}

        {error && <div className="mt-4 text-sm text-rose-600">{error}</div>}
        {warning && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            {warning}
          </div>
        )}
      </form>

      <div className="text-xs text-slate-400">
        Si la página no permite la descarga automática (bloqueo anti-bot), verás un
        formulario para copiar los datos manualmente. La app nunca intenta saltarse
        CAPTCHAs ni sistemas anti-bot.
      </div>

      {step === "manual" && (
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Introducción manual de datos</h2>
          <ManualProductForm initialUrl={url} />
        </div>
      )}
    </div>
  );
}