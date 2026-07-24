-- Panama AI — esquema núcleo: geografía, taxonomía, negocios y lugares.
-- Ver docs/panama-ai/03-base-de-datos.md para el diseño completo.
--
-- Nota de implementación: donde el diseño dice "geo point" se representa aquí como
-- latitude/longitude double precision (no PostGIS) para mantener el MVP sin una
-- extensión adicional; migrar a `geography(Point,4326)` con PostGIS es directo cuando
-- se necesiten queries de radio reales (hoy "cercanía" se resuelve en aplicación).

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────────────────
-- Geografía y taxonomía
-- ─────────────────────────────────────────────────────────────────────────

create table countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,              -- 'PA', 'CR', 'CO'...
  name text not null,
  default_locale text not null default 'es',
  currency text not null default 'USD',
  timezone text not null default 'America/Panama',
  ai_persona_config jsonb not null default '{}'::jsonb,
  launched_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table cities (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete cascade,
  name text not null,
  slug text not null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  unique (country_id, slug)
);

create table zones (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (city_id, slug)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id) on delete set null,
  slug text not null unique,
  name jsonb not null,                    -- i18n: {"es": "...", "en": "..."}
  icon text,
  kind text not null check (kind in (
    'restaurant','rooftop','beach','hotel','tour','nightlife','museum','family'
  )),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- Identidad — extiende auth.users (Supabase Auth)
-- ─────────────────────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'traveler' check (role in ('traveler','business_owner','staff','admin')),
  full_name text,
  avatar_url text,
  locale text default 'es',
  home_country text,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- Negocios y lugares — el activo central del producto
-- ─────────────────────────────────────────────────────────────────────────

create table businesses (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id),
  owner_user_id uuid references auth.users(id) on delete set null,
  legal_name text not null,
  contact_email text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table places (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id),
  city_id uuid not null references cities(id),
  zone_id uuid references zones(id),
  business_id uuid references businesses(id) on delete set null,
  category_id uuid not null references categories(id),
  slug text not null,
  name text not null,
  description jsonb not null default '{}'::jsonb,
  price_level smallint not null default 2 check (price_level between 1 and 4),
  latitude double precision,
  longitude double precision,
  google_place_id text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  featured_until timestamptz,
  avg_rating numeric(2,1) not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_id, slug)
);

create index places_country_status_idx on places (country_id, status);
create index places_category_idx on places (category_id);
create index places_business_idx on places (business_id);

create table place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  storage_path text not null,
  position smallint not null default 0,
  alt_text jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table place_hours (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false
);

create table place_prices (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  label jsonb not null default '{}'::jsonb,
  amount numeric(10,2),
  currency text not null default 'USD'
);

create table place_contacts (
  place_id uuid primary key references places(id) on delete cascade,
  phone text,
  whatsapp text,
  instagram text,
  website text,
  booking_url text
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  body text,
  source text not null default 'internal' check (source in ('internal','google_sync')),
  created_at timestamptz not null default now()
);

create index reviews_place_idx on reviews (place_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────

alter table countries enable row level security;
alter table cities enable row level security;
alter table zones enable row level security;
alter table categories enable row level security;
alter table profiles enable row level security;
alter table businesses enable row level security;
alter table places enable row level security;
alter table place_photos enable row level security;
alter table place_hours enable row level security;
alter table place_prices enable row level security;
alter table place_contacts enable row level security;
alter table reviews enable row level security;

create policy "lectura pública de geografía y taxonomía" on countries for select using (true);
create policy "lectura pública de ciudades" on cities for select using (true);
create policy "lectura pública de zonas" on zones for select using (true);
create policy "lectura pública de categorías" on categories for select using (true);

create policy "un usuario ve y edita su propio perfil" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "staff gestiona perfiles" on profiles
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin')));

create policy "negocios visibles públicamente si verificados" on businesses
  for select using (verified = true);

create policy "el dueño gestiona su negocio" on businesses
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "staff gestiona todos los negocios" on businesses
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin')));

create policy "lugares publicados son visibles por todos" on places
  for select using (status = 'published');

create policy "un negocio edita solo sus propios lugares" on places
  for all using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  ) with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );

create policy "staff gestiona todos los lugares" on places
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin')));

-- Las tablas satélite de `places` (fotos, horarios, precios, contacto, reseñas) heredan
-- la misma regla: lectura pública si el lugar está publicado, escritura solo del dueño o staff.
create policy "lectura pública de fotos de lugares publicados" on place_photos
  for select using (exists (select 1 from places p where p.id = place_id and p.status = 'published'));
create policy "el dueño gestiona fotos de su lugar" on place_photos
  for all using (exists (
    select 1 from places p join businesses b on b.id = p.business_id
    where p.id = place_id and b.owner_user_id = auth.uid()
  ));
create policy "staff gestiona fotos" on place_photos
  for all using (exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role in ('staff','admin')));

create policy "lectura pública de horarios" on place_hours
  for select using (exists (select 1 from places p where p.id = place_id and p.status = 'published'));
create policy "el dueño gestiona horarios de su lugar" on place_hours
  for all using (exists (
    select 1 from places p join businesses b on b.id = p.business_id
    where p.id = place_id and b.owner_user_id = auth.uid()
  ));
create policy "staff gestiona horarios" on place_hours
  for all using (exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role in ('staff','admin')));

create policy "lectura pública de precios" on place_prices
  for select using (exists (select 1 from places p where p.id = place_id and p.status = 'published'));
create policy "el dueño gestiona precios de su lugar" on place_prices
  for all using (exists (
    select 1 from places p join businesses b on b.id = p.business_id
    where p.id = place_id and b.owner_user_id = auth.uid()
  ));
create policy "staff gestiona precios" on place_prices
  for all using (exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role in ('staff','admin')));

create policy "lectura pública de contacto" on place_contacts
  for select using (exists (select 1 from places p where p.id = place_id and p.status = 'published'));
create policy "el dueño gestiona contacto de su lugar" on place_contacts
  for all using (exists (
    select 1 from places p join businesses b on b.id = p.business_id
    where p.id = place_id and b.owner_user_id = auth.uid()
  ));
create policy "staff gestiona contacto" on place_contacts
  for all using (exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role in ('staff','admin')));

create policy "reseñas son públicas" on reviews for select using (true);
create policy "un usuario crea sus propias reseñas" on reviews
  for insert with check (user_id = auth.uid());
create policy "un usuario edita/borra solo su propia reseña" on reviews
  for update using (user_id = auth.uid());
create policy "un usuario borra solo su propia reseña" on reviews
  for delete using (user_id = auth.uid());
