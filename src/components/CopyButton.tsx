"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible */
    }
  }

  return (
    <button
      onClick={copy}
      className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
        copied
          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
          : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300"
      }`}
    >
      {copied ? "✓ Copiado" : label}
    </button>
  );
}