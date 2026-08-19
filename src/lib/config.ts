import path from "node:path";

// ============================================================
//  Configuracion de la app (solo servidor).
//  - MODO LOCAL:  sin Supabase (base de datos SQLite local).
//    Activo cuando NO existen NEXT_PUBLIC_SUPABASE_URL.
//    Perfecto para probar sin crear cuentas.
//  - MODO NUBE:   con Supabase (auth + Postgres).
// ============================================================

export { isLocalMode } from "./config-browser";

export const LOCAL_USER_ID = "local-user";
export const LOCAL_USER_EMAIL = "local@provedores.local";

export const LOCAL_DB_PATH =
  process.env.LOCAL_DB_PATH || path.join(process.cwd(), "data", "app.db");