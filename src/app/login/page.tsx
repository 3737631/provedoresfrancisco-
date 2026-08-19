"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { isLocalMode } from "@/lib/config-browser";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [magic, setMagic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  // Modo local: no hay login, entrar directamente
  useEffect(() => {
    if (isLocalMode) router.replace(next);
  }, [next, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    if (magic) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setError(error.message);
      else setInfo("Te hemos enviado un enlace magico. Revisa tu correo.");
      setLoading(false);
      return;
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push(next);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else {
        setInfo(
          "Cuenta creada. Si tienes la confirmacion de email activada, revisa tu correo antes de entrar."
        );
        setMode("login");
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-600">
            Prove<span className="text-slate-800">Dores</span>
          </h1>
          <p className="text-slate-500 mt-2">
            Busca fabricantes y contacta con proveedores para dropshipping.
          </p>
        </div>

        <div className="card p-6">
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                mode === "login" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                mode === "register" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              Registrarme
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
              />
            </div>

            {!magic && (
              <div>
                <label className="label">Contraseña</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && <div className="text-sm text-rose-600">{error}</div>}
            {info && <div className="text-sm text-emerald-600">{info}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading
                ? "Procesando..."
                : magic
                ? "Enviar enlace mágico"
                : mode === "login"
                ? "Entrar"
                : "Crear cuenta"}
            </button>

            <button
              type="button"
              onClick={() => setMagic(!magic)}
              className="w-full text-center text-sm text-brand-600 hover:underline"
            >
              {magic ? "Usar email y contraseña" : "Entrar con enlace mágico"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Necesitas un proyecto de Supabase configurado. Mira el README para los pasos.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}