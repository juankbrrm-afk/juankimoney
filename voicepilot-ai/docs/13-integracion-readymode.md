# 13 — Integración con ReadyMode (socio de diseño)

> **Estado: plan, no implementación verificada.** Este documento se escribió sin
> acceso a una instancia real de ReadyMode. Todo lo marcado **[VERIFICAR]** es
> una hipótesis que hay que confirmar contra el sistema en vivo antes de
> escribir código que dependa de ello. La §6 dice exactamente cómo confirmarlo.

## 1. Por qué este documento existe

El plan original trataba a los CRMs como sistemas de registro pasivos: nosotros
manejamos la llamada, ellos guardan el resultado. Salesforce, HubSpot y Zoho
encajan en ese molde.

**ReadyMode no.** ReadyMode es un dialer con CRM incorporado. No es el lugar
donde se anota la llamada: **es quien hace la llamada.** Es dueño de la
marcación, de la lista, de la cola, y —el punto que lo cambia todo— **del
audio**.

Eso convierte a ReadyMode en algo más valioso y más difícil que un CRM
cualquiera:

- **Más valioso**, porque es exactamente nuestro cliente objetivo. Los call
  centers que usan ReadyMode son operaciones de outbound de LATAM vendiendo a
  Estados Unidos: la tesis del producto, literalmente.
- **Más difícil**, porque nuestro Media Plane asumió que nosotros controlamos
  la ruta SIP. Cuando el dialer del cliente la controla, esa suposición se cae.

## 2. El problema del que nadie se acuerda hasta el día de la integración

Nuestra arquitectura ([doc 01](01-arquitectura.md)) dibuja esto:

```
Dialer → SIP Gateway (nuestro) → Voice Engine → PSTN → Cliente
```

Con ReadyMode la realidad es:

```
ReadyMode → su propio softphone/WebRTC → su carrier → Cliente
                        ▲
                   ¿dónde entramos?
```

**Si no estamos en la ruta del audio, no hay producto.** El copilot, la
transcripción y el CRM son features; la conversión de voz es la razón de
existir. Y para convertir voz hay que tocarla.

Tres formas de entrar, en orden de preferencia:

### Opción A — Interposición de troncal SIP *(preferida)*

El cliente apunta ReadyMode a **nuestro** troncal SIP en vez de al de su
carrier. Nosotros procesamos y reenviamos al carrier real.

```
ReadyMode → SIP (nuestro troncal) → Voice Engine → SIP → carrier → Cliente
```

| | |
|---|---|
| **A favor** | Es exactamente la arquitectura que ya diseñamos y ya construimos. Calidad máxima, latencia mínima, sin software en la máquina del agente. |
| **En contra** | Requiere que ReadyMode permita configurar el carrier saliente. **[VERIFICAR]** — muchos dialers ofrecen "bring your own carrier"; hay que confirmar que ReadyMode lo hace y en qué plan. |
| **Riesgo** | Si ReadyMode no lo permite, esta opción no existe y todo depende de la B. |

**Esta es la pregunta número uno que hay que responder.** Determina si la
integración es un fin de semana o un trimestre.

### Opción B — Dispositivo de audio virtual en la máquina del agente

Un driver de audio virtual local. ReadyMode cree que habla con la diadema;
en realidad habla con nosotros, y nosotros con la diadema.

```
Micrófono → VoicePilot (local) → dispositivo virtual → softphone de ReadyMode
```

| | |
|---|---|
| **A favor** | **Funciona con absolutamente cualquier dialer**, tenga o no API. Es la llave maestra del mercado entero, no solo de ReadyMode. |
| **En contra** | Hay que instalar software en cada puesto (driver de audio firmado, Windows y macOS). Soporte de TI, permisos corporativos, actualizaciones. Añade latencia local. |
| **Riesgo** | La instalación es fricción de venta real. Un piloto de 40 agentes se convierte en un proyecto de TI. |

### Opción C — Interceptar el WebRTC de ReadyMode desde la extensión

Descartada. Requiere pisar el `getUserMedia` de una página ajena, se rompe con
cada actualización de ReadyMode, y plausiblemente viola sus términos de
servicio. No se construye.

### Decisión

**Perseguir la A. Construir la B como plan de contingencia y como producto
propio.**

La opción B es más trabajo, pero si funciona convierte a VoicePilot en
compatible con *cualquier* dialer del mercado — Five9, Genesys, ReadyMode,
Vicidial, uno casero. Eso no es un parche: es una segunda estrategia de entrada
al mercado, y probablemente la más grande de las dos.

## 3. La capa de CRM: ReadyMode es un objetivo de Nivel 1

Separado del audio, está el CRM. Aquí ReadyMode encaja limpiamente en el
**Nivel 1** de [doc 07](07-flujo-crm.md): superposición por extensión de
Chrome, sin API.

Por qué L1 y no L2/L3:

- La interfaz del agente es web, así que la extensión puede montarse encima
  **[VERIFICAR]** — confirmar que no está dentro de un iframe de origen
  cruzado que bloquee los content scripts.
- El agente ya vive en esa pantalla todo el día. No queremos moverlo.
- La superficie de API de ReadyMode es una incógnita **[VERIFICAR]**. L1 no la
  necesita.

Lo que la extensión debe hacer sobre ReadyMode:

