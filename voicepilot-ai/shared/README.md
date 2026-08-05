# shared/

**La única fuente de verdad de los contratos entre superficies.**

Esta carpeta es la razón por la que el proyecto es un monorepo
([ADR-001](../docs/08-decisiones-tecnologia.md)). El acoplamiento real entre
frontend, backend, ai-services y extensión no está en el código: está en los
contratos. Aquí viven, una sola vez.

## Estructura prevista

```
shared/
├── proto/               Definiciones gRPC entre Rust, Python y TypeScript
│   ├── voice.proto      ✅ CONSTRUIDO — VoiceProcessor, AudioFrame, ProcessedFrame
│   ├── transcribe.proto
│   └── copilot.proto
├── crm/                 ✅ CONSTRUIDO — modelo canónico, contrato de adaptador,
│   ├── src/                motor de mapeo, cola de sync idempotente
│   ├── test/               41 tests, cero dependencias
│   └── providers/          ReadyMode como primer objetivo
├── schemas/
│   ├── openapi.yaml     Contrato de la API pública (fuente, no derivado)
│   └── events/          Esquemas de eventos del bus y del WebSocket
├── types/               Tipos TypeScript generados + compartidos
├── ui/                  Componentes compartidos frontend ↔ extensión
│   ├── copilot/         Panel de sugerencias — la misma pieza en ambas
│   ├── transcript/
│   └── primitives/
├── constants/           Códigos de error, permisos, taxonomías, enums
└── i18n/                Cadenas ES/EN
```

## Reglas

| Regla | Motivo |
|---|---|
| Un cambio de contrato es **un solo commit atómico** que actualiza a todos los consumidores | En repos separados esto son 4 PRs coordinados y una ventana de incompatibilidad |
| Los tipos y clientes se **generan**, no se escriben a mano | Un cliente escrito a mano se desincroniza y falla en producción |
| Los códigos de error se definen aquí, una vez | Un error que el frontend no sabe mostrar es un error que el usuario no entiende |
| Los cambios incompatibles requieren versión nueva | Ver política de versionado en [doc 04](../docs/04-apis.md) |
| **Sin lógica de negocio aquí** | Es una carpeta de contratos, no un cajón de utilidades compartidas |

Esa última regla es la que más se viola en la práctica. Una carpeta `shared/`
sin disciplina se convierte en un basurero de funciones que nadie sabe quién
usa. El criterio para admitir algo aquí es simple: **¿lo necesitan dos
superficies distintas para hablarse?** Si no, no entra.

## Estado

Parcialmente implementado:

- ✅ `proto/voice.proto` — contrato Media ↔ Intelligence, consumido por
  `media/voice-engine/src/remote.rs`
- ✅ `crm/` — modelo canónico, adaptadores y cola de sync, 41 tests
- Pendiente: `openapi.yaml`, esquemas de eventos, `ui/`, `i18n/`
