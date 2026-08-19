-- ============================================================
--  ProveDores - Esquema de base de datos (Supabase/Postgres)
--  Ejecuta este archivo en Supabase > SQL Editor
-- ============================================================

-- Toggle para actualizaciones automaticas de updated_at
create extension if not exists "moddatetime" with schema extensions;

-- ------------------------------------------------------------
-- Profiles (extiende auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- trigger para crear el profile al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- Products (productos de AliExpress analizados)
-- ------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  product_id text,
  name text,
  image_url text,
  seller_name text,
  seller_store_url text,
  manufacturer_name text,
  manufacturer_address text,
  manufacturer_email text,
  manufacturer_phone text,
  eu_responsible text,
  price text,
  currency text,
  variants jsonb default '[]'::jsonb,
  shipping_info text,
  compliance_contacts jsonb default '[]'::jsonb,
  raw_analysis jsonb default '{}'::jsonb,
  extraction_method text,
  extraction_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_user_idx on public.products (user_id, created_at desc);

alter table public.products enable row level security;

create policy "products_own" on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists products_set_updated on public.products;
create trigger products_set_updated
  before update on public.products
  for each row execute procedure extensions.moddatetime(updated_at);

-- ------------------------------------------------------------
-- Contacts (contactos encontrados por producto)
-- ------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  company text,
  contact_type text not null, -- 'fabricante' | 'proveedor' | 'vendedor' | 'eu_responsible'
  email text,
  website text,
  phone text,
  source text,
  confidence text, -- 'alta' | 'media' | 'baja'
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contacts_product_idx on public.contacts (product_id);
create index if not exists contacts_user_idx on public.contacts (user_id);

alter table public.contacts enable row level security;

create policy "contacts_own" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- ManufacturerSources (info publica encontrada del fabricante)
-- ------------------------------------------------------------
create table if not exists public.manufacturer_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  manufacturer_name text,
  title text,
  url text,
  kind text, -- 'web' | 'email' | 'directorio' | 'alibaba' | 'madeinchina' | 'globalsources' | 'tradewheel' | ...
  snippet text,
  email text,
  created_at timestamptz not null default now()
);

alter table public.manufacturer_sources enable row level security;

create policy "msources_own" on public.manufacturer_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Suppliers (CRM)
-- ------------------------------------------------------------
create type public.supplier_status as enum (
  'pendiente', 'contactado', 'respondido', 'negociando', 'aceptado', 'rechazado'
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  company text,
  product_name text,
  contact_email text,
  contact_type text,
  status public.supplier_status not null default 'pendiente',
  notes text,
  first_contact_date timestamptz,
  last_message text,
  next_follow_up timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_user_idx on public.suppliers (user_id, status);

alter table public.suppliers enable row level security;

create policy "suppliers_own" on public.suppliers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists suppliers_set_updated on public.suppliers;
create trigger suppliers_set_updated
  before update on public.suppliers
  for each row execute procedure extensions.moddatetime(updated_at);

-- ------------------------------------------------------------
-- Emails (emails preparados)
-- ------------------------------------------------------------
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  to_email text,
  subject text,
  body text,
  status text not null default 'draft', -- 'draft' | 'copied' | 'sent'
  gmail_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists emails_user_idx on public.emails (user_id, created_at desc);

alter table public.emails enable row level security;

create policy "emails_own" on public.emails
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists emails_set_updated on public.emails;
create trigger emails_set_updated
  before update on public.emails
  for each row execute procedure extensions.moddatetime(updated_at);

-- ------------------------------------------------------------
-- GmailAccounts (tokens OAuth; encriptados en AES-GCM)
-- ------------------------------------------------------------
create table if not exists public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gmail_user_email text,
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  watch_expiration timestamptz,
  history_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.gmail_accounts enable row level security;

create policy "gmail_own" on public.gmail_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Responses (respuestas de proveedores detectadas en Gmail)
-- ------------------------------------------------------------
create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  gmail_message_id text unique,
  thread_id text,
  from_email text,
  from_name text,
  subject text,
  body text,
  received_at timestamptz,
  summary text,
  classification jsonb default '{}'::jsonb,
  suggested_reply text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists responses_user_idx on public.responses (user_id, created_at desc);

alter table public.responses enable row level security;

create policy "responses_own" on public.responses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Notifications
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, is_read);

alter table public.notifications enable row level security;

create policy "notifications_own" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Manejo de notificaciones de respuestas
-- ------------------------------------------------------------
create or replace function public.notify_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, link)
  values (
    new.user_id,
    'Respuesta recibida',
    coalesce(new.from_name, new.from_email) || ' ha respondido.',
    '/crm'
  );
  return new;
end;
$$;

drop trigger if exists responses_notify on public.responses;
create trigger responses_notify
  after insert on public.responses
  for each row execute procedure public.notify_response();