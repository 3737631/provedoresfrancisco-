"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/StatCard";
import type { DashboardStats } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function DashboardClient() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-slate-500">Cargando panel...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Panel principal</h1>
          <p className="text-slate-500 text-sm">
            Resumen de tu búsqueda de proveedores.
          </p>
        </div>
        <Link href="/analyze" className="btn-primary">
          Analizar nuevo producto
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Productos analizados"
          value={stats?.products ?? 0}
          color="brand"
        />
        <StatCard
          label="Contactos encontrados"
          value={stats?.contacts ?? 0}
          color="slate"
        />
        <StatCard
          label="Emails preparados"
          value={stats?.emails ?? 0}
          color="brand"
        />
        <StatCard
          label="Emails enviados"
          value={stats?.emailed ?? 0}
          color="amber"
        />
        <StatCard
          label="Respuestas pendientes"
          value={stats?.pendingResponses ?? 0}
          color="rose"
        />
        <StatCard
          label="Han respondido"
          value={stats?.responded ?? 0}
          color="emerald"
        />
      </div>

      {(stats?.byStatus && Object.keys(stats.byStatus).length > 0) && (
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Proveedores por estado</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <button
                key={status}
                onClick={() => router.push("/crm")}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm hover:border-brand-500 hover:text-brand-700"
              >
                {status} <span className="font-bold">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stats && stats.pendingResponses > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="font-medium text-amber-800">
              {stats.pendingResponses} respuesta{stats.pendingResponses > 1 ? "s" : ""}{" "}
              por revisar
            </div>
            <div className="text-sm text-amber-700">
              Un proveedor puede haber respondido. Revisa sus respuestas.
            </div>
          </div>
          <Link href="/responses" className="btn-secondary">
            Ver respuestas
          </Link>
        </div>
      )}

      {stats && stats.notifications.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Notificaciones recientes</h2>
          {stats.notifications.map((n: any) => (
            <div key={n.id} className="card p-4">
              <div className="font-medium">{n.body}</div>
              <div className="text-xs text-slate-400">
                {new Date(n.created_at).toLocaleString("es-ES")}
              </div>
            </div>
          ))}
        </div>
      )}

      {stats?.products === 0 && (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-lg font-semibold mb-2">
            Empieza pegando una URL de AliExpress
          </h2>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Analiza un producto para obtener su fabricante, contactos y un mensaje
            profesional listo para enviar.
          </p>
          <Link href="/analyze" className="btn-primary">
            Analizar mi primer producto
          </Link>
        </div>
      )}
    </div>
  );
}