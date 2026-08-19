import { NextResponse } from "next/server";
import { isLocalMode, LOCAL_USER_ID, LOCAL_USER_EMAIL } from "@/lib/config";
import { initStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export type AuthResult =
  | { userId: string; error?: undefined }
  | { userId?: undefined; error: NextResponse };

// Devuelve el id del usuario actual.
//  - Modo local: usuario fijo (LOCAL_USER_ID), sin login.
//  - Modo nube:  usuario autenticado con Supabase Auth.
export async function requireUser(): Promise<AuthResult> {
  if (isLocalMode) {
    return { userId: LOCAL_USER_ID };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  await initStore(async () => supabase);
  return { userId: user.id };
}

// Info del usuario para el layout (email). Nunca en modo local es el fijo.
export async function getCurrentUserInfo(): Promise<{ id: string; email: string | null }> {
  if (isLocalMode) return { id: LOCAL_USER_ID, email: LOCAL_USER_EMAIL };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await initStore(async () => supabase);
  return { id: user?.id ?? LOCAL_USER_ID, email: user?.email ?? null };
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}