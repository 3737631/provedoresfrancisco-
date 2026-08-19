"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Product {
  id: string;
  name: string | null;
  image_url: string | null;
  price: string | null;
  product_id: string | null;
  url: string;
  created_at: string;
  extraction_status: string | null;
}

export default function ProductsList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-slate-500">Cargando productos...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos analizados</h1>
          <p className="text-sm text-slate-500">
            Todos los productos que has analizado.
          </p>
        </div>
        <Link href="/analyze" className="btn-primary">
          Analizar producto
        </Link>
      </div>

      {products.length === 0 && (
        <div className="card p-10 text-center text-slate-400">
          Aún no has analizado ningún producto.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => (
          <Link key={p.id} href={`/product/${p.id}`} className="card overflow-hidden hover:border-brand-500 transition-colors">
            <div className="h-40 bg-white flex items-center justify-center p-3">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name || ""} className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="text-4xl text-slate-200">📦</div>
              )}
            </div>
            <div className="p-4">
              <div className="font-medium text-sm line-clamp-2">{p.name || "Sin nombre"}</div>
              <div className="text-xs text-slate-400 mt-1">
                {p.price ? `${p.price} · ` : ""}
                ID: {p.product_id || "—"}
              </div>
              <div className="text-xs text-slate-400">
                {new Date(p.created_at).toLocaleDateString("es-ES")}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}