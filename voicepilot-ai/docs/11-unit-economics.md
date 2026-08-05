# 11 — Unit economics

> **Todas las cifras de este documento son órdenes de magnitud para modelar
> la arquitectura, no cotizaciones.** Los precios de ASR, TTS, LLM y GPU
> cambian cada trimestre — históricamente a la baja. Antes de fijar precio de
> venta hay que re-cotizar con volumen real. Lo que sí es estable es la
> **estructura** de costos y qué palancas la mueven.

---

## 1. Por qué este documento existe en una especificación técnica

Porque la arquitectura y el margen son el mismo problema.

Un agente de call center habla **~5 horas al día, 22 días al mes = 300
minutos/día ≈ 6,600 minutos/mes**. Cada uno de esos minutos consume GPU, ASR,
y posiblemente TTS y LLM.

Si el costo variable es de $0.30/minuto, un agente cuesta **$1,980/mes** en
infraestructura. Eso es más de lo que gana el agente en LATAM. **El producto
no existiría.**

Si es de $0.06/minuto, son $396/mes por agente, y con un precio de $150–250
por puesto el negocio no cierra tampoco — salvo que se restrinjan los
minutos incluidos.

**El costo por minuto no es un detalle de operaciones: determina el modelo de
negocio y, por tanto, decisiones de arquitectura.** Por eso está aquí y no en
una hoja de cálculo aparte.

---

## 2. Estructura de costo por minuto de llamada

### Modo A (acento) — el caso principal

| Componente | Driver | Rango estimado /min |
|---|---|---|
| **GPU (conversión de voz)** | Fracción de GPU por llamada concurrente | $0.010 – $0.030 |
| **ASR streaming** | Precio por minuto del proveedor | $0.005 – $0.015 |
| **Media (SFU + ancho de banda)** | CPU + egreso | $0.002 – $0.005 |
| **Copilot (LLM)** | ~4 invocaciones/llamada, no por minuto | $0.003 – $0.010 |
| **Análisis post-llamada** | 1 invocación de calidad por llamada | $0.002 – $0.008 |
| **Almacenamiento (audio + datos)** | Amortizado a 90 días de retención | $0.001 – $0.003 |
| **Cómputo general + observabilidad** | Prorrateado | $0.002 – $0.004 |
| **TOTAL Modo A** | | **~$0.025 – $0.075** |

### Modo B (traducción) — añade TTS y traducción

| Componente adicional | Rango estimado /min |
|---|---|
| TTS streaming | $0.010 – $0.040 |
| Traducción incremental | $0.003 – $0.010 |
| **TOTAL Modo B** | **~$0.040 – $0.125** |

**El Modo B cuesta entre 1.5× y 2× el Modo A.** Eso debe reflejarse en el
precio, o el mix de uso destruye el margen silenciosamente.

### El componente dominante: la GPU

La variable que más mueve el costo es **cuántas llamadas concurrentes caben
en una GPU**. Con un modelo de conversión de voz eficiente y chunks de 80 ms:

| Llamadas por GPU | Costo GPU/min estimado |
|---|---|
| 10 | ~$0.030 |
| 25 | ~$0.012 |
| 50 | ~$0.006 |

Optimizar el modelo de 10 a 50 llamadas concurrentes por GPU **reduce el
costo total del Modo A a la mitad**. Ninguna otra optimización tiene ese
apalancamiento.

Por eso la eficiencia del modelo de conversión de voz no es un tema de
investigación académica: es la variable de negocio más importante del
producto, y merece un ingeniero dedicado permanentemente.

---

## 3. Costo mensual por agente

Con **6,600 minutos/mes** de conversación:

| Escenario | Costo/min | Costo/agente/mes |
|---|---|---|
| Pesimista (Modo B, sin optimizar) | $0.125 | **$825** |
| Base (Modo A, optimización media) | $0.050 | **$330** |
| Optimizado (Modo A, 50 llamadas/GPU, ASR propio) | $0.020 | **$132** |
| Objetivo a 24 meses | $0.012 | **$79** |

**Conclusión que condiciona el precio:** un modelo de "minutos ilimitados"
es inviable hasta llegar al escenario optimizado. El precio debe incluir un
paquete de minutos y cobrar el excedente.

---

## 4. Modelo de precios propuesto

Estructura híbrida: **puesto + minutos incluidos + excedente**.

| Plan | Precio/puesto/mes | Minutos incluidos | Excedente | Modo B |
|---|---|---|---|---|
| **Starter** | $99 | 2,000 | $0.05/min | No |
| **Professional** | $199 | 5,000 | $0.04/min | +$50/puesto |
| **Enterprise** | Personalizado | Negociado | Negociado | Incluido |

### Por qué esta estructura y no otra

**Por qué no solo por puesto.** Un agente que habla 7 h/día cuesta el doble
que uno que habla 3 h. Un precio plano nos deja expuestos justo con los
clientes más intensivos — es decir, los mejores clientes.

**Por qué no solo por minuto.** Los compradores de contact center presupuestan
por puesto. Un precio solo por consumo es imposible de aprobar internamente y
alarga los ciclos de venta.

**Por qué el Modo B se cobra aparte.** Cuesta el doble. Ocultarlo en el precio
base significa que los clientes de Modo A subsidian a los de Modo B, y que un
cambio de mix nos revienta el margen sin que nadie lo note hasta el cierre
del trimestre.

### Margen bruto objetivo

| Plan | Ingreso/puesto | Costo (base) | Margen bruto |
|---|---|---|---|
| Starter (2,000 min) | $99 | ~$100 | ~0% ⚠️ |
| Starter (optimizado) | $99 | ~$40 | ~60% |
| Professional (5,000 min) | $199 | ~$250 | negativo ⚠️ |
| Professional (optimizado) | $199 | ~$100 | ~50% |

**Los dos ⚠️ son el hallazgo central de este documento.**

Con los costos de partida (escenario base, $0.05/min), **los planes
publicados pierden dinero**. Hay tres respuestas posibles, y hay que elegir
una conscientemente:

1. **Precio más alto al lanzamiento** ($149 / $299), bajándolo a medida que
   el costo baja. Psicológicamente difícil: bajar precios es fácil, subirlos
   destruye la confianza. Esta es la opción recomendada.
2. **Menos minutos incluidos** (1,000 / 3,000). Menos elegante, pero honesto
   y ajustable.
3. **Aceptar margen negativo en el año 1** como inversión en aprendizaje, con
   fecha límite explícita y financiación que lo soporte.

Lo que **no** es opción es publicar estos precios sin haber cerrado la brecha
de costo y esperar que se resuelva sola. Un producto que pierde dinero en
cada cliente nuevo no escala: se hunde más rápido cuanto mejor vende.

---

## 5. Palancas de optimización, por impacto

| # | Palanca | Reducción esperada | Esfuerzo | Cuándo |
|---|---|---|---|---|
| 1 | **Densidad de GPU** (10 → 50 llamadas/GPU) | −50% del total | Alto | Continuo desde Fase 0 |
| 2 | **ASR auto-hospedado** en las GPU existentes | −20% | Medio | Cuando el volumen lo justifique |
| 3 | **Cuantización del modelo de voz** (FP16 → INT8) | −30% de GPU | Medio | Fase 2 |
| 4 | **No procesar silencios** (VAD agresivo) | −15% del cómputo | Bajo | Fase 1 |
| 5 | **Modelos más pequeños para tareas simples** | −40% del costo de LLM | Bajo | Fase 1 |
| 6 | **Caché de sugerencias** para objeciones repetidas | −25% del copilot | Bajo | Fase 2 |
| 7 | **Instancias reservadas / spot para lotes** | −30% de infra | Bajo | Fase 2 |
| 8 | **Compresión de grabaciones + archivado frío** | −60% de almacenamiento | Bajo | Fase 2 |

La palanca 4 merece atención por su relación esfuerzo/impacto: **en una
llamada típica, el agente habla menos del 50% del tiempo**. No gastar GPU
durante los silencios y mientras habla el cliente es dinero gratis, y ya
tenemos el VAD en el pipeline por otras razones.

---

## 6. Sensibilidad: qué pasa si me equivoco

| Variable | Si es 2× peor | Impacto en el negocio |
|---|---|---|
| Llamadas por GPU | 12 en vez de 25 | Costo +$0.012/min → hay que subir precio ~20% |
| Minutos por agente | 13,000/mes | Los planes se agotan; el excedente pasa a ser el ingreso principal |
| Precio del ASR | Se duplica | +$0.01/min. Acelera el caso de auto-hospedaje |
| Adopción del Modo B | 60% del uso, no 15% | Margen cae ~15 puntos. **Hay que cobrarlo aparte, sí o sí** |
| Invocaciones de copilot | 12/llamada, no 4 | +$0.02/min. Hay que endurecer el detector de disparadores |

Esa última fila conecta directamente con una decisión de diseño de [doc 06](06-flujos-de-ia.md):
el detector de disparadores que evita llamar al LLM en cada frase **no es
solo una decisión de UX — es una decisión de margen.** Un copilot que sugiere
constantemente es peor para el agente *y* más caro para nosotros.

---

## 7. Costos que no son por minuto

| Concepto | Estimación anual | Notas |
|---|---|---|
| Infraestructura base (no proporcional a llamadas) | $60k – $150k | Postgres, ClickHouse, Redis, K8s, observabilidad |
| Licencias de voces destino | $20k – $80k | Actores de voz, contrato de uso sintético comercial |
| Auditoría SOC 2 (Tipo I + II) | $40k – $80k | Necesario para vender enterprise |
| Opinión y soporte legal (voz IA, multi-estado) | $30k – $100k | **No opcional.** Ver [doc 09](09-seguridad-y-compliance.md) |
| Pentest anual | $15k – $40k | |
| Herramientas de desarrollo y CI | $30k – $60k | |

Estos costos son en su mayoría fijos: se amortizan con volumen. Con 50
clientes son irrelevantes; con 3 son la mitad de la quema mensual.

---

## 8. Métricas que hay que instrumentar desde el día uno

No se puede optimizar lo que no se mide, y estas métricas hay que construirlas
en el producto, no reconstruirlas después desde facturas:

| Métrica | Dónde | Por qué |
|---|---|---|
| **Costo por minuto, por tenant** | Dashboard interno | Detecta al cliente que destruye el margen |
| **Llamadas concurrentes por GPU** | Prometheus | La palanca #1 |
| **Invocaciones de LLM por llamada** | Por servicio y modelo | La palanca de sobre-uso más probable |
| **Ratio de silencio procesado** | Voice Engine | Cuánto se está desperdiciando |
| **Minutos por puesto** | Facturación | Valida el dimensionamiento de los planes |
| **Mix Modo A / Modo B** | Facturación | Impacto directo en margen |
| **Costo por sugerencia mostrada** | Copilot | ¿Vale lo que cuesta? |

**Regla:** cada servicio reporta su costo estimado por llamada como métrica
de primera clase, junto a la latencia. Un equipo que ve el costo mientras
programa toma decisiones distintas — y mejores — que uno que lo descubre en
la factura de fin de mes.
