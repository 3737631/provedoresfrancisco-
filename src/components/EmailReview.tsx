"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function EmailReview({ emailId }: { emailId: string }) {
  const [email, setEmail] = useState<any>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch(`/api/emails/${emailId}`);
    const data = await res.json();
    if (res.ok && data.email) {
      setEmail(data.email);
      setTo(data.email.to_email || "");
      setSubject(data.email.subject || "");
      setBody(data.email.body || "");
    }
    setLoading(false);
  }, [emailId]);

  useEffect(() => {
    load();
    fetch("/api/gmail/status")
      .then((r) => r.json())
      .then((d) => setGmailConnected(Boolean(d.connected)))
      .catch(() => setGmailConnected(false));
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/emails/${emailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: to, subject, body }),
    });
    const data = await res.json();
    if (res.ok) setMessage({ type: "ok", text: "Guardado" });
    else setMessage({ type: "err", text: data.error || "Error al guardar" });
    setSaving(false);
  }

  async function send() {
    setSending(true);
    setMessage(null);
    const res = await fetch(`/api/emails/${emailId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await res.json();
    setSending(false);
    if (res.ok) {
      setMessage({ type: "ok", text: "Email enviado correctamente." });
      await load();
    } else {
      setMessage({ type: "err", text: data.error || "Error al enviar" });
    }
  }

  function copyAll() {
    const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text);
    setMessage({ type: "ok", text: "Email completo copiado" });
  }

  function copyBody() {
    navigator.clipboard.writeText(body);
    setMessage({ type: "ok", text: "Mensaje copiado" });
  }

  function openGmail() {
    const draft = encodeURIComponent(`${subject}\n\n${body}`);
    window.open(
      `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(
        to || ""
      )}&su=${encodeURIComponent(subject)}&body=${draft}`,
      "_blank"
    );
  }

  if (loading) {
    return <div className="text-sm text-slate-500">Cargando email...</div>;
  }
  if (!email) {
    return <div className="text-sm text-rose-600">Email no encontrado</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Revisar email</h1>
          <p className="text-sm text-slate-500">
            Edita si lo necesitas antes de enviarlo. Nada se envía sin tu
            confirmación.
          </p>
        </div>
        {email.product_id && (
          <Link href={`/product/${email.product_id}`} className="btn-secondary mr-2">
            Ver análisis del producto
          </Link>
        )}
        {email.supplier_id && (
          <Link href={`/crm`} className="btn-secondary">
            Ver en CRM
          </Link>
        )}
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card p-6 space-y-4">
        <div>
          <label className="label">Para</label>
          <input className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Asunto</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Mensaje</label>
          <textarea
            className="input min-h-[420px] font-mono text-xs leading-relaxed"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={save} disabled={saving} className="btn-secondary">
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          <button onClick={copyAll} className="btn-secondary">Copiar email</button>
          <button onClick={copyBody} className="btn-secondary">Copiar mensaje</button>
          <button onClick={openGmail} className="btn-secondary">Abrir Gmail</button>
          <button
            onClick={async () => {
              const res = await fetch(`/api/emails/${emailId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "sent" }),
              });
              if (email.supplier_id) {
                await fetch(`/api/suppliers/${email.supplier_id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: "contactado",
                    first_contact_date: new Date().toISOString(),
                  }),
                });
              }
              setMessage({ type: "ok", text: "Marcado como enviado (manualmente)." });
              await load();
            }}
            className="btn-secondary"
          >
            Marcar como enviado
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-2">Enviar con Gmail</h2>
        {gmailConnected === false && (
          <p className="text-sm text-slate-500">
            No tienes Gmail conectado. Conéctalo en{" "}
            <Link href="/settings" className="text-brand-600 underline">
              Ajustes
            </Link>{" "}
            o usa "Copiar email" y "Abrir Gmail" para enviarlo manualmente.
          </p>
        )}
        {gmailConnected === true && (
          <>
            {!confirmSend && (
              <button onClick={() => setConfirmSend(true)} className="btn-success">
                Enviar ahora (pedirá confirmación)
              </button>
            )}
            {confirmSend && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  ¿Seguro que quieres enviar este email ahora? Esta acción es
                  irreversible.
                </div>
                <div className="flex gap-2">
                  <button onClick={send} disabled={sending} className="btn-danger">
                    {sending ? "Enviando..." : "Sí, enviar ahora"}
                  </button>
                  <button onClick={() => setConfirmSend(false)} className="btn-secondary">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}