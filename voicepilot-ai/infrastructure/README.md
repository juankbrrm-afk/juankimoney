# infrastructure/

**Terraform + Helm + Argo CD.** Todo lo que se despliega, versionado como
código. Nada se configura a mano en una consola web.

## Estructura prevista

```
infrastructure/
├── terraform/
│   ├── modules/
│   │   ├── network/         VPC, subredes, segmentación por plano
│   │   ├── eks/             Clúster + grupos de nodos
│   │   ├── gpu-pool/        Nodos GPU, drivers, taints y tolerations
│   │   ├── media-pool/      Nodos optimizados en red para el SFU
│   │   ├── data/            RDS Postgres, ElastiCache, ClickHouse, Redpanda
│   │   ├── storage/         S3 con clave KMS por tenant
│   │   └── observability/   Prometheus, Grafana, Loki, Tempo
│   └── environments/        dev · staging · prod-us-east · prod-sa-east
├── helm/                    Charts por servicio
├── argocd/                  Aplicaciones y sincronización GitOps
├── ci/                      Pipelines de build, test, evaluación de IA, deploy
└── runbooks/                Qué hacer cuando algo se rompe a las 3 a.m.
```

## Decisiones que condicionan la infraestructura

### Tres grupos de nodos, no uno

| Grupo | Optimizado para | Por qué separado |
|---|---|---|
| **general** | CPU/memoria | Control Plane, workers, jobs |
| **media** | Red y latencia | El SFU no puede competir por CPU con un job de reportes |
| **gpu** | L4 / A10G | Caro. No debe ejecutar nada que no sea inferencia |

### El aprovisionamiento de GPU es por pronóstico, no reactivo

Un pod con GPU tarda minutos en estar listo (arranque + carga de modelo +
calentamiento). Una llamada dura tres minutos. El autoescalado reactivo llega
tarde siempre: para cuando reacciona, el pico pasó y la calidad ya se degradó.

Los call centers tienen horarios rígidos y conocidos. Se pre-aprovisiona
según el calendario de turnos de cada tenant, con un colchón del 25%, y el
autoescalador queda solo como red de seguridad tardía
([ADR-012](../docs/08-decisiones-tecnologia.md)).

### Multi-región desde el diseño, aunque se despliegue una sola al principio

El Media Plane y la GPU deben estar cerca del agente y del punto de
interconexión PSTN. Un salto transatlántico consume más que todo nuestro
presupuesto de latencia ([doc 02](../docs/02-pipeline-voz-tiempo-real.md)).
Meter la región en el diseño desde el día uno cuesta poco; añadirla después
es un refactor de meses.

## Ingeniería del caos, semanal

No es una aspiración: está en el calendario y tiene dueño.

| Experimento | Resultado esperado |
|---|---|
| Matar un pod de GPU con llamadas activas | Bypass automático. **Ninguna llamada se corta** |
| Latencia de +200 ms al Intelligence Plane | Degradación → bypass, con alerta al agente |
| Caer el Control Plane | Las llamadas activas continúan. No se pueden iniciar nuevas |
| Caer Postgres | Llamadas activas intactas. Eventos se encolan |
| Partición de red entre planos | Sin pérdida de audio; reconciliación posterior |

El criterio de éxito de todos es el mismo: **el audio no se corta.**

## Reglas

- Cero cambios manuales en producción. Si no está en Terraform, no existe
- Secretos en el secret manager, jamás en el repositorio (verificado en cada commit)
- Toda alerta apunta a un runbook. Una alerta sin runbook se elimina o se documenta
- Backups con **prueba de restauración mensual** — un backup nunca restaurado
  no es un backup, es una esperanza
- Despliegues progresivos con reversión automática por SLO

## Estado

No implementado. Lo mínimo para Fase 0 (un clúster, un pool de GPU, medición)
se construye en las semanas 1–2 ([roadmap](../docs/10-roadmap.md)).
