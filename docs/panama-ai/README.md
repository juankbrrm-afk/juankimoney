# Panama AI — Documentación de Arquitectura

> Estado: **Fase de diseño.** No hay código de producto todavía — por decisión explícita, primero
> se congela la arquitectura completa y luego se construye módulo por módulo.

**Panama AI** (nombre temporal, alias "Visit Panama AI") es el asistente turístico con
inteligencia artificial que se convertirá en la capa oficial de turismo inteligente de Panamá,
diseñado desde el día uno para replicarse país por país (Costa Rica, Colombia, México, República
Dominicana, ...).

No es un chatbot pegado a una guía turística. Es una plataforma de datos (POIs verificados,
disponibilidad, precios) con un concierge de IA como interfaz principal, un marketplace de
negocios turísticos como motor de monetización, y una capa B2B/B2G (hoteles, municipios,
aeropuertos) como canal de distribución y defensibilidad a largo plazo.

## Cómo leer esta documentación

Los documentos están numerados en el orden en que un equipo de ingeniería los necesitaría para
empezar a construir, no en el orden en que se piensan como negocio. Léelos en orden si es tu
primera pasada; úsalos como referencia independiente después.

| # | Documento | Contenido |
|---|-----------|-----------|
| — | [`overview.md`](./overview.md) | Visión, tesis de producto, posicionamiento, modelo de negocio |
| 1 | [`01-arquitectura.md`](./01-arquitectura.md) | Arquitectura de sistema, multi-tenant multipaís, monorepo, infraestructura |
| 2 | [`02-estructura-carpetas.md`](./02-estructura-carpetas.md) | Estructura de carpetas del monorepo |
| 3 | [`03-base-de-datos.md`](./03-base-de-datos.md) | Esquema PostgreSQL/Supabase, RLS, pgvector |
| 4 | [`04-apis.md`](./04-apis.md) | APIs internas, integraciones externas, API B2B/B2G |
| 5 | [`05-componentes-ui.md`](./05-componentes-ui.md) | Sistema de diseño y componentes |
| 6 | [`06-sistema-ia.md`](./06-sistema-ia.md) | Arquitectura del motor de IA (concierge, RAG, tools) |
| 7 | [`07-diseno-ux-ui.md`](./07-diseno-ux-ui.md) | Principios de diseño, flujos, pantallas clave |
| 8 | [`08-roadmap.md`](./08-roadmap.md) | Roadmap de producto y expansión multipaís |
| 9 | [`09-mvp.md`](./09-mvp.md) | Alcance exacto del MVP |
| 10 | [`10-fases-desarrollo.md`](./10-fases-desarrollo.md) | Fases de construcción, criterios de salida por fase |

## Decisiones ya tomadas (no reabrir sin razón nueva)

1. **Monorepo con Turborepo**, no microservicios. A este tamaño de equipo, la velocidad de
   iteración importa más que el aislamiento de servicios.
2. **Supabase como backend de datos** (Postgres + Auth + Storage + Realtime + pgvector), no un
   backend custom. Reduce el equipo de plataforma necesario para llegar a Serie A.
3. **País como dimensión de primera clase** en el modelo de datos desde el MVP, aunque el MVP
   solo lance con un país (Panamá). Retrofitear multipaís después es mucho más caro que
   diseñarlo ahora.
4. **Claude como modelo de razonamiento conversacional principal** (tono, tool-calling,
   instrucciones largas de personalidad); OpenAI como modelo secundario para embeddings y
   fallback. Ver [`06-sistema-ia.md`](./06-sistema-ia.md) para el razonamiento completo.
5. **Cero alucinaciones de negocios.** La IA nunca inventa un lugar: todo lo que recomienda tiene
   que existir como fila verificada en la base de datos (RAG obligatorio, no "conocimiento
   general" del modelo para hechos de negocios).
6. Este repositorio (`juankimoney`) contiene actualmente un proyecto no relacionado (una tienda de
   moda de referencia, "MONÉA"). Esta documentación vive en `docs/panama-ai/` como el punto de
   partida del nuevo producto; la recomendación de infraestructura (repo dedicado vs. monorepo
   compartido) se trata en [`01-arquitectura.md`](./01-arquitectura.md#repositorio).

## Próximo paso

Aprobar esta documentación (o marcar qué secciones hay que rediscutir) y luego arrancar por
**Fase 0** en [`10-fases-desarrollo.md`](./10-fases-desarrollo.md).
