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

const typeBadge: Record<string, string> = {
  fabricante: "bg-indigo-100 text-indigo-700",
  proveedor: "bg-emerald-100 text-emerald-700",
  vendedor: "bg-amber-100 text-amber-700",
  eu_responsible: "bg-sky-100 text-sky-700",
};

export default function ProductView({ product, contacts, sources }: Props) {
  const router = useRouter();
  const [usingId, setUsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(e.message || "Error al usar el contacto");
      setUsingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera del producto */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full md:w-48 h-48 object-contain rounded-lg border border-slate-200 bg-white"
            />
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold">{product.name || "Sin nombre"}</h1>
            <div className="flex flex-wrap gap-2 mt-3 text-xs">
              <span className="badge bg-slate-100 text-slate-600">
                ID: {product.product_id || "No encontrado"}
              </span>
              <span className="badge bg-slate-100 text-slate-600">
                Método: {product.extraction_method || "—"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 text-sm">
              <Info label="Precio" value={product.price} notFound="No encontrado" />
              <Info label="Moneda" value={product.currency} notFound="—" />
              <Info label="Envío" value={product.shipping_info} notFound="No encontrado" />
              <Info label="URL" value={product.url} notFound="—" url />
            </div>

            {Array.isArray(product.variants) && product.variants.length > 0 && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">
                  Variantes
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {product.variants.slice(0, 12).map((v: any, i: number) => (
                    <span key={i} className="badge bg-slate-50 border border-slate-200 text-slate-600">
                      {v.name || v.price || "—"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quién es quién */}
      <div className="card p-6">
        <h2 className="font-semibold mb-4">Identificación de partes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RoleBox
            role="Fabricante"
            desc="Quien fabrica el producto"
            value={product.manufacturer_name}
            extra={[product.manufacturer_address, product.manufacturer_email, product.manufacturer_phone]}
            color="border-indigo-200"
          />
          <RoleBox
            role="Vendedor AliExpress"
            desc="Tienda donde compras"
            value={product.seller_name}
            extra={[product.seller_store_url]}
            color="border-amber-200"
          />
          <RoleBox
            role="Responsable en la UE"
            desc="Representante legal en Europa"
            value={product.eu_responsible}
            extra={[]}
            color="border-sky-200"
          />
        </div>
      </div>

      {/* Contactos encontrados */}
      <div className="card p-6">
        <h2 className="font-semibold mb-1">Contactos encontrados</h2>
        <p className="text-sm text-slate-500 mb-4">
          Selecciona el contacto con el que quieras trabajar. La app preparará un
          mensaje profesional automáticamente.
        </p>

        {contacts.length === 0 && (
          <div className="text-sm text-slate-400 py-4">
            No se encontraron contactos en esta página.
          </div>
        )}

        <div className="space-y-3">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {c.company || c.email || "Contacto sin nombre"}
                  </span>
                  <span className={`badge ${typeBadge[c.contact_type] || "bg-slate-100 text-slate-600"}`}>
                    {typeLabel[c.contact_type] || c.contact_type}
                  </span>
                  {c.confidence && (
                    <span className={`badge ${
                      c.confidence === "alta"
                        ? "bg-emerald-50 text-emerald-700"
                        : c.confidence === "media"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      Confianza {c.confidence}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500 mt-1 space-x-3">
                  {c.email && <span>✉ {c.email}</span>}
                  {c.phone && <span>☎ {c.phone}</span>}
                  {c.website && <span className="text-brand-600">{c.website}</span>}
                </div>
                {c.source && (
                  <div className="text-xs text-slate-400 mt-1">Fuente: {c.source}</div>
                )}
              </div>
              <button
                onClick={() => useContact(c)}
                disabled={usingId === c.id}
                className="btn-primary"
              >
                {usingId === c.id ? "Preparando..." : "Usar este contacto"}
              </button>
            </div>
          ))}
        </div>

        {error && <div className="text-sm text-rose-600 mt-3">{error}</div>}
      </div>

      {/* Fuentes públicas del fabricante */}
      {sources.length > 0 && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1">
            Fuentes públicas del fabricante
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Información adicional encontrada para que puedas comprobarla antes de
            contactar.
          </p>
          <div className="space-y-2">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-slate-200 rounded-lg p-3 hover:border-brand-500 hover:bg-brand-50/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-brand-700">{s.title || s.url}</span>
                  <span className="badge bg-slate-100 text-slate-500">{s.kind}</span>
                </div>
                {s.snippet && (
                  <div className="text-sm text-slate-500 mt-1 line-clamp-2">{s.snippet}</div>
                )}
                {s.email && <div className="text-xs text-emerald-600 mt-1">✉ {s.email}</div>}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <a href={product.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
          Ver producto original
        </a>
        <a href="/analyze" className="btn-secondary">
          Analizar otro producto
        </a>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  notFound,
  url = false,
}: {
  label: string;
  value?: string | null;
  notFound: string;
  url?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
        {label}
      </div>
      {value ? (
        url ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-brand-600 text-sm break-all">
            {value}
          </a>
        ) : (
          <div className="text-sm break-words">{value}</div>
        )
      ) : (
        <div className="text-sm text-slate-300">{notFound}</div>
      )}
    </div>
  );
}

function RoleBox({
  role,
  desc,
  value,
  extra,
  color,
}: {
  role: string;
  desc: string;
  value?: string | null;
  extra: Array<string | null | undefined>;
  color: string;
}) {
  const shown = [value, ...extra].filter(Boolean);
  return (
    <div className={`border rounded-xl p-4 ${color}`}>
      <div className="font-medium">{role}</div>
      <div className="text-xs text-slate-400 mb-2">{desc}</div>
      {shown.length ? (
        shown.map((s, i) => (
          <div key={i} className="text-sm text-slate-600 break-words">
            {s}
          </div>
        ))
      ) : (
        <div className="text-sm text-slate-300">No encontrado</div>
      )}
    </div>
  );
}