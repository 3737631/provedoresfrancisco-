import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente de servicio (service role) sin cookies.
// Se usa para operaciones administrativas desde el servidor.
type ServiceClient = ReturnType<typeof createSupabaseClient>;

let client: ServiceClient | null = null;

export async function getServiceClient(): Promise<ServiceClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY para el modo nube."
    );
  }
  if (!client) client = createSupabaseClient(url, key);
  return client;
}