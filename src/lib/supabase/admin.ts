import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de servidor que usa la SERVICE ROLE KEY para operaciones
// que requieren elevacion de privilegios (p.ej. encriptar tokens).
// SOLO se importa desde codigo que se ejecuta en el servidor.
export async function createServiceClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}