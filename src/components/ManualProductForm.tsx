"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ManualProductForm({ initialUrl }: { initialUrl?: string }) {
  const [form, setForm] = useState({
    url: initialUrl || "",
    product_id: "",
    name: "",
    seller_name: "",
    manufacturer_name: "",
    manufacturer_address: "",
    manufacturer_email: "",
    manufacturer_phone: "",
    eu_responsible: "",
    price: "",
    currency: "",
    shipping_info: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        setSaving(false);
        return;
      }
      router.push(`/product/${data.product.id}`);
    } catch {
      setError("Error de red al guardar");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="URL" value={form.url} onChange={set("url")} placeholder="https://..." />
        <Field label="Product ID" value={form.product_id} onChange={set("product_id")} />
        <Field label="Nombre del producto" value={form.name} onChange={set("name")} className="md:col-span-2" />
        <Field label="Vendedor (tienda AliExpress)" value={form.seller_name} onChange={set("seller_name")} />
        <Field label="Fabricante" value={form.manufacturer_name} onChange={set("manufacturer_name")} />
        <Field label="Dirección del fabricante" value={form.manufacturer_address} onChange={set("manufacturer_address")} className="md:col-span-2" />
        <Field label="Email del fabricante" type="email" value={form.manufacturer_email} onChange={set("manufacturer_email")} />
        <Field label="Teléfono" value={form.manufacturer_phone} onChange={set("manufacturer_phone")} />
        <Field label="Responsable en la UE" value={form.eu_responsible} onChange={set("eu_responsible")} />
        <Field label="Precio" value={form.price} onChange={set("price")} />
        <Field label="Moneda" value={form.currency} onChange={set("currency")} placeholder="EUR / USD / CNY" />
        <Field label="Información de envío" value={form.shipping_info} onChange={set("shipping_info")} className="md:col-span-2" />
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? "Guardando..." : "Guardar producto"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <input type={type} className="input" value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}