# 00 — Visión y alcance

## 1. La tesis

Un contact center en Bogotá, Medellín, Guadalajara o San Salvador puede
contratar a un agente por 1/5 del costo de uno en Phoenix. Ese agente es
igual de inteligente, igual de trabajador y muchas veces mejor vendedor.

Pierde la venta en los primeros 8 segundos, por el acento.

El comprador estadounidense promedio no es racista: es impaciente. Cuando
tiene que esforzarse para entender, su carga cognitiva sube, su paciencia
baja, y cuelga. Ese delta — entre el talento real del agente y lo que el
cliente percibe en 8 segundos — es el arbitraje más grande sin explotar en
la industria de contact centers.

**VoicePilot AI cierra ese delta en tiempo real.**

No es un CRM con IA pegada. Es una capa de inteligencia que se sienta entre
la boca del agente y el oído del cliente, y que además observa cada llamada
para hacer que la operación entera aprenda.

## 2. Qué es exactamente

Un **AI Operating System para contact centers**, con cinco capacidades que
se refuerzan entre sí:

| Capacidad | Qué hace | Por qué gana |
|---|---|---|
| **Voice Layer** | Convierte la voz del agente en voz americana nativa, en vivo | Sube la tasa de conexión antes del segundo 10 |
| **Copilot** | Sugiere la respuesta exacta del script mientras el cliente habla | Elimina el agente que se queda en blanco |
| **Compliance** | Alerta en vivo cuando el agente se sale del guion o promete algo prohibido | Evita multas y chargebacks |
| **Intelligence** | Sentimiento, estrés, intención de compra, objeciones, en vivo y post-llamada | Convierte al supervisor en un cirujano, no un adivino |
| **CRM Layer** | CRM propio, o integración con el que ya tengan | Elimina la fricción de adopción |

## 3. Modo Integrado vs Modo Nativo

Esta es la decisión de producto más importante del proyecto, y la razón por
la que la arquitectura está partida como está.

### Modo Integrado (llega primero al mercado)

La empresa ya usa Salesforce/HubSpot/Five9. Cambiar de CRM es un proyecto de
6 meses y una guerra política interna. **Nadie lo va a hacer para probarnos.**

Entonces no se lo pedimos. Instalan la extensión de Chrome, y VoicePilot
aparece encima de su CRM: el panel de copilot flota sobre la ficha del lead,
la transcripción se pega en el campo de notas que ellos ya usan, la
disposición de la llamada se escribe en su objeto `Task` o `Call`.

Costo de adopción para el cliente: **una extensión y un login.**
Este es nuestro caballo de Troya.

### Modo Nativo (retiene y monetiza)

Muchísimos call centers de LATAM operan sobre Google Sheets, un CRM casero
en PHP, o un Excel compartido. Para ellos, "integrar" no significa nada.

Para esos, VoicePilot trae CRM completo: leads, pipeline, contactos,
llamadas, historial, notas, tareas, calendario, usuarios, permisos, reportes.

El CRM nativo no es un producto separado: es la **implementación de
referencia** de nuestro modelo de datos canónico. Todo lo que el conector de
Salesforce mapea hacia afuera, el CRM nativo lo implementa hacia adentro.
Un solo modelo, dos superficies.

## 4. Usuarios y sus trabajos

| Persona | Qué necesita | Cómo lo mide |
|---|---|---|
| **Agente** (el que habla) | No sonar extranjero. No quedarse callado. No escribir notas. | Cierra más, se cansa menos |
| **Supervisor / Floor Manager** | Saber cuál de sus 40 llamadas activas se está cayendo, *ahora* | Interviene antes de perder la venta |
| **QA / Compliance** | Probar que el agente dijo el disclaimer, sin escuchar 400 horas | Auditoría del 100% de llamadas, no del 2% |
| **Dueño del call center** | Vender su operación como "tier-1 americana" a precio LATAM | Margen y contratos más grandes |
| **Cliente del call center** (el que compra la campaña) | Conversión y cero riesgo legal | Renueva el contrato |

El **cliente final en la llamada** no es usuario del producto. Nunca ve nada.
Solo escucha una voz clara y agradable. Ese es el punto.

## 5. Alcance: qué SÍ y qué NO

### Dentro del alcance

- Conversión de voz en vivo, dos modos (acento / traducción)
- Transcripción en vivo con diarización, timestamps, búsqueda, exportación
- Copilot de sugerencias **estrictamente anclado** al material de la empresa
- Ingesta de conocimiento: PDF, DOCX, TXT, HTML, CSV, URLs
- Motor de compliance en vivo (determinista + clasificador)
- Análisis en vivo y post-llamada
- CRM nativo completo
- Conectores a 8+ CRMs y 2 CCaaS
- Extensión de Chrome (MV3)
- Dashboard en tiempo real, reportes, ranking, KPIs
- Multi-tenancy, RBAC, SSO, auditoría, cifrado

