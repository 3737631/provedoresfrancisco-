"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, ManufacturerSource } from "@/lib/types";

interface Props {
  product: any;
  contacts: Contact[];
  sources: ManufacturerSource[];
}

const typeLabel: Record<string, string> = {
  fabricante: "Fabricante",
  proveedor: "Proveedor",
  vendedor: "Vendedor",
  eu_responsible: "Responsable UE",
};

export default function ProductView({ product, contacts, sources }: Props) {
  const router = useRouter();
  const [usingId, setUsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El contacto mejor para enviar primero (con email, fabricante/proveedor arriba)
  const ordered = [...contacts].sort((a, b) => {
    const rank = (c: Contact) =>
      (c.email ? 100 : 0) +
      (c.contact_type === "fabricante" || c.contact_type === "proveedor" ? 50 : 0) +
      (c.confidence === "alta" ? 20 : 0);
    return rank(b) - rank(a);
  });

  async function useContact(contact: Contact) {
    setUsingId(contact.id || null);
    setError(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id, product_id: product.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      router.push(`/email/${data.email.id}`);
    } catch (e: any) {
      setError(e.message || "Error al preparar el mensaje");
      setUsingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* ======== CONTACTO ARRIBA DEL TODO ======== */}
      <section className="bg-brand-600 rounded-2xl p-6 text-white shadow-sm">
        <div className="text-xs uppercase tracking-wider text-brand-100 font-semibold mb-1">
          Dónde enviar el mensaje
        </div>
        <h1 className="text-xl font-bold mb-4">
          {product.name || "Producto"}
        </h1>

        {ordered.length === 0 && (
          <div className="bg-white/10 rounded-xl p-4 text-sm text-brand-50">
            No se encontraron contactos.{" "}
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Revisa el producto original
            </a>{" "}
            o añádelo manualmente.
          </div>
        )}

        <div className="space-y-3">
          {ordered.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl p-4 text-slate-800 flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-lg">
                    {c.company || c.email || "Contacto"}
                  </span>
                  <span className="badge bg-brand-100 text-brand-700">
                    {typeLabel[c.contact_type] || c.contact_type}
                  </span>
                </div>
                <div className="text-sm text-slate-500 mt-1 space-x-3 flex flex-wrap">
                  {c.email && (
                    <span className="font-mono text-brand-700 text-base font-semibold">
                      ✉ {c.email}
                    </span>
                  )}
                  {c.phone && <span>☎ {c.phone}</span>}
                  {c.website && (
                    <a
                      href={c.website.startsWith("http") ? c.website : `https:${c.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 underline"
                    >
                      {c.website}
                    </a>
                  )}
                </div>
                {c.source && (
                  <div className="text-xs text-slate-400 mt-1">Fuente: {c.source}</div>
                )}
              </div>
              <button
                onClick={() => useContact(c)}
                disabled={usingId === c.id}
                className="btn-primary whitespace-nowrap"
              >
                {usingId === c.id ? "Preparando..." : "Enviar mensaje"}
              </button>
            </div>
          ))}
        </div>

        {error && <div className="mt-3 text-sm text-amber-200">{error}</div>}
      </section>

      {/* ======== PRODUCTO ======== */}
      <section className="card p-5">
        <div className="flex flex-col md:flex-row gap-5">
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full md:w-36 h-36 object-contain rounded-lg border border-slate-200 bg-white"
            />
          )}
          <div className="flex-1">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="badge bg-slate-100 text-slate-600">
                ID: {product.product_id || "—"}
              </span>
              <span className="badge bg-slate-100 text-slate-600">
                {product.extraction_method || "—"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
              {product.price && (
                <div>
                  <span className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Precio</span>
                  <div className="font-medium">{product.price}</div>
                </div>
              )}
              {product.seller_name && (
                <div>
                  <span className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Vendedor</span>
                  <div className="font-medium">{product.seller_name}</div>
                </div>
              )}
              {product.manufacturer_name && (
                <div>
                  <span className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Fabricante</span>
                  <div className="font-medium">{product.manufacturer_name}</div>
                </div>
              )}
              {product.shipping_info && (
                <div>
                  <span className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Envío</span>
                  <div className="font-medium">{product.shipping_info.slice(0, 140)}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-5">
          <a href={product.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            Ver producto original
          </a>
          <a href="/analyze" className="btn-secondary">
            Analizar otro producto
          </a>
        </div>
      </section>

      {/* ======== FUENTES (búsqueda del fabricante) ======== */}
      {sources.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold mb-1">Dónde buscar al fabricante</h2>
          <p className="text-sm text-slate-500 mb-3">
            Enlaces para encontrar al fabricante real y su email.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-slate-200 rounded-lg p-3 hover:border-brand-500 hover:bg-brand-50/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-brand-700 text-sm truncate">{s.title || s.url}</span>
                  <span className="badge bg-slate-100 text-slate-500 shrink-0">{s.kind}</span>
                </div>
                {s.email && (
                  <div className="text-xs text-emerald-600 mt-1 font-mono">✉ {s.email}</div>
                )}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}