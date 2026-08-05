# 08 — Decisiones de tecnología (ADRs)

> **Advertencia de vigencia.** Las capacidades y precios de los proveedores de
> IA y voz cambian cada trimestre. Las decisiones que dependen de un
> proveedor concreto (ADR-004, 005, 006, 011) deben **re-validarse con
> benchmarks propios** antes de firmar cualquier contrato. Lo que no cambia es
> el criterio de decisión, que es lo que este documento fija.

Formato: cada decisión declara contexto, opciones reales, elección y — lo más
importante — **cuándo revertirla**.

---

## ADR-001 — Monorepo con separación estricta de planos

**Contexto.** Siete superficies de despliegue (frontend, backend,
ai-services, extensión, shared, infra, docs) en tres lenguajes.

**Opciones.** (a) Repos separados. (b) Monorepo.

**Decisión: monorepo**, con `shared/` como única fuente de contratos
(tipos TypeScript, `.proto`, esquemas de eventos, códigos de error).

**Por qué.** El acoplamiento real está en los contratos, no en el código. Un
cambio en el evento `suggestion` toca backend, frontend y extensión a la vez.
En repos separados eso son cuatro PRs coordinados y una ventana de
incompatibilidad. En monorepo es un commit atómico verificado por CI.

**Cuándo revertir.** Si el equipo supera ~40 ingenieros y los tiempos de CI
pasan de 15 minutos aun con caché y builds afectados.

---

## ADR-002 — Tres lenguajes: Rust, Python, TypeScript

**Contexto.** El sistema tiene requisitos irreconciliables por plano.

**Decisión.**

| Plano | Lenguaje | Por qué **este** |
|---|---|---|
| Media Plane (Voice Engine) | **Rust** | Sin recolector de basura. Una pausa de GC de 40 ms en un pipeline de audio de 20 ms es un fallo audible. Rust da control de memoria sin las trampas de C++, y su ecosistema de audio y gRPC está maduro |
| Intelligence Plane | **Python** | Es donde vive todo el ecosistema de ML. Pelear contra eso es perder. El GIL importa poco porque el trabajo real está en GPU y en I/O `asyncio` |
| Control Plane | **TypeScript / NestJS** | Tipos compartidos con el frontend vía `shared/`. Un solo lenguaje para el 70% del código de negocio. Velocidad de desarrollo, que es el recurso escaso |

**Alternativa descartada: Go para todo el backend.** Go es excelente y sería
más rápido que Node en el Control Plane. Se descarta porque romper los tipos
compartidos entre backend y frontend nos cuesta más en bugs de integración de
lo que ganamos en latencia — y el Control Plane no es el cuello de botella
de latencia del sistema.

**Cuándo revertir.** Si el Control Plane pasa a ser cuello de botella medido
(no supuesto), se extraen los servicios calientes a Go, uno a uno.

---

## ADR-003 — LiveKit como servidor de medios

**Contexto.** Necesitamos SFU WebRTC + puente SIP + capacidad de inyectar
procesamiento por servidor en el camino del audio.

**Opciones.**

| Opción | Ventaja | Por qué no |
|---|---|---|
| **mediasoup** | Máximo control, muy eficiente | Hay que construir el puente SIP, la señalización, la escalabilidad y las grabaciones desde cero. Meses |
| **Janus / Asterisk / FreeSWITCH** | Telefonía madura, batalla probada | Ergonomía de desarrollo de otra era; integrar IA moderna es doloroso |
| **Twilio / Vonage gestionado** | Cero operación | No dan acceso al camino de medios con la latencia que necesitamos. Nos amarran a su precio por minuto. **Descartado por arquitectura, no por costo** |
| **LiveKit** | SFU + SIP + agentes en un solo sistema, open source, auto-hospedable | Menos maduro que Asterisk en telefonía pura |

**Decisión: LiveKit auto-hospedado**, con el `Voice Engine` propio como
participante del room que intercepta y sustituye la pista del agente.

**Por qué.** Es el único que resuelve WebRTC, SIP y procesamiento por
servidor con una sola operación, y al ser open source podemos auto-hospedarlo
en la región que necesitemos, junto a las GPU — que es un requisito duro del
presupuesto de latencia ([doc 02](02-pipeline-voz-tiempo-real.md)).

