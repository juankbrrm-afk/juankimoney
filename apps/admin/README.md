# Panama AI — `apps/admin`

Dashboard interno mínimo descrito en `docs/panama-ai/09-mvp.md` ("CRUD interno de lugares/categorías
para el equipo de contenido"). CRUD real de negocios, protegido por contraseña única.

## Autenticación — stopgap, no el modelo final

El panel exige `ADMIN_PASSWORD` (`middleware.ts` + `lib/auth.ts`, cookie httpOnly firmada con
HMAC/Web Crypto, sesión de 7 días). **Fail-closed**: sin esa variable configurada, ninguna ruta
carga — redirige a `/setup-required` con instrucciones, en vez de quedar abierta por defecto.
Verificado con un navegador real (Playwright), no solo revisado: contraseña incorrecta rechazada,
contraseña correcta setea la cookie y da acceso, cerrar sesión la borra y `/negocios` vuelve a
pedir login.

Esto **no es multiusuario ni tiene auditoría por persona** — es la barrera mínima para dejar de
estar completamente abierto. El modelo real sigue siendo Supabase Auth + el rol `staff`/`admin` de
`profiles` (RLS ya escrita en `supabase/migrations/0001_core_schema.sql`, política "staff gestiona
todos los lugares" — el backend ya está listo, falta conectar el frontend).

## Correr en local

```bash
cd apps/admin
npm install
echo "ADMIN_PASSWORD=elige-algo" > .env.local
npm run dev   # sirve en :3001 para no chocar con apps/web en :3000
```

## Qué funciona ya

- `/negocios` — listado, crear, editar y eliminar negocios (Server Actions reales, no mock de UI).
- `/categorias` — vista de conteo por categoría (categorías son un catálogo fijo en este corte).
- Persistencia en `/data/places.json` (raíz del repo, ver `/data/README.md`) vía `lib/store.ts` —
  **mismo archivo que lee `apps/web` en cada request**: un negocio editado o borrado aquí aparece
  de inmediato en lo que recomienda el concierge, sin reiniciar nada. Verificado en vivo (no solo
  revisado): con ambas apps corriendo, crear un lugar desde acá y consultarlo desde
  `apps/web/api/chat` en el mismo minuto.

## Pendiente

1. Conectar a Supabase real: reemplazar `lib/store.ts` por queries al cliente de Supabase —
   la firma de las funciones (`listPlaces`, `getPlace`, `createPlace`, `updatePlace`, `deletePlace`)
   ya está pensada para que el cambio sea solo de implementación, no de los call sites.
2. Reemplazar el gate de `ADMIN_PASSWORD` por Supabase Auth + rol `staff`/`admin` multiusuario
   (ver advertencia arriba) — bloqueante para cualquier deploy con más de una persona en el equipo.
3. Categorías como tabla editable (hoy es el enum fijo de `lib/types.ts`).
4. Subida de fotos a Supabase Storage (hoy el campo "Foto" es solo una ruta/URL de texto).
5. Vistas de `/eventos`, `/usuarios`, `/publicidad`, `/destacados`, `/analitica` de
   `docs/panama-ai/overview.md` — este corte solo cubre negocios y categorías.
