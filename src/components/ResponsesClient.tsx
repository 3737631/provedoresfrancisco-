"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ResponseItem {
  id: string;
  supplier_id: string | null;
  from_name: string | null;
  from_email: string;
  subject: string;
  body: string;
  received_at: string;
  summary: string | null;
  classification: Record<string, any> | null;
  suggested_reply: string | null;
  is_read: boolean;
  suppliers?: { company: string | null; product_name: string | null } | null;
}

const flags: Array<{ key: string; label: string }> = [
  { key: "accepts_dropshipping", label: "Aceptan dropshipping" },
  { key: "gives_price", label: "Dan precio" },
  { key: "gives_moq", label: "Dan MOQ" },
  { key: "asks_more_info", label: "Piden más info" },
  { key: "rejects", label: "Rechazo" },
  { key: "wants_negotiate", label: "Quieren negociar" },
];

export default function ResponsesClient() {
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editReply, setEditReply] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/responses");
    const data = await res.json();
    setResponses(data.responses || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setResponses((rs) => rs.map((r) => (r.id === id ? { ...r, is_read: true } : r)));
  }

  async function createReplyDraft(r: ResponseItem, reply: string) {
    const res = await fetch("/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier_id: r.supplier_id,
        to_email: r.from_email,
        subject: `Re: ${r.subject}`,
        body: reply,
        product_id: r.suppliers?.product_name ? null : null,
      }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/email/${data.email.id}`);
  }

  if (loading) return <div className="text-sm text-slate-500">Cargando respuestas...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Respuestas de proveedores</h1>
          <p className="text-sm text-slate-500">
            Respuestas detectadas en tu Gmail y relacionadas con tus proveedores.
          </p>
        </div>
        <button
          onClick={async () => {
            setLoading(true);
            await fetch("/api/gmail/sync", { method: "POST" });
            await load();
          }}
          className="btn-secondary"
        >
          Sincronizar ahora
        </button>
      </div>

      {responses.length === 0 && (
        <div className="card p-10 text-center text-slate-400">
          <div className="text-4xl mb-3">📬</div>
          <p>Sin respuestas detectadas todavía.</p>
          <p className="text-sm mt-1">
            Conecta Gmail en Ajustes y la app relacionará automáticamente las
            respuestas de tus proveedores.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {responses.map((r) => (
          <div key={r.id} className="card p-5">
            <button
              className="w-full text-left"
              onClick={() => {
                setOpenId(openId === r.id ? null : r.id);
                markRead(r.id);
              }}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-semibold">
                    {r.suppliers?.company || r.from_name || r.from_email}
                    {!r.is_read && <span className="ml-2 w-2 h-2 inline-block rounded-full bg-brand-500 align-middle" />}
                  </div>
                  <div className="text-sm text-slate-500">{r.subject}</div>
                </div>
                <div className="text-xs text-slate-400">
                  {new Date(r.received_at).toLocaleString("es-ES")}
                </div>
              </div>
              {r.summary && (
                <div className="text-sm text-slate-600 mt-2 bg-slate-50 rounded-lg px-3 py-2">
                  {r.summary}
                </div>
              )}
              {r.classification && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {flags
                    .filter((f) => r.classification?.[f.key])
                    .map((f) => (
                      <span key={f.key} className="badge bg-emerald-50 text-emerald-700">
                        ✓ {f.label}
                      </span>
                    ))}
                </div>
              )}
            </button>

            {openId === r.id && (
              <div className="mt-4 space-y-4">
                <div className="border border-slate-200 rounded-xl p-4 text-sm whitespace-pre-wrap bg-slate-50 max-h-80 overflow-y-auto">
                  {r.body}
                </div>

                {r.suggested_reply && (
                  <div>
                    <div className="font-medium text-sm mb-2">Respuesta sugerida</div>
                    {editReply === r.id ? (
                      <>
                        <textarea
                          className="input min-h-[200px] font-mono text-xs"
                          value={r.suggested_reply}
                          onChange={(e) =>
                            setResponses((rs) =>
                              rs.map((x) => (x.id === r.id ? { ...x, suggested_reply: e.target.value } : x))
                            )
                          }
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            className="btn-primary text-xs"
                            onClick={() => {
                              navigator.clipboard.writeText(r.suggested_reply || "");
                              setEditReply(null);
                            }}
                          >
                            Copiar y cerrar
                          </button>
                          <button className="btn-secondary text-xs" onClick={() => setEditReply(null)}>
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm text-slate-600 whitespace-pre-wrap bg-white border border-slate-200 rounded-xl p-4">
                          {r.suggested_reply}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="btn-secondary text-xs"
                            onClick={() => navigator.clipboard.writeText(r.suggested_reply || "")}
                          >
                            Copiar respuesta
                          </button>
                          <button className="btn-secondary text-xs" onClick={() => setEditReply(r.id)}>
                            Editar
                          </button>
                          <button
                            className="btn-primary text-xs"
                            onClick={() => createReplyDraft(r, r.suggested_reply || "")}
                          >
                            Crear email de respuesta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-xs text-slate-400">
                  De: {r.from_email}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}