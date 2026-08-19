// Ejecuta el schema de base de datos en Supabase usando la Management API.
// Requiere las variables de entorno:
//   SUPABASE_PROJECT_REF  (el identificador del proyecto, ej: "abcdxyz")
//   SUPABASE_ACCESS_TOKEN (token de acceso de la Management API)
// Uso:  npm run db:setup
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "0001_init.sql"), "utf8");

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !token) {
  console.error("Faltan SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN");
  console.error("Alternativa: pega el contenido de supabase/migrations/0001_init.sql");
  console.error("en Supabase > SQL Editor manualmente.");
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

if (res.ok) {
  console.log("Schema aplicado correctamente.");
} else {
  const text = await res.text();
  console.error("Error al aplicar el schema:", res.status, text.slice(0, 800));
  process.exit(1);
}