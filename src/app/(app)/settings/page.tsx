"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SettingsClientInner() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();

  const gmailResult = searchParams.get("gmail");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ configured: false, connected: false });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function connect() {
    setBusy(true);
    const res = await fetch("/api/gmail/auth");
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setStatus((s: any) => ({ ...s, error: data.error }));
    setBusy(false);
  }

  if (loading) return <div className="text-sm text-slate-500">Cargando ajustes...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Conecta tu Gmail para detectar respuestas de proveedores.
        </p>
      </div>

      {gmailResult === "ok" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700">
          ¡Gmail conectado correctamente! Ya puedes sincronizar las respuestas.
        </div>
      )}
      {gmailResult === "error" && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
          Hubo un problema conectando Gmail. Inténtalo de nuevo.
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Conexión con Gmail</h2>

        {status?.error && (
          <div className="text-sm text-rose-600 mb-3">{status.error}</div>
        )}

        {!status?.configured && (
          <div className="text-sm text-slate-500">
            Gmail no está configurado en el servidor. Añade{" "}
            <code className="bg-slate-100 px-1 rounded">GOOGLE_CLIENT_ID</code> y{" "}
            <code className="bg-slate-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> a tu{" "}
            <code className="bg-slate-100 px-1 rounded">.env.local</code> y reinicia.
          </div>
        )}

        {status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Conectado como <strong>{status.email}</strong>
            </div>
            <p className="text-sm text-slate-500">
              La app lee solo los emails necesarios para detectar respuestas de tus
              proveedores. Tus contraseñas nunca se guardan: todo usa OAuth y tokens
              encriptados.
            </p>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={connect} disabled={busy}>
                Reconectar
              </button>
            </div>
          </div>
        ) : (
          status?.configured && (
            <button className="btn-primary" onClick={connect} disabled={busy}>
              {busy ? "Redirigiendo a Google..." : "Conectar Gmail con OAuth"}
            </button>
          )
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-2">Notas de seguridad</h2>
        <ul className="text-sm text-slate-500 space-y-1.5 list-disc pl-5">
          <li>Las contraseñas de Gmail nunca se guardan. Se usa OAuth 2.0.</li>
          <li>Los tokens se guardan encriptados (AES-GCM) en la base de datos.</li>
          <li>Las claves de API solo viven en el servidor (.env.local).</li>
          <li>Nada se envía automáticamente: siempre hay confirmación manual.</li>
        </ul>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsClientInner />
    </Suspense>
  );
}