**Cuándo revertir.** Si el puente SIP no aguanta la carga de un call center
real (probar con 500 sesiones concurrentes en Fase 0), se sustituye esa pieza
por FreeSWITCH manteniendo LiveKit para WebRTC.

**Riesgo aceptado.** Dependencia de un proyecto relativamente joven en la
ruta más crítica. Se mitiga: versión fijada, fork interno con parches, y
pruebas de carga propias antes de cada actualización.

---

## ADR-004 — Speech-to-Speech directo para el Modo A (no cascada)

Ya justificado en detalle en [doc 02 §4](02-pipeline-voz-tiempo-real.md#la-decisión-arquitectónica-clave).

**Decisión: modelo de conversión de voz de streaming, auto-hospedado en GPU.**

**Por qué no una API comercial de voz.** Ninguna API de conversión de voz por
red puede cumplir 300 ms boca-a-oído: solo el ida y vuelta HTTP a otra región
consume la mitad del presupuesto. Además, la conversión de voz es **nuestro
foso**; subcontratarlo es subcontratar el producto.

**Cuándo revertir.** Si aparece una API con SLA de latencia < 100 ms
desplegable en nuestra VPC y calidad superior a nuestro modelo, se compra. La
capa `VoiceProcessor` ([doc 04 §5](04-apis.md)) hace ese cambio transparente.

---

## ADR-005 — ASR comercial en streaming (comprar, no construir)

**Contexto.** Necesitamos transcripción en vivo, español e inglés, con
acentos latinos, en audio telefónico de 8 kHz.

**Decisión: proveedor comercial de ASR en streaming, con capa de abstracción
y un segundo proveedor como failover.** Whisper auto-hospedado como
alternativa de costo para el procesamiento por lotes, no para tiempo real.

**Por qué.** El ASR es un problema resuelto y con competencia feroz: los
precios bajan cada año y la calidad sube. Construir el nuestro sería quemar
seis meses de equipo en una commodity. **Nuestro foso es la conversión de voz
y el copilot anclado, no la transcripción.**

**Criterios de selección (a medir, no a asumir):**
1. Latencia de token final en audio telefónico
2. WER en inglés con acento latino — nuestro caso, no el promedio del
   benchmark del proveedor
3. Soporte real de código-mezclado ES/EN (los agentes mezclan idiomas)
4. Precio por minuto en streaming
5. Posibilidad de despliegue en nuestra VPC (requisito para clientes
   enterprise con datos regulados)

**Cuándo revertir.** Cuando el volumen haga que el ASR auto-hospedado en las
GPU que ya tenemos (para conversión de voz) salga más barato que la API —
el cálculo está en [doc 11](11-unit-economics.md).

---

## ADR-006 — TTS de streaming con la latencia como criterio principal

Aplica solo al Modo B.

**Decisión: proveedor de TTS optimizado para *time-to-first-byte*, no para
calidad máxima**, con streaming de entrada incremental de texto.

**Por qué.** En el Modo B el presupuesto de TTS es de ~120 ms. Un modelo con
mejor calidad y 400 ms de TTFB destruye la conversación. En una llamada
telefónica, el ancho de banda es de 8 kHz: la diferencia de calidad entre un
TTS excelente y uno muy bueno **se pierde en el codec**. La latencia no.

**Requisito duro:** el proveedor debe soportar entrada de texto incremental
manteniendo la prosodia entre trozos. Un TTS que solo acepta frases completas
es inservible para nosotros.

---

## ADR-007 — PostgreSQL como base transaccional única

**Decisión: PostgreSQL 16+**, con `pgvector` para embeddings, particionado
nativo para llamadas y auditoría, y RLS para aislamiento de tenant.

**Por qué una sola base y no varias especializadas.** Una startup con un
Postgres bien usado va más rápido que una con seis bases de datos "óptimas" y
nadie que sepa operarlas todas. Postgres nos da hoy: relacional, JSONB,
búsqueda de texto, vectores, particionado y seguridad a nivel de fila.

**Por qué pgvector y no una base vectorial dedicada.** Nuestros vectores son
del orden de cientos de miles por tenant, no de mil millones. HNSW en
pgvector sobra para ese tamaño, y nos ahorra un sistema entero que sincronizar
y en el que replicar el aislamiento de tenant. **Un filtro `tenant_id` en un
`JOIN` de SQL es más difícil de equivocar que en un servicio externo** — y una
fuga de conocimiento entre tenants sería el peor incidente posible.

**Cuándo revertir.** Si un tenant supera ~5M de chunks o la latencia p95 de
recuperación supera 150 ms, se extrae la búsqueda vectorial a Qdrant.

---

## ADR-008 — ClickHouse para analítica, separado de la OLTP

**Contexto.** El dashboard de piso pide agregados sobre millones de llamadas,
en tiempo real, con refresco constante.

**Decisión: eventos → Redpanda → ClickHouse.** Ninguna consulta de dashboard
toca PostgreSQL.

**Por qué.** El patrón que mata a los productos de contact center es el
dashboard del supervisor haciendo `GROUP BY` sobre la tabla de llamadas de
producción. Funciona con tres clientes y colapsa con treinta, justo cuando el
negocio empieza a funcionar. Separar los planos desde el principio cuesta una
semana; separarlos después de vender cuesta un trimestre y la reputación.

**Por qué Redpanda y no Kafka.** Compatible con la API de Kafka, sin
ZooKeeper, un solo binario, mucho menos operación. Si algún día hace falta
Kafka gestionado, el código no cambia.

---

## ADR-009 — Next.js para el frontend

**Decisión: Next.js (App Router) + React + TypeScript + Tailwind + Radix
primitives + TanStack Query + Zustand.**

**Por qué Next.js si la aplicación es casi toda privada y en tiempo real.**
No por el SSR — la consola del agente es una SPA pesada. Por el enrutamiento,
los layouts anidados, el manejo de datos, el pipeline de build y por tener la
web pública de marketing y la aplicación en el mismo stack.

**Radix + Tailwind en vez de una librería de componentes completa** (MUI, Ant):
la identidad visual que buscamos — Stripe, Linear, Vercel — es imposible con
una librería opinada; se acaba peleando contra sus estilos. Radix da
accesibilidad y comportamiento sin imponer apariencia.

**Requisito de rendimiento.** La consola del agente recibe hasta 8
actualizaciones por segundo durante 8 horas seguidas. Restricciones:
- Los eventos de transcripción **no** entran al estado global de React;
  van a un store aparte con suscripciones granulares
- Lista virtualizada para la transcripción — 8 horas de llamada son miles de
  segmentos
- Presupuesto: < 16 ms por frame de render, verificado en CI con perfilado
- Sin fugas de memoria en una sesión de 8 h — hay un test de resistencia

---

## ADR-010 — Chrome MV3, Side Panel, selectores desde el servidor

Justificado en [doc 07 §6](07-flujo-crm.md#6-la-extensión-de-chrome-nivel-1).

**Decisión adicional: la extensión no es un cliente de segunda.** Comparte
componentes de UI con el frontend a través de `shared/ui`. El copilot que ve
el agente es literalmente el mismo componente en ambas superficies. Mantener
dos copiloto distintos es garantía de que uno se quede atrás.

---

## ADR-011 — Abstracción de proveedores de LLM, sin acoplamiento

**Decisión: capa `ModelGateway`** con selección de modelo por tarea y por
tenant, failover automático y registro de `model_version` en cada salida.

**Por qué.** En este mercado, el modelo óptimo para una tarea cambia cada
pocos meses. Un sistema acoplado a un proveedor pierde esa opción. Peor: un
cliente enterprise puede exigir que sus datos no salgan de su nube — con la
abstracción, eso es configuración; sin ella, es un contrato perdido.

**Por tarea, no global.** El copilot necesita un modelo rápido; el análisis
post-llamada, uno de máxima calidad; la verificación anti-alucinación, uno
pequeño y barato. Usar el mismo modelo para todo es pagar de más o ir lento.

---

## ADR-012 — Kubernetes, con GPU pre-aprovisionada por pronóstico

**Decisión: EKS (o GKE) con grupos de nodos separados**: CPU general,
media (optimizado en red), y GPU. Terraform + Helm + Argo CD.

**Por qué Kubernetes y no algo más simple.** Normalmente recomendaría
empezar en algo más simple que Kubernetes. Aquí no aplica: necesitamos GPU
programada, despliegues multi-región, afinidad de nodos para audio y
escalado por tipo de carga muy distinto. Todo eso hay que construirlo igual;
Kubernetes ya lo tiene.

**Decisión clave: el Media Plane y la GPU NO usan autoescalado reactivo.**
Un pod con GPU tarda minutos en estar listo (arranque + carga de modelo +
calentamiento). Una llamada dura tres minutos. Para cuando el autoescalador
reacciona, el pico ya pasó y la calidad ya se degradó.

En su lugar: **aprovisionamiento por pronóstico de turnos.** Los call centers
tienen horarios rígidos y conocidos (los turnos empiezan a las 8:00, la hora
pico es de 10:00 a 12:00). Se pre-aprovisiona según el calendario de turnos de
cada tenant, con un colchón del 25%, y el autoescalado solo actúa como red de
seguridad tardía.

---

## ADR-013 — Observabilidad: `call_id` como identificador de traza

**Decisión: OpenTelemetry en todo el sistema, con `call_id` como trace ID.**
Prometheus para métricas, Grafana para visualización, Loki para logs, Sentry
para errores de aplicación.

**Por qué esta decisión merece un ADR.** Un problema de audio se reporta
horas después ("la llamada de las 3 pm sonaba rara") y hay que reconstruir
qué pasó a través de cinco servicios y tres lenguajes. Si la traza se puede
buscar por `call_id`, es un minuto de trabajo. Si no, es un día.

Complementado con **reproducción offline**: cualquier llamada puede
re-ejecutarse alimentando su audio grabado por el pipeline actual, para
comparar. Es la única forma seria de depurar calidad de voz.

---

## ADR-014 — Estrategia de pruebas para un sistema de tiempo real

**El problema.** Los tests unitarios no detectan que el audio suena mal.

**Decisión: cuatro niveles.**

1. **Unitarios** — lógica pura de negocio. Rápidos, en cada commit.
2. **Golden audio** — un corpus de 200 muestras de audio real de call center
   (con ruido, acentos, interrupciones) pasa por el pipeline en cada PR. Se
   comparan métricas objetivas: latencia, similitud de locutor, WER de
   contenido preservado. **Una regresión de calidad bloquea el merge.**
3. **Evaluación de IA** — los sets de [doc 06 §7](06-flujos-de-ia.md#evaluación-continua)
   corren en CI. Alucinación > 0 bloquea el despliegue.
4. **Carga y caos** — semanalmente: 500 llamadas concurrentes, matando pods
   de GPU al azar. El criterio de éxito es que **ninguna llamada se corte**;
   se acepta que entren en bypass.

El nivel 2 es el que casi nadie construye y el que evita el fallo que mata:
degradar la calidad de voz sin darse cuenta durante tres semanas.

---

## Resumen del stack

| Capa | Elección |
|---|---|
| Media | LiveKit (SFU + SIP), Voice Engine en Rust, Opus |
| IA | Python asyncio, gRPC, GPU L4/A10G, ASR y TTS comerciales, VC propia |
| Backend | NestJS + TypeScript, PostgreSQL 16 + pgvector, Redis, Redpanda |
| Analítica | ClickHouse |
| Frontend | Next.js, React, TypeScript, Tailwind, Radix, TanStack Query, Zustand |
| Extensión | Chrome MV3, Side Panel API |
| Infra | Kubernetes (EKS), Terraform, Helm, Argo CD, multi-región |
| Observabilidad | OpenTelemetry, Prometheus, Grafana, Loki, Sentry |
| Almacenamiento | S3 (grabaciones, cifrado por tenant) |
| Pagos | Stripe |

## Decisiones deliberadamente aplazadas

| Decisión | Cuándo se toma |
|---|---|
| Modelo propio de conversión de voz entrenado desde cero | Cuando tengamos > 10,000 h de audio propio |
| ASR auto-hospedado | Cuando el costo de API supere el de GPU dedicada |
| Base vectorial dedicada | Cuando un tenant supere 5M de chunks |
| Multi-nube | Cuando un cliente enterprise lo exija por contrato |
| Región europea | Con el primer cliente que exija residencia en la UE |
| Idiomas más allá de ES/EN | Después de que el Modo B tenga tracción probada |