| Función | Cómo | Dificultad |
|---|---|---|
| Detectar qué lead está abierto | URL o DOM **[VERIFICAR]** | Media |
| Detectar inicio y fin de llamada | Cambio de DOM o evento **[VERIFICAR]** | **Alta — es lo que dispara todo** |
| Mostrar copilot y transcripción | Side Panel de Chrome, fuera del DOM ajeno | Baja |
| Escribir notas al colgar | Rellenar el campo de notas de ReadyMode | Media |
| Escribir disposición | Seleccionar en su desplegable de disposiciones | Media |

**El detector de inicio de llamada es el componente crítico.** Todo el producto
se dispara con él: sin saber que empezó una llamada, no hay sesión de voz, ni
transcripción, ni copilot. Merece tres implementaciones en cascada y un fallback
manual con un solo clic.

## 4. Lo que sí se puede construir ahora

Sin acceso a ReadyMode, lo genérico se construye igual, y es la mayor parte:

| Componente | Estado |
|---|---|
| Modelo canónico de CRM | ✅ Construido — `shared/crm/` |
| Contrato del adaptador + declaración de capacidades | ✅ Construido |
| Motor de mapeo de campos con transformaciones | ✅ Construido y probado |
| Cola de sincronización idempotente con reintentos y DLQ | ✅ Construida y probada |
| Adaptador de ReadyMode | Esqueleto con sus capacidades declaradas; los selectores y campos entran como configuración |
| Detector de llamada | Requiere el sistema en vivo |

El diseño de [doc 07](07-flujo-crm.md) ya lo previó: **los selectores del DOM
se sirven desde la API, no se compilan en la extensión.** Eso significa que
adaptar ReadyMode cuando tengamos acceso es escribir un JSON, no una release.

## 5. Lo que ReadyMode nos enseña sobre el producto entero

Tres consecuencias que van más allá de un conector:

**1. "Nos integramos con tu CRM" era la promesa equivocada.** La correcta es
*"nos integramos con tu operación"*, y en un call center la operación es el
dialer. Los dialers son menos numerosos que los CRMs y controlan lo que de
verdad necesitamos. El mapa de integraciones debe reordenarse por dialer, no
por CRM.

**2. La opción B es una estrategia de mercado, no un plan B.** Un producto que
se inserta entre cualquier softphone y cualquier diadema no necesita permiso de
nadie para funcionar. Es la vía de adopción más corta que existe, y hay que
evaluarla como línea de producto propia.

**3. El pre-vuelo se vuelve más importante, no menos.** Con la opción B
compartimos la máquina del agente con el softphone del dialer. El presupuesto
de CPU, los conflictos de dispositivo de audio y el eco pasan a ser nuestros
problemas. El pre-vuelo de [doc 05](05-flujo-de-llamada.md) tiene que cubrirlos.

## 6. Worklist de descubrimiento

Lo que hay que capturar de tu instancia. La mayoría toma minutos, y desbloquea
semanas de trabajo:

### Bloque 1 — Audio *(el que decide todo)*

1. ¿ReadyMode permite configurar troncal SIP o carrier propio? Buscar en
   ajustes: *Carrier*, *SIP Trunk*, *Outbound Routes*, *BYOC*.
2. ¿En qué plan está disponible?
3. ¿El softphone del agente es WebRTC en el navegador o una aplicación aparte?
4. ¿Se puede elegir el dispositivo de entrada y salida de audio?

> La respuesta a la 1 decide entre la opción A y la B, y con ella el tamaño de
> todo el proyecto. Es la primera pregunta a resolver.

### Bloque 2 — Interfaz del agente

5. URL de la pantalla del agente con una llamada activa (sin datos reales).
6. ¿La ficha del lead está en un iframe? (F12 → Elements → buscar `<iframe>`)
7. ¿Cómo se ve el cambio de estado al conectar una llamada? (F12 → grabar la
   pestaña Network y Elements durante una llamada de prueba)
8. Captura del DOM de: campo de notas, desplegable de disposición, campos del
   lead.

### Bloque 3 — Datos

9. ¿Hay exportación de leads? ¿Qué columnas trae?
10. Lista de disposiciones configuradas en tu cuenta.
11. ¿Existe documentación de API, webhooks o "integraciones" en el panel?
12. ¿Se pueden crear campos personalizados en el lead?

### Bloque 4 — Operación *(para dimensionar el piloto)*

13. Agentes concurrentes en hora pico.
14. Minutos de conversación por agente por día.
15. Sistema operativo de los puestos y quién administra esas máquinas.
16. ¿Hay un entorno de pruebas o todo es producción?

**Con el bloque 1 respondido puedo terminar el diseño de la ruta de audio. Con
el bloque 2, escribir el adaptador de ReadyMode. Los bloques 3 y 4 dimensionan
el piloto.**

## 7. Riesgos propios de esta integración

| Riesgo | Impacto | Mitigación |
|---|---|---|
| ReadyMode no permite carrier propio | **Alto** — obliga a la opción B | Construir B en paralelo, no después |
| ReadyMode cambia su DOM | Medio | Selectores servidos desde el servidor ([doc 07](07-flujo-crm.md)) |
| ReadyMode prohíbe extensiones en sus términos | **Alto** | **Leer los términos antes de escribir el adaptador** |
| ReadyMode lanza su propia IA de voz | Alto | Nuestro foso es el modelo de acento, no el CRM |
| Probar en producción rompe llamadas reales | Alto | Un solo agente voluntario, horario de bajo volumen, bypass listo |

El tercero merece atención antes que el código: si los términos de servicio de
ReadyMode prohíben herramientas de terceros sobre su interfaz, toda la ruta L1
muere y hay que ir por la A o la B con integración a nivel de audio solamente.
Es una lectura de veinte minutos que puede ahorrar un mes.
