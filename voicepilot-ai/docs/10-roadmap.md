# 10 — Roadmap: de Fase 0 a Enterprise

## Principio de ejecución

> **Un módulo no se abandona a medias.** Se termina — con tests, telemetría,
> documentación y criterio de salida verificado — antes de empezar el
> siguiente. Diez módulos al 80% valen cero; seis al 100% son un producto.

Cada fase tiene un **criterio de salida numérico**. Si no se cumple, no se
avanza; se arregla o se cambia el plan. No se avanza "porque ya estamos
retrasados" — así es como se acumula deuda que después cuesta el doble.

---

## FASE 0 — Prueba de latencia (Semanas 1–12)

**La fase que decide si el proyecto existe.**

No se construye producto. Se construye la respuesta a una sola pregunta:
*¿podemos convertir voz en tiempo real con calidad de venta y latencia
invisible?*

### Módulos

| # | Módulo | Semanas | Criterio de salida |
|---|---|---|---|
| 0.1 | Banco de latencia instrumentado | 1–2 | Medición punto a punto con precisión ±5 ms |
| 0.2 | Media Plane mínimo (LiveKit + SIP + Voice Engine) | 2–4 | Audio bidireccional PSTN estable 30 min |
| 0.3 | Modo A con VC open-source | 3–5 | p95 boca-a-oído añadida < 400 ms |
| 0.4 | Acondicionamiento de audio | 4–6 | Funciona con ruido real de call center grabado |
| 0.5 | Fine-tuning de acento | 5–8 | Similitud ≥ 0.75, WER de contenido ≤ 8% |
| 0.6 | Bypass y degradación | 6–7 | Mata la GPU en vivo: la llamada no se corta |
| 0.7 | **Prueba ciega en EE.UU.** | 8 | **≥ 8/10 receptores no detectan síntesis** |
| 0.8 | Modo B con wait-k adaptativo | 9–10 | p50 < 1,000 ms, cero retractaciones |
| 0.9 | Prueba de carga | 11–12 | 50 llamadas concurrentes/GPU sin degradar p95 |

### Equipo
2 ingenieros de audio/ML, 1 de infraestructura. **Nadie más.**

### Puerta de decisión — semana 8

| Resultado | Acción |
|---|---|
| Prueba ciega ≥ 8/10 | **Adelante.** Se contrata el equipo de producto |
| 5–7/10 | 6 semanas más de I+D. Sin construir producto |
| < 5/10 | **Alto total.** Se replantea la tesis del producto |

Escribir esta puerta ahora, en frío, es lo que evita que dentro de cuatro
meses se decida por optimismo. La disciplina se diseña antes de necesitarla.

---

## FASE 1 — MVP vendible (Semanas 13–32)

**Objetivo: un call center piloto operando de verdad, todos los días.**

Alcance mínimo para que un cliente real pague. Todo lo que no sirva a eso, se
posterga sin discusión.

### Módulos, en orden estricto

| # | Módulo | Sem. | Criterio de salida |
|---|---|---|---|
| 1.1 | Fundamentos: tenancy, auth, RBAC, auditoría, RLS | 13–15 | Suite de aislamiento entre tenants pasa al 100% |
| 1.2 | Media Plane productivo: pool caliente, grabación, métricas | 15–17 | 200 llamadas concurrentes, p95 < 340 ms |
| 1.3 | Consola del agente v1 | 17–20 | Sesión de 8 h sin fugas de memoria |
| 1.4 | ASR + transcripción en vivo | 19–21 | WER < 15% en audio telefónico con acento |
| 1.5 | Ingesta de conocimiento (PDF, DOCX, TXT, URL) | 21–23 | 500 páginas ingeridas en < 10 min |
| 1.6 | **Copilot con RAG anclado** | 23–26 | **0 alucinaciones en set de 200 objeciones**, p95 < 800 ms |
| 1.7 | Compliance determinista | 25–27 | Recall > 95% en reglas críticas |
| 1.8 | Análisis post-llamada | 27–29 | Cobertura de puntos clave > 90% vs. QA humano |
| 1.9 | CRM nativo v1 (contactos, leads, pipeline, notas, tareas) | 26–30 | Importación de 50k contactos sin errores |
| 1.10 | Dashboard de supervisor | 29–31 | Actualización < 2 s con 100 llamadas activas |
| 1.11 | Extensión de Chrome (L1) + HubSpot (L2) | 30–32 | Escritura de llamada verificada en HubSpot real |

### Criterio de salida del MVP