### Explícitamente fuera del alcance (v1)

| Fuera | Por qué |
|---|---|
| **Ser el dialer / la PBX** | Five9, Genesys y Twilio ya lo hacen mejor. Nos integramos, no competimos. Entrar ahí nos mata el time-to-market. |
| **Bots que hablan solos con el cliente** | Es otro producto (voice AI agents) y otro riesgo legal (TCPA). Nuestra tesis es *aumentar humanos*, no reemplazarlos. Se evalúa en v3. |
| **Idiomas fuera de ES/EN** | Cada par de idiomas es un proyecto de calidad completo. PT-BR es el siguiente candidato. |
| **Móvil nativo** | El agente trabaja en un escritorio con diadema. El supervisor sí recibe app en v2. |
| **Entrenar modelos base propios** | Compramos inferencia hasta que el volumen justifique lo contrario (ver [doc 11](11-unit-economics.md)). |
| **Grabación como sistema de registro legal** | Guardamos grabaciones, pero el system of record de compliance regulado sigue siendo el del cliente en v1. |

## 6. Los cinco riesgos que pueden matar el proyecto

Un fundador honesto los escribe antes de empezar, no después de fallar.

### R1 — La latencia del Modo B no es aceptable para el mercado
**Probabilidad: media. Impacto: alto.**
Traducir en vivo cuesta ~900 ms. Si los pilotos dicen "se siente raro", el
Modo B no vende. *Mitigación:* Modo A es el producto principal y es el que
cumple los <300 ms; Modo B se posiciona como capacidad de expansión de
talento (contratar gente que no habla inglés), no como el default.
Se valida en la **Fase 0** con clientes reales antes de invertir en el resto.

### R2 — La conversión de voz suena a robot bajo ruido de call center
**Probabilidad: alta. Impacto: alto.**
Un piso de call center tiene 60 personas hablando. La cancelación de ruido y
la separación de locutor son el problema real, no el modelo de voz.
*Mitigación:* pipeline de preprocesamiento agresivo (ver [doc 02](02-pipeline-voz-tiempo-real.md#capa-0-acondicionamiento-de-audio))
y requisito de hardware: diadema con micrófono de brazo, no audio de laptop.
Esto es un **requisito de venta**, va en el contrato.

### R3 — Riesgo regulatorio de la voz sintética
**Probabilidad: media. Impacto: existencial.**
La FCC ya declaró ilegales las voces generadas por IA en robocalls. Nuestro
caso es distinto (hay un humano hablando en vivo, en tiempo real), pero
"distinto" no es "seguro". *Mitigación:* ver [doc 09](09-seguridad-y-compliance.md#riesgo-legal-de-la-voz-sintética).
Se necesita opinión legal formal antes del primer cliente pago en US.
**No es negociable.**

### R4 — Los conectores de CRM se vuelven un pozo sin fondo
**Probabilidad: alta. Impacto: medio.**
Ocho CRMs son ocho productos de mantenimiento eterno.
*Mitigación:* modelo canónico + adaptadores delgados, y solo **dos**
conectores profundos en el MVP (HubSpot y Salesforce). El resto entra por la
extensión de Chrome, que no necesita API.

### R5 — Costo variable por minuto que se come el margen
**Probabilidad: media. Impacto: alto.**
STT + MT + TTS + GPU por minuto de llamada, con agentes hablando 5 horas/día.
*Mitigación:* ver [doc 11](11-unit-economics.md). Precio híbrido
(seat + minutos incluidos + overage), y ruta de auto-hospedaje de modelos
cuando el volumen la justifique.

## 7. Criterio de éxito del MVP

El MVP no se declara terminado por features. Se declara terminado por números:

- **p95 de latencia añadida en Modo A ≤ 300 ms**, medido boca-a-oído en una
  llamada PSTN real, no en laboratorio
- **≥ 8/10 de "no noté nada raro"** en prueba ciega con 20 receptores
  estadounidenses
- **0 alucinaciones** del copilot en un set de evaluación de 200 objeciones
  reales — cualquier respuesta sin cita al material es un fallo
- **1 call center piloto** operando 500+ llamadas/semana durante 4 semanas
  consecutivas sin caída de audio atribuible a nosotros
- **Ahorro medible**: reducción ≥ 60% del tiempo de after-call work

Si el punto 1 y el punto 3 no se cumplen, el producto no existe, por muchas
pantallas bonitas que tenga.
