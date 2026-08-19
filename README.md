# ProveDores

Aplicación web interna para automatizar la búsqueda y el contacto con proveedores para **dropshipping**.

**Flujo:** pegas la URL de un producto de AliExpress → la app extrae fabricante, vendedor, responsable UE, contactos y precios → busca información pública del fabricante → genera un email profesional en inglés (editable) → lo preparas, lo revisas y lo envías (siempre con tu confirmación) → la app detecta las respuestas en tu Gmail, las relaciona con cada proveedor y te sugiere una respuesta.

## Stack

- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS
- **Backend:** Next.js API routes (App Router)
- **Base de datos / Auth:** Supabase (Postgres + Row Level Security + Auth)
- **Email:** Gmail API mediante OAuth 2.0 (tokens cifrados en AES-GCM)
- **Extracción:** sistema multi-estrategia (JSON embebido de AliExpress → meta/HTML → LLM opcional → entrada manual). Nunca salta CAPTCHAs ni anti-bots.

---

## 1. Requisitos previos

- Node.js 18.18 o superior (probado con Node 24)
- Una cuenta de [Supabase](https://supabase.com) (plan Free es suficiente)
- Una cuenta de Google (para el OAuth de Gmail)

---

## 2. Puesta en marcha (paso a paso)

### 2.1 Instalar dependencias

```bash
npm install
```

> En PowerShell de Windows, si `npm` falla por la política de ejecución, usa `npm.cmd`.

### 2.2 Crear el proyecto de Supabase

1. Entra en [supabase.com](https://supabase.com) → **New project**.
2. Crea el proyecto y elige contraseña de BD (la que quieras).
3. Guarda los siguientes valores (Dashboard → **Project Settings → API**):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (¡nunca lo expongas!) → `SUPABASE_SERVICE_ROLE_KEY`

### 2.3 Aplicar el esquema de base de datos

Opción A — en el dashboard de Supabase:

1. Ve a **SQL Editor → New query**.
2. Pega el contenido de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Pulsa **Run**.

Opción B — con la Management API (necesitas `SUPABASE_PROJECT_REF` y un
`SUPABASE_ACCESS_TOKEN` de [access-tokens](https://supabase.com/dashboard/account/tokens)):

```bash
SUPABASE_PROJECT_REF=xxxxxx SUPABASE_ACCESS_TOKEN=sbey_... npm run db:setup
```

### 2.4 Configurar la autenticación (Supabase Auth)

1. En **Authentication → Providers → Email**: deja activado *Email*.
2. En **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000`
   - *Redirect URLs*: `http://localhost:3000/**`
3. (Opcional pero recomendado) en **Authentication → Sign In / Up**:
   desactiva *Confirm email* para poder entrar directamente en local.

### 2.5 Configurar Gmail OAuth

1. Ve a [console.cloud.google.com](https://console.cloud.google.com) → crea un proyecto.
2. **APIs & Services → Library** → busca **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → tipo **External**:
   - Nombre de la app (ej. "ProveDores").
   - Tu email como email de soporte y de desarrollo.
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`,
     `https://www.googleapis.com/auth/gmail.send`,
     `https://www.googleapis.com/auth/gmail.modify`.
   - Test users: añade tu email de Gmail.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**:
   - *Authorized redirect URIs*: `http://localhost:3000/api/gmail/callback`
5. Copia el **Client ID** y el **Client secret**.

### 2.6 Crear `.env.local`

```bash
copy .env.local.example .env.local
```

Rellena estos valores (más detalle en el propio `.env.local.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

ENCRYPTION_KEY=   # genérala con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-secreto
APP_URL=http://localhost:3000
```

Opcionales:

```env
OPENAI_API_KEY=sk-...      # extracción/analisis más precisos (sin él, usa heurística local)
OPENAI_MODEL=gpt-4o-mini
JINA_API_KEY=              # proxy de lectura para páginas bloqueadas
GMAIL_WEBHOOK_TOKEN=       # protege el webhook de Gmail
GMAIL_PUBSUB_TOPIC=        # topic de Pub/Sub para push (avanzado)
```

### 2.7 Arrancar la app

```bash
npm run dev
```

Abre **http://localhost:3000**, regístrate con tu email y empieza.

---

## 3. Cómo se usa

1. **Analizar producto**: pega una URL de AliExpress → *Analizar producto*.
   - Si AliExpress bloquea la descarga, se muestra un formulario manual (la app nunca intenta saltarse CAPTCHAs).
2. **Revisa el análisis**: la página del producto distingue **Fabricante / Vendedor AliExpress / Responsable UE** y muestra los contactos encontrados con su fuente y confianza, más las fuentes públicas localizadas (web, Alibaba, Made-in-China…).
3. **Usar un contacto**: botón *Usar este contacto* → crea el proveedor en el CRM y genera el email profesional (asunto + mensaje en inglés) listo para editar.
4. **Revisión**: edita destinatario/asunto/mensaje. Botones: *Copiar email*, *Copiar mensaje*, *Abrir Gmail*, *Marcar como enviado*, y *Enviar con Gmail* (pide confirmación explícita; nunca envía solo).
5. **CRM**: estados `pendiente → contactado → respondido → negociando → aceptado / rechazado`, notas, próxima revisión.
6. **Gmail**: en *Ajustes* conecta tu cuenta con OAuth. La app lee únicamente los emails necesarios para detectar respuestas de tus proveedores y los relaciona automáticamente. *Respuestas* muestra resumen, clasificación (aceptan dropshipping, dan precio/MOQ, piden más info, rechazan, quieren negociar…) y una respuesta sugerida que puedes editar/copiar o convertir en borrador — nunca se envía sola.

> **Nota de seguridad:** los tokens de Gmail se guardan **cifrados** (AES-GCM) en Supabase. No se almacenan contraseñas. Las claves solo viven en `.env.local` (servidor).

---

## 4. Detección de respuestas (opciones)

La app sincroniza Gmail de dos formas:

- **Manual**: botón *Sincronizar ahora* en la página Respuestas (y al abrir el panel).
- **Automática (push)**: conecta un topic de Google Cloud Pub/Sub y apunta suscripción a
  `https://TU-DOMINIO/api/gmail/webhook`. Requiere desplegar en un servidor con URL pública.
  Sin URL pública, la sincronización manual es suficiente.

---

## 5. Comandos

```bash
npm run dev         # desarrollo (http://localhost:3000)
npm run build       # build de producción
npm run start       # servir el build
npm run typecheck   # comprobar tipos de TypeScript
npm run test        # smoke tests de la lógica (parser, email, análisis)
npm run db:setup    # aplicar el schema con la Management API
```

---

## 6. Estructura

```
supabase/migrations/0001_init.sql   # schema completo (tablas + RLS + triggers)
src/lib/
  scrape/           # fetcher multi-estrategia, parser AliExpress, parser genérico,
                    # búsqueda de fabricante, enriquecimiento LLM, orquestador
  email/            # generador de mensaje, análisis de respuestas
  gmail/            # OAuth2, operaciones Gmail, sincronización
  supabase/         # clientes browser/server/admin, middleware de sesión
  crypto.ts         # cifrado AES-GCM de tokens
src/app/
  (app)/            # panel, analizar, producto, revisión de email, CRM, respuestas, ajustes
  api/              # /analyze, /products, /suppliers, /emails, /responses,
                    # /notifications, /dashboard, /gmail/{auth,callback,status,sync,webhook}
  login/
```

---

## 7. Solución de problemas

| Problema | Solución |
|---|---|
| `Faltan NEXT_PUBLIC_SUPABASE_URL...` | Crea `.env.local` a partir de `.env.local.example` y reinicia el dev server. |
| El login da error de confirmación | Desactiva *Confirm email* en Authentication → Sign In/Up. |
| No aparecen las tablas | Aplica `supabase/migrations/0001_init.sql` en el SQL Editor. |
| Gmail dice "no configurado" | Rellena `GOOGLE_CLIENT_ID/SECRET` y `APP_URL`; reinicia. |
| "Aplicación bloqueada / error 403" de Google | En OAuth consent screen, añade tu email a *Test users*. |
| El envío con Gmail falla | Verifica los scopes del consent screen y que tu email esté en Test users. |
| Página de AliExpress no se analiza | Bloqueo anti-bot. Usa el formulario manual (o añade `JINA_API_KEY`). |