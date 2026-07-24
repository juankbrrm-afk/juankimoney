# Panama AI — `apps/admin`

Dashboard interno mínimo descrito en `docs/panama-ai/09-mvp.md` ("CRUD interno de lugares/categorías
para el equipo de contenido"). CRUD real de negocios, sin autenticación todavía.

## ⚠️ No exponer públicamente tal cual

Este panel **no tiene autenticación**. Cualquiera con la URL puede editar/borrar negocios. Es
seguro correrlo solo en `localhost` o detrás de un túnel privado mientras se desarrolla. Antes de
desplegarlo en cualquier URL accesible desde internet hay que conectar Supabase Auth + el chequeo
de rol `staff`/`admin` de `profiles` (ver RLS de `docs/panama-ai/03-base-de-datos.md` y la política
"staff gestiona todos los lugares" ya escrita en `supabase/migrations/0001_core_schema.sql` — el
backend ya está listo para esto, falta conectar el frontend).

## Correr en local

```bash
cd apps/admin
npm install
npm run dev   # sirve en :3001 para no chocar con apps/web en :3000
```

## Qué funciona ya

- `/negocios` — listado, crear, editar y eliminar negocios (Server Actions reales, no mock de UI).
- `/categorias` — vista de conteo por categoría (categorías son un catálogo fijo en este corte).
- Persistencia en `data/places.json` vía `lib/store.ts` — mismo dataset que usa `apps/web` para el
  modo demo del chat, pero **es una copia independiente**: editar aquí no cambia lo que ve el
  concierge en `apps/web` todavía. Eso se resuelve migrando ambos a Supabase (ver Pendiente abajo).

## Pendiente

1. Conectar a Supabase real: reemplazar `lib/store.ts` por queries al cliente de Supabase —
   la firma de las funciones (`listPlaces`, `getPlace`, `createPlace`, `updatePlace`, `deletePlace`)
   ya está pensada para que el cambio sea solo de implementación, no de los call sites.
2. Auth + rol `staff`/`admin` (ver advertencia arriba) — bloqueante para cualquier deploy real.
3. Categorías como tabla editable (hoy es el enum fijo de `lib/types.ts`).
4. Subida de fotos a Supabase Storage (hoy no hay campo de imagen).
5. Vistas de `/eventos`, `/usuarios`, `/publicidad`, `/destacados`, `/analitica` de
   `docs/panama-ai/overview.md` — este corte solo cubre negocios y categorías.
