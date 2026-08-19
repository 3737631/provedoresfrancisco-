"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PrepareSupplierEmail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/emails/prepare-from-supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: params.id }),
      });
      const data = await res.json();
      if (cancelled) return;
      if (res.ok && data.email?.id) {
        router.replace(`/email/${data.email.id}`);
      } else {
        setError(data.error || "No se pudo preparar el email");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  if (error) {
    return (
      <div className="text-sm text-rose-600">
        {error}
        <button onClick={() => router.push("/crm")} className="ml-3 btn-secondary text-xs">
          Volver al CRM
        </button>
      </div>
    );
  }
  return <div className="text-sm text-slate-500">Preparando email...</div>;
}