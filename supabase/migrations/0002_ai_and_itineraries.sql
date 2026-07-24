-- Panama AI — capa de IA (RAG) e itinerarios.
-- Ver docs/panama-ai/03-base-de-datos.md y docs/panama-ai/06-sistema-ia.md.

create table place_embeddings (
  place_id uuid primary key references places(id) on delete cascade,
  embedding vector(1536) not null,        -- text-embedding-3-small de OpenAI
  content_hash text not null,             -- detecta cuándo re-embeder tras una edición
  updated_at timestamptz not null default now()
);

-- índice de similitud coseno para la búsqueda semántica de search_places
create index place_embeddings_ivfflat_idx on place_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  country_id uuid not null references countries(id),
  locale text not null default 'es',
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);

create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  travel_style jsonb not null default '{}'::jsonb,   -- {"budget":"mid","kids":true,"pace":"relaxed"}
  favorite_categories uuid[] not null default '{}',
  dietary_restrictions text[] not null default '{}'
);

create table itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  country_id uuid not null references countries(id),
  title text not null default 'Mi viaje a Panamá',
  start_date date,
  end_date date,
  share_token text not null unique default encode(gen_random_bytes(8), 'hex'),
  created_at timestamptz not null default now()
);

create table itinerary_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references itineraries(id) on delete cascade,
  place_id uuid not null references places(id),
  day smallint not null default 1,
  start_time time,
  position smallint not null default 0,
  notes text
);

create index itinerary_items_itinerary_idx on itinerary_items (itinerary_id, day, position);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table place_embeddings enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table user_preferences enable row level security;
alter table itineraries enable row level security;
alter table itinerary_items enable row level security;

-- place_embeddings nunca se expone directo al cliente; solo el orquestador de IA
-- (rol service_role, que bypassa RLS) lo consulta.
create policy "solo staff lee embeddings directamente" on place_embeddings
  for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin')));

create policy "el dueño de la conversación la ve" on conversations
  for select using (user_id = auth.uid() or user_id is null);
create policy "cualquiera crea una conversación (incluye anónimos vía service role)" on conversations
  for insert with check (true);

create policy "el dueño de la conversación ve sus mensajes" on messages
  for select using (exists (
    select 1 from conversations c where c.id = conversation_id and (c.user_id = auth.uid() or c.user_id is null)
  ));
create policy "insertar mensajes de una conversación propia" on messages
  for insert with check (exists (
    select 1 from conversations c where c.id = conversation_id and (c.user_id = auth.uid() or c.user_id is null)
  ));

create policy "un usuario gestiona sus propias preferencias" on user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "itinerarios visibles por su dueño o vía share_token" on itineraries
  for select using (user_id = auth.uid() or user_id is null);
create policy "cualquiera crea un itinerario (con o sin cuenta)" on itineraries
  for insert with check (true);
create policy "el dueño edita su itinerario" on itineraries
  for update using (user_id = auth.uid());

create policy "ver ítems de un itinerario visible" on itinerary_items
  for select using (exists (
    select 1 from itineraries i where i.id = itinerary_id and (i.user_id = auth.uid() or i.user_id is null)
  ));
create policy "editar ítems de un itinerario propio" on itinerary_items
  for all using (exists (
    select 1 from itineraries i where i.id = itinerary_id and i.user_id = auth.uid()
  ));
