# Dataset compartido de desarrollo

`places.json` es la única fuente de datos de lugares que usan **tanto** `apps/web` (el
concierge) **como** `apps/admin` (el dashboard) mientras no hay un proyecto Supabase real — ver
docs/panama-ai/03-base-de-datos.md. Antes vivía duplicado en cada app; se unificó aquí para que
editar un negocio en `apps/admin` se refleje de inmediato en lo que recomienda el concierge de
`apps/web`, sin reiniciar nada (ambas apps leen el archivo del disco en cada request).

Cuando se conecte Supabase real (Fase 1-2, ver `docs/panama-ai/10-fases-desarrollo.md`), este
archivo se reemplaza por `supabase/seed.sql` como fuente de verdad y este directorio deja de
usarse en tiempo de ejecución.
