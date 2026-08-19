"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Supplier } from "@/lib/types";

const STATUSES = ["pendiente", "contactado", "respondido", "negociando", "aceptado", "rechazado"] as const;

const statusStyle: Record<string, string> = {
  pendiente: "bg-slate-100 text-slate-600",
  contactado: "bg-brand-100 text-brand-700",
  respondido: "bg-amber-100 text-amber-700",
  negociando: "bg-sky-100 text-sky-700",
  aceptado: "bg-emerald-100 text-emerald-700",
  rechazado: "bg-rose-100 text-rose-700",
};

export default function CrmClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("todos");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/suppliers");
    const data = await res.json();
    setSuppliers(data.suppliers || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function updateSupplier(id: string, fields: Record<string, unknown>) {
    await fetch(`/api/suppliers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    await load();
  }

  const filtered = suppliers.filter((s) =>
    filter === "todos" ? true : s.status === filter
  );

  if (loading) return <div className="text-sm text-slate-500">Cargando CRM...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM de proveedores</h1>
          <p className="text-sm text-slate-500">
            Gestiona el estado de cada contacto y su seguimiento.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          Añadir proveedor
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("todos")}
          className={`px-3 py-1.5 rounded-lg text-sm ${filter === "todos" ? "bg-slate-800 text-white" : "bg-white border border-slate-200"}`}
        >
          Todos ({suppliers.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
              filter === s ? "bg-slate-800 text-white" : "bg-white border border-slate-200"
            }`}
          >
            {s} ({suppliers.filter((x) => x.status === s).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card p-10 text-center text-slate-400">
          No hay proveedores aquí todavía. Analiza un producto y usa un contacto.
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{s.company || "Sin empresa"}</span>
                  <select
                    value={s.status}
                    onChange={(e) => updateSupplier(s.id, { status: e.target.value })}
                    className={`badge cursor-pointer ${statusStyle[s.status]}`}
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  {s.product_name && <span>{s.product_name} · </span>}
                  {s.contact_email && <span>{s.contact_email}</span>}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Primer contacto: {s.first_contact_date ? new Date(s.first_contact_date).toLocaleDateString("es-ES") : "—"}
                  {s.next_follow_up && ` · Próximo seguimiento: ${new Date(s.next_follow_up).toLocaleDateString("es-ES")}`}
                </div>
                {s.notes && <div className="text-sm text-slate-600 mt-2 italic">"{s.notes}"</div>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setEditing(s)}
                  className="btn-secondary text-xs"
                >
                  Detalles
                </button>
                <button
                  onClick={() => router.push(`/crm/${s.id}/email`)}
                  className="btn-secondary text-xs"
                >
                  Preparar email
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditModal
          supplier={editing}
          onClose={() => setEditing(null)}
          onSave={async (fields) => {
            await updateSupplier(editing.id, fields);
            setEditing(null);
          }}
        />
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function EditModal({
  supplier,
  onClose,
  onSave,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSave: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [notes, setNotes] = useState(supplier.notes || "");
  const [nextFollowUp, setNextFollowUp] = useState(
    supplier.next_follow_up ? supplier.next_follow_up.slice(0, 10) : ""
  );
  const [status, setStatus] = useState(supplier.status);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">{supplier.company}</h3>
        <div>
          <label className="label">Estado</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Supplier["status"])}>
            {STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div>
          <label className="label">Próximo seguimiento</label>
          <input type="date" className="input" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={() =>
              onSave({
                notes,
                status,
                next_follow_up: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
              })
            }
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ company: "", product_name: "", contact_email: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/suppliers/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) onDone();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Añadir proveedor</h3>
        <div>
          <label className="label">Empresa</label>
          <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </div>
        <div>
          <label className="label">Producto</label>
          <input className="input" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}