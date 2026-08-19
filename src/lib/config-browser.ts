// Configuracion segura para el navegador (sin imports de Node).
export const isLocalMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;