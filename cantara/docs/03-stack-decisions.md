# Decisiones de stack

Cada elección, con su alternativa descartada y el motivo.

| Área | Elegido | Descartado | Motivo |
|---|---|---|---|
| Monorepo | npm workspaces | Turborepo, Nx | El repo ya usa npm. Cinco paquetes no justifican un orquestador ni su caché; añadirlo sería complejidad sin beneficio |
| Lenguaje | TypeScript estricto en todo | JS, Python en backend | Un solo lenguaje comparte los contratos Zod entre navegador, API y worker. Un cambio de tipo rompe la compilación en los tres a la vez, que es exactamente lo que se quiere |
| Frontend | Next.js 15 (App Router) + React 19 | Vite SPA, Remix | El historial y el panel se benefician de renderizado en servidor; las rutas de estudio son interactivas y usan client components. Streaming SSR hace que el dashboard pinte antes de que respondan las consultas |
| Estilos | Tailwind v4 | CSS Modules, styled-components | Tokens de diseño en CSS puro (`@theme`), cero runtime, y la app es responsive por defecto |
| Componentes | Propios sobre Radix primitives | Librería completa (MUI) | El brief pide diseño distintivo. Radix aporta accesibilidad (foco, ARIA, teclado) sin imponer estética |
| API | Fastify 5 | Express, NestJS | Express no valida ni tipa; NestJS impone decoradores y DI para un servicio de ~15 rutas. Fastify da validación por esquema, hooks y velocidad sin ceremonia |
| Validación | Zod | class-validator, Joi | Un esquema produce el tipo TS *y* la validación en runtime, compartido entre frontend y backend |
| ORM | Prisma | Drizzle, SQL crudo | Migraciones versionadas, transacciones tipadas (críticas para el ledger de créditos) y buen tooling |
| Base de datos | PostgreSQL 16 | MySQL, Mongo | Transacciones fuertes para los créditos, `jsonb` para metadatos de proveedor, enums nativos |
| Colas | BullMQ + Redis | SQS, pg-boss, Temporal | Progreso por etapa nativo, reintentos con backoff, prioridades y una UI. SQS obligaría a infra AWS; Temporal es correcto pero desproporcionado aquí |
| Progreso en vivo | SSE | WebSockets, polling | El flujo es unidireccional servidor→cliente. SSE reconecta solo, atraviesa proxies y no necesita servidor con estado. WebSockets sería capacidad no usada |
| Almacenamiento | S3 API (MinIO en local, R2 en prod) | Disco local, Postgres bytea | Los workers son efímeros y replicables; el audio necesita almacén compartido y URLs prefirmadas. R2 no cobra egreso, que domina el coste al descargar canciones |
| Auth | Sesiones propias + argon2id | Auth.js, Clerk, Auth0 | Una API sin navegador (`apps/api`) más un frontend separado encaja mal con Auth.js. Clerk/Auth0 añaden dependencia externa y coste por un flujo email+contraseña. ~200 líneas propias, auditables, sin proveedor |
| Hash | argon2id (`@node-rs/argon2`) | bcrypt | Ganador de la PHC, resistente a GPU, binding Rust sin compilación nativa |
| Audio | ffmpeg (prod) + fallback JS puro | Solo ffmpeg | ffmpeg no está garantizado en todas las máquinas ni en CI. El fallback hace que el proyecto arranque siempre; se detecta al inicio |
| Tests | Node test runner + Testing Library | Jest, Vitest | Node 22 trae runner nativo: cero dependencias de test en backend. Los tests de pipeline corren contra el proveedor `local` |
| Contenedores | Docker Compose (dev), imágenes por app (prod) | Todo en uno | Cada app despliega y escala por separado |

## Lo que deliberadamente no está

- **Pasarela de pago.** Los créditos están completamente modelados (ledger,
  reserva, reembolso, paquetes) y hay un `PaymentProvider` con adaptador manual.
  Conectar Stripe es implementar un adaptador y un webhook. No se incluye
  integración real porque requiere credenciales y cuenta verificada.
- **Verificación de email por SMTP.** El modelo tiene `emailVerifiedAt` y el
  flujo de tokens; falta el proveedor de correo, también tras un puerto.

Ambos están señalados en el código con el puerto ya definido, no como TODO
suelto: el hueco tiene forma y contrato.
