# frontend/

**Next.js (App Router) + React + TypeScript.** Consola del agente, dashboard
de supervisión, CRM nativo, administración y web pública.

## Responsabilidad

Renderizar. Nada más.

Toda la lógica de negocio vive en `backend/`. El frontend no calcula KPIs,
no decide permisos, no valida reglas de negocio como fuente de verdad. Si una
regla existe solo aquí, es un bug de arquitectura esperando a ser explotado
por alguien con las devtools abiertas.

## Estructura prevista

```
frontend/
├── app/
│   ├── (marketing)/         Web pública
│   ├── (app)/
│   │   ├── console/         Consola del agente — la pantalla crítica
│   │   ├── calls/           Historial y reproductor
│   │   ├── crm/             Leads, contactos, pipeline, tareas, calendario
│   │   ├── dashboard/       Tiempo real + reportes
│   │   ├── knowledge/       Documentos, scripts, reglas de compliance
│   │   └── settings/        Usuarios, roles, integraciones, facturación
├── components/
│   ├── ui/                  Primitivas (re-exporta shared/ui)
│   ├── console/             Transcripción, copilot, señales, compliance
│   ├── crm/
│   └── charts/
├── lib/
│   ├── api/                 Cliente generado desde OpenAPI — no escrito a mano
│   ├── realtime/            WebSocket, reconexión, reanudación por seq
│   └── stores/              Zustand: estado de llamada fuera del árbol de React
└── styles/
```

## Restricciones no negociables

| Restricción | Motivo |
|---|---|
| Los eventos de transcripción **no** entran al estado global de React | 8 eventos/s × 8 h de sesión. Un re-render del árbol por evento es inviable |
| Lista de transcripción **virtualizada** | Una llamada larga son miles de segmentos |
| Presupuesto de render: **< 16 ms/frame** | Verificado con perfilado en CI |
| Sin fugas de memoria en 8 h | Hay un test de resistencia; se ejecuta antes de cada release |
| El cliente de API se **genera** desde OpenAPI | Un cliente escrito a mano se desincroniza y falla en producción |
| Los componentes de copilot viven en `shared/ui` | La extensión de Chrome usa los mismos. Dos copias divergen siempre |

## Lo que NO va aquí

- Claves de API de terceros (ni las "públicas")
- Lógica de permisos como control de seguridad — solo como conveniencia de UI
- Procesamiento de audio: eso es del Media Plane
- Consultas directas a base de datos

## Estado

No implementado. Empieza en Fase 1, módulo 1.3 ([roadmap](../docs/10-roadmap.md)).
