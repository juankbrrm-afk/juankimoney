# 12 — Sistema de diseño e interfaz

Referencias declaradas: **Stripe, Linear, Vercel, Notion.** Vale la pena
entender *qué* se toma de cada una, porque copiar la estética sin el
principio produce una imitación sin alma.

| Referencia | Lo que tomamos |
|---|---|
| **Linear** | Velocidad percibida. Cero animaciones decorativas. Teclado primero |
| **Stripe** | Densidad de información sin agobio. Tipografía y jerarquía impecables |
| **Vercel** | Contención cromática. El color solo aparece cuando significa algo |
| **Notion** | Calma. El producto no compite por atención con su propio contenido |

## 1. El principio que gobierna toda la interfaz

> **El agente está hablando con un cliente. La interfaz no puede pedirle
> nada.**

Todo lo demás se deriva de aquí:

- **Sin modales durante una llamada.** Un modal exige una decisión; el agente
  ya está tomando una decisión más importante.
- **Sin animaciones de entrada** en elementos que aparecen durante la llamada.
  El movimiento captura la vista de forma involuntaria, y la vista del agente
  pertenece al cliente.
- **Máximo una sugerencia visible.** Tres opciones es investigación; el
  agente no tiene tiempo de investigar.
- **Nada parpadea salvo una violación crítica de compliance.** Si todo grita,
  nada se escucha.
- **Legible a 70 cm y de reojo.** El agente lee de reojo mientras habla,
  nunca fijamente.

Este principio se aplica a la consola. El dashboard del supervisor y el CRM
son pantallas de análisis, con reglas más relajadas.

## 2. Color

Tema oscuro por defecto — es la petición y también lo correcto: un agente
mira esta pantalla 8 horas seguidas. El tema claro existe para el CRM y los
reportes, que a menudo se imprimen o se proyectan.

```
Fondo
  base            #08090A     lienzo
  elevado         #0E1011     tarjetas
  elevado-2       #16181A     popovers, elementos activos
  borde           #1F2225     divisores
  borde-fuerte    #2C3033     bordes de entrada

Texto
  primario        #F2F4F5
  secundario      #9BA3AB
  terciario       #5F676E     metadatos, marcas de tiempo

Semántico  — el único color de la interfaz
  positivo        #3ECF8E     sentimiento al alza, éxito, conversión
  atención        #E8B339     advertencia de compliance, degradación
  crítico         #F05252     violación crítica, bypass, error
  info            #4C8DFF     acción primaria, enlaces
  ia              #A78BFA     todo lo generado por IA — sugerencias, resúmenes
```

### Dos reglas de color que importan más que la paleta

**1. Un color por significado, siempre el mismo.**
El violeta significa "esto lo generó una IA" en toda la aplicación, sin
excepción: una sugerencia, un resumen, una nota automática, una tarea
propuesta. El usuario aprende una sola vez qué mirar con criterio propio.

**2. El color se gana.** Una pantalla en reposo es monocromática. Cuando
aparece rojo, es porque algo está mal *de verdad*. Un dashboard donde todo
tiene color es un dashboard donde nada destaca.

### Contraste

Mínimo AA (4.5:1) en texto normal, AAA (7:1) en la consola del agente. No es
burocracia de accesibilidad: es un turno de ocho horas leyendo de reojo. El
contraste insuficiente se paga en fatiga y en errores.

## 3. Tipografía

```
Interfaz    Inter (o la pila del sistema)
Datos       tabular-nums SIEMPRE en métricas, duraciones y dinero
Mono        JetBrains Mono — marcas de tiempo, IDs, transcripción

Escala      12 · 13 · 14 · 16 · 20 · 24 · 32
Base        14 px en la aplicación, 13 px en tablas densas
Interlínea  1.5 en texto corrido, 1.35 en la transcripción
```

`tabular-nums` no es un detalle estético: sin él, un contador de duración
baila horizontalmente cada segundo, y el ojo lo persigue. En una pantalla que
se mira de reojo durante horas, eso es ruido constante.

## 4. Espaciado y densidad

Escala base de 4 px. **Tres densidades**, según qué hace el usuario:

| Contexto | Densidad | Por qué |
|---|---|---|
| Consola del agente | **Amplia** | Lectura de reojo. El espacio es lo que la hace posible |
| Tablas del CRM | **Compacta** | Escaneo de muchas filas |
| Dashboard | **Media** | Comparación entre bloques |

Un error frecuente es aplicar una sola densidad a todo el producto. La
consola y una tabla de 500 leads tienen tareas cognitivas opuestas.

## 5. Movimiento

```
Instantáneo   0 ms     todo lo que ocurre durante una llamada
Rápido        120 ms   hover, foco, cambios de estado
Normal        200 ms   paneles, popovers
Lento         320 ms   transiciones de página
Curva         cubic-bezier(0.16, 1, 0.3, 1)
```

**Regla dura: durante una llamada activa, la duración de toda animación es
0 ms.** Una sugerencia que aparece con un fundido de 200 ms es una sugerencia
que llega 200 ms tarde y que además roba la mirada del agente. Aparece, sin
más.

