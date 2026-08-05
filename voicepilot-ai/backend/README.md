# backend/

**NestJS + TypeScript.** El Control Plane: API pública, CRM nativo,
autenticación, integraciones, conocimiento, reportes y facturación.

## Responsabilidad

Toda la lógica de negocio y la fuente de verdad transaccional.

## Frontera crítica

> **El backend NUNCA está en el camino del audio.**

Si este servicio se cae, las llamadas activas siguen sonando perfectas. Solo
se deja de guardar información. Esa propiedad es una garantía arquitectónica
([doc 01 §8](../docs/01-arquitectura.md#8-degradación-qué-pasa-cuando-algo-falla))
y cualquier PR que la rompa se rechaza, por útil que parezca.

En la práctica esto significa: el Voice Engine no llama a este servicio
durante la llamada. Recibe su configuración al provisionar la sesión y a
partir de ahí es autónomo.

## Estructura prevista

```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/            JWT, OAuth, SSO, MFA, RBAC
│   │   ├── tenancy/         Contexto de tenant, RLS, aislamiento
│   │   ├── calls/           Ciclo de vida, transcripciones, análisis
│   │   ├── crm/             Contactos, leads, pipeline, notas, tareas, calendario
│   │   ├── knowledge/       Ingesta, chunking, embeddings, versionado
│   │   ├── scripts/         Scripts y reglas de compliance
│   │   ├── integrations/    Adaptadores de CRM, sincronía, DLQ
│   │   ├── realtime/        Hub WebSocket, fan-out desde el bus
│   │   ├── reporting/       Consultas a ClickHouse
│   │   ├── billing/         Medición, cuotas, Stripe
│   │   └── audit/           Log de auditoría
│   ├── common/              Guards, interceptores, filtros, decoradores
│   └── infra/               Prisma/Drizzle, Redis, S3, bus, secretos
├── prisma/                  Esquema y migraciones
└── test/
```

## Reglas de implementación

| Regla | Motivo |
|---|---|
| Un interceptor inyecta `tenant_id` en **toda** consulta | No se confía en que el desarrollador lo recuerde |
| Cada transacción hace `SET LOCAL app.tenant_id` | Activa RLS. Sin él, cero filas — falla cerrado |
| Los endpoints se declaran con esquema (Zod) y generan OpenAPI | La documentación no puede desincronizarse del código |
| `POST` que crean recursos exigen `Idempotency-Key` | Los reintentos de red no deben duplicar |
| Escrituras a CRM externo siempre vía `sync_operations` | Cola, reintentos, DLQ, idempotencia |
| Los logs no contienen PII ni transcripciones | Verificado por linter en CI |
| Acceso a recurso de otro tenant → **404**, no 403 | No se revela la existencia de recursos ajenos |

## Lo que NO va aquí

- Procesamiento de audio o de modelos de IA (eso es `ai-services/`)
- Estado de llamada en vivo — vive en Redis y en el Voice Engine
- Consultas de dashboard contra PostgreSQL — van a ClickHouse

## Estado

No implementado. Empieza en Fase 1, módulo 1.1 ([roadmap](../docs/10-roadmap.md)).
