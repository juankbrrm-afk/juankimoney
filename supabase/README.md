# Supabase — esquema de Panama AI

Migraciones SQL versionadas que implementan el diseño de
[`docs/panama-ai/03-base-de-datos.md`](../docs/panama-ai/03-base-de-datos.md). Verificadas
localmente contra PostgreSQL 16 + pgvector real (no solo revisadas a ojo): las tres migraciones y
`seed.sql` corren limpio de punta a punta, con RLS habilitado en las 24 tablas.

## Archivos

- `migrations/0001_core_schema.sql` — geografía, taxonomía, negocios, lugares, `profiles`.
- `migrations/0002_ai_and_itineraries.sql` — `place_embeddings` (pgvector), conversaciones,
  mensajes, preferencias, itinerarios.
- `migrations/0003_monetization_and_events.sql` — planes, suscripciones, publicidad, eventos,
  reservas (con `payment_provider` genérico para Yappy/PagueloFacil, no Stripe).
- `seed.sql` — el mismo dataset de 12 lugares curados de `apps/web/lib/data/places.ts`, en SQL.

## Cómo aplicar esto a un proyecto Supabase real

Una vez que exista un proyecto en supabase.com (esto sí requiere que ustedes lo creen — no puedo
generar cuentas de terceros):

```bash
npm install -g supabase
supabase link --project-ref <tu-project-ref>
supabase db push          # aplica las migraciones
psql "$(supabase db url)" -f supabase/seed.sql   # o pegar seed.sql en el SQL editor del dashboard
```

Para desarrollo 100% local con Docker (`supabase start`), `config.toml` ya está configurado.

## Cómo se verificaron estas migraciones en este entorno

Este sandbox no tiene Docker funcional para correr el stack local completo de Supabase, así que
se instaló PostgreSQL 16 + `postgresql-16-pgvector` nativos, se creó un esquema `auth` mínimo
(`auth.users`, `auth.uid()`) para simular lo que Supabase provee, y se corrieron las tres
migraciones y el seed con `ON_ERROR_STOP=1` de principio a fin — sin errores, con los 12 lugares
correctamente enlazados a su zona/categoría/contacto y RLS activo en las 24 tablas. Lo que **no**
se pudo probar en este entorno es el comportamiento real de las políticas RLS bajo los roles
`anon`/`authenticated` de Supabase (requieren el stack completo de Auth) — eso hay que validarlo
una vez conectado a un proyecto real, idealmente con un test de integración en Fase 1.