Fuera de la llamada, el movimiento sirve para explicar de dónde viene algo,
nunca para decorar.

## 6. Componentes clave

### Panel del copilot

El componente más importante del producto. Vive en `shared/ui` y es
literalmente el mismo en la aplicación web y en la extensión de Chrome.

```
┌────────────────────────────────────────┐
│ ⚡ OBJECIÓN · PRECIO         hace 2 s  │   ← etiqueta del disparador
│                                        │
│ "I hear you — and that's exactly why   │   ← 20 px, máximo 45 palabras
│  we split it over 24 months with no    │      streaming token a token
│  interest."                            │
│                                        │
│ 📄 Objection Handling v4 · pág. 7      │   ← la cita, SIEMPRE visible
│                                        │
│                          👍   👎        │   ← retroalimentación, un clic
└────────────────────────────────────────┘
```

Cuatro decisiones no negociables:

1. **La cita siempre visible.** Sin ella el agente no confía y no lo dice, y
   el módulo entero vale cero.
2. **Streaming token a token.** El agente empieza a leer a los ~300 ms aunque
   la generación termine a los 800 ms. Percepción sobre latencia real.
3. **Máximo 45 palabras.** Restricción de producto, no técnica.
4. **Sin sugerencia > sugerencia dudosa.** Si el anclaje es débil, el panel
   muestra un estado vacío tranquilo. Un panel vacío no distrae; una
   sugerencia mala sí, y además rompe la confianza para siempre.

### Indicador de salud de voz

Permanente en la barra superior. El agente debe saber que el sistema se está
degradando **antes de que el cliente lo note**:

```
🎙 Modo A · 287 ms  ✓        verde   — procesando bien
🎙 Modo A · 412 ms  ⚠        ámbar   — degradado, habla más despacio
🎙 Sin procesar     ✕        rojo    — bypass: tu voz real está saliendo
```

El estado rojo es el más importante de toda la interfaz. El agente **tiene
que saber** que el cliente está escuchando su voz sin procesar. Ocultarlo
para no alarmar sería traicionar al usuario.

### Alertas de compliance

| Severidad | Presentación |
|---|---|
| **Crítica** | Banda roja arriba, sonido breve, requiere reconocimiento |
| **Advertencia** | Texto ámbar en el panel, sin sonido, se desvanece a los 15 s |
| **Info** | No aparece en vivo. Solo en el reporte post-llamada |

Máximo **3 alertas en vivo por llamada**. El límite no es configurable hacia
arriba: un agente bombardeado de alertas aprende a ignorarlas, y entonces la
crítica también se ignora.

### Dashboard de piso

Ordena las llamadas activas **por riesgo, no por duración**: sentimiento en
caída, estrés alto, violación crítica, silencio prolongado. El supervisor ve
arriba las tres que necesitan su intervención ahora.

Es el cambio conceptual que hace útil el módulo: un dashboard que lista
llamadas es un monitor; uno que las prioriza es una herramienta.

## 7. Teclado

Un agente que usa el ratón durante una llamada es un agente distraído.

```
Ctrl + Space      Pedir sugerencia
Ctrl + 1..9       Insertar respuesta rápida
Ctrl + M          Cambiar modo de voz
Ctrl + Shift + B  Bypass manual
Ctrl + N          Nota rápida
Ctrl + D          Disposición
Esc               Descartar alerta
?                 Atajos
```

Todo lo que un agente necesita durante una llamada tiene atajo. Sin
excepciones.

## 8. Estados vacíos, de carga y de error

| Estado | Regla |
|---|---|
| **Vacío** | Explica qué va a aparecer ahí y cómo llegar. Nunca solo "Sin datos" |
| **Cargando** | Skeleton con la forma del contenido real, nunca un spinner centrado |
| **Cargando durante llamada** | Nada. Se muestra el estado anterior hasta que llega el nuevo. Un skeleton parpadeante durante una llamada es peor que información ligeramente vieja |
| **Error** | Qué pasó, qué se puede hacer, y un identificador de soporte copiable |
| **Degradado** | Se dice explícitamente qué no funciona. Nunca se finge normalidad |

Ese último punto es cultural más que visual: cuando el copilot está caído,
el panel lo dice. Un producto que oculta sus fallos entrena a los usuarios a
desconfiar de todo lo que muestra.

## 9. Rendimiento como decisión de diseño

En este producto la velocidad percibida **es** el diseño:

- Transiciones de página < 100 ms
- La transcripción aparece < 400 ms tras el habla
- Sin salto de layout al llegar eventos — el espacio se reserva
- Lista virtualizada en transcripción y en tablas de más de 100 filas
- 60 fps sostenidos con 100 llamadas activas en el dashboard
- **Presupuesto: < 16 ms por frame de render**, verificado con perfilado
  en CI

Una interfaz bonita que tarda 400 ms en responder se siente peor que una
sobria que responde en 40 ms. Linear entendió eso antes que nadie, y es lo
principal que hay que copiarles.