Los cinco del [doc 00 §7](00-vision-y-alcance.md#7-criterio-de-éxito-del-mvp):

1. p95 de latencia añadida Modo A ≤ 300 ms en PSTN real
2. ≥ 8/10 en prueba ciega
3. 0 alucinaciones del copilot en el set de evaluación
4. 1 piloto con 500+ llamadas/semana durante 4 semanas seguidas
5. Reducción ≥ 60% del tiempo de after-call work

### Fuera del MVP, explícitamente

Modo B en producción · Salesforce L3 · SSO · multi-región · reportes
personalizados · app móvil · calendario · marketplace · idiomas adicionales.

Todos son valiosos. Ninguno decide si el piloto compra.

---

## FASE 2 — Producto (Meses 9–14)

**Objetivo: pasar de un piloto a 20 clientes que renuevan.**

| # | Módulo | Por qué ahora |
|---|---|---|
| 2.1 | **Modo B en producción** | Ya validado técnicamente; ahora se pule y se vende |
| 2.2 | Salesforce L3 bidireccional | El 60% del mercado enterprise lo pide |
| 2.3 | Zoho + Pipedrive (L2) | Cubre el grueso del mercado medio de LATAM |
| 2.4 | Compliance semántico + constructor de reglas | Los clientes quieren sus propias reglas sin pedirnos código |
| 2.5 | Coaching y QA (rúbricas, puntuación, clips) | Es lo que retiene: el supervisor usa el producto a diario |
| 2.6 | Reportes avanzados + exportaciones programadas | Primera petición de todo cliente que renueva |
| 2.7 | Calendario + sincronía Google/Outlook | Completa el ciclo del CRM nativo |
| 2.8 | Alertas en vivo al supervisor (móvil) | Convierte el dashboard en herramienta activa |
| 2.9 | Modelo de probabilidad de cierre por tenant | Requiere el histórico que solo ahora existe |
| 2.10 | **SOC 2 Tipo I** | Bloquea ventas si no está |

**Criterio de salida:** 20 clientes activos, retención bruta > 90%,
NPS > 40, cero incidentes críticos de seguridad.

---

## FASE 3 — Enterprise (Meses 15–24)

**Objetivo: contratos de seis cifras.**

| # | Módulo | Por qué |
|---|---|---|
| 3.1 | SSO (SAML/OIDC) + SCIM | Sin esto no hay conversación con un enterprise |
| 3.2 | Despliegue multi-región + residencia de datos | Requisito de LATAM, UE y clientes regulados |
| 3.3 | Despliegue dedicado / VPC del cliente | BPO regulados lo exigen |
| 3.4 | Genesys + Five9 (integración profunda) | Donde está el volumen real de llamadas |
| 3.5 | API pública + webhooks + SDKs | Los enterprise construyen encima |
| 3.6 | Marca blanca | Los BPO revenden a sus propios clientes |
| 3.7 | Analítica avanzada + constructor de reportes | Comprador enterprise = comprador de datos |
| 3.8 | **Modelo propio de conversión de voz** | El foso, ahora con datos suficientes |
| 3.9 | Portugués (PT-BR) | Brasil es el siguiente mercado obvio |
| 3.10 | **SOC 2 Tipo II + ISO 27001** | Puerta de entrada al enterprise real |
| 3.11 | Herramientas de administración de flota | Un cliente con 2,000 agentes necesita otra UI |
| 3.12 | Uptime 99.95% con SLA contractual | Se firma solo cuando se puede cumplir |

---

## Comparativa de versiones

| Capacidad | MVP | Producto | Enterprise |
|---|---|---|---|
| Modo A (acento) | ✅ | ✅ | ✅ |
| Modo B (traducción) | — | ✅ | ✅ |
| Transcripción en vivo | ✅ | ✅ | ✅ |
| Copilot anclado | ✅ | ✅ | ✅ |
| Compliance | Determinista | + Semántico | + Constructor propio |
| Análisis post-llamada | ✅ | ✅ | + Personalizado |
| CRM nativo | Básico | Completo | + Marca blanca |
| Integraciones | Extensión + HubSpot | + Salesforce, Zoho, Pipedrive | + Genesys, Five9, API |
| Dashboard | Supervisor | + Móvil, alertas | + Constructor de reportes |
| Coaching / QA | — | ✅ | + Rúbricas personalizadas |
| SSO / SCIM | — | — | ✅ |
| Multi-región | — | — | ✅ |
| Despliegue dedicado | — | — | ✅ |
| Certificaciones | — | SOC 2 I | SOC 2 II, ISO 27001 |
| SLA | Mejor esfuerzo | 99.9% | 99.95% contractual |

---

## Equipo por fase

| Fase | Tamaño | Composición |
|---|---|---|
| **0** | 3 | 2 audio/ML, 1 infra |
| **1** | 9 | +2 backend, +2 frontend, +1 IA/RAG, +1 diseño de producto |
| **2** | 16 | +2 backend, +1 frontend, +1 ML, +1 QA, +1 DevOps, +1 soporte |
| **3** | 28 | +equipo de integraciones, +seguridad, +SRE, +soporte enterprise |

La Fase 0 con tres personas es deliberada. Añadir gente a una fase de
investigación la hace más lenta, no más rápida.

---

## Riesgos del roadmap

| Riesgo | Señal temprana | Plan |
|---|---|---|
| Fase 0 se alarga | Semana 8 sin superar 400 ms | Puerta de decisión formal. No se extiende indefinidamente |
| El copilot alucina en producción real | Casos reportados por el piloto | Subir el umbral de recuperación; callar más. Es preferible |
| El piloto no adopta | Uso < 50% de las llamadas en semana 2 | Es problema de UX, no de IA. Sentarse con los agentes tres días |
| El costo por minuto excede el modelo | Coste unitario en el dashboard interno | Ver [doc 11](11-unit-economics.md): palancas de optimización |
| Cambio regulatorio de voz IA | Seguimiento legal trimestral | La divulgación por defecto y la doble pista ya nos dejan bien parados |
| Un competidor grande entra | Anuncio de un CCaaS | Nuestra ventaja es LATAM + el modelo de voz propio. Acelerar el foso de datos |

---

## Lo que NO está en el roadmap (y por qué)

| Idea | Por qué no |
|---|---|
| Agentes de voz IA autónomos | Otro producto, otro riesgo legal. Se evalúa en el mes 24+ |
| Marketplace de apps | No hay ecosistema hasta que haya cientos de clientes |
| Video | Los call centers de ventas salientes no usan video |
| Ser el dialer | Perderíamos 12 meses compitiendo contra productos maduros |
| Traducción de más de 2 idiomas | Cada par es un proyecto de calidad completo |
| Chat/email omnicanal | La voz es donde somos únicos. Diluirse es morir |

Ese último punto merece énfasis: la tentación de convertirse en "plataforma
omnicanal" llegará con el primer cliente grande que lo pida. Es la forma más
rápida de convertir un producto excepcional en uno mediocre.
