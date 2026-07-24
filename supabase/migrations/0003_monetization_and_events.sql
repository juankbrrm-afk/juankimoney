-- Panama AI — monetización (planes, destacados, publicidad), reservas y eventos.
-- Ver docs/panama-ai/03-base-de-datos.md#monetización y
-- docs/panama-ai/04-apis.md#43-pagos-yappy--paguelofacil (Yappy + PagueloFacil, no Stripe).

create table country_pricing_config (
  country_id uuid not null references countries(id),
  plan_code text not null,               -- coincide con business_plans.code
  price_monthly numeric(10,2) not null,
  currency text not null default 'USD',
  primary key (country_id, plan_code)
);

create table business_plans (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id),
  code text not null check (code in ('free','pro','premium')),
  price_monthly numeric(10,2) not null default 0,
  currency text not null default 'USD',
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (country_id, code)
);

create table business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id uuid not null references business_plans(id),
  payment_provider text check (payment_provider in ('yappy','paguelofacil')),
  payment_reference text,
  status text not null default 'active' check (status in ('active','past_due','cancelled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  place_id uuid references places(id) on delete set null,
  placement text not null check (placement in ('itinerary_suggestion','search_results','category_banner')),
  budget numeric(10,2) not null default 0,
  spent numeric(10,2) not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id),
  place_id uuid references places(id) on delete set null,
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz,
  ticket_url text,
  is_free boolean not null default false,
  created_at timestamptz not null default now()
);

create index events_country_starts_idx on events (country_id, starts_at);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id),
  user_id uuid references auth.users(id) on delete set null,
  itinerary_item_id uuid references itinerary_items(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','completed')),
  party_size smallint not null default 1,
  scheduled_for timestamptz,
  amount numeric(10,2),
  currency text not null default 'USD',
  payment_provider text check (payment_provider in ('yappy','paguelofacil')),
  payment_reference text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded','failed')),
  commission_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index bookings_place_status_idx on bookings (place_id, status);
create index bookings_user_idx on bookings (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table country_pricing_config enable row level security;
alter table business_plans enable row level security;
alter table business_subscriptions enable row level security;
alter table ad_campaigns enable row level security;
alter table events enable row level security;
alter table bookings enable row level security;

create policy "planes y precios son públicos" on country_pricing_config for select using (true);
create policy "planes de negocio son públicos" on business_plans for select using (true);

create policy "un negocio ve su propia suscripción" on business_subscriptions
  for select using (exists (
    select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid()
  ));
create policy "staff gestiona suscripciones" on business_subscriptions
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin')));

create policy "un negocio gestiona sus propias campañas" on ad_campaigns
  for all using (exists (
    select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid()
  ));
create policy "staff gestiona campañas" on ad_campaigns
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin')));

create policy "eventos son públicos" on events for select using (true);
create policy "staff gestiona eventos" on events
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin')));

create policy "un usuario ve sus propias reservas" on bookings
  for select using (user_id = auth.uid());
create policy "un usuario crea sus propias reservas" on bookings
  for insert with check (user_id = auth.uid());
create policy "el negocio ve reservas de sus lugares" on bookings
  for select using (exists (
    select 1 from places p join businesses b on b.id = p.business_id
    where p.id = place_id and b.owner_user_id = auth.uid()
  ));
create policy "staff gestiona todas las reservas" on bookings
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin')));